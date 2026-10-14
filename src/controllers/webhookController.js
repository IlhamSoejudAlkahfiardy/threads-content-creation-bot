const telegramService = require("../services/telegramService");
const geminiService = require("../services/geminiService");
const draftService = require("../services/draftService");
const threadsService = require("../services/threadsService");
const { handleMediaGroup } = require("../utils/mediaGroupBuffer");
const { getTopicById } = require("../config/topics");
const { extractUrl, fetchArticleContent } = require("../utils/urlScraper");
const logger = require("../utils/logger");

/**
 * Resolve photo file_ids from Telegram CDN into public URLs
 * @param {string[]} photoFileIds
 * @returns {Promise<string[]>}
 */
async function resolveImageUrls(photoFileIds = []) {
  const imageUrls = [];
  for (let i = 0; i < photoFileIds.length; i++) {
    const fileId = photoFileIds[i];
    try {
      logger.info(
        "TelegramCDN",
        `Resolving file URL ${i + 1}/${photoFileIds.length} (fileId: ${fileId.slice(0, 15)}...)`
      );
      const publicUrl = await telegramService.getTelegramFileUrl(fileId);
      imageUrls.push(publicUrl);
    } catch (err) {
      logger.error("TelegramCDN", `Error getting file URL for ${fileId}:`, err.message);
    }
  }
  return imageUrls;
}

/**
 * Core Orchestration: Generate tech thread with Gemini, save draft, and send preview
 * @param {number|string} chatId
 * @param {string} rawText
 * @param {string} mode - 'hottake' | 'deepdive' | 'tips' | 'joke'
 * @param {string[]} [imageUrls=[]]
 * @param {number|null} [statusMessageId=null] - Telegram messageId to edit with preview
 */
async function generateAndPreviewTechThread(
  chatId,
  rawText,
  mode = "deepdive",
  imageUrls = [],
  statusMessageId = null
) {
  const modeLabel = telegramService.getModeLabel(mode);
  logger.info(
    "TechEngine",
    `Starting generation for chatId: ${chatId} [Mode: ${mode}] (text chars: ${rawText.length}, photos: ${imageUrls.length})`
  );

  let progressMsgId = statusMessageId;
  if (!progressMsgId) {
    const sent = await telegramService.sendMessage(
      chatId,
      `⏳ Meracik utas tech mode *${modeLabel}* dengan Gemini AI...`,
      { parse_mode: "Markdown" }
    );
    progressMsgId = sent.data?.result?.message_id;
  }

  try {
    // 1. Check if user provided an article URL
    const detectedUrl = extractUrl(rawText);
    let articleContent = null;
    let effectiveTopicText = rawText;

    if (detectedUrl) {
      logger.info("TechEngine", `Detected URL: ${detectedUrl}. Attempting to fetch article...`);
      const scraped = await fetchArticleContent(detectedUrl);
      if (scraped && scraped.content) {
        articleContent = scraped.content;
        effectiveTopicText = `${scraped.title} - ${rawText.replace(detectedUrl, "").trim()}`;
        logger.info("TechEngine", `Article fetched successfully: "${scraped.title}"`);
      }
    }

    // 2. Generate structured tech threads via Gemini
    logger.info("Gemini", `Generating tech threads for mode "${mode}"...`);
    const { topicTitle, mode: resolvedMode, threads } = await geminiService.generateTechThreads({
      topicText: effectiveTopicText || "Teknologi Terkini",
      mode,
      articleContent,
      hasImage: imageUrls.length > 0,
    });

    // 3. Save draft to Firestore
    logger.info("Firestore", "Saving tech draft to Firestore...");
    const draftId = await draftService.createDraft({
      topicTitle,
      mode: resolvedMode,
      sourceUrl: detectedUrl || null,
      imageUrls,
      threads,
    });

    // 4. Send interactive preview to Telegram
    logger.info("Telegram", `Sending tech draft preview for draft: ${draftId}`);
    const previewText = telegramService.buildPreviewText(
      topicTitle,
      resolvedMode,
      threads,
      imageUrls
    );
    const mainMarkup = telegramService.buildMainKeyboard(draftId, null);

    if (progressMsgId) {
      await telegramService.editMessageText(chatId, progressMsgId, previewText, mainMarkup);
    } else {
      await telegramService.sendTechDraftPreview(
        chatId,
        draftId,
        topicTitle,
        resolvedMode,
        threads,
        imageUrls
      );
    }

    logger.info("TechEngine", `Successfully created draft: ${draftId} ("${topicTitle}")`);
  } catch (err) {
    logger.error("TechEngine", "Error generating tech thread:", err);
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const errorNotice = `❌ Gagal meracik thread: ${errMsg}`;

    if (progressMsgId) {
      await telegramService.editMessageText(chatId, progressMsgId, errorNotice);
    } else {
      await telegramService.sendMessage(chatId, errorNotice);
    }
  }
}

