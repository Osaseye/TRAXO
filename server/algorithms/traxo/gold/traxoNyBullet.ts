/**
 * TRAXO NY Bullet — Gold (XAU/USD) 10:00 AM EST (15:00 UTC) COMEX/LBMA PM Fix
 * Silver Bullet Expansion Engine
 *
 * Operates exclusively during the 10:00-11:00 EST (15:00-16:00 UTC) Silver Bullet
 * window, detecting an M15 liquidity sweep followed by a displacement-driven
 * Fair Value Gap (FVG) retest.
 */

import { calculateATR, calculateRVOL, findSwingPoints } from '../indicators';
import type {
  ITraxoStrategy,
  TraxoCandle,
  TraxoSignalDirection,
  TraxoSignalResult,
  TraxoStrategyContext,
} from '../types';
import {
  buildGoldSignal,
  GOLD_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedGoldSymbol,
  resolveUtcClock,
} from './goldUtils';

const NY_BULLET_START_MIN = 15 * 60; // 15:00 UTC = 10:00 AM EST
const NY_BULLET_END_MIN = 16 * 60;   // 16:00 UTC = 11:00 AM EST
const MIN_FVG_ATR = 0.1;

export interface DetectedSilverBulletFvg {
  direction: TraxoSignalDirection;
  fvgLow: number;
  fvgHigh: number;
  fvgSize: number;
  displacementIndex: number;
  sweptLevel: number;
  sweepExtreme: number;
}

function findPriorLiquidityPool(
  candles: TraxoCandle[],
  beforeIndex: number,
  direction: TraxoSignalDirection
): number | null {
  if (beforeIndex < 4) return null;
  const slice = candles.slice(Math.max(0, beforeIndex - 25), beforeIndex);
  const { swingHighs, swingLows } = findSwingPoints(slice, 2, 2);

  if (direction === 'BUY') {
    if (swingLows.length > 0) {
      return swingLows[swingLows.length - 1].price;
    }
    return Math.min(...slice.slice(0, -1).map((c) => c.low));
  }

  if (swingHighs.length > 0) {
    return swingHighs[swingHighs.length - 1].price;
  }
  return Math.max(...slice.slice(0, -1).map((c) => c.high));
}

function detectRetestedSilverBulletFvg(
  candles: TraxoCandle[],
  atr: number
): DetectedSilverBulletFvg | null {
  const n = candles.length - 1;
  const current = candles[n];
  const currentRange = current.high - current.low;
  const earliestCenter = Math.max(4, n - 10);

  for (let i = n - 2; i >= earliestCenter; i--) {
    const prev = candles[i - 1];
    const disp = candles[i];
    const next = candles[i + 1];

    // Check Bullish FVG + prior SSL Sweep
    const bullGap = next.low - prev.high;
    if (disp.close > disp.open && bullGap >= atr * MIN_FVG_ATR) {
      const fvgLow = prev.high;
      const fvgHigh = next.low;
      const sweepWindowStart = Math.max(1, i - 3);
      const priorLow = findPriorLiquidityPool(candles, sweepWindowStart, 'BUY');

      if (priorLow !== null) {
        const sweepCandidates = candles.slice(sweepWindowStart, i + 1);
        const sweepExtreme = Math.min(...sweepCandidates.map((c) => c.low));

        if (sweepExtreme < priorLow) {
          let invalidated = false;
          for (let k = i + 2; k < n; k++) {
            if (candles[k].close < fvgLow - atr * 0.15) {
              invalidated = true;
              break;
            }
          }

          const touchesFvg = current.low <= fvgHigh && current.high >= fvgLow;
          const holdsFvg = current.close >= fvgLow - atr * 0.1;
          const bullReaction =
            current.close >= current.open ||
            (currentRange > 0 && (current.close - current.low) / currentRange >= 0.5);

          if (!invalidated && touchesFvg && holdsFvg && bullReaction) {
            return {
              direction: 'BUY',
              fvgLow,
              fvgHigh,
              fvgSize: bullGap,
              displacementIndex: i,
              sweptLevel: priorLow,
              sweepExtreme,
            };
          }
        }
      }
    }

    // Check Bearish FVG + prior BSL Sweep
    const bearGap = prev.low - next.high;
    if (disp.close < disp.open && bearGap >= atr * MIN_FVG_ATR) {
      const fvgLow = next.high;
      const fvgHigh = prev.low;
      const sweepWindowStart = Math.max(1, i - 3);
      const priorHigh = findPriorLiquidityPool(candles, sweepWindowStart, 'SELL');

      if (priorHigh !== null) {
        const sweepCandidates = candles.slice(sweepWindowStart, i + 1);
        const sweepExtreme = Math.max(...sweepCandidates.map((c) => c.high));

        if (sweepExtreme > priorHigh) {
          let invalidated = false;
          for (let k = i + 2; k < n; k++) {
            if (candles[k].close > fvgHigh + atr * 0.15) {
              invalidated = true;
              break;
            }
          }

          const touchesFvg = current.high >= fvgLow && current.low <= fvgHigh;
          const holdsFvg = current.close <= fvgHigh + atr * 0.1;
          const bearReaction =
            current.close <= current.open ||
            (currentRange > 0 && (current.high - current.close) / currentRange >= 0.5);

          if (!invalidated && touchesFvg && holdsFvg && bearReaction) {
            return {
              direction: 'SELL',
              fvgLow,
              fvgHigh,
              fvgSize: bearGap,
              displacementIndex: i,
              sweptLevel: priorHigh,
              sweepExtreme,
            };
          }
        }
      }
    }
  }

  return null;
}

