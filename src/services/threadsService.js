const axios = require("axios");
const env = require("../config/env");
const sleep = require("../utils/sleep");
const logger = require("../utils/logger");

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

/**
 * Wait for Threads Media Container to be ready (status = FINISHED)
 * @param {string} creationId
 * @param {number} [maxAttempts=8]
 * @param {number} [delayMs=1500]
 * @returns {Promise<boolean>}
 */
async function waitForContainerFinished(creationId, maxAttempts = 8, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await axios.get(`${THREADS_API_BASE}/${creationId}`, {
        params: {
          fields: "status,error_message",
          access_token: env.THREADS_TOKEN,
        },
      });

      const status = res.data?.status;
      if (status === "FINISHED") {
        logger.info("Threads", `Container ${creationId} ready (status: FINISHED)`);
        return true;
      }
      if (status === "ERROR") {
        throw new Error(
          `Container error from Threads: ${res.data?.error_message || "Unknown error"}`
        );
      }
      logger.info(
        "Threads",
        `Container ${creationId} status: ${status}. Waiting... (attempt ${attempt}/${maxAttempts})`
      );
    } catch (err) {
      const subcode = err.response?.data?.error?.error_subcode;
      if (subcode === 4279009) {
        logger.info(
          "Threads",
          `Container ${creationId} propagating... (attempt ${attempt}/${maxAttempts})`
        );
      } else if (err.message?.includes("Container error")) {
        throw err;
      } else {
        logger.warn("Threads", `Polling notice for ${creationId}: ${err.message}`);
      }
    }
    await sleep(delayMs);
  }
  return false;
}

/**
 * Publish container with automatic retry for transient error 4279009
 * @param {string} creationId
 * @param {number} [maxRetries=5]
 * @param {number} [delayMs=2000]
 * @returns {Promise<string>} Published Thread Post ID
 */
async function publishContainerWithRetry(creationId, maxRetries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        "Threads",
        `Publishing container ${creationId}... (attempt ${attempt}/${maxRetries})`
      );
      const res = await axios.post(
        `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: env.THREADS_TOKEN,
          },
        }
      );
      return res.data.id;
    } catch (err) {
      const errorData = err.response?.data?.error;
      const subcode = errorData?.error_subcode;
      logger.warn(
        "Threads",
        `Publish failed on attempt ${attempt}: ${err.message} (subcode: ${subcode})`
      );

      if (subcode === 4279009 && attempt < maxRetries) {
        logger.info("Threads", `Transient error 4279009. Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Execute dynamic N-part chained upload to Meta Threads
 * (Part 1 as Root Post + image passthrough -> Part 2..N as chained replies)
 * @param {object} draft - Firestore draft object
 * @returns {Promise<{ rootPostId: string, updatedThreads: Array }>}
 */
async function publishTechThread(draft) {
  const updatedThreads = [];
  const imageUrls = draft.imageUrls || [];
  const threads = draft.threads || [];

  if (threads.length === 0) {
    throw new Error("Draft tidak memiliki teks thread untuk dipublish.");
  }

  // ----------------------------------------------------
  // 1. UPLOAD PART 1 (ROOT POST - HOOK)
  // ----------------------------------------------------
  const part1 = threads[0];
  logger.info("Threads", `Uploading Part 1 (Hook / Root Post)... Total parts: ${threads.length}`);

  const part1Params = {
    text: part1.text,
    access_token: env.THREADS_TOKEN,
  };

  if (imageUrls.length > 0) {
    // If image attached, make Part 1 an IMAGE container
    part1Params.media_type = "IMAGE";
    part1Params.image_url = imageUrls[0];
    logger.info("Threads", `Attaching image to Root Post: ${imageUrls[0]}`);
  } else {
    part1Params.media_type = "TEXT";
  }

  if (draft.topicTag) {
    part1Params.topic_tag = draft.topicTag;
    logger.info(
      "Threads",
      `Attaching topic_tag: "${draft.topicTag}" (${draft.topicLabel || "Custom"}) to Root Post`
    );
  }

  const container1Res = await axios.post(
    `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
    null,
    { params: part1Params }
  );
  const creationId1 = container1Res.data.id;
  logger.info(
    "Threads",
    `Part 1 container created: ${creationId1}. Waiting for container readiness...`
  );
  await waitForContainerFinished(creationId1, 8, 1500);

  const rootPostId = await publishContainerWithRetry(creationId1, 5, 2000);
  logger.info("Threads", `Part 1 (Hook) Published successfully! Root Post ID: ${rootPostId}`);

  updatedThreads.push({
    ...part1,
    threadsPostId: rootPostId,
  });

  await sleep(1500);

  // ----------------------------------------------------
  // 2. UPLOAD PART 2..N (CHAINED REPLIES)
  // ----------------------------------------------------
  let previousPostId = rootPostId;

  for (let i = 1; i < threads.length; i++) {
    const currentPart = threads[i];
    logger.info(
      "Threads",
      `Uploading Part ${i + 1}/${threads.length} (${currentPart.type}) as reply to ${previousPostId}...`
    );

    const replyParams = {
      media_type: "TEXT",
      text: currentPart.text,
      reply_to_id: previousPostId,
      access_token: env.THREADS_TOKEN,
    };

    const replyContainerRes = await axios.post(
      `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
      null,
      { params: replyParams }
    );
    const replyCreationId = replyContainerRes.data.id;
    logger.info(
      "Threads",
      `Part ${i + 1} container created: ${replyCreationId}. Waiting for readiness...`
    );
    await waitForContainerFinished(replyCreationId, 8, 1500);

    const publishedReplyId = await publishContainerWithRetry(replyCreationId, 5, 2000);
    logger.info(
      "Threads",
      `Part ${i + 1} Published successfully! ID: ${publishedReplyId}`
    );

    updatedThreads.push({
      ...currentPart,
      threadsPostId: publishedReplyId,
    });

    // Cascade: reply to previous post for neat chronological thread chaining
    previousPostId = publishedReplyId;
    await sleep(1500);
  }

  logger.info(
    "Threads",
    `All ${threads.length} parts uploaded successfully in chain! (Root: ${rootPostId})`
  );

  return {
    rootPostId,
    updatedThreads,
  };
}

module.exports = {
  waitForContainerFinished,
  publishContainerWithRetry,
  publishTechThread,
  // Alias for backward compatibility
  publishAffiliateThread: publishTechThread,
};