/**
 * Handle user clicking the "Approve & Upload to Threads" callback button
 * @param {object} callbackQuery
 */
async function handleApproval(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;

  await telegramService.answerCallbackQuery(callbackQuery.id);
  if (!callbackData.startsWith("approve_")) return;

  const draftId = callbackData.replace("approve_", "");
  logger.info("Approval", `User approved draft ${draftId}. Initiating publishing sequence...`);

  try {
    const draft = await draftService.getDraft(draftId);

    if (draft.status === "published") {
      logger.warn("Approval", `Draft ${draftId} was already published previously`);
      await telegramService.sendMessage(
        chatId,
        `⚠️ Utas ini sudah pernah di-publish sebelumnya! Root Post ID: \`${draft.rootPostId}\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (draft.status === "publishing") {
      logger.warn("Approval", `Draft ${draftId} is currently being published`);
      await telegramService.sendMessage(
        chatId,
        `⏳ Utas sedang dalam proses posting ke Meta Threads, mohon tunggu...`
      );
      return;
    }

    await draftService.markPublishing(draftId);

    const topicNotice = draft.topicLabel ? ` ke komunitas *${draft.topicLabel}*` : "";
    const totalParts = draft.threads?.length || 0;
    const imageNotice =
      draft.imageUrls && draft.imageUrls.length > 0 ? " (dengan Lampiran Gambar)" : "";

    await telegramService.sendMessage(
      chatId,
      `🚀 Memulai upload ${totalParts} part utas ke Meta Threads${topicNotice}${imageNotice}...`,
      { parse_mode: "Markdown" }
    );

    // Execute Threads upload chain
    const { rootPostId, updatedThreads } = await threadsService.publishTechThread(draft);

    // Update Firestore to published
    await draftService.markPublished(draftId, rootPostId, updatedThreads);

    const topicSummary = draft.topicLabel
      ? `\n🌐 *Community:* ${draft.topicLabel} (\`#${draft.topicTag}\`)`
      : "";

    logger.info("Approval", `Draft ${draftId} successfully uploaded! Root Post ID: ${rootPostId}`);

    await telegramService.sendMessage(
      chatId,
      `🎉 *Utas Tech Berhasil Dipublikasikan ke Threads!*\n\n💡 *Topik:* ${draft.topicTitle}\n🎭 *Mode:* ${telegramService.getModeLabel(
        draft.mode
      )}${topicSummary}\n🔗 *Root Post ID:* \`${rootPostId}\`\n📊 *Total Part:* ${totalParts}\n\nSemua part berhasil di-chain secara berantai! 🚀`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
    logger.error("Approval", `Threads upload failed for draft ${draftId}:`, errorDetails);
    await draftService.markFailed(draftId, errorDetails);
    await telegramService.sendMessage(chatId, `❌ Upload Failed: ${errorDetails}`);
  }
}

/**
 * Handle user rejecting a draft
 * @param {object} callbackQuery
 */
async function handleRejection(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("reject_", "");

  logger.info("Approval", `User rejected draft ${draftId}`);
  await telegramService.answerCallbackQuery(callbackQuery.id, "🗑️ Draft dibatalkan");
  await draftService.markRejected(draftId);
  await telegramService.editMessageText(
    chatId,
    messageId,
    "🗑️ *Draft ini telah dibatalkan dan dihapus.* Kirim ide baru kapan saja untuk mulai meracik utas lagi!",
    null
  );
}

/**
 * Handle user selecting a mode button for a pending session
 * @param {object} callbackQuery
 */
async function handleModeSelection(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  // Format: mode_{mode}_{sessionId}
  const parts = callbackQuery.data.split("_");
  const selectedMode = parts[1];
  const sessionId = parts.slice(2).join("_");

  await telegramService.answerCallbackQuery(
    callbackQuery.id,
    `Mode dipilih: ${telegramService.getModeLabel(selectedMode)}`
  );

  const session = await draftService.consumePendingSession(sessionId);
  if (!session) {
    await telegramService.editMessageText(
      chatId,
      messageId,
      "⚠️ Sesi input ini sudah kadaluarsa atau sudah diproses. Silakan kirimkan ide baru!"
    );
    return;
  }

  await telegramService.editMessageText(
    chatId,
    messageId,
    `⏳ Meracik utas tech mode *${telegramService.getModeLabel(
      selectedMode
    )}* dengan Gemini AI...`,
    null
  );

  await generateAndPreviewTechThread(
    chatId,
    session.text,
    selectedMode,
    session.imageUrls || [],
    messageId
  );
}

/**
 * Handle user cancelling a pending mode selection
 * @param {object} callbackQuery
 */
async function handleCancelSession(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const sessionId = callbackQuery.data.replace("cancel_", "");

  await telegramService.answerCallbackQuery(callbackQuery.id, "❌ Dibatalkan");
  await draftService.consumePendingSession(sessionId);
  await telegramService.editMessageText(
    chatId,
    messageId,
    "❌ *Pembuatan utas dibatalkan.* Silakan kirimkan ide topik atau link berita lain kapan saja!",
    null
  );
}

/**
 * Handle topic menu opening
 * @param {object} callbackQuery
 */
async function handleTopicMenu(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("topmenu_", "");

  await telegramService.answerCallbackQuery(callbackQuery.id);
  const topicsMarkup = telegramService.buildTopicsKeyboard(draftId);
  await telegramService.editMessageReplyMarkup(chatId, messageId, topicsMarkup);
}

/**
 * Handle user selecting a topic from the sub-menu
 * @param {object} callbackQuery
 */
async function handleSetTopic(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const withoutPrefix = callbackQuery.data.replace("settop_", "");
  const lastUnderscore = withoutPrefix.lastIndexOf("_");
  const draftId = withoutPrefix.substring(0, lastUnderscore);
  const topicId = withoutPrefix.substring(lastUnderscore + 1);

  const topic = getTopicById(topicId);
  if (!topic) {
    await telegramService.answerCallbackQuery(callbackQuery.id, "Topik tidak ditemukan");
    return;
  }

  await telegramService.answerCallbackQuery(callbackQuery.id, `✅ Topik: ${topic.label}`);
  await draftService.updateDraftTopic(draftId, topic.tag, topic.label);
  const draft = await draftService.getDraft(draftId);

  const updatedText = telegramService.buildPreviewText(
    draft.topicTitle,
    draft.mode,
    draft.threads,
    draft.imageUrls,
    draft.topicLabel,
    draft.topicTag
  );
  const mainMarkup = telegramService.buildMainKeyboard(draftId, draft.topicLabel);

  await telegramService.editMessageText(chatId, messageId, updatedText, mainMarkup);
}

/**
 * Handle user clearing topic (choosing "Tanpa Topic")
 * @param {object} callbackQuery
 */
async function handleClearTopic(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("clrtop_", "");

  await telegramService.answerCallbackQuery(callbackQuery.id, "🌐 Tanpa Topic (Default)");
  await draftService.updateDraftTopic(draftId, null, null);
  const draft = await draftService.getDraft(draftId);

  const updatedText = telegramService.buildPreviewText(
    draft.topicTitle,
    draft.mode,
    draft.threads,
    draft.imageUrls,
    null,
    null
  );
  const mainMarkup = telegramService.buildMainKeyboard(draftId, null);

  await telegramService.editMessageText(chatId, messageId, updatedText, mainMarkup);
}

/**
 * Handle user cancelling topic selection and going back to preview
 * @param {object} callbackQuery
 */
async function handleBackToPreview(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("backprev_", "");

  await telegramService.answerCallbackQuery(callbackQuery.id);
  const draft = await draftService.getDraft(draftId);
  const mainMarkup = telegramService.buildMainKeyboard(draftId, draft.topicLabel);

  await telegramService.editMessageReplyMarkup(chatId, messageId, mainMarkup);
}

/**
 * Route incoming Telegram callback queries
 * @param {object} callbackQuery
 */
async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data || "";
  const fromUser = callbackQuery.from?.username || callbackQuery.from?.first_name || "Unknown";
  logger.info("TelegramCallback", `Routing callback query "${data}" from user: ${fromUser}`);

  if (data.startsWith("mode_")) {
    await handleModeSelection(callbackQuery);
  } else if (data.startsWith("cancel_")) {
    await handleCancelSession(callbackQuery);
  } else if (data.startsWith("approve_")) {
    await handleApproval(callbackQuery);
  } else if (data.startsWith("reject_")) {
    await handleRejection(callbackQuery);
  } else if (data.startsWith("topmenu_")) {
    await handleTopicMenu(callbackQuery);
  } else if (data.startsWith("settop_")) {
    await handleSetTopic(callbackQuery);
  } else if (data.startsWith("clrtop_")) {
    await handleClearTopic(callbackQuery);
  } else if (data.startsWith("backprev_")) {
    await handleBackToPreview(callbackQuery);
  } else {
    logger.warn("TelegramCallback", `Unhandled callback query data: "${data}"`);
  }
}

/**
 * Send help/welcome message
 * @param {number|string} chatId
 */
async function sendHelpMessage(chatId) {
  const text =
    `👋 *Halo! Selamat datang di Threads Tech Content Bot.*\n\n` +
    `Bot ini membantumu meracik utas (threads) edukatif dan engaging seputar dunia IT & Programming untuk Personal Branding di Meta Threads.\n\n` +
    `🚀 *Cara Pakai:*\n` +
    `1. *Jalur Santai:* Kirim ide topik apa saja, atau kirim link berita IT ➔ Pilih gaya konten lewat tombol.\n` +
    `2. *Jalur Cepat (Shortcut):*\n` +
    `   • \`/hottake [topik / link]\` — Opini tajam & memicu debat\n` +
    `   • \`/deepdive [topik / link]\` — Bedah teknis / Pro vs Cons\n` +
    `   • \`/tips [topik / link]\` — Tips & Best practice koding\n` +
    `   • \`/joke [topik / link]\` — Humor & keresahan developer\n` +
    `3. *Gambar:* Kamu juga bisa melampirkan gambar (screenshot kode, diagram, atau meme) yang otomatis dipasang pada Part 1!`;

  await telegramService.sendMessage(chatId, text, { parse_mode: "Markdown" });
}

/**
 * Main Webhook Handler endpoint
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function handleWebhook(req, res) {
  // Always return HTTP 200 immediately to Telegram
  res.sendStatus(200);

  const updateId = req.body?.update_id;
  const message = req.body?.message;
  const callbackQuery = req.body?.callback_query;

  // ==========================================
  // --- A. HANDLE INCOMING TELEGRAM MESSAGE ---
  // ==========================================
  if (message) {
    const chatId = message.chat.id;
    const fromUser = message.from?.username
      ? `@${message.from.username}`
      : message.from?.first_name || "Unknown";

    logger.info(
      "TelegramMessage",
      `[Update #${updateId}] Incoming message from ${fromUser} (chatId: ${chatId})`
    );

    let textContent = (message.text || message.caption || "").trim();

    // Check for start / help command
    if (textContent === "/start" || textContent === "/help") {
      await sendHelpMessage(chatId);
      return;
    }

    // Check for shortcut commands: /hottake, /deepdive, /tips, /joke
    let shortcutMode = null;
    let cleanPrompt = textContent;

    if (textContent.startsWith("/hottake")) {
      shortcutMode = "hottake";
      cleanPrompt = textContent.replace(/^\/hottake\s*/i, "").trim();
    } else if (textContent.startsWith("/deepdive")) {
      shortcutMode = "deepdive";
      cleanPrompt = textContent.replace(/^\/deepdive\s*/i, "").trim();
    } else if (textContent.startsWith("/tips")) {
      shortcutMode = "tips";
      cleanPrompt = textContent.replace(/^\/tips\s*/i, "").trim();
    } else if (textContent.startsWith("/joke")) {
      shortcutMode = "joke";
      cleanPrompt = textContent.replace(/^\/joke\s*/i, "").trim();
    }

    // Resolve photos if present
    let photoFileIds = [];
    if (message.photo && Array.isArray(message.photo)) {
      const highestPhoto = message.photo[message.photo.length - 1];
      photoFileIds = [highestPhoto.file_id];
    }

    // Check if album (media group)
    if (message.media_group_id && photoFileIds.length > 0) {
      handleMediaGroup(
        message.media_group_id,
        chatId,
        photoFileIds[0],
        cleanPrompt,
        async (targetChatId, targetCaption, photoList) => {
          const imageUrls = await resolveImageUrls(photoList);
          await processUserContentInput(targetChatId, targetCaption, imageUrls, shortcutMode);
        }
      );
      return;
    }

    if (textContent || photoFileIds.length > 0) {
      const imageUrls = await resolveImageUrls(photoFileIds);
      await processUserContentInput(
        chatId,
        cleanPrompt || "Teknologi & Programming",
        imageUrls,
        shortcutMode
      );
      return;
    }

    logger.info(
      "TelegramMessage",
      `Received non-text, non-photo message type: ${Object.keys(message).join(", ")}`
    );
    return;
  }

  // ==========================================
  // --- B. HANDLE CALLBACK QUERY BUTTONS ---
  // ==========================================
  if (callbackQuery) {
    await handleCallbackQuery(callbackQuery);
    return;
  }
}

/**
 * Process user content input:
 * - If shortcutMode provided -> Generate directly
 * - If no shortcut -> Save pending session and present Mode Selection keyboard
 * @param {number|string} chatId
 * @param {string} text
 * @param {string[]} imageUrls
 * @param {string|null} shortcutMode
 */
async function processUserContentInput(chatId, text, imageUrls = [], shortcutMode = null) {
  if (shortcutMode) {
    logger.info(
      "TechEngine",
      `Executing direct shortcut mode "${shortcutMode}" for prompt: "${text.slice(0, 50)}..."`
    );
    await generateAndPreviewTechThread(chatId, text, shortcutMode, imageUrls);
    return;
  }

  // Interactive flow: Save pending session and send mode selection keyboard
  const detectedUrl = extractUrl(text);
  const sessionId = await draftService.savePendingSession({
    chatId,
    text,
    imageUrls,
    sourceUrl: detectedUrl || null,
  });

  await telegramService.sendModeSelection(chatId, sessionId, text);
}

module.exports = {
  handleWebhook,
  generateAndPreviewTechThread,
  handleApproval,
  handleCallbackQuery,
};
