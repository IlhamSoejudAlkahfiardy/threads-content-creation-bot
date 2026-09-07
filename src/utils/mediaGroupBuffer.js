const buffer = new Map();

/**
 * Buffer Telegram media group (album) photos and debounce processing
 * @param {string} groupId - Telegram media_group_id
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} fileId - File ID of photo
 * @param {string} caption - Photo caption
 * @param {function(number|string, string, string[]): Promise<void>} onComplete - Callback when debounce finishes
 * @param {number} [debounceMs=1200] - Debounce delay in milliseconds
 */
function handleMediaGroup(groupId, chatId, fileId, caption, onComplete, debounceMs = 1200) {
  if (!buffer.has(groupId)) {
    buffer.set(groupId, {
      chatId,
      photos: [fileId],
      caption,
      timer: null,
    });
  } else {
    const entry = buffer.get(groupId);
    entry.photos.push(fileId);
    if (caption) entry.caption = caption;
  }

  const entry = buffer.get(groupId);
  if (entry.timer) clearTimeout(entry.timer);

  entry.timer = setTimeout(async () => {
    buffer.delete(groupId);
    try {
      await onComplete(
        entry.chatId,
        entry.caption || "Rekomendasi produk pilihan terbaik",
        entry.photos
      );
    } catch (err) {
      console.error(`[MediaGroupBuffer] Error executing callback for group ${groupId}:`, err);
    }
  }, debounceMs);
}

module.exports = {
  handleMediaGroup,
};
