// firebase-init.js
const admin = require('firebase-admin');
const fs = require('fs');

let serviceAccount;

// Prefer inline JSON from environment variable
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log('[FirebaseInit] Using inline JSON credentials.');
  } catch (e) {
    console.error('[FirebaseInit] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e);
    throw e;
  }
} 
// Fall back to service account file path
else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    if (!fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      throw new Error('Firebase service account file not found at path: ' + process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    }
    serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    console.log('[FirebaseInit] Using service account JSON file.');
  } catch (e) {
    console.error('[FirebaseInit] Failed to load service account file:', e);
    throw e;
  }
} else {
  throw new Error('[FirebaseInit] No Firebase credentials provided. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env.');
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log('[FirebaseInit] Firebase Admin initialized successfully.');

module.exports = admin;