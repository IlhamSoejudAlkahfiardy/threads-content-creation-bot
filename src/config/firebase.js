const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const env = require("./env");
const logger = require("../utils/logger");

if (!admin.apps.length) {
  const rootKeyPath = path.join(process.cwd(), "serviceAccountKey.json");
  const configKeyPath = path.join(__dirname, "serviceAccountKey.json");

  if (fs.existsSync(rootKeyPath)) {
    logger.info("Firebase", "Initializing Firebase Admin with serviceAccountKey.json from root");
    const serviceAccount = require(rootKeyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
  } else if (fs.existsSync(configKeyPath)) {
    logger.info("Firebase", "Initializing Firebase Admin with serviceAccountKey.json from src/config");
    const serviceAccount = require(configKeyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
  } else {
    logger.info(
      "Firebase",
      `Initializing Firebase Admin with Application Default Credentials (Project: ${env.FIREBASE_PROJECT_ID})`
    );
    admin.initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
    });
  }
}

const db = admin.firestore();

module.exports = {
  admin,
  db,
};
