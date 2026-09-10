const telegramService = require("../services/telegramService");
const geminiService = require("../services/geminiService");
const draftService = require("../services/draftService");
const threadsService = require("../services/threadsService");
const { handleMediaGroup } = require("../utils/mediaGroupBuffer");
const { getTopicById } = require("../config/topics");
const logger = require("../utils/logger");

/**
 * High-level orchestration: process product brief and generate affiliate threads
 * @param {number|string} chatId
 * @param {string} briefText
 * @param {string[]} [photoFileIds=[]]
 */
async function processAffiliateBrief(chatId, briefText, photoFileIds = []) {
  logger.info(
    "AffiliateEngine",
    `Starting brief processing for chatId: ${chatId} (text chars: ${briefText.length}, photos: ${photoFileIds.length})`
  );

  // 1. Notify user that AI is processing
  await telegramService.sendMessage(
    chatId,
    `⏳ Meracik 3-part thread affiliate dengan Gemini AI... (${photoFileIds.length} foto terdeteksi)`
  );

  try {
    // 2. Resolve photo URLs from Telegram CDN
    const imageUrls = [];
    for (let i = 0; i < photoFileIds.length; i++) {
      const fileId = photoFileIds[i];
      try {
        logger.info("TelegramCDN", `Resolving file URL ${i + 1}/${photoFileIds.length} (fileId: ${fileId.slice(0, 15)}...)`);
        const publicUrl = await telegramService.getTelegramFileUrl(fileId);
        imageUrls.push(publicUrl);
      } catch (err) {
        logger.error("TelegramCDN", `Error getting file URL for ${fileId}:`, err.message);
      }
    }

    // Extract any additional image URLs found inside the text
    const urlRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp))/gi;
    const matchedUrls = briefText.match(urlRegex) || [];
    matchedUrls.forEach((url) => {
      if (!imageUrls.includes(url)) imageUrls.push(url);
    });

    logger.info("AffiliateEngine", `Total resolved media URLs: ${imageUrls.length}`);

    // 3. Generate structured 3-part thread using Gemini AI
    logger.info("Gemini", "Calling Gemini 2.5 Flash to generate 3-part thread content...");
    const { productName, category, threads } =
      await geminiService.generateAffiliateThreads(briefText, imageUrls);

    logger.info(
      "Gemini",
      `Success! Generated 3-part affiliate threads for: "${productName}" [${category}]`
    );

    // 4. Save to Firestore
    logger.info("Firestore", "Saving initial draft to Firestore...");
    const draftId = await draftService.createDraft({
      productName,
      category,
      imageUrls,
      threads,
    });

    // 5. Send Preview to Telegram with Topic Selector & Approve button
    logger.info("Telegram", `Sending preview message with interactive topic buttons for draft: ${draftId}`);
    await telegramService.sendAffiliatePreview(
      chatId,
      draftId,
      productName,
      category,
      threads,
      imageUrls
    );
    logger.info("AffiliateEngine", `Completed brief processing for draft: ${draftId}`);
  } catch (err) {
    logger.error("AffiliateEngine", "Error generating affiliate thread:", err);
    const errMsg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    await telegramService.sendMessage(
      chatId,
      `❌ Error generating affiliate thread: ${errMsg}`
    );
  }
}

/**
 * Handle user clicking the "Approve & Upload to Threads" callback button
 * @param {object} callbackQuery - Telegram callback query payload
 */
