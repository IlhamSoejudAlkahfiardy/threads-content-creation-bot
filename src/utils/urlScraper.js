const axios = require("axios");
const logger = require("./logger");

/**
 * Regex to detect URLs in user text
 */
const URL_REGEX = /(https?:\/\/[^\s]+)/i;

/**
 * Extract the first HTTP/HTTPS URL from a string
 * @param {string} text
 * @returns {string|null}
 */
function extractUrl(text) {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Fetch and extract text content from an article URL
 * @param {string} url
 * @param {number} [maxChars=3000]
 * @returns {Promise<{ title: string, content: string } | null>}
 */
async function fetchArticleContent(url, maxChars = 3000) {
  try {
    logger.info("UrlScraper", `Fetching article content from: ${url}`);
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
      },
    });

    const html = typeof response.data === "string" ? response.data : "";
    if (!html) return null;

    // 1. Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Artikel Berita IT";

    // 2. Remove script, style, nav, footer, header tags
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");

    // 3. Strip remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, " ");

    // 4. Decode common HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // 5. Clean up whitespaces
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // 6. Slice to max characters
    const content = cleaned.slice(0, maxChars);
    logger.info("UrlScraper", `Extracted article "${title}" (${content.length} chars)`);

    return {
      title,
      content,
    };
  } catch (err) {
    logger.warn("UrlScraper", `Failed to scrape URL ${url}: ${err.message}`);
    return null;
  }
}

module.exports = {
  extractUrl,
  fetchArticleContent,
};
