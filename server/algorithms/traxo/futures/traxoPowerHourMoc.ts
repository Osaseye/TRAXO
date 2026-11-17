/**
 * TRAXO Power Hour MOC — Late Day Market-on-Close Momentum Engine
 *
 * Active during the final 30 minutes of the cash equity/futures session
 * (15:30-16:00 ET). Identifies the prevailing daily trend via intraday RTH
 * displacement, VWAP/EMA alignment, and optional higher-timeframe trend,
 * flagging high-conviction MOC continuation entries.
 */

import { calculateATR, calculateEMA, calculateRVOL, calculateVWAP } from '../indicators';
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

const MOC_START_MINUTES = 15 * 60 + 30; // 15:30 ET
const MOC_END_MINUTES = 16 * 60; // 16:00 ET
const CASH_OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET

export interface DailyTrendAssessment {
  direction: 'BUY' | 'SELL';
  rthDisplacement: number;
  vwap: number;
  ema21: number;
  ema50: number;
  htfAligned: boolean;
}

/**
 * Determines prevailing daily trend for Power Hour MOC continuation.
 */
export function assessDailyTrend(
  candles: TraxoCandle[],
  clock: NyClockSnapshot,
  higherTimeframeCandles?: TraxoCandle[]
): DailyTrendAssessment | null {
  if (candles.length < 20) return null;

  const closes = candles.map((c) => c.close);
  const ema21Series = calculateEMA(closes, 21);
  const ema50Series = calculateEMA(closes, Math.min(50, closes.length));
  const ema21 = ema21Series[ema21Series.length - 1];
  const ema50 = ema50Series[ema50Series.length - 1];
  const latestClose = closes[closes.length - 1];

  const rthCandles = candles.filter((c) => {
    const ny = toNyClock(c.timestamp);
    return ny && ny.nyDateKey === clock.nyDateKey && ny.nyMinutesOfDay >= CASH_OPEN_MINUTES;
  });

  const sessionSlice = rthCandles.length >= 6 ? rthCandles : candles;
  const { vwap } = calculateVWAP(sessionSlice);
  const currentVwap = vwap[vwap.length - 1];
  const sessionOpen = sessionSlice[0].open;
  const rthDisplacement = latestClose - sessionOpen;

  if (!Number.isFinite(ema21) || !Number.isFinite(ema50) || !Number.isFinite(currentVwap)) {
    return null;
  }

  let htfBias: 'BUY' | 'SELL' | null = null;
  if (higherTimeframeCandles && higherTimeframeCandles.length >= 10) {
    const htfCloses = higherTimeframeCandles.map((c) => c.close);
    const htfEma21 = calculateEMA(htfCloses, Math.min(21, htfCloses.length));
    const htfLast = htfCloses[htfCloses.length - 1];
    const htfEmaLast = htfEma21[htfEma21.length - 1];
    if (htfLast > htfEmaLast) htfBias = 'BUY';
    else if (htfLast < htfEmaLast) htfBias = 'SELL';
  }

  const bullishTrend =
    latestClose > currentVwap &&
    latestClose > ema21 &&
    (ema21 >= ema50 || rthDisplacement > 0) &&
    rthDisplacement > 0;

  const bearishTrend =
    latestClose < currentVwap &&
    latestClose < ema21 &&
    (ema21 <= ema50 || rthDisplacement < 0) &&
    rthDisplacement < 0;

  if (bullishTrend) {
    return {
      direction: 'BUY',
      rthDisplacement,
      vwap: currentVwap,
      ema21,
      ema50,
      htfAligned: htfBias === 'BUY',
    };
  }

  if (bearishTrend) {
    return {
      direction: 'SELL',
      rthDisplacement,
      vwap: currentVwap,
      ema21,
      ema50,
      htfAligned: htfBias === 'SELL',
    };
  }

  return null;
}

