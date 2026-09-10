/**
 * Predefined Communities and Topics for Meta Threads
 * Each item has:
 * - id: unique short identifier for Telegram callback data (under 10 chars)
 * - label: display name shown on Telegram buttons
 * - tag: valid URL slug for Threads API (alphanumeric, lowercase, no spaces/special chars, 1-50 chars)
 */
const TOPICS = [
  { id: "tech", label: "💻 Tech Threads", tag: "techthreads" },
  { id: "ai", label: "🤖 AI Threads", tag: "aithreads" },
  { id: "shopee", label: "🛍️ Racun Shopee", tag: "racunshopee" },
  { id: "fashion", label: "👗 Fashion Threads", tag: "fashionthreads" },
  { id: "gaming", label: "🎮 Gaming Threads", tag: "gamingthreads" },
  { id: "beauty", label: "💄 Beauty Threads", tag: "beautythreads" },
  { id: "books", label: "📚 Book Threads", tag: "bookthreads" },
  { id: "cats", label: "🐱 Cats of Threads", tag: "catsofthreads" },
];

/**
 * Find topic by short id
 * @param {string} id
 * @returns {{ id: string, label: string, tag: string } | undefined}
 */
function getTopicById(id) {
  return TOPICS.find((t) => t.id === id);
}

module.exports = {
  TOPICS,
  getTopicById,
};
