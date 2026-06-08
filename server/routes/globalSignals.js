const express = require('express')

const {
  getGlobalScanStatus,
  getGlobalSignals,
} = require('../services/globalSignalScanner')

const router = express.Router()

// GET /api/global-signals/status
router.get('/status', (req, res) => {
  try {
    res.json({ ok: true, ...getGlobalScanStatus() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error' })
  }
})

// GET /api/global-signals?symbol=&timeframe=&strategyIds=&limit=
router.get('/', async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      strategyIds,
      limit,
    } = req.query

    const parsedLimit = Number(limit ?? 50)
    const ids =
      typeof strategyIds === 'string' && strategyIds.trim().length > 0
        ? strategyIds.split(',').map((s) => s.trim()).filter(Boolean)
        : null

    const signals = await getGlobalSignals({
      symbol: symbol || null,
      timeframe: timeframe || null,
      strategyIds: ids,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
    })

    res.json({ ok: true, signals })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error' })
  }
})

module.exports = router
