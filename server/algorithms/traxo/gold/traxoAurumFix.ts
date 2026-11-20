/**
 * TRAXO Aurum Fix — LBMA London PM Benchmark Fix (15:00 UTC) Snapback Engine
 *
 * Captures institutional gold rebalancing exhaustion around the 15:00 UTC LBMA PM
 * Fix (active window: 14:30-15:30 UTC). Computes intraday UTC-day session VWAP
 * and standard deviation bands; when Spot Gold stretches >= 2.0σ from session
 * VWAP into the auction and prints reversal confirmation back toward mean,
 * triggers an asymmetric fade with Gold's mandatory 1.35x ATR stop-loss buffer.
 */

import { calculateATR, calculateRVOL, calculateVWAP } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildGoldSignal,
  GOLD_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedGoldSymbol,
  resolveUtcClock,
} from './goldUtils';

const AURUM_FIX_START_MIN = 14 * 60 + 30; // 14:30 UTC
const AURUM_FIX_END_MIN = 15 * 60 + 30;   // 15:30 UTC
export const AURUM_FIX_MIN_SL_ATR_BUFFER = 1.35;

export class TraxoAurumFixStrategy implements ITraxoStrategy {
  readonly id = 'traxo_aurum_fix';
  readonly name = 'TRAXO Aurum Fix';
  readonly market = 'METALS' as const;
  readonly supportedSymbols = [...GOLD_SUPPORTED_SYMBOLS];
  readonly optimalTimeframes = ['5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedGoldSymbol(context.symbol)) return null;
    if (!hasValidCandles(context.candles, 20)) return null;

    const candles = context.candles;
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const clock = resolveUtcClock(context, latest);
    if (!clock) return null;

    // Active LBMA PM Fix window: 14:30-15:30 UTC
    if (
      clock.utcMinutesOfDay < AURUM_FIX_START_MIN ||
      clock.utcMinutesOfDay >= AURUM_FIX_END_MIN
    ) {
      return null;
    }

    const atrSeries = calculateATR(candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    // Intraday UTC session candles (fall back to last 30 candles if < 10 intraday bars)
    const intradayCandles = candles.filter((c) => {
      const ts = resolveUtcClock(context, c);
      return ts !== null && ts.dateKey === clock.dateKey;
    });
    const sessionSeries: TraxoCandle[] =
      intradayCandles.length >= 10 ? intradayCandles : candles.slice(-30);

    const { vwap, stdDev } = calculateVWAP(sessionSeries);
    const sIdx = sessionSeries.length - 1;
    const sessionVwap = vwap[sIdx];
    const sessionStd = stdDev[sIdx];
    if (!Number.isFinite(sessionVwap) || !Number.isFinite(sessionStd) || sessionStd <= 0) {
      return null;
    }

    const prevVwap = vwap[Math.max(0, sIdx - 1)] ?? sessionVwap;
    const prevStd = stdDev[Math.max(0, sIdx - 1)] > 0 ? stdDev[Math.max(0, sIdx - 1)] : sessionStd;

    const entryPrice = context.currentPrice ?? latest.close;
    const sweepLow = Math.min(prev.low, latest.low);
    const sweepHigh = Math.max(prev.high, latest.high);

    const prevCloseZ = (prev.close - prevVwap) / prevStd;
    const prevLowZ = (prev.low - prevVwap) / prevStd;
    const prevHighZ = (prev.high - prevVwap) / prevStd;
    const currLowZ = (latest.low - sessionVwap) / sessionStd;
    const currHighZ = (latest.high - sessionVwap) / sessionStd;
    const entryZ = (entryPrice - sessionVwap) / sessionStd;

    const minBullZ = Math.min(prevCloseZ, prevLowZ, currLowZ, entryZ);
    const maxBearZ = Math.max(prevCloseZ, prevHighZ, currHighZ, entryZ);

    const barRange = latest.high - latest.low;
    if (barRange <= 0) return null;
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const closePos = (latest.close - latest.low) / barRange;

    const bullReversalConfirmed =
      latest.close > latest.open || (lowerWick / barRange >= 0.4 && closePos >= 0.55);
    const bearReversalConfirmed =
      latest.close < latest.open || (upperWick / barRange >= 0.4 && closePos <= 0.45);

    const isBuy = minBullZ <= -2.0 && entryPrice < sessionVwap && bullReversalConfirmed;
    const isSell = maxBearZ >= 2.0 && entryPrice > sessionVwap && bearReversalConfirmed;

    if (!isBuy && !isSell) return null;

    const direction: 'BUY' | 'SELL' =
      isBuy && isSell
        ? Math.abs(minBullZ) >= Math.abs(maxBearZ)
          ? 'BUY'
          : 'SELL'
        : isBuy
          ? 'BUY'
          : 'SELL';

    const slBuffer = Math.ceil(AURUM_FIX_MIN_SL_ATR_BUFFER * atr * 100) / 100;

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;
    let extremeZ: number;

    if (direction === 'BUY') {
      slPrice = sweepLow - slBuffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      const minTp1 = entryPrice + risk * 1.6;
      tp1Price = sessionVwap >= entryPrice + risk * 1.5 ? sessionVwap : minTp1;
      tp2Price = Math.max(tp1Price + risk * 0.8, entryPrice + risk * 2.4);
      extremeZ = minBullZ;
    } else {
      slPrice = sweepHigh + slBuffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      const minTp1 = entryPrice - risk * 1.6;
      tp1Price = sessionVwap <= entryPrice - risk * 1.5 ? sessionVwap : minTp1;
      tp2Price = Math.min(tp1Price - risk * 0.8, entryPrice - risk * 2.4);
      extremeZ = maxBearZ;
    }

    const rvol = calculateRVOL(candles, 20);
    const absZ = Math.abs(extremeZ);
    const rejectionRatio = direction === 'BUY' ? lowerWick / barRange : upperWick / barRange;

    let score = 60;
    const reasons: string[] = [
      `LBMA PM Fix window (14:30-15:30 UTC) stretched ${extremeZ > 0 ? '+' : ''}${extremeZ.toFixed(2)}σ from session VWAP ($${sessionVwap.toFixed(2)})`,
      `Reversal snapback confirmed with mandatory ${AURUM_FIX_MIN_SL_ATR_BUFFER}x ATR ($${slBuffer.toFixed(2)}) Gold buffer`,
    ];

    if (absZ >= 2.5) {
      score += 14;
      reasons.push(`Extreme >= 2.5σ PM Fix exhaustion outlier (${absZ.toFixed(2)}σ)`);
    } else if (absZ >= 2.2) {
      score += 8;
    }

    if (rejectionRatio >= 0.35) {
      score += 10;
      reasons.push(`Rejection wick (${Math.round(rejectionRatio * 100)}% of range) absorbing fix auction flow`);
    }

    if (rvol >= 1.25) {
      score += 8;
      reasons.push(`PM Fix liquidity surge (RVOL ${rvol.toFixed(2)}x)`);
    }

    if (clock.utcHour === 15 && clock.utcMinute <= 20) {
      score += 6;
      reasons.push('Aligned with immediate post-15:00 UTC LBMA benchmark release');
    }

    return buildGoldSignal({
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
        sessionVwap: Number(sessionVwap.toFixed(2)),
        sessionStdDev: Number(sessionStd.toFixed(2)),
        zScore: Number(extremeZ.toFixed(2)),
        slBufferApplied: slBuffer,
        atr14: Number(atr.toFixed(2)),
        rvol: Number(rvol.toFixed(2)),
        utcHour: clock.utcHour,
        utcMinute: clock.utcMinute,
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoAurumFix = new TraxoAurumFixStrategy();
