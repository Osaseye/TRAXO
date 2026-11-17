/**
 * TRAXO Velocity ORB — 5-Minute Opening Range Breakout Engine
 *
 * Evaluates the 09:30-09:35 ET (14:30-14:35 UTC in EST) 5-minute Opening Range.
 * Requires RVOL >= 1.5 and triggers a directional breakout order above ORB high
 * or below ORB low targeting 1:2 Risk-to-Reward.
 */

import { calculateATR, calculateRVOL } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildFuturesSignal,
  FUTURES_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedFuturesSymbol,
  normalizeTimeframe,
  NyClockSnapshot,
  resolveNyClock,
  toNyClock,
} from './futuresUtils';

export interface OpeningRangeSummary {
  high: number;
  low: number;
  mid: number;
  range: number;
  open: number;
  close: number;
  orbRvol: number;
  endIndex: number;
}

const ORB_START_MINUTES = 9 * 60 + 30; // 09:30 ET
const ORB_END_MINUTES = 9 * 60 + 35; // 09:35 ET
const ORB_TRADE_CUTOFF_MINUTES = 11 * 60; // 11:00 ET

/**
 * Extracts the 09:30-09:35 ET 5-minute Opening Range from either 5m or 1m candles.
 */
export function extractFiveMinuteOrb(
  candles: TraxoCandle[],
  clock: NyClockSnapshot,
  timeframe: string
): OpeningRangeSummary | null {
  const tf = normalizeTimeframe(timeframe);
  const orbIndices: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const ny = toNyClock(candles[i].timestamp);
    if (!ny || ny.nyDateKey !== clock.nyDateKey) continue;
    if (ny.nyMinutesOfDay >= ORB_START_MINUTES && ny.nyMinutesOfDay < ORB_END_MINUTES) {
      orbIndices.push(i);
    }
  }

  if (orbIndices.length === 0) return null;
  if (tf === '1m' && orbIndices.length < 5) return null;

  let high = -Infinity;
  let low = Infinity;
  let totalVolume = 0;
  for (const idx of orbIndices) {
    const c = candles[idx];
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    totalVolume += c.volume || 1;
  }

  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) return null;

  const firstBar = candles[orbIndices[0]];
  const lastIdx = orbIndices[orbIndices.length - 1];
  const lastBar = candles[lastIdx];

  // Calculate RVOL of the ORB window relative to preceding 20-bar baseline
  let orbRvol: number;
  if (orbIndices.length === 1) {
    orbRvol = calculateRVOL(candles.slice(0, lastIdx + 1), 20);
  } else {
    const preOrbStart = Math.max(0, orbIndices[0] - 20);
    const baseline = candles.slice(preOrbStart, orbIndices[0]);
    if (baseline.length === 0) {
      orbRvol = calculateRVOL(candles.slice(0, lastIdx + 1), 20);
    } else {
      const avgPerBar = baseline.reduce((sum, c) => sum + (c.volume || 1), 0) / baseline.length;
      const avgOrbBarVol = totalVolume / orbIndices.length;
      orbRvol = avgPerBar > 0 ? avgOrbBarVol / avgPerBar : 1.0;
    }
  }

  return {
    high,
    low,
    mid: (high + low) / 2,
    range,
    open: firstBar.open,
    close: lastBar.close,
    orbRvol,
    endIndex: lastIdx,
  };
}

