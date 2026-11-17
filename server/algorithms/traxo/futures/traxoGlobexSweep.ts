/**
 * TRAXO Globex Sweep — Overnight High/Low (ONH/ONL) Cash Open Sweep Engine
 *
 * Maps the Globex overnight range (18:00 ET prior day to 09:29 ET current day).
 * Within the first 15 minutes of the NY Cash Open (09:30-09:45 ET / 14:30-14:45 UTC
 * in EST), monitors price sweeping ONH or ONL and rejecting back inside the
 * overnight range on elevated Relative Volume (RVOL).
 */

import { calculateATR, calculateRVOL } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildFuturesSignal,
  FUTURES_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedFuturesSymbol,
  NyClockSnapshot,
  resolveNyClock,
  toNyClock,
} from './futuresUtils';

export interface OvernightRangeSummary {
  onh: number;
  onl: number;
  mid: number;
  range: number;
  candleCount: number;
}

const CASH_OPEN_START_MINUTES = 9 * 60 + 30; // 09:30 ET
const GLOBEX_SWEEP_END_MINUTES = 9 * 60 + 45; // 09:45 ET
const GLOBEX_START_MINUTES = 18 * 60; // 18:00 ET prior session

/**
 * Extracts Overnight High/Low (18:00 ET prior day through 09:29 ET current day).
 */
export function extractOvernightRange(
  candles: TraxoCandle[],
  clock: NyClockSnapshot
): OvernightRangeSummary | null {
  const overnightCandles = candles.filter((c) => {
    const ny = toNyClock(c.timestamp);
    if (!ny) return false;
    const isPriorEvening = ny.nyDateKey === clock.prevNyDateKey && ny.nyMinutesOfDay >= GLOBEX_START_MINUTES;
    const isCurrentPreOpen = ny.nyDateKey === clock.nyDateKey && ny.nyMinutesOfDay < CASH_OPEN_START_MINUTES;
    return isPriorEvening || isCurrentPreOpen;
  });

  if (overnightCandles.length < 4) return null;

  let onh = -Infinity;
  let onl = Infinity;
  for (const c of overnightCandles) {
    if (c.high > onh) onh = c.high;
    if (c.low < onl) onl = c.low;
  }

  const range = onh - onl;
  if (!Number.isFinite(range) || range <= 0) return null;

  return {
    onh,
    onl,
    mid: (onh + onl) / 2,
    range,
    candleCount: overnightCandles.length,
  };
}

function evaluateRejectionCandle(
  candle: TraxoCandle,
  direction: 'BUY' | 'SELL'
): { valid: boolean; wickRatio: number; strongWick: boolean } {
  const range = candle.high - candle.low;
  if (range <= 0) return { valid: false, wickRatio: 0, strongWick: false };

  if (direction === 'BUY') {
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const wickRatio = lowerWick / range;
    const closePos = (candle.close - candle.low) / range;
    const isBullClose = candle.close > candle.open;
    const strongWick = wickRatio >= 0.35 && lowerWick > upperWick * 1.2 && closePos >= 0.5;
    return {
      valid: (isBullClose && closePos >= 0.5) || strongWick,
      wickRatio,
      strongWick,
    };
  }

  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const wickRatio = upperWick / range;
  const closePos = (candle.close - candle.low) / range;
  const isBearClose = candle.close < candle.open;
  const strongWick = wickRatio >= 0.35 && upperWick > lowerWick * 1.2 && closePos <= 0.5;
  return {
    valid: (isBearClose && closePos <= 0.5) || strongWick,
    wickRatio,
    strongWick,
  };
}

