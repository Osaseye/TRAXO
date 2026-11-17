import {
  TRAXO_FUTURES_STRATEGIES,
  traxoGlobexSweep,
  traxoVelocityOrb,
  traxoInitialBalance,
  traxoMeanEquilibrium,
  traxoPowerHourMoc,
  extractOvernightRange,
  extractFiveMinuteOrb,
  extractInitialBalance,
  computeSessionVwapZScore,
  toNyClock,
} from '../server/algorithms/traxo/futures';
import type { ITraxoStrategy, TraxoCandle } from '../server/algorithms/traxo/types';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed (${msg}): expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeBar(
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000
): TraxoCandle {
  return { open, high, low, close, volume, timestamp };
}

// ---------------------------------------------------------------------------
// 0. Contract & Registry Compliance
// ---------------------------------------------------------------------------
assertEqual(TRAXO_FUTURES_STRATEGIES.length, 5, 'Should export 5 futures strategies');
for (const strat of TRAXO_FUTURES_STRATEGIES as ITraxoStrategy[]) {
  assert(typeof strat.id === 'string' && strat.id.length > 0, 'Strategy id present');
  assert(typeof strat.name === 'string' && strat.name.length > 0, 'Strategy name present');
  assertEqual(strat.market, 'FUTURES', `${strat.id} market must be FUTURES`);
  assert(strat.supportedSymbols.includes('MNQ'), `${strat.id} supports MNQ`);
  assert(strat.supportedSymbols.includes('NQ'), `${strat.id} supports NQ`);
  assert(strat.supportedSymbols.includes('USTEC'), `${strat.id} supports USTEC`);
  assert(Array.isArray(strat.optimalTimeframes) && strat.optimalTimeframes.length > 0, `${strat.id} optimalTimeframes`);
  assert(typeof strat.evaluate === 'function', `${strat.id} evaluate method`);
}