export class TraxoPowerHourMocStrategy implements ITraxoStrategy {
  readonly id = 'traxo_power_hour_moc';
  readonly name = 'TRAXO Power Hour MOC';
  readonly market = 'FUTURES' as const;
  readonly supportedSymbols = FUTURES_SUPPORTED_SYMBOLS;
  readonly optimalTimeframes = ['5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedFuturesSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!hasValidCandles(context.candles, 20)) return null;

    const latest = context.candles[context.candles.length - 1];
    const prev = context.candles[context.candles.length - 2];
    const clock = resolveNyClock(context, latest);
    if (!clock) return null;

    // Active strictly during Market-on-Close Power Hour window (15:30 - 16:00 ET)
    if (clock.nyMinutesOfDay < MOC_START_MINUTES || clock.nyMinutesOfDay >= MOC_END_MINUTES) {
      return null;
    }

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const trend = assessDailyTrend(context.candles, clock, context.higherTimeframeCandles);
    if (!trend) return null;

    // Require minimum daily displacement (>= 0.5x ATR) so chop days are filtered out
    if (Math.abs(trend.rthDisplacement) < atr * 0.5) return null;

    const barRange = latest.high - latest.low;
    if (barRange <= 0) return null;
    const closePosition = (latest.close - latest.low) / barRange;

    // Trigger bar must confirm late-day momentum continuation in prevailing trend direction
    if (trend.direction === 'BUY') {
      const bullCandle = latest.close > latest.open && closePosition >= 0.55;
      const momentumFollowThrough = latest.close >= prev.close;
      if (!bullCandle || !momentumFollowThrough) return null;
    } else {
      const bearCandle = latest.close < latest.open && closePosition <= 0.45;
      const momentumFollowThrough = latest.close <= prev.close;
      if (!bearCandle || !momentumFollowThrough) return null;
    }

    const entryPrice = context.currentPrice ?? latest.close;
    const stopBuffer = Math.max(2.0, atr * 0.25);
    const recentSlice = context.candles.slice(-4);
    const rvol = calculateRVOL(context.candles, 20);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    if (trend.direction === 'BUY') {
      const recentLow = Math.min(...recentSlice.map((c) => c.low));
      const candidateSl = Math.min(recentLow - stopBuffer, trend.ema21 - stopBuffer);
      slPrice = Math.max(candidateSl, entryPrice - atr * 2.2);
      if (slPrice >= entryPrice - atr * 0.5) {
        slPrice = entryPrice - Math.max(stopBuffer * 2, atr * 0.9);
      }
      const risk = entryPrice - slPrice;
      tp1Price = entryPrice + risk * 1.5;
      tp2Price = entryPrice + risk * 2.5;
    } else {
      const recentHigh = Math.max(...recentSlice.map((c) => c.high));
      const candidateSl = Math.max(recentHigh + stopBuffer, trend.ema21 + stopBuffer);
      slPrice = Math.min(candidateSl, entryPrice + atr * 2.2);
      if (slPrice <= entryPrice + atr * 0.5) {
        slPrice = entryPrice + Math.max(stopBuffer * 2, atr * 0.9);
      }
      const risk = slPrice - entryPrice;
      tp1Price = entryPrice - risk * 1.5;
      tp2Price = entryPrice - risk * 2.5;
    }

    let score = 54;
    const reasons: string[] = [
      `Power Hour MOC window (15:30-16:00 ET) active`,
      `Prevailing daily trend confirmed ${trend.direction === 'BUY' ? 'BULLISH' : 'BEARISH'} (RTH net ${trend.rthDisplacement >= 0 ? '+' : ''}${trend.rthDisplacement.toFixed(2)} pts vs VWAP ${trend.vwap.toFixed(2)})`,
      `MOC momentum continuation bar closed in trend direction`,
    ];

    if (
      (trend.direction === 'BUY' && trend.ema21 > trend.ema50) ||
      (trend.direction === 'SELL' && trend.ema21 < trend.ema50)
    ) {
      score += 12;
      reasons.push('EMA 21/50 trend stack aligned for closing imbalance push');
    }

    if (rvol >= 1.25) {
      score += 12;
      reasons.push(`Elevated closing imbalance volume (RVOL ${rvol.toFixed(2)}x)`);
    }

    if (trend.htfAligned) {
      score += 10;
      reasons.push('Higher-timeframe EMA trend aligned with daily MOC direction');
    }

    if (Math.abs(trend.rthDisplacement) >= atr * 2.0) {
      score += 8;
      reasons.push('Strong directional trend day supports late-day MOC follow-through');
    }

    return buildFuturesSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction: trend.direction,
      rawScore: Math.min(98, score),
      entryType: 'MARKET',
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        rthDisplacement: Number(trend.rthDisplacement.toFixed(2)),
        vwap: Number(trend.vwap.toFixed(2)),
        ema21: Number(trend.ema21.toFixed(2)),
        ema50: Number(trend.ema50.toFixed(2)),
        htfAligned: trend.htfAligned,
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(2)),
      },
      timestampIso: clock.utcDate.toISOString(),
    });
  }
}

export const traxoPowerHourMoc = new TraxoPowerHourMocStrategy();
