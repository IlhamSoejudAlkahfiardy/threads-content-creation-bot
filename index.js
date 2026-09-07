const express = require("express");
const env = require("./src/config/env");
const { handleWebhook } = require("./src/controllers/webhookController");

const app = express();

app.use(express.json());

// Telegram Webhook endpoint
app.post("/webhook", handleWebhook);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