// ---------------------------------------------------------------------------
// 1. traxoGlobexSweep — Overnight High/Low (ONH/ONL) Cash Open Sweep
// ---------------------------------------------------------------------------
{
  // Winter EST day: 2026-11-17 (EST = UTC-5, so 09:30 EST = 14:30 UTC)
  // Build Globex overnight bars from 2026-11-16 20:00 ET (2026-11-17T01:00Z) to 2026-11-17 09:25 ET (14:25Z)
  const baseCandles: TraxoCandle[] = [];
  for (let i = 0; i < 20; i++) {
    const utcHour = 1 + Math.floor((i * 40) / 60);
    const utcMin = (i * 40) % 60;
    // Keep all <= 14:25 UTC
    if (utcHour > 14 || (utcHour === 14 && utcMin >= 30)) break;
    const ts = `2026-11-17T${String(utcHour).padStart(2, '0')}:${String(utcMin).padStart(2, '0')}:00Z`;
    const isUp = i % 2 === 0;
    baseCandles.push(
      makeBar(
        ts,
        isUp ? 20990 : 21010,
        isUp ? 21020 : 21015, // ONH = 21020
        isUp ? 20985 : 20980, // ONL = 20980
        isUp ? 21010 : 20990,
        1000
      )
    );
  }

  const ny0930Clock = toNyClock('2026-11-17T14:30:00Z')!;
  assertEqual(ny0930Clock.nyHour, 9, '2026-11-17T14:30:00Z must resolve to 09:xx ET');
  assertEqual(ny0930Clock.nyMinute, 30, '2026-11-17T14:30:00Z must resolve to xx:30 ET');

  const onSummary = extractOvernightRange(baseCandles, ny0930Clock);
  assert(onSummary !== null, 'Overnight range extracted');
  assertEqual(onSummary!.onh, 21020, 'ONH should equal 21020');
  assertEqual(onSummary!.onl, 20980, 'ONL should equal 20980');

  // Bearish Sweep of ONH at 09:35 EST (14:35 UTC) with high RVOL (2.2x)
  const bearishSweep = [
    ...baseCandles,
    makeBar('2026-11-17T14:35:00Z', 21012, 21048, 20998, 21002, 2200),
  ];
  const sellSig = traxoGlobexSweep.evaluate({
    symbol: 'NQ',
    timeframe: '5m',
    candles: bearishSweep,
  });
  assert(sellSig !== null, 'Globex sweep should fire SELL on ONH sweep + rejection');
  assertEqual(sellSig!.direction, 'SELL', 'Globex ONH sweep direction');
  assertEqual(sellSig!.symbol, 'NQ', 'Globex symbol');
  assert(sellSig!.slPrice > 21048, 'SL placed above sweep high');
  assert(sellSig!.tp1Price < sellSig!.entryPrice, 'TP1 below entry for SELL');

  // Low RVOL rejection must be ignored
  const lowRvolSweep = [
    ...baseCandles,
    makeBar('2026-11-17T14:35:00Z', 21012, 21048, 20998, 21002, 900),
  ];
  assertEqual(
    traxoGlobexSweep.evaluate({ symbol: 'NQ', timeframe: '5m', candles: lowRvolSweep }),
    null,
    'Globex sweep requires high RVOL'
  );

  // Outside first 15 mins (09:50 EST = 14:50 UTC) must be ignored
  const lateSweep = [
    ...baseCandles,
    makeBar('2026-11-17T14:50:00Z', 21012, 21048, 20998, 21002, 2500),
  ];
  assertEqual(
    traxoGlobexSweep.evaluate({ symbol: 'NQ', timeframe: '5m', candles: lateSweep }),
    null,
    'Globex sweep ignores signals after first 15 mins'
  );

  // Bullish Sweep of ONL during summer EDT (2026-06-15T13:35:00Z = 09:35 EDT)
  const summerBase: TraxoCandle[] = [];
  for (let i = 0; i < 16; i++) {
    const totalMin = 60 + i * 45; // 01:00Z to 12:15Z (before 13:30Z open)
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const ts = `2026-06-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    summerBase.push(makeBar(ts, 19500, 19520, 19480, 19505, 1000));
  }
  const bullishSweep = [
    ...summerBase,
    makeBar('2026-06-15T13:35:00Z', 19486, 19508, 19455, 19502, 2100),
  ];
  const buySig = traxoGlobexSweep.evaluate({
    symbol: 'USTEC',
    timeframe: '5m',
    candles: bullishSweep,
  });
  assert(buySig !== null, 'Globex sweep should fire BUY on ONL sweep + rejection in EDT');
  assertEqual(buySig!.direction, 'BUY', 'Globex ONL sweep direction');
  assertEqual(buySig!.symbol, 'USTEC', 'Globex USTEC symbol');
}

// ---------------------------------------------------------------------------
// 2. traxoVelocityOrb — 5-Minute Opening Range Breakout (ORB)
// ---------------------------------------------------------------------------
{
  const preOpen: TraxoCandle[] = [];
  for (let i = 0; i < 15; i++) {
    const min = 15 + i * 5; // 08:15 to 09:25 ET -> 13:15 to 14:25 UTC
    const h = 13 + Math.floor(min / 60);
    const m = min % 60;
    preOpen.push(
      makeBar(
        `2026-11-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
        21000,
        21008,
        20992,
        21002,
        1000
      )
    );
  }

  // 09:30-09:35 EST (14:30 UTC) bullish ORB bar with RVOL = 2.0 (>= 1.5)
  const orbBullCandles = [
    ...preOpen,
    makeBar('2026-11-17T14:30:00Z', 21002, 21030, 20998, 21026, 2000),
  ];

  const orbStopOrder = traxoVelocityOrb.evaluate({
    symbol: 'MNQ',
    timeframe: '5m',
    candles: orbBullCandles,
  });
  assert(orbStopOrder !== null, 'Velocity ORB should arm STOP order at close of 09:30-09:35 candle');
  assertEqual(orbStopOrder!.direction, 'BUY', 'ORB bullish bias');
  assertEqual(orbStopOrder!.entryType, 'STOP', 'ORB close arms STOP order');
  assertEqual(orbStopOrder!.riskRewardRatio, 2, 'ORB enforces exact 1:2 RR');

  // Post-ORB 09:35 ET breakout candle above ORB high
  const orbBreakoutCandles = [
    ...preOpen,
    makeBar('2026-11-17T14:30:00Z', 21002, 21024, 20996, 21010, 1200),
    makeBar('2026-11-17T14:35:00Z', 21010, 21038, 21006, 21034, 2100),
  ];
  const orbMarketBreakout = traxoVelocityOrb.evaluate({
    symbol: 'NAS100', // alias for USTEC
    timeframe: '5m',
    candles: orbBreakoutCandles,
  });
  assert(orbMarketBreakout !== null, 'Velocity ORB should trigger MARKET breakout on 09:35 candle');
  assertEqual(orbMarketBreakout!.symbol, 'USTEC', 'NAS100 normalizes to USTEC');
  assertEqual(orbMarketBreakout!.direction, 'BUY', 'ORB upward breakout');
  assertEqual(orbMarketBreakout!.entryType, 'MARKET', 'Post-ORB breakout is MARKET');
  assertEqual(orbMarketBreakout!.riskRewardRatio, 2, 'Post-ORB breakout enforces exact 1:2 RR');

  // Negative: RVOL < 1.5
  const lowVolOrb = [
    ...preOpen,
    makeBar('2026-11-17T14:30:00Z', 21002, 21030, 20998, 21026, 1100),
  ];
  assertEqual(
    traxoVelocityOrb.evaluate({ symbol: 'MNQ', timeframe: '5m', candles: lowVolOrb }),
    null,
    'ORB rejects setups with RVOL < 1.5'
  );

  // Helper check
  const nyOrbClock = toNyClock('2026-11-17T14:35:00Z')!;
  const extractedOrb = extractFiveMinuteOrb(orbBreakoutCandles, nyOrbClock, '5m');
  assert(extractedOrb !== null && extractedOrb.high === 21024 && extractedOrb.low === 20996, 'ORB extraction');

  // 1m timeframe ORB (09:30-09:34 EST = 5 1m bars) + bearish SELL breakout at 09:35 EST
  const preOpen1m: TraxoCandle[] = [];
  for (let i = 0; i < 15; i++) {
    const min = 15 + i;
    preOpen1m.push(makeBar(`2026-11-17T14:${String(min).padStart(2, '0')}:00Z`, 21000, 21004, 20996, 21000, 300));
  }
  const orb1mBars = [
    ...preOpen1m,
    makeBar('2026-11-17T14:30:00Z', 21000, 21006, 20994, 20998, 500),
    makeBar('2026-11-17T14:31:00Z', 20998, 21002, 20990, 20992, 520),
    makeBar('2026-11-17T14:32:00Z', 20992, 20996, 20988, 20990, 500),
    makeBar('2026-11-17T14:33:00Z', 20990, 20994, 20986, 20988, 510),
    makeBar('2026-11-17T14:34:00Z', 20988, 20992, 20984, 20985, 550),
    makeBar('2026-11-17T14:35:00Z', 20985, 20987, 20972, 20975, 600),
  ];
  const orbBear1m = traxoVelocityOrb.evaluate({
    symbol: 'MNQ',
    timeframe: '1m',
    candles: orb1mBars,
  });
  assert(orbBear1m !== null, 'Velocity ORB 1m should trigger SELL breakout below ORB low');
  assertEqual(orbBear1m!.direction, 'SELL', '1m ORB bearish breakout');
  assertEqual(orbBear1m!.riskRewardRatio, 2, '1m ORB enforces 1:2 RR');
}

