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

## 📚 Dokumentasi Lengkap

Dokumentasi proyek ini dikelola secara rapi di dalam folder [`docs/`](./docs/):

* 📖 [**Panduan Penggunaan & Setup (docs/README.md)**](./docs/README.md)  
  *Panduan instalasi, konfigurasi environment variables, menjalankan lokal, dan panduan fitur bot.*
* 🏗️ [**Arsitektur dan Alur Teknis (docs/arsitektur-dan-flow-teknis.md)**](./docs/arsitektur-dan-flow-teknis.md)  
  *Penjelasan mendalam mengenai arsitektur sistem, diagram alur (sequence diagram), media group buffering, penanganan error, polling container Meta Threads, dan skema database Firestore.*

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Konfigurasi Environment Variables
Salin konfigurasi berikut ke file `.env` di root direktori:
```env
PORT=3000
TELEGRAM_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
THREADS_TOKEN=your_threads_long_lived_user_access_token
THREADS_USER_ID=your_threads_numeric_user_id
FIREBASE_PROJECT_ID=your_firebase_project_id
```

### 3. Jalankan Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

---

## 🏛️ Arsitektur Singkat

```text
[ Telegram User ] ──▶ [ Telegram Webhook ] ──▶ [ Express.js Server ]
                                                      │
         ┌────────────────────────────────────────────┼───────────────────────────┐
         ▼                                            ▼                           ▼
[ MediaGroup Buffer ]                        [ Gemini 2.5 Flash ]        [ Cloud Firestore ]
(Koleksi 1-10 Foto)                          (3-Part Copywriting)        (Draft State & Logs)
         │                                            │                           │
         └────────────────────────────────────────────┼───────────────────────────┘
                                                      ▼
                                      [ Telegram Interactive UI ]
                                      (Pilih Topic & Klik Approve)
                                                      │
                                                      ▼
                                       [ Meta Threads Graph API ]
                                       Part 1 (Hook + Topic Tag)
                                                    ↓
                                       Part 2 (Main Content Reply)
                                                    ↓
                                       Part 3 (CTA & Carousel Media)
```

---

## 📄 Lisensi

Distributed under the MIT License.
