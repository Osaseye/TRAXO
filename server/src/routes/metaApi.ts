import express from 'express';
import * as metaApiService from '../modules/execution/metaApiService';
import { paperBrokerService } from '../modules/execution/paperBrokerService';
import { admin } from '../modules/market-data/firebaseAdmin';
import {
  getPaperBackupStatus,
  syncPaperStateToCloudBackup,
} from '../modules/storage/paperCloudBackup';

const router = express.Router();

function sanitizeUid(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return '';
  }
  return trimmed.replace(/[^a-zA-Z0-9_.:@-]/g, '').slice(0, 128);
}

/**
 * Resolves the active user identifier from a verified Firebase Bearer token,
 * falling back to explicit UID headers/params or 'default_trader'.
 */
export async function resolveRequestUid(req: any): Promise<string> {
  const authHeader = typeof req?.headers?.authorization === 'string' ? req.headers.authorization.trim() : '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (
      token &&
      token !== 'null' &&
      token !== 'undefined' &&
      Array.isArray(admin?.apps) &&
      admin.apps.length > 0
    ) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        const verifiedUid = sanitizeUid(decoded?.uid);
        if (verifiedUid) {
          return verifiedUid;
        }
      } catch {
        // Fall through to header/query/body fallback when token verification fails
      }
    }
  }

  const candidates = [
    req?.headers?.['x-traxo-uid'],
    req?.query?.uid,
    req?.body?.uid,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeUid(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  return 'default_trader';
}

router.get('/mode', (_req: any, res: any) => {
  res.json({ mode: metaApiService.getExecutionMode() });
});

router.post('/mode', (req: any, res: any) => {
  const mode = String(req.body?.mode || '').toLowerCase() === 'metaapi' ? 'metaapi' : 'paper';
  const active = metaApiService.setExecutionMode(mode);
  res.json({ ok: true, mode: active });
});

router.post('/paper/reset-account', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const balance = Number(req.body?.balance ?? req.body?.startingBalance ?? 10000);
    const clearTrades = Boolean(req.body?.clearTrades);
    const updated = await paperBrokerService.resetOrSetPaperBalance(uid, balance, clearTrades);
    res.json({ ok: true, account: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/account/reset', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const balance = Number(req.body?.balance ?? req.body?.startingBalance ?? 10000);
    const clearTrades = Boolean(req.body?.clearTrades);
    const updated = await paperBrokerService.resetOrSetPaperBalance(uid, balance, clearTrades);
    res.json({ ok: true, account: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/trades', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
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
    const uid = await resolveRequestUid(req);
    const tradeId = String(req.params?.tradeId || '').trim();
    if (!tradeId) {
      res.status(400).json({ ok: false, error: 'Missing tradeId' });
      return;
    }
    const replay = paperBrokerService.getTradeReplay(tradeId);
    if (!replay || (replay.trade?.uid && replay.trade.uid !== uid)) {
      res.status(404).json({ ok: false, error: `Paper trade '${tradeId}' not found` });
      return;
    }
    res.json({ ok: true, replay });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/backup/status', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const status = await getPaperBackupStatus(uid);
    res.json({ ok: true, ...status });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/backup/sync', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const result = await syncPaperStateToCloudBackup(uid);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/account', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const info = await metaApiService.getAccountInfo(uid);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/positions', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const positions = await metaApiService.getOpenPositions(uid);
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

router.get('/orders', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const orders = await metaApiService.getOpenOrders(uid);
    res.json({ ok: true, orders });
  } catch (error: any) {
    res.status(500).json({ ok: false, orders: [], error: error.message });
  }
});

router.post('/orders/cancel', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const { orderId } = req.body || {};
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Missing orderId' });
      return;
    }
    const result = await metaApiService.cancelOrder(String(orderId), uid);
    res.json({ ok: result.success, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete('/orders/:orderId', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ ok: false, error: 'Missing orderId' });
      return;
    }
    const result = await metaApiService.cancelOrder(String(orderId), uid);
    res.json({ ok: result.success, ...result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/execute', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
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

    const result = await metaApiService.executeTrade({
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
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/close', async (req: any, res: any) => {
  try {
    const uid = await resolveRequestUid(req);
    const { positionId } = req.body || {};
    if (!positionId) {
      res.status(400).json({ error: 'Missing positionId' });
      return;
    }
    const result = await metaApiService.closePosition(String(positionId), undefined, uid);
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
