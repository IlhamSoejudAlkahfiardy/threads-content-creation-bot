const { ai } = require("../config/gemini");
const {
  systemInstruction,
  buildTechPrompt,
  responseSchema,
} = require("../prompts/techContentPrompt");
const sleep = require("../utils/sleep");
const logger = require("../utils/logger");

/**
 * Valid candidate models supported by @google/genai SDK in priority order
 */
const CANDIDATE_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
];

/**
 * Call Gemini with retry on transient 503 (high demand) or 429 errors
 * @param {string} modelName
 * @param {string} prompt
 * @param {number} [maxAttempts=2]
 * @returns {Promise<{ text: string, modelName: string }>}
 */
async function callGeminiWithRetry(modelName, prompt, maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(
        "Gemini",
        `Calling ${modelName} (attempt ${attempt}/${maxAttempts})...`
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
      logger.info(
        "Gemini",
        `Success! Response received from ${modelName} in ${durationMs}ms`
      );
      return { text: response.text, modelName };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      const isTransient =
        err.status === 503 ||
        err.status === 429 ||
        errorMsg.includes("high demand") ||
        errorMsg.includes("UNAVAILABLE");

      if (isTransient && attempt < maxAttempts) {
        logger.info(
          "Gemini",
          `Transient spike on ${modelName}. Waiting 1.5s before retry (attempt ${attempt}/${maxAttempts})...`
        );
        await sleep(1500);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Generate tech/IT threads using Gemini with multi-model fallback & transient retry
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
      const result = await callGeminiWithRetry(modelName, prompt, 2);
      responseText = result.text;
      usedModel = result.modelName;
      break;
    } catch (err) {
      lastError = err;
      const errorMsg = err.response?.data?.error?.message || err.message;
      logger.warn(
        "Gemini",
        `Model ${modelName} failed (${errorMsg}). Falling back to next model...`
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
