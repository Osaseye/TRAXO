import express from 'express';
import { requireAuthenticatedUid } from '../modules/auth/requestAuth';
import {
  getUserTradingConfig,
  saveUserTradingConfig,
  setUserAutoTradeEnabled,
} from '../modules/execution/paperAutoTraderRegistry';
import { paperBrokerService } from '../modules/execution/paperBrokerService';
import { notifyExternalBrokersOnExecution } from '../modules/brokers/brokerRouter';
import {
  ensureUserPaperHydrated,
  getPaperBackupStatus,
  syncPaperStateToCloudBackup,
} from '../modules/storage/paperCloudBackup';

const router = express.Router();

router.get('/mode', (_req: any, res: any) => {
  res.json({ mode: 'paper' });
});

router.post('/mode', (_req: any, res: any) => {
  res.json({ ok: true, mode: 'paper' });
});

router.get('/quotes', async (_req: any, res: any) => {
  try {
    const quotes = await paperBrokerService.getAllInstrumentQuotes();
    res.json({ ok: true, quotes });
  } catch (error: any) {
    res.status(500).json({ ok: false, quotes: [], error: error.message });
  }
});

router.get('/quote', async (req: any, res: any) => {
  const symbol = req.query?.symbol ? String(req.query.symbol).trim() : '';
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'Missing symbol query parameter' });
    return;
  }

  try {
    const quote = await paperBrokerService.getSymbolQuote(symbol);
    res.json(quote);
  } catch (error: any) {
    res.status(500).json({ ok: false, symbol, error: error.message });
  }
});

router.get('/account', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await ensureUserPaperHydrated(uid);
    const info = await paperBrokerService.getAccountInfo(uid);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/positions', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await ensureUserPaperHydrated(uid);
    const positions = await paperBrokerService.getOpenPositions(uid);
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/orders', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await ensureUserPaperHydrated(uid);
    const orders = await paperBrokerService.getOpenOrders(uid);
    res.json({ ok: true, orders });
  } catch (error: any) {
    res.status(500).json({ ok: false, orders: [], error: error.message });
  }
});