// ---------------------------------------------------------------------------
// 3. traxoInitialBalance — IB (09:30-10:30 ET) Breakout & First Retest
// ---------------------------------------------------------------------------
{
  const ibCandles: TraxoCandle[] = [];
  // 09:30 to 10:25 ET (14:30 to 15:25 UTC) in 5m bars = 12 bars, IB range 21000 - 21050
  for (let i = 0; i < 12; i++) {
    const totalMin = 30 + i * 5;
    const utcH = 14 + Math.floor(totalMin / 60);
    const utcM = totalMin % 60;
    const ts = `2026-11-17T${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}:00Z`;
    ibCandles.push(
      makeBar(ts, 21020, i === 5 ? 21050 : 21040, i === 2 ? 21000 : 21010, 21028, 1200)
    );
  }

  // Clean expansion out above 21050 at 10:30, 10:35, 10:40 ET (15:30, 15:35, 15:40 UTC)
  const expansionBars: TraxoCandle[] = [
    ...ibCandles,
    makeBar('2026-11-17T15:30:00Z', 21030, 21072, 21028, 21068, 1800),
    makeBar('2026-11-17T15:35:00Z', 21068, 21090, 21062, 21084, 1500),
  ];

  // First pullback touch back to IB High (21050) at 10:40 ET (15:40 UTC)
  const firstRetestBars: TraxoCandle[] = [
    ...expansionBars,
    makeBar('2026-11-17T15:40:00Z', 21082, 21085, 21049, 21064, 1550),
  ];

  const ibBuySig = traxoInitialBalance.evaluate({
    symbol: 'NQ',
    timeframe: '5m',
    candles: firstRetestBars,
  });
  assert(ibBuySig !== null, 'IB Breakout & First Retest should trigger BUY');
  assertEqual(ibBuySig!.direction, 'BUY', 'IB bullish retest direction');
  assert(ibBuySig!.slPrice < 21049, 'SL below IB High retest low');

  // Second touch after an earlier retest must NOT re-trigger
  const secondRetestBars: TraxoCandle[] = [
    ...firstRetestBars,
    makeBar('2026-11-17T15:45:00Z', 21064, 21078, 21060, 21072, 1300),
    makeBar('2026-11-17T15:50:00Z', 21072, 21074, 21050, 21062, 1400),
  ];
  assertEqual(
    traxoInitialBalance.evaluate({ symbol: 'NQ', timeframe: '5m', candles: secondRetestBars }),
    null,
    'IB ignores subsequent retests after first pullback touch'
  );

  const ibCheck = extractInitialBalance(firstRetestBars, toNyClock('2026-11-17T15:40:00Z')!);
  assert(ibCheck !== null && ibCheck.high === 21050 && ibCheck.low === 21000, 'IB boundaries extracted');

  // Bearish IB Breakout below 21000 & First Pullback Touch to IB Low
  const bearExpansionRetest: TraxoCandle[] = [
    ...ibCandles,
    makeBar('2026-11-17T15:30:00Z', 21008, 21010, 20975, 20978, 1750),
    makeBar('2026-11-17T15:35:00Z', 20978, 20982, 20962, 20968, 1600),
    makeBar('2026-11-17T15:40:00Z', 20969, 21001, 20966, 20988, 1500),
  ];
  const ibSellSig = traxoInitialBalance.evaluate({
    symbol: 'USTEC',
    timeframe: '5m',
    candles: bearExpansionRetest,
  });
  assert(ibSellSig !== null, 'IB Breakout & First Retest should trigger SELL on IB Low touch');
  assertEqual(ibSellSig!.direction, 'SELL', 'IB bearish retest direction');
  assert(ibSellSig!.slPrice > 21001, 'SL above IB Low retest high');
}

