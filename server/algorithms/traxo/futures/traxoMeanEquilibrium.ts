/**
 * TRAXO Mean Equilibrium — Midday VWAP Mean Reversion Scalp Engine
 *
 * Active during the NY midday lull (11:30-13:30 ET). Anchors VWAP to the
 * current trading session and monitors price extensions > 2.0 standard
 * deviations from VWAP to trigger a statistical fade back to equilibrium.
 */

import { calculateATR, calculateRVOL, calculateVWAP } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildFuturesSignal,
  FUTURES_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedFuturesSymbol,
  type NyClockSnapshot,
  resolveNyClock,
  toNyClock,
} from './futuresUtils';

const MIDDAY_START_MINUTES = 11 * 60 + 30; // 11:30 ET
const MIDDAY_END_MINUTES = 13 * 60 + 30; // 13:30 ET
const CASH_OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET

export interface SessionVwapSnapshot {
  vwap: number;
  stdDev: number;
  zScore: number;
  sessionBars: number;
}

/**
 * Computes intraday RTH-anchored VWAP & standard deviation for the current NY date.
 */
export function computeSessionVwapZScore(
  candles: TraxoCandle[],
  clock: NyClockSnapshot,
  referencePrice: number
): SessionVwapSnapshot | null {
  const rthCandles = candles.filter((c) => {
    const ny = toNyClock(c.timestamp);
    return ny && ny.nyDateKey === clock.nyDateKey && ny.nyMinutesOfDay >= CASH_OPEN_MINUTES;
  });

  const dayCandles =
    rthCandles.length >= 6
      ? rthCandles
      : candles.filter((c) => {
          const ny = toNyClock(c.timestamp);
          return ny && ny.nyDateKey === clock.nyDateKey;
        });

  const targetSlice = dayCandles.length >= 6 ? dayCandles : candles;
  if (targetSlice.length < 6) return null;

  const { vwap, stdDev } = calculateVWAP(targetSlice);
  const currentVwap = vwap[vwap.length - 1];
  const currentStdDev = stdDev[stdDev.length - 1];

  if (!Number.isFinite(currentVwap) || !Number.isFinite(currentStdDev) || currentStdDev <= 0) {
    return null;
  }

  return {
    vwap: currentVwap,
    stdDev: currentStdDev,
    zScore: (referencePrice - currentVwap) / currentStdDev,
    sessionBars: targetSlice.length,
  };
}

export class TraxoMeanEquilibriumStrategy implements ITraxoStrategy {
  readonly id = 'traxo_mean_equilibrium';
  readonly name = 'TRAXO Mean Equilibrium';
  readonly market = 'FUTURES' as const;
  readonly supportedSymbols = FUTURES_SUPPORTED_SYMBOLS;
  readonly optimalTimeframes = ['1m', '5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedFuturesSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!hasValidCandles(context.candles, 12)) return null;

    const latest = context.candles[context.candles.length - 1];
    const clock = resolveNyClock(context, latest);
    if (!clock) return null;

    // Active strictly during NY midday lull (11:30 - 13:30 ET)
    if (
      clock.nyMinutesOfDay < MIDDAY_START_MINUTES ||
      clock.nyMinutesOfDay >= MIDDAY_END_MINUTES
    ) {
      return null;
    }

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const entryPrice = context.currentPrice ?? latest.close;
    const vwapStats = computeSessionVwapZScore(context.candles, clock, entryPrice);
    if (!vwapStats) return null;

    const absZ = Math.abs(vwapStats.zScore);
    // Core trigger: price extended > 2.0 standard deviations from VWAP
    if (absZ <= 2.0) return null;

    const direction: 'BUY' | 'SELL' = vwapStats.zScore < -2.0 ? 'BUY' : 'SELL';
    const rvol = calculateRVOL(context.candles, 20);
    const stopBuffer = Math.max(2.0, atr * 0.25);

    const barRange = latest.high - latest.low;
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    if (direction === 'BUY') {
      slPrice = Math.min(
        latest.low - stopBuffer,
        entryPrice - Math.max(vwapStats.stdDev * 1.1, atr * 0.85)
      );
      tp1Price = vwapStats.vwap;
      tp2Price = vwapStats.vwap + vwapStats.stdDev * 0.5;
    } else {
      slPrice = Math.max(
        latest.high + stopBuffer,
        entryPrice + Math.max(vwapStats.stdDev * 1.1, atr * 0.85)
      );
      tp1Price = vwapStats.vwap;
      tp2Price = vwapStats.vwap - vwapStats.stdDev * 0.5;
    }

    let score = 52;
    const reasons: string[] = [
      `Midday NY lull window (11:30-13:30 ET) active`,
      `Price extended ${vwapStats.zScore > 0 ? '+' : ''}${vwapStats.zScore.toFixed(2)}σ from session VWAP (${vwapStats.vwap.toFixed(2)})`,
      `Statistical mean reversion fade triggered targeting VWAP equilibrium`,
    ];

    if (absZ >= 2.5) {
      score += 16;
      reasons.push(`Extreme > 2.5σ stretch increases snapback probability`);
    } else if (absZ >= 2.2) {
      score += 10;
    }

    const hasExhaustionWick =
      barRange > 0 &&
      ((direction === 'BUY' && lowerWick / barRange >= 0.35) ||
        (direction === 'SELL' && upperWick / barRange >= 0.35));
    if (hasExhaustionWick) {
      score += 12;
      reasons.push('Exhaustion rejection wick confirms midday overextension');
    }

    if (rvol <= 1.35) {
      score += 10;
      reasons.push(`Low-volume midday lull conditions (RVOL ${rvol.toFixed(2)}x) favor reversion`);
    }

    if (
      (direction === 'BUY' && latest.close >= latest.open) ||
      (direction === 'SELL' && latest.close <= latest.open)
    ) {
      score += 6;
      reasons.push('Trigger bar already rotating back toward VWAP');
    }

    return buildFuturesSignal({
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
        vwap: Number(vwapStats.vwap.toFixed(2)),
        stdDev: Number(vwapStats.stdDev.toFixed(2)),
        zScore: Number(vwapStats.zScore.toFixed(2)),
        sessionBars: vwapStats.sessionBars,
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(2)),
      },
      timestampIso: clock.utcDate.toISOString(),
    });
  }
}

export const traxoMeanEquilibrium = new TraxoMeanEquilibriumStrategy();
