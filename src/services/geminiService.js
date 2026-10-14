const { ai } = require("../config/gemini");
const {
  systemInstruction,
  buildTechPrompt,
  responseSchema,
} = require("../prompts/techContentPrompt");
const logger = require("../utils/logger");

/**
 * Priority list of models with automatic fallback on 503 / high-demand / quota limits
 */
const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

/**
 * Generate tech/IT threads using Gemini with multi-model fallback resilience
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
  let responseText = null;
  let usedModel = null;
  let lastError = null;

  // Try candidate models in order of priority
  for (const modelName of CANDIDATE_MODELS) {
    try {
      logger.info(
        "Gemini",
        `Requesting generation from ${modelName} for mode "${mode}"...`
      );
      const startTime = Date.now();

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const durationMs = Date.now() - startTime;
      logger.info("Gemini", `Success! Received response from ${modelName} in ${durationMs}ms`);
      responseText = response.text;
      usedModel = modelName;
      break;
    } catch (err) {
      lastError = err;
      const errorMsg = err.response?.data?.error?.message || err.message;
      logger.warn(
        "Gemini",
        `Model ${modelName} unavailable/failed: "${errorMsg}". Falling back to next model...`
      );
    }
  }

  if (!responseText) {
    logger.error("Gemini", "All candidate Gemini models failed:", lastError?.message);
    throw (
      lastError ||
      new Error("Semua model Gemini sedang mengalami lonjakan trafik. Silakan coba lagi sebentar.")
    );
  }

  const parsed = JSON.parse(responseText);
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
    `Structured ${structuredThreads.length} parts for "${topicTitle}" [${selectedMode}] using ${usedModel}`
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
