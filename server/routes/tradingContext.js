const express = require('express');
const { firestore } = require('../services/firebaseAdmin');
const redis = require('../services/redisClient');

const router = express.Router();

/**
 * GET /api/trading-context
 * Retrieves the user's trading context settings and risk management parameters.
 * Query: ?uid=... (optional, defaults to 'default_trader')
 */
router.get('/', async (req, res) => {
  const uid = req.query.uid || 'default_trader';

  try {
    // Check Redis cache first
    const cached = await redis.get(`trading_context:${uid}`).catch(() => null);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Fetch from Firestore
    const docRef = firestore.collection('users').doc(uid).collection('settings').doc('tradingContext');
    const docSnap = await docRef.get();

    const defaultConfig = {
      accountBalance: 10000,
      riskPerTradePct: 1.0,
      maxDailyLossPct: 3.0,
      maxConsecutiveLossCap: 3,
      todayLossUsd: 0,
      consecutiveLosses: 0,
      updatedAt: new Date().toISOString(),
    };

    const data = docSnap.exists ? { ...defaultConfig, ...docSnap.data() } : defaultConfig;

    // Cache in Redis for 10 minutes
    await redis.set(`trading_context:${uid}`, JSON.stringify(data), 'EX', 600).catch(() => {});

    res.json(data);
  } catch (error) {
    console.error(`[TradingContext] GET error for ${uid}:`, error);
    res.status(500).json({ error: 'Failed to retrieve trading context.' });
  }
});

/**
 * POST /api/trading-context
 * Updates trading context parameters (account balance, risk %, daily loss cap).
 * Body: { uid, accountBalance, riskPerTradePct, maxDailyLossPct, maxConsecutiveLossCap }
 */
router.post('/', async (req, res) => {
  const {
    uid = 'default_trader',
    accountBalance,
    riskPerTradePct,
    maxDailyLossPct,
    maxConsecutiveLossCap,
  } = req.body;

  try {
    const docRef = firestore.collection('users').doc(uid).collection('settings').doc('tradingContext');

    const updatePayload = {
      updatedAt: new Date().toISOString(),
    };

    if (accountBalance !== undefined) updatePayload.accountBalance = Number(accountBalance);
    if (riskPerTradePct !== undefined) updatePayload.riskPerTradePct = Number(riskPerTradePct);
    if (maxDailyLossPct !== undefined) updatePayload.maxDailyLossPct = Number(maxDailyLossPct);
    if (maxConsecutiveLossCap !== undefined) updatePayload.maxConsecutiveLossCap = Number(maxConsecutiveLossCap);

    await docRef.set(updatePayload, { merge: true });

    // Fetch complete updated document
    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data();

    // Invalidate/Update Redis cache
    await redis.set(`trading_context:${uid}`, JSON.stringify(updatedData), 'EX', 600).catch(() => {});

    res.json({ success: true, data: updatedData });
  } catch (error) {
    console.error(`[TradingContext] POST error for ${uid}:`, error);
    res.status(500).json({ error: 'Failed to update trading context.' });
  }
});

module.exports = router;
