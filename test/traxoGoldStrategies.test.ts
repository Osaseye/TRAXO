import {
  GOLD_STRATEGIES,
  GOLD_MIN_SL_ATR_BUFFER,
  traxoAurumSweep,
  traxoAurumFix,
  traxoBullionStrike,
  traxoNyBullet,
  traxoKineticNr7,
} from '../server/algorithms/traxo/gold';
import { calculateATR } from '../server/algorithms/traxo/indicators';
import type { ITraxoStrategy, TraxoCandle } from '../server/algorithms/traxo/types';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed (${msg}): expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeM15Series(
  startIso: string,
  count: number,
  basePrice: number,
  stepFn?: (idx: number, iso: string) => Partial<TraxoCandle>
): TraxoCandle[] {
  const startMs = Date.parse(startIso);
  const candles: TraxoCandle[] = [];
  for (let i = 0; i < count; i++) {
    const iso = new Date(startMs + i * 15 * 60 * 1000).toISOString();
    const osc = (i % 2 === 0 ? 1 : -1) * 1.2;
    const defaults: TraxoCandle = {
      open: basePrice - osc * 0.3,
      high: basePrice + 1.8,
      low: basePrice - 1.8,
      close: basePrice + osc * 0.3,
      volume: 1000,
      timestamp: iso,
    };
    const override = stepFn ? stepFn(i, iso) : {};
    candles.push({ ...defaults, ...override, timestamp: override.timestamp ?? iso });
  }
  return candles;
}

// 1. Contract & Barrel Export checks
assertEqual(GOLD_STRATEGIES.length, 5, 'GOLD_STRATEGIES should export 5 strategies');
for (const s of GOLD_STRATEGIES as ITraxoStrategy[]) {
  assert(Boolean(s.id), 'Strategy must have id');
  assert(Boolean(s.name), 'Strategy must have name');
  assertEqual(s.market, 'METALS', `${s.id} market must be METALS`);
  assert(s.supportedSymbols.includes('XAU/USD'), `${s.id} must support XAU/USD`);
  assert(s.optimalTimeframes.length > 0, `${s.id} must list optimalTimeframes`);
  assertEqual(
    s.evaluate({ symbol: 'EURUSD', timeframe: '15m', candles: [] }),
    null,
    `${s.id} must reject non-Gold symbol`
  );
}

