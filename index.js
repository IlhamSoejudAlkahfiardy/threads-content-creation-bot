require("dotenv").config();
const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

// 1. Initialize Firebase
admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const db = admin.firestore();

// 2. Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Helper: Sleep utility for rate-limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Wait for Threads Media Container to be ready (status = FINISHED)
async function waitForContainerFinished(creationId, maxAttempts = 8, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await axios.get(`https://graph.threads.net/v1.0/${creationId}`, {
        params: {
          fields: "status,error_message",
          access_token: process.env.THREADS_TOKEN,
        },
      });

      const status = res.data?.status;
      if (status === "FINISHED") {
        return true;
      }
      if (status === "ERROR") {
        throw new Error(
          `Container error from Threads: ${res.data?.error_message || "Unknown error"}`
        );
      }
      console.log(
        `[Threads] Container ${creationId} status: ${status}. Waiting... (attempt ${attempt}/${maxAttempts})`
      );
    } catch (err) {
      const subcode = err.response?.data?.error?.error_subcode;
      if (subcode === 4279009) {
        console.log(
          `[Threads] Container ${creationId} propagating... (attempt ${attempt}/${maxAttempts})`
        );
      } else if (err.message.includes("Container error")) {
        throw err;
      } else {
        console.warn(`[Threads] Polling notice: ${err.message}`);
      }
    }
    await sleep(delayMs);
  }
  return false;
}

