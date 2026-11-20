/**
 * TRAXO Sovereign Fix — WM/Reuters 16:00 UTC Benchmark Fix Rebalancing Engine
 *
 * Captures institutional FX rebalancing snapbacks immediately after the 16:00 UTC
 * benchmark fix. Identifies pre-fix order-flow stretch during 15:00-16:00 UTC
 * (>= 0.75x ATR(14) displacement from the pre-fix VWAP/midpoint equilibrium), then
 * triggers mean-reversion snapback entries during 16:00-16:30 UTC, with priority
 * weighting on month-end (final 2 weekday business days) rebalancing sessions.
 */

import { calculateATR, calculateEMA, calculateRVOL, calculateVWAP } from '../indicators';
import type { ITraxoStrategy, TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildForexSignal,
  getForexPipSize,
  getUtcDateKey,
  isSupportedForexSymbol,
  normalizeForexSymbol,
  parseUtcDate,
  resolveUtcClock,
} from './forexUtils';

export const SOVEREIGN_FIX_SYMBOLS: string[] = [
  'EURUSD',
  'GBPUSD',
  'USDCAD',
  'USDJPY',
  'EURGBP',
];

const PRE_FIX_START_MINUTES = 15 * 60; // 15:00 UTC
const FIX_LOCK_MINUTES = 16 * 60; // 16:00 UTC
const FIX_WINDOW_END_MINUTES = 16 * 60 + 30; // 16:30 UTC

/**
 * Returns true when the given UTC date falls on one of the final 2 weekday
 * business days of its UTC calendar month (prime WM/R month-end rebalancing).
 */
export function isMonthEndFixWindow(date: Date): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastCalendarDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const businessDays: number[] = [];
  for (let day = lastCalendarDay; day >= 1 && businessDays.length < 2; day--) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      businessDays.push(day);
    }
  }

  return businessDays.includes(date.getUTCDate());
}

function getPreFixEquilibrium(candles: TraxoCandle[], dateKey: string): {
  equilibrium: number;
  high: number;
  low: number;
  barCount: number;
} | null {
  const preFixBars = candles.filter((c) => {
    const d = parseUtcDate(c.timestamp);
    if (!d) return false;
    if (getUtcDateKey(d) !== dateKey) return false;
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    return mins >= PRE_FIX_START_MINUTES && mins < FIX_LOCK_MINUTES;
  });

  if (preFixBars.length < 2) return null;

  const { vwap } = calculateVWAP(preFixBars);
  let high = -Infinity;
  let low = Infinity;
  for (const bar of preFixBars) {
    if (bar.high > high) high = bar.high;
    if (bar.low < low) low = bar.low;
  }

  const mid = (high + low) / 2;
  const vwapEq = vwap[vwap.length - 1];
  const equilibrium = Number.isFinite(vwapEq) ? (vwapEq + mid) / 2 : mid;

  return {
    equilibrium,
    high,
    low,
    barCount: preFixBars.length,
  };
}

