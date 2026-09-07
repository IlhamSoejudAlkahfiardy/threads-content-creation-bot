const { GoogleGenAI } = require("@google/genai");
const env = require("./env");

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

module.exports = {
  ai,
};
