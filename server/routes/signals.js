const express = require('express');
const { firestore } = require('../services/firebaseAdmin');
const redis = require('../services/redisClient');

const router = express.Router();

/**
 * GET /api/signals/historical
 * Retrieves a paginated list of historical signals from Firestore.
 */
router.get('/historical', async (req, res) => {
  try {
    // Basic pagination: use `lastVisible` to get the next page.
    const { lastVisible } = req.query;
    let query = firestore.collection('signals').orderBy('createdAt', 'desc').limit(50);

    if (lastVisible) {
      const lastDoc = await firestore.collection('signals').doc(lastVisible).get();
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const signals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Get the ID of the last document for the next page request.
    const nextLastVisible = snapshot.docs[snapshot.docs.length - 1]?.id;

    res.json({ signals, lastVisible: nextLastVisible });

  } catch (error) {
    console.error('Error fetching historical signals:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * GET /api/signals/live
 * Retrieves all current live signals from the Redis cache.
 */
router.get('/live', async (req, res) => {
  try {
    const stream = redis.scanStream({
      match: 'signals:live:*:*', // Pattern to find all live signal keys
      count: 100,
    });

    const liveSignalKeys = [];
    stream.on('data', (keys) => {
      for (const key of keys) {
        liveSignalKeys.push(key);
      }
    });

    stream.on('end', async () => {
      if (liveSignalKeys.length === 0) {
        return res.json([]);
      }
      // MGET retrieves all signals in a single round trip.
      const signalsJson = await redis.mget(liveSignalKeys);
      const signals = signalsJson.map(JSON.parse);
      res.json(signals);
    });

  } catch (error) {
    console.error('Error fetching live signals:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
