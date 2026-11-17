import express from 'express';
import {
  getOptimizationDiagnostics,
  processResolvedLoss,
  processResolvedWin,
  resetToFactoryDefaults,
  setFeedbackEngineEnabled,
} from '../modules/optimizer/strategyOptimizer';

const router = express.Router();

// GET /api/strategy-optimization/status
router.get('/status', (_req: any, res: any) => {
  try {
    res.json(getOptimizationDiagnostics());
  } catch (err: any) {
    console.error('[OptimizerRoute] Error reading status:', err);
    res.status(500).json({ error: 'Failed to get optimization status' });
  }
});

// POST /api/strategy-optimization/analyze-loss
router.post('/analyze-loss', async (req: any, res: any) => {
  try {
    const signal = req.body;
    if (!signal || (!signal.symbol && !signal.strategyId && !signal.strategy)) {
      res.status(400).json({ error: 'Invalid signal payload provided for loss analysis' });
      return;
    }

    const result = await processResolvedLoss(signal);
    res.json({
      ok: true,
      result,
      diagnostics: getOptimizationDiagnostics(),
    });
  } catch (err: any) {
    console.error('[OptimizerRoute] Error analyzing loss:', err);
    res.status(500).json({ error: 'Failed to analyze trade loss' });
  }
});

// POST /api/strategy-optimization/analyze-win
router.post('/analyze-win', async (req: any, res: any) => {
  try {
    const signal = req.body;
    if (!signal || (!signal.symbol && !signal.strategyId && !signal.strategy)) {
      res.status(400).json({ error: 'Invalid signal payload provided for win analysis' });
      return;
    }

    const result = await processResolvedWin(signal);
    res.json({
      ok: true,
      result,
      diagnostics: getOptimizationDiagnostics(),
    });
  } catch (err: any) {
    console.error('[OptimizerRoute] Error analyzing win:', err);
    res.status(500).json({ error: 'Failed to analyze trade win' });
  }
});

// POST /api/strategy-optimization/toggle
router.post('/toggle', (req: any, res: any) => {
  try {
    const { enabled } = req.body || {};
    const status = setFeedbackEngineEnabled(Boolean(enabled));
    res.json({ isFeedbackEngineEnabled: status });
  } catch (err: any) {
    console.error('[OptimizerRoute] Error toggling feedback engine:', err);
    res.status(500).json({ error: 'Failed to toggle feedback engine' });
  }
});

// POST /api/strategy-optimization/reset
router.post('/reset', async (_req: any, res: any) => {
  try {
    const result = await resetToFactoryDefaults();
    res.json(result);
  } catch (err: any) {
    console.error('[OptimizerRoute] Error resetting parameters:', err);
    res.status(500).json({ error: 'Failed to reset parameters' });
  }
});

export default router;