// 2. traxoAurumSweep tests (Asian 00:00-06:30 UTC + London sweep + M15 displacement + 1:2.5+ RR)
{
  // Build 26 Asian bars (00:00..06:15 UTC) between $2640 and $2660, then sweep below $2640 at 07:00, then displacement at 07:15
  const aurumBullCandles = makeM15Series('2026-11-17T00:00:00Z', 30, 2650, (i) => {
    // 0..25 are 00:00..06:15 UTC
    if (i < 26) {
      const high = i === 10 ? 2660 : 2653;
      const low = i === 15 ? 2640 : 2647;
      return { open: 2649, high, low, close: 2650, volume: 900 };
    }
    if (i === 26) return { open: 2650, high: 2651, low: 2645, close: 2646, volume: 1000 }; // 06:30
    if (i === 27) return { open: 2646, high: 2647, low: 2641, close: 2642, volume: 1100 }; // 06:45
    if (i === 28) return { open: 2642, high: 2643, low: 2637.5, close: 2639.0, volume: 1600 }; // 07:00 sweep below 2640
    // 07:15 displacement candle back inside Asian range [2640, 2660]
    // SL = 2637.5 - buffer (~1.05) = ~2636.45, entry = 2643.5 -> risk ~7.05 -> RR to 2660 < 2.5 if too high!
    // Let's keep displacement close at 2642.2 so risk ~5.5, target 2660 gives ~3.2 RR!
    return { open: 2638.5, high: 2642.5, low: 2638.2, close: 2642.2, volume: 2100 };
  });

  const bullSig = traxoAurumSweep.evaluate({
    symbol: 'XAU/USD',
    timeframe: '15m',
    candles: aurumBullCandles,
  });
  assert(bullSig !== null, 'traxoAurumSweep should emit BUY on Asian low sweep + M15 displacement');
  assertEqual(bullSig!.direction, 'BUY', 'Aurum Sweep direction should be BUY');
  assert(bullSig!.riskRewardRatio >= 2.5, `Aurum Sweep RR must be >= 2.5, got ${bullSig!.riskRewardRatio}`);
  assert(bullSig!.tp1Price === 2660, `Aurum Sweep TP1 should target opposite liquidity 2660, got ${bullSig!.tp1Price}`);
  assert(bullSig!.slPrice < 2637.5, 'SL must sit below sweep low');

  // Bearish Asian high sweep -> displacement short
  const aurumBearCandles = makeM15Series('2026-11-17T00:00:00Z', 30, 2650, (i) => {
    if (i < 26) {
      const high = i === 10 ? 2660 : 2653;
      const low = i === 15 ? 2640 : 2647;
      return { open: 2650, high, low, close: 2650.5, volume: 900 };
    }
    if (i === 26) return { open: 2650, high: 2655, low: 2649, close: 2654, volume: 1000 };
    if (i === 27) return { open: 2654, high: 2659, low: 2653, close: 2658, volume: 1100 };
    if (i === 28) return { open: 2658, high: 2661.5, low: 2657, close: 2660.5, volume: 1700 }; // 07:00 sweep above 2660
    return { open: 2661.0, high: 2661.2, low: 2657.2, close: 2657.6, volume: 2200 }; // 07:15 bearish displacement
  });

  const bearSig = traxoAurumSweep.evaluate({
    symbol: 'XAUUSD',
    timeframe: 'M15',
    candles: aurumBearCandles,
  });
  assert(bearSig !== null, 'traxoAurumSweep should emit SELL on Asian high sweep + M15 displacement');
  assertEqual(bearSig!.direction, 'SELL', 'Aurum Sweep direction should be SELL');
  assert(bearSig!.riskRewardRatio >= 2.5, `Aurum Sweep SELL RR must be >= 2.5, got ${bearSig!.riskRewardRatio}`);

  // Reject if RR to opposite liquidity is below 2.5
  const lowRrCandles = aurumBearCandles.map((c, idx) =>
    idx === 29 ? { ...c, open: 2661.0, high: 2661.2, low: 2652.0, close: 2652.5 } : c
  );
  assertEqual(
    traxoAurumSweep.evaluate({ symbol: 'XAUUSD', timeframe: 'M15', candles: lowRrCandles }),
    null,
    'Aurum Sweep must reject setups with < 2.5 RR to opposite liquidity'
  );

  // Reject if newsBlackout is true
  const blocked = traxoAurumSweep.evaluate({
    symbol: 'XAU/USD',
    timeframe: '15m',
    candles: aurumBullCandles,
    newsBlackout: true,
  });
  assertEqual(blocked, null, 'newsBlackout must suppress Aurum Sweep signal');

  // Reject if outside London window (e.g. 05:00 UTC still in Asian range)
  const asianTimeCandles = aurumBullCandles.slice(0, 22);
  assertEqual(
    traxoAurumSweep.evaluate({ symbol: 'XAU/USD', timeframe: '15m', candles: asianTimeCandles }),
    null,
    'Aurum Sweep must not fire during Asian session'
  );
}

