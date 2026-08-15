const express = require('express');
const {
  getAccountInfo,
  executeTrade,
  getOpenPositions,
  closePosition,
  setAutoTradeEnabled,
  getAutoTradeEnabled,
} = require('../services/metaApiService');

const router = express.Router();

/**
 * GET /api/metaapi/account
 */
router.get('/account', async (req, res) => {
  try {
    const info = await getAccountInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metaapi/positions
 */
router.get('/positions', async (req, res) => {
  try {
    const positions = await getOpenPositions();
    res.json({ positions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/metaapi/execute
 */
router.post('/execute', async (req, res) => {
  const { symbol, action, volume, sl, tp } = req.body;
  if (!symbol || !action) {
    return res.status(400).json({ error: 'symbol and action are required' });
  }
  try {
    const result = await executeTrade({ symbol, action, volume, sl, tp });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/metaapi/close
 */
router.post('/close', async (req, res) => {
  const { positionId } = req.body;
  if (!positionId) {
    return res.status(400).json({ error: 'positionId is required' });
  }
  try {
    const result = await closePosition(positionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET & POST /api/metaapi/auto-trade
 */
router.get('/auto-trade', (req, res) => {
  res.json({ autoTradeEnabled: getAutoTradeEnabled() });
});

router.post('/auto-trade', (req, res) => {
  const { enabled } = req.body;
  const status = setAutoTradeEnabled(enabled);
  res.json({ autoTradeEnabled: status });
});

module.exports = router;