// Helper: Publish container with automatic retry for transient error 4279009
async function publishContainerWithRetry(creationId, maxRetries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const publishRes = await axios.post(
        `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: process.env.THREADS_TOKEN,
          },
        }
      );
      return publishRes.data.id;
    } catch (err) {
      const subcode = err.response?.data?.error?.error_subcode;
      const isResourceNotFound = subcode === 4279009 || err.response?.status === 404;

      if (isResourceNotFound && attempt < maxRetries) {
        console.warn(
          `[Threads] Publish attempt ${attempt}/${maxRetries} got 4279009 (resource propagating). Retrying in ${delayMs / 1000}s...`
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
}

// Helper: Send Telegram message with safe chunking (Telegram 4096 char limit)
async function sendTelegramPreview(chatId, draftId, topic, threads) {
  const header = `🧵 *AI Multi-Thread Draft: ${topic}*\n📊 *Total:* ${threads.length} parts (Max 500 chars/part)\n\n`;
  const separator = "\n━━━━━━━━━━━━━━━━━━━\n";

  // Build array of formatted thread parts
  const formattedParts = threads.map((item, idx) => {
    return `*[${idx + 1}/${threads.length}]* (${item.length} chars)\n${item}`;
  });

  // Group into safe chunks (< 3800 chars)
  const messageChunks = [];
  let currentChunk = header;

  for (let i = 0; i < formattedParts.length; i++) {
    const partText = (i === 0 ? "" : separator) + formattedParts[i];
    if (currentChunk.length + partText.length > 3800) {
      messageChunks.push(currentChunk);
      currentChunk = formattedParts[i];
    } else {
      currentChunk += partText;
    }
  }
  if (currentChunk.length > 0) {
    messageChunks.push(currentChunk);
  }

  // Send all chunks, attaching the approve button to the last chunk
  for (let i = 0; i < messageChunks.length; i++) {
    const isLast = i === messageChunks.length - 1;
    const payload = {
      chat_id: chatId,
      text: messageChunks[i],
      parse_mode: "Markdown",
    };

    if (isLast) {
      payload.reply_markup = {
        inline_keyboard: [
          [
            {
              text: "✅ Approve & Upload to Threads",
              callback_data: `approve_${draftId}`,
            },
          ],
        ],
      };
    }

    try {
      await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    } catch (tgErr) {
      // Fallback without Markdown if markdown parsing fails
      delete payload.parse_mode;
      await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    }
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const message = req.body.message;
  const callbackQuery = req.body.callback_query;

  // ==========================================
  // --- A. HANDLE INCOMING TEXT BRIEF ---
  // ==========================================
  if (message && message.text) {
    const chatId = message.chat.id;
    const brief = message.text;

    console.log(`[Telegram] Received brief: "${brief}"`);

    // Acknowledge brief
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: "⏳ Generating multi-thread content with Gemini AI...",
    });

    try {
      const systemInstruction = `
Kamu adalah seorang social media manager dan software engineer berpengalaman yang membuat konten edukatif dan engaging untuk Meta Threads.
Gaya penulisanmu mengikuti persona berikut:
- Bahasa: Bahasa Indonesia santai (relatable tech developer slang) dengan istilah teknis bahasa Inggris yang natural (misal: runtime, clean code, maintainability, over-engineering, vibe coder, authentication, compile time).
- Nada: Santai, relatable, cerdas, sedikit humoris dan kritis ("bahasa bayi", analogi sederhana, "User -> Server -> DB" flow jika relevan).
- Struktur Multi-Thread (Maksimal 10 thread parts, sesuaikan jumlah thread antara 3 sampai 10 berdasarkan kedalaman topik):
  * Thread #1 (Hook): Situasi/dilema developer sehari-hari, dialog lucu (PM vs Dev), atau case menarik yang bikin penasaran.
  * Thread #2 sampai #N-1 (Deep Dive): Penjelasan lugas, analogi "bahasa bayi", perbandingan poin demi poin, contoh kode singkat, atau diagram alur teks (panah ↓).
  * Thread terakhir (#N) (Closing & CTA): Kesimpulan/nasihat praktis + ajakan diskusi terbuka ("Menurut kalian gimana? Reply di bawah yukk, kita open discuss👇" atau "Open discuss kuyy!😉").
- ATURAN MUTLAK (HARD CONSTRAINT):
  1. Setiap item thread HARUS STRICTLY di bawah 500 karakter (termasuk spasi dan emoji). Meta Threads menolak post > 500 karakter.
  2. Jangan gunakan hashtag (#) berlebihan di dalam isi thread.
  3. Maksimal total thread adalah 10 parts.
`;

      const prompt = `Buatkan konten multi-thread Meta Threads berdasarkan brief berikut: "${brief}". Pastikan setiap part maksimal 500 karakter dan memiliki alur diskusi yang tersambung dari awal sampai akhir.`;

      // Call Gemini with structured JSON output
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              topic: {
                type: "STRING",
                description: "Judul singkat topik yang dibahas",
              },
              threads: {
                type: "ARRAY",
                description:
                  "Daftar post thread berurutan (maksimal 10 parts). Setiap part STRICTLY maksimal 500 karakter.",
                items: {
                  type: "STRING",
                  description:
                    "Isi teks post untuk 1 thread part (harus <= 500 karakter).",
                },
              },
            },
            required: ["topic", "threads"],
          },
        },
      });

      const parsedData = JSON.parse(response.text);
      const topic = parsedData.topic || brief;
      let rawThreads = Array.isArray(parsedData.threads) ? parsedData.threads : [];

      // Limit to maximum 10 threads and enforce hard 500-char safety slice
      rawThreads = rawThreads.slice(0, 10).map((t) => t.trim().slice(0, 500));

      if (rawThreads.length === 0) {
        throw new Error("AI tidak menghasilkan thread valid.");
      }

      console.log(
        `[Gemini] Generated ${rawThreads.length} thread parts for topic: "${topic}"`
      );

      // Save structured multi-thread draft to Firestore
      const draftData = {
        topic: topic,
        totalThreads: rawThreads.length,
        threads: rawThreads.map((text, idx) => ({
          index: idx + 1,
          text: text,
          charCount: text.length,
          threadsPostId: "",
        })),
        status: "pending",
        rootPostId: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const draftRef = await db.collection("drafts").add(draftData);
      console.log(`[Firestore] Saved draft ID: ${draftRef.id}`);

      // Send Option A preview to Telegram
      await sendTelegramPreview(chatId, draftRef.id, topic, rawThreads);
    } catch (err) {
      console.error("[Gemini/Firestore Error]:", err);
      const errMsg = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: `❌ Error generating multi-thread: ${errMsg}`,
      });
    }
  }

  // ==========================================
  // --- B. HANDLE APPROVAL BUTTON CLICK ---
  // ==========================================
  if (callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;

    // Acknowledge callback immediately to remove loading spinner in Telegram
    try {
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
      });
    } catch (e) {
      // ignore
    }

    if (callbackData.startsWith("approve_")) {
      const draftId = callbackData.split("_")[1];

      try {
        // 1. Retrieve the draft from Firestore
        const docRef = db.collection("drafts").doc(draftId);
        const doc = await docRef.get();

        if (!doc.exists) throw new Error("Draft document not found in Firestore");

        const draft = doc.data();

        // Prevent duplicate publishing
        if (draft.status === "published") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: `⚠️ Multi-thread ini sudah pernah di-publish sebelumnya! Root Post ID: ${draft.rootPostId}`,
          });
          return;
        }

        if (draft.status === "publishing") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: `⏳ Multi-thread sedang dalam proses upload, mohon tunggu...`,
          });
          return;
        }

        // 2. Mark as publishing
        await docRef.update({
          status: "publishing",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `🚀 Memulai upload ${draft.threads.length} parts ke Threads...`,
        });

        // 3. Sequentially publish each thread part
        let previousPostId = null;
        const updatedThreads = [];

        for (let i = 0; i < draft.threads.length; i++) {
          const item = draft.threads[i];
          console.log(
            `[Threads] Uploading part ${i + 1}/${draft.threads.length}...`
          );

          // Prepare Container parameters
          const containerParams = {
            media_type: "TEXT",
            text: item.text,
            access_token: process.env.THREADS_TOKEN,
          };

          // If not the first post, chain it to the previous post
          if (previousPostId) {
            containerParams.reply_to_id = previousPostId;
          }

          // Step 1: Create Container
          const containerRes = await axios.post(
            `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
            null,
            { params: containerParams }
          );
          const creationId = containerRes.data.id;

          // Wait until container status is FINISHED or propagated
          await waitForContainerFinished(creationId, 8, 1500);

          // Step 2: Publish Container with auto-retry
          const livePostId = await publishContainerWithRetry(creationId, 5, 2000);

          // Next thread replies to this livePostId
          previousPostId = livePostId;

          updatedThreads.push({
            ...item,
            threadsPostId: livePostId,
          });

          console.log(`[Threads] Part ${i + 1} published! ID: ${livePostId}`);

          // Rate limit pause between parts
          await sleep(1500);
        }

        const rootPostId = updatedThreads[0].threadsPostId;

        // 4. Update Firestore with published state and post IDs
        await docRef.update({
          status: "published",
          rootPostId: rootPostId,
          threads: updatedThreads,
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 5. Notify user in Telegram with success summary
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `🎉 *Multi-Thread Berhasil Di-Upload!*\n\n📝 *Topik:* ${draft.topic}\n🧵 *Total Parts:* ${updatedThreads.length}\n🔗 *Root Post ID:* \`${rootPostId}\`\n\nSemua part berhasil di-chain secara berurutan! 🚀`,
          parse_mode: "Markdown",
        });
      } catch (error) {
        const errorDetails = error.response
          ? JSON.stringify(error.response.data)
          : error.message;
        console.error("[Threads Upload Error]:", errorDetails);

        // Mark as failed in Firestore
        try {
          await db.collection("drafts").doc(draftId).update({
            status: "failed",
            errorMessage: errorDetails,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          // ignore
        }

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
