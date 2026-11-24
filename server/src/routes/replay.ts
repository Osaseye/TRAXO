import express from 'express';
import { requireAuthenticatedUid } from '../modules/auth/requestAuth';
import { offlineReplayController } from '../modules/replay/offlineReplayController';

const router = express.Router();

router.get('/status', (_req: any, res: any) => {
  res.json({ ok: true, status: offlineReplayController.getStatus() });
});

router.post('/start', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const body = req.body || {};
    const status = offlineReplayController.startReplay({
      uid,
      symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      timeframe: body.timeframe ? String(body.timeframe) : undefined,
      startTime: body.startTime !== undefined ? Number(body.startTime) : undefined,
      endTime: body.endTime !== undefined ? Number(body.endTime) : undefined,
      speedMs: body.speedMs !== undefined ? Number(body.speedMs) : undefined,
      seedIfEmpty: body.seedIfEmpty !== false,
    });
    res.json({ ok: true, status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to start replay' });
  }
});

router.post('/pause', (_req: any, res: any) => {
  res.json({ ok: true, status: offlineReplayController.pauseReplay() });
});

router.post('/resume', (_req: any, res: any) => {
  res.json({ ok: true, status: offlineReplayController.resumeReplay() });
});

router.post('/stop', (_req: any, res: any) => {
  res.json({ ok: true, status: offlineReplayController.stopReplay() });
});

router.post('/step', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const bars = req.body?.bars !== undefined ? Number(req.body.bars) : 1;
    const status = await offlineReplayController.stepReplay(bars, {
      uid,
      symbols: Array.isArray(req.body?.symbols) ? req.body.symbols : undefined,
      timeframe: req.body?.timeframe ? String(req.body.timeframe) : undefined,
    });
    res.json({ ok: true, status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to step replay' });
  }
});

export default router;
