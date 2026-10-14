const { admin, db } = require("../config/firebase");
const logger = require("../utils/logger");

const DRAFTS_COLLECTION = "drafts";

// In-memory store for pending mode selection sessions
const pendingSessions = new Map();

// In-memory fallback store for drafts if Firestore is inaccessible / uncredentialed
const localDrafts = new Map();

/**
 * Save a pending user input session before choosing mode (in-memory with 15m TTL)
 * @param {object} params
 * @param {number|string} params.chatId
 * @param {string} params.text
 * @param {string[]} [params.imageUrls=[]]
 * @param {string|null} [params.sourceUrl=null]
 * @returns {Promise<string>} sessionId
 */
async function savePendingSession({ chatId, text, imageUrls = [], sourceUrl = null }) {
  const sessionId = `${chatId}_${Date.now()}`;
  pendingSessions.set(sessionId, {
    chatId,
    text,
    imageUrls,
    sourceUrl,
    createdAt: Date.now(),
  });

  setTimeout(() => {
    if (pendingSessions.has(sessionId)) {
      pendingSessions.delete(sessionId);
      logger.info("Session", `Cleaned up expired pending session: ${sessionId}`);
    }
  }, 15 * 60 * 1000);

  logger.info("Session", `Saved in-memory pending session ID: ${sessionId} for chatId: ${chatId}`);
  return sessionId;
}

/**
 * Fetch and consume a pending session
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function consumePendingSession(sessionId) {
  const session = pendingSessions.get(sessionId) || null;
  if (session) {
    pendingSessions.delete(sessionId);
    logger.info("Session", `Consumed pending session: ${sessionId}`);
  } else {
    logger.warn("Session", `Pending session '${sessionId}' not found or already consumed`);
  }
  return session;
}

/**
 * Save a newly generated tech draft to Firestore with seamless Local Fallback
 * @param {object} params
 * @param {string} params.topicTitle
 * @param {string} params.mode
 * @param {string|null} [params.sourceUrl=null]
 * @param {string[]} [params.imageUrls=[]]
 * @param {Array} params.threads
 * @returns {Promise<string>} Created draft ID
 */
