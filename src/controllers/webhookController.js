const telegramService = require("../services/telegramService");
const geminiService = require("../services/geminiService");
const draftService = require("../services/draftService");
const threadsService = require("../services/threadsService");
const { handleMediaGroup } = require("../utils/mediaGroupBuffer");

/**
 * High-level orchestration: process product brief and generate affiliate threads
 * @param {number|string} chatId
 * @param {string} briefText
 * @param {string[]} [photoFileIds=[]]
 */
async function processAffiliateBrief(chatId, briefText, photoFileIds = []) {
  // 1. Notify user that AI is processing
  await telegramService.sendMessage(
    chatId,
    `⏳ Meracik 3-part thread affiliate dengan Gemini AI... (${photoFileIds.length} foto terdeteksi)`
  );

  try {
    // 2. Resolve photo URLs from Telegram CDN
    const imageUrls = [];
    for (const fileId of photoFileIds) {
      try {
        const publicUrl = await telegramService.getTelegramFileUrl(fileId);
        imageUrls.push(publicUrl);
      } catch (err) {
        console.error("[Telegram CDN] Error getting file URL:", err.message);
      }
    }

    // Extract any additional image URLs found inside the text
    const urlRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp))/gi;
    const matchedUrls = briefText.match(urlRegex) || [];
    matchedUrls.forEach((url) => {
      if (!imageUrls.includes(url)) imageUrls.push(url);
    });

    // 3. Generate structured 3-part thread using Gemini AI
    const { productName, category, threads } =
      await geminiService.generateAffiliateThreads(briefText, imageUrls);

    console.log(
      `[Gemini] Generated 3-part affiliate threads for: "${productName}" (${category})`
    );

    // 4. Save to Firestore
    const draftId = await draftService.createDraft({
      productName,
      category,
      imageUrls,
      threads,
    });

    // 5. Send Preview to Telegram with Approve button
    await telegramService.sendAffiliatePreview(
      chatId,
      draftId,
      productName,
      category,
      threads,
      imageUrls
    );
  } catch (err) {
    console.error("[Affiliate Engine Error]:", err);
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

  try {
    const draft = await draftService.getDraft(draftId);

    if (draft.status === "published") {
      await telegramService.sendMessage(
        chatId,
        `⚠️ Thread affiliate ini sudah pernah di-publish sebelumnya! Root Post ID: ${draft.rootPostId}`
      );
      return;
    }

    if (draft.status === "publishing") {
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

    await telegramService.sendMessage(
      chatId,
      `🚀 Memulai upload 3-part affiliate thread ke Meta Threads (${imageInfo})...`
    );

    // Execute Threads 3-part upload chain
    const { rootPostId, updatedThreads } =
      await threadsService.publishAffiliateThread(draft);

    // Update Firestore to published
    await draftService.markPublished(draftId, rootPostId, updatedThreads);

    // Notify Telegram with success summary
    await telegramService.sendMessage(
      chatId,
      `🎉 *Thread Affiliate Berhasil Di-Upload ke Threads!*\n\n🛍️ *Produk:* ${draft.productName}\n🏷️ *Kategori:* ${draft.category}\n🔗 *Root Post ID:* \`${rootPostId}\`\n🖼️ *Media:* ${imageInfo}\n\nSemua 3 part berhasil di-chain berurutan! 🚀`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    const errorDetails = error.response
      ? JSON.stringify(error.response.data)
      : error.message;
    console.error("[Threads Affiliate Upload Error]:", errorDetails);

    await draftService.markFailed(draftId, errorDetails);

    await telegramService.sendMessage(chatId, `❌ Upload Failed: ${errorDetails}`);
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

  const message = req.body?.message;
  const callbackQuery = req.body?.callback_query;

  // ==========================================
  // --- A. HANDLE INCOMING TELEGRAM MESSAGE ---
  // ==========================================
  if (message) {
    const chatId = message.chat.id;

    // Case 1: Message contains photo(s)
    if (message.photo && Array.isArray(message.photo)) {
      const highestPhoto = message.photo[message.photo.length - 1];
      const fileId = highestPhoto.file_id;
      const caption = message.caption || "";

      // Check if message is part of an album (media_group_id)
      if (message.media_group_id) {
        handleMediaGroup(
          message.media_group_id,
          chatId,
          fileId,
          caption,
          async (targetChatId, targetCaption, photoList) => {
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
      console.log(`[Telegram] Received text brief: "${message.text}"`);
      await processAffiliateBrief(chatId, message.text, []);
      return;
    }
  }

  // ==========================================
  // --- B. HANDLE APPROVAL BUTTON CLICK ---
  // ==========================================
  if (callbackQuery) {
    await handleApproval(callbackQuery);
  }
}

module.exports = {
  handleWebhook,
  processAffiliateBrief,
  handleApproval,
};
