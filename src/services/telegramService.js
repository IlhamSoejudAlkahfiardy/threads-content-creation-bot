const axios = require("axios");
const env = require("../config/env");

/**
 * Send a basic message to Telegram chat
 * @param {number|string} chatId
 * @param {string} text
 * @param {object} [extra]
 */
async function sendMessage(chatId, text, extra = {}) {
  return axios.post(`${env.TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    ...extra,
  });
}

/**
 * Acknowledge Telegram callback query
 * @param {string} callbackQueryId
 */
async function answerCallbackQuery(callbackQueryId) {
  try {
    await axios.post(`${env.TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
    });
  } catch (e) {
    // Ignore callback query errors (e.g., query expired)
  }
}

/**
 * Get direct public CDN download URL from Telegram for a file_id
 * @param {string} fileId
 * @returns {Promise<string>}
 */
async function getTelegramFileUrl(fileId) {
  const res = await axios.get(`${env.TELEGRAM_API}/getFile`, {
    params: { file_id: fileId },
  });
  const filePath = res.data?.result?.file_path;
  if (!filePath) throw new Error("Could not retrieve file path from Telegram");
  return `https://api.telegram.org/file/bot${env.TELEGRAM_TOKEN}/${filePath}`;
}

/**
 * Send preview of the 3-part affiliate thread to Telegram with Approve button
 * @param {number|string} chatId
 * @param {string} draftId
 * @param {string} productName
 * @param {string} category
 * @param {Array} threads
 * @param {string[]} imageUrls
 */
async function sendAffiliatePreview(chatId, draftId, productName, category, threads, imageUrls) {
  const imageLabel =
    imageUrls.length > 1
      ? `🖼️ *Lampiran:* ${imageUrls.length} Gambar (Carousel Slider di Part 3)`
      : imageUrls.length === 1
      ? `🖼️ *Lampiran:* 1 Gambar di Part 3`
      : `🖼️ *Lampiran:* Tanpa Gambar (Text Only)`;

  let messageText = `🛍️ *DRAFT AFFILIATE THREADS: ${productName}*\n🏷️ *Kategori:* ${category}\n${imageLabel}\n\n`;

  threads.forEach((t) => {
    const typeLabel =
      t.type === "HOOK"
        ? "HOOK (Pancingan)"
        : t.type === "MAIN_CONTENT"
        ? "MAIN CONTENT (Review & Solusi)"
        : "CTA & AFFILIATE LINKS";

    messageText += `━━━━━━━━━━━━━━━━━━━\n*[${t.part}/3] ${typeLabel}* (${t.text.length} chars)\n${t.text}\n\n`;
  });

  const payload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Approve & Upload to Threads",
            callback_data: `approve_${draftId}`,
          },
        ],
      ],
    },
  };

  try {
    await axios.post(`${env.TELEGRAM_API}/sendMessage`, payload);
  } catch (err) {
    // Fallback without Markdown in case special characters break parsing
    delete payload.parse_mode;
    await axios.post(`${env.TELEGRAM_API}/sendMessage`, payload);
  }
}

module.exports = {
  sendMessage,
  answerCallbackQuery,
  getTelegramFileUrl,
  sendAffiliatePreview,
};
