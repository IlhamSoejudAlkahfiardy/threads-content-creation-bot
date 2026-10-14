# 🏗️ Technical Implementation Plan
# Threads Tech Content Automation Bot (Personal Branding)

> **Status:** Implemented (Ready for Testing)  
> **Tanggal:** 14 Oktober 2026  
> **Referensi PRD:** [`PRD.md`](file:///d:/DOT%20Indonesia/Project/threads-bot/PRD.md)  
> **Scope:** Transformasi sistem dari Affiliate Bot menjadi Tech Content Generator untuk Personal Branding di Meta Threads.

---

## 1. Ringkasan Arsitektur & Alur Kerja

Sistem ini mentransformasi input sederhana dari Telegram (ide teks bebas atau link artikel berita IT) menjadi rangkaian utas (*threads*) berkualitas tinggi, engaging, berbobot edukatif, dan diakhiri dengan Call to Action (CTA) diskusi di Meta Threads.

### 1.1 Diagram Alur Kerja (Option C: Hybrid Flow)

```text
[ USER INPUT (Telegram) ]
  ├── 1. Free Text / Ide Topik (misal: "Pro cons AI subscription vs provider API")
  ├── 2. Kirim Link Berita IT (misal: "https://techcrunch.com/...")
  └── 3. Gambar Lampiran (Opsional: meme / screenshot / diagram)
              │
              ▼
   [ WEBHOOK CONTROLLER ]
              │
       Apakah menggunakan
       Shortcut Command?
       (/hottake, /deepdive, /tips, /joke)
              ├── YA ───▶ [ Langsung Proses dengan Mode Terpilih ]
              │
              └── TIDAK
                    │
                    ▼
          [ SIMPAN PENDING CONTEXT ]
                    │
                    ▼
       [ TELEGRAM: KIRIM PILIHAN MODE ]
       "💡 Ide/Link diterima! Mau dibikin dengan gaya apa?"
       [ 🔥 Hot Take ]      [ 🧠 Deep Dive ]
       [ 🛠️ Tips & Tricks ]  [ 😂 Jokes/Meme ]
                    │
                    ▼ (User klik tombol mode)
       [ TELEGRAM CALLBACK QUERY ]
                    │
                    ▼
       [ EXTRACTOR / GEMINI GENERATOR ]
       1. Jika ada URL: Scrape / ambil ringkasan artikel
       2. Panggil Gemini 2.5 Flash dengan System Prompt Tech
       3. Generate Dynamic Utas (2 s/d 7 parts)
                    │
                    ▼
          [ SIMPAN DRAFT KE FIRESTORE ]
                    │
                    ▼
          [ PREVIEW DRAFT DI TELEGRAM ]
          Tampilkan teks per part + tombol:
          [ 🏷️ Pilih Topik Komunitas ]
          [ ✅ Approve & Publish ]  [ ❌ Reject ]
                    │
                    ▼ (User klik Approve)
          [ THREADS PUBLISHING SERVICE ]
          1. Post Part 1 (Hook + Gambar jika ada) ➔ Root Post
          2. Post Part 2..N secara berantai (Chained replies)
          3. Kirim konfirmasi berhasil + link ke Telegram
```

---

## 2. Rincian Perubahan File (File-by-File Changes)

### 2.1 File Baru: `src/prompts/techContentPrompt.js`
Menggantikan peran `affiliatePrompt.js`. Menyediakan instruksi persona, aturan penulisan, dan spesifikasi 4 preset mode.

* **Persona Utama:** *Casual Tech-Bro tapi Edukatif* (mix bahasa Indonesia santai, tech terms bilingual wajar, tidak kaku, tanpa basa-basi korporat).
* **Hard Constraints:**
  1. Maksimal **500 karakter per part** (termasuk spasi, emoji, dan enter).
  2. Jumlah part **dinamis (2 s/d 7 part)** disesuaikan dengan kedalaman topik.
  3. Dilarang keras menggunakan hashtag (`#`).
  4. Part terakhir **wajib memuat CTA Diskusi** (contoh: *"Menurut kalian gimana?", "Ada yang pernah ngalamin juga?", "Setuju ga sama opini gua?"*).
  5. Jika input berupa link artikel, fokus pada intisari dan implikasi/opini, bukan sekadar copas berita.

* **4 Preset Modes Definition:**
  * `hottake`: Opini tajam, kontroversial terukur, memancing perdebatan sehat di kolom komentar.
  * `deepdive`: Analisis terstruktur, perbandingan A vs B, breakdown arsitektur atau teknis.
  * `tips`: Praktis, to-the-point, bullet points jelas, action-oriented.
  * `joke`: Relatable dev humor, situasi kantor IT, debugging pain, ironi industri teknologi.

* **Response JSON Schema (Gemini Structured Output):**
  ```json
  {
    "topicTitle": "Pro & Cons Langganan AI vs API Provider",
    "mode": "deepdive",
    "threads": [
      {
        "part": 1,
        "text": "Tiap bulan bayar $20 buat ChatGPT Plus, tapi pas butuh otomatisasi malah bingung...",
        "type": "hook"
      },
      {
        "part": 2,
        "text": "Bedanya simple:\n- Subscription: Cocok buat casual chat...\n- API Provider: Bayar sesuai token...",
        "type": "body"
      },
      {
        "part": 3,
        "text": "Kalau lu lebih banyak pake AI buat riset harian atau udah mulai build tools sendiri? Cerita di bawah!",
        "type": "cta"
      }
    ]
  }
  ```

---

### 2.2 File Baru: `src/utils/urlScraper.js`
Helper ringan untuk mendeteksi dan mengekstrak konten teks dari URL artikel jika user mengirimkan link berita.

* **Dependensi:** `axios` + parser teks ringan (mengabaikan tag skrip, css, nav, footer).
* **Fungsi:**
  * `extractUrl(text)`: Mengambil URL pertama dari string teks.
  * `fetchArticleContent(url)`: Mengambil judul dan teks paragraf artikel (dibatasi max 3000 karakter agar hemat token Gemini).

---

### 2.3 Modifikasi: `src/config/topics.js`
Mengganti topik e-commerce dengan komunitas topik IT yang relevan di Meta Threads:

```javascript
const TOPICS = [
  { id: "tech", label: "💻 Tech Threads", tag: "techthreads" },
  { id: "ai", label: "🤖 AI Threads", tag: "aithreads" },
  { id: "dev", label: "👨‍💻 Developer Life", tag: "developerthreads" },
  { id: "webdev", label: "🌐 Web Dev", tag: "webdev" },
  { id: "devops", label: "☁️ DevOps & Cloud", tag: "devops" },
  { id: "career", label: "🚀 Tech Career", tag: "techcareer" },
];
```

---

### 2.4 Modifikasi: `src/services/geminiService.js`
* Mengganti fungsi `generateAffiliateThreads` dengan:
  ```javascript
  async function generateTechThreads({ topicText, mode, articleContent = null, imageUrls = [] })
  ```
* Mengintegrasikan `src/prompts/techContentPrompt.js`.
* Menambahkan validasi ketat terhadap panjang karakter tiap part (< 500 karakter). Jika melebihi batas, lakukan auto-trim atau re-prompt fallback.

---

### 2.5 Modifikasi: `src/services/draftService.js`
Menyesuaikan skema penyimpanan draft di collection `drafts` Firestore:

```javascript
const draftData = {
  topicTitle,        // Judul topik / ide
  mode,              // "hottake" | "deepdive" | "tips" | "joke"
  sourceUrl,         // URL artikel jika ada (opsional)
  imageUrls,         // Gambar yang dikirim user (passthrough)
  threads,           // Array [{ part, text, type, threadsPostId }]
  status: "pending", // "pending" | "publishing" | "published" | "rejected"
  topicTag: null,    // Tag Threads API
  topicLabel: null,
  rootPostId: "",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
};
```

---

### 2.6 Modifikasi: `src/services/telegramService.js`
* **Menambahkan fungsi `sendModeSelection(chatId, pendingSessionId, previewText)`:**
  Mengirim pesan sambutan dengan 4 tombol inline:
  ```text
  Inline Keyboard:
  [ 🔥 Hot Take ] [ 🧠 Deep Dive ]
  [ 🛠️ Tips & Tricks ] [ 😂 Jokes/Meme ]
  ```
  Callback data format: `mode:{modeType}:{sessionId}`
* **Memperbarui `formatDraftPreview(draft)`:**
  Membuat preview dinamis untuk N-part utas:
  ```text
  🧵 PREVIEW THREAD: [Topic Title]
  Mode: 🧠 Deep Dive
  ----------------------------------------
  [Part 1 / 3] (Hook)
  ...teks part 1...
  
  [Part 2 / 3]
  ...teks part 2...
  
  [Part 3 / 3] (CTA)
  ...teks part 3...
  ----------------------------------------
  Total Parts: 3 | Foto terlampir: 1
  ```
* Mempertahankan tombol inline: `[ 🏷️ Pilih Topik ]`, `[ ✅ Approve & Publish ]`, `[ ❌ Reject ]`.

---

### 2.7 Modifikasi: `src/controllers/webhookController.js`
Mengubah orkestrasi pemrosesan pesan masuk:

1. **Routing Command & Input Baru:**
   * Cek apakah ada shortcut command: `/hottake`, `/deepdive`, `/tips`, `/joke`.
     * Jika ada: Ambil teks setelah command ➔ langsung panggil generator AI dengan mode tersebut.
   * Jika teks biasa / link URL tanpa command:
     * Buat `pending_generation` session sementara di Firestore atau in-memory map.
     * Kirim tombol `sendModeSelection()`.
2. **Handling Callback Query `mode:*`:**
   * Ambil data sesi input (teks, link, gambar).
   * Panggil `generateTechThreads()`.
   * Simpan draft ke Firestore.
   * Kirim preview draft ke pengguna.
3. **Handling Approval `approve:*`:**
   * Panggil `threadsService.publishTechThread(draft)`.
   * Berikan respon link postingan Threads.

---

### 2.8 Modifikasi: `src/services/threadsService.js`
Mengubah fungsi `publishAffiliateThread` menjadi `publishTechThread(draft)`:

* **Mendukung N-Part Threads secara Dinamis:**
  * **Part 1 (Root Post):**
    * Jika ada gambar di `draft.imageUrls`, gunakan `media_type: "IMAGE"` dengan URL gambar pertama.
    * Jika tidak ada gambar, gunakan `media_type: "TEXT"`.
    * Buat container ➔ tunggu `waitForContainerFinished()` ➔ publish ➔ dapatkan `rootPostId`.
  * **Part 2 s/d N (Chained Replies):**
    * Looping dari indeks `1` sampai `draft.threads.length - 1`.
    * Setiap part diposting sebagai reply bertingkat:
      * `reply_to_id: previousPostId` (membuat struktur cascade berantai rapi di Threads).
      * `media_type: "TEXT"`.
    * Beri jeda antar post (`sleep(1500)`) untuk menghindari rate limit Threads API.
  * Simpan seluruh `threadsPostId` per part ke Firestore dan update status menjadi `published`.

---

## 3. Rencana Eksekusi Bertahap (Phased Roadmap)

### Fase 1: Content Engine & Prompting
- [x] Buat file `src/prompts/techContentPrompt.js` dengan instruksi 4 preset mode & CTA diskusi.
- [x] Update `src/config/topics.js` dengan kategori tech/developer.
- [x] Update `src/services/geminiService.js` untuk fungsi `generateTechThreads()`.
- [x] Buat file `src/utils/urlScraper.js` untuk parsing artikel berita.

### Fase 2: Data Schema & Telegram UI
- [x] Update `src/services/draftService.js` untuk skema draf tech content.
- [x] Update `src/services/telegramService.js`:
  - Implementasi `sendModeSelection()` (inline buttons 4 mode).
  - Update `formatDraftPreview()` untuk menampilkan N-part thread secara dinamis.

### Fase 3: Controller Orchestration (Hybrid Flow)
- [x] Update `src/controllers/webhookController.js`:
  - Tambahkan parser shortcut command (`/hottake`, `/deepdive`, `/tips`, `/joke`).
  - Tambahkan alur interaktif (tangkap teks/link ➔ kirim tombol mode).
  - Tambahkan handler callback query `mode:*` untuk memicu generate.

### Fase 4: Dynamic Threads Publishing
- [x] Refactor `src/services/threadsService.js` menjadi `publishTechThread(draft)` yang mendukung looping publikasi 2 s/d N part secara berantai.
- [x] Pastikan passthrough gambar pada Part 1 berjalan mulus jika user melampirkan gambar.

### Fase 5: Testing & Validasi
- [ ] Test input ide teks bebas ➔ pilih mode via tombol ➔ generate ➔ approve ➔ publish.
- [ ] Test shortcut command `/hottake [topik]` ➔ langsung generate ➔ approve ➔ publish.
- [ ] Test kirim link artikel berita IT ➔ rangkum jadi thread opini ➔ publish.
- [ ] Test kirim brief disertai gambar ➔ gambar terpasang di root post Part 1.
- [ ] Verifikasi panjang karakter tiap part selalu `< 500` karakter.

---

## 4. Status Multi-User SaaS & Monetisasi

Sesuai kesepakatan, seluruh arsitektur Multi-User SaaS, sistem voucher key (`/genkey`, `/redeem`), kuota kredit, dan integrasi Lynk.id **ditangguhkan (on-hold)**. 

File implementasi lama disimpan sebagai referensi riwayat. Sistem saat ini berjalan murni sebagai **Single-User / Personal Branding Engine** milik owner, sehingga tidak ada overhead kompleksitas pembayaran di fase awal ini.

---

*Silakan review dokumen ini. Jika sudah sesuai dan Anda beri approval, kita akan mulai eksekusi dari Fase 1.*
