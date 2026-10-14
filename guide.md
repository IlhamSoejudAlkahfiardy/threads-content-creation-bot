# 🚀 Panduan Lengkap Pengembangan: Threads Tech Content Automation Bot

Dokumentasi ini disusun sebagai panduan komprehensif bagi developer yang ingin membangun, mengembangkan, atau mengoperasikan sistem otomasi konten **Meta Threads** berbasis **Google Gemini AI** dan **Telegram Bot**.

---

## 📑 Daftar Isi

1. [Ringkasan & Filosofi Proyek](#1-ringkasan--filosofi-proyek)
2. [Konsep & Persona Konten](#2-konsep--persona-konten)
3. [Arsitektur Sistem & Alur Kerja (End-to-End)](#3-arsitektur-sistem--alur-kerja-end-to-end)
4. [Teknologi & Dependensi](#4-teknologi--dependensi)
5. [Struktur Direktori & Modul](#5-struktur-direktori--modul)
6. [Panduan Instalasi & Setup Lokal](#6-panduan-instalasi--setup-lokal)
7. [Panduan Deployment ke VPS Cloud (Produksi)](#7-panduan-deployment-ke-vps-cloud-produksi)
8. [Pelajaran Teknis & Troubleshooting (Gotchas)](#8-pelajaran-teknis--troubleshooting-gotchas)

---

## 1. Ringkasan & Filosofi Proyek

### 1.1 Apa Itu Proyek Ini?
**Threads Tech Content Automation Bot** adalah asisten AI pribadi (*personal branding engine*) yang memungkinkan kreator/developer membuat utas (*threads*) berkualitas tinggi di **Meta Threads** hanya dengan mengirimkan ide singkat atau link artikel berita melalui **Telegram Bot**.

### 1.2 Latar Belakang & Alasan Pivot
Awalnya bot ini dirancang untuk otomasi **Affiliate Marketing** (ulasan produk e-commerce + link beli). Namun dari pengujian 1 bulan didapatkan evaluasi kritis:
- **Algoritma Meta Threads membatasi jangkauan tautan luar (*outbound link*):** Postingan yang berisi link belanja dan hard-selling cenderung di-deprioritaskan (*low views*).
- **Karakter Audiens Threads:** Pengguna Threads lebih menyukai konten **opini, edukasi teknis, debat sehat, tips praktis, dan humor/relatable developer**.
- **Keputusan:** Proyek beralih fokus menjadi **Mesin Personal Branding Tech Creator** yang memicu *engagement* organik (komentar, *quotes*, dan *reposts*).

---

## 2. Konsep & Persona Konten

### 2.1 Persona: "Casual Tech-Bro tapi Edukatif"
- **Gaya Bahasa:** Santai ala forum koding (Twitter/Threads tech community), menggunakan istilah teknis yang tepat (campuran santai bahasa Indonesia & istilah programming bahasa Inggris wajar: *deploy, production, trade-off, tech debt, boilerplate*).
- **Anti Basa-Basi:** Menghindari pembuka formal korporat (*"Halo teman-teman...", "Pernahkah kalian berpikir..."*). Langsung menghantam ke inti pemikiran (*hook*).
- **Wajib CTA Diskusi:** Part terakhir **wajib** memuat pertanyaan pemantik interaksi (contoh: *"Menurut kalian gimana?", "Ada yang pernah ngalamin juga?", "Setuju ga sama opini gua?"*).

### 2.2 4 Preset Mode Konten
| Mode | Kode | Karakter Output |
| :--- | :--- | :--- |
| 🔥 **Hot Take / Opini** | `hottake` | Opini tajam, sudut pandang berani/kritis terhadap tren teknologi untuk memancing perdebatan sehat di kolom komentar. |
| 🧠 **Deep Dive / Edukasi** | `deepdive` | Analisis teknis mendalam, perbandingan A vs B (Pro & Cons), bedah arsitektur dan trade-offs. |
| 🛠️ **Tips & Tricks** | `tips` | Langkah praktis, checklist optimasi koding, best practice, atau rekomendasi tool dev. |
| 😂 **Jokes / Relatable IT** | `joke` | Humor seputar dinamika kerja dev, debugging hari Jumat sore, PR review, atau bug production. |

### 2.3 Batasan Spesifikasi Utas
- **Panjang Utas Dinamis:** AI secara otomatis menentukan jumlah part yang optimal (**2 sampai 7 part**) sesuai kedalaman topik.
- **Limit Karakter:** Wajib **< 500 karakter per part** (sesuai batasan resmi Meta Threads).
- **Tanpa Hashtag:** Dilarang menggunakan tagar (`#`) karena terlihat *spammy* di algoritma Threads modern.

---

## 3. Arsitektur Sistem & Alur Kerja (End-to-End)

Sistem menggunakan arsitektur **Event-Driven Webhook**:

```text
[ USER INPUT (Telegram) ]
  ├── A. Teks Ide Bebas (misal: "Kenapa microservices sering gagal di startup")
  ├── B. Link Berita IT (misal: "https://techcrunch.com/...")
  └── C. Lampiran Gambar (Meme, screenshot kode, diagram)
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
          [ SIMPAN PENDING SESSION (In-Memory) ]
                    │
                    ▼
       [ TELEGRAM: KIRIM PILIHAN MODE ]
       "💡 Ide/Link diterima! Mau dibikin dengan gaya apa?"
       [ 🔥 Hot Take ]      [ 🧠 Deep Dive ]
       [ 🛠️ Tips & Tricks ]  [ 😂 Jokes/Meme ]
                    │
                    ▼ (User klik tombol)
       [ TELEGRAM CALLBACK QUERY ]
                    │
                    ▼
       [ CONTENT EXTRACTION & GENERATOR ]
       1. Jika ada URL ➔ Ekstrak intisari artikel (urlScraper.js)
       2. Panggil Gemini dengan Cascading Fallback & Auto-Retry
       3. Generate Utas Terstruktur JSON (2 s/d 7 part)
                    │
                    ▼
          [ PERSISTENSI DRAFT ]
          (Firestore dengan Fallback In-Memory Otomatis)
                    │
                    ▼
          [ PREVIEW DRAFT DI TELEGRAM ]
          Preview tiap part + tombol:
          [ 🏷️ Pilih Topik Komunitas ]
          [ ✅ Approve & Publish ]  [ ❌ Reject ]
                    │
                    ▼ (User klik Approve)
          [ THREADS PUBLISHING SERVICE ]
          1. Upload Part 1 (Hook + Gambar jika ada) ➔ Root Post
          2. Loop Part 2..N secara berantai (Cascaded replies)
          3. Kirim laporan sukses + Root Post ID ke Telegram
```

---

## 4. Teknologi & Dependensi

| Layer | Teknologi | Alasan Pemilihan |
| :--- | :--- | :--- |
| **Runtime & API** | Node.js (v18+) & Express.js | Ringan, cepat, arsitektur event-loop cocok untuk I/O webhook. |
| **Generative AI** | `@google/genai` (Gemini 2.0 / 2.5 Flash) | Response time sangat cepat (~2-5 detik), murah, mendukung native Structured Output JSON Schema. |
| **Database** | Google Cloud Firestore & In-Memory Store | NoSQL fleksibel untuk draft & audit status + fallback memori lokal anti-down. |
| **User Interface** | Telegram Bot API | Antarmuka instan tanpa perlu bikin aplikasi frontend terpisah. |
| **Target Platform** | Meta Threads Graph API (`v1.0`) | Endpoint resmi publikasi container media & text reply. |
| **Reverse Proxy** | Nginx | Terminasi SSL HTTPS (wajib untuk webhook Telegram) & reverse proxy ke port Node.js. |
| **Process Manager** | PM2 | Background daemon process, auto-restart jika crash, dan cluster management. |
| **CI/CD** | GitHub Actions | Otomasi deploy (pull + reload) ke VPS saat push ke branch `main`. |

---

## 5. Struktur Direktori & Modul

```text
threads-bot/
├── .github/workflows/
│   └── deploy.yml              # Otomasi SSH & PM2 reload ke VPS
├── src/
│   ├── config/
│   │   ├── env.js              # Sentralisasi environment variables
│   │   ├── firebase.js         # Inisialisasi Firestore (ADC & Cert detector)
│   │   ├── gemini.js           # Inisialisasi Google Gen AI SDK
│   │   └── topics.js           # Daftar komunitas tech Threads (tag slug)
│   ├── controllers/
│   │   └── webhookController.js# Router webhook Telegram & event callback
│   ├── prompts/
│   │   └── techContentPrompt.js# System instruction, 4 preset modes, & JSON Schema
│   ├── services/
│   │   ├── draftService.js     # State draft (Firestore + resilient memory fallback)
│   │   ├── geminiService.js    # AI engine dengan multi-model fallback & retry
│   │   ├── telegramService.js  # Pengirim pesan, keyboard inline, & CDN Telegram
│   │   └── threadsService.js   # Dynamic chained publisher ke Meta Threads API
│   └── utils/
│       ├── logger.js           # Logger terpusat (WIB Timezone)
│       ├── mediaGroupBuffer.js # Buffer album foto Telegram (debounce 1s)
│       ├── sleep.js            # Asynchronous delay helper
│       └── urlScraper.js       # Pembersih & ekstraktor teks artikel dari URL
├── index.js                    # Entry point Express.js server
├── package.json                # Dependensi proyek
├── test-prompt.js              # Script CLI untuk uji coba AI langsung di terminal
├── PRD.md                      # Product Requirement Document
├── IMPLEMENTATION_PLAN.md      # Detail arsitektur teknis & checklist
└── guide.md                    # Dokumentasi ini
```

---

## 6. Panduan Instalasi & Setup Lokal

### 6.1 Prasyarat
- **Node.js** versi 18+ terpasang di komputer.
- **Akun Google AI Studio** untuk mendapatkan `GEMINI_API_KEY`.
- **Bot Telegram** dari [@BotFather](https://t.me/BotFather) untuk mendapatkan `TELEGRAM_TOKEN`.
- **Meta Developer App** untuk mendapatkan `THREADS_TOKEN` dan `THREADS_USER_ID`.
- **ngrok** untuk tunneling port lokal ke HTTPS publik.

### 6.2 Langkah Instalasi
1. Clone repository:
   ```bash
   git clone https://github.com/IlhamSoejudAlkahfiardy/threads-content-creation-bot.git
   cd threads-content-creation-bot
   ```
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Buat file `.env` di root proyek:
   ```env
   PORT=3000
   TELEGRAM_TOKEN=your_telegram_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   THREADS_TOKEN=your_meta_threads_user_token
   THREADS_USER_ID=me
   FIREBASE_PROJECT_ID=your_firebase_project_id
   ```
4. Jalankan server lokal:
   ```bash
   npm run dev
   ```
5. Di terminal lain, buka tunnel ngrok:
   ```bash
   ngrok http 3000
   ```
6. Daftarkan URL ngrok ke Telegram Webhook (buka di browser):
   ```text
   https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=https://<NGROK_SUBDOMAIN>.ngrok-free.app/webhook
   ```

---

## 7. Panduan Deployment ke VPS Cloud (Produksi)

### 7.1 Persiapan Server (Ubuntu 22.04 / 24.04 LTS)
1. Install Node.js, Nginx, Certbot, dan PM2 di VPS:
   ```bash
   sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   ```
2. Clone proyek ke folder `/var/www/threads-bot`:
   ```bash
   sudo git clone https://github.com/IlhamSoejudAlkahfiardy/threads-content-creation-bot.git /var/www/threads-bot
   cd /var/www/threads-bot
   sudo npm install --omit=dev
   ```
3. Siapkan file `.env` di dalam `/var/www/threads-bot/.env`.

### 7.2 Konfigurasi Nginx & SSL Certbot
1. Buat konfigurasi virtual host di `/etc/nginx/sites-available/threads-bot.conf`:
   ```nginx
   server {
       listen 80;
       server_name domain-anda.com;

       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
2. Aktifkan konfigurasi dan reload:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/threads-bot.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Pasang sertifikat SSL gratis via Let's Encrypt:
   ```bash
   sudo certbot --nginx -d domain-anda.com
   ```

### 7.3 Jalankan Aplikasi dengan PM2
```bash
cd /var/www/threads-bot
pm2 start index.js --name "threads-bot"
pm2 save
pm2 startup
```

### 7.4 Daftarkan Webhook Produksi ke Telegram
Buka link berikut di browser:
```text
https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=https://domain-anda.com/webhook
```
Pastikan respons browser adalah: `{"ok":true,"result":true,"description":"Webhook was set"}`.

---

## 8. Pelajaran Teknis & Troubleshooting (Gotchas)

Bagian ini merangkum *insight* nyata dan kendala yang ditemukan selama pengembangan agar tidak terulang:

### 1. Penanganan Lonjakan Server Gemini (Error `503 Service Unavailable`)
- **Kendala:** Model preview terbaru (`gemini-2.5-flash`) sering mengalami *high-demand spikes* sesaat secara global.
- **Solusi:** 
  1. Buat **Cascading Multi-Model Fallback**: Jika `gemini-2.0-flash` sibuk, otomatis alihkan ke `gemini-2.5-flash`, lalu ke `gemini-2.0-flash-lite`.
  2. Tambahkan jeda waktu otomatis (*transient sleep 1.5 detik*) sebelum melempar error.

### 2. Penanganan Kredensial Database (Error `7 PERMISSION_DENIED`)
- **Kendala:** Di laptop lokal, `firebase-admin` membutuhkan file `serviceAccountKey.json`. Jika file ini belum ada, aplikasi akan crash saat menyimpan draft.
- **Solusi:** Modul `draftService.js` dilengkapi **Resilient In-Memory Fallback**. Jika Firestore gagal diakses, draf otomatis dialihkan ke memori RAM lokal tanpa memutus alur approval Telegram.

### 3. Parsing Callback Query Data Telegram (Bug `split("_")`)
- **Kendala:** Penggunaan `callbackData.split("_")[1]` akan memotong ID draf jika ID tersebut mengandung tanda *underscore* (misal: `local_1791958813963_gv2d7` hanya terbaca `local`).
- **Solusi:** Gunakan selalu `.replace("approve_", "")` agar ID terbaca utuh hingga karakter terakhir.

### 4. Propagasi Asinkron Threads API (Error Subcode `4279009`)
- **Kendala:** Kontainer media Threads yang baru dibuat sering kali belum siap untuk dipublikasikan dalam hitungan milidetik berikutnya (*status: NOT_READY*).
- **Solusi:** Terapkan fungsi `waitForContainerFinished()` yang mem-polling status hingga bernilai `FINISHED`, disertai mekanisme *retry* dengan jeda 1.5–2 detik pada `publishContainerWithRetry()`.

### 5. Format Khusus Markdown Telegram
- **Kendala:** AI sering menyertakan karakter spesial Markdown (`_`, `*`, `[`, `]`) yang tidak berpasangan, menyebabkan Telegram menolak pesan (`400 Bad Request: can't parse entities`).
- **Solusi:** Fungsi `editMessageText` dan pengirim preview di `telegramService.js` dilengkapi *try-catch fallback*: jika parsing Markdown gagal, pesan otomatis dikirim ulang sebagai *plain-text* agar pengguna tetap menerima preview.

---

*Panduan ini dibuat agar dapat langsung digunakan oleh developer baru untuk memahami, menduplikasi, dan mengembangkan sistem otomasi Threads secara mandiri.*
