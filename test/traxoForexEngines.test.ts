import {
  TRAXO_FOREX_STRATEGIES,
  traxoLondonApex,
  traxoTokyoYield,
  traxoSovereignFix,
  traxoBarrierGrid,
  traxoMacroVector,
  isTokyoGotobiDate,
  isMonthEndFixWindow,
  findNearestBarrierLevel,
} from '../server/algorithms/traxo/forex';
import type { ITraxoStrategy, TraxoCandle } from '../server/algorithms/traxo/types';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed (${msg}): expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// 0. Contract & Registry Compliance
// ---------------------------------------------------------------------------
assertEqual(TRAXO_FOREX_STRATEGIES.length, 5, 'Should export 5 forex strategies');
for (const strat of TRAXO_FOREX_STRATEGIES as ITraxoStrategy[]) {
  assert(typeof strat.id === 'string' && strat.id.length > 0, 'Strategy id present');
  assert(typeof strat.name === 'string' && strat.name.length > 0, 'Strategy name present');
  assertEqual(strat.market, 'FOREX', `${strat.id} market must be FOREX`);
  assert(Array.isArray(strat.supportedSymbols) && strat.supportedSymbols.length > 0, `${strat.id} supportedSymbols`);
  assert(Array.isArray(strat.optimalTimeframes) && strat.optimalTimeframes.length > 0, `${strat.id} optimalTimeframes`);
  assert(typeof strat.evaluate === 'function', `${strat.id} evaluate method`);
}

// ---------------------------------------------------------------------------
// 1. traxoLondonApex — London Judas Swing
// ---------------------------------------------------------------------------
{
  const day = '2026-05-12'; // Tuesday
  const candles: TraxoCandle[] = [];

  // Asian Range (00:00 - 05:30 UTC) on 15m: tight box 1.0840 - 1.0860
  for (let i = 0; i < 12; i++) {
    const hour = Math.floor((i * 30) / 60);
    const min = (i * 30) % 60;
    const ts = `${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`;
    const isHighBar = i % 2 === 0;
    candles.push({
      open: isHighBar ? 1.0846 : 1.0854,
      high: isHighBar ? 1.0860 : 1.0857,
      low: isHighBar ? 1.0843 : 1.0840,
      close: isHighBar ? 1.0854 : 1.0846,
      volume: 1000,
      timestamp: ts,
    });
  }

  // Pre-London 06:15, 06:30 UTC inside range
  candles.push({
    open: 1.0850,
    high: 1.0855,
    low: 1.0845,
    close: 1.0852,
    volume: 1050,
    timestamp: `${day}T06:15:00Z`,
  });

  // London Open 07:15 UTC: Bearish Judas Swing sweeps above 1.0860 to 1.0872, rejects back inside at 1.0848
  const bearishSweepCandles: TraxoCandle[] = [
    ...candles,
    {
      open: 1.0853,
      high: 1.0872, // fakeout above Asian high (1.0860) by 12 pips
      low: 1.0846,
      close: 1.0848, // closes back inside Asian range with strong upper rejection wick
      volume: 1850,
      timestamp: `${day}T07:15:00Z`,
    },
  ];

  const sellSig = traxoLondonApex.evaluate({
    symbol: 'EURUSD',
    timeframe: '15m',
    candles: bearishSweepCandles,
  });

  assert(sellSig !== null, 'LondonApex should trigger SELL on Asian high Judas fakeout');
  assertEqual(sellSig!.direction, 'SELL', 'LondonApex direction SELL');
  assert(sellSig!.slPrice > 1.0872, 'SL should sit above Judas sweep high');
  assert(sellSig!.tp1Price < sellSig!.entryPrice, 'TP1 below entry for SELL');
  assert(sellSig!.riskRewardRatio >= 1.3, 'R:R >= 1.3');

  // Bullish Judas Swing: sweeps below 1.0840 to 1.0828 and rejects back inside to 1.0853
  const bullishSweepCandles: TraxoCandle[] = [
    ...candles,
    {
      open: 1.0847,
      high: 1.0855,
      low: 1.0828, // fakeout below Asian low (1.0840) by 12 pips
      close: 1.0853, // closes back inside Asian range
      volume: 1900,
      timestamp: `${day}T07:30:00Z`,
    },
  ];

  const buySig = traxoLondonApex.evaluate({
    symbol: 'GBPUSD',
    timeframe: '15m',
    candles: bullishSweepCandles,
  });
  assert(buySig !== null, 'LondonApex should trigger BUY on Asian low Judas fakeout');
  assertEqual(buySig!.direction, 'BUY', 'LondonApex direction BUY');
  assert(buySig!.slPrice < 1.0828, 'SL should sit below Judas sweep low');

  // Outside London Open window (11:00 UTC) must return null
  const outOfWindowCandles: TraxoCandle[] = [
    ...candles,
    {
      open: 1.0847,
      high: 1.0855,
      low: 1.0828,
      close: 1.0853,
      volume: 1900,
      timestamp: `${day}T11:00:00Z`,
    },
  ];
  assertEqual(
    traxoLondonApex.evaluate({ symbol: 'EURUSD', timeframe: '15m', candles: outOfWindowCandles }),
    null,
    'LondonApex must return null outside 07:00-10:00 UTC'
  );
}

