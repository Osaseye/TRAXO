/**
 * TRAXO Kinetic NR7 — Gold (XAU/USD) Toby Crabel Narrow Range 7 Volatility Breakout Engine
 *
 * Identifies daily volatility compression where a day's High-Low range is the
 * narrowest of the preceding 7 trading days (NR7), then triggers on a clean
 * directional breakout above the NR7 high or below the NR7 low.
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
  GOLD_SUPPORTED_SYMBOLS,
  hasValidCandles,
  isSupportedGoldSymbol,
  normalizeTimeframe,
  parseUtcDate,
  resolveUtcClock,
} from './goldUtils';

export interface DailyBar extends TraxoCandle {
  dateKey: string;
  range: number;
}

export interface Nr7PatternMatch {
  nr7Index: number;
  nr7Bar: DailyBar;
  priorDayBar: DailyBar;
  avgPrior6Range: number;
  compressionRatio: number;
  isInsideDay: boolean;
}

function isDailySeries(candles: TraxoCandle[], timeframe: string): boolean {
  if (normalizeTimeframe(timeframe) === '1D') return true;
  if (candles.length < 3) return false;
  const t1 = parseUtcDate(candles[candles.length - 2].timestamp)?.getTime();
  const t2 = parseUtcDate(candles[candles.length - 1].timestamp)?.getTime();
  if (t1 === undefined || t2 === undefined) return false;
  return Math.abs(t2 - t1) >= 18 * 60 * 60 * 1000;
}

/**
 * Aggregates intraday candles by UTC date into daily OHLCV bars, or normalizes
 * an already-daily candle array into DailyBar objects.
 */
export function buildDailyBars(candles: TraxoCandle[], alreadyDaily: boolean): DailyBar[] {
  if (alreadyDaily) {
    const bars: DailyBar[] = [];
    for (const c of candles) {
      const d = parseUtcDate(c.timestamp);
      const dateKey = d ? getUtcDateKey(d) : String(c.timestamp);
      bars.push({
        ...c,
        dateKey,
        range: c.high - c.low,
      });
    }
    return bars;
  }

  const byDate = new Map<string, TraxoCandle[]>();
  for (const c of candles) {
    const d = parseUtcDate(c.timestamp);
    if (!d) continue;
    const key = getUtcDateKey(d);
    const list = byDate.get(key);
    if (list) list.push(c);
    else byDate.set(key, [c]);
  }

  const keys = Array.from(byDate.keys()).sort();
  return keys.map((dateKey) => {
    const group = byDate.get(dateKey)!;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of group) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume || 0;
    }
    const first = group[0];
    const last = group[group.length - 1];
    return {
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      timestamp: last.timestamp,
      dateKey,
      range: high - low,
    };
  });
}

/**
 * Checks whether dailyBars[index] is an NR7 bar (strictly smallest range of [index-6 .. index]).
 */
export function checkNr7At(dailyBars: DailyBar[], index: number): Nr7PatternMatch | null {
  if (index < 6 || index >= dailyBars.length) return null;

  const target = dailyBars[index];
  if (!Number.isFinite(target.range) || target.range <= 0) return null;

  let priorSum = 0;
  for (let i = index - 6; i < index; i++) {
    const r = dailyBars[i].range;
    if (!Number.isFinite(r) || r <= 0) return null;
    if (target.range >= r) return null;
    priorSum += r;
  }

  const priorDayBar = dailyBars[index - 1];
  const avgPrior6Range = priorSum / 6;
  const compressionRatio = avgPrior6Range > 0 ? target.range / avgPrior6Range : 1;
  const isInsideDay = target.high < priorDayBar.high && target.low > priorDayBar.low;

  return {
    nr7Index: index,
    nr7Bar: target,
    priorDayBar,
    avgPrior6Range,
    compressionRatio,
    isInsideDay,
  };
}

export class TraxoKineticNr7Strategy implements ITraxoStrategy {
  readonly id = 'traxo_kinetic_nr7';
  readonly name = 'TRAXO Kinetic NR7';
  readonly market = 'METALS' as const;
  readonly supportedSymbols = [...GOLD_SUPPORTED_SYMBOLS];
  readonly optimalTimeframes = ['1D', 'D1', '1H', 'H1', '15m', 'M15'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedGoldSymbol(context.symbol)) return null;
    if (!hasValidCandles(context.candles, 7)) return null;

    const candles = context.candles;
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const clock = resolveUtcClock(context, current);
    if (!clock) return null;