// ---------------------------------------------------------------------------
// 4. traxoMeanEquilibrium — Midday VWAP Mean Reversion Scalp (11:30-13:30 ET)
// ---------------------------------------------------------------------------
{
  // Build RTH bars from 09:30 ET (14:30Z) to 12:00 ET (17:00Z) oscillating tightly around 21000
  const middayCandles: TraxoCandle[] = [];
  for (let i = 0; i < 16; i++) {
    const totalMin = 14 * 60 + 30 + i * 10; // 14:30Z -> 17:00Z
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const ts = `2026-11-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    const offset = i % 2 === 0 ? 6 : -6;
    middayCandles.push(
      makeBar(ts, 21000 + offset, 21010 + offset, 20990 + offset, 21000 - offset, 1200)
    );
  }

  // Sudden midday spike > +2.0 stdDev above VWAP at 12:15 ET (17:15 UTC)
  const overextendedUp = [
    ...middayCandles,
    makeBar('2026-11-17T17:15:00Z', 21005, 21075, 21002, 21055, 950),
  ];

  const vwapCheck = computeSessionVwapZScore(
    overextendedUp,
    toNyClock('2026-11-17T17:15:00Z')!,
    21055
  );
  assert(vwapCheck !== null && vwapCheck.zScore > 2.0, `Expected zScore > 2.0, got ${vwapCheck?.zScore}`);

  const fadeSellSig = traxoMeanEquilibrium.evaluate({
    symbol: 'MNQ',
    timeframe: '5m',
    candles: overextendedUp,
  });
  assert(fadeSellSig !== null, 'Mean Equilibrium should trigger SELL fade when zScore > 2.0');
  assertEqual(fadeSellSig!.direction, 'SELL', 'Mean reversion fades extended upside');
  assert(
    Math.abs(fadeSellSig!.tp1Price - Number(vwapCheck!.vwap.toFixed(2))) < 0.02,
    'TP1 targets session VWAP equilibrium'
  );

  // Oversold < -2.0 stdDev -> BUY fade back to VWAP
  const overextendedDown = [
    ...middayCandles,
    makeBar('2026-11-17T17:15:00Z', 20995, 20998, 20925, 20945, 900),
  ];
  const fadeBuySig = traxoMeanEquilibrium.evaluate({
    symbol: 'MNQ',
    timeframe: '5m',
    candles: overextendedDown,
  });
  assert(fadeBuySig !== null, 'Mean Equilibrium should trigger BUY fade when zScore < -2.0');
  assertEqual(fadeBuySig!.direction, 'BUY', 'Mean reversion fades extended downside');

  // Negative: outside midday window (10:45 ET = 15:45 UTC)
  const morningSpike = [
    ...middayCandles.slice(0, 12),
    makeBar('2026-11-17T15:45:00Z', 21005, 21075, 21002, 21055, 950),
  ];
  assertEqual(
    traxoMeanEquilibrium.evaluate({ symbol: 'MNQ', timeframe: '5m', candles: morningSpike }),
    null,
    'Mean Equilibrium only trades during 11:30-13:30 ET'
  );
}

// ---------------------------------------------------------------------------
// 5. traxoPowerHourMoc — Late Day Market-on-Close Momentum (15:30-16:00 ET)
// ---------------------------------------------------------------------------
{
  // Steady bullish trend from 09:30 ET (14:30Z) to 15:25 ET (20:25Z)
  const trendCandles: TraxoCandle[] = [];
  let price = 20850;
  for (let i = 0; i < 24; i++) {
    const totalMin = 14 * 60 + 30 + i * 15; // 14:30Z to 20:15Z (15:15 ET)
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const ts = `2026-11-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    const open = price;
    const close = price + 12;
    trendCandles.push(makeBar(ts, open, close + 4, open - 3, close, 1200));
    price = close;
  }

  // Higher timeframe bullish trend candles
  const htfBull: TraxoCandle[] = [];
  for (let i = 0; i < 15; i++) {
    const p = 20700 + i * 25;
    htfBull.push(makeBar(`2026-11-16T${String(i).padStart(2, '0')}:00:00Z`, p, p + 20, p - 5, p + 18, 5000));
  }

  // 15:45 ET (20:45 UTC) MOC bullish continuation bar
  const mocBuyBars = [
    ...trendCandles,
    makeBar('2026-11-17T20:45:00Z', price, price + 26, price - 4, price + 22, 1950),
  ];

  const mocBuySig = traxoPowerHourMoc.evaluate({
    symbol: 'USTEC',
    timeframe: '15m',
    candles: mocBuyBars,
    higherTimeframeCandles: htfBull,
  });
  assert(mocBuySig !== null, 'Power Hour MOC should trigger BUY on bullish trend day');
  assertEqual(mocBuySig!.direction, 'BUY', 'MOC continuation follows bullish trend');
  assertEqual(mocBuySig!.metrics?.htfAligned, true, 'HTF alignment flagged');

  // Negative: outside 15:30-16:00 ET (e.g. 15:15 ET = 20:15 UTC)
  assertEqual(
    traxoPowerHourMoc.evaluate({ symbol: 'USTEC', timeframe: '15m', candles: trendCandles }),
    null,
    'Power Hour MOC ignores signals before 15:30 ET'
  );

  // Negative: counter-trend red bar inside 15:30-16:00 ET
  const counterTrendMoc = [
    ...trendCandles,
    makeBar('2026-11-17T20:45:00Z', price, price + 3, price - 30, price - 25, 1950),
  ];
  assertEqual(
    traxoPowerHourMoc.evaluate({ symbol: 'USTEC', timeframe: '15m', candles: counterTrendMoc }),
    null,
    'Power Hour MOC rejects counter-trend candles'
  );

  // Bearish prevailing daily trend + 15:45 ET MOC bearish continuation
  const bearTrendCandles: TraxoCandle[] = [];
  let bearPrice = 21200;
  for (let i = 0; i < 24; i++) {
    const totalMin = 14 * 60 + 30 + i * 15;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const ts = `2026-11-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    const open = bearPrice;
    const close = bearPrice - 12;
    bearTrendCandles.push(makeBar(ts, open, open + 3, close - 4, close, 1200));
    bearPrice = close;
  }
  const mocSellBars = [
    ...bearTrendCandles,
    makeBar('2026-11-17T20:45:00Z', bearPrice, bearPrice + 4, bearPrice - 26, bearPrice - 22, 1900),
  ];
  const mocSellSig = traxoPowerHourMoc.evaluate({
    symbol: 'MNQ',
    timeframe: '15m',
    candles: mocSellBars,
  });
  assert(mocSellSig !== null, 'Power Hour MOC should trigger SELL on bearish trend day');
  assertEqual(mocSellSig!.direction, 'SELL', 'MOC continuation follows bearish trend');
}

// News blackout & unsupported symbol checks
{
  const dummyBars = Array.from({ length: 20 }, (_, i) =>
    makeBar(`2026-11-17T14:${String(i).padStart(2, '0')}:00Z`, 21000, 21010, 20990, 21005, 1000)
  );
  for (const strat of TRAXO_FUTURES_STRATEGIES) {
    assertEqual(
      strat.evaluate({ symbol: 'EURUSD', timeframe: '5m', candles: dummyBars }),
      null,
      `${strat.id} must reject unsupported symbol EURUSD`
    );
    assertEqual(
      strat.evaluate({ symbol: 'MNQ', timeframe: '5m', candles: dummyBars, newsBlackout: true }),
      null,
      `${strat.id} must respect newsBlackout`
    );
  }
}

console.log('All TRAXO Futures Proprietary Engine tests passed cleanly!');
