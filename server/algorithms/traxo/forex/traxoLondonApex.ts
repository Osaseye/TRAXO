/**
 * TRAXO London Apex — London Judas Swing Engine
 *
 * Detects the Asian session consolidation range (00:00-06:00 UTC), then
 * triggers during the London Open killzone (07:00-10:00 UTC) when price
 * stages a liquidity fakeout beyond the Asian High/Low and rejects back
 * inside the range with a confirmed reversal candle.
 */

import { calculateATR, calculateRVOL } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildForexSignal,
  getForexPipSize,
  getUtcDateKey,
  isSupportedForexSymbol,
  LONDON_APEX_SYMBOLS,
  parseUtcDate,
  resolveUtcClock,
} from './forexUtils';

export interface AsianRangeSummary {
  high: number;
  low: number;
  mid: number;
  range: number;
  candleCount: number;
}

/**
 * Extracts the Asian session range (00:00-06:00 UTC) for the target UTC date.
 */
export function extractAsianRange(candles: TraxoCandle[], targetDateKey: string): AsianRangeSummary | null {
  const asianCandles = candles.filter((c) => {
    const d = parseUtcDate(c.timestamp);
    if (!d) return false;
    if (getUtcDateKey(d) !== targetDateKey) return false;
    const hour = d.getUTCHours();
    return hour >= 0 && hour < 6;
  });

  if (asianCandles.length < 3) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const c of asianCandles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }

  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) return null;

  return {
    high,
    low,
    mid: (high + low) / 2,
    range,
    candleCount: asianCandles.length,
  };
}

function isBullishReversalCandle(current: TraxoCandle, prev: TraxoCandle): {
  valid: boolean;
  strongWick: boolean;
  engulfing: boolean;
  wickRatio: number;
} {
  const range = current.high - current.low;
  if (range <= 0) return { valid: false, strongWick: false, engulfing: false, wickRatio: 0 };

  const body = Math.abs(current.close - current.open);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  const wickRatio = lowerWick / range;
  const closePosition = (current.close - current.low) / range;

  const isBullClose = current.close > current.open;
  const strongWick = wickRatio >= 0.4 && lowerWick >= body * 1.1 && lowerWick > upperWick * 1.3 && closePosition >= 0.55;
  const engulfing = isBullClose && prev.close < prev.open && current.close > prev.open && current.open <= prev.close;

  return {
    valid: isBullClose || strongWick,
    strongWick,
    engulfing,
    wickRatio,
  };
}

function isBearishReversalCandle(current: TraxoCandle, prev: TraxoCandle): {
  valid: boolean;
  strongWick: boolean;
  engulfing: boolean;
  wickRatio: number;
} {
  const range = current.high - current.low;
  if (range <= 0) return { valid: false, strongWick: false, engulfing: false, wickRatio: 0 };

  const body = Math.abs(current.close - current.open);
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const wickRatio = upperWick / range;
  const closePosition = (current.close - current.low) / range;

  const isBearClose = current.close < current.open;
  const strongWick = wickRatio >= 0.4 && upperWick >= body * 1.1 && upperWick > lowerWick * 1.3 && closePosition <= 0.45;
  const engulfing = isBearClose && prev.close > prev.open && current.close < prev.open && current.open >= prev.close;

  return {
    valid: isBearClose || strongWick,
    strongWick,
    engulfing,
    wickRatio,
  };
}

