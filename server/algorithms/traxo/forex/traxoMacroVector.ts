/**
 * TRAXO Macro Vector — Multi-Timeframe Trend Alignment Engine
 *
 * Aligns Higher-Timeframe (H1/H4/D1) institutional trend via EMA 21 / 50 / 200
 * ribbon stacking, then triggers precision M15 pullback entries when price
 * retraces into the M15 dynamic EMA 21/50 value zone and resumes in trend.
 */

import { calculateATR, calculateEMA, calculateRVOL } from '../indicators';
import type { ITraxoStrategy, TraxoSignalResult, TraxoStrategyContext } from '../types';
import {
  buildForexSignal,
  FOREX_ALL_SYMBOLS,
  getForexPipSize,
  isSupportedForexSymbol,
  normalizeTimeframe,
  parseUtcDate,
} from './forexUtils';

export interface HtfTrendAlignment {
  direction: 'BUY' | 'SELL';
  ema21: number;
  ema50: number;
  ema200: number;
  expanding: boolean;
}

/**
 * Evaluates Higher-Timeframe EMA 21 / 50 / 200 trend alignment.
 */
export function evaluateHtfEmaStack(
  higherTimeframeCandles: TraxoStrategyContext['higherTimeframeCandles']
): HtfTrendAlignment | null {
  if (!higherTimeframeCandles || higherTimeframeCandles.length < 200) return null;

  const htfCloses = higherTimeframeCandles.map((c) => c.close);
  const ema21Arr = calculateEMA(htfCloses, 21);
  const ema50Arr = calculateEMA(htfCloses, 50);
  const ema200Arr = calculateEMA(htfCloses, 200);

  const idx = htfCloses.length - 1;
  const ema21 = ema21Arr[idx];
  const ema50 = ema50Arr[idx];
  const ema200 = ema200Arr[idx];
  const prevEma21 = ema21Arr[idx - 1];
  const prevEma50 = ema50Arr[idx - 1];
  const lastClose = htfCloses[idx];

  if (
    !Number.isFinite(ema21) ||
    !Number.isFinite(ema50) ||
    !Number.isFinite(ema200)
  ) {
    return null;
  }

  if (ema21 > ema50 && ema50 > ema200 && lastClose > ema50) {
    const expanding = ema21 - ema50 > prevEma21 - prevEma50;
    return { direction: 'BUY', ema21, ema50, ema200, expanding };
  }

  if (ema21 < ema50 && ema50 < ema200 && lastClose < ema50) {
    const expanding = ema50 - ema21 > prevEma50 - prevEma21;
    return { direction: 'SELL', ema21, ema50, ema200, expanding };
  }

  return null;
}

