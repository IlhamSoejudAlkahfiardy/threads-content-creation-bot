const express = require("express");
const env = require("./src/config/env");
const logger = require("./src/utils/logger");
const { handleWebhook } = require("./src/controllers/webhookController");

const app = express();

app.use(express.json());
app.use(logger.requestMiddleware);

// Telegram Webhook endpoint
app.post("/webhook", handleWebhook);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(env.PORT, () => {
  logger.info("Server", `Server running on port ${env.PORT}`);
});
