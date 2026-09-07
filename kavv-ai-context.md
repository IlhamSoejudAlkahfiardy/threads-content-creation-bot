# Kavv AI: Threads Automation Content Creator - Context File

## 📌 Project Overview
**Project Name:** Kavv AI (Threads Affiliate & Product Promotion Bot)
**Goal:** An automated social commerce assistant that takes product briefs (and photos) via Telegram, generates high-converting 3-part Threads content using Gemini AI (Hook -> Main Content -> CTA + Links + Carousel), stores drafts in Firestore, and publishes them sequentially to Meta Threads upon manual approval.

## 🛠️ Tech Stack & Architecture
* **Backend:** Node.js, Express.js
* **Database:** Google Cloud Firestore (Collection: `drafts`)
* **AI Provider:** Google Gemini API (`@google/genai` SDK using `gemini-2.5-flash`)
* **Integrations:** Telegram Bot API (via webhooks), Meta Graph API (Threads endpoint with Carousel media support)
* **Authentication:** Google Cloud Application Default Credentials (ADC) for Firestore; Long-lived User Access Token for Threads.
* **Local Testing:** ngrok (for tunneling webhook traffic to `localhost:3000`)

## ⚙️ The Current Workflow
1. **Trigger:** User sends a product brief to the Telegram Bot with text and/or photos (supports Telegram photo albums via debounce buffering).
2. **CDN Extraction:** The server extracts public image download URLs from Telegram CDN via `getFile`.
3. **Generation:** `gemini-2.5-flash` creates a high-converting 3-part thread (Hook $\le$ 500 chars, Main Content $\le$ 500 chars, CTA + Links $\le$ 500 chars) tailored to the product's niche.
4. **State Management:** The draft is saved to Firestore with `productName`, `category`, `imageUrls`, and the 3 parts.
5. **Approval Loop:** Telegram sends a preview card with inline button (**[ ✅ Approve & Upload to Threads ]**).
6. **Publishing Loop:**
   - Part 1 (Hook - TEXT) is published as Root Post.
   - Part 2 (Main Content - TEXT) replies to Part 1.
   - Part 3 (CTA & Links) publishes as a **CAROUSEL** of all product photos (or single image / text) replying to Part 2.
   - Includes container status polling (`waitForContainerFinished`) and auto-retry (`publishContainerWithRetry`).
7. **Resolution:** Firestore updates to `published` with all live post IDs, and Telegram confirms the live post link.

## 🚦 Current Project State
* **Meta Developer App:** Created, authorized, and active.
* **Firestore:** Database running in Native Mode (`threads-bot-6d1a7`) authenticated via ADC.
* **Multi-Thread Engine:** Fully implemented and verified (structured output, 500 char hard limit, chained publishing with polling & retry).
* **Environment Variables (`.env`):** Contains `TELEGRAM_TOKEN`, `THREADS_TOKEN`, `THREADS_USER_ID=me`, `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`, and `PORT=3000`.
* **Dev Server:** Running with `npm run dev` (`node --watch-path=index.js --watch-path=.env index.js`).
* **Next Steps:**
  - Multimodal support (generating or attaching code snippet images / cards).
  - Deploy to a GCP VPS / Cloud Run for 24/7 production uptime.