// 3. traxoBullionStrike tests ($10/$50 strikes + minimum 1.35x ATR stop-loss buffer)
{
  // Bullish pinbar rejecting $2650 ($50 major strike)
  const bullPinCandles = makeM15Series('2026-11-17T08:00:00Z', 20, 2655, (i) => {
    if (i < 19) {
      return { open: 2654, high: 2657, low: 2652, close: 2655, volume: 1000 };
    }
    // Pinbar dipping into $2650 ($2648.5 low) and closing strongly at $2655.5
    return { open: 2654.2, high: 2656.0, low: 2648.5, close: 2655.6, volume: 2200 };
  });

  const atrArrBull = calculateATR(bullPinCandles, 14);
  const atrBull = atrArrBull[atrArrBull.length - 1];
  const bullPinSig = traxoBullionStrike.evaluate({
    symbol: 'XAU/USD',
    timeframe: '1H',
    candles: bullPinCandles,
  });

  assert(bullPinSig !== null, 'traxoBullionStrike should fire BUY pinbar at $2650');
  assertEqual(bullPinSig!.direction, 'BUY', 'Bullion Strike BUY expected');
  assertEqual(bullPinSig!.metrics?.strikePrice, 2650, 'Should identify $2650 strike');
  assertEqual(bullPinSig!.metrics?.isMajor50Strike, true, '$2650 is a $50 major strike');
  const slDistFromWickLow = 2648.5 - bullPinSig!.slPrice;
  assert(
    slDistFromWickLow >= GOLD_MIN_SL_ATR_BUFFER * atrBull - 1e-9,
    `SL buffer from wick low (${slDistFromWickLow.toFixed(2)}) must be >= 1.35x ATR (${(1.35 * atrBull).toFixed(2)})`
  );

  // Bearish pinbar rejecting $2660 ($10 strike)
  const bearPinCandles = makeM15Series('2026-11-17T10:00:00Z', 20, 2655, (i) => {
    if (i < 19) {
      return { open: 2656, high: 2658, low: 2653, close: 2655, volume: 1000 };
    }
    return { open: 2656.5, high: 2661.2, low: 2654.2, close: 2655.0, volume: 1900 };
  });

  const atrArrBear = calculateATR(bearPinCandles, 14);
  const atrBear = atrArrBear[atrArrBear.length - 1];
  const bearPinSig = traxoBullionStrike.evaluate({
    symbol: 'GOLD',
    timeframe: '15m',
    candles: bearPinCandles,
  });

  assert(bearPinSig !== null, 'traxoBullionStrike should fire SELL pinbar at $2660');
  assertEqual(bearPinSig!.direction, 'SELL', 'Bullion Strike SELL expected');
  assertEqual(bearPinSig!.metrics?.strikePrice, 2660, 'Should identify $2660 strike');
  assertEqual(bearPinSig!.metrics?.isMajor50Strike, false, '$2660 is a $10 strike');
  const slDistFromWickHigh = bearPinSig!.slPrice - 2661.2;
  assert(
    slDistFromWickHigh >= GOLD_MIN_SL_ATR_BUFFER * atrBear - 1e-9,
    `SL buffer from wick high (${slDistFromWickHigh.toFixed(2)}) must be >= 1.35x ATR`
  );

  // Reject non-strike pinbar at $2654
  const offStrikeCandles = makeM15Series('2026-11-17T10:00:00Z', 20, 2656, (i) => {
    if (i < 19) return { open: 2656, high: 2657, low: 2655, close: 2656, volume: 1000 };
    return { open: 2656.5, high: 2657.0, low: 2653.5, close: 2656.8, volume: 1500 };
  });
  assertEqual(
    traxoBullionStrike.evaluate({ symbol: 'XAU/USD', timeframe: '15m', candles: offStrikeCandles }),
    null,
    'Pinbar away from $10/$50 strike must return null'
  );
}

