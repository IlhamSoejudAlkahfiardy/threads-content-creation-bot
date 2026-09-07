# 🚀 Panduan Deploy Threads Bot ke GCP VPS (Domain: `agv.vps.alkahfiardy.com`)

Panduan langkah demi langkah mendeploy bot ke **Google Cloud Platform (GCP) Compute Engine** agar berjalan **24/7 online** menggunakan **PuTTY**, mengonfigurasi **Nginx Reverse Proxy** di port **8080** (aman dari bentrok dengan WAHA & n8n), serta mengatur **Continuous Deployment (CI/CD)** via **GitHub Actions**.

---

## 📐 Arsitektur Alur Kerja (Workflow)

```
+-------------------------------------------------------------+
|                      KOMPUTER LOKAL                         |
|   1. Koding & edit prompt di VS Code                        |
|   2. git add . && git commit -m "update..."                 |
|   3. git push origin main                                   |
+------------------------------+------------------------------+
                               |
                               | (Auto trigger push event)
                               v
+-------------------------------------------------------------+
|                     GITHUB REPOSITORY                       |
|   GitHub Actions Runner (.github/workflows/deploy.yml)      |
|   Mengambil Secret: SSH_HOST, SSH_USER, SSH_PRIVATE_KEY     |
|   Koneksi SSH otomatis ke GCP VPS                           |
+------------------------------+------------------------------+
                               |
                               | (Eksekusi script via SSH)
                               v
+-------------------------------------------------------------+
|                       GCP VPS LINUX                         |
|   1. cd /var/www/threads-bot                                |
|   2. git pull origin main                                   |
|   3. npm install --omit=dev                                 |
|   4. pm2 reload threads-bot --update-env                    |
+------------------------------+------------------------------+
                               ▲
                               | Reverse Proxy (Port 8080)
+------------------------------+------------------------------+
|             NGINX + SSL (PORT 443 HTTPS)                    |
|             Domain: agv.vps.alkahfiardy.com                 |
+------------------------------+------------------------------+
                               ▲
                               | HTTPS Webhook
+------------------------------+------------------------------+
|                   TELEGRAM BOT / META API                   |
+-------------------------------------------------------------+
```

---

## 🛠️ Tips Pintasan Menggunakan PuTTY di Windows

* **Paste Teks**: Cukup **klik kanan mouse** satu kali di dalam layar hitam PuTTY.
* **Copy Teks**: Cukup **blok teks** yang diinginkan dengan mouse, teks otomatis tersalin ke clipboard Windows Anda.

---

## FASE 1: Konfigurasi Port & `.env` di VPS (Port 8080)

Untuk mencegah bentrok dengan container lain di VPS (seperti **WAHA** pada port 3000 dan **n8n** pada port 5678), bot dijalankan pada **Port 8080**.

### 1. Konfigurasi `.env` Bot di VPS
Di terminal PuTTY:
```bash
nano /var/www/threads-bot/.env
```
Pastikan `PORT=8080`:
```env
PORT=8080
FIREBASE_PROJECT_ID=your_firebase_project_id
GEMINI_API_KEY=your_gemini_api_key
TELEGRAM_TOKEN=your_telegram_bot_token
THREADS_TOKEN=your_threads_access_token
THREADS_USER_ID=your_threads_user_id
```
* Simpan: `Ctrl + O`, lalu `Enter`.
* Keluar: `Ctrl + X`.

### 2. Jalankan / Restart Bot dengan PM2
```bash
pm2 restart threads-bot --update-env
# atau jika pertama kali:
# pm2 start index.js --name threads-bot && pm2 save
```

### 3. Verifikasi Status Online
Buka di browser laptop Anda:
👉 **`https://agv.vps.alkahfiardy.com/health`**

Respon yang diharapkan:
```json
{"status":"ok","timestamp":"2026-09-07T..."}
```

---

## FASE 2: Setup CI/CD Auto-Deploy (GitHub Actions)

