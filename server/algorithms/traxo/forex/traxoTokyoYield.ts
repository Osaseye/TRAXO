/**
 * TRAXO Tokyo Yield — Tokyo Gotobi Fix Anomaly Engine (USDJPY)
 *
 * Exploits structural Japanese corporate USD demand ahead of the 09:55 JST
 * (00:55 UTC) Tokyo Fix on Gotobi settlement dates (days ending in 5 or 0:
 * 5, 10, 15, 20, 25, 30 — or the preceding Friday when a Gotobi date falls
 * on Saturday or Sunday). Flags Tokyo morning accumulation (00:00-00:55 UTC).
 */

import { calculateATR, calculateEMA, calculateRVOL, calculateVWAP } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildForexSignal,
  getForexPipSize,
  getUtcDateKey,
  normalizeForexSymbol,
  parseUtcDate,
  resolveUtcClock,
} from './forexUtils';

const GOTOBI_DAYS = new Set([5, 10, 15, 20, 25, 30]);
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface GotobiCheckResult {
  isGotobi: boolean;
  effectiveGotobiDay: number | null;
  isWeekendRoll: boolean;
  jstDayOfMonth: number;
  jstDayOfWeek: number;
}

/**
 * Checks whether the given UTC timestamp (with optional session override)
 * corresponds to a Tokyo Gotobi settlement day (5, 10, 15, 20, 25, 30)
 * or the preceding Friday when that date falls on a weekend.
 */
export function isTokyoGotobiDate(
  utcDate: Date,
  sessionOverride?: { dayOfMonth?: number; dayOfWeek?: number }
): GotobiCheckResult {
  const jstDate = new Date(utcDate.getTime() + JST_OFFSET_MS);
  const hasExplicitDay = typeof sessionOverride?.dayOfMonth === 'number';
  const hasExplicitDow = typeof sessionOverride?.dayOfWeek === 'number';

  const jstDayOfMonth = hasExplicitDay ? sessionOverride!.dayOfMonth! : jstDate.getUTCDate();
  const jstDayOfWeek = hasExplicitDow ? sessionOverride!.dayOfWeek! : jstDate.getUTCDay();

  // Weekends (Saturday = 6, Sunday = 0) have no Tokyo Fix
  if (jstDayOfWeek === 0 || jstDayOfWeek === 6) {
    return {
      isGotobi: false,
      effectiveGotobiDay: null,
      isWeekendRoll: false,
      jstDayOfMonth,
      jstDayOfWeek,
    };
  }

  // Direct Gotobi weekday (5, 10, 15, 20, 25, 30)
  if (GOTOBI_DAYS.has(jstDayOfMonth)) {
    return {
      isGotobi: true,
      effectiveGotobiDay: jstDayOfMonth,
      isWeekendRoll: false,
      jstDayOfMonth,
      jstDayOfWeek,
    };
  }

  // Preceding Friday check: if today is Friday (5), check Saturday (+1) and Sunday (+2)
  if (jstDayOfWeek === 5) {
    if (hasExplicitDay) {
      // Respect month length from jstDate if month matches, otherwise standard check
      const year = jstDate.getUTCFullYear();
      const month = jstDate.getUTCMonth();
      const sat = new Date(Date.UTC(year, month, jstDayOfMonth + 1)).getUTCDate();
      const sun = new Date(Date.UTC(year, month, jstDayOfMonth + 2)).getUTCDate();
      if (GOTOBI_DAYS.has(sat)) {
        return { isGotobi: true, effectiveGotobiDay: sat, isWeekendRoll: true, jstDayOfMonth, jstDayOfWeek };
      }
      if (GOTOBI_DAYS.has(sun)) {
        return { isGotobi: true, effectiveGotobiDay: sun, isWeekendRoll: true, jstDayOfMonth, jstDayOfWeek };
      }
    } else {
      const satDate = new Date(jstDate.getTime() + 1 * 86_400_000).getUTCDate();
      const sunDate = new Date(jstDate.getTime() + 2 * 86_400_000).getUTCDate();
      if (GOTOBI_DAYS.has(satDate)) {
        return { isGotobi: true, effectiveGotobiDay: satDate, isWeekendRoll: true, jstDayOfMonth, jstDayOfWeek };
      }
      if (GOTOBI_DAYS.has(sunDate)) {
        return { isGotobi: true, effectiveGotobiDay: sunDate, isWeekendRoll: true, jstDayOfMonth, jstDayOfWeek };
      }
    }
  }

  return {
    isGotobi: false,
    effectiveGotobiDay: null,
    isWeekendRoll: false,
    jstDayOfMonth,
    jstDayOfWeek,
  };
}

function extractTokyoAccumulation(candles: TraxoCandle[], targetDateKey: string): {
  high: number;
  low: number;
  range: number;
  openPrice: number;
  candleCount: number;
} | null {
  const morningBars = candles.filter((c) => {
    const d = parseUtcDate(c.timestamp);
    if (!d) return false;
    return getUtcDateKey(d) === targetDateKey && d.getUTCHours() === 0 && d.getUTCMinutes() <= 55;
  });

  const windowBars = morningBars.length >= 2 ? morningBars : candles.slice(-4);
  if (windowBars.length === 0) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const b of windowBars) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
  }

  return {
    high,
    low,
    range: high - low,
    openPrice: windowBars[0].open,
    candleCount: windowBars.length,
  };
}