router.post('/orders/cancel', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const { orderId } = req.body || {};
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Missing orderId' });
      return;
    }
    const result = await paperBrokerService.cancelOrder(String(orderId), uid);
    res.json({ ok: result.success, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete('/orders/:orderId', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Missing orderId' });
      return;
    }
    const result = await paperBrokerService.cancelOrder(String(orderId), uid);
    res.json({ ok: result.success, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/trades', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await ensureUserPaperHydrated(uid);
    const status = req.query?.status ? String(req.query.status) : undefined;
    const limit = req.query?.limit ? Number(req.query.limit) : 200;
    const trades = paperBrokerService.getAllTrades(uid, status, limit);
    const summary = paperBrokerService.getPerformanceSummary(uid);
    res.json({ ok: true, trades, summary });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/trades/:tradeId/replay', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await ensureUserPaperHydrated(uid);
    const tradeId = String(req.params?.tradeId || '').trim();
    if (!tradeId) {
      res.status(400).json({ ok: false, error: 'Missing tradeId' });
      return;
    }
    const replay = paperBrokerService.getTradeReplay(tradeId);
    if (!replay || replay.trade?.uid !== uid) {
      res.status(404).json({ ok: false, error: `Paper trade '${tradeId}' not found` });
      return;
    }
    res.json({ ok: true, replay });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/execute', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await ensureUserPaperHydrated(uid);
    const {
      symbol,
      action,
      volume,
      sl,
      tp,
      tp2,
      entryType,
      rawEntryType,
      price,
      openPrice,
      limitPrice,
      referencePrice,
      timeframe,
      market,
      strategyId,
      strategyLabel,
      tier,
      signalId,
      riskAmountUsd,
      rr,
      confidence,
      signalTime,
      reasons,
      confluence,
      comment,
    } = req.body || {};

    if (!symbol || !action) {
      res.status(400).json({ error: 'Missing symbol or action' });
      return;
    }

    const result = await paperBrokerService.executeTrade({
      uid,
      symbol,
      action,
      volume: volume ? Number(volume) : 0.01,
      sl: sl ? Number(sl) : undefined,
      tp: tp ? Number(tp) : undefined,
      tp2: tp2 != null ? Number(tp2) : undefined,
      entryType: entryType === 'limit' ? 'limit' : entryType === 'stop' ? 'stop' : 'market',
      rawEntryType: rawEntryType ? String(rawEntryType) : undefined,
      price: price != null ? Number(price) : undefined,
      openPrice: openPrice != null ? Number(openPrice) : undefined,
      limitPrice: limitPrice != null ? Number(limitPrice) : undefined,
      referencePrice: referencePrice != null ? Number(referencePrice) : undefined,
      timeframe: timeframe ? String(timeframe) : undefined,
      market: market ? String(market) : undefined,
      strategyId: strategyId ? String(strategyId) : undefined,
      strategyLabel: strategyLabel ? String(strategyLabel) : undefined,
      tier: tier ? String(tier) : undefined,
      signalId: signalId ? String(signalId) : undefined,
      riskAmountUsd: riskAmountUsd != null ? Number(riskAmountUsd) : undefined,
      rr: rr != null ? Number(rr) : undefined,
      confidence: confidence != null ? Number(confidence) : undefined,
      signalTime: signalTime != null ? Number(signalTime) : undefined,
      reasons: Array.isArray(reasons) ? reasons : undefined,
      confluence,
      comment,
    });
    if (result?.success) {
      const actionUpper = String(action || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const entryUpper =
        entryType === 'limit' ? 'LIMIT' : entryType === 'stop' ? 'STOP' : 'MARKET';
      void notifyExternalBrokersOnExecution(uid, {
        tradeId: result.tradeId,
        signalId: signalId ? String(signalId) : undefined,
        symbol: result.symbol || String(symbol),
        action: actionUpper,
        entryType: entryUpper,
        price: result.price ?? Number(price ?? openPrice ?? limitPrice ?? referencePrice ?? 0),
        sl: result.sl ?? (sl ? Number(sl) : undefined),
        tp1: result.tp ?? (tp ? Number(tp) : undefined),
        tp2: result.tp2 ?? (tp2 != null ? Number(tp2) : undefined),
        volume: result.volume ?? (volume ? Number(volume) : 0.01),
        riskAmountUsd: riskAmountUsd != null ? Number(riskAmountUsd) : undefined,
        timeframe: timeframe ? String(timeframe) : undefined,
        strategyId: strategyId ? String(strategyId) : undefined,
        strategyLabel: strategyLabel ? String(strategyLabel) : undefined,
        confidence: confidence != null ? Number(confidence) : undefined,
        rr: rr != null ? Number(rr) : undefined,
        triggerSource: 'manual',
      });
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/close', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const { positionId } = req.body || {};
    if (!positionId) {
      res.status(400).json({ error: 'Missing positionId' });
      return;
    }
    const result = await paperBrokerService.closePosition(String(positionId), undefined, uid);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function handleResetAccount(req: any, res: any): Promise<void> {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const balance = Number(req.body?.balance ?? req.body?.startingBalance ?? 10000);
    const clearTrades = Boolean(req.body?.clearTrades);
    const updated = await paperBrokerService.resetOrSetPaperBalance(uid, balance, clearTrades);
    await saveUserTradingConfig(uid, { accountBalance: updated.balance }).catch(() => {});
    res.json({ ok: true, account: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

router.post('/reset-account', handleResetAccount);
router.post('/paper/reset-account', handleResetAccount);
router.post('/account/reset', handleResetAccount);

router.get('/auto-trade', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const cfg = await getUserTradingConfig(uid);
    res.json({ autoTradeEnabled: cfg.autoTradeEnabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/auto-trade', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const cfg = await setUserAutoTradeEnabled(uid, Boolean(req.body?.enabled));
    res.json({ autoTradeEnabled: cfg.autoTradeEnabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/backup/status', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const status = await getPaperBackupStatus(uid);
    res.json({ ok: true, ...status });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/backup/sync', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const result = await syncPaperStateToCloudBackup(uid);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