Agar setiap `git push` dari komputer lokal langsung memperbarui server secara otomatis:

### 1. Buat Kunci SSH Khusus GitHub Actions di PuTTY
Di terminal PuTTY, jalankan:
```bash
# Generate key baru tanpa passphrase
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Tambahkan ke daftar authorized_keys server
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Tampilkan isi private key
cat ~/.ssh/github_actions
```

Blok seluruh output teks private key di layar PuTTY:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
... teks kunci panjang ...
...
-----END OPENSSH PRIVATE KEY-----
```
*(Teks yang diblok di PuTTY otomatis tersalin ke clipboard Windows Anda).*

---

### 2. Masukkan Secrets di Repository GitHub
1. Buka repository Anda di browser:
   `https://github.com/IlhamSoejudAlkahfiardy/threads-content-creation-bot`
2. Klik tab **Settings** > menu kiri **Secrets and variables** > **Actions**.
3. Klik tombol hijau **New repository secret**, tambahkan 3 secret berikut:

| Secret Name | Value | Keterangan |
|---|---|---|
| `SSH_HOST` | `agv.vps.alkahfiardy.com` | Domain VPS Anda |
| `SSH_USER` | *(Username VPS Anda)* | Cek dengan ketik `whoami` di PuTTY |
| `SSH_PRIVATE_KEY` | *(Teks private key)* | Paste teks yang dicopy dari `cat ~/.ssh/github_actions` |

---

### 3. File Workflow CI/CD (`.github/workflows/deploy.yml`)
File workflow ini sudah dibuatkan di project lokal Anda:

```yaml
name: Deploy to GCP VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Executing remote SSH commands
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/threads-bot
            git pull origin main
            npm install --omit=dev
            pm2 reload threads-bot --update-env
```

Tinggal lakukan commit dan push dari terminal laptop Anda:
```bash
git add .
git commit -m "ci: setup auto deploy to gcp vps"
git push origin main
```

Cek tab **Actions** di repo GitHub Anda. Anda akan melihat workflow berjalan dan sukses mendeploy ke VPS secara otomatis!

---

## FASE 3: Arahkan Webhook Telegram ke Server VPS Baru

Sekarang sambungkan Telegram Bot ke domain publik `agv.vps.alkahfiardy.com`:

### 1. Set Webhook
Buka browser laptop Anda dan buka URL ini (ganti `<TOKEN_TELEGRAM_ANDA>` dengan token bot Telegram Anda):
```
https://api.telegram.org/bot<TOKEN_TELEGRAM_ANDA>/setWebhook?url=https://agv.vps.alkahfiardy.com/webhook
```

Pastikan responsnya:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### 2. Verifikasi Status Webhook
```
https://api.telegram.org/bot<TOKEN_TELEGRAM_ANDA>/getWebhookInfo
```
Pastikan:
* `url` mengarah ke `https://agv.vps.alkahfiardy.com/webhook`
* `has_custom_certificate` bernilai `false`
* `pending_update_count` bernilai `0`

---

## 🎉 SELESAI!

Sekarang:
1. Anda **sudah bisa mematikan `ngrok` dan terminal local dev** di laptop Anda.
2. Bot Anda sudah online dan melayani Telegram **24/7 di GCP**.
3. Jika ingin mengubah prompt atau fitur bot, Anda **cukup koding di laptop, lalu `git push origin main`**. VPS akan ter-update secara instan dan otomatis tanpa perlu buka PuTTY lagi!

---

## 📊 Cheatsheet Monitoring di PuTTY

| Kebutuhan | Perintah di PuTTY |
|---|---|
| Cek status bot | `pm2 status` |
| Pantau real-time logs bot | `pm2 logs threads-bot` |
| Pantau CPU & RAM | `pm2 monit` |
| Restart bot manual | `pm2 restart threads-bot --update-env` |
| Cek error Nginx | `sudo tail -f /var/log/nginx/error.log` |
