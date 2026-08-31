require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai"); // <-- Add this import

// 1. Initialize Firebase
admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const db = admin.firestore();

// 2. Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // <-- Initialize AI

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const message = req.body.message;
  const callbackQuery = req.body.callback_query;

  // --- A. HANDLE INCOMING TEXT BRIEF ---
  if (message && message.text) {
    const chatId = message.chat.id;
    const brief = message.text;

    console.log(`[Telegram] Received brief: "${brief}"`);

    // Let the user know the AI is thinking
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: "⏳ Generating content...",
    });

    try {
      // --- ACTUAL AI GENERATION ---
      const prompt = `You are an expert social media manager. Write a highly engaging, concise post for Meta Threads based on this brief: "${brief}". Do not include hashtags.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const generatedDraft = response.text; // <-- Get real AI text

      // Save draft to Firestore
      const draftRef = await db.collection("drafts").add({
        content: generatedDraft,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        threadsPostId: "",
      });

      // Send the AI draft back to Telegram
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: `Here is the AI draft:\n\n${generatedDraft}`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Approve & Upload",
                callback_data: `approve_${draftRef.id}`,
              },
            ],
          ],
        },
      });
    } catch (err) {
      console.error("[Gemini/Firestore Error]:", err.message);
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: `❌ Error generating content: ${err.message}`,
      });
    }
  }

  // --- B. HANDLE APPROVAL BUTTON CLICK ---
  if (callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;

    if (callbackData.startsWith("approve_")) {
      const draftId = callbackData.split("_")[1];

      try {
        // 1. Retrieve the draft from Firestore
        const doc = await db.collection("drafts").doc(draftId).get();
        if (!doc.exists) throw new Error("Draft document not found");

        const draftContent = doc.data().content;

        // 2. Threads API Step 1: Create Container
        const containerRes = await axios.post(
          `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
          null,
          {
            params: {
              media_type: "TEXT",
              text: draftContent,
              access_token: process.env.THREADS_TOKEN,
            },
          },
        );
        const creationId = containerRes.data.id;

        // 3. Threads API Step 2: Publish Container
        const publishRes = await axios.post(
          `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads_publish`,
          null,
          {
            params: {
              creation_id: creationId,
              access_token: process.env.THREADS_TOKEN,
            },
          },
        );
        const livePostId = publishRes.data.id;

        // 4. Update Firestore Document Status
        await db.collection("drafts").doc(draftId).update({
          status: "published",
          threadsPostId: livePostId,
        });

        // 5. Notify user in Telegram
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `🎉 Upload Success! Live Post ID: ${livePostId}`,
        });
      } catch (error) {
        const errorDetails = error.response
          ? JSON.stringify(error.response.data)
          : error.message;
        console.error("[Threads Upload Error]:", errorDetails);

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `❌ Upload Failed: ${errorDetails}`,
        });
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
