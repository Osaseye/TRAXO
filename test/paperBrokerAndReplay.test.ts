import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';

process.env.TRAXO_NO_LISTEN = 'true';
const tmpDbPath = path.join(os.tmpdir(), `traxo_paper_test_${Date.now()}.db`);
process.env.TRAXO_SQLITE_PATH = tmpDbPath;

import { createApp } from '../server/src/index';
import { assignDynamicExitMode } from '../server/src/modules/execution/executionBroker';
import { paperBrokerService } from '../server/src/modules/execution/paperBrokerService';
import { computeDollarPnl } from '../server/src/modules/execution/tradeResolutionEngine';
import { closeRedis, backupRedis } from '../server/src/modules/market-data/redisClient';
import { offlineReplayController } from '../server/src/modules/replay/offlineReplayController';
import {
  hydratePaperStateFromCloudBackup,
  syncPaperStateToCloudBackup,
} from '../server/src/modules/storage/paperCloudBackup';
import {
  getCandlesAroundWindow,
  queryCandles,
  resetDbForTests,
  upsertCandles,
} from '../server/src/modules/storage/sqliteDb';
import type { MarketCandle } from '../server/src/modules/market-data/marketDataService';

function makeBars(params: {
  startSec: number;
  count: number;
  stepSec: number;
  basePrice: number;
  delta?: number;
}): MarketCandle[] {
  const out: MarketCandle[] = [];
  let p = params.basePrice;
  const d = params.delta ?? 0;
  for (let i = 0; i < params.count; i++) {
    const time = params.startSec + i * params.stepSec;
    const open = p;
    const close = Number((p + d).toFixed(5));
    const high = Number((Math.max(open, close) + 0.0004).toFixed(5));
    const low = Number((Math.min(open, close) - 0.0004).toFixed(5));
    out.push({
      time,
      timestamp: new Date(time * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1200,
    });
    p = close;
  }
  return out;
}

async function runTests() {
  resetDbForTests(tmpDbPath);

  const runSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const TEST_UID = `test_uid_alpha_${runSuffix}`;
  const OTHER_UID = `test_uid_beta_${runSuffix}`;

  // -------------------------------------------------------------------------
  // 1. SQLite Storage & Candle Window Queries
  // -------------------------------------------------------------------------
  const baseSec = 1_795_000_000; // Clean epoch second alignment
  const preBars = makeBars({ startSec: baseSec, count: 65, stepSec: 900, basePrice: 1.084 });
  const inserted = upsertCandles('EUR/USD', '15min', preBars);
  assert.equal(inserted, 65, 'All 65 pre-entry candles should upsert into SQLite');

  const queried = queryCandles({ symbol: 'EURUSD', timeframe: '15m', limit: 100 });
  assert.equal(queried.length, 65, 'Normalized lookup EURUSD / 15m retrieves all upserted bars');
  assert.ok(queried[0].time < queried[queried.length - 1].time, 'Candles returned ascending chronologically');

  const winSlice = getCandlesAroundWindow(
    'EURUSD',
    '15m',
    preBars[60].time,
    preBars[64].time,
    60,
    20
  );
  assert.equal(winSlice.preCount, 60, 'Captures 60 pre-entry bars');
  assert.equal(winSlice.tradeCount, 5, 'Captures trade duration bars');

  // -------------------------------------------------------------------------
  // 2. Paper Broker Account Initialization, Reset & Bid/Ask Spread Quotes
  // -------------------------------------------------------------------------
  const initialAcc = await paperBrokerService.getAccountInfo(TEST_UID);
  assert.equal(initialAcc.connected, true);
  assert.equal(initialAcc.mode, 'paper');
  assert.equal(initialAcc.balance, 10000);

  const resetAcc = await paperBrokerService.resetOrSetPaperBalance(TEST_UID, 25000, true);
  assert.equal(resetAcc.balance, 25000, 'Paper balance resets cleanly to $25,000');

  const quote = await paperBrokerService.getSymbolQuote('EURUSD');
  assert.equal(quote.ok, true);
  assert.ok(quote.bid! < quote.ask!, 'Synthetic quote generates positive Bid/Ask spread');

  // -------------------------------------------------------------------------
  // 3. Dynamic Exit Policy Assignment (FULL_TP1 vs SCALE_50_TP1_BE_TP2)
  // -------------------------------------------------------------------------
  assert.equal(
    assignDynamicExitMode({
      strategyId: 'traxo_velocity_orb',
      market: 'FUTURES',
      tier: 'PRIME',
      volume: 1,
      tp2: 21100,
    }),
    'FULL_TP1',
    'Single MNQ contract cannot split -> FULL_TP1'
  );
  assert.equal(
    assignDynamicExitMode({
      strategyId: 'traxo_london_apex',
      market: 'FOREX',
      tier: 'PRIME',
      volume: 0.01,
      tp2: 1.092,
    }),
    'FULL_TP1',
    '0.01 micro-lot cannot split -> FULL_TP1'
  );
  assert.equal(
    assignDynamicExitMode({
      strategyId: 'traxo_mean_equilibrium',
      market: 'FUTURES',
      tier: 'PRIME',
      volume: 4,
      tp2: 21080,
    }),
    'FULL_TP1',
    'Mean-reversion snapback archetype -> FULL_TP1'
  );
  assert.equal(
    assignDynamicExitMode({
      strategyId: 'traxo_london_apex',
      market: 'FOREX',
      tier: 'AGGRESSIVE',
      volume: 0.2,
      tp2: 1.092,
    }),
    'FULL_TP1',
    'AGGRESSIVE confluence (<6 pts) -> FULL_TP1'
  );
  assert.equal(
    assignDynamicExitMode({
      strategyId: 'traxo_london_apex',
      market: 'FOREX',
      tier: 'PRIME',
      volume: 0.2,
      tp2: 1.092,
    }),
    'SCALE_50_TP1_BE_TP2',
    'PRIME expansion setup with 0.20 lots & TP2 -> SCALE_50_TP1_BE_TP2'
  );

  // -------------------------------------------------------------------------
  // 4. Case A: FULL_TP1 Win + Balance Delta + Frozen Replay Snapshot
  // -------------------------------------------------------------------------
  await paperBrokerService.resetOrSetPaperBalance(TEST_UID, 25000, true);
  const t0 = preBars[preBars.length - 1].time;
  const fullTpRes = await paperBrokerService.executeTrade({
    uid: TEST_UID,
    signalId: 'sig_full_tp1',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_sovereign_fix',
    strategyLabel: 'TRAXO Sovereign Fix',
    tier: 'PRIME',
    action: 'BUY',
    volume: 0.2,
    sl: 1.082,
    tp: 1.0865,
    tp2: 1.089,
    riskAmountUsd: 400,
    rr: 2.25,
    confidence: 82,
    entryType: 'market',
    referencePrice: 1.084,
    signalTime: t0,
  });
  assert.equal(fullTpRes.exitMode, 'FULL_TP1');

  const tpBarA: MarketCandle = {
    time: t0 + 900,
    timestamp: new Date((t0 + 900) * 1000).toISOString(),
    open: 1.0842,
    high: 1.087,
    low: 1.0835,
    close: 1.0866,
    volume: 1500,
  };
  upsertCandles('EURUSD', '15m', [tpBarA]);
  await paperBrokerService.resolveSymbolOnCandle('EURUSD', '15m', tpBarA);

  const tradeA = paperBrokerService.getTradeById(fullTpRes.tradeId!)!;
  assert.equal(tradeA.status, 'WIN_TP1');
  assert.equal(tradeA.openVolume, 0);
  const expectedPnlA = computeDollarPnl({
    symbol: 'EURUSD',
    direction: 'BUY',
    entryPrice: tradeA.fillPrice!,
    exitPrice: 1.0865,
    volume: 0.2,
  });
  assert.equal(tradeA.realizedPnlUsd, expectedPnlA);
  const snapA = paperBrokerService.getTradeReplay(tradeA.id);
  assert.ok(snapA && snapA.candles.length >= 60, 'Frozen replay snapshot captures pre-entry + trade bars');

  // -------------------------------------------------------------------------
  // 5. Case B: SCALE_50_TP1_BE_TP2 Full Runner Win (TP1 -> BE -> TP2)
  // -------------------------------------------------------------------------
  const balBeforeB = (await paperBrokerService.getAccountInfo(TEST_UID)).balance;
  const scaleRes = await paperBrokerService.executeTrade({
    uid: TEST_UID,
    signalId: 'sig_scale_tp2',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_london_apex',
    strategyLabel: 'TRAXO London Apex',
    tier: 'PRIME',
    action: 'BUY',
    volume: 0.2,
    sl: 1.0845,
    tp: 1.089,
    tp2: 1.092,
    riskAmountUsd: 400,
    rr: 2.0,
    confidence: 88,
    entryType: 'market',
    referencePrice: 1.0865,
    signalTime: t0 + 900,
  });
  assert.equal(scaleRes.exitMode, 'SCALE_50_TP1_BE_TP2');

  // Bar 1 clears TP1 -> should close 0.10 lot, credit TP1 profit, move SL to BE
  const scaleBar1: MarketCandle = {
    time: t0 + 1800,
    timestamp: new Date((t0 + 1800) * 1000).toISOString(),
    open: 1.0866,
    high: 1.0895,
    low: 1.0862,
    close: 1.0891,
    volume: 1700,
  };
  upsertCandles('EURUSD', '15m', [scaleBar1]);
  const res1 = await paperBrokerService.resolveSymbolOnCandle('EURUSD', '15m', scaleBar1);
  assert.equal(res1.tp1ScaledTrades.length, 1, 'Stage 1 TP1 scale-out triggers');

  const midTradeB = paperBrokerService.getTradeById(scaleRes.tradeId!)!;
  assert.equal(midTradeB.status, 'PARTIAL_TP1');
  assert.equal(midTradeB.openVolume, 0.1);
  assert.ok(midTradeB.tp1PnlUsd > 0, 'TP1 50% PnL booked immediately');
  assert.ok(midTradeB.currentSl >= midTradeB.fillPrice!, 'Stop Loss moved to Breakeven >= fillPrice');
  const balAfterTp1 = (await paperBrokerService.getAccountInfo(TEST_UID)).balance;
  assert.ok(balAfterTp1 > balBeforeB, 'Balance increases immediately after TP1 partial close');

  // Bar 2 clears TP2 -> WIN_TP2
  const scaleBar2: MarketCandle = {
    time: t0 + 2700,
    timestamp: new Date((t0 + 2700) * 1000).toISOString(),
    open: 1.0892,
    high: 1.0924,
    low: 1.0888,
    close: 1.0921,
    volume: 1900,
  };
  upsertCandles('EURUSD', '15m', [scaleBar2]);
  await paperBrokerService.resolveSymbolOnCandle('EURUSD', '15m', scaleBar2);
  const doneTradeB = paperBrokerService.getTradeById(scaleRes.tradeId!)!;
  assert.equal(doneTradeB.status, 'WIN_TP2');
  assert.ok(doneTradeB.realizedPnlUsd > doneTradeB.tp1PnlUsd, 'Runner adds TP2 profit on top of TP1');

  // -------------------------------------------------------------------------
  // 6. Case C: SCALE_50_TP1_BE_TP2 TP1 Hit -> Runner Stops at BE (WIN_TP1_BE)
  // -------------------------------------------------------------------------
  const beRes = await paperBrokerService.executeTrade({
    uid: TEST_UID,
    signalId: 'sig_scale_be',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_london_apex',
    strategyLabel: 'TRAXO London Apex',
    tier: 'STANDARD',
    action: 'BUY',
    volume: 0.2,
    sl: 1.09,
    tp: 1.094,
    tp2: 1.098,
    riskAmountUsd: 400,
    rr: 2.0,
    confidence: 80,
    entryType: 'market',
    referencePrice: 1.092,
    signalTime: t0 + 2700,
  });

  const beBar1: MarketCandle = {
    time: t0 + 3600,
    timestamp: new Date((t0 + 3600) * 1000).toISOString(),
    open: 1.0921,
    high: 1.0944,
    low: 1.0918,
    close: 1.0938,
    volume: 1600,
  };
  const beBar2: MarketCandle = {
    time: t0 + 4500,
    timestamp: new Date((t0 + 4500) * 1000).toISOString(),
    open: 1.0937,
    high: 1.0939,
    low: 1.0915,
    close: 1.0919,
    volume: 1800,
  };
  upsertCandles('EURUSD', '15m', [beBar1, beBar2]);
  await paperBrokerService.resolveSymbolOnCandle('EURUSD', '15m', beBar2);
  const doneTradeC = paperBrokerService.getTradeById(beRes.tradeId!)!;
  assert.equal(doneTradeC.status, 'WIN_TP1_BE', 'Retrace after TP1 exits at Breakeven as WIN_TP1_BE');
  assert.ok(doneTradeC.realizedPnlUsd > 0, 'WIN_TP1_BE guarantees net positive profit');

  // -------------------------------------------------------------------------
  // 7. Case D: 1m Intrabar Tie-Breaker on Same-Bar SL & TP1 Touch
  // -------------------------------------------------------------------------
  const tieTime = t0 + 5400;
  const tieRes = await paperBrokerService.executeTrade({
    uid: TEST_UID,
    signalId: 'sig_tiebreak_1m',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_london_apex',
    strategyLabel: 'TRAXO London Apex',
    tier: 'PRIME',
    action: 'BUY',
    volume: 0.2,
    sl: 1.09,
    tp: 1.094,
    tp2: 1.097,
    riskAmountUsd: 400,
    rr: 2.0,
    confidence: 86,
    entryType: 'market',
    referencePrice: 1.092,
    signalTime: t0 + 4500,
  });

  // 15m bar spans BOTH SL (1.0900) and TP1 (1.0940)
  const wild15mBar: MarketCandle = {
    time: tieTime,
    timestamp: new Date(tieTime * 1000).toISOString(),
    open: 1.092,
    high: 1.0945,
    low: 1.0895,
    close: 1.0905,
    volume: 2500,
  };
  // Archive 1m sub-candles showing minute +2 touched TP1 first, minute +10 retraced to BE/SL!
  upsertCandles('EURUSD', '1m', [
    {
      time: tieTime + 60,
      timestamp: new Date((tieTime + 60) * 1000).toISOString(),
      open: 1.0921,
      high: 1.0932,
      low: 1.0919,
      close: 1.093,
      volume: 220,
    },
    {
      time: tieTime + 120,
      timestamp: new Date((tieTime + 120) * 1000).toISOString(),
      open: 1.093,
      high: 1.0944,
      low: 1.0928,
      close: 1.0941,
      volume: 350,
    },
    {
      time: tieTime + 600,
      timestamp: new Date((tieTime + 600) * 1000).toISOString(),
      open: 1.0935,
      high: 1.0936,
      low: 1.0896,
      close: 1.0902,
      volume: 420,
    },
  ]);
  upsertCandles('EURUSD', '15m', [wild15mBar]);
  await paperBrokerService.resolveSymbolOnCandle('EURUSD', '15m', wild15mBar);

  const tieTrade = paperBrokerService.getTradeById(tieRes.tradeId!)!;
  assert.equal(tieTrade.resolutionMethod, 'exact_1m', 'Uses 1m archive for intrabar tie-break');
  assert.equal(
    tieTrade.status,
    'WIN_TP1_BE',
    '1m shows TP1 hit at +2m moving SL->BE before +10m drop, so trade ends WIN_TP1_BE instead of false LOSS'
  );

  // -------------------------------------------------------------------------
  // 8. Case E: Pending Limit Order Verification & Expiry
  // -------------------------------------------------------------------------
  const pendStart = tieTime + 900;
  const limitRes = await paperBrokerService.executeTrade({
    uid: TEST_UID,
    signalId: 'sig_limit_expire',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_aurum_sweep',
    strategyLabel: 'TRAXO London Apex',
    tier: 'PRIME',
    action: 'BUY',
    volume: 0.2,
    entryType: 'limit',
    rawEntryType: 'LIMIT',
    price: 1.08, // Well below market -> never fills
    sl: 1.078,
    tp: 1.085,
    referencePrice: 1.091,
    signalTime: pendStart,
  });
  const neverTouchBars = makeBars({
    startSec: pendStart + 900,
    count: 13,
    stepSec: 900,
    basePrice: 1.091,
  });
  upsertCandles('EURUSD', '15m', neverTouchBars);
  await paperBrokerService.resolveSymbolOnCandle(
    'EURUSD',
    '15m',
    neverTouchBars[neverTouchBars.length - 1]
  );
  const expiredTrade = paperBrokerService.getTradeById(limitRes.tradeId!)!;
  assert.equal(expiredTrade.status, 'EXPIRED', 'Unfilled pending limit transitions to EXPIRED after 12 bars');
  assert.equal(expiredTrade.fillPrice, null, 'Expired limit order never records a fillPrice');

  // -------------------------------------------------------------------------
  // 9. Offline Replay Controller & Express Replay/Execution Routes (Per-User Isolation)
  // -------------------------------------------------------------------------
  const stepStatus = await offlineReplayController.stepReplay(3, {
    uid: TEST_UID,
    symbols: ['EURUSD', 'XAUUSD'],
    timeframe: '15m',
  });
  assert.ok(stepStatus.cursorIndex >= 3, 'Offline replay advances cursor cleanly');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Unauthenticated user-scoped endpoints must fail closed with 401
    const unauthTradesResp = await fetch(`${baseUrl}/api/execution/trades`);
    assert.equal(unauthTradesResp.status, 401, 'Unauthenticated /api/execution/trades returns 401');

    const unauthAccountResp = await fetch(`${baseUrl}/api/paper/account`);
    assert.equal(unauthAccountResp.status, 401, 'Unauthenticated /api/paper/account returns 401');

    const unauthCtxResp = await fetch(`${baseUrl}/api/trading-context`);
    assert.equal(unauthCtxResp.status, 401, 'Unauthenticated /api/trading-context returns 401');

    const unauthJournalResp = await fetch(`${baseUrl}/api/journal`);
    assert.equal(unauthJournalResp.status, 401, 'Unauthenticated /api/journal returns 401');

    // Global market quotes stay accessible without auth
    const quotesResp = await fetch(`${baseUrl}/api/paper/quotes`);
    assert.equal(quotesResp.status, 200, 'Public /api/paper/quotes returns 200');
    const quotesJson = (await quotesResp.json()) as any;
    assert.equal(quotesJson.ok, true);
    assert.ok(Array.isArray(quotesJson.quotes));

    // Authenticated requests for test_uid_alpha
    const alphaHeaders = { 'X-Traxo-Uid': TEST_UID };
    const tradesResp = await fetch(`${baseUrl}/api/execution/trades`, { headers: alphaHeaders });
    assert.equal(tradesResp.status, 200);
    const tradesJson = (await tradesResp.json()) as any;
    assert.equal(tradesJson.ok, true);
    assert.ok(Array.isArray(tradesJson.trades) && tradesJson.trades.length >= 4);

    const replayResp = await fetch(`${baseUrl}/api/execution/trades/${tradeA.id}/replay`, {
      headers: alphaHeaders,
    });
    assert.equal(replayResp.status, 200);
    const replayJson = (await replayResp.json()) as any;
    assert.equal(replayJson.ok, true);
    assert.ok(replayJson.replay.candles.length >= 60);

    const autoTradeResp = await fetch(`${baseUrl}/api/paper/auto-trade`, { headers: alphaHeaders });
    assert.equal(autoTradeResp.status, 200);
    const autoTradeJson = (await autoTradeResp.json()) as any;
    assert.equal(autoTradeJson.autoTradeEnabled, false, 'Auto-trade defaults OFF for new users');

    // Second user test_uid_beta must remain completely isolated at $10,000 with 0 trades
    const betaHeaders = { 'X-Traxo-Uid': OTHER_UID };
    const betaAccountResp = await fetch(`${baseUrl}/api/paper/account`, { headers: betaHeaders });
    assert.equal(betaAccountResp.status, 200);
    const betaAccountJson = (await betaAccountResp.json()) as any;
    assert.equal(betaAccountJson.balance, 10000, 'Second user starts isolated at $10,000 balance');

    const betaTradesResp = await fetch(`${baseUrl}/api/paper/trades`, { headers: betaHeaders });
    assert.equal(betaTradesResp.status, 200);
    const betaTradesJson = (await betaTradesResp.json()) as any;
    assert.equal(betaTradesJson.ok, true);
    assert.equal(betaTradesJson.trades.length, 0, 'Second user has 0 trades and sees no alpha trades');

    const crossReplayResp = await fetch(`${baseUrl}/api/execution/trades/${tradeA.id}/replay`, {
      headers: betaHeaders,
    });
    assert.equal(crossReplayResp.status, 404, 'Cross-user trade replay lookup is blocked with 404');

    const statusResp = await fetch(`${baseUrl}/api/replay/status`);
    assert.equal(statusResp.status, 200);
  } finally {
    offlineReplayController.stopReplay();
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // -------------------------------------------------------------------------
  // 10. Cloud Backup Mirror & Restore (backupRedis -> Fresh SQLite DB)
  // -------------------------------------------------------------------------
  const testBackupUid = `test_restore_${Date.now()}`;
  await paperBrokerService.resetOrSetPaperBalance(testBackupUid, 18500, true);
  await paperBrokerService.executeTrade({
    uid: testBackupUid,
    signalId: 'sig_cloud_backup',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_london_apex',
    strategyLabel: 'TRAXO London Apex',
    tier: 'PRIME',
    action: 'BUY',
    volume: 0.2,
    sl: 1.088,
    tp: 1.094,
    tp2: 1.098,
    referencePrice: 1.091,
    signalTime: t0 + 900,
  });

  const syncRes = await syncPaperStateToCloudBackup(testBackupUid);
  assert.equal(syncRes.ok, true);
  assert.equal(syncRes.tradeCount, 1);

  // Wipe local DB cleanly and verify cloud hydration restores both wallet + trade
  resetDbForTests(':memory:');
  const hydrateRes = await hydratePaperStateFromCloudBackup(testBackupUid);
  assert.equal(hydrateRes.restored, true, 'Hydrates empty SQLite DB from cloud backup');
  assert.equal(hydrateRes.tradeCount, 1);
  const restoredTrades = paperBrokerService.getAllTrades(testBackupUid);
  assert.equal(restoredTrades.length, 1);
  const restoredAcc = await paperBrokerService.getAccountInfo(testBackupUid);
  assert.equal(restoredAcc.balance, 18500);
  await backupRedis.del(`backup:traxo:paper_v2:${testBackupUid}`).catch(() => {});

  // -------------------------------------------------------------------------
  // 11. Duplicate / Multi-Click Execution Protection
  // -------------------------------------------------------------------------
  const dupUid = `test_dup_guard_${Date.now()}`;
  await paperBrokerService.resetOrSetPaperBalance(dupUid, 10000, true);

  const [conc1, conc2] = await Promise.all([
    paperBrokerService.executeTrade({
      uid: dupUid,
      signalId: 'sig_dup_guard_test',
      symbol: 'EURUSD',
      timeframe: '15m',
      market: 'FOREX',
      strategyId: 'traxo_london_apex',
      action: 'BUY',
      volume: 0.1,
      sl: 1.088,
      tp: 1.094,
      referencePrice: 1.091,
    }),
    paperBrokerService.executeTrade({
      uid: dupUid,
      signalId: 'sig_dup_guard_test',
      symbol: 'EURUSD',
      timeframe: '15m',
      market: 'FOREX',
      strategyId: 'traxo_london_apex',
      action: 'BUY',
      volume: 0.1,
      sl: 1.088,
      tp: 1.094,
      referencePrice: 1.091,
    }),
  ]);
  const concResults = [conc1, conc2];
  assert.equal(
    concResults.filter((r) => r.success).length,
    1,
    'Concurrent duplicate signal execution should only succeed once'
  );
  assert.equal(
    concResults.filter((r) => !r.success && r.duplicate === true).length,
    1,
    'Concurrent duplicate signal execution rejects second call as duplicate'
  );

  const seqDup = await paperBrokerService.executeTrade({
    uid: dupUid,
    signalId: 'sig_dup_guard_test',
    symbol: 'EURUSD',
    timeframe: '15m',
    market: 'FOREX',
    strategyId: 'traxo_london_apex',
    action: 'BUY',
    volume: 0.1,
    sl: 1.088,
    tp: 1.094,
    referencePrice: 1.091,
  });
  assert.equal(seqDup.success, false, 'Sequential repeat execution of same signalId is blocked');
  assert.equal(seqDup.duplicate, true);

  const manualFirst = await paperBrokerService.executeTrade({
    uid: dupUid,
    symbol: 'EURUSD',
    action: 'BUY',
    volume: 0.1,
    sl: 1.088,
    tp: 1.094,
    entryType: 'market',
    referencePrice: 1.091,
  });
  assert.equal(manualFirst.success, true, 'First identical manual order succeeds');

  const manualSecond = await paperBrokerService.executeTrade({
    uid: dupUid,
    symbol: 'EURUSD',
    action: 'BUY',
    volume: 0.1,
    sl: 1.088,
    tp: 1.094,
    entryType: 'market',
    referencePrice: 1.091,
  });
  assert.equal(manualSecond.success, false, 'Immediate repeat identical manual order is blocked');
  assert.equal(manualSecond.duplicate, true);

  console.log('✅ All Internal Paper Broker, Dynamic Exit, 1m Tie-Break & Visual Replay tests passed!');
}

runTests()
  .then(async () => {
    try {
      closeRedis();
      resetDbForTests(':memory:');
      if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
    } catch {}
    await new Promise((r) => setTimeout(r, 650));
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ paperBrokerAndReplay.test.ts failed:', err);
    try {
      closeRedis();
      resetDbForTests(':memory:');
      if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
    } catch {}
    await new Promise((r) => setTimeout(r, 650));
    process.exit(1);
  });
