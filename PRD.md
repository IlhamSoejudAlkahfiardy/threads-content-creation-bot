# 📄 Product Requirement Document (PRD)
# Threads Tech Content Automation Bot (Personal Branding)

> **Status:** Draft / Ready for Review  
> **Tanggal:** 14 Oktober 2026  
> **Target:** Personal Branding di Meta Threads  
> **Author:** Owner & AI Engineering Partner  

---

## 1. Executive Summary & Latar Belakang

### 1.1 Latar Belakang & Alasan Pivot
Sebelumnya, sistem ini dikembangkan sebagai bot otomatisasi konten **Affiliate Marketing** (input brief produk ➔ publish 3-part thread ulasan produk + link affiliate). 

Setelah masa pengujian selama 1 bulan, didapatkan hasil evaluasi:
- **Jangkauan Organik Rendah:** Algoritma Meta Threads secara agresif membatasi distribusi postingan yang memuat tautan luar (*outbound links*) dan *hard-selling*.
- **Konversi Rendah:** Postingan dengan views minim menghasilkan hampir nol konversi/penjualan.
- **Kesimpulan Bisnis:** Konsep affiliate belum siap untuk dipublikasikan atau dijual sebagai SaaS. 

### 1.2 Konsep Baru
Mengubah fokus sistem menjadi **Pabrik Konten IT/Teknologi Otomatis** untuk membangun **Personal Branding**. Bot akan mengubah ide singkat atau tautan artikel berita IT menjadi utas (thread) berbobot, engaging, dan memicu diskusi di komunitas tech Meta Threads.

---

## 2. Tujuan & Key Results (Objectives & OKRs)

* **Objective:** Membangun *authority* dan *engagement* tinggi di niche Tech/Software Engineering di Meta Threads secara konsisten tanpa *burnout*.
* **Key Results:**
  1. Waktu pembuatan 1 utas tech berkualitas berkurang dari ~30 menit menjadi < 2 menit.
  2. Meningkatkan rasio komentar/diskusi (*replies*) pada setiap thread yang dipublikasikan.
  3. Mempertahankan ritme posting harian (1–3 thread/hari) secara konsisten langsung dari Telegram.

---

## 3. Persona & Tone of Voice

* **Target Pembaca:** Software Engineers, Tech Enthusiasts, Mahasiswa IT, Startup Enthusiasts, dan Digital Workers.
* **Karakter Bahasa (*Voice*):**
  * **Casual Tech-Bro tapi Edukatif:** Gaya bahasa santai ala forum dev (Twitter/Threads tech community), menggunakan istilah teknis yang tepat (*mix* Indonesia-Inggris wajar), tidak kaku, tanpa basa-basi formalitas korporat, namun tetap berbobot dan bernilai daging.
* **Elemen Wajib di Akhir Utas:**
  * **Call to Action (CTA) Diskusi:** Wajib menyertakan pertanyaan pemantik interaksi di post terakhir (contoh: *"Menurut kalian gimana?", "Ada yang pernah ngalamin juga?", "Setuju ga sama opini gua?"*).

---

## 4. Fitur Utama & Kebutuhan Pengguna (User Requirements)

### 4.1 Input Handling yang Fleksibel (Opsi C: Hybrid)
Sistem mendukung 3 jenis input dari Telegram:
1. **Teks Ide Bebas:** Pengguna mengetikkan ide topik langsung (contoh: *"Bahas pro cons bayar subscription AI vs API per-token"*).
2. **Kirim Link Berita/Artikel IT:** Pengguna mengirimkan tautan artikel (TechCrunch, Hacker News, Medium, blog engineering). Bot mengambil ringkasan artikel dan meraciknya menjadi thread sudut pandang/opini.
3. **Lampiran Gambar (*Media Passthrough*):** Jika pengguna menyertakan gambar (diagram, meme, screenshot), gambar tersebut dilampirkan langsung pada post pertama (root post) tanpa dianalisis atau diedit oleh AI.

### 4.2 Preset Mode Konten
Tersedia 4 gaya konten utama yang dapat dipilih:
| Mode | Deskripsi | Contoh Output |
| :--- | :--- | :--- |
| 🔥 **Hot Take / Opini** | Opini berani/kritis terhadap tren teknologi untuk memantik debat sehat. | *"Microservices untuk tim di bawah 10 orang itu bukan arsitektur, itu bunuh diri perlahan..."* |
| 🧠 **Deep Dive / Edukasi** | Pembahasan konsep teknis, perbandingan teknologi, atau bedah fitur. | *"Perbandingan arsitektur AI Provider vs Langganan Model Resmi..."* |
| 🛠️ **Tips & Tricks** | Panduan ringkas, best practice koding, atau rekomendasi alat dev. | *"5 teknik bikin query SQL lo 10x lebih ngebut..."* |
| 😂 **Jokes / Relatable IT** | Humor seputar dinamika kerja dev, debugging, PM, atau bug production. | *"Ketika lu ngepush hotfix jam 5 sore hari Jumat..."* |

### 4.3 Alur Interaksi Telegram (User Journey)

#### Alur 1: Interaktif (Default / Santai)
```text
User kirim Teks / Link / Gambar
        │
        ▼
Bot deteksi input & tampilkan Inline Buttons:
"💡 Topik diterima! Mau dibikin dengan gaya apa?"
[ 🔥 Hot Take ]  [ 🧠 Deep Dive ]
[ 🛠️ Tips & Tricks ]  [ 😂 Jokes/Meme ]
        │
        ▼ (User klik tombol mode)
Bot kirim: "⏳ Meracik utas tech mode [Nama Mode]..."
        │
        ▼
Bot kirimkan Preview Draf Utas Lengkap
[ ✅ Approve & Publish ]  [ ❌ Reject ]
        │
        ▼ (User klik Approve)
Bot mem-publish secara berantai ke Meta Threads
Bot kirim konfirmasi: "🚀 Thread berhasil dipublish! [Link Thread]"
```

