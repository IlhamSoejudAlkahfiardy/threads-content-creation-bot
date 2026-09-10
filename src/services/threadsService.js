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
 * @returns {Promise<string>} Published Post ID
 */
async function publishContainerWithRetry(creationId, maxRetries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const publishRes = await axios.post(
        `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: env.THREADS_TOKEN,
          },
        }
      );
      return publishRes.data.id;
    } catch (err) {
      const subcode = err.response?.data?.error?.error_subcode;
      const isResourceNotFound = subcode === 4279009 || err.response?.status === 404;

      if (isResourceNotFound && attempt < maxRetries) {
        logger.warn(
          "Threads",
          `Publish attempt ${attempt}/${maxRetries} got 4279009 (resource propagating). Retrying in ${delayMs / 1000}s...`
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Execute the 3-part chain upload to Meta Threads (Hook -> Main Content -> CTA & Carousel/Image/Text)
 * @param {object} draft - Firestore draft object
 * @returns {Promise<{ rootPostId: string, updatedThreads: Array }>}
 */
async function publishAffiliateThread(draft) {
  const updatedThreads = [];
  const imageUrls = draft.imageUrls || [];

  // ----------------------------------------------------
  // 1. UPLOAD THREAD #1 (HOOK - TEXT ROOT POST)
  // ----------------------------------------------------
  logger.info("Threads", "Uploading Part 1 (Hook / Root Post)...");
  const part1 = draft.threads[0];
  const part1Params = {
    media_type: "TEXT",
    text: part1.text,
    access_token: env.THREADS_TOKEN,
  };
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
  logger.info("Threads", `Part 1 container created: ${creationId1}. Waiting for container readiness...`);
  await waitForContainerFinished(creationId1, 8, 1500);

  const rootPostId = await publishContainerWithRetry(creationId1, 5, 2000);
  logger.info("Threads", `Part 1 (Hook) Published successfully! Root Post ID: ${rootPostId}`);

  updatedThreads.push({
    ...part1,
    threadsPostId: rootPostId,
  });

  await sleep(1500);

  // ----------------------------------------------------
  // 2. UPLOAD THREAD #2 (MAIN CONTENT - TEXT REPLY TO PART 1)
  // ----------------------------------------------------
  logger.info("Threads", `Uploading Part 2 (Main Content) as reply to Root Post (${rootPostId})...`);
  const part2 = draft.threads[1];
  const container2Res = await axios.post(
    `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
    null,
    {
      params: {
        media_type: "TEXT",
        text: part2.text,
        reply_to_id: rootPostId,
        access_token: env.THREADS_TOKEN,
      },
    }
  );
  const creationId2 = container2Res.data.id;
  logger.info("Threads", `Part 2 container created: ${creationId2}. Waiting for container readiness...`);
  await waitForContainerFinished(creationId2, 8, 1500);

  const part2PostId = await publishContainerWithRetry(creationId2, 5, 2000);
  logger.info("Threads", `Part 2 (Main Content) Published successfully! ID: ${part2PostId}`);

  updatedThreads.push({
    ...part2,
    threadsPostId: part2PostId,
  });

  await sleep(1500);

  // ----------------------------------------------------
  // 3. UPLOAD THREAD #3 (CTA & LINKS + CAROUSEL/IMAGE/TEXT)
  // ----------------------------------------------------
  logger.info("Threads", `Uploading Part 3 (CTA & Links) as reply to Part 2 (${part2PostId})...`);
  const part3 = draft.threads[2];
  let part3PostId = null;

  if (imageUrls.length > 1) {
    // A. MULTI-IMAGE CAROUSEL
    logger.info(
      "Threads",
      `Creating carousel containers for ${imageUrls.length} images...`
    );
    const childContainerIds = [];

    for (let c = 0; c < Math.min(imageUrls.length, 10); c++) {
      const imgUrl = imageUrls[c];
      logger.info(
        "Threads",
        `Creating carousel item container ${c + 1}/${imageUrls.length}...`
      );
      const itemRes = await axios.post(
        `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
        null,
        {
          params: {
            media_type: "IMAGE",
            image_url: imgUrl,
            is_carousel_item: true,
            access_token: env.THREADS_TOKEN,
          },
        }
      );
      childContainerIds.push(itemRes.data.id);
      await sleep(600);
    }

    // Poll all child items
    logger.info("Threads", "Waiting for all carousel child containers to finish...");
    for (const childId of childContainerIds) {
      await waitForContainerFinished(childId, 8, 1500);
    }

    // Create Parent Carousel Container
    logger.info("Threads", "Creating parent carousel container...");
    const carouselRes = await axios.post(
      `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
      null,
      {
        params: {
          media_type: "CAROUSEL",
          children: childContainerIds.join(","),
          text: part3.text,
          reply_to_id: part2PostId,
          access_token: env.THREADS_TOKEN,
        },
      }
    );
    const carouselContainerId = carouselRes.data.id;
    logger.info("Threads", `Parent carousel container created: ${carouselContainerId}. Waiting...`);
    await waitForContainerFinished(carouselContainerId, 8, 1500);
    part3PostId = await publishContainerWithRetry(carouselContainerId, 5, 2000);
  } else if (imageUrls.length === 1) {
    // B. SINGLE IMAGE
    logger.info("Threads", "Creating single image container for Part 3...");
    const singleRes = await axios.post(
      `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
      null,
      {
        params: {
          media_type: "IMAGE",
          image_url: imageUrls[0],
          text: part3.text,
          reply_to_id: part2PostId,
          access_token: env.THREADS_TOKEN,
        },
      }
    );
    const singleContainerId = singleRes.data.id;
    logger.info("Threads", `Single image container created: ${singleContainerId}. Waiting...`);
    await waitForContainerFinished(singleContainerId, 8, 1500);
    part3PostId = await publishContainerWithRetry(singleContainerId, 5, 2000);
  } else {
    // C. TEXT ONLY
    logger.info("Threads", "Creating text-only container for Part 3...");
    const textRes = await axios.post(
      `${THREADS_API_BASE}/${env.THREADS_USER_ID}/threads`,
      null,
      {
        params: {
          media_type: "TEXT",
          text: part3.text,
          reply_to_id: part2PostId,
          access_token: env.THREADS_TOKEN,
        },
      }
    );
    const textContainerId = textRes.data.id;
    logger.info("Threads", `Text-only container created: ${textContainerId}. Waiting...`);
    await waitForContainerFinished(textContainerId, 8, 1500);
    part3PostId = await publishContainerWithRetry(textContainerId, 5, 2000);
  }

  logger.info("Threads", `Part 3 Published successfully! ID: ${part3PostId}`);

  updatedThreads.push({
    ...part3,
    threadsPostId: part3PostId,
  });

  logger.info(
    "Threads",
    `All 3 parts uploaded successfully in chain! (Root: ${rootPostId}, Part 2: ${part2PostId}, Part 3: ${part3PostId})`
  );

  return {
    rootPostId,
    updatedThreads,
  };
}

module.exports = {
  waitForContainerFinished,
  publishContainerWithRetry,
  publishAffiliateThread,
};
