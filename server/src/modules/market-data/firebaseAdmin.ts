import admin from 'firebase-admin';
import { env } from '../../config/env';

let firestore: any;

function createMockFirestore() {
  const emptySnapshot = { empty: true, docs: [] };
  const docMock = () => ({
    exists: false,
    data: () => ({}),
    get: async () => ({ exists: false, data: () => ({}) }),
    set: async () => {},
    update: async () => {},
    collection: () => collectionMock(),
  });
  const queryMock: any = {
    where: () => queryMock,
    orderBy: () => queryMock,
    limit: () => queryMock,
    startAfter: () => queryMock,
    get: async () => emptySnapshot,
  };
  const collectionMock = () => ({
    ...queryMock,
    add: async () => {},
    doc: () => docMock(),
  });
  return {
    collection: () => collectionMock(),
  };
}

const SERVICE_ACCOUNT_JSON = env.firebaseServiceAccount;

if (SERVICE_ACCOUNT_JSON && SERVICE_ACCOUNT_JSON.trim() !== '') {
  try {
    const raw = SERVICE_ACCOUNT_JSON.trim();
    const maybeUnquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    const serviceAccount = JSON.parse(maybeUnquoted);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      admin.app();
    }

    firestore = admin.firestore();
    console.log('Successfully connected to Firebase Firestore.');
  } catch (error) {
    console.error('CRITICAL: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON or initialize Firebase Admin SDK:', error);
    firestore = createMockFirestore();
  }
} else {
  console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT is not set in environment variables.');
  firestore = createMockFirestore();
}

export { admin, firestore };
