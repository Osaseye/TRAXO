const admin = require('firebase-admin');

// The service account key will be loaded from an environment variable.
// This is the recommended and most secure way to handle credentials.
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;

let firestore;

if (SERVICE_ACCOUNT_JSON && SERVICE_ACCOUNT_JSON.trim() !== '') {
  try {
    // Some env files wrap JSON in extra quotes; strip a single leading/trailing quote if present.
    const raw = SERVICE_ACCOUNT_JSON.trim();
    const maybeUnquoted = (raw.startsWith('"') && raw.endsWith('"')) ? raw.slice(1, -1) : raw;
    const serviceAccount = JSON.parse(maybeUnquoted);


    // Check if the app is already initialized to prevent errors.
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      // If it is initialized, get the default app.
      admin.app(); 
    }

    firestore = admin.firestore();
    console.log('Successfully connected to Firebase Firestore.');

  } catch (error) {
    console.error('CRITICAL: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON or initialize Firebase Admin SDK:', error);
    // Create a mock firestore client to prevent the app from crashing
    firestore = {
      collection: () => ({
        add: async () => {},
        doc: () => ({ update: async () => {} }),
      }),
    };
  }
} else {
  console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT is not set in environment variables.');
  firestore = {
    collection: () => ({
        add: async () => {},
        doc: () => ({ update: async () => {} }),
      }),
  };
}

module.exports = { admin, firestore };