// ---------------------------------------------------------------------------
// 2. traxoTokyoYield — Tokyo Gotobi Fix Anomaly (USDJPY)
// ---------------------------------------------------------------------------
{
  // Direct Gotobi weekday: 2026-05-15 (Friday, 15th)
  const gotobiDirect = isTokyoGotobiDate(new Date('2026-05-15T00:30:00Z'));
  assertEqual(gotobiDirect.isGotobi, true, '15th weekday is Gotobi');
  assertEqual(gotobiDirect.isWeekendRoll, false, '15th weekday is not weekend roll');
  assertEqual(gotobiDirect.effectiveGotobiDay, 15, 'Effective Gotobi day is 15');

  // Weekend Gotobi roll to preceding Friday:
  // 2026-05-10 is Sunday -> preceding Friday is 2026-05-08
  const gotobiFriRoll = isTokyoGotobiDate(new Date('2026-05-08T00:30:00Z'));
  assertEqual(gotobiFriRoll.isGotobi, true, 'Friday May 8 rolls Sunday May 10 Gotobi');
  assertEqual(gotobiFriRoll.isWeekendRoll, true, 'Weekend roll flag true');
  assertEqual(gotobiFriRoll.effectiveGotobiDay, 10, 'Effective Gotobi day is 10');

  // 2026-04-25 is Saturday -> preceding Friday is 2026-04-24
  const gotobiSatRoll = isTokyoGotobiDate(new Date('2026-04-24T00:25:00Z'));
  assertEqual(gotobiSatRoll.isGotobi, true, 'Friday Apr 24 rolls Saturday Apr 25 Gotobi');
  assertEqual(gotobiSatRoll.isWeekendRoll, true, 'Saturday roll flag true');
  assertEqual(gotobiSatRoll.effectiveGotobiDay, 25, 'Effective Gotobi day is 25');

  // Actual Sunday May 10 has no Tokyo fix -> false
  const sundayCheck = isTokyoGotobiDate(new Date('2026-05-10T00:30:00Z'));
  assertEqual(sundayCheck.isGotobi, false, 'Sunday itself has no Tokyo Fix');

  // Non-Gotobi weekday: 2026-05-12 (Tuesday, 12th)
  const nonGotobi = isTokyoGotobiDate(new Date('2026-05-12T00:30:00Z'));
  assertEqual(nonGotobi.isGotobi, false, '12th Tuesday is not Gotobi');

  // Build USDJPY morning accumulation candles ending at 2026-05-15T00:40:00Z (09:40 JST)
  const jpyCandles: TraxoCandle[] = [];
  for (let i = 0; i < 16; i++) {
    const baseTime = Date.parse('2026-05-14T21:00:00Z') + i * 15 * 60_000;
    const basePrice = 154.2 + i * 0.01;
    jpyCandles.push({
      open: basePrice,
      high: basePrice + 0.07,
      low: basePrice - 0.05,
      close: basePrice + 0.03,
      volume: 1100,
      timestamp: new Date(baseTime).toISOString(),
    });
  }
  // 00:00, 00:15, 00:30, 00:40 UTC on 2026-05-15
  jpyCandles.push(
    { open: 154.36, high: 154.42, low: 154.34, close: 154.39, volume: 1200, timestamp: '2026-05-15T00:00:00Z' },
    { open: 154.39, high: 154.45, low: 154.37, close: 154.43, volume: 1250, timestamp: '2026-05-15T00:15:00Z' },
    { open: 154.43, high: 154.50, low: 154.41, close: 154.48, volume: 1450, timestamp: '2026-05-15T00:40:00Z' }
  );

  const tokyoSig = traxoTokyoYield.evaluate({
    symbol: 'USDJPY',
    timeframe: '15m',
    candles: jpyCandles,
  });
  assert(tokyoSig !== null, 'TokyoYield should trigger on USDJPY Gotobi morning accumulation');
  assertEqual(tokyoSig!.direction, 'BUY', 'TokyoYield direction BUY');
  assertEqual(tokyoSig!.symbol, 'USDJPY', 'TokyoYield symbol USDJPY');

  // Non-USDJPY pair must return null
  assertEqual(
    traxoTokyoYield.evaluate({ symbol: 'EURUSD', timeframe: '15m', candles: jpyCandles }),
    null,
    'TokyoYield only supports USDJPY'
  );

  // Outside 00:00-00:55 UTC (e.g. 01:15 UTC) must return null
  const lateCandles = [
    ...jpyCandles,
    { open: 154.48, high: 154.55, low: 154.45, close: 154.52, volume: 1400, timestamp: '2026-05-15T01:15:00Z' },
  ];
  assertEqual(
    traxoTokyoYield.evaluate({ symbol: 'USDJPY', timeframe: '15m', candles: lateCandles }),
    null,
    'TokyoYield must return null after 00:55 UTC'
  );
}

