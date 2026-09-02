# Kavv AI: Threads Automation Content Creator - Context File

## 📌 Project Overview
**Project Name:** kavv AI (Threads Content Automation)
**Goal:** An automated social media manager that takes a content brief via Telegram, uses Gemini AI to generate a post, stores it as a pending draft in a database, and publishes it directly to Meta Threads upon manual approval.

## 🛠️ Tech Stack & Architecture
* **Backend:** Node.js, Express.js
* **Database:** Google Cloud Firestore (Collection: `drafts`)
* **AI Provider:** Google Gemini API (`@google/genai` SDK using `gemini-2.5-flash`)
* **Integrations:** Telegram Bot API (via webhooks), Meta Graph API (Threads endpoint)
* **Authentication:** Google Cloud Application Default Credentials (ADC) for Firestore; Long-lived User Access Token for Threads.
* **Local Testing:** ngrok (for tunneling webhook traffic to `localhost:3000`)

## ⚙️ The Current Workflow
1. **Trigger:** User sends a text message (content brief) to the Telegram Bot.
2. **Generation:** The Express server receives the webhook, invokes `gemini-2.5-flash` with structured JSON schema (`responseSchema`), and generates an interconnected multi-thread (3 to 10 parts, each $\le$ 500 characters) in an authentic Indonesian tech developer persona.
3. **State Management:** The multi-thread draft is stored in Firestore (`drafts` collection) with `topic`, `totalThreads`, and structured `threads` array with `status: "pending"`.
4. **Approval Loop:** Telegram sends a consolidated preview with part numbers `[1/N]`, character counts, and an inline keyboard button (**[ ✅ Approve & Upload to Threads ]**).
5. **Publishing Loop:**
   - Post #1 is published as the Root Post.
   - Subsequent parts are published sequentially using `reply_to_id` set to the previous post ID, creating a connected threadstorm.
   - Includes container status polling (`waitForContainerFinished`) and exponential backoff retry (`publishContainerWithRetry`) against transient Meta propagation latency (error `4279009`).
6. **Resolution:** Firestore status updates to `published` with `rootPostId` and all individual live post IDs. A success confirmation is sent to Telegram.

## 🚦 Current Project State
* **Meta Developer App:** Created, authorized, and active.
* **Firestore:** Database running in Native Mode (`threads-bot-6d1a7`) authenticated via ADC.
* **Multi-Thread Engine:** Fully implemented and verified (structured output, 500 char hard limit, chained publishing with polling & retry).
* **Environment Variables (`.env`):** Contains `TELEGRAM_TOKEN`, `THREADS_TOKEN`, `THREADS_USER_ID=me`, `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`, and `PORT=3000`.
* **Dev Server:** Running with `npm run dev` (`node --watch-path=index.js --watch-path=.env index.js`).
* **Next Steps:**
  - Multimodal support (generating or attaching code snippet images / cards).
  - Deploy to a GCP VPS / Cloud Run for 24/7 production uptime.