    let dailyBars: DailyBar[];
    if (
      Array.isArray(context.higherTimeframeCandles) &&
      hasValidCandles(context.higherTimeframeCandles, 7)
    ) {
      dailyBars = buildDailyBars(
        context.higherTimeframeCandles,
        isDailySeries(context.higherTimeframeCandles, '1D')
      );
    } else {
      dailyBars = buildDailyBars(candles, isDailySeries(candles, context.timeframe));
    }

    if (dailyBars.length < 7) return null;

    const entryPrice = context.currentPrice ?? current.close;
    let nr7Match: Nr7PatternMatch | null = null;
    let direction: TraxoSignalDirection | null = null;

    // Mode 1: Completed previous day (dailyBars[-2]) is NR7; current bar breaks its high/low
    if (dailyBars.length >= 8) {
      const completedMatch = checkNr7At(dailyBars, dailyBars.length - 2);
      if (completedMatch) {
        const { high, low } = completedMatch.nr7Bar;
        if (entryPrice > high && prev.close <= high) {
          nr7Match = completedMatch;
          direction = 'BUY';
        } else if (entryPrice < low && prev.close >= low) {
          nr7Match = completedMatch;
          direction = 'SELL';
        }
      }
    }

    // Mode 2: Current day bar (dailyBars[-1]) is NR7 and live price breaks out of its range
    if (!nr7Match && context.currentPrice !== undefined) {
      const latestMatch = checkNr7At(dailyBars, dailyBars.length - 1);
      if (latestMatch) {
        if (context.currentPrice > latestMatch.nr7Bar.high) {
          nr7Match = latestMatch;
          direction = 'BUY';
        } else if (context.currentPrice < latestMatch.nr7Bar.low) {
          nr7Match = latestMatch;
          direction = 'SELL';
        }
      }
    }

    if (!nr7Match || !direction) return null;

    const atrSeries = calculateATR(candles, Math.min(14, candles.length));
    const atr = atrSeries[atrSeries.length - 1] || nr7Match.nr7Bar.range;
    const slBuffer = Math.max(atr * 0.5, nr7Match.nr7Bar.range * 0.15, 0.5);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    if (direction === 'BUY') {
      slPrice = nr7Match.nr7Bar.low - slBuffer;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      tp1Price = entryPrice + risk * 2.0;
      tp2Price = entryPrice + risk * 3.0;
    } else {
      slPrice = nr7Match.nr7Bar.high + slBuffer;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      tp1Price = entryPrice - risk * 2.0;
      tp2Price = entryPrice - risk * 3.0;
    }

    const rvol = calculateRVOL(candles, Math.min(20, candles.length - 1));
    const barRange = current.high - current.low;
    const breakoutStrength =
      barRange > 0
        ? direction === 'BUY'
          ? (current.close - current.low) / barRange
          : (current.high - current.close) / barRange
        : 0.5;

    let score = 62;
    const reasons: string[] = [
      `NR7 volatility contraction on ${nr7Match.nr7Bar.dateKey} (range $${nr7Match.nr7Bar.range.toFixed(2)} vs 6-day avg $${nr7Match.avgPrior6Range.toFixed(2)})`,
      direction === 'BUY'
        ? `Bullish breakout above NR7 high ($${nr7Match.nr7Bar.high.toFixed(2)})`
        : `Bearish breakout below NR7 low ($${nr7Match.nr7Bar.low.toFixed(2)})`,
    ];

    if (nr7Match.compressionRatio <= 0.6) {
      score += 12;
      reasons.push(`Extreme volatility coil (${Math.round(nr7Match.compressionRatio * 100)}% of 6-day average range)`);
    } else if (nr7Match.compressionRatio <= 0.78) {
      score += 6;
    }

    if (nr7Match.isInsideDay) {
      score += 12;
      reasons.push('ID/NR7 confluence (Inside Day + Narrowest Range of 7 days)');
    }

    if (rvol >= 1.3) {
      score += 8;
      reasons.push(`Breakout volume expansion (RVOL ${rvol.toFixed(2)}x)`);
    }

    if (breakoutStrength >= 0.7) {
      score += 6;
      reasons.push('Strong directional breakout candle close');
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
        nr7Date: nr7Match.nr7Bar.dateKey,
        nr7High: Number(nr7Match.nr7Bar.high.toFixed(2)),
        nr7Low: Number(nr7Match.nr7Bar.low.toFixed(2)),
        nr7Range: Number(nr7Match.nr7Bar.range.toFixed(2)),
        avgPrior6Range: Number(nr7Match.avgPrior6Range.toFixed(2)),
        compressionRatio: Number(nr7Match.compressionRatio.toFixed(2)),
        isInsideDay: nr7Match.isInsideDay,
        rvol: Number(rvol.toFixed(2)),
        atr14: Number(atr.toFixed(2)),
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoKineticNr7 = new TraxoKineticNr7Strategy();