// ---------------------------------------------------------------------------
// 3. traxoBarrierGrid — Institutional Round Numbers (00, 50)
// ---------------------------------------------------------------------------
{
  const b00 = findNearestBarrierLevel(1.0902, 0.0001, 'EURUSD');
  assertEqual(b00.level, 1.09, 'Nearest barrier to 1.0902 is 1.0900');
  assertEqual(b00.figureType, '00', '1.0900 is 00 figure');

  const b50 = findNearestBarrierLevel(150.48, 0.01, 'USDJPY');
  assertEqual(b50.level, 150.5, 'Nearest barrier to 150.48 is 150.50');
  assertEqual(b50.figureType, '50', '150.50 is 50 figure');

  const baseCandles: TraxoCandle[] = [];
  for (let i = 0; i < 16; i++) {
    baseCandles.push({
      open: 1.0920,
      high: 1.0926,
      low: 1.0912,
      close: 1.0918,
      volume: 1000,
      timestamp: new Date(Date.parse('2026-05-12T10:00:00Z') + i * 15 * 60_000).toISOString(),
    });
  }

  // Bullish pinbar rejection wick right off 1.0900 institutional figure
  const barrierBuyCandles: TraxoCandle[] = [
    ...baseCandles,
    {
      open: 1.0914,
      high: 1.0922,
      low: 1.0898, // sweeps 1.0900 by 2 pips
      close: 1.0919, // strong lower wick (16 pips) vs tiny body (5 pips)
      volume: 1700,
      timestamp: '2026-05-12T14:00:00Z',
    },
  ];

  const barrierSig = traxoBarrierGrid.evaluate({
    symbol: 'EURUSD',
    timeframe: '15m',
    candles: barrierBuyCandles,
  });
  assert(barrierSig !== null, 'BarrierGrid should trigger BUY off 1.0900 rejection wick');
  assertEqual(barrierSig!.direction, 'BUY', 'BarrierGrid direction BUY');
  assertEqual(barrierSig!.metrics?.figureType, '00', 'BarrierGrid detects 00 figure');
  assert(barrierSig!.riskRewardRatio >= 2.0, 'Tight invalidation gives >= 2.0 R:R');

  // Bearish rejection off 150.50 on USDJPY
  const jpyBase: TraxoCandle[] = [];
  for (let i = 0; i < 16; i++) {
    jpyBase.push({
      open: 150.30,
      high: 150.36,
      low: 150.24,
      close: 150.32,
      volume: 1000,
      timestamp: new Date(Date.parse('2026-05-12T10:00:00Z') + i * 15 * 60_000).toISOString(),
    });
  }
  const jpySellCandles: TraxoCandle[] = [
    ...jpyBase,
    {
      open: 150.36,
      high: 150.52, // probes 150.50 barrier
      low: 150.31,
      close: 150.33, // upper wick 16 pips vs 3 pip body
      volume: 1650,
      timestamp: '2026-05-12T14:00:00Z',
    },
  ];
  const jpyBarrierSig = traxoBarrierGrid.evaluate({
    symbol: 'USDJPY',
    timeframe: '15m',
    candles: jpySellCandles,
  });
  assert(jpyBarrierSig !== null, 'BarrierGrid should trigger SELL off 150.50 on USDJPY');
  assertEqual(jpyBarrierSig!.direction, 'SELL', 'JPY BarrierGrid direction SELL');
  assertEqual(jpyBarrierSig!.metrics?.figureType, '50', 'JPY BarrierGrid detects 50 figure');
}

