import express from 'express';
import { firestore } from '../modules/market-data/firebaseAdmin';
import redis from '../modules/market-data/redisClient';

const router = express.Router();

// GET /api/signals/historical
router.get('/historical', async (req: any, res: any) => {
  try {
    const { lastVisible } = req.query;
    const limit = 50;
    let query: any = firestore.collection('signals').orderBy('createdAt', 'desc').limit(limit);

    if (lastVisible) {
      const lastVisibleDoc = await firestore.collection('signals').doc(String(lastVisible)).get();
      if (lastVisibleDoc?.exists) {
        query = query.startAfter(lastVisibleDoc);
      }
    }

    const snapshot = await query.get();
    const signals: any[] = [];
    if (snapshot?.forEach) {
      snapshot.forEach((doc: any) => {
        signals.push({ id: doc.id, ...doc.data() });
      });
    } else if (Array.isArray(snapshot?.docs)) {
      snapshot.docs.forEach((doc: any) => {
        signals.push({ id: doc.id, ...doc.data() });
      });
    }

    const docs = snapshot?.docs || [];
    const nextLastVisible = docs.length > 0 ? docs[docs.length - 1].id : null;

    res.json({
      signals,
      lastVisible: nextLastVisible,
    });
  } catch (error) {
    console.error('Error fetching historical signals from Firestore:', error);
    res.status(500).json({ error: 'Failed to retrieve historical signals.' });
  }
});

// GET /api/signals/live
router.get('/live', async (_req: any, res: any) => {
  try {
    const keys: string[] = await new Promise((resolve, reject) => {
      const found: string[] = [];
      const stream = redis.scanStream({
        match: 'signals:live:*:*',
        count: 100,
      });

      stream.on('data', (resultKeys: string[]) => {
        for (const key of resultKeys) {
          found.push(key);
        }
      });

      stream.on('end', () => resolve(found));
      stream.on('error', reject);
    });

    if (keys.length === 0) {
      res.json([]);
      return;
    }

    const values = await redis.mget(keys);
    const liveSignals = values
      .filter(Boolean)
      .map((val) => {
        try {
          return JSON.parse(val!);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json(liveSignals);
  } catch (error) {
    console.error('Error fetching live signals from Redis:', error);
    res.status(500).json({ error: 'Failed to retrieve live signals.' });
  }
});

export default router;
