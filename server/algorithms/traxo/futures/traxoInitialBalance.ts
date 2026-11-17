/**
 * TRAXO Initial Balance — IB (09:30-10:30 ET) Breakout & Retest Engine
 *
 * Identifies the 1-hour Initial Balance range (09:30-10:30 ET), waits for
 * a clean directional expansion outside the IB boundary, and enters on the
 * first pullback touch back to the broken IB High or IB Low.
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

export interface InitialBalanceSummary {
  high: number;
  low: number;
  mid: number;
  range: number;
  candleCount: number;
  endIndex: number;
}

const IB_START_MINUTES = 9 * 60 + 30; // 09:30 ET
const IB_END_MINUTES = 10 * 60 + 30; // 10:30 ET
const SESSION_END_MINUTES = 15 * 60 + 30; // 15:30 ET

/**
 * Extracts the 09:30-10:30 ET Initial Balance range for the active NY session date.
 */
export function extractInitialBalance(
  candles: TraxoCandle[],
  clock: NyClockSnapshot
): InitialBalanceSummary | null {
  let high = -Infinity;
  let low = Infinity;
  let candleCount = 0;
  let endIndex = -1;

  for (let i = 0; i < candles.length; i++) {
    const ny = toNyClock(candles[i].timestamp);
    if (!ny || ny.nyDateKey !== clock.nyDateKey) continue;
    if (ny.nyMinutesOfDay >= IB_START_MINUTES && ny.nyMinutesOfDay < IB_END_MINUTES) {
      if (candles[i].high > high) high = candles[i].high;
      if (candles[i].low < low) low = candles[i].low;
      candleCount++;
      endIndex = i;
    }
  }

  if (candleCount < 4) return null;

  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) return null;

  return {
    high,
    low,
    mid: (high + low) / 2,
    range,
    candleCount,
    endIndex,
  };
}

