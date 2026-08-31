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
2. **Generation:** The Express server receives the webhook, queries the `gemini-2.5-flash` model, and generates a post draft.
3. **State Management:** The draft is saved to Firestore with a `pending` status.
4. **Approval Loop:** The bot replies in Telegram with the drafted text and an Inline Keyboard button (**[ ✅ Approve & Upload ]**) bound to the Firestore Document ID.
5. **Publishing Phase 1:** Upon approval, the server fetches the approved text from Firestore and sends a `POST` request to create a Threads Media Container.
6. **Publishing Phase 2:** The server immediately sends a second `POST` request using the returned `creation_id` to publish the post.
7. **Resolution:** Firestore is updated to `published` with the live post ID, and a success message is sent back to Telegram.

## 🚦 Current Project State
* **Meta Developer App:** Created and authorized. Token saved in `.env`.
* **Firestore:** Database initialized in Native Mode.
* **Authentication:** `gcloud auth application-default login` executed successfully, bypassing the need for JSON keys.
* **Codebase:** `index.js` holds the webhook logic, routing, AI generation, and posting sequence.
* **Environment Variables (`.env`):** Contains `TELEGRAM_TOKEN`, `THREADS_TOKEN`, `THREADS_USER_ID=me`, `PORT=3000`, and `GEMINI_API_KEY`.
* **Next Steps:** Refine AI prompts, explore multimodal (image) support, and deploy the application to the GCP VPS for production.