export class TraxoTokyoYieldStrategy implements ITraxoStrategy {
  readonly id = 'traxo_tokyo_yield';
  readonly name = 'TRAXO Tokyo Yield';
  readonly market = 'FOREX' as const;
  readonly supportedSymbols = ['USDJPY'];
  readonly optimalTimeframes = ['5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (normalizeForexSymbol(context.symbol) !== 'USDJPY') return null;
    if (!context.candles || context.candles.length < 15) return null;

    const latest = context.candles[context.candles.length - 1];
    const clock = resolveUtcClock(context, latest);
    if (!clock) return null;

    // Tokyo morning accumulation window: 00:00 - 00:55 UTC (09:00 - 09:55 JST)
    if (clock.utcHour !== 0 || clock.utcMinute < 0 || clock.utcMinute > 55) return null;

    const gotobi = isTokyoGotobiDate(clock.date, {
      dayOfMonth: context.session?.dayOfMonth,
      dayOfWeek: context.session?.dayOfWeek,
    });
    if (!gotobi.isGotobi) return null;

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const accum = extractTokyoAccumulation(context.candles, clock.dateKey);
    if (!accum) return null;

    // Reject violent bearish breakdown that invalidates morning accumulation
    const latestBearishBody = latest.open - latest.close;
    if (latestBearishBody > atr * 1.1) return null;
    if (accum.range > atr * 3.5) return null;

    const closes = context.candles.map((c) => c.close);
    const ema21Series = calculateEMA(closes, 21);
    const ema21 = ema21Series[ema21Series.length - 1];
    const { vwap } = calculateVWAP(context.candles.slice(-24));
    const currentVwap = vwap[vwap.length - 1];
    const rvol = calculateRVOL(context.candles, 20);
    const pipSize = getForexPipSize(context.symbol);

    const isBullishCandle = latest.close >= latest.open;
    const aboveSessionOpen = latest.close >= accum.openPrice - pipSize * 2;
    const aboveEma = latest.close >= ema21 - atr * 0.25;
    const aboveVwap = latest.close >= currentVwap - atr * 0.2;

    // Require at least mild accumulation support (not collapsing below open & EMA)
    if (!isBullishCandle && !aboveSessionOpen && !aboveEma) return null;

    const entryPrice = context.currentPrice ?? latest.close;
    const buffer = Math.max(pipSize * 4, atr * 0.35);
    const minStopDistance = Math.max(pipSize * 8, atr * 0.75);
    const rawSl = Math.min(accum.low, latest.low) - buffer;
    const slPrice = Math.min(rawSl, entryPrice - minStopDistance);
    const risk = entryPrice - slPrice;
    if (risk <= 0) return null;

    const tp1Price = entryPrice + risk * 1.5;
    const tp2Price = entryPrice + risk * 2.5;

    let score = 50;
    const jstMinuteStr = String(clock.utcMinute).padStart(2, '0');
    const reasons: string[] = [
      gotobi.isWeekendRoll
        ? `Gotobi weekend-roll Friday active (settlement day ${gotobi.effectiveGotobiDay})`
        : `Tokyo Gotobi Fix settlement date (${gotobi.effectiveGotobiDay}) active`,
      `Tokyo morning accumulation window flagged at 00:${jstMinuteStr} UTC (09:${jstMinuteStr} JST)`,
    ];

    if (accum.range <= atr * 2.0) {
      score += 14;
      reasons.push(`Tight Tokyo morning accumulation (${(accum.range / pipSize).toFixed(1)} pips)`);
    }
    if (isBullishCandle) {
      score += 12;
      reasons.push('Bullish accumulation candle supporting USDJPY pre-fix bid');
    }
    if (aboveVwap) {
      score += 8;
      reasons.push('Price holding above intraday VWAP');
    }
    if (clock.utcMinute >= 15 && clock.utcMinute <= 50) {
      score += 8;
      reasons.push('Prime pre-09:55 JST fix accumulation timing');
    }
    if (gotobi.isWeekendRoll) {
      score += 5;
      reasons.push('Pre-weekend Gotobi corporate demand amplification');
    }
    if (rvol >= 1.1) {
      score += 5;
      reasons.push(`Supportive accumulation volume (RVOL ${rvol.toFixed(2)}x)`);
    }

    return buildForexSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction: 'BUY',
      rawScore: Math.min(98, score),
      entryType: 'MARKET',
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        isGotobiDate: gotobi.isGotobi,
        effectiveGotobiDay: gotobi.effectiveGotobiDay,
        isWeekendRoll: gotobi.isWeekendRoll,
        utcMinute: clock.utcMinute,
        jstHour: 9,
        jstMinute: clock.utcMinute,
        accumulationHigh: accum.high,
        accumulationLow: accum.low,
        accumulationRangePips: Number((accum.range / pipSize).toFixed(1)),
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(3)),
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoTokyoYield = new TraxoTokyoYieldStrategy();