export class TraxoInitialBalanceStrategy implements ITraxoStrategy {
  readonly id = 'traxo_initial_balance';
  readonly name = 'TRAXO Initial Balance';
  readonly market = 'FUTURES' as const;
  readonly supportedSymbols = FUTURES_SUPPORTED_SYMBOLS;
  readonly optimalTimeframes = ['5m', '15m'];

  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null {
    if (context.newsBlackout) return null;
    if (!isSupportedFuturesSymbol(context.symbol, this.supportedSymbols)) return null;
    if (!hasValidCandles(context.candles, 12)) return null;

    const latest = context.candles[context.candles.length - 1];
    const clock = resolveNyClock(context, latest);
    if (!clock) return null;

    // Must be after 10:30 ET IB completion and before 15:30 ET Power Hour
    if (
      clock.nyMinutesOfDay < IB_END_MINUTES ||
      clock.nyMinutesOfDay >= SESSION_END_MINUTES
    ) {
      return null;
    }

    const ib = extractInitialBalance(context.candles, clock);
    if (!ib || ib.endIndex >= context.candles.length - 2) return null;

    const atrSeries = calculateATR(context.candles, 14);
    const atr = atrSeries[atrSeries.length - 1];
    if (!Number.isFinite(atr) || atr <= 0) return null;

    const minExpansion = Math.max(atr * 0.25, ib.range * 0.08);
    const touchTolerance = Math.max(2.0, atr * 0.25);
    const penetrationAllowance = Math.max(atr * 0.45, ib.range * 0.2);
    const closeSlippage = Math.max(1.5, atr * 0.15);

    const lastIdx = context.candles.length - 1;

    // Find first clean post-IB bullish or bearish expansion prior to latest
    let bullExpansionIdx = -1;
    let bullExpansionPeak = -Infinity;
    let bearExpansionIdx = -1;
    let bearExpansionTrough = Infinity;

    for (let i = ib.endIndex + 1; i < lastIdx; i++) {
      const bar = context.candles[i];
      if (bullExpansionIdx === -1 && bar.close > ib.high + minExpansion) {
        bullExpansionIdx = i;
      }
      if (bullExpansionIdx !== -1 && bar.high > bullExpansionPeak) {
        bullExpansionPeak = bar.high;
      }

      if (bearExpansionIdx === -1 && bar.close < ib.low - minExpansion) {
        bearExpansionIdx = i;
      }
      if (bearExpansionIdx !== -1 && bar.low < bearExpansionTrough) {
        bearExpansionTrough = bar.low;
      }
    }

    let direction: 'BUY' | 'SELL' | null = null;
    let expansionExtreme = 0;
    let expansionBars = 0;

    // Check Bullish IB Breakout -> First Pullback Touch to IB High
    if (bullExpansionIdx !== -1) {
      let alreadyRetested = false;
      for (let j = bullExpansionIdx + 1; j < lastIdx; j++) {
        if (context.candles[j].low <= ib.high + touchTolerance) {
          alreadyRetested = true;
          break;
        }
      }

      const touchesIbHigh =
        latest.low <= ib.high + touchTolerance && latest.low >= ib.high - penetrationAllowance;
      const holdsAboveIbHigh = latest.close >= ib.high - closeSlippage;
      const barRange = latest.high - latest.low;
      const lowerWick = Math.min(latest.open, latest.close) - latest.low;
      const bullConfirm =
        latest.close >= latest.open ||
        (barRange > 0 && lowerWick / barRange >= 0.35 && latest.close >= ib.high);

      if (!alreadyRetested && touchesIbHigh && holdsAboveIbHigh && bullConfirm) {
        direction = 'BUY';
        expansionExtreme = bullExpansionPeak;
        expansionBars = lastIdx - bullExpansionIdx;
      }
    }

    // Check Bearish IB Breakout -> First Pullback Touch to IB Low
    if (!direction && bearExpansionIdx !== -1) {
      let alreadyRetested = false;
      for (let j = bearExpansionIdx + 1; j < lastIdx; j++) {
        if (context.candles[j].high >= ib.low - touchTolerance) {
          alreadyRetested = true;
          break;
        }
      }

      const touchesIbLow =
        latest.high >= ib.low - touchTolerance && latest.high <= ib.low + penetrationAllowance;
      const holdsBelowIbLow = latest.close <= ib.low + closeSlippage;
      const barRange = latest.high - latest.low;
      const upperWick = latest.high - Math.max(latest.open, latest.close);
      const bearConfirm =
        latest.close <= latest.open ||
        (barRange > 0 && upperWick / barRange >= 0.35 && latest.close <= ib.low);

      if (!alreadyRetested && touchesIbLow && holdsBelowIbLow && bearConfirm) {
        direction = 'SELL';
        expansionExtreme = bearExpansionTrough;
        expansionBars = lastIdx - bearExpansionIdx;
      }
    }

    if (!direction) return null;

    const entryPrice = context.currentPrice ?? latest.close;
    const stopBuffer = Math.max(2.5, atr * 0.3);
    const rvol = calculateRVOL(context.candles, 20);

    let slPrice: number;
    let tp1Price: number;
    let tp2Price: number;

    if (direction === 'BUY') {
      slPrice = Math.min(latest.low - stopBuffer, ib.high - Math.max(stopBuffer, ib.range * 0.25));
      const risk = entryPrice - slPrice;
      if (risk <= 0) return null;
      tp1Price = Math.max(expansionExtreme, entryPrice + risk * 1.6);
      tp2Price = Math.max(ib.high + ib.range, tp1Price + risk * 0.9);
    } else {
      slPrice = Math.max(latest.high + stopBuffer, ib.low + Math.max(stopBuffer, ib.range * 0.25));
      const risk = slPrice - entryPrice;
      if (risk <= 0) return null;
      tp1Price = Math.min(expansionExtreme, entryPrice - risk * 1.6);
      tp2Price = Math.min(ib.low - ib.range, tp1Price - risk * 0.9);
    }

    let score = 54;
    const reasons: string[] = [
      `Initial Balance (09:30-10:30 ET) defined (${ib.low.toFixed(2)} - ${ib.high.toFixed(2)}, ${ib.range.toFixed(2)} pts)`,
      direction === 'BUY'
        ? `Clean expansion above IB High (${expansionExtreme.toFixed(2)}) followed by first pullback touch to ${ib.high.toFixed(2)}`
        : `Clean expansion below IB Low (${expansionExtreme.toFixed(2)}) followed by first pullback touch to ${ib.low.toFixed(2)}`,
    ];

    const expansionDist =
      direction === 'BUY' ? expansionExtreme - ib.high : ib.low - expansionExtreme;
    if (expansionDist >= atr * 0.8) {
      score += 14;
      reasons.push(`Strong pre-retest displacement (${expansionDist.toFixed(2)} pts beyond IB boundary)`);
    } else {
      score += 6;
    }

    if (
      (direction === 'BUY' && latest.close > latest.open && latest.close > ib.high) ||
      (direction === 'SELL' && latest.close < latest.open && latest.close < ib.low)
    ) {
      score += 12;
      reasons.push('Confirmed defense candle closing back in expansion direction');
    }

    if (rvol >= 1.15) {
      score += 8;
      reasons.push(`Supportive retest volume (RVOL ${rvol.toFixed(2)}x)`);
    }

    if (clock.nyMinutesOfDay <= 12 * 60) {
      score += 6;
      reasons.push('Morning IB expansion-retest timing');
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
        ibHigh: Number(ib.high.toFixed(2)),
        ibLow: Number(ib.low.toFixed(2)),
        ibRange: Number(ib.range.toFixed(2)),
        expansionExtreme: Number(expansionExtreme.toFixed(2)),
        expansionBars,
        rvol: Number(rvol.toFixed(2)),
        atr: Number(atr.toFixed(2)),
      },
      timestampIso: clock.utcDate.toISOString(),
    });
  }
}

export const traxoInitialBalance = new TraxoInitialBalanceStrategy();