export class TraxoSovereignFixStrategy implements ITraxoStrategy {
  readonly id = 'traxo_sovereign_fix';
  readonly name = 'TRAXO Sovereign Fix';
  readonly market = 'FOREX' as const;
  readonly supportedSymbols = SOVEREIGN_FIX_SYMBOLS;
  readonly optimalTimeframes = ['5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedForexSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!context.candles || context.candles.length < 20) return null;

    const latest = context.candles[context.candles.length - 1];
    const clock = resolveUtcClock(context, latest);
    if (!clock) return null;

    // Snapback trigger window: 16:00-16:30 UTC after 15:00-16:00 UTC pre-fix stretch
    const utcMinutes = clock.utcHour * 60 + clock.utcMinute;
    if (utcMinutes < FIX_LOCK_MINUTES || utcMinutes >= FIX_WINDOW_END_MINUTES) {
      return null;
    }

    const preFix = getPreFixEquilibrium(context.candles, clock.dateKey);
    if (!preFix) return null;

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const fixBars = context.candles.slice(-2).filter((c) => {
      const d = parseUtcDate(c.timestamp);
      if (!d || getUtcDateKey(d) !== clock.dateKey) return false;
      const m = d.getUTCHours() * 60 + d.getUTCMinutes();
      return m >= FIX_LOCK_MINUTES - 15 && m < FIX_WINDOW_END_MINUTES;
    });
    const fixExtremeHigh = Math.max(preFix.high, ...fixBars.map((b) => b.high), latest.high);
    const fixExtremeLow = Math.min(preFix.low, ...fixBars.map((b) => b.low), latest.low);

    const upStretch = fixExtremeHigh - preFix.equilibrium;
    const downStretch = preFix.equilibrium - fixExtremeLow;
    const minStretch = atr * 0.75;

    const range = latest.high - latest.low;
    if (range <= 0) return null;

    const body = Math.abs(latest.close - latest.open);
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    const closePos = (latest.close - latest.low) / range;

    const isBearSnap =
      upStretch >= minStretch &&
      (latest.close < latest.open || (upperWick >= body && closePos <= 0.45)) &&
      latest.close < fixExtremeHigh;

    const isBullSnap =
      downStretch >= minStretch &&
      (latest.close > latest.open || (lowerWick >= body && closePos >= 0.55)) &&
      latest.close > fixExtremeLow;

    if (!isBearSnap && !isBullSnap) return null;

    const direction: 'BUY' | 'SELL' =
      isBullSnap && isBearSnap
        ? downStretch >= upStretch
          ? 'BUY'
          : 'SELL'
        : isBullSnap
          ? 'BUY'
          : 'SELL';

    const pipSize = getForexPipSize(context.symbol);
    const entryPrice = context.currentPrice ?? latest.close;
    const slPadding = Math.max(pipSize * 10, atr * 0.9);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;
    let stretchAtrRatio: number;

    if (direction === 'BUY') {
      slPrice = fixExtremeLow - slPadding;
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      const minTp1 = entryPrice + risk * 1.6;
      tp1Price = preFix.equilibrium >= entryPrice + risk * 1.5 ? preFix.equilibrium : minTp1;
      tp2Price = Math.max(tp1Price + risk * 0.8, entryPrice + risk * 2.4);
      stretchAtrRatio = downStretch / atr;
    } else {
      slPrice = fixExtremeHigh + slPadding;
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      const minTp1 = entryPrice - risk * 1.6;
      tp1Price = preFix.equilibrium <= entryPrice - risk * 1.5 ? preFix.equilibrium : minTp1;
      tp2Price = Math.min(tp1Price - risk * 0.8, entryPrice - risk * 2.4);
      stretchAtrRatio = upStretch / atr;
    }

    const monthEnd = isMonthEndFixWindow(clock.date);
    const rvol = calculateRVOL(context.candles, 20);
    const rejectionWickRatio =
      direction === 'BUY' ? lowerWick / range : upperWick / range;
    const hasStrongWick = rejectionWickRatio >= 0.35;

    let htfAligned = false;
    if (context.higherTimeframeCandles && context.higherTimeframeCandles.length >= 21) {
      const htfCloses = context.higherTimeframeCandles.map((c) => c.close);
      const htfEma21 = calculateEMA(htfCloses, 21);
      const htfLast = htfCloses[htfCloses.length - 1];
      const emaVal = htfEma21[htfEma21.length - 1];
      htfAligned =
        (direction === 'BUY' && htfLast > emaVal) ||
        (direction === 'SELL' && htfLast < emaVal);
    }

    let score = 56;
    const normalizedSym = normalizeForexSymbol(context.symbol);
    const reasons: string[] = [
      `WM/Reuters 16:00 UTC Fix rebalancing snapback on ${normalizedSym}`,
      `Pre-fix stretch of ${stretchAtrRatio.toFixed(2)}x ATR from 15:00-16:00 UTC equilibrium (${preFix.equilibrium.toFixed(normalizedSym.endsWith('JPY') ? 3 : 5)})`,
    ];

    if (monthEnd) {
      score += 18;
      reasons.push('Month-end final 2 business days rebalancing boost active (+18)');
    }
    if (rvol >= 1.3) {
      score += 12;
      reasons.push(`Post-fix dealer inventory flow confirmed (RVOL ${rvol.toFixed(2)}x)`);
    }
    if (hasStrongWick) {
      score += 12;
      reasons.push(`Strong fix exhaustion wick (${Math.round(rejectionWickRatio * 100)}% of candle range)`);
    }
    if (htfAligned) {
      score += 8;
      reasons.push('Aligned with HTF EMA 21 institutional macro flow');
    }

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
        preFixEquilibrium: Number(preFix.equilibrium.toFixed(5)),
        stretchAtrRatio: Number(stretchAtrRatio.toFixed(2)),
        monthEndWindow: monthEnd,
        rvol: Number(rvol.toFixed(2)),
        htfAligned,
        atr: Number(atr.toFixed(5)),
        utcHour: clock.utcHour,
        utcMinute: clock.utcMinute,
      },
      timestampIso: clock.date.toISOString(),
    });
  }
}

export const traxoSovereignFix = new TraxoSovereignFixStrategy();