async function handleApproval(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;

  // Acknowledge the callback immediately
  await telegramService.answerCallbackQuery(callbackQuery.id);

  if (!callbackData.startsWith("approve_")) return;

  const draftId = callbackData.split("_")[1];
  logger.info("Approval", `User approved draft ${draftId}. Initiating publishing sequence...`);

  try {
    const draft = await draftService.getDraft(draftId);

    if (draft.status === "published") {
      logger.warn("Approval", `Draft ${draftId} was already published previously (rootPostId: ${draft.rootPostId})`);
      await telegramService.sendMessage(
        chatId,
        `⚠️ Thread affiliate ini sudah pernah di-publish sebelumnya! Root Post ID: ${draft.rootPostId}`
      );
      return;
    }

    if (draft.status === "publishing") {
      logger.warn("Approval", `Draft ${draftId} is currently being published`);
      await telegramService.sendMessage(
        chatId,
        `⏳ Thread sedang dalam proses upload ke Threads, mohon tunggu...`
      );
      return;
    }

    // Mark as publishing in Firestore
    await draftService.markPublishing(draftId);

    const imageInfo =
      draft.imageUrls && draft.imageUrls.length > 1
        ? `dengan Carousel ${draft.imageUrls.length} Foto`
        : draft.imageUrls && draft.imageUrls.length === 1
        ? "dengan 1 Foto"
        : "Text Only";

    const topicNotice = draft.topicLabel
      ? ` ke *${draft.topicLabel}*`
      : "";

    logger.info(
      "Approval",
      `Publishing draft ${draftId} to Meta Threads (${imageInfo}, Topic: ${draft.topicLabel || "None"})...`
    );

    await telegramService.sendMessage(
      chatId,
      `🚀 Memulai upload 3-part affiliate thread ke Meta Threads${topicNotice} (${imageInfo})...`,
      { parse_mode: "Markdown" }
    );

    // Execute Threads 3-part upload chain
    const { rootPostId, updatedThreads } =
      await threadsService.publishAffiliateThread(draft);

    // Update Firestore to published
    await draftService.markPublished(draftId, rootPostId, updatedThreads);

    const topicSummary = draft.topicLabel
      ? `\n🌐 *Community:* ${draft.topicLabel} (\`#${draft.topicTag}\`)`
      : "";

    logger.info("Approval", `Draft ${draftId} successfully uploaded! Root Post ID: ${rootPostId}`);

    // Notify Telegram with success summary
    await telegramService.sendMessage(
      chatId,
      `🎉 *Thread Affiliate Berhasil Di-Upload ke Threads!*\n\n🛍️ *Produk:* ${draft.productName}\n🏷️ *Kategori:* ${draft.category}${topicSummary}\n🔗 *Root Post ID:* \`${rootPostId}\`\n🖼️ *Media:* ${imageInfo}\n\nSemua 3 part berhasil di-chain berurutan! 🚀`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    const errorDetails = error.response
      ? JSON.stringify(error.response.data)
      : error.message;
    logger.error("Approval", `Threads upload failed for draft ${draftId}:`, errorDetails);

    await draftService.markFailed(draftId, errorDetails);

    await telegramService.sendMessage(chatId, `❌ Upload Failed: ${errorDetails}`);
  }
}

/**
 * Handle topic menu opening: display list of predefined topics (Model B)
 * @param {object} callbackQuery
 */
async function handleTopicMenu(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("topmenu_", "");

  logger.info("TopicMenu", `Opening topic selection sub-menu for draft ${draftId} (messageId: ${messageId})`);
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
  const messageId = callbackQuery.message.message_id;
  // Format: settop_{draftId}_{topicId}
  const parts = callbackQuery.data.split("_");
  const draftId = parts[1];
  const topicId = parts[2];

  const topic = getTopicById(topicId);
  if (!topic) {
    logger.warn("TopicMenu", `Topic ID "${topicId}" not found in predefined topics`);
    await telegramService.answerCallbackQuery(callbackQuery.id, "Topik tidak ditemukan");
    return;
  }

  logger.info(
    "TopicMenu",
    `User selected topic "${topic.label}" (slug: ${topic.tag}) for draft ${draftId}`
  );

  await telegramService.answerCallbackQuery(
    callbackQuery.id,
    `✅ Topik dipilih: ${topic.label}`
  );

  // Update Firestore draft
  await draftService.updateDraftTopic(draftId, topic.tag, topic.label);
  const draft = await draftService.getDraft(draftId);

  // Rebuild preview text & main keyboard
  const updatedText = telegramService.buildPreviewText(
    draft.productName,
    draft.category,
    draft.threads,
    draft.imageUrls,
    draft.topicLabel,
    draft.topicTag
  );
  const mainMarkup = telegramService.buildMainKeyboard(draftId, draft.topicLabel);

  await telegramService.editMessageText(chatId, messageId, updatedText, mainMarkup);
  logger.info("TopicMenu", `Draft ${draftId} preview updated with topic "${topic.label}"`);
}

/**
 * Handle user clearing topic (choosing "Tanpa Topic")
 * @param {object} callbackQuery
 */
async function handleClearTopic(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("clrtop_", "");

  logger.info("TopicMenu", `User selected "Tanpa Topic" for draft ${draftId}`);
  await telegramService.answerCallbackQuery(callbackQuery.id, "🌐 Tanpa Topic (Default)");

  // Clear in Firestore
  await draftService.updateDraftTopic(draftId, null, null);
  const draft = await draftService.getDraft(draftId);

  // Rebuild preview text & main keyboard
  const updatedText = telegramService.buildPreviewText(
    draft.productName,
    draft.category,
    draft.threads,
    draft.imageUrls,
    null,
    null
  );
  const mainMarkup = telegramService.buildMainKeyboard(draftId, null);

  await telegramService.editMessageText(chatId, messageId, updatedText, mainMarkup);
  logger.info("TopicMenu", `Draft ${draftId} preview updated to "Tanpa Topic"`);
}

/**
 * Handle user cancelling topic selection and going back to preview
 * @param {object} callbackQuery
 */
async function handleBackToPreview(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const draftId = callbackQuery.data.replace("backprev_", "");

  logger.info("TopicMenu", `User clicked Back to Preview for draft ${draftId}`);
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

  if (data.startsWith("approve_")) {
    await handleApproval(callbackQuery);
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

    // Case 1: Message contains photo(s)
    if (message.photo && Array.isArray(message.photo)) {
      const highestPhoto = message.photo[message.photo.length - 1];
      const fileId = highestPhoto.file_id;
      const caption = message.caption || "";

      logger.info(
        "TelegramMessage",
        `Message contains photo (media_group_id: ${message.media_group_id || "none"}, caption: "${caption}")`
      );

      // Check if message is part of an album (media_group_id)
      if (message.media_group_id) {
        handleMediaGroup(
          message.media_group_id,
          chatId,
          fileId,
          caption,
          async (targetChatId, targetCaption, photoList) => {
            logger.info(
              "MediaGroupBuffer",
              `Media group ${message.media_group_id} buffer ready with ${photoList.length} photos`
            );
            await processAffiliateBrief(targetChatId, targetCaption, photoList);
          }
        );
        return;
      } else {
        // Single photo message
        await processAffiliateBrief(
          chatId,
          caption || "Rekomendasi produk pilihan terbaik",
          [fileId]
        );
        return;
      }
    }

    // Case 2: Text-only message
    if (message.text) {
      logger.info("TelegramMessage", `Received text brief: "${message.text}"`);
      await processAffiliateBrief(chatId, message.text, []);
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

  // Case 3: Other Telegram update types (edited_message, my_chat_member, etc.)
  const otherKeys = Object.keys(req.body || {}).filter((k) => k !== "update_id");
  logger.info("TelegramWebhook", `[Update #${updateId}] Received unhandled update type: ${otherKeys.join(", ")}`);
}

module.exports = {
  handleWebhook,
  processAffiliateBrief,
  handleApproval,
  handleCallbackQuery,
};
