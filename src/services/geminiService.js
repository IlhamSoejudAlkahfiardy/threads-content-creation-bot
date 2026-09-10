const { ai } = require("../config/gemini");
const {
  systemInstruction,
  buildPrompt,
  responseSchema,
} = require("../prompts/affiliatePrompt");
const logger = require("../utils/logger");

/**
 * Generate 3-part affiliate threads using Gemini 2.5 Flash
 * @param {string} briefText - User product description/brief
 * @param {string[]} imageUrls - Array of public image URLs
 * @returns {Promise<{ productName: string, category: string, threads: Array }>}
 */
async function generateAffiliateThreads(briefText, imageUrls = []) {
  const prompt = buildPrompt(briefText, imageUrls.length);
  logger.info("Gemini", `Prompt prepared. Requesting generation from gemini-2.5-flash...`);
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    },
  });

  const durationMs = Date.now() - startTime;
  logger.info("Gemini", `Gemini response received in ${durationMs}ms`);

  const parsed = JSON.parse(response.text);
  const productName = parsed.productName || "Produk Pilihan";
  const category = parsed.category || "Rekomendasi";
  const rawThreads = Array.isArray(parsed.threads) ? parsed.threads : [];

  // Ensure exactly 3 parts and enforce hard safety slice <= 500 chars
  const structuredThreads = rawThreads.slice(0, 3).map((t, idx) => ({
    part: idx + 1,
    type: t.type || (idx === 0 ? "HOOK" : idx === 1 ? "MAIN_CONTENT" : "CTA_AND_LINKS"),
    text: t.text.trim().slice(0, 500),
    charCount: t.text.trim().slice(0, 500).length,
    mediaType:
      idx === 2 && imageUrls.length > 1
        ? "CAROUSEL"
        : idx === 2 && imageUrls.length === 1
        ? "IMAGE"
        : "TEXT",
    threadsPostId: "",
  }));

  if (structuredThreads.length === 0) {
    logger.error("Gemini", "AI response parsed to 0 structured threads");
    throw new Error("AI tidak menghasilkan thread valid.");
  }

  logger.info(
    "Gemini",
    `Structured ${structuredThreads.length} parts for "${productName}" (${category})`
  );

  return {
    productName,
    category,
    threads: structuredThreads,
  };
}

module.exports = {
  generateAffiliateThreads,
};
