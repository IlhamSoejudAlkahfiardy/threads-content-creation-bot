const admin = require("firebase-admin");
const env = require("./env");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

module.exports = {
  admin,
  db,
};
