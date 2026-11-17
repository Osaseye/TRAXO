/**
 * TRAXO Barrier Grid — Institutional Round Numbers (00 / 50) Engine
 *
 * Detects institutional liquidity absorption and sharp rejection wicks at
 * psychological 00 and 50 pip figure levels with tight wick-extreme invalidation.
 */

import { calculateATR, calculateRVOL } from '../indicators';
import type { ITraxoStrategy, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildForexSignal,
  FOREX_ALL_SYMBOLS,
  getForexPipSize,
  isSupportedForexSymbol,
  parseUtcDate,
  roundForexPrice,
} from './forexUtils';

export interface InstitutionalBarrier {
  level: number;
  figureType: '00' | '50';
  distancePips: number;
}

/**
 * Finds the nearest 00 or 50 pip institutional barrier level to a given price.
 */
export function findNearestBarrierLevel(
  price: number,
  pipSize: number,
  symbol: string
): InstitutionalBarrier {
  const step50 = 50 * pipSize;
  const gridIndex = Math.round(price / step50);
  const level = roundForexPrice(gridIndex * step50, symbol);
  const figureType: '00' | '50' = Math.abs(gridIndex) % 2 === 0 ? '00' : '50';
  const distancePips = Number((Math.abs(price - level) / pipSize).toFixed(2));
  return { level, figureType, distancePips };
}

export class TraxoBarrierGridStrategy implements ITraxoStrategy {
  readonly id = 'traxo_barrier_grid';
  readonly name = 'TRAXO Barrier Grid';
  readonly market = 'FOREX' as const;
  readonly supportedSymbols = FOREX_ALL_SYMBOLS;
  readonly optimalTimeframes = ['5m', '15m', '1H'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedForexSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!context.candles || context.candles.length < 15) return null;

    const latest = context.candles[context.candles.length - 1];
    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const range = latest.high - latest.low;
    if (!Number.isFinite(range) || range < atr * 0.3) return null;

    const pipSize = getForexPipSize(context.symbol);
    const body = Math.abs(latest.close - latest.open);
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    const tolerance = Math.max(pipSize * 4, atr * 0.25);

    const lowBarrier = findNearestBarrierLevel(latest.low, pipSize, context.symbol);
    const highBarrier = findNearestBarrierLevel(latest.high, pipSize, context.symbol);

    const lowerWickRatio = lowerWick / range;
    const upperWickRatio = upperWick / range;

    const isBullishRejection =
      (Math.abs(latest.low - lowBarrier.level) <= tolerance ||
        (latest.low <= lowBarrier.level && latest.close > lowBarrier.level)) &&
      latest.close > lowBarrier.level &&
      Math.min(latest.open, latest.close) >= lowBarrier.level - tolerance * 0.5 &&
      lowerWickRatio >= 0.45 &&
      lowerWick >= body * 1.25 &&
      lowerWick > upperWick * 1.5;

    const isBearishRejection =
      (Math.abs(latest.high - highBarrier.level) <= tolerance ||
        (latest.high >= highBarrier.level && latest.close < highBarrier.level)) &&
      latest.close < highBarrier.level &&
      Math.max(latest.open, latest.close) <= highBarrier.level + tolerance * 0.5 &&
      upperWickRatio >= 0.45 &&
      upperWick >= body * 1.25 &&
      upperWick > lowerWick * 1.5;

    if (!isBullishRejection && !isBearishRejection) return null;

    let direction: 'BUY' | 'SELL';
    let barrier: InstitutionalBarrier;
    let wickRatio: number;

    if (isBullishRejection && !isBearishRejection) {
      direction = 'BUY';
      barrier = lowBarrier;
      wickRatio = lowerWickRatio;
    } else if (isBearishRejection && !isBullishRejection) {
      direction = 'SELL';
      barrier = highBarrier;
      wickRatio = upperWickRatio;
    } else if (lowerWickRatio >= upperWickRatio) {
      direction = 'BUY';
      barrier = lowBarrier;
      wickRatio = lowerWickRatio;
    } else {
      direction = 'SELL';
      barrier = highBarrier;
      wickRatio = upperWickRatio;
    }

    const entryPrice = context.currentPrice ?? latest.close;
    const tightBuffer = Math.max(pipSize * 2, atr * 0.12);
    const rvol = calculateRVOL(context.candles, 20);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    if (direction === 'BUY') {
      slPrice = Math.min(latest.low, barrier.level) - tightBuffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      tp1Price = entryPrice + risk * 2.0;
      tp2Price = entryPrice + risk * 3.0;
    } else {
      slPrice = Math.max(latest.high, barrier.level) + tightBuffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      tp1Price = entryPrice - risk * 2.0;
      tp2Price = entryPrice - risk * 3.0;
    }

    let score = 48;
    const reasons: string[] = [
      `Institutional .${barrier.figureType} round-number barrier tested at ${barrier.level}`,
      `${direction === 'BUY' ? 'Lower' : 'Upper'} rejection wick absorbed ${Math.round(wickRatio * 100)}% of candle range`,
      'Tight invalidation placed directly beyond rejection wick extreme',
    ];

    if (barrier.figureType === '00') {
      score += 15;
      reasons.push('Major .00 full-figure institutional liquidity pool');
    } else {
      score += 6;
    }

    if (wickRatio >= 0.6) {
      score += 12;
      reasons.push('High-conviction pinbar wick dominance (>=60% of range)');
    }

    const directionalClose =
      (direction === 'BUY' && latest.close > latest.open) ||
      (direction === 'SELL' && latest.close < latest.open);
    if (directionalClose) {
      score += 8;
      reasons.push('Candle closed in direction of rejection');
    }

    if (rvol >= 1.2) {
      score += 12;
      reasons.push(`Institutional absorption volume confirmed (RVOL ${rvol.toFixed(2)}x)`);
    }

    const parsedTs = parseUtcDate(latest.timestamp) ?? new Date();

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
        barrierLevel: barrier.level,
        figureType: barrier.figureType,
        barrierDistancePips: barrier.distancePips,
        wickRatio: Number(wickRatio.toFixed(2)),
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(5)),
      },
      timestampIso: parsedTs.toISOString(),
    });
  }
}

export const traxoBarrierGrid = new TraxoBarrierGridStrategy();