async function createDraft({ topicTitle, mode, sourceUrl = null, imageUrls = [], threads }) {
  const draftData = {
    topicTitle,
    mode,
    sourceUrl,
    imageUrls,
    threads,
    status: "pending",
    topicTag: null,
    topicLabel: null,
    rootPostId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const draftRef = await db.collection(DRAFTS_COLLECTION).add({
      ...draftData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info("Firestore", `Saved tech draft ID: ${draftRef.id} ("${topicTitle}" [${mode}])`);
    return draftRef.id;
  } catch (err) {
    logger.warn(
      "Firestore",
      `Firestore save failed (${err.message}). Using resilient local in-memory fallback.`
    );
    const fallbackId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    localDrafts.set(fallbackId, { id: fallbackId, ...draftData });
    logger.info("LocalDraft", `Saved draft in-memory with ID: ${fallbackId}`);
    return fallbackId;
  }
}

/**
 * Fetch a draft document by ID (from Firestore or Local Store)
 * @param {string} draftId
 * @returns {Promise<{ id: string, ...object }>}
 */
async function getDraft(draftId) {
  if (draftId.startsWith("local_") || localDrafts.has(draftId)) {
    const draft = localDrafts.get(draftId);
    if (!draft) throw new Error(`Local draft '${draftId}' not found`);
    return draft;
  }

  try {
    const docRef = db.collection(DRAFTS_COLLECTION).doc(draftId);
    const doc = await docRef.get();
    if (!doc.exists) {
      if (localDrafts.has(draftId)) return localDrafts.get(draftId);
      throw new Error(`Draft document '${draftId}' not found in Firestore`);
    }
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    if (localDrafts.has(draftId)) return localDrafts.get(draftId);
    throw err;
  }
}

/**
 * Mark a draft as currently publishing
 * @param {string} draftId
 */
async function markPublishing(draftId) {
  if (localDrafts.has(draftId)) {
    const d = localDrafts.get(draftId);
    d.status = "publishing";
    d.updatedAt = new Date().toISOString();
    localDrafts.set(draftId, d);
    return;
  }

  try {
    await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
      status: "publishing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info("Firestore", `Draft ${draftId} status updated to 'publishing'`);
  } catch (e) {
    logger.warn("Firestore", `Failed to update publishing status in Firestore: ${e.message}`);
  }
}

/**
 * Mark a draft as successfully published
 * @param {string} draftId
 * @param {string} rootPostId
 * @param {Array} updatedThreads
 */
async function markPublished(draftId, rootPostId, updatedThreads) {
  if (localDrafts.has(draftId)) {
    const d = localDrafts.get(draftId);
    d.status = "published";
    d.rootPostId = rootPostId;
    d.threads = updatedThreads;
    d.publishedAt = new Date().toISOString();
    d.updatedAt = new Date().toISOString();
    localDrafts.set(draftId, d);
    return;
  }

  try {
    await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
      status: "published",
      rootPostId,
      threads: updatedThreads,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(
      "Firestore",
      `Draft ${draftId} status updated to 'published' (rootPostId: ${rootPostId})`
    );
  } catch (e) {
    logger.warn("Firestore", `Failed to update published status in Firestore: ${e.message}`);
  }
}

/**
 * Mark a draft as rejected
 * @param {string} draftId
 */
async function markRejected(draftId) {
  if (localDrafts.has(draftId)) {
    localDrafts.delete(draftId);
    logger.info("LocalDraft", `Deleted local draft ${draftId}`);
    return;
  }

  try {
    await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
      status: "rejected",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info("Firestore", `Draft ${draftId} status updated to 'rejected'`);
  } catch (e) {
    logger.warn("Firestore", `Failed to update rejected status in Firestore: ${e.message}`);
  }
}

/**
 * Mark a draft as failed
 * @param {string} draftId
 * @param {string} errorMessage
 */
async function markFailed(draftId, errorMessage) {
  if (localDrafts.has(draftId)) {
    const d = localDrafts.get(draftId);
    d.status = "failed";
    d.errorMessage = errorMessage;
    d.updatedAt = new Date().toISOString();
    localDrafts.set(draftId, d);
    return;
  }

  try {
    await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
      status: "failed",
      errorMessage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.error("Firestore", `Draft ${draftId} status updated to 'failed': ${errorMessage}`);
  } catch (e) {
    logger.error("Firestore", "Failed to update draft failure status:", e.message);
  }
}

/**
 * Update the topic tag and label for a draft
 * @param {string} draftId
 * @param {string|null} topicTag
 * @param {string|null} topicLabel
 */
async function updateDraftTopic(draftId, topicTag, topicLabel) {
  if (localDrafts.has(draftId)) {
    const d = localDrafts.get(draftId);
    d.topicTag = topicTag || null;
    d.topicLabel = topicLabel || null;
    d.updatedAt = new Date().toISOString();
    localDrafts.set(draftId, d);
    logger.info("LocalDraft", `Updated topic for local draft ${draftId} to: ${topicLabel || "None"}`);
    return;
  }

  try {
    await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
      topicTag: topicTag || null,
      topicLabel: topicLabel || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(
      "Firestore",
      `Draft ${draftId} topic updated to: ${topicLabel || "None"} (${topicTag || "None"})`
    );
  } catch (e) {
    logger.warn("Firestore", `Failed to update topic in Firestore: ${e.message}`);
  }
}

module.exports = {
  savePendingSession,
  consumePendingSession,
  createDraft,
  getDraft,
  updateDraftTopic,
  markPublishing,
  markPublished,
  markRejected,
  markFailed,
};
