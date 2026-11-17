/**
 * TRAXO Aurum Sweep — Gold (XAU/USD) Asian Range Sweep & London Expansion Engine
 *
 * Measures the Asian session liquidity range (00:00-06:30 UTC), detects an
 * institutional liquidity grab beyond the Asian High or Low, and enters on
 * M15 displacement back inside the Asian range targeting 1:2.5+ R:R toward
 * opposing Asian liquidity.
 */

import { calculateATR, calculateRVOL } from '../indicators';
import type {
  ITraxoStrategy,
  TraxoCandle,
  TraxoSignalDirection,
  TraxoSignalResult,
  TraxoStrategyContext,
} from '../types';
import {
  buildGoldSignal,
  getUtcDateKey,
  getUtcMinutesOfDay,
  GOLD_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedGoldSymbol,
  parseUtcDate,
  resolveUtcClock,
} from './goldUtils';

const ASIAN_START_MIN = 0;         // 00:00 UTC
const ASIAN_END_MIN = 6 * 60 + 30; // 06:30 UTC
const LONDON_END_MIN = 13 * 60;    // 13:00 UTC
const MIN_RISK_REWARD = 2.5;

export interface AurumAsianRange {
  high: number;
  low: number;
  mid: number;
  range: number;
  candleCount: number;
}

/**
 * Extracts the Gold Asian session range (00:00-06:30 UTC) for the given UTC date.
 */
