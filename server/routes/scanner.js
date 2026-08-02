const express = require('express');
const redis = require('../services/redisClient');

const router = express.Router();

/**
 * GET /api/scanner/status
 * Provides the current status of the scanning service.
 */
router.get('/status', async (req, res) => {
  try {
    // We can expand this with more detailed stats later.
    // For now, a simple connectivity check to Redis is a good indicator.
    const pong = await redis.ping();
    if (pong === 'PONG') {
      res.json({ status: 'ok', message: 'Scanner is operational.', redis: 'connected' });
    } else {
      res.status(503).json({ status: 'error', message: 'Cannot connect to Redis.' });
    }
  } catch (error) {
    console.error('Scanner status check failed:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

/**
 * GET /api/scanner/rejects
 * Fetch the latest scan rejection reasons for a given symbol and timeframe.
 */
router.get('/rejects', async (req, res) => {
  const { symbol, timeframe } = req.query;
  if (!symbol || !timeframe) {
    return res.status(400).json({ status: 'error', message: 'Missing symbol or timeframe' });
  }

  try {
    const data = await redis.get(`scan_rejects:${symbol}:${timeframe}`);
    if (!data) {
      return res.json({ status: 'ok', rejects: null });
    }
    res.json({ status: 'ok', rejects: JSON.parse(data) });
  } catch (error) {
    console.error('Error fetching scan rejects from Redis:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

module.exports = router;
