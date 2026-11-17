import express from 'express';
import * as metaApiService from '../modules/execution/metaApiService';

const router = express.Router();

router.get('/account', async (_req: any, res: any) => {
  try {
    const info = await metaApiService.getAccountInfo();
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/positions', async (_req: any, res: any) => {
  try {
    const positions = await metaApiService.getOpenPositions();
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/quote', async (req: any, res: any) => {
  const symbol = req.query?.symbol ? String(req.query.symbol).trim() : '';
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'Missing symbol query parameter' });
    return;
  }

  try {
    const quote = await metaApiService.getSymbolQuote(symbol);
    res.json(quote);
  } catch (error: any) {
    res.status(500).json({ ok: false, symbol, error: error.message });
  }
});

router.get('/orders', async (_req: any, res: any) => {
  try {
    const orders = await metaApiService.getOpenOrders();
    res.json({ ok: true, orders });
  } catch (error: any) {
    res.status(500).json({ ok: false, orders: [], error: error.message });
  }
});

router.post('/orders/cancel', async (req: any, res: any) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Missing orderId' });
      return;
    }
    const result = await metaApiService.cancelOrder(String(orderId));
    res.json({ ok: result.success, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete('/orders/:orderId', async (req: any, res: any) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Missing orderId' });
      return;
    }
    const result = await metaApiService.cancelOrder(String(orderId));
    res.json({ ok: result.success, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/execute', async (req: any, res: any) => {
  try {
    const { symbol, action, volume, sl, tp, entryType, price, openPrice, limitPrice, comment } =
      req.body || {};
    if (!symbol || !action) {
      res.status(400).json({ error: 'Missing symbol or action' });
      return;
    }

    const result = await metaApiService.executeTrade({
      symbol,
      action,
      volume: volume ? Number(volume) : 0.01,
      sl: sl ? Number(sl) : undefined,
      tp: tp ? Number(tp) : undefined,
      entryType: entryType === 'limit' ? 'limit' : 'market',
      price: price != null ? Number(price) : undefined,
      openPrice: openPrice != null ? Number(openPrice) : undefined,
      limitPrice: limitPrice != null ? Number(limitPrice) : undefined,
      comment,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/close', async (req: any, res: any) => {
  try {
    const { positionId } = req.body || {};
    if (!positionId) {
      res.status(400).json({ error: 'Missing positionId' });
      return;
    }
    const result = await metaApiService.closePosition(String(positionId));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auto-trade', (_req: any, res: any) => {
  res.json({ autoTradeEnabled: metaApiService.getAutoTradeEnabled() });
});

router.post('/auto-trade', (req: any, res: any) => {
  const { enabled } = req.body || {};
  const status = metaApiService.setAutoTradeEnabled(Boolean(enabled));
  res.json({ autoTradeEnabled: status });
});

export default router;