// 4. traxoNyBullet tests (10:00-11:00 EST / 15:00-16:00 UTC liquidity sweep + FVG retest)
{
  // End candle at 15:30 UTC (10:30 AM EST). Start 24 bars earlier -> 09:45 UTC + 23 bars -> let's anchor precisely.
  // 24 bars of M15 ending at 15:30 UTC starts at 09:45 UTC (23 * 15m = 5h45m -> 09:45 + 5:45 = 15:30 UTC)
  const nyBullCandles = makeM15Series('2026-11-17T09:45:00Z', 24, 2650, (i) => {
    if (i < 17) {
      // Build swing low around index 12 at $2646
      if (i === 12) return { open: 2648, high: 2650, low: 2646.0, close: 2648.5, volume: 1000 };
      return { open: 2650, high: 2652, low: 2648.5, close: 2650.5, volume: 1000 };
    }
    if (i === 17) return { open: 2649, high: 2650, low: 2647, close: 2647.5, volume: 1100 };
    if (i === 18) return { open: 2647.5, high: 2648.0, low: 2644.0, close: 2646.5, volume: 1600 }; // SSL sweep below 2646
    if (i === 19) return { open: 2646.5, high: 2649.5, low: 2646.0, close: 2649.0, volume: 1400 }; // FVG candle 1 (high = 2649.5)
    if (i === 20) return { open: 2649.0, high: 2656.5, low: 2648.8, close: 2656.0, volume: 2300 }; // Displacement candle
    if (i === 21) return { open: 2656.0, high: 2658.0, low: 2653.5, close: 2657.2, volume: 1500 }; // FVG candle 3 (low = 2653.5 -> FVG [2649.5, 2653.5])
    if (i === 22) return { open: 2657.2, high: 2657.8, low: 2654.8, close: 2655.4, volume: 1200 }; // 15:15 UTC pullback toward FVG
    // i === 23 (15:30 UTC): retests FVG [2649.5, 2653.5] and rejects higher
    return { open: 2655.4, high: 2656.0, low: 2651.2, close: 2654.8, volume: 1800 };
  });

  const nyBullSig = traxoNyBullet.evaluate({
    symbol: 'XAU/USD',
    timeframe: '15m',
    candles: nyBullCandles,
  });
  assert(nyBullSig !== null, 'traxoNyBullet should fire BUY on 15:30 UTC sweep + FVG retest');
  assertEqual(nyBullSig!.direction, 'BUY', 'NY Bullet BUY expected');
  assertEqual(nyBullSig!.metrics?.fvgLow, 2649.5, 'Bullish FVG low should be 2649.5');
  assertEqual(nyBullSig!.metrics?.fvgHigh, 2653.5, 'Bullish FVG high should be 2653.5');

  // Bearish Silver Bullet at 15:15 UTC (starts at 09:30 UTC, 24 bars -> ends 15:15 UTC)
  const nyBearCandles = makeM15Series('2026-11-17T09:30:00Z', 24, 2650, (i) => {
    if (i < 17) {
      if (i === 12) return { open: 2651, high: 2654.0, low: 2650, close: 2651.5, volume: 1000 };
      return { open: 2650, high: 2651.5, low: 2648.5, close: 2650.2, volume: 1000 };
    }
    if (i === 17) return { open: 2650.5, high: 2652.5, low: 2650.0, close: 2652.0, volume: 1100 };
    if (i === 18) return { open: 2652.0, high: 2656.0, low: 2651.5, close: 2653.8, volume: 1700 }; // BSL sweep above 2654
    if (i === 19) return { open: 2653.8, high: 2654.2, low: 2651.0, close: 2651.5, volume: 1400 }; // FVG candle 1 (low = 2651.0)
    if (i === 20) return { open: 2651.5, high: 2652.0, low: 2644.0, close: 2644.5, volume: 2400 }; // Bearish displacement
    if (i === 21) return { open: 2644.5, high: 2647.5, low: 2643.0, close: 2643.8, volume: 1500 }; // FVG candle 3 (high = 2647.5 -> FVG [2647.5, 2651.0])
    if (i === 22) return { open: 2643.8, high: 2646.5, low: 2643.2, close: 2645.8, volume: 1200 };
    // i === 23 (15:15 UTC): retests bearish FVG [2647.5, 2651.0]
    return { open: 2645.8, high: 2649.5, low: 2645.2, close: 2646.2, volume: 1900 };
  });

  const nyBearSig = traxoNyBullet.evaluate({
    symbol: 'XAUUSD',
    timeframe: '15m',
    candles: nyBearCandles,
  });
  assert(nyBearSig !== null, 'traxoNyBullet should fire SELL on 15:15 UTC sweep + FVG retest');
  assertEqual(nyBearSig!.direction, 'SELL', 'NY Bullet SELL expected');

  // Outside 10:00-11:00 EST window (e.g. 14:30 UTC) must return null
  const outOfWindow = nyBullCandles.map((c, idx) => ({
    ...c,
    timestamp: new Date(Date.parse('2026-11-17T08:45:00Z') + idx * 15 * 60 * 1000).toISOString(),
  }));
  assertEqual(
    traxoNyBullet.evaluate({ symbol: 'XAU/USD', timeframe: '15m', candles: outOfWindow }),
    null,
    'NY Bullet must return null outside 10:00-11:00 EST (15:00-16:00 UTC)'
  );
}

