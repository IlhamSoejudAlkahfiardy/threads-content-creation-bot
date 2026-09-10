const axios = require("axios");
const env = require("../config/env");
const { TOPICS } = require("../config/topics");

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
 * @param {string} [text]
 */
async function answerCallbackQuery(callbackQueryId, text = "") {
  try {
    const payload = { callback_query_id: callbackQueryId };
    if (text) payload.text = text;
    await axios.post(`${env.TELEGRAM_API}/answerCallbackQuery`, payload);
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
 * Construct Markdown formatted text for 3-part affiliate thread preview
 * @param {string} productName
 * @param {string} category
 * @param {Array} threads
 * @param {string[]} imageUrls
 * @param {string|null} [topicLabel=null]
 * @param {string|null} [topicTag=null]
 * @returns {string}
 */
function buildPreviewText(productName, category, threads, imageUrls, topicLabel = null, topicTag = null) {
  const imageLabel =
    imageUrls && imageUrls.length > 1
      ? `🖼️ *Lampiran:* ${imageUrls.length} Gambar (Carousel Slider di Part 3)`
      : imageUrls && imageUrls.length === 1
      ? `🖼️ *Lampiran:* 1 Gambar di Part 3`
      : `🖼️ *Lampiran:* Tanpa Gambar (Text Only)`;

  const topicInfo =
    topicLabel && topicTag
      ? `🌐 *Community/Topic:* ${topicLabel} (\`#${topicTag}\`)`
      : `🌐 *Community/Topic:* _(Tanpa Topic / Default)_`;

  let messageText = `🛍️ *DRAFT AFFILIATE THREADS: ${productName}*\n🏷️ *Kategori:* ${category}\n${topicInfo}\n${imageLabel}\n\n`;

  threads.forEach((t) => {
    const typeLabel =
      t.type === "HOOK"
        ? "HOOK (Pancingan)"
        : t.type === "MAIN_CONTENT"
        ? "MAIN CONTENT (Review & Solusi)"
        : "CTA & AFFILIATE LINKS";

    messageText += `━━━━━━━━━━━━━━━━━━━\n*[${t.part}/3] ${typeLabel}* (${t.text.length} chars)\n${t.text}\n\n`;
  });

  return messageText;
}

/**
 * Build primary preview inline keyboard with Topic Selector and Approve buttons
 * @param {string} draftId
 * @param {string|null} [topicLabel=null]
 * @returns {object}
 */
function buildMainKeyboard(draftId, topicLabel = null) {
  const topicButtonText = topicLabel
    ? `🏷️ Ganti Community (${topicLabel})`
    : "🏷️ Pilih Community / Topic";

  return {
    inline_keyboard: [
      [
        {
          text: topicButtonText,
          callback_data: `topmenu_${draftId}`,
        },
      ],
      [
        {
          text: "✅ Approve & Upload to Threads",
          callback_data: `approve_${draftId}`,
        },
      ],
    ],
  };
}

/**
 * Build sub-menu inline keyboard displaying available predefined topics in 2 columns
 * @param {string} draftId
 * @returns {object}
 */
function buildTopicsKeyboard(draftId) {
  const rows = [];

  // Group topics 2 per row
  for (let i = 0; i < TOPICS.length; i += 2) {
    const row = [];
    row.push({
      text: TOPICS[i].label,
      callback_data: `settop_${draftId}_${TOPICS[i].id}`,
    });
    if (TOPICS[i + 1]) {
      row.push({
        text: TOPICS[i + 1].label,
        callback_data: `settop_${draftId}_${TOPICS[i + 1].id}`,
      });
    }
    rows.push(row);
  }

  // Row for clearing topic (no topic)
  rows.push([
    {
      text: "🌐 Tanpa Topic (Default)",
      callback_data: `clrtop_${draftId}`,
    },
  ]);

  // Row for going back without changes
  rows.push([
    {
      text: "⬅️ Batal / Kembali ke Preview",
      callback_data: `backprev_${draftId}`,
    },
  ]);

  return { inline_keyboard: rows };
}

/**
 * Edit existing Telegram message text and reply markup
 * @param {number|string} chatId
 * @param {number} messageId
 * @param {string} text
 * @param {object} [replyMarkup=null]
 */
async function editMessageText(chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  try {
    await axios.post(`${env.TELEGRAM_API}/editMessageText`, payload);
  } catch (err) {
    delete payload.parse_mode;
    await axios.post(`${env.TELEGRAM_API}/editMessageText`, payload);
  }
}

/**
 * Edit existing Telegram message reply markup (inline keyboard)
 * @param {number|string} chatId
 * @param {number} messageId
 * @param {object} replyMarkup
 */
async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  return axios.post(`${env.TELEGRAM_API}/editMessageReplyMarkup`, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

/**
 * Send preview of the 3-part affiliate thread to Telegram with Topic Selector & Approve button
 * @param {number|string} chatId
 * @param {string} draftId
 * @param {string} productName
 * @param {string} category
 * @param {Array} threads
 * @param {string[]} imageUrls
 * @param {string|null} [topicLabel=null]
 * @param {string|null} [topicTag=null]
 */
async function sendAffiliatePreview(
  chatId,
  draftId,
  productName,
  category,
  threads,
  imageUrls,
  topicLabel = null,
  topicTag = null
) {
  const messageText = buildPreviewText(
    productName,
    category,
    threads,
    imageUrls,
    topicLabel,
    topicTag
  );
  const replyMarkup = buildMainKeyboard(draftId, topicLabel);

  const payload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
  };

  try {
    await axios.post(`${env.TELEGRAM_API}/sendMessage`, payload);
  } catch (err) {
    delete payload.parse_mode;
    await axios.post(`${env.TELEGRAM_API}/sendMessage`, payload);
  }
}

module.exports = {
  sendMessage,
  answerCallbackQuery,
  getTelegramFileUrl,
  sendAffiliatePreview,
  buildPreviewText,
  buildMainKeyboard,
  buildTopicsKeyboard,
  editMessageText,
  editMessageReplyMarkup,
};
