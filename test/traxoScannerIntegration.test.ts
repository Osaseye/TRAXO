import http from 'http';
import assert from 'node:assert/strict';

process.env.TRAXO_NO_LISTEN = 'true';

import {
  ALL_TRAXO_STRATEGIES,
  TRAXO_STRATEGY_LABELS,
  getTraxoStrategiesForSymbol,
  type TraxoCandle,
} from '../server/algorithms/traxo';
import { getScannableInstruments } from '../server/src/config/instruments';
import { runAllStrategies } from '../server/src/modules/scanner/signalScanner';
import {
  getOptimizationDiagnostics,
  getParameters,
  normalizeStrategyId,
  processResolvedLoss,
  processResolvedWin,
  resetToFactoryDefaults,
  setFeedbackEngineEnabled,
} from '../server/src/modules/optimizer/strategyOptimizer';
import { calculateLots } from '../server/src/modules/risk/positionSizing';
import { evaluatePreTradeGuardrails } from '../server/src/modules/risk/guardrails';
import { NewsEngine, getSymbolQueryPlan } from '../server/src/services/news/newsEngine';
import { createApp } from '../server/src/index';

function buildLondonApexEurusdCandles(day = '2026-05-12'): TraxoCandle[] {
  const candles: TraxoCandle[] = [];
  // Asian session (00:00-06:00 UTC) >= 24 bars on 15m so >= 30 total candles
  for (let i = 0; i < 24; i++) {
    const totalMin = i * 15;
    const hour = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const isHighBar = i % 2 === 0;
    candles.push({
      open: isHighBar ? 1.0846 : 1.0854,
      high: isHighBar ? 1.0860 : 1.0857,
      low: isHighBar ? 1.0843 : 1.0840,
      close: isHighBar ? 1.0854 : 1.0846,
      volume: 1000,
      timestamp: `${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`,
    });
  }
  // Fill 06:00-07:00 UTC (4 bars)
  for (let i = 0; i < 4; i++) {
    candles.push({
      open: 1.0850,
      high: 1.0855,
      low: 1.0845,
      close: 1.0852,
      volume: 1050,
      timestamp: `${day}T06:${String(i * 15).padStart(2, '0')}:00Z`,
    });
  }
  // 07:00, 07:15 UTC London Open Judas Swing sweeping Asian High 1.0860 -> 1.0872 and closing inside at 1.0848
  candles.push(
    {
      open: 1.0852,
      high: 1.0856,
      low: 1.0848,
      close: 1.0853,
      volume: 1100,
      timestamp: `${day}T07:00:00Z`,
    },
    {
      open: 1.0853,
      high: 1.0872,
      low: 1.0846,
      close: 1.0848,
      volume: 1950,
      timestamp: `${day}T07:15:00Z`,
    }
  );
  return candles;
}

function buildGoldAurumSweepCandles(day = '2026-11-17'): TraxoCandle[] {
  const candles: TraxoCandle[] = [];
  for (let i = 0; i < 26; i++) {
    const totalMin = i * 15;
    const hour = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const high = i === 10 ? 2660 : 2653;
    const low = i === 15 ? 2640 : 2647;
    candles.push({
      open: 2649,
      high,
      low,
      close: 2650,
      volume: 950,
      timestamp: `${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`,
    });
  }
  candles.push(
    { open: 2650, high: 2651, low: 2645, close: 2646, volume: 1000, timestamp: `${day}T06:30:00Z` },
    { open: 2646, high: 2647, low: 2641, close: 2642, volume: 1100, timestamp: `${day}T06:45:00Z` },
    { open: 2642, high: 2643, low: 2637.5, close: 2639.0, volume: 1650, timestamp: `${day}T07:00:00Z` },
    { open: 2638.5, high: 2642.5, low: 2638.2, close: 2642.2, volume: 2200, timestamp: `${day}T07:15:00Z` }
  );
  return candles;
}