// 5. traxoKineticNr7 tests (NR7 daily compression + high/low breakout)
{
  // 8 daily bars: days 0..5 have wide ranges ($20-$30), day 6 is NR7 ($8 range: 2646..2654, inside day!), day 7 breaks out above 2654
  const dailyCandles: TraxoCandle[] = [
    { open: 2640, high: 2662, low: 2638, close: 2650, volume: 10000, timestamp: '2026-11-08T00:00:00Z' },
    { open: 2650, high: 2668, low: 2642, close: 2655, volume: 11000, timestamp: '2026-11-09T00:00:00Z' },
    { open: 2655, high: 2670, low: 2644, close: 2648, volume: 10500, timestamp: '2026-11-10T00:00:00Z' },
    { open: 2648, high: 2665, low: 2640, close: 2652, volume: 9800, timestamp: '2026-11-11T00:00:00Z' },
    { open: 2652, high: 2664, low: 2643, close: 2651, volume: 10200, timestamp: '2026-11-12T00:00:00Z' },
    { open: 2651, high: 2660, low: 2642, close: 2650, volume: 9500, timestamp: '2026-11-13T00:00:00Z' },
    // Day 6 (NR7 + Inside Day: 2646..2654, range = 8)
    { open: 2649, high: 2654, low: 2646, close: 2651, volume: 7200, timestamp: '2026-11-14T00:00:00Z' },
    // Day 7 (Breakout above NR7 high 2654)
    { open: 2651, high: 2666, low: 2650, close: 2664, volume: 16500, timestamp: '2026-11-15T00:00:00Z' },
  ];

  const nr7DailyBuy = traxoKineticNr7.evaluate({
    symbol: 'XAU/USD',
    timeframe: '1D',
    candles: dailyCandles,
  });
  assert(nr7DailyBuy !== null, 'traxoKineticNr7 should fire BUY on daily NR7 upside breakout');
  assertEqual(nr7DailyBuy!.direction, 'BUY', 'NR7 daily breakout direction should be BUY');
  assertEqual(nr7DailyBuy!.metrics?.isInsideDay, true, 'Day 6 should be detected as ID/NR7');
  assertEqual(nr7DailyBuy!.metrics?.nr7Range, 8, 'NR7 range should be $8');

  // Intraday 1H breakout using higherTimeframeCandles daily feed -> bearish breakdown below NR7 low 2646
  const intraday1H = makeM15Series('2026-11-15T00:00:00Z', 16, 2650, (i) => {
    const ts = new Date(Date.parse('2026-11-15T00:00:00Z') + i * 60 * 60 * 1000).toISOString();
    if (i < 15) return { open: 2650, high: 2652, low: 2647, close: 2648, volume: 1100, timestamp: ts };
    return { open: 2648, high: 2648.5, low: 2642.5, close: 2643.0, volume: 2200, timestamp: ts };
  });

  // Mode 1: higherTimeframeCandles where dailyBars[-2] is NR7
  const nr7IntradayMode1 = traxoKineticNr7.evaluate({
    symbol: 'XAUUSD',
    timeframe: '1H',
    candles: intraday1H,
    higherTimeframeCandles: dailyCandles,
  });
  assert(nr7IntradayMode1 !== null, 'traxoKineticNr7 should fire SELL on intraday break below NR7 low');
  assertEqual(nr7IntradayMode1!.direction, 'SELL', 'NR7 intraday breakout direction should be SELL');

  // Mode 2: 7 daily bars where latest bar is NR7 and currentPrice breaks above NR7 high
  const nr7LiveBuy = traxoKineticNr7.evaluate({
    symbol: 'XAUUSD',
    timeframe: '1D',
    candles: dailyCandles.slice(0, 7),
    currentPrice: 2655.2,
  });
  assert(nr7LiveBuy !== null, 'traxoKineticNr7 should fire BUY when live currentPrice breaks NR7 high');
  assertEqual(nr7LiveBuy!.direction, 'BUY', 'NR7 live breakout direction should be BUY');

  // Reject when day 6 is NOT the smallest range of last 7 days
  const nonNr7Daily = dailyCandles.map((c, idx) =>
    idx === 6 ? { ...c, high: 2675, low: 2640 } : c
  );
  assertEqual(
    traxoKineticNr7.evaluate({ symbol: 'XAU/USD', timeframe: '1D', candles: nonNr7Daily }),
    null,
    'Must return null when prior day is not NR7'
  );
}

