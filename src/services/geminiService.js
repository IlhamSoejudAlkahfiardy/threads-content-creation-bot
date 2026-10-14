const { ai } = require("../config/gemini");
const {
  systemInstruction,
  buildTechPrompt,
  responseSchema,
} = require("../prompts/techContentPrompt");
const logger = require("../utils/logger");

/**
 * Generate tech/IT threads using Gemini 2.5 Flash
 * @param {object} params
 * @param {string} params.topicText - User prompt or news topic
 * @param {string} [params.mode="deepdive"] - 'hottake' | 'deepdive' | 'tips' | 'joke'
 * @param {string|null} [params.articleContent=null] - Extracted article text if URL provided
 * @param {boolean} [params.hasImage=false] - Whether user attached an image
 * @returns {Promise<{ topicTitle: string, mode: string, threads: Array }>}
 */
async function generateTechThreads({
  topicText,
  mode = "deepdive",
  articleContent = null,
  hasImage = false,
}) {
  const prompt = buildTechPrompt({ topicText, mode, articleContent, hasImage });
  logger.info(
    "Gemini",
    `Prompt prepared for mode "${mode}". Requesting generation from gemini-2.5-flash...`
  );
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
  const topicTitle = parsed.topicTitle || "Topik Tech";
  const selectedMode = parsed.mode || mode;
  const rawThreads = Array.isArray(parsed.threads) ? parsed.threads : [];

  if (rawThreads.length === 0) {
    logger.error("Gemini", "AI response parsed to 0 structured threads");
    throw new Error("AI tidak menghasilkan thread valid.");
  }

  // Enforce strictly <= 500 chars and structure metadata
  const structuredThreads = rawThreads.slice(0, 7).map((t, idx, arr) => {
    const isFirst = idx === 0;
    const isLast = idx === arr.length - 1;
    const cleanText = (t.text || "").trim().slice(0, 500);

    return {
      part: idx + 1,
      type: isFirst ? "HOOK" : isLast ? "CTA" : t.type || "BODY",
      text: cleanText,
      charCount: cleanText.length,
      threadsPostId: "",
    };
  });

  logger.info(
    "Gemini",
    `Structured ${structuredThreads.length} parts for "${topicTitle}" [${selectedMode}]`
  );

  return {
    topicTitle,
    mode: selectedMode,
    threads: structuredThreads,
  };
}

module.exports = {
  generateTechThreads,
};
