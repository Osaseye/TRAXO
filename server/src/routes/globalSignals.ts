import express from 'express';
import {
  getGlobalScanStatus,
  getGlobalSignals,
  startGlobalSignalScannerIfNeeded,
} from '../modules/scanner/globalSignalScanner';

const router = express.Router();

// GET /api/global-signals/status
router.get('/status', (_req: any, res: any) => {
  res.json({
    ok: true,
    ...getGlobalScanStatus(),
  });
});

// GET /api/global-signals?symbol=EURUSD&timeframe=15m&strategyIds=wick_rejection,order_block&limit=100
router.get('/', async (req: any, res: any) => {
  try {
    startGlobalSignalScannerIfNeeded();

    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const timeframe = req.query.timeframe ? String(req.query.timeframe) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const strategyIdsRaw = req.query.strategyIds ? String(req.query.strategyIds) : undefined;

    const strategyIds = strategyIdsRaw
      ? strategyIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const signals = await getGlobalSignals({
      symbol: symbol || null,
      timeframe: timeframe || null,
      strategyIds: strategyIds || null,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    res.json({
      ok: true,
      signals,
    });
  } catch (err: any) {
    console.error('[route:global-signals] Error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});

export default router;
