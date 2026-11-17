import express from 'express';
import { admin, firestore } from '../modules/market-data/firebaseAdmin';

export const authRouter = express.Router();

function resolveToken(req: any): string {
  const bodyToken = req.body?.token || req.body?.idToken;
  if (bodyToken) return String(bodyToken);
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

async function handleVerifyToken(req: any, res: any): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    res.status(200).json({ message: 'Token verified successfully', uid: decodedToken.uid });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

async function handleProfileUpdate(req: any, res: any): Promise<void> {
  const { uid, name, email } = req.body || {};

  if (!uid) {
    res.status(400).json({ error: 'User ID (uid) is required' });
    return;
  }

  try {
    await firestore.collection('users').doc(uid).set(
      {
        name,
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    res.status(200).json({ message: 'User profile updated successfully' });
  } catch (error) {
    console.error('Error saving user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function handleGetTrades(req: any, res: any): Promise<void> {
  try {
    const tradesRef = firestore.collection('trades');
    const snapshot = await tradesRef.get();

    const trades: any[] = [];
    snapshot.forEach((doc: any) => {
      trades.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(trades);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
}

// REST routes under /api/auth/*
authRouter.post('/verify-token', handleVerifyToken);
authRouter.post('/profile', handleProfileUpdate);
authRouter.get('/trades', handleGetTrades);

// Legacy root mounts preserved for backwards compatibility
export function setupAuthRoutes(app: any): void {
  app.post('/verify-token', handleVerifyToken);
  app.post('/api/profile', handleProfileUpdate);
  app.get('/api/trades', handleGetTrades);
}

export default authRouter;