export class TraxoLondonApexStrategy implements ITraxoStrategy {
  readonly id = 'traxo_london_apex';
  readonly name = 'TRAXO London Apex';
  readonly market = 'FOREX' as const;
  readonly supportedSymbols = LONDON_APEX_SYMBOLS;
  readonly optimalTimeframes = ['5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedForexSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!context.candles || context.candles.length < 10) return null;

    const latest = context.candles[context.candles.length - 1];
    const prev = context.candles[context.candles.length - 2];
    const clock = resolveUtcClock(context, latest);
    if (!clock) return null;

    // London Open Killzone: 07:00 - 10:00 UTC
    if (clock.utcHour < 7 || clock.utcHour >= 10) return null;

    const asian = extractAsianRange(context.candles, clock.dateKey);
    if (!asian) return null;

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const pipSize = getForexPipSize(context.symbol);
    const minSweep = Math.max(pipSize * 1.5, atr * 0.05);
    const maxFakeoutExtension = atr * 2.5;

    // Must close back inside the Asian range on the triggering candle
    if (latest.close >= asian.high || latest.close <= asian.low) return null;

    // Check recent London Open candles (up to last 3 bars within 07:00-10:00 UTC on same day)
    const londonWindowBars = context.candles.slice(-3).filter((c) => {
      const d = parseUtcDate(c.timestamp);
      if (!d) return false;
      return getUtcDateKey(d) === clock.dateKey && d.getUTCHours() >= 7 && d.getUTCHours() < 10;
    });
    if (londonWindowBars.length === 0) return null;

    let highestLondonSweep = -Infinity;
    let lowestLondonSweep = Infinity;
    for (const bar of londonWindowBars) {
      if (bar.high > highestLondonSweep) highestLondonSweep = bar.high;
      if (bar.low < lowestLondonSweep) lowestLondonSweep = bar.low;
    }

    const sweptHigh = highestLondonSweep > asian.high + minSweep && highestLondonSweep - asian.high <= maxFakeoutExtension;
    const sweptLow = lowestLondonSweep < asian.low - minSweep && asian.low - lowestLondonSweep <= maxFakeoutExtension;

    if (!sweptHigh && !sweptLow) return null;

    const bullRev = isBullishReversalCandle(latest, prev);
    const bearRev = isBearishReversalCandle(latest, prev);

    let direction: 'BUY' | 'SELL' | null = null;
    let reversalInfo: { strongWick: boolean; engulfing: boolean; wickRatio: number } | null = null;

    if (sweptLow && !sweptHigh && bullRev.valid) {
      direction = 'BUY';
      reversalInfo = bullRev;
    } else if (sweptHigh && !sweptLow && bearRev.valid) {
      direction = 'SELL';
      reversalInfo = bearRev;
    } else if (sweptLow && sweptHigh) {
      // If both sides swept within window, follow the latest candle's clear rejection
      if (bullRev.valid && !bearRev.valid) {
        direction = 'BUY';
        reversalInfo = bullRev;
      } else if (bearRev.valid && !bullRev.valid) {
        direction = 'SELL';
        reversalInfo = bearRev;
      }
    }

    if (!direction || !reversalInfo) return null;

    const entryPrice = context.currentPrice ?? latest.close;
    const buffer = Math.max(pipSize * 3, atr * 0.25);
    const rvol = calculateRVOL(context.candles, 20);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;
    let sweepDistance: number;

    if (direction === 'BUY') {
      slPrice = lowestLondonSweep - buffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      tp1Price = Math.max(asian.high, entryPrice + risk * 1.4);
      tp2Price = Math.max(asian.high + asian.range * 0.5, entryPrice + risk * 2.4);
      sweepDistance = asian.low - lowestLondonSweep;
    } else {
      slPrice = highestLondonSweep + buffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      tp1Price = Math.min(asian.low, entryPrice - risk * 1.4);
      tp2Price = Math.min(asian.low - asian.range * 0.5, entryPrice - risk * 2.4);
      sweepDistance = highestLondonSweep - asian.high;
    }

    let score = 48;
    const reasons: string[] = [
      `Asian range detected (${asian.low.toFixed(5)} - ${asian.high.toFixed(5)}) across ${asian.candleCount} bars`,
      direction === 'BUY'
        ? `London Open Judas Swing swept Asian Low by ${(sweepDistance / pipSize).toFixed(1)} pips and rejected back inside range`
        : `London Open Judas Swing swept Asian High by ${(sweepDistance / pipSize).toFixed(1)} pips and rejected back inside range`,
    ];

    if (asian.range <= atr * 3.5 && asian.range >= pipSize * 5) {
      score += 14;
      reasons.push('Compact Asian session liquidity box boosts expansion probability');
    }
    if (reversalInfo.strongWick) {
      score += 14;
      reasons.push(`Strong rejection wick (${Math.round(reversalInfo.wickRatio * 100)}% of candle range)`);
    }
    if (reversalInfo.engulfing) {
      score += 10;
      reasons.push('Reversal candle engulfed prior London bar');
    }
    if (rvol >= 1.2) {
      score += 12;
      reasons.push(`Elevated sweep participation (RVOL ${rvol.toFixed(2)}x)`);
    }
    if (clock.utcHour === 7 || clock.utcHour === 8) {
      score += 6;
      reasons.push('Triggered inside prime London Open killzone (07:00-09:00 UTC)');
    }

    return buildForexSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction,
      rawScore: Math.min(98, score),
      entryType: 'MARKET',
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        asianHigh: asian.high,
        asianLow: asian.low,
        asianRangePips: Number((asian.range / pipSize).toFixed(1)),
        sweepPips: Number((sweepDistance / pipSize).toFixed(1)),
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(5)),
        utcHour: clock.utcHour,
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoLondonApex = new TraxoLondonApexStrategy();