// ---------------------------------------------------------------------------
// 4. traxoMacroVector — HTF EMA 21/50/200 + M15 Pullback Entry
// ---------------------------------------------------------------------------
{
  // Build 220 HTF candles in steady uptrend so EMA21 > EMA50 > EMA200
  const htfBull: TraxoCandle[] = [];
  for (let i = 0; i < 220; i++) {
    const p = 1.0500 + i * 0.0004;
    htfBull.push({
      open: p - 0.0002,
      high: p + 0.0005,
      low: p - 0.0004,
      close: p,
      volume: 2000,
      timestamp: new Date(Date.parse('2026-04-01T00:00:00Z') + i * 3600_000).toISOString(),
    });
  }

  // Build 65 M15 candles trending up, then pulling back to EMA21/50 and resuming
  const m15Bull: TraxoCandle[] = [];
  for (let i = 0; i < 60; i++) {
    const p = 1.1250 + i * 0.0003;
    m15Bull.push({
      open: p - 0.0002,
      high: p + 0.0004,
      low: p - 0.0003,
      close: p,
      volume: 1000,
      timestamp: new Date(Date.parse('2026-05-12T00:00:00Z') + i * 15 * 60_000).toISOString(),
    });
  }
  // Last price was ~1.1427; EMA21 around ~1.1398, EMA50 around ~1.1355
  // Pullback down into ~1.1390 then bullish resumption closing above EMA21 & prev high
  m15Bull.push(
    { open: 1.1425, high: 1.1426, low: 1.1408, close: 1.1410, volume: 1100, timestamp: '2026-05-12T15:00:00Z' },
    { open: 1.1410, high: 1.1412, low: 1.1392, close: 1.1395, volume: 1150, timestamp: '2026-05-12T15:15:00Z' },
    { open: 1.1395, high: 1.1418, low: 1.1390, close: 1.1416, volume: 1500, timestamp: '2026-05-12T15:30:00Z' }
  );

  const macroSig = traxoMacroVector.evaluate({
    symbol: 'EURUSD',
    timeframe: '15m',
    candles: m15Bull,
    higherTimeframeCandles: htfBull,
  });

  assert(macroSig !== null, 'MacroVector should trigger BUY on HTF EMA21/50/200 stack + M15 pullback');
  assertEqual(macroSig!.direction, 'BUY', 'MacroVector direction BUY');
  assert(
    macroSig!.metrics!.htfEma21 > macroSig!.metrics!.htfEma50 &&
      macroSig!.metrics!.htfEma50 > macroSig!.metrics!.htfEma200,
    'HTF EMAs strictly stacked 21 > 50 > 200'
  );

  // Wrong timeframe (e.g. 4H) or insufficient HTF candles must return null
  assertEqual(
    traxoMacroVector.evaluate({
      symbol: 'EURUSD',
      timeframe: '4H',
      candles: m15Bull,
      higherTimeframeCandles: htfBull,
    }),
    null,
    'MacroVector requires M15 entry timeframe'
  );

  assertEqual(
    traxoMacroVector.evaluate({
      symbol: 'EURUSD',
      timeframe: '15m',
      candles: m15Bull,
      higherTimeframeCandles: htfBull.slice(0, 100),
    }),
    null,
    'MacroVector requires >= 200 HTF candles for EMA200'
  );

  // Bearish MacroVector: HTF downtrend (EMA21 < EMA50 < EMA200) + M15 bearish pullback resumption
  const htfBear: TraxoCandle[] = [];
  for (let i = 0; i < 220; i++) {
    const p = 1.1500 - i * 0.0004;
    htfBear.push({
      open: p + 0.0002,
      high: p + 0.0004,
      low: p - 0.0005,
      close: p,
      volume: 2000,
      timestamp: new Date(Date.parse('2026-04-01T00:00:00Z') + i * 3600_000).toISOString(),
    });
  }
  const m15Bear: TraxoCandle[] = [];
  for (let i = 0; i < 60; i++) {
    const p = 1.0750 - i * 0.0003;
    m15Bear.push({
      open: p + 0.0002,
      high: p + 0.0003,
      low: p - 0.0004,
      close: p,
      volume: 1000,
      timestamp: new Date(Date.parse('2026-05-12T00:00:00Z') + i * 15 * 60_000).toISOString(),
    });
  }
  m15Bear.push(
    { open: 1.0575, high: 1.0592, low: 1.0573, close: 1.0590, volume: 1100, timestamp: '2026-05-12T15:00:00Z' },
    { open: 1.0590, high: 1.0608, low: 1.0588, close: 1.0604, volume: 1150, timestamp: '2026-05-12T15:15:00Z' },
    { open: 1.0604, high: 1.0609, low: 1.0582, close: 1.0584, volume: 1550, timestamp: '2026-05-12T15:30:00Z' }
  );

  const macroBearSig = traxoMacroVector.evaluate({
    symbol: 'EURUSD',
    timeframe: '15m',
    candles: m15Bear,
    higherTimeframeCandles: htfBear,
  });
  assert(macroBearSig !== null, 'MacroVector should trigger SELL on HTF bearish EMA21/50/200 stack + M15 pullback');
  assertEqual(macroBearSig!.direction, 'SELL', 'MacroVector bearish direction SELL');

  // News blackout must suppress signal
  assertEqual(
    traxoMacroVector.evaluate({
      symbol: 'EURUSD',
      timeframe: '15m',
      candles: m15Bull,
      higherTimeframeCandles: htfBull,
      newsBlackout: true,
    }),
    null,
    'newsBlackout must suppress MacroVector signal'
  );
}