export function extractAurumAsianRange(
  candles: TraxoCandle[],
  targetDateKey: string
): AurumAsianRange | null {
  const asianCandles = candles.filter((c) => {
    const d = parseUtcDate(c.timestamp);
    if (!d) return false;
    if (getUtcDateKey(d) !== targetDateKey) return false;
    const mins = getUtcMinutesOfDay(d);
    return mins >= ASIAN_START_MIN && mins < ASIAN_END_MIN;
  });

  if (asianCandles.length < 4) return null;

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

function isDisplacementCandle(
  candle: TraxoCandle,
  direction: TraxoSignalDirection,
  atr: number
): { valid: boolean; strong: boolean; bodyRatio: number; bodyAtrRatio: number } {
  const barRange = candle.high - candle.low;
  if (barRange <= 0) {
    return { valid: false, strong: false, bodyRatio: 0, bodyAtrRatio: 0 };
  }

  const body = Math.abs(candle.close - candle.open);
  const bodyRatio = body / barRange;
  const bodyAtrRatio = atr > 0 ? body / atr : 0;

  if (direction === 'BUY') {
    const closePos = (candle.close - candle.low) / barRange;
    const valid =
      candle.close > candle.open &&
      bodyAtrRatio >= 0.5 &&
      bodyRatio >= 0.5 &&
      closePos >= 0.6;
    const strong = valid && bodyAtrRatio >= 1.0 && bodyRatio >= 0.65;
    return { valid, strong, bodyRatio, bodyAtrRatio };
  }

  const closePosFromTop = (candle.high - candle.close) / barRange;
  const valid =
    candle.close < candle.open &&
    bodyAtrRatio >= 0.5 &&
    bodyRatio >= 0.5 &&
    closePosFromTop >= 0.6;
  const strong = valid && bodyAtrRatio >= 1.0 && bodyRatio >= 0.65;
  return { valid, strong, bodyRatio, bodyAtrRatio };
}

export class TraxoAurumSweepStrategy implements ITraxoStrategy {
  readonly id = 'traxo_aurum_sweep';
  readonly name = 'TRAXO Aurum Sweep';
  readonly market = 'METALS' as const;
  readonly supportedSymbols = [...GOLD_SUPPORTED_SYMBOLS];
  readonly optimalTimeframes = ['15m', 'M15', '5m', 'M5', '30m', 'M30'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedGoldSymbol(context.symbol)) return null;
    if (!hasValidCandles(context.candles, 15)) return null;

    const candles = context.candles;
    const current = candles[candles.length - 1];
    const clock = resolveUtcClock(context, current);
    if (!clock) return null;

    // Evaluate only after Asian range completes (06:30 UTC) through London expansion
    if (clock.utcMinutesOfDay < ASIAN_END_MIN || clock.utcMinutesOfDay >= LONDON_END_MIN) {
      return null;
    }

    const asian = extractAurumAsianRange(candles, clock.dateKey);
    if (!asian) return null;

    const atrSeries = calculateATR(candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;
    if (asian.range < atr * 0.25) return null;

    // Post-Asian candles on the same UTC day up to current
    const postAsianCandles = candles.filter((c) => {
      const d = parseUtcDate(c.timestamp);
      if (!d) return false;
      if (getUtcDateKey(d) !== clock.dateKey) return false;
      const mins = getUtcMinutesOfDay(d);
      return mins >= ASIAN_END_MIN && mins <= clock.utcMinutesOfDay;
    });
    if (postAsianCandles.length === 0) return null;

    const sweepWindow = postAsianCandles.slice(-6);
    const maxSweepDepth = Math.max(atr * 2.5, asian.range * 0.85);
    const entryPrice = context.currentPrice ?? current.close;
    const slBuffer = Math.max(atr * 0.35, 0.5);
    const rvol = calculateRVOL(candles, 20);

    // Check Bullish Sweep (Asian Low swept, displacement closes back inside range)
    const sweptLowCandles = sweepWindow.filter((c) => c.low < asian.low);
    const bullDisplacement = isDisplacementCandle(current, 'BUY', atr);
    if (
      sweptLowCandles.length > 0 &&
      bullDisplacement.valid &&
      entryPrice > asian.low &&
      entryPrice < asian.high
    ) {
      const sweepLow = Math.min(...sweptLowCandles.map((c) => c.low));
      const sweepDepth = asian.low - sweepLow;
      if (sweepDepth > 0 && sweepDepth <= maxSweepDepth) {
        const slPrice = sweepLow - slBuffer;
        const risk = entryPrice - slPrice;
        const rrToOpposite = risk > 0 ? (asian.high - entryPrice) / risk : 0;

        if (rrToOpposite >= MIN_RISK_REWARD) {
          const tp1Price = asian.high;
          const tp2Price = Math.max(asian.high + asian.range * 0.5, entryPrice + risk * 3.5);
          return this.composeResult(
            context,
            'BUY',
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            rrToOpposite,
            sweepDepth,
            asian,
            atr,
            rvol,
            bullDisplacement,
            clock
          );
        }
      }
    }

    // Check Bearish Sweep (Asian High swept, displacement closes back inside range)
    const sweptHighCandles = sweepWindow.filter((c) => c.high > asian.high);
    const bearDisplacement = isDisplacementCandle(current, 'SELL', atr);
    if (
      sweptHighCandles.length > 0 &&
      bearDisplacement.valid &&
      entryPrice < asian.high &&
      entryPrice > asian.low
    ) {
      const sweepHigh = Math.max(...sweptHighCandles.map((c) => c.high));
      const sweepDepth = sweepHigh - asian.high;
      if (sweepDepth > 0 && sweepDepth <= maxSweepDepth) {
        const slPrice = sweepHigh + slBuffer;
        const risk = slPrice - entryPrice;
        const rrToOpposite = risk > 0 ? (entryPrice - asian.low) / risk : 0;

        if (rrToOpposite >= MIN_RISK_REWARD) {
          const tp1Price = asian.low;
          const tp2Price = Math.min(asian.low - asian.range * 0.5, entryPrice - risk * 3.5);
          return this.composeResult(
            context,
            'SELL',
            entryPrice,
            slPrice,
            tp1Price,
            tp2Price,
            rrToOpposite,
            sweepDepth,
            asian,
            atr,
            rvol,
            bearDisplacement,
            clock
          );
        }
      }
    }

    return null;
  }

  private composeResult(
    context: TraxoStrategyContext,
    direction: TraxoSignalDirection,
    entryPrice: number,
    slPrice: number,
    tp1Price: number,
    tp2Price: number,
    rrToOpposite: number,
    sweepDepth: number,
    asian: AurumAsianRange,
    atr: number,
    rvol: number,
    displacement: { strong: boolean; bodyRatio: number; bodyAtrRatio: number },
    clock: NonNullable<ReturnType<typeof resolveUtcClock>>
  ): TraxoSignalResult | null {
    let score = 65;
    const reasons: string[] = [
      direction === 'BUY'
        ? `Asian Low ($${asian.low.toFixed(2)}) swept by $${sweepDepth.toFixed(2)} with M15 bullish displacement back inside range`
        : `Asian High ($${asian.high.toFixed(2)}) swept by $${sweepDepth.toFixed(2)} with M15 bearish displacement back inside range`,
      `Opposing Asian liquidity targets 1:${rrToOpposite.toFixed(2)} R:R`,
    ];

    if (displacement.strong) {
      score += 12;
      reasons.push(
        `Strong M15 displacement (${displacement.bodyAtrRatio.toFixed(2)}x ATR, ${Math.round(displacement.bodyRatio * 100)}% body dominance)`
      );
    }
    if (rvol >= 1.3) {
      score += 10;
      reasons.push(`Elevated sweep participation (RVOL ${rvol.toFixed(2)}x)`);
    }
    if (rrToOpposite >= 3.0) {
      score += 8;
      reasons.push(`Asymmetric expansion payoff (1:${rrToOpposite.toFixed(2)} R:R to opposite range boundary)`);
    }
    if (clock.utcHour >= 7 && clock.utcHour < 10) {
      score += 5;
      reasons.push('Aligned with London Open killzone (07:00-10:00 UTC)');
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
        asianHigh: Number(asian.high.toFixed(2)),
        asianLow: Number(asian.low.toFixed(2)),
        asianRange: Number(asian.range.toFixed(2)),
        sweepDepth: Number(sweepDepth.toFixed(2)),
        rrToOpposite: Number(rrToOpposite.toFixed(2)),
        bodyAtrRatio: Number(displacement.bodyAtrRatio.toFixed(2)),
        rvol: Number(rvol.toFixed(2)),
        atr14: Number(atr.toFixed(2)),
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoAurumSweep = new TraxoAurumSweepStrategy();
