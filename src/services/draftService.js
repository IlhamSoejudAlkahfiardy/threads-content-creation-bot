const { admin, db } = require("../config/firebase");
const logger = require("../utils/logger");

const DRAFTS_COLLECTION = "drafts";

/**
 * Save a newly generated affiliate draft to Firestore
 * @param {object} params
 * @param {string} params.productName
 * @param {string} params.category
 * @param {string[]} params.imageUrls
 * @param {Array} params.threads
 * @returns {Promise<string>} Created draft ID
 */
async function createDraft({ productName, category, imageUrls, threads }) {
  const draftData = {
    productName,
    category,
    imageUrls,
    threads,
    status: "pending",
    topicTag: null,
    topicLabel: null,
    rootPostId: "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const draftRef = await db.collection(DRAFTS_COLLECTION).add(draftData);
  logger.info("Firestore", `Saved affiliate draft ID: ${draftRef.id} (${productName})`);
  return draftRef.id;
}

/**
 * Fetch a draft document by ID
 * @param {string} draftId
 * @returns {Promise<{ id: string, ...object }>}
 */
async function getDraft(draftId) {
  const docRef = db.collection(DRAFTS_COLLECTION).doc(draftId);
  const doc = await docRef.get();

  if (!doc.exists) {
    logger.error("Firestore", `Draft document '${draftId}' not found in Firestore`);
    throw new Error(`Draft document '${draftId}' not found in Firestore`);
  }

  return { id: doc.id, ...doc.data() };
}

/**
 * Mark a draft as currently publishing
 * @param {string} draftId
 */
async function markPublishing(draftId) {
  await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
    status: "publishing",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info("Firestore", `Draft ${draftId} status updated to 'publishing'`);
}

/**
 * Mark a draft as successfully published
 * @param {string} draftId
 * @param {string} rootPostId
 * @param {Array} updatedThreads
 */
async function markPublished(draftId, rootPostId, updatedThreads) {
  await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
    status: "published",
    rootPostId,
    threads: updatedThreads,
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info("Firestore", `Draft ${draftId} status updated to 'published' (rootPostId: ${rootPostId})`);
}

/**
 * Mark a draft as failed
 * @param {string} draftId
 * @param {string} errorMessage
 */
async function markFailed(draftId, errorMessage) {
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
  await db.collection(DRAFTS_COLLECTION).doc(draftId).update({
    topicTag: topicTag || null,
    topicLabel: topicLabel || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info("Firestore", `Draft ${draftId} topic updated to: ${topicLabel || "None"} (${topicTag || "None"})`);
}

module.exports = {
  createDraft,
  getDraft,
  updateDraftTopic,
  markPublishing,
  markPublished,
  markFailed,
};
