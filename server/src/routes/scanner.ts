import express from 'express';
import { normalizeSymbol } from '../config/instruments';
import redis from '../modules/market-data/redisClient';
import { getRiskRuntimeState } from '../modules/risk/guardrails';
import { getGlobalScanStatus } from '../modules/scanner/globalSignalScanner';
import { triggerScanAsync } from '../modules/scanner/scannerCron';

const router = express.Router();

function scanKeys(pattern: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const found: string[] = [];
    const stream = redis.scanStream({ match: pattern, count: 200 });
    stream.on('data', (batch: string[]) => found.push(...batch));
    stream.on('end', () => resolve(found));
    stream.on('error', reject);
  });
}

// GET /api/scanner/status
router.get('/status', async (_req: any, res: any) => {
  const scanState = getGlobalScanStatus();
  const riskState = await getRiskRuntimeState().catch(() => null);

  try {
    await redis.ping();
    res.status(200).json({
      status: 'ok',
      message: 'Scanner is running and connected to Redis.',
      redis: 'connected',
      scanState,
      riskState,
    });
  } catch (error) {
    console.error('Error pinging Redis in /api/scanner/status:', error);
    res.status(503).json({
      status: 'error',
      message: 'Scanner is running, but Redis connection failed.',
      redis: 'disconnected',
      scanState,
      riskState,
    });
  }
});

// POST /api/scanner/trigger and /api/scanner/scan
const handleTrigger = (_req: any, res: any) => {
  const status = triggerScanAsync();
  res.json({ ok: true, ...status });
};
router.post('/trigger', handleTrigger);
router.post('/scan', handleTrigger);

// GET /api/scanner/rejects (?symbol=&timeframe= or all recent rejects)
router.get('/rejects', async (req: any, res: any) => {
  try {
    const rawSymbol = req.query.symbol ? String(req.query.symbol) : '';
    const timeframe = req.query.timeframe ? String(req.query.timeframe) : '';

    if (rawSymbol && timeframe) {
      const cleanSymbol = normalizeSymbol(rawSymbol);
      let data = await redis.get(`scan_rejects:${cleanSymbol}:${timeframe}`);
      if (!data && cleanSymbol !== rawSymbol) {
        data = await redis.get(`scan_rejects:${rawSymbol}:${timeframe}`);
      }
      res.json({
        status: 'ok',
        symbol: rawSymbol,
        timeframe,
        rejects: data ? JSON.parse(data) : null,
      });
      return;
    }

    const [allKeys, rawGuardrailEvents] = await Promise.all([
      scanKeys('scan_rejects:*').catch(() => [] as string[]),
      redis.lrange('scan_rejects:guardrails', 0, 99).catch(() => [] as string[]),
    ]);

    const pairKeys = allKeys.filter((k) => k !== 'scan_rejects:guardrails');
    const items: Array<{ symbol: string; timeframe: string; rejects: any }> = [];

    if (pairKeys.length > 0) {
      const values = await redis.mget(pairKeys).catch(() => [] as Array<string | null>);
      pairKeys.forEach((key, idx) => {
        const rawVal = values[idx];
        if (!rawVal) return;
        const parts = key.split(':');
        const sym = parts[1] || '';
        const tf = parts.slice(2).join(':') || '';
        try {
          items.push({ symbol: sym, timeframe: tf, rejects: JSON.parse(rawVal) });
        } catch {}
      });
    }

    const guardrailRejects = rawGuardrailEvents
      .map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({
      status: 'ok',
      items,
      guardrailRejects,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