export class TraxoMacroVectorStrategy implements ITraxoStrategy {
  readonly id = 'traxo_macro_vector';
  readonly name = 'TRAXO Macro Vector';
  readonly market = 'FOREX' as const;
  readonly supportedSymbols = FOREX_ALL_SYMBOLS;
  readonly optimalTimeframes = ['15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedForexSymbol(context.symbol, this.supportedSymbols)) return null;
    if (normalizeTimeframe(context.timeframe) !== '15m') return null;
    if (!context.candles || context.candles.length < 55) return null;

    const htf = evaluateHtfEmaStack(context.higherTimeframeCandles);
    if (!htf) return null;

    const m15Closes = context.candles.map((c) => c.close);
    const m15Ema21Arr = calculateEMA(m15Closes, 21);
    const m15Ema50Arr = calculateEMA(m15Closes, 50);
    const atrSeries = calculateATR(context.candles, 14);

    const lastIdx = context.candles.length - 1;
    const latest = context.candles[lastIdx];
    const prev = context.candles[lastIdx - 1];
    const m15Ema21 = m15Ema21Arr[lastIdx];
    const m15Ema50 = m15Ema50Arr[lastIdx];
    const atr = atrSeries[lastIdx];

    if (!Number.isFinite(atr) || atr <= 0) return null;

    const range = latest.high - latest.low;
    if (range <= 0) return null;
    const bodyRatio = Math.abs(latest.close - latest.open) / range;

    const recentWindow = context.candles.slice(-4);
    let pullbackLow = Infinity;
    let pullbackHigh = -Infinity;
    for (const c of recentWindow) {
      if (c.low < pullbackLow) pullbackLow = c.low;
      if (c.high > pullbackHigh) pullbackHigh = c.high;
    }

    const pipSize = getForexPipSize(context.symbol);
    const rvol = calculateRVOL(context.candles, 20);
    const entryPrice = context.currentPrice ?? latest.close;

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;
    let cleanZoneTouch: boolean;
    let ltfStacked: boolean;

    if (htf.direction === 'BUY') {
      // M15 pullback dipped into/near EMA21-EMA50 value zone without invalidating EMA50
      const touchedPullbackZone =
        pullbackLow <= m15Ema21 + atr * 0.35 && pullbackLow >= m15Ema50 - atr * 0.75;
      const structureIntact = latest.close > m15Ema50 - atr * 0.2;
      const resumptionConfirmed =
        latest.close > latest.open &&
        latest.close > m15Ema21 &&
        (latest.close > prev.high || bodyRatio >= 0.45);

      if (!touchedPullbackZone || !structureIntact || !resumptionConfirmed) return null;

      cleanZoneTouch = pullbackLow <= m15Ema21 && pullbackLow >= m15Ema50;
      ltfStacked = m15Ema21 > m15Ema50;

      const minStopDist = Math.max(pipSize * 8, atr * 0.8);
      const rawSl = Math.min(pullbackLow - atr * 0.3, m15Ema50 - atr * 0.35);
      slPrice = Math.min(rawSl, entryPrice - minStopDist);
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;

      tp1Price = entryPrice + risk * 1.8;
      tp2Price = entryPrice + risk * 3.0;
    } else {
      const touchedPullbackZone =
        pullbackHigh >= m15Ema21 - atr * 0.35 && pullbackHigh <= m15Ema50 + atr * 0.75;
      const structureIntact = latest.close < m15Ema50 + atr * 0.2;
      const resumptionConfirmed =
        latest.close < latest.open &&
        latest.close < m15Ema21 &&
        (latest.close < prev.low || bodyRatio >= 0.45);

      if (!touchedPullbackZone || !structureIntact || !resumptionConfirmed) return null;

      cleanZoneTouch = pullbackHigh >= m15Ema21 && pullbackHigh <= m15Ema50;
      ltfStacked = m15Ema21 < m15Ema50;

      const minStopDist = Math.max(pipSize * 8, atr * 0.8);
      const rawSl = Math.max(pullbackHigh + atr * 0.3, m15Ema50 + atr * 0.35);
      slPrice = Math.max(rawSl, entryPrice + minStopDist);
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;

      tp1Price = entryPrice - risk * 1.8;
      tp2Price = entryPrice - risk * 3.0;
    }

    let score = 50;
    const reasons: string[] = [
      `HTF ${htf.direction === 'BUY' ? 'bullish' : 'bearish'} EMA 21/50/200 macro vector aligned`,
      `M15 pullback into EMA 21/50 dynamic zone confirmed with trend resumption candle`,
    ];

    if (ltfStacked) {
      score += 15;
      reasons.push('M15 EMA 21/50 stacked in lockstep with HTF vector');
    }
    if (htf.expanding) {
      score += 12;
      reasons.push('HTF EMA 21/50 momentum ribbon expanding');
    }
    if (cleanZoneTouch) {
      score += 10;
      reasons.push('Clean retracement directly into M15 EMA 21-50 institutional value pocket');
    }
    if (rvol >= 1.15) {
      score += 10;
      reasons.push(`Trend resumption volume confirmed (RVOL ${rvol.toFixed(2)}x)`);
    }

    const parsedTs = parseUtcDate(latest.timestamp) ?? new Date();

    return buildForexSignal({
      strategyId: this.id,
      strategyName: this.name,
      symbol: context.symbol,
      timeframe: context.timeframe,
      direction: htf.direction,
      rawScore: Math.min(98, score),
      entryType: 'MARKET',
      entryPrice,
      slPrice,
      tp1Price,
      tp2Price,
      reasons,
      metrics: {
        htfEma21: Number(htf.ema21.toFixed(5)),
        htfEma50: Number(htf.ema50.toFixed(5)),
        htfEma200: Number(htf.ema200.toFixed(5)),
        m15Ema21: Number(m15Ema21.toFixed(5)),
        m15Ema50: Number(m15Ema50.toFixed(5)),
        htfExpanding: htf.expanding,
        ltfStacked,
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(5)),
      },
      timestampIso: parsedTs.toISOString(),
    });
  }
}

export const traxoMacroVector = new TraxoMacroVectorStrategy();
