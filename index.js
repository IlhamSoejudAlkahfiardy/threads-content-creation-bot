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

// Helper: Get direct public CDN download URL from Telegram for a file_id
async function getTelegramFileUrl(fileId) {
  const res = await axios.get(`${TELEGRAM_API}/getFile`, {
    params: { file_id: fileId },
  });
  const filePath = res.data?.result?.file_path;
  if (!filePath) throw new Error("Could not retrieve file path from Telegram");
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
}

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
      } else if (err.message?.includes("Container error")) {
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

// Helper: Send Telegram Affiliate Preview Message
async function sendAffiliatePreview(chatId, draftId, productName, category, threads, imageUrls) {
  const imageLabel =
    imageUrls.length > 1
      ? `🖼️ *Lampiran:* ${imageUrls.length} Gambar (Carousel Slider di Part 3)`
      : imageUrls.length === 1
      ? `🖼️ *Lampiran:* 1 Gambar di Part 3`
      : `🖼️ *Lampiran:* Tanpa Gambar (Text Only)`;

  let messageText = `🛍️ *DRAFT AFFILIATE THREADS: ${productName}*\n🏷️ *Kategori:* ${category}\n${imageLabel}\n\n`;

  threads.forEach((t) => {
    const typeLabel =
      t.type === "HOOK"
        ? "HOOK (Pancingan)"
        : t.type === "MAIN_CONTENT"
        ? "MAIN CONTENT (Review & Solusi)"
        : "CTA & AFFILIATE LINKS";

    messageText += `━━━━━━━━━━━━━━━━━━━\n*[${t.part}/3] ${typeLabel}* (${t.text.length} chars)\n${t.text}\n\n`;
  });

  const payload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Approve & Upload to Threads",
            callback_data: `approve_${draftId}`,
          },
        ],
      ],
    },
  };

  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  } catch (err) {
    // Fallback without Markdown in case special characters break parsing
    delete payload.parse_mode;
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  }
}

// In-memory buffer for handling Telegram multi-photo albums (media groups)
const mediaGroupBuffer = new Map();