export class TraxoGlobexSweepStrategy implements ITraxoStrategy {
  readonly id = 'traxo_globex_sweep';
  readonly name = 'TRAXO Globex Sweep';
  readonly market = 'FUTURES' as const;
  readonly supportedSymbols = FUTURES_SUPPORTED_SYMBOLS;
  readonly optimalTimeframes = ['1m', '5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedFuturesSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!hasValidCandles(context.candles, 10)) return null;

    const latest = context.candles[context.candles.length - 1];
    const clock = resolveNyClock(context, latest);
    if (!clock) return null;

    // Active within first 15 minutes of NY Cash Open (09:30 - 09:45 ET)
    if (
      clock.nyMinutesOfDay < CASH_OPEN_START_MINUTES ||
      clock.nyMinutesOfDay >= GLOBEX_SWEEP_END_MINUTES
    ) {
      return null;
    }

    const overnight = extractOvernightRange(context.candles, clock);
    if (!overnight) return null;

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    // Collect recent Cash Open bars (up to last 3 bars inside 09:30-09:45 ET)
    const openWindowIndices: number[] = [];
    const startIdx = Math.max(0, context.candles.length - 3);
    for (let i = startIdx; i < context.candles.length; i++) {
      const ny = toNyClock(context.candles[i].timestamp);
      if (
        ny &&
        ny.nyDateKey === clock.nyDateKey &&
        ny.nyMinutesOfDay >= CASH_OPEN_START_MINUTES &&
        ny.nyMinutesOfDay < GLOBEX_SWEEP_END_MINUTES
      ) {
        openWindowIndices.push(i);
      }
    }
    if (openWindowIndices.length === 0) return null;

    let sweepHigh = -Infinity;
    let sweepLow = Infinity;
    let maxWindowRvol = 0;

    for (const idx of openWindowIndices) {
      const bar = context.candles[idx];
      if (bar.high > sweepHigh) sweepHigh = bar.high;
      if (bar.low < sweepLow) sweepLow = bar.low;
      const barRvol = calculateRVOL(context.candles.slice(0, idx + 1), 20);
      if (barRvol > maxWindowRvol) maxWindowRvol = barRvol;
    }

    const latestRvol = calculateRVOL(context.candles, 20);
    const effectiveRvol = Math.max(latestRvol, maxWindowRvol);

    // Requires high RVOL sweep participation at the open
    if (effectiveRvol < 1.25) return null;

    const minSweep = Math.max(1.0, atr * 0.08);
    const maxSweepExtension = Math.max(atr * 2.5, overnight.range * 0.65);

    // Latest close must reject back inside ONH/ONL range
    if (latest.close >= overnight.onh || latest.close <= overnight.onl) return null;

    const sweptOnh =
      sweepHigh > overnight.onh + minSweep && sweepHigh - overnight.onh <= maxSweepExtension;
    const sweptOnl =
      sweepLow < overnight.onl - minSweep && overnight.onl - sweepLow <= maxSweepExtension;

    if (!sweptOnh && !sweptOnl) return null;

    const bullRejection = evaluateRejectionCandle(latest, 'BUY');
    const bearRejection = evaluateRejectionCandle(latest, 'SELL');

    let direction: 'BUY' | 'SELL' | null = null;
    let rejection = bullRejection;

    if (sweptOnl && !sweptOnh && bullRejection.valid) {
      direction = 'BUY';
      rejection = bullRejection;
    } else if (sweptOnh && !sweptOnl && bearRejection.valid) {
      direction = 'SELL';
      rejection = bearRejection;
    } else if (sweptOnl && sweptOnh) {
      if (bullRejection.valid && !bearRejection.valid) {
        direction = 'BUY';
        rejection = bullRejection;
      } else if (bearRejection.valid && !bullRejection.valid) {
        direction = 'SELL';
        rejection = bearRejection;
      }
    }

    if (!direction) return null;

    const entryPrice = context.currentPrice ?? latest.close;
    const stopBuffer = Math.max(2.0, atr * 0.25);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;
    let sweepPoints: number;

    if (direction === 'BUY') {
      slPrice = sweepLow - stopBuffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      tp1Price = Math.max(overnight.mid, entryPrice + risk * 1.6);
      tp2Price = Math.max(overnight.onh, tp1Price + risk * 0.9);
      sweepPoints = overnight.onl - sweepLow;
    } else {
      slPrice = sweepHigh + stopBuffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      tp1Price = Math.min(overnight.mid, entryPrice - risk * 1.6);
      tp2Price = Math.min(overnight.onl, tp1Price - risk * 0.9);
      sweepPoints = sweepHigh - overnight.onh;
    }

    let score = 50;
    const reasons: string[] = [
      `Overnight Globex range mapped (${overnight.onl.toFixed(2)} - ${overnight.onh.toFixed(2)}) across ${overnight.candleCount} bars`,
      direction === 'BUY'
        ? `Cash Open swept ONL by ${sweepPoints.toFixed(2)} pts and rejected back inside range`
        : `Cash Open swept ONH by ${sweepPoints.toFixed(2)} pts and rejected back inside range`,
      `High opening participation confirmed (RVOL ${effectiveRvol.toFixed(2)}x)`,
    ];

    if (effectiveRvol >= 1.6) {
      score += 14;
      reasons.push('Institutional volume surge (>= 1.6x RVOL) on liquidity sweep');
    } else if (effectiveRvol >= 1.35) {
      score += 8;
    }

    if (rejection.strongWick) {
      score += 14;
      reasons.push(`Decisive rejection wick (${Math.round(rejection.wickRatio * 100)}% of trigger bar)`);
    }

    if (overnight.range >= atr * 1.5) {
      score += 8;
      reasons.push('Clean Globex range provides wide room toward overnight midpoint');
    }

    if (clock.nyMinutesOfDay <= CASH_OPEN_START_MINUTES + 10) {
      score += 6;
      reasons.push('Triggered within first 10 minutes of 09:30 ET Cash Open');
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
        onh: Number(overnight.onh.toFixed(2)),
        onl: Number(overnight.onl.toFixed(2)),
        onMid: Number(overnight.mid.toFixed(2)),
        sweepPoints: Number(sweepPoints.toFixed(2)),
        rvol: Number(effectiveRvol.toFixed(2)),
        atr: Number(atr.toFixed(2)),
        nyTime: `${String(clock.nyHour).padStart(2, '0')}:${String(clock.nyMinute).padStart(2, '0')} ET`,
      },
      timestampIso: clock.utcDate.toISOString(),
    });
  }
}

export const traxoGlobexSweep = new TraxoGlobexSweepStrategy();
