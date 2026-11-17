/**
 * TRAXO Bullion Strike — Gold (XAU/USD) Institutional Psychological Strike Pinbar Engine
 *
 * Detects high-conviction pinbar rejections at $10 ($2650, $2660) and $50
 * ($2650, $2700) institutional psychological strikes, enforcing Gold's mandatory
 * minimum 1.35x ATR(14) buffer on stop-losses.
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

export const GOLD_MIN_SL_ATR_BUFFER = 1.35;

export interface InstitutionalStrikeLevel {
  price: number;
  increment: 10 | 50;
  isMajor50: boolean;
}

/**
 * Returns all $10 and $50 institutional psychological levels within [minPrice, maxPrice].
 */
export function findInstitutionalStrikes(
  minPrice: number,
  maxPrice: number
): InstitutionalStrikeLevel[] {
  const low = Math.min(minPrice, maxPrice);
  const high = Math.max(minPrice, maxPrice);
  const start = Math.ceil(low / 10) * 10;
  const end = Math.floor(high / 10) * 10;
  const levels: InstitutionalStrikeLevel[] = [];

  for (let level = start; level <= end; level += 10) {
    const isMajor50 = level % 50 === 0;
    levels.push({
      price: level,
      increment: isMajor50 ? 50 : 10,
      isMajor50,
    });
  }
  return levels;
}

interface PinbarAnalysis {
  direction: TraxoSignalDirection;
  wickLength: number;
  wickRatio: number;
  body: number;
  barRange: number;
  extremeClosePos: number;
}

function analyzePinbar(candle: TraxoCandle, atr: number): PinbarAnalysis | null {
  const barRange = candle.high - candle.low;
  if (!Number.isFinite(barRange) || barRange <= 0) return null;
  if (barRange < atr * 0.5) return null;

  const body = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);

  // Bullish pinbar: long lower rejection wick, small upper wick, close in upper 40%
  const bullClosePos = (candle.close - candle.low) / barRange;
  const isBullPinbar =
    lowerWick >= barRange * 0.55 &&
    lowerWick >= Math.max(body * 2.0, atr * 0.45) &&
    upperWick <= barRange * 0.25 &&
    bullClosePos >= 0.6;

  // Bearish pinbar: long upper rejection wick, small lower wick, close in lower 40%
  const bearClosePos = (candle.high - candle.close) / barRange;
  const isBearPinbar =
    upperWick >= barRange * 0.55 &&
    upperWick >= Math.max(body * 2.0, atr * 0.45) &&
    lowerWick <= barRange * 0.25 &&
    bearClosePos >= 0.6;

  if (isBullPinbar && (!isBearPinbar || lowerWick >= upperWick)) {
    return {
      direction: 'BUY',
      wickLength: lowerWick,
      wickRatio: lowerWick / barRange,
      body,
      barRange,
      extremeClosePos: bullClosePos,
    };
  }

  if (isBearPinbar) {
    return {
      direction: 'SELL',
      wickLength: upperWick,
      wickRatio: upperWick / barRange,
      body,
      barRange,
      extremeClosePos: bearClosePos,
    };
  }

  return null;
}

function selectRejectedStrike(
  candle: TraxoCandle,
  direction: TraxoSignalDirection,
  tolerance: number
): InstitutionalStrikeLevel | null {
  if (direction === 'BUY') {
    const bodyLow = Math.min(candle.open, candle.close);
    const candidates = findInstitutionalStrikes(
      candle.low - tolerance,
      bodyLow + tolerance
    ).filter((s) => candle.low <= s.price + tolerance && candle.close > s.price);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (a.isMajor50 !== b.isMajor50) return a.isMajor50 ? -1 : 1;
      return Math.abs(candle.low - a.price) - Math.abs(candle.low - b.price);
    });
    return candidates[0];
  }

  const bodyHigh = Math.max(candle.open, candle.close);
  const candidates = findInstitutionalStrikes(
    bodyHigh - tolerance,
    candle.high + tolerance
  ).filter((s) => candle.high >= s.price - tolerance && candle.close < s.price);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.isMajor50 !== b.isMajor50) return a.isMajor50 ? -1 : 1;
    return Math.abs(candle.high - a.price) - Math.abs(candle.high - b.price);
  });
  return candidates[0];
}

