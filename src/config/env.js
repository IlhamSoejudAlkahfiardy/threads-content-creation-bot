require("dotenv").config();

const env = {
  PORT: process.env.PORT || 3000,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  THREADS_TOKEN: process.env.THREADS_TOKEN,
  THREADS_USER_ID: process.env.THREADS_USER_ID,
  get TELEGRAM_API() {
    return `https://api.telegram.org/bot${this.TELEGRAM_TOKEN}`;
  },
};

module.exports = env;
