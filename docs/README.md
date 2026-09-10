# 🛍️ Threads Content Creation & Affiliate Bot

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Framework-Express.js-blue.svg?style=flat-square&logo=express)](https://expressjs.com/)
[![Gemini 2.5 Flash](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-orange.svg?style=flat-square&logo=google)](https://ai.google.dev/)
[![Firebase Firestore](https://img.shields.io/badge/Database-Cloud%20Firestore-yellow.svg?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![Meta Threads API](https://img.shields.io/badge/Platform-Meta%20Threads%20API-black.svg?style=flat-square&logo=threads)](https://developers.facebook.com/docs/threads/)
[![Telegram Bot](https://img.shields.io/badge/Interface-Telegram%20Bot%20API-blue.svg?style=flat-square&logo=telegram)](https://core.telegram.org/bots/api)

> **Universal Social Commerce & Affiliate Automation Bot untuk Meta Threads.**  
> Mengubah brief produk sederhana atau album foto menjadi **3-Part Thread Threads** berkonversi tinggi secara otomatis menggunakan **Google Gemini 2.5 Flash**, lengkap dengan pemilihan **Komunitas/Topic**, media carousel slider, dan alur approval interaktif melalui **Telegram**.

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Arsitektur Singkat](#-arsitektur-singkat)
- [Teknologi yang Digunakan](#-teknologi-yang-digunakan)
- [Prasyarat & Persiapan](#-prasyarat--persiapan)
- [Konfigurasi Environment Variables](#-konfigurasi-environment-variables)
- [Panduan Instalasi & Menjalankan Lokal](#-panduan-instalasi--menjalankan-lokal)
- [Panduan Penggunaan Bot (User Guide)](#-panduan-penggunaan-bot-user-guide)
- [Struktur Direktori](#-struktur-direktori)
- [Dokumentasi Lanjutan](#-dokumentasi-lanjutan)

---

## ✨ Fitur Utama

1. **Universal Affiliate Copywriting (Gemini 2.5 Flash)**
   - Menghasilkan 3 bagian thread berurutan yang saling terkait (*chained*):
     - **Part 1 (Hook / Pancingan):** Menangkap perhatian audiens lewat keresahan sehari-hari (*pain point*) tanpa *hard-selling*.
     - **Part 2 (Main Content):** Mengulas produk sebagai solusi nyata, menonjolkan fitur unggulan, dan alasan *worth it*.
     - **Part 3 (CTA, Links & Media):** Ajakan bertindak persuasif, link pembelian (Shopee, Tokopedia, TikTok Shop), serta lampiran gambar.
   - Batasan karakter ketat ($\le 500$ karakter per part) sesuai spesifikasi Meta Threads.

2. **Dukungan Media Cerdas & Carousel Slider**
   - Mendukung input teks saja, foto tunggal, maupun **album banyak foto** (media group).
   - Buffer album otomatis menggabungkan hingga 10 foto menjadi **Carousel Container Slider** di Threads Part 3.

3. **Pemilihan Komunitas & Topic Interaktif (Model B)**
   - Menyediakan pilihan topik/komunitas populer Threads langsung dari Telegram (misal: `💻 Tech Threads`, `🤖 AI Threads`, `🛍️ Racun Shopee`, `👗 Fashion Threads`, dll).
   - Format slug otomatis divalidasi dan disematkan via parameter resmi `topic_tag` pada root post Threads.
   - Opsi fleksibel: pengguna dapat memilih komunitas, menggantinya, atau memilih *Tanpa Topic*.

4. **Sistem Preview & Approval Interaktif di Telegram**
   - Hasil racikan AI dikirim ke Telegram untuk di-review terlebih dahulu.
   - Tombol interaktif menggunakan `editMessageText` & `editMessageReplyMarkup` sehingga tidak ada *spam* pesan baru.
   - Upload ke Threads hanya dilakukan setelah pengguna menekan tombol **✅ Approve & Upload to Threads**.

5. **Sistem Logging Terpusat & Real-Time**
   - Seluruh aktivitas server (HTTP request, webhook Telegram, respons Gemini AI, status Firestore, dan polling container Meta Threads) dicatat dengan rapi menggunakan format waktu Indonesia (`Asia/Jakarta`).

---

## 🏛️ Arsitektur Singkat

```
[ Pengguna Telegram ]
       │ (Kirim teks / album foto)
       ▼
[ Telegram Bot Webhook ] ──▶ [ Express.js API Gateway ]
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   [ Media Group Buffer ]     [ Gemini 2.5 Flash ]       [ Cloud Firestore ]
   (Koleksi 1-10 foto)        (Generate 3-Part Thread)   (Simpan Draft & Status)
            │                          │                          │
            └──────────────────────────┼──────────────────────────┘
                                       ▼
                     [ Telegram Preview & Approval ]
                     (Pilih Topic & Klik Approve)
                                       │
                                       ▼
                     [ Meta Threads Graph API v1.0 ]
                     Part 1 (Root Post + Topic Tag)
                                   ↓
                     Part 2 (Reply to Part 1)
                                   ↓
                     Part 3 (Reply to Part 2 + Carousel Media)
```

---

## 🛠️ Teknologi yang Digunakan

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Runtime & Server** | Node.js (v18+) & Express.js | REST API & Webhook handler |
| **Artificial Intelligence** | Google Gemini 2.5 Flash (`@google/genai`) | Natural Language Generation terstruktur (JSON Schema) |
| **Database** | Google Cloud Firestore (Firebase Admin) | State management draft, riwayat publish, & logging status |
| **User Interface** | Telegram Bot API | Webhook events, inline keyboards, & CDN file fetcher |
| **Social Media Target** | Meta Threads Graph API (`v1.0`) | Media container creation, status polling, & chained publishing |
| **Process Manager** | PM2 | Daemon process & cluster management di server production |
| **CI/CD Deployment** | GitHub Actions | Otomasi pull dan reload service ke GCP VPS saat push ke `main` |

---

## 📋 Prasyarat & Persiapan

Sebelum menjalankan aplikasi, pastikan Anda telah memiliki:
1. **Node.js** versi 18 atau lebih baru.
2. Akun **Google AI Studio** untuk mendapatkan `GEMINI_API_KEY`.
3. Bot Telegram dari [@BotFather](https://t.me/BotFather) untuk mendapatkan `TELEGRAM_TOKEN`.
4. Akun **Meta Developer** dengan aplikasi Threads API aktif untuk mendapatkan `THREADS_TOKEN` dan `THREADS_USER_ID`.
5. Proyek **Firebase Firestore** aktif dengan file kredensial service account (`serviceAccountKey.json`).

---

## ⚙️ Konfigurasi Environment Variables

Buat file `.env` di root direktori project berdasarkan format berikut:

```env
# Server Port
PORT=3000

# Telegram Bot
TELEGRAM_TOKEN=your_telegram_bot_token_here

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here

# Meta Threads API
THREADS_TOKEN=your_threads_long_lived_user_access_token_here
THREADS_USER_ID=your_threads_numeric_user_id_here

# Firebase Firestore
FIREBASE_PROJECT_ID=your_firebase_project_id_here
# Letakkan file serviceAccountKey.json di root atau src/config/ sesuai inisialisasi firebase.js
```

---

## 🚀 Panduan Instalasi & Menjalankan Lokal

### 1. Clone Repository
```bash
git clone https://github.com/IlhamSoejudAlkahfiardy/threads-content-creation-bot.git
cd threads-content-creation-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Jalankan Server Lokal
```bash
# Mode development (nodemon)
npm run dev

# Mode production
npm start
```

### 4. Hubungkan Webhook Telegram (Lokal Testing)
Gunakan tunneling seperti **ngrok** untuk mengekspos port lokal ke publik:
```bash
ngrok http 3000
```
Lalu set webhook Telegram ke URL ngrok Anda:
```bash
curl -F "url=https://<YOUR_NGROK_SUBDOMAIN>.ngrok-free.app/webhook" https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook
```

---

## 📱 Panduan Penggunaan Bot (User Guide)

1. Buka bot Anda di Telegram.
2. Kirimkan pesan berisi **deskripsi produk, keunggulan, dan link affiliate** (bisa disertai 1 atau beberapa foto produk sekaligus).
3. Bot akan membalas: `⏳ Meracik 3-part thread affiliate dengan Gemini AI...`.
4. Beberapa detik kemudian, bot menampilkan **Draft Preview** lengkap dengan 3 bagian thread.
5. **Pilih Komunitas / Topic (Opsional):**
   - Klik tombol **`🏷️ Pilih Community / Topic`**.
   - Pilih salah satu komunitas dari menu 2 kolom (misal: `💻 Tech Threads`).
   - Tampilan pesan akan langsung ter-update dengan label topik tersebut.
6. **Upload ke Threads:**
   - Klik tombol **`✅ Approve & Upload to Threads`**.
   - Bot akan memproses pengunggahan berantai ke Threads dan mengirimkan pesan konfirmasi beserta Root Post ID.

---

## 📂 Struktur Direktori

```text
threads-bot/
├── docs/                                  # Dokumentasi teknis lengkap
│   ├── README.md                          # Penjelasan general aplikasi (file ini)
│   └── arsitektur-dan-flow-teknis.md      # Rincian arsitektur & flow teknis end-to-end
├── src/
│   ├── config/                            # Konfigurasi sistem
│   │   ├── env.js                         # Wrapper environment variables
│   │   ├── firebase.js                    # Inisialisasi Firestore DB
│   │   ├── gemini.js                      # Inisialisasi Google Gen AI SDK
│   │   └── topics.js                      # Master data komunitas & topik Threads
│   ├── controllers/                       # Request handlers
│   │   └── webhookController.js           # Telegram webhook router & callback orchestrator
│   ├── prompts/                           # Prompt Engineering
│   │   └── affiliatePrompt.js             # Formula 3-part thread & JSON Schema Gemini
│   ├── services/                          # Business logic layer
│   │   ├── draftService.js                # Operasi database Firestore (CRUD draft)
│   │   ├── geminiService.js               # Komunikasi & parsing Gemini 2.5 Flash
│   │   ├── telegramService.js             # Telegram API (pesan, markup keyboard, CDN)
│   │   └── threadsService.js              # Meta Threads Graph API upload chain
│   └── utils/                             # Utility & helper functions
│       ├── logger.js                      # Centralized logger dengan timezone WIB
│       ├── mediaGroupBuffer.js            # Buffer pengumpul album foto Telegram
│       └── sleep.js                       # Asynchronous delay helper
├── .github/
│   └── workflows/
│       └── deploy.yml                     # Auto-deploy workflow ke GCP VPS
├── index.js                               # Entry point aplikasi Express.js
├── package.json                           # Manifest project & dependencies
└── test-prompt.js                         # CLI scratch script untuk menguji prompt AI
```

---

## 📖 Dokumentasi Lanjutan

Untuk penjelasan mendalam tentang alur data, diagram urutan (*sequence diagram*), penanganan error, polling container, dan arsitektur database, silakan baca:
👉 [**Dokumentasi Arsitektur dan Flow Teknis**](./arsitektur-dan-flow-teknis.md)