export class TraxoBullionStrikeStrategy implements ITraxoStrategy {
  readonly id = 'traxo_bullion_strike';
  readonly name = 'TRAXO Bullion Strike';
  readonly market = 'METALS' as const;
  readonly supportedSymbols = [...GOLD_SUPPORTED_SYMBOLS];
  readonly optimalTimeframes = ['15m', 'M15', '1H', 'H1', '4H', 'H4'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedGoldSymbol(context.symbol)) return null;
    if (!hasValidCandles(context.candles, 15)) return null;

    const candles = context.candles;
    const current = candles[candles.length - 1];
    const clock = resolveUtcClock(context, current);
    if (!clock) return null;

    const atrSeries = calculateATR(candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const pinbar = analyzePinbar(current, atr);
    if (!pinbar) return null;

    const strikeTolerance = Math.min(atr * 0.35, 2.0);
    const strike = selectRejectedStrike(current, pinbar.direction, strikeTolerance);
    if (!strike) return null;

    // Gold mandatory minimum 1.35x ATR stop-loss buffer (ceiled to 2 decimals so >= 1.35x strictly holds)
    const slBuffer = Math.ceil(GOLD_MIN_SL_ATR_BUFFER * atr * 100) / 100;
    const entryPrice = context.currentPrice ?? current.close;

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    const { swingHighs, swingLows } = findSwingPoints(candles.slice(0, -1), 3, 3);

    if (pinbar.direction === 'BUY') {
      if (entryPrice <= strike.price) return null;
      slPrice = current.low - slBuffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;

      const structuralHighs = swingHighs
        .map((s) => s.price)
        .filter((p) => p >= entryPrice + risk * 2.0)
        .sort((a, b) => a - b);

      tp1Price = structuralHighs[0] ?? entryPrice + risk * 2.0;
      tp2Price = Math.max(structuralHighs[1] ?? entryPrice + risk * 3.0, tp1Price + risk * 0.75);
    } else {
      if (entryPrice >= strike.price) return null;
      slPrice = current.high + slBuffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;

      const structuralLows = swingLows
        .map((s) => s.price)
        .filter((p) => p <= entryPrice - risk * 2.0)
        .sort((a, b) => b - a);

      tp1Price = structuralLows[0] ?? entryPrice - risk * 2.0;
      tp2Price = Math.min(structuralLows[1] ?? entryPrice - risk * 3.0, tp1Price - risk * 0.75);
    }

    const rvol = calculateRVOL(candles, 20);
    let score = 62;
    const reasons: string[] = [
      `${pinbar.direction === 'BUY' ? 'Bullish' : 'Bearish'} pinbar rejection at $${strike.price} (${strike.isMajor50 ? '$50 major' : '$10'} institutional strike)`,
      `Stop-loss buffered with mandatory ${GOLD_MIN_SL_ATR_BUFFER}x ATR ($${slBuffer.toFixed(2)}) protection`,
    ];

    if (strike.isMajor50) {
      score += 14;
      reasons.push(`Confluence with major $50 psychological strike ($${strike.price})`);
    } else {
      score += 6;
    }

    if (pinbar.wickRatio >= 0.68) {
      score += 10;
      reasons.push(`Dominant rejection wick (${Math.round(pinbar.wickRatio * 100)}% of candle range)`);
    }

    if (rvol >= 1.25) {
      score += 8;
      reasons.push(`Elevated strike defense volume (RVOL ${rvol.toFixed(2)}x)`);
    }

    if ((clock.utcHour >= 7 && clock.utcHour < 11) || (clock.utcHour >= 13 && clock.utcHour < 17)) {
      score += 6;
      reasons.push('Occurred during active London/NY institutional liquidity session');
    }

    return buildGoldSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction: pinbar.direction,
      rawScore: Math.min(98, score),
      entryType: 'MARKET',
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        strikePrice: strike.price,
        strikeIncrement: strike.increment,
        isMajor50Strike: strike.isMajor50,
        wickRatio: Number(pinbar.wickRatio.toFixed(2)),
        atr14: Number(atr.toFixed(2)),
        atrBufferMultiplier: GOLD_MIN_SL_ATR_BUFFER,
        slBufferAmount: Number(slBuffer.toFixed(2)),
        rvol: Number(rvol.toFixed(2)),
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoBullionStrike = new TraxoBullionStrikeStrategy();