// ---------------------------------------------------------------------------
// 5. traxoSovereignFix — London 16:00 UTC WM/Reuters Fix Snapback
// ---------------------------------------------------------------------------
{
  // Month-end business day checks (May 2026: May 31 Sun, May 30 Sat -> last 2 bdays are May 28 & May 29)
  assertEqual(isMonthEndFixWindow(new Date('2026-05-29T16:00:00Z')), true, 'May 29 2026 is final business day');
  assertEqual(isMonthEndFixWindow(new Date('2026-05-28T16:00:00Z')), true, 'May 28 2026 is 2nd-to-last business day');
  assertEqual(isMonthEndFixWindow(new Date('2026-05-12T16:00:00Z')), false, 'May 12 is mid-month');

  function makeSovereignSeries(datePrefix: string, direction: 'BUY' | 'SELL'): TraxoCandle[] {
    const list: TraxoCandle[] = [];
    // 18 warmup bars from 10:30 to 14:45 UTC (range ~12 pips -> ATR ~0.0012)
    const start = Date.parse(`${datePrefix}T10:30:00Z`);
    for (let i = 0; i < 18; i++) {
      list.push({
        open: 1.0900,
        high: 1.0906,
        low: 1.0894,
        close: 1.0900,
        volume: 1000,
        timestamp: new Date(start + i * 15 * 60_000).toISOString(),
      });
    }
    if (direction === 'SELL') {
      // Pre-fix 15:00-15:45 UTC surges upward >= 0.75 * ATR above equilibrium
      list.push(
        { open: 1.0900, high: 1.0905, low: 1.0898, close: 1.0903, volume: 1100, timestamp: `${datePrefix}T15:00:00Z` },
        { open: 1.0903, high: 1.0910, low: 1.0902, close: 1.0909, volume: 1200, timestamp: `${datePrefix}T15:15:00Z` },
        { open: 1.0909, high: 1.0922, low: 1.0908, close: 1.0920, volume: 1400, timestamp: `${datePrefix}T15:30:00Z` },
        { open: 1.0920, high: 1.0938, low: 1.0918, close: 1.0934, volume: 1650, timestamp: `${datePrefix}T15:45:00Z` },
        // 16:00 UTC Fix lock snapback reversal
        { open: 1.0934, high: 1.0942, low: 1.0924, close: 1.0926, volume: 2100, timestamp: `${datePrefix}T16:00:00Z` }
      );
    } else {
      // Pre-fix 15:00-15:45 UTC flushes downward >= 0.75 * ATR below equilibrium
      list.push(
        { open: 1.0900, high: 1.0902, low: 1.0895, close: 1.0897, volume: 1100, timestamp: `${datePrefix}T15:00:00Z` },
        { open: 1.0897, high: 1.0898, low: 1.0889, close: 1.0891, volume: 1200, timestamp: `${datePrefix}T15:15:00Z` },
        { open: 1.0891, high: 1.0892, low: 1.0878, close: 1.0880, volume: 1400, timestamp: `${datePrefix}T15:30:00Z` },
        { open: 1.0880, high: 1.0882, low: 1.0862, close: 1.0866, volume: 1650, timestamp: `${datePrefix}T15:45:00Z` },
        // 16:00 UTC Fix lock snapback reversal
        { open: 1.0866, high: 1.0876, low: 1.0858, close: 1.0874, volume: 2100, timestamp: `${datePrefix}T16:00:00Z` }
      );
    }
    return list;
  }

  const midMonthSell = traxoSovereignFix.evaluate({
    symbol: 'EURUSD',
    timeframe: '15m',
    candles: makeSovereignSeries('2026-05-12', 'SELL'),
  });
  assert(midMonthSell !== null, 'SovereignFix should trigger SELL snapback after pre-fix upward stretch');
  assertEqual(midMonthSell!.direction, 'SELL', 'SovereignFix direction SELL');
  assertEqual(midMonthSell!.metrics?.monthEndWindow, false, 'Mid-month window false');

  const monthEndBuy = traxoSovereignFix.evaluate({
    symbol: 'GBPUSD',
    timeframe: '15m',
    candles: makeSovereignSeries('2026-05-29', 'BUY'),
  });
  assert(monthEndBuy !== null, 'SovereignFix should trigger BUY snapback on month-end fix');
  assertEqual(monthEndBuy!.direction, 'BUY', 'SovereignFix direction BUY');
  assertEqual(monthEndBuy!.metrics?.monthEndWindow, true, 'Month-end window true');

  const midMonthBuy = traxoSovereignFix.evaluate({
    symbol: 'GBPUSD',
    timeframe: '15m',
    candles: makeSovereignSeries('2026-05-12', 'BUY'),
  });
  assert(midMonthBuy !== null, 'Mid-month BUY setup valid for boost comparison');
  assert(
    monthEndBuy!.confidencePct > midMonthBuy!.confidencePct,
    `Month-end fix (${monthEndBuy!.confidencePct}%) must have higher confidence than mid-month (${midMonthBuy!.confidencePct}%)`
  );

  // Outside fix window (e.g. 14:00 UTC) must return null
  const outWindow = makeSovereignSeries('2026-05-12', 'BUY').slice(0, 14);
  assertEqual(
    traxoSovereignFix.evaluate({ symbol: 'EURUSD', timeframe: '15m', candles: outWindow }),
    null,
    'SovereignFix must return null outside 16:00-16:30 UTC window'
  );
}

console.log('All TRAXO Forex Proprietary Engine tests passed cleanly!');
