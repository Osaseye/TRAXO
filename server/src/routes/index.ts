import { getAvailableCount, getStatus as getKeyStatus } from '../modules/market-data/keyRotator';
import accessCodesRouter from './accessCodes';
import authRouter, { setupAuthRoutes } from './auth';
import brokersRouter from './brokers';
import candlesRouter from './candles';
import globalSignalsRouter from './globalSignals';
import journalRouter from './journal';
import newsRouter from './news';
import newsV1Router from '../services/news/newsRoutes';
import paperBrokerRouter from './paperBroker';
import replayRouter from './replay';
import scannerRouter from './scanner';
import signalsRouter from './signals';
import strategiesRouter from './strategies';
import strategyOptimizationRouter from './strategyOptimization';
import tradingContextRouter from './tradingContext';

export function registerRoutes(app: any): void {
  app.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      twelvedata: {
        availableKeys: getAvailableCount(),
        keys: getKeyStatus(),
      },
    });
  });

  app.use('/api/news', newsRouter);
  app.use('/api/v1/news', newsV1Router);
  app.use('/api/signals', signalsRouter);
  app.use('/api/strategies', strategiesRouter);
  app.use('/api/candles', candlesRouter);
  app.use('/api/scanner', scannerRouter);
  app.use('/api/global-signals', globalSignalsRouter);
  app.use('/api/trading-context', tradingContextRouter);
  app.use('/api/journal', journalRouter);
  app.use('/api/paper', paperBrokerRouter);
  app.use('/api/execution', paperBrokerRouter);
  app.use('/api/metaapi', paperBrokerRouter);
  app.use('/api/meta-api', paperBrokerRouter);
  app.use('/api/replay', replayRouter);
  app.use('/api/strategy-optimization', strategyOptimizationRouter);
  app.use('/api/access-codes', accessCodesRouter);
  app.use('/api/brokers', brokersRouter);
  app.use('/api/auth', authRouter);

  // Preserve legacy auth endpoints (/verify-token, /api/profile, /api/trades)
  setupAuthRoutes(app);
}