// 6. traxoAurumFix tests (14:30-15:30 UTC LBMA PM Fix VWAP 2.0σ Snapback + 1.35x ATR buffer)
{
  // Build 26 intraday M15 candles starting at 08:45 UTC (ends at 15:00 UTC = bar 25)
  const fixBullCandles = makeM15Series('2026-11-17T08:45:00Z', 26, 2650, (i) => {
    if (i < 23) {
      return { open: 2650, high: 2651.5, low: 2648.5, close: 2650, volume: 1000 };
    }
    if (i === 23) {
      // 14:30 UTC starts stretching downward
      return { open: 2650, high: 2650.2, low: 2645.0, close: 2645.5, volume: 1400 };
    }
    if (i === 24) {
      // 14:45 UTC pushes >= 2.0 sigma below VWAP
      return { open: 2645.5, high: 2646.0, low: 2640.5, close: 2641.2, volume: 1800 };
    }
    // 15:00 UTC PM Fix snapback reversal candle closing back toward VWAP (~2648.x)
    return { open: 2641.2, high: 2644.5, low: 2640.0, close: 2644.2, volume: 2100 };
  });

  const fixAtrArr = calculateATR(fixBullCandles, 14);
  const fixAtr = fixAtrArr[fixAtrArr.length - 1];
  const fixBullSig = traxoAurumFix.evaluate({
    symbol: 'XAU/USD',
    timeframe: '15m',
    candles: fixBullCandles,
  });
  assert(fixBullSig !== null, 'traxoAurumFix should fire BUY snapback at 15:00 UTC >= 2σ below VWAP');
  assertEqual(fixBullSig!.direction, 'BUY', 'Aurum Fix BUY expected');
  assert(
    2640.0 - fixBullSig!.slPrice >= GOLD_MIN_SL_ATR_BUFFER * fixAtr - 1e-9,
    'Aurum Fix BUY SL must maintain >= 1.35x ATR Gold buffer beyond sweep low'
  );

  // Bearish PM Fix snapback at 15:15 UTC (starts 09:00 UTC -> bar 25 is 15:15 UTC)
  const fixBearCandles = makeM15Series('2026-11-17T09:00:00Z', 26, 2650, (i) => {
    if (i < 23) {
      return { open: 2650, high: 2651.5, low: 2648.5, close: 2650, volume: 1000 };
    }
    if (i === 23) return { open: 2650, high: 2654.8, low: 2649.8, close: 2654.5, volume: 1400 };
    if (i === 24) return { open: 2654.5, high: 2659.5, low: 2654.0, close: 2658.8, volume: 1800 };
    return { open: 2658.8, high: 2660.0, low: 2655.4, close: 2655.8, volume: 2100 };
  });

  const fixBearSig = traxoAurumFix.evaluate({
    symbol: 'XAUUSD',
    timeframe: '15m',
    candles: fixBearCandles,
  });
  assert(fixBearSig !== null, 'traxoAurumFix should fire SELL snapback at 15:15 UTC >= 2σ above VWAP');
  assertEqual(fixBearSig!.direction, 'SELL', 'Aurum Fix SELL expected');

  // Outside 14:30-15:30 UTC (e.g. 16:00 UTC) must return null
  const outFixWindow = fixBullCandles.map((c, idx) => ({
    ...c,
    timestamp: new Date(Date.parse('2026-11-17T09:45:00Z') + idx * 15 * 60 * 1000).toISOString(),
  }));
  assertEqual(
    traxoAurumFix.evaluate({ symbol: 'XAU/USD', timeframe: '15m', candles: outFixWindow }),
    null,
    'traxoAurumFix must return null outside 14:30-15:30 UTC'
  );
}

console.log('All TRAXO Gold (XAU/USD) strategy tests passed cleanly!');