function buildMnqVelocityOrbCandles(): TraxoCandle[] {
  // Winter EST (UTC-5): 09:30 EST = 14:30 UTC
  // 29 prior 5m bars from 12:05 UTC to 14:25 UTC, plus 14:30 UTC (09:30 EST) high-RVOL ORB bar
  const candles: TraxoCandle[] = [];
  const startMs = Date.parse('2026-11-17T12:05:00Z');
  for (let i = 0; i < 29; i++) {
    const ts = new Date(startMs + i * 5 * 60_000).toISOString();
    candles.push({
      open: 20995,
      high: 21005,
      low: 20985,
      close: 21000,
      volume: 1000,
      timestamp: ts,
    });
  }
  // 09:30 EST 5m ORB bar with 2.4x RVOL -> arms STOP breakout order at close of 5m ORB
  candles.push({
    open: 21000,
    high: 21030,
    low: 20990,
    close: 21024,
    volume: 2400,
    timestamp: '2026-11-17T14:30:00Z',
  });
  return candles;
}

async function runTests() {
  // -------------------------------------------------------------------------
  // 1. 15-Engine Registry & /api/strategies Express Route
  // -------------------------------------------------------------------------
  assert.equal(ALL_TRAXO_STRATEGIES.length, 15, 'Should register all 15 TRAXO strategies');
  const uniqueIds = new Set(ALL_TRAXO_STRATEGIES.map((s) => s.id));
  assert.equal(uniqueIds.size, 15, 'All 15 TRAXO strategy IDs must be unique');

  for (const s of ALL_TRAXO_STRATEGIES) {
    assert.equal(TRAXO_STRATEGY_LABELS[s.id], s.name, `Label matches name for ${s.id}`);
  }

  assert.equal(getTraxoStrategiesForSymbol('EURUSD').filter((s) => s.market === 'FOREX').length >= 4, true);
  assert.equal(getTraxoStrategiesForSymbol('XAUUSD').length, 5, 'Gold should dispatch all 5 Gold engines');
  assert.equal(getTraxoStrategiesForSymbol('MNQ').length, 5, 'MNQ should dispatch all 5 Futures engines');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/strategies`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.ok, true);
    assert.equal(body.count, 15);
    assert.equal(body.strategies.length, 15);

    const singleRes = await fetch(`http://127.0.0.1:${addr.port}/api/strategies/traxo_london_apex`);
    assert.equal(singleRes.status, 200);
    const singleBody = (await singleRes.json()) as any;
    assert.equal(singleBody.strategy.name, 'TRAXO London Apex');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // -------------------------------------------------------------------------
  // 2. Scannable Tri-Market Instruments
  // -------------------------------------------------------------------------
  const scannable = getScannableInstruments()
    .map((i) => i.symbol)
    .sort();
  assert.deepEqual(
    scannable,
    ['AUDUSD', 'EURUSD', 'GBPUSD', 'MNQ', 'USDCAD', 'USDJPY', 'XAUUSD'].sort(),
    'Scannable universe must focus strictly on the 7 Tri-Market instruments'
  );

  // -------------------------------------------------------------------------
  // 3. Scanner Dispatch Across EURUSD, XAUUSD, and MNQ + 9-Point Confluence
  // -------------------------------------------------------------------------
  const fxScan = runAllStrategies(buildLondonApexEurusdCandles(), 'EURUSD', '15min');
  const londonSig = fxScan.signals.find((s) => s.strategyId === 'traxo_london_apex');
  assert.ok(londonSig, 'Scanner must emit traxo_london_apex signal on EURUSD');
  assert.equal(londonSig.strategyLabel, 'TRAXO London Apex');
  assert.equal(londonSig.market, 'FOREX');
  assert.ok(londonSig.confluence && londonSig.confluence.maxScore === 9, '9-point confluence attached');
  assert.equal(fxScan.signals.some((s) => s.strategyId.startsWith('traxo_globex')), false, 'Forex scan must not run futures engines');

  const goldScan = runAllStrategies(buildGoldAurumSweepCandles(), 'XAUUSD', '15min');
  const aurumSig = goldScan.signals.find((s) => s.strategyId === 'traxo_aurum_sweep');
  assert.ok(aurumSig, 'Scanner must emit traxo_aurum_sweep signal on XAUUSD');
  assert.equal(aurumSig.strategyLabel, 'TRAXO Aurum Sweep');
  assert.equal(aurumSig.market, 'METALS');
  assert.ok(aurumSig.confluence && aurumSig.confluence.checks.length === 9);

  const mnqScan = runAllStrategies(buildMnqVelocityOrbCandles(), 'MNQ', '5min');
  const orbSig = mnqScan.signals.find((s) => s.strategyId === 'traxo_velocity_orb');
  assert.ok(orbSig, 'Scanner must emit traxo_velocity_orb signal on MNQ');
  assert.equal(orbSig.strategyLabel, 'TRAXO Velocity ORB');
  assert.equal(orbSig.market, 'FUTURES');
  assert.ok(orbSig.confluence && orbSig.confluence.maxScore === 9);

  // -------------------------------------------------------------------------
  // 4. Optimizer Fault & Parameter Isolation for traxo_* Engines
  // -------------------------------------------------------------------------
  await resetToFactoryDefaults();
  assert.equal(normalizeStrategyId('traxo_london_apex'), 'traxo_london_apex');
  assert.equal(normalizeStrategyId('traxo-london-apex'), 'traxo_london_apex');

  await setFeedbackEngineEnabled(true);
  const beforeWick = getParameters('wick_rejection');
  const beforeApex = getParameters('traxo_london_apex');

  const lossRes = await processResolvedLoss({
    strategyId: 'traxo_london_apex',
    symbol: 'EURUSD',
    timeframe: '15m',
  });
  assert.equal(lossRes.processed, true);
  assert.equal(lossRes.stratId, 'traxo_london_apex');

  const afterLossApex = getParameters('traxo_london_apex');
  const afterLossWick = getParameters('wick_rejection');
  assert.equal(afterLossApex.minConfidence, beforeApex.minConfidence + 2);
  assert.equal(afterLossApex.atrSlPadding, Number((beforeApex.atrSlPadding + 0.1).toFixed(2)));
  assert.deepEqual(afterLossWick, beforeWick, 'Optimizing traxo_london_apex must not mutate wick_rejection');

  const winRes = await processResolvedWin({
    strategyId: 'traxo_london_apex',
    symbol: 'EURUSD',
    timeframe: '15m',
  });
  assert.equal(winRes.processed, true);
  const diag = getOptimizationDiagnostics();
  assert.equal(diag.learnedParameters.traxo_london_apex.minConfidence, beforeApex.minConfidence + 1);
  await setFeedbackEngineEnabled(false);
  await resetToFactoryDefaults();

  // -------------------------------------------------------------------------
  // 5. Futures Position Sizing ($2/pt discrete integer contracts, min dist 0.25)
  // -------------------------------------------------------------------------
  // 20-pt stop on MNQ: risk=$500 / (20 * $2) = 12.5 -> capped at maxLots=10
  assert.equal(calculateLots('MNQ', 20000, 19980, 500), 10);
  // 5-pt tight stop on MNQ (must NOT be clamped to 20 pts = 0.001 * 20000!)
  // risk=$100 / (5 * $2) = 10; risk=$50 / (5 * $2) = 5
  assert.equal(calculateLots('MNQ', 20000, 19995, 100), 10);
  assert.equal(calculateLots('MNQ', 20000, 19995, 50), 5);
  assert.equal(calculateLots('MNQ', 20000, 19980, 10), 1, 'Minimum discrete contract count is 1');

  // -------------------------------------------------------------------------
  // 6. Guardrails: XAUUSD 21:00-23:00 UTC Quarantine + Per-Pair Spread Caps
  // -------------------------------------------------------------------------
  const goldRolloverBlock = evaluatePreTradeGuardrails({
    signal: {
      symbol: 'XAUUSD',
      direction: 'BUY',
      strategyId: 'traxo_aurum_sweep',
      timeframe: '15m',
      entry: 2650,
      sl: 2640,
      tp: 2675,
      confidence: 82,
    },
    now: new Date('2026-11-17T21:30:00Z'),
  });
  assert.equal(goldRolloverBlock.allowed, false);
  assert.equal(goldRolloverBlock.rejectedBy?.code, 'C.10');

  const goldActiveAllow = evaluatePreTradeGuardrails({
    signal: {
      symbol: 'XAUUSD',
      direction: 'BUY',
      strategyId: 'traxo_aurum_sweep',
      timeframe: '15m',
      entry: 2650,
      sl: 2640,
      tp: 2675,
      confidence: 82,
    },
    quote: { bid: 2650.0, ask: 2650.3 }, // 3.0 pips <= 4.5 XAUUSD cap
    now: new Date('2026-11-17T14:00:00Z'),
  });
  assert.equal(goldActiveAllow.allowed, true);

  const eurSpreadBlock = evaluatePreTradeGuardrails({
    signal: {
      symbol: 'EURUSD',
      direction: 'BUY',
      strategyId: 'traxo_london_apex',
      timeframe: '15m',
      entry: 1.09,
      sl: 1.088,
      tp: 1.094,
      confidence: 82,
    },
    quote: { bid: 1.09, ask: 1.0902 }, // 2.0 pips > 1.6 EURUSD default cap
    now: new Date('2026-11-17T14:00:00Z'),
  });
  assert.equal(eurSpreadBlock.allowed, false);
  assert.equal(eurSpreadBlock.rejectedBy?.code, 'C.9');

  // -------------------------------------------------------------------------
  // 7. Decoupled News Engine: Tri-Market Query Plan & Freeze Transitions
  // -------------------------------------------------------------------------
  const goldPlan = getSymbolQueryPlan('XAUUSD');
  assert.ok(goldPlan.categories.includes('forex'));
  assert.ok(goldPlan.tokens.includes('GOLD') && goldPlan.tokens.includes('CPI'));

  const mnqPlan = getSymbolQueryPlan('MNQ');
  assert.deepEqual(mnqPlan.categories, ['general']);
  assert.ok(mnqPlan.tokens.includes('NASDAQ') && mnqPlan.tokens.includes('FOMC'));

  const eventSec = Math.floor(Date.UTC(2026, 10, 17, 13, 30, 0) / 1000);
  const transitionEvents: string[] = [];
  const newsEng = new NewsEngine({
    redisClient: null,
    interCategoryDelayMs: 0,
    fetcher: async (category) => {
      if (category === 'general') {
        return [
          {
            id: 901,
            category: 'general',
            datetime: eventSec,
            headline: 'US CPI & FOMC Macro Volatility Catalyst for Gold and Nasdaq',
            summary: 'CPI and FOMC rate expectations move XAUUSD and MNQ',
            source: 'Reuters',
            url: 'https://example.com/cpi',
            image: '',
            related: 'USD,MNQ,GOLD',
          },
        ];
      }
      return [];
    },
  });
  newsEng.setTransitionListener((ev) => transitionEvents.push(`${ev.type}:${ev.symbol}`));
  await newsEng.pollAllCategories(['general', 'forex']);

  // T-20m: enters freeze
  const evEnter = await newsEng.evaluateFreezeTransitions(['XAUUSD', 'MNQ'], (eventSec - 20 * 60) * 1000);
  assert.ok(evEnter.some((e) => e.type === 'NEWS_FREEZE_ENTER' && e.symbol === 'XAUUSD'));
  assert.ok(evEnter.some((e) => e.type === 'NEWS_FREEZE_ENTER' && e.symbol === 'MNQ'));

  // T+0m: event released
  const evRelease = await newsEng.evaluateFreezeTransitions(['XAUUSD', 'MNQ'], eventSec * 1000);
  assert.ok(evRelease.some((e) => e.type === 'NEWS_RELEASED' && e.symbol === 'XAUUSD'));
  assert.ok(evRelease.some((e) => e.type === 'NEWS_RELEASED' && e.symbol === 'MNQ'));

  // T+20m: exits freeze (> 15m post-event)
  const evExit = await newsEng.evaluateFreezeTransitions(['XAUUSD', 'MNQ'], (eventSec + 20 * 60) * 1000);
  assert.ok(evExit.some((e) => e.type === 'NEWS_FREEZE_EXIT' && e.symbol === 'XAUUSD'));
  assert.ok(evExit.some((e) => e.type === 'NEWS_FREEZE_EXIT' && e.symbol === 'MNQ'));
  assert.equal(transitionEvents.length, 6);

  console.log('All TRAXO Scanner & Tri-Market Integration tests passed cleanly!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