// Helper: Process brief and trigger Gemini Affiliate Copywriting
async function processAffiliateBrief(chatId, briefText, photoFileIds = []) {
  // Let user know AI is writing
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: `⏳ Meracik 3-part thread affiliate dengan Gemini AI... (${photoFileIds.length} foto terdeteksi)`,
  });

  try {
    // 1. Resolve photo URLs from Telegram CDN
    const imageUrls = [];
    for (const fileId of photoFileIds) {
      try {
        const publicUrl = await getTelegramFileUrl(fileId);
        imageUrls.push(publicUrl);
      } catch (err) {
        console.error("[Telegram CDN] Error getting file URL:", err.message);
      }
    }

    // Extract any additional image URLs found inside the text
    const urlRegex = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp))/gi;
    const matchedUrls = briefText.match(urlRegex) || [];
    matchedUrls.forEach((url) => {
      if (!imageUrls.includes(url)) imageUrls.push(url);
    });

    // 2. System Instruction for Universal Affiliate Copywriting
    const systemInstruction = `
Kamu adalah seorang Expert Social Commerce Copywriter & Affiliate Marketer Indonesia spesialis Meta Threads ("Spill Master & Racun Belanja").
Tugasmu adalah mengubah brief atau deskripsi produk menjadi konten multi-thread Meta Threads 3-Part dengan formula konversi tinggi dan tata letak (formatting) yang estetik, rapi, dan mudah dibaca (ada breathing room).

1. Pahami kategori produk apapun (anak kost, perlengkapan mendaki/outdoor, modifikasi motor/otomotif, desk setup/gadget, kecantikan, fashion, dll).
2. Adaptasi gaya bahasa & keresahan audiens sesuai niche produk:
   - Nada: Antusias, solutif, jujur/relatable, seperti review pribadi orang yang puas menggunakan barangnya.
   - Kosakata: Gunakan slang rekomendasi Indonesia yang natural (misal: "worth it banget", "definisi life changer", "racun belanja", "murah tapi ga murahan", "spill", "checkout", dll).

3. ATURAN TATA LETAK & PARAGRAF (SANGAT PENTING / WAJIB):
   - JANGAN PERNAH membuat teks menumpuk dalam satu paragraf padat (wall of text)! Postingan Threads harus enak dibaca di layar HP dengan pemisah baris kosong (enter 2x / double line breaks).
   
   - **FORMAT PART 1 (HOOK):**
     Pecah menjadi 2-3 paragraf pendek dengan baris kosong (enter 2x):
     Contoh format:
     [Pertanyaan pancingan / keresahan relate 😩]
     
     [Penjelasan singkat kenapa hal itu bikin repot]
     
     [Kalimat pembuka solusi + ajakan buka thread 🧵👇]

   - **FORMAT PART 2 (MAIN CONTENT):**
     Pecah menjadi 3 blok yang dipisahkan baris kosong (enter 2x), dengan poin-poin checklist (✅):
     Contoh format:
     [Nama produk & perkenalan singkat ✨]
     
     Kelebihan utamanya:
     ✅ [Poin fitur/benefit 1]
     ✅ [Poin fitur/benefit 2]
     ✅ [Poin praktis/daya/material]
     
     [Info harga terjangkau & kesimpulan worth it 💸]

   - **FORMAT PART 3 (CTA & LINKS):**
     Pisahkan dengan baris kosong (enter 2x):
     [Ajakan checkout & info promo / gratis ongkir 🏃💨]
     
     [Daftar Link Pembelian Affiliate yang rapi]

4. ATURAN MUTLAK (HARD CONSTRAINTS):
   - Setiap part HARUS STRICTLY di bawah 500 karakter (termasuk spasi, enter, dan emoji). Buat kalimat padat, to-the-point, dan punchy.
   - Total thread selalu tepat 3 parts (Hook, Main Content, CTA & Links).
   - Jangan gunakan hashtag (#) berlebihan di dalam teks thread.
`;

    const prompt = `Buatkan konten multi-thread affiliate Meta Threads berdasarkan brief produk berikut:
"${briefText}"

Jumlah foto terlampir yang akan di-upload ke Threads: ${imageUrls.length} foto.
PASTIKAN:
1. Setiap part (terutama Hook dan Main Content) wajib memiliki baris baru / enter kosong (double line break) agar tidak menumpuk padat dan mudah dibaca!
2. Main Content menggunakan checklist poin-poin (✅).
3. Setiap part maksimal 500 karakter.`;

    // 3. Call Gemini with Structured JSON Output
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            productName: {
              type: "STRING",
              description: "Nama produk yang dipromosikan",
            },
            category: {
              type: "STRING",
              description:
                "Kategori niche produk (misal: Otomotif, Anak Kost, Outdoor, Gadget, Fashion)",
            },
            threads: {
              type: "ARRAY",
              description:
                "Tepat 3 part thread (Hook, Main Content, CTA & Links). Setiap part <= 500 karakter.",
              items: {
                type: "OBJECT",
                properties: {
                  part: { type: "INTEGER" },
                  type: {
                    type: "STRING",
                    enum: ["HOOK", "MAIN_CONTENT", "CTA_AND_LINKS"],
                  },
                  text: {
                    type: "STRING",
                    description: "Isi teks thread (STRICTLY <= 500 karakter)",
                  },
                },
                required: ["part", "type", "text"],
              },
            },
          },
          required: ["productName", "category", "threads"],
        },
      },
    });

    const parsed = JSON.parse(response.text);
    const productName = parsed.productName || "Produk Pilihan";
    const category = parsed.category || "Rekomendasi";
    const rawThreads = Array.isArray(parsed.threads) ? parsed.threads : [];

    // Ensure 3 parts & enforce hard safety slice <= 500 chars
    const structuredThreads = rawThreads.slice(0, 3).map((t, idx) => ({
      part: idx + 1,
      type: t.type || (idx === 0 ? "HOOK" : idx === 1 ? "MAIN_CONTENT" : "CTA_AND_LINKS"),
      text: t.text.trim().slice(0, 500),
      charCount: t.text.trim().slice(0, 500).length,
      mediaType: idx === 2 && imageUrls.length > 1 ? "CAROUSEL" : idx === 2 && imageUrls.length === 1 ? "IMAGE" : "TEXT",
      threadsPostId: "",
    }));

    if (structuredThreads.length === 0) {
      throw new Error("AI tidak menghasilkan thread valid.");
    }

    console.log(
      `[Gemini] Generated 3-part affiliate threads for: "${productName}" (${category})`
    );

    // 4. Save to Firestore
    const draftData = {
      productName: productName,
      category: category,
      imageUrls: imageUrls,
      threads: structuredThreads,
      status: "pending",
      rootPostId: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const draftRef = await db.collection("drafts").add(draftData);
    console.log(`[Firestore] Saved affiliate draft ID: ${draftRef.id}`);

    // 5. Send Preview to Telegram
    await sendAffiliatePreview(
      chatId,
      draftRef.id,
      productName,
      category,
      structuredThreads,
      imageUrls
    );
  } catch (err) {
    console.error("[Affiliate Engine Error]:", err);
    const errMsg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: `❌ Error generating affiliate thread: ${errMsg}`,
    });
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const message = req.body.message;
  const callbackQuery = req.body.callback_query;

  // ==========================================
  // --- A. HANDLE INCOMING TELEGRAM MESSAGE ---
  // ==========================================
  if (message) {
    const chatId = message.chat.id;

    // Case 1: Message contains photo(s)
    if (message.photo && Array.isArray(message.photo)) {
      // Pick highest quality photo (last element in photo array)
      const highestPhoto = message.photo[message.photo.length - 1];
      const fileId = highestPhoto.file_id;
      const caption = message.caption || "";

      // Check if message is part of an album (media_group_id)
      if (message.media_group_id) {
        const groupId = message.media_group_id;

        if (!mediaGroupBuffer.has(groupId)) {
          mediaGroupBuffer.set(groupId, {
            chatId: chatId,
            photos: [fileId],
            caption: caption,
            timer: null,
          });
        } else {
          const entry = mediaGroupBuffer.get(groupId);
          entry.photos.push(fileId);
          if (caption) entry.caption = caption;
        }

        const entry = mediaGroupBuffer.get(groupId);
        if (entry.timer) clearTimeout(entry.timer);

        // Debounce buffer for 1.2s to collect all photos in album
        entry.timer = setTimeout(async () => {
          mediaGroupBuffer.delete(groupId);
          await processAffiliateBrief(
            entry.chatId,
            entry.caption || "Rekomendasi produk pilihan terbaik",
            entry.photos
          );
        }, 1200);

        return;
      } else {
        // Single photo message
        await processAffiliateBrief(
          chatId,
          caption || "Rekomendasi produk pilihan terbaik",
          [fileId]
        );
        return;
      }
    }

    // Case 2: Text-only message
    if (message.text) {
      console.log(`[Telegram] Received text brief: "${message.text}"`);
      await processAffiliateBrief(chatId, message.text, []);
      return;
    }
  }

  // ==========================================
  // --- B. HANDLE APPROVAL BUTTON CLICK ---
  // ==========================================
  if (callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;

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
        const docRef = db.collection("drafts").doc(draftId);
        const doc = await docRef.get();

        if (!doc.exists) throw new Error("Draft document not found in Firestore");

        const draft = doc.data();

        if (draft.status === "published") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: `⚠️ Thread affiliate ini sudah pernah di-publish sebelumnya! Root Post ID: ${draft.rootPostId}`,
          });
          return;
        }

        if (draft.status === "publishing") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: `⏳ Thread sedang dalam proses upload ke Threads, mohon tunggu...`,
          });
          return;
        }

        // Mark as publishing
        await docRef.update({
          status: "publishing",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const imageInfo =
          draft.imageUrls && draft.imageUrls.length > 1
            ? `dengan Carousel ${draft.imageUrls.length} Foto`
            : draft.imageUrls && draft.imageUrls.length === 1
            ? "dengan 1 Foto"
            : "Text Only";

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `🚀 Memulai upload 3-part affiliate thread ke Meta Threads (${imageInfo})...`,
        });

        const updatedThreads = [];

        // ----------------------------------------------------
        // 1. UPLOAD THREAD #1 (HOOK - TEXT ROOT POST)
        // ----------------------------------------------------
        console.log("[Threads] Uploading Part 1 (Hook)...");
        const part1 = draft.threads[0];
        const container1Res = await axios.post(
          `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
          null,
          {
            params: {
              media_type: "TEXT",
              text: part1.text,
              access_token: process.env.THREADS_TOKEN,
            },
          }
        );
        const creationId1 = container1Res.data.id;
        await waitForContainerFinished(creationId1, 8, 1500);
        const rootPostId = await publishContainerWithRetry(creationId1, 5, 2000);
        console.log(`[Threads] Part 1 (Hook) Published! ID: ${rootPostId}`);

        updatedThreads.push({
          ...part1,
          threadsPostId: rootPostId,
        });

        await sleep(1500);

        // ----------------------------------------------------
        // 2. UPLOAD THREAD #2 (MAIN CONTENT - TEXT REPLY TO PART 1)
        // ----------------------------------------------------
        console.log("[Threads] Uploading Part 2 (Main Content)...");
        const part2 = draft.threads[1];
        const container2Res = await axios.post(
          `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
          null,
          {
            params: {
              media_type: "TEXT",
              text: part2.text,
              reply_to_id: rootPostId,
              access_token: process.env.THREADS_TOKEN,
            },
          }
        );
        const creationId2 = container2Res.data.id;
        await waitForContainerFinished(creationId2, 8, 1500);
        const part2PostId = await publishContainerWithRetry(creationId2, 5, 2000);
        console.log(`[Threads] Part 2 (Main Content) Published! ID: ${part2PostId}`);

        updatedThreads.push({
          ...part2,
          threadsPostId: part2PostId,
        });

        await sleep(1500);

        // ----------------------------------------------------
        // 3. UPLOAD THREAD #3 (CTA & LINKS + CAROUSEL/IMAGE)
        // ----------------------------------------------------
        console.log("[Threads] Uploading Part 3 (CTA & Links)...");
        const part3 = draft.threads[2];
        let part3PostId = null;

        if (draft.imageUrls && draft.imageUrls.length > 1) {
          // A. MULTI-IMAGE CAROUSEL
          console.log(
            `[Threads] Creating carousel containers for ${draft.imageUrls.length} images...`
          );
          const childContainerIds = [];

          for (let c = 0; c < Math.min(draft.imageUrls.length, 10); c++) {
            const imgUrl = draft.imageUrls[c];
            console.log(
              `[Threads] Creating carousel item ${c + 1}/${draft.imageUrls.length}...`
            );
            const itemRes = await axios.post(
              `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
              null,
              {
                params: {
                  media_type: "IMAGE",
                  image_url: imgUrl,
                  is_carousel_item: true,
                  access_token: process.env.THREADS_TOKEN,
                },
              }
            );
            childContainerIds.push(itemRes.data.id);
            await sleep(600);
          }

          // Poll all child items
          for (const childId of childContainerIds) {
            await waitForContainerFinished(childId, 8, 1500);
          }

          // Create Parent Carousel Container
          console.log("[Threads] Creating parent carousel container...");
          const carouselRes = await axios.post(
            `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
            null,
            {
              params: {
                media_type: "CAROUSEL",
                children: childContainerIds.join(","),
                text: part3.text,
                reply_to_id: part2PostId,
                access_token: process.env.THREADS_TOKEN,
              },
            }
          );
          const carouselContainerId = carouselRes.data.id;
          await waitForContainerFinished(carouselContainerId, 8, 1500);
          part3PostId = await publishContainerWithRetry(carouselContainerId, 5, 2000);
        } else if (draft.imageUrls && draft.imageUrls.length === 1) {
          // B. SINGLE IMAGE
          console.log("[Threads] Creating single image container...");
          const singleRes = await axios.post(
            `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
            null,
            {
              params: {
                media_type: "IMAGE",
                image_url: draft.imageUrls[0],
                text: part3.text,
                reply_to_id: part2PostId,
                access_token: process.env.THREADS_TOKEN,
              },
            }
          );
          const singleContainerId = singleRes.data.id;
          await waitForContainerFinished(singleContainerId, 8, 1500);
          part3PostId = await publishContainerWithRetry(singleContainerId, 5, 2000);
        } else {
          // C. TEXT ONLY
          console.log("[Threads] Creating text-only container for Part 3...");
          const textRes = await axios.post(
            `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads`,
            null,
            {
              params: {
                media_type: "TEXT",
                text: part3.text,
                reply_to_id: part2PostId,
                access_token: process.env.THREADS_TOKEN,
              },
            }
          );
          const textContainerId = textRes.data.id;
          await waitForContainerFinished(textContainerId, 8, 1500);
          part3PostId = await publishContainerWithRetry(textContainerId, 5, 2000);
        }

        console.log(`[Threads] Part 3 Published! ID: ${part3PostId}`);

        updatedThreads.push({
          ...part3,
          threadsPostId: part3PostId,
        });

        // ----------------------------------------------------
        // 4. UPDATE FIRESTORE AND NOTIFY TELEGRAM
        // ----------------------------------------------------
        await docRef.update({
          status: "published",
          rootPostId: rootPostId,
          threads: updatedThreads,
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `🎉 *Thread Affiliate Berhasil Di-Upload ke Threads!*\n\n🛍️ *Produk:* ${draft.productName}\n🏷️ *Kategori:* ${draft.category}\n🔗 *Root Post ID:* \`${rootPostId}\`\n🖼️ *Media:* ${imageInfo}\n\nSemua 3 part berhasil di-chain berurutan! 🚀`,
          parse_mode: "Markdown",
        });
      } catch (error) {
        const errorDetails = error.response
          ? JSON.stringify(error.response.data)
          : error.message;
        console.error("[Threads Affiliate Upload Error]:", errorDetails);

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
