/**
 * TRAXO Order Block — Regime Engine
 *
 * Calculates ATR14 (exported for use by the orchestrator), ATR SMA, and classifies
 * the current market regime (TRENDING / RANGING / EXPANDING / CONTRACTING).
 */

import { REGIME_SWING_LOOKBACK, REGIME_ATR_SMA_PERIOD, AMD_ACCUMULATION_RANGE_MULTIPLIER } from '../strategyConfig'
import { detectSwingHighs, detectSwingLows } from './liquidityEngine'
import type { OBCandle, MarketRegime } from './types'

// ─────────────────────────────────────────────
// ATR Calculation (standard Wilder smoothing)
// ─────────────────────────────────────────────

/**
 * Calculates ATR(14) for the given candle series using Wilder's smoothing.
 * Returns an array of the same length as `candles`; indices 0–13 are NaN while
 * warming up.
 *
 * Exported so the orchestrator can call it once and reuse across all engines.
 */
export function calcATR14(candles: OBCandle[]): number[] {
  const result: number[] = new Array(candles.length).fill(NaN)
  if (candles.length < 14) return result

  // Seed: simple average of first 14 TRs
  let sum = 0
  for (let i = 1; i <= 13; i++) {
    const c = candles[i]
    const prev = candles[i - 1]
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
    sum += tr
  }
  result[13] = sum / 13

  for (let i = 14; i < candles.length; i++) {
    const c = candles[i]
    const prev = candles[i - 1]
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
    result[i] = (result[i - 1] * 13 + tr) / 14
  }

  return result
}

// ─────────────────────────────────────────────
// ATR SMA
// ─────────────────────────────────────────────

/**
 * Simple moving average of ATR14 over the last `period` valid (non-NaN) values.
 */
export function calcATRSMA(atr_series: number[], period: number = REGIME_ATR_SMA_PERIOD): number {
  const valid = atr_series.filter((v) => !isNaN(v))
  if (valid.length < period) {
    return valid.length > 0 ? valid.at(-1)! : 0
  }
  const slice = valid.slice(-period)
  return slice.reduce((acc, v) => acc + v, 0) / slice.length
}

// ─────────────────────────────────────────────
// Regime Classification
// ─────────────────────────────────────────────

/**
 * Classifies the current market regime by combining:
 * - ATR14 trend vs its SMA (expanding / contracting)
 * - Recent swing structure (trending vs ranging)
 *
 * Priority:
 * 1. If ATR14 > SMA × 1.2  → EXPANDING
 * 2. If ATR14 < SMA × 0.8  → CONTRACTING
 * 3. If swing highs are consistently HH and swing lows are consistently HL → TRENDING
 * 4. Otherwise             → RANGING
 */
export function detectMarketRegime(
  candles: OBCandle[],
  atr14: number,
  swing_high_indices: number[],
  swing_low_indices: number[],
): MarketRegime {
  const atrSeries = calcATR14(candles)
  const atrSma = calcATRSMA(atrSeries)

  if (atrSma > 0) {
    if (atr14 > atrSma * 1.2) return 'EXPANDING'
    if (atr14 < atrSma * 0.8) return 'CONTRACTING'
  }

  // Swing structure: look at last REGIME_SWING_LOOKBACK pivot highs and lows
  const recentHighs = swing_high_indices
    .slice(-REGIME_SWING_LOOKBACK)
    .map((i) => candles[i].high)
  const recentLows = swing_low_indices
    .slice(-REGIME_SWING_LOOKBACK)
    .map((i) => candles[i].low)

  const isHigherHighs =
    recentHighs.length >= 2 &&
    recentHighs.every((h, i) => i === 0 || h > recentHighs[i - 1])

  const isHigherLows =
    recentLows.length >= 2 &&
    recentLows.every((l, i) => i === 0 || l > recentLows[i - 1])

  const isLowerHighs =
    recentHighs.length >= 2 &&
    recentHighs.every((h, i) => i === 0 || h < recentHighs[i - 1])

  const isLowerLows =
    recentLows.length >= 2 &&
    recentLows.every((l, i) => i === 0 || l < recentLows[i - 1])

  // Check for range-bound: recent high-low range fits within ATR multiple
  const recentCandles = candles.slice(-20)
  const rangeHigh = Math.max(...recentCandles.map((c) => c.high))
  const rangeLow = Math.min(...recentCandles.map((c) => c.low))
  if (rangeHigh - rangeLow < atr14 * AMD_ACCUMULATION_RANGE_MULTIPLIER) return 'RANGING'

  if ((isHigherHighs && isHigherLows) || (isLowerHighs && isLowerLows)) return 'TRENDING'

  return 'RANGING'
}

// ─────────────────────────────────────────────
// Convenience builder
// ─────────────────────────────────────────────

/**
 * Full regime state for a candle series: calculates ATR, swing indices, and regime.
 */
export function buildRegimeState(candles: OBCandle[]): {
  atr14: number
  atr_series: number[]
  atr_sma: number
  swing_high_indices: number[]
  swing_low_indices: number[]
  regime: MarketRegime
} {
  const atr_series = calcATR14(candles)
  const atr14 = atr_series.filter((v) => !isNaN(v)).at(-1) ?? 0
  const atr_sma = calcATRSMA(atr_series)
  const swing_high_indices = detectSwingHighs(candles)
  const swing_low_indices = detectSwingLows(candles)
  const regime = detectMarketRegime(candles, atr14, swing_high_indices, swing_low_indices)

  return { atr14, atr_series, atr_sma, swing_high_indices, swing_low_indices, regime }
}