#### Alur 2: Shortcut / Jalur Cepat
Pengguna dapat langsung melewati menu tombol dengan menggunakan *slash command*:
* `/hottake [topik / link]`
* `/deepdive [topik / link]`
* `/tips [topik / link]`
* `/joke [topik / link]`

---

## 5. Spesifikasi Teknis Output Thread

1. **Panjang Utas Dinamis:**
   * AI secara mandiri menentukan jumlah part utas (antara 2 hingga 7 part) berdasarkan kompleksitas topik. Tidak dibatasi kaku harus 3 part.
2. **Struktur Per Part:**
   * **Part 1 (Hook):** Pembuka yang memikat perhatian dalam 2 detik pertama (tanpa kata sambutan klise).
   * **Part 2 s/d N-1 (Body):** Poin-poin inti, perbandingan, atau alur cerita.
   * **Part Terakhir (Ending + CTA):** Kesimpulan singkat + kalimat pemantik diskusi terbuka.
3. **Karakter Limit:** Maksimal 500 karakter per part (sesuai batasan resmi Meta Threads).

---

## 6. Aspek yang Terdampak atas Perubahan Konsep (Impact Analysis)

Bagian ini memetakan secara transparan komponen arsitektur yang berubah, yang dihapus, dan yang tetap dipertahankan:

| Komponen / File | Status Perubahan | Detail Dampak Teknis |
| :--- | :--- | :--- |
| **`src/services/geminiService.js`** | 🔴 **Major Rework** | System prompt affiliate marketing (hook, review, link CTA) dihapus total. Digantikan oleh generator konten tech yang mendukung 4 preset mode dan panjang dinamis. |
| **`src/config/topics.js`** | 🔴 **Major Rework** | Kategori produk fisik e-commerce (fashion, gadget, beauty) digantikan dengan taksonomi topik IT/Tech (AI, Software Engineering, DevOps, Dev Life, Hardware). |
| **`src/services/draftService.js`** | 🟡 **Modifikasi Sedang** | Skema data draft disesuaikan: Menghapus field `affiliateLink`, `productName`, dan `category`. Menambahkan field `mode`, `sourceUrl`, dan array `threads` dinamis. |
| **`src/services/threadsService.js`** | 🟡 **Modifikasi Sedang** | Logika publikasi berantai yang sebelumnya kaku 3 part disesuaikan agar mendukung N-part (looping publikasi container dinamis). Dukungan passthrough gambar pada post pertama. |
| **`src/controllers/webhookController.js`** | 🟡 **Modifikasi Sedang** | Menambahkan handler untuk *callback query* tombol preset mode, router slash command baru (`/hottake`, `/deepdive`, dll.), dan deteksi URL link berita. |
| **`src/services/telegramService.js`** | 🟡 **Modifikasi Ringan** | Menambahkan fungsi pesan tombol pilihan mode (`sendModeSelection()`), dan menyesuaikan format preview draft di Telegram. |
| **Fitur Web Scraper (Baru)** | 🟢 **Modul Baru** | Service sederhana (menggunakan `axios` + parser atau Gemini URL reader) untuk mengekstrak teks berita dari URL yang dikirim user. |
| **Multi-User SaaS & Monetisasi** | ⏸️ **Di-Parkir (Hold)** | Skema OAuth multi-user, sistem kuota voucher (`/genkey`, `/redeem`), dan integrasi Lynk.id **ditangguhkan sementara**. Sistem kembali fokus ke kredensial owner tunggal (*single-user personal branding*). |
| **Infrastructure Dasar** | ⚪ **Tidak Berubah** | Express Server, Webhook Telegram, Firebase Firestore, dan Threads Graph API connection tetap menggunakan pondasi yang sudah ada. |

---

## 7. Out of Scope (Tidak Dikerjakan pada Fase Ini)

1. **Sistem Multi-User & Pembayaran:** Tidak ada registrasi user baru, token voucher, atau integrasi gateway Lynk.id.
2. **AI Image Generation / Editing:** Bot tidak membuat atau memodifikasi gambar. Gambar yang dikirim murni diteruskan (*pass-through*).
3. **Auto-Scheduling:** Postingan langsung dikirim setelah di-*Approve* (belum ada antrean waktu terjadwal).

---

## 8. Rencana Implementasi Bertahap (Next Steps)

1. **Fase 1: Engine Konten & Prompt Engineering Baru**
   * Pembaruan `geminiService.js` dengan persona *Casual Tech-Bro*.
   * Pengujian draf 4 preset mode dan CTA diskusi.
2. **Fase 2: Interaksi Telegram & Preset Buttons**
   * Implementasi pemilihan mode via inline buttons Telegram (Opsi C) dan shortcut command.
3. **Fase 3: Link Parser / Extractor Berita**
   * Penambahan pembaca URL artikel IT untuk dirangkum jadi thread.
4. **Fase 4: Dynamic Publishing Engine**
   * Penyesuaian `threadsService.js` untuk publish N-part utas secara berantai beserta gambar passthrough.
5. **Fase 5: Validasi Personal Branding**
   * Uji coba publikasi harian dan evaluasi metrik interaksi di Meta Threads.
