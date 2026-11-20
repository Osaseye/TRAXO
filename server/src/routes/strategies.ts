import express from 'express';
import { ALL_TRAXO_STRATEGIES, getTraxoStrategy } from '../../algorithms/traxo';
import { getParameters } from '../modules/optimizer/strategyOptimizer';

const router = express.Router();

// GET /api/strategies
router.get('/', (_req: any, res: any) => {
  const strategies = ALL_TRAXO_STRATEGIES.map((strategy) => ({
    id: strategy.id,
    name: strategy.name,
    market: strategy.market,
    supportedSymbols: strategy.supportedSymbols,
    optimalTimeframes: strategy.optimalTimeframes,
    parameters: getParameters(strategy.id),
  }));

  res.json({
    ok: true,
    count: strategies.length,
    strategies,
  });
});

// GET /api/strategies/:id
router.get('/:id', (req: any, res: any) => {
  const id = String(req.params?.id || '').trim().replace(/[\s-]+/g, '_');
  const strategy = getTraxoStrategy(id);
  if (!strategy) {
    res.status(404).json({ ok: false, error: `Unknown TRAXO strategy: ${req.params?.id}` });
    return;
  }

  res.json({
    ok: true,
    strategy: {
      id: strategy.id,
      name: strategy.name,
      market: strategy.market,
      supportedSymbols: strategy.supportedSymbols,
      optimalTimeframes: strategy.optimalTimeframes,
      parameters: getParameters(strategy.id),
    },
  });
});

export default router;