export class TraxoNyBulletStrategy implements ITraxoStrategy {
  readonly id = 'traxo_ny_bullet';
  readonly name = 'TRAXO NY Bullet';
  readonly market = 'METALS' as const;
  readonly supportedSymbols = [...GOLD_SUPPORTED_SYMBOLS];
  readonly optimalTimeframes = ['15m', 'M15', '5m', 'M5'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedGoldSymbol(context.symbol)) return null;
    if (!hasValidCandles(context.candles, 20)) return null;

    const candles = context.candles;
    const current = candles[candles.length - 1];
    const clock = resolveUtcClock(context, current);
    if (!clock) return null;

    // 10:00-11:00 EST (15:00-16:00 UTC) COMEX/LBMA PM Fix Silver Bullet window
    if (
      clock.utcMinutesOfDay < NY_BULLET_START_MIN ||
      clock.utcMinutesOfDay >= NY_BULLET_END_MIN
    ) {
      return null;
    }

    const atrSeries = calculateATR(candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const setup = detectRetestedSilverBulletFvg(candles, atr);
    if (!setup) return null;

    const entryPrice = context.currentPrice ?? current.close;
    const slBuffer = Math.max(atr * 0.35, 0.5);
    const { swingHighs, swingLows } = findSwingPoints(candles.slice(0, -1), 2, 2);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    if (setup.direction === 'BUY') {
      slPrice = Math.min(setup.sweepExtreme, setup.fvgLow) - slBuffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;

      const targets = swingHighs
        .map((s) => s.price)
        .filter((p) => p >= entryPrice + risk * 2.0)
        .sort((a, b) => a - b);

      tp1Price = targets[0] ?? entryPrice + risk * 2.0;
      tp2Price = Math.max(targets[1] ?? entryPrice + risk * 3.0, tp1Price + risk * 0.8);
    } else {
      slPrice = Math.max(setup.sweepExtreme, setup.fvgHigh) + slBuffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;

      const targets = swingLows
        .map((s) => s.price)
        .filter((p) => p <= entryPrice - risk * 2.0)
        .sort((a, b) => b - a);

      tp1Price = targets[0] ?? entryPrice - risk * 2.0;
      tp2Price = Math.min(targets[1] ?? entryPrice - risk * 3.0, tp1Price - risk * 0.8);
    }

    const rvol = calculateRVOL(candles, 20);
    const fvgAtrRatio = setup.fvgSize / atr;
    let score = 66;
    const reasons: string[] = [
      `10:00-11:00 EST COMEX/LBMA PM Fix window: ${setup.direction === 'BUY' ? 'SSL' : 'BSL'} swept at $${setup.sweptLevel.toFixed(2)}`,
      `M15 FVG ($${setup.fvgLow.toFixed(2)}-$${setup.fvgHigh.toFixed(2)}, ${fvgAtrRatio.toFixed(2)}x ATR) actively retested`,
    ];

    if (fvgAtrRatio >= 0.5) {
      score += 10;
      reasons.push(`Institutional imbalance FVG (${fvgAtrRatio.toFixed(2)}x ATR)`);
    }
    if (rvol >= 1.25) {
      score += 8;
      reasons.push(`Elevated Silver Bullet volume (RVOL ${rvol.toFixed(2)}x)`);
    }
    if (clock.utcMinute < 30) {
      score += 6;
      reasons.push('Aligned with 15:00-15:30 UTC PM Fix expansion impulse');
    }
    if (
      (setup.direction === 'BUY' && current.close > current.open) ||
      (setup.direction === 'SELL' && current.close < current.open)
    ) {
      score += 6;
      reasons.push('Directional rejection close confirms FVG support/resistance');
    }

    return buildGoldSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction: setup.direction,
      rawScore: Math.min(98, score),
      entryType: 'MARKET',
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        fvgLow: Number(setup.fvgLow.toFixed(2)),
        fvgHigh: Number(setup.fvgHigh.toFixed(2)),
        fvgSize: Number(setup.fvgSize.toFixed(2)),
        fvgAtrRatio: Number(fvgAtrRatio.toFixed(2)),
        sweptLevel: Number(setup.sweptLevel.toFixed(2)),
        sweepExtreme: Number(setup.sweepExtreme.toFixed(2)),
        rvol: Number(rvol.toFixed(2)),
        atr14: Number(atr.toFixed(2)),
        utcHour: clock.utcHour,
        utcMinute: clock.utcMinute,
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoNyBullet = new TraxoNyBulletStrategy();