export class TraxoVelocityOrbStrategy implements ITraxoStrategy {
  readonly id = 'traxo_velocity_orb';
  readonly name = 'TRAXO Velocity ORB';
  readonly market = 'FUTURES' as const;
  readonly supportedSymbols = FUTURES_SUPPORTED_SYMBOLS;
  readonly optimalTimeframes = ['1m', '5m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedFuturesSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!hasValidCandles(context.candles, 10)) return null;

    const tf = normalizeTimeframe(context.timeframe);
    if (tf !== '1m' && tf !== '5m') return null;

    const latest = context.candles[context.candles.length - 1];
    const clock = resolveNyClock(context, latest);
    if (!clock) return null;

    // Must be at or after the 09:30-09:35 ET ORB formation and before 11:00 ET
    if (
      clock.nyMinutesOfDay < ORB_START_MINUTES ||
      clock.nyMinutesOfDay >= ORB_TRADE_CUTOFF_MINUTES
    ) {
      return null;
    }

    const orb = extractFiveMinuteOrb(context.candles, clock, tf);
    if (!orb) return null;

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const latestRvol = calculateRVOL(context.candles, 20);
    const isOrbCloseBar = orb.endIndex === context.candles.length - 1;
    const effectiveRvol = isOrbCloseBar ? orb.orbRvol : Math.max(latestRvol, orb.orbRvol);

    // Core requirement: RVOL >= 1.5
    if (effectiveRvol < 1.5) return null;

    const tickBuffer = 0.5;
    let direction: 'BUY' | 'SELL';
    let entryType: 'STOP' | 'MARKET';
    let entryPrice: number;
    let slPrice: number;

    if (isOrbCloseBar) {
      // Evaluating directly on the 09:30-09:35 ORB candle close: arm STOP breakout order
      const closePos = (orb.close - orb.low) / orb.range;
      if (orb.close > orb.open && closePos >= 0.55) {
        direction = 'BUY';
        entryType = 'STOP';
        entryPrice = orb.high + tickBuffer;
        slPrice = Math.max(orb.low - tickBuffer, entryPrice - atr * 2.5);
      } else if (orb.close < orb.open && closePos <= 0.45) {
        direction = 'SELL';
        entryType = 'STOP';
        entryPrice = orb.low - tickBuffer;
        slPrice = Math.min(orb.high + tickBuffer, entryPrice + atr * 2.5);
      } else {
        return null;
      }
    } else {
      // Evaluating post-ORB candles (09:35 - 11:00 ET): trigger on breakout close outside ORB
      const maxChase = orb.range * 1.5;
      if (latest.close > orb.high + tickBuffer && latest.close - orb.high <= maxChase) {
        // Ensure prior post-ORB bar wasn't already far outside (prefer fresh breakout)
        const prev = context.candles[context.candles.length - 2];
        if (context.candles.length - 2 > orb.endIndex && prev.close > orb.high + tickBuffer) {
          return null;
        }
        direction = 'BUY';
        entryType = 'MARKET';
        entryPrice = context.currentPrice ?? latest.close;
        slPrice = Math.max(orb.low - tickBuffer, Math.min(orb.mid, latest.low - tickBuffer));
      } else if (latest.close < orb.low - tickBuffer && orb.low - latest.close <= maxChase) {
        const prev = context.candles[context.candles.length - 2];
        if (context.candles.length - 2 > orb.endIndex && prev.close < orb.low - tickBuffer) {
          return null;
        }
        direction = 'SELL';
        entryType = 'MARKET';
        entryPrice = context.currentPrice ?? latest.close;
        slPrice = Math.min(orb.high + tickBuffer, Math.max(orb.mid, latest.high + tickBuffer));
      } else {
        return null;
      }
    }

    const risk = Math.abs(entryPrice - slPrice);
    if (!Number.isFinite(risk) || risk <= 0) return null;

    // Exact 1:2 RR at TP1, with extended 1:3 RR runner at TP2
    const tp1Price = direction === 'BUY' ? entryPrice + risk * 2.0 : entryPrice - risk * 2.0;
    const tp2Price = direction === 'BUY' ? entryPrice + risk * 3.0 : entryPrice - risk * 3.0;

    let score = 56;
    const reasons: string[] = [
      `09:30-09:35 ET Opening Range mapped (${orb.low.toFixed(2)} - ${orb.high.toFixed(2)}, ${orb.range.toFixed(2)} pts)`,
      `Opening Range RVOL surge confirmed at ${effectiveRvol.toFixed(2)}x (>= 1.5x threshold)`,
      isOrbCloseBar
        ? `Armed ${direction} STOP breakout order ${direction === 'BUY' ? 'above ORB high' : 'below ORB low'} at 1:2 RR`
        : `Confirmed ${direction} breakout ${direction === 'BUY' ? 'above ORB high' : 'below ORB low'} targeting 1:2 RR`,
    ];

    if (effectiveRvol >= 2.0) {
      score += 14;
      reasons.push('Heavy institutional participation (RVOL >= 2.0x)');
    } else if (effectiveRvol >= 1.75) {
      score += 8;
    }

    if (orb.range >= atr * 0.5 && orb.range <= atr * 2.2) {
      score += 12;
      reasons.push('Balanced 5m ORB width relative to ATR supports clean expansion');
    }

    const bodyRatio = Math.abs(orb.close - orb.open) / orb.range;
    if (bodyRatio >= 0.55) {
      score += 8;
      reasons.push('Strong directional conviction in ORB candle body');
    }

    return buildFuturesSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction,
      rawScore: Math.min(98, score),
      entryType,
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        orbHigh: Number(orb.high.toFixed(2)),
        orbLow: Number(orb.low.toFixed(2)),
        orbRange: Number(orb.range.toFixed(2)),
        orbRvol: Number(orb.orbRvol.toFixed(2)),
        effectiveRvol: Number(effectiveRvol.toFixed(2)),
        atr: Number(atr.toFixed(2)),
        targetRR: 2.0,
      },
      timestampIso: clock.utcDate.toISOString(),
    });
  }
}

export const traxoVelocityOrb = new TraxoVelocityOrbStrategy();
