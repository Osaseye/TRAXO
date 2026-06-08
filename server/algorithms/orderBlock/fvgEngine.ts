/**
 * TRAXO Order Block — FVG Engine
 *
 * Detects Fair Value Gaps, grades them, checks fill status, and finds
 * Liquidity Voids.
 */

import {
  FVG_MIN_SIZE_ATR,
  FVG_NORMAL_ATR,
  FVG_INSTITUTIONAL_ATR,
  LIQUIDITY_VOID_MIN_CANDLES,
} from '../strategyConfig'
import type { OBCandle, FVG, FVGGrade, LiquidityVoid, OrderBlock } from './types'

// ─────────────────────────────────────────────
// Fair Value Gap Detection
// ─────────────────────────────────────────────

/**
 * Scans the candle series for 3-candle FVGs in both directions.
 *
 * Bullish FVG : C1.high < C3.low  → gap between C1 top and C3 bottom
 * Bearish FVG : C1.low  > C3.high → gap between C1 bottom and C3 top
 *
 * Gaps smaller than `FVG_MIN_SIZE_ATR` × ATR14 are ignored.
 */
export function detectFVG(candles: OBCandle[], atr14: number): FVG[] {
  const fvgs: FVG[] = []
  const minSize = FVG_MIN_SIZE_ATR * atr14

  for (let i = 0; i < candles.length - 2; i++) {
    const c1 = candles[i]
    const c3 = candles[i + 2]

    // Bullish FVG
    if (c3.low > c1.high) {
      const size = c3.low - c1.high
      if (size >= minSize) {
        const grade = gradeFVG(size, atr14)
        if (grade !== null) {
          fvgs.push({
            high: c3.low,
            low: c1.high,
            size_atr: size / atr14,
            grade,
            direction: 'BULLISH',
            candle_index: i + 1, // middle candle
            filled: false,
          })
        }
      }
    }

    // Bearish FVG
    if (c1.low > c3.high) {
      const size = c1.low - c3.high
      if (size >= minSize) {
        const grade = gradeFVG(size, atr14)
        if (grade !== null) {
          fvgs.push({
            high: c1.low,
            low: c3.high,
            size_atr: size / atr14,
            grade,
            direction: 'BEARISH',
            candle_index: i + 1,
            filled: false,
          })
        }
      }
    }
  }

  return fvgs
}

// ─────────────────────────────────────────────
// FVG Grading
// ─────────────────────────────────────────────

/**
 * Returns the grade for a gap of `size` (absolute price) vs ATR14.
 *
 * INSTITUTIONAL : size_atr ≥ 1.00
 * NORMAL        : size_atr ≥ 0.25
 * MICRO         : size_atr ≥ 0.10
 * null          : below minimum threshold
 */
export function gradeFVG(size: number, atr14: number): FVGGrade | null {
  if (atr14 <= 0) return null
  const ratio = size / atr14
  if (ratio >= FVG_INSTITUTIONAL_ATR) return 'INSTITUTIONAL'
  if (ratio >= FVG_NORMAL_ATR) return 'NORMAL'
  if (ratio >= FVG_MIN_SIZE_ATR) return 'MICRO'
  return null
}

// ─────────────────────────────────────────────
// Fill Check
// ─────────────────────────────────────────────

/**
 * Returns true if any candle in `candles_after` has traded through the FVG
 * (i.e. price has re-entered the gap zone).
 *
 * Bullish FVG filled when a candle's high drops into the gap from above.
 * Bearish FVG filled when a candle's low rises into the gap from below.
 */
export function isFVGFilled(fvg: FVG, candles_after: OBCandle[]): boolean {
  for (const c of candles_after) {
    if (fvg.direction === 'BULLISH' && c.low <= fvg.high) return true
    if (fvg.direction === 'BEARISH' && c.high >= fvg.low) return true
  }
  return false
}

// ─────────────────────────────────────────────
// FVG Adjacent to OB
// ─────────────────────────────────────────────

/**
 * Finds the FVG immediately following the order block impulse candle.
 * "Adjacent" means the FVG's middle candle index is ob_candle_index + 1 or +2.
 */
export function findAdjacentFVG(ob: OrderBlock, fvgs: FVG[]): FVG | null {
  for (const fvg of fvgs) {
    if (
      fvg.candle_index >= ob.ob_candle_index + 1 &&
      fvg.candle_index <= ob.ob_candle_index + 3
    ) {
      return fvg
    }
  }
  return null
}

// ─────────────────────────────────────────────
// Liquidity Void
// ─────────────────────────────────────────────

/**
 * Detects a Liquidity Void — a sequence of at least `LIQUIDITY_VOID_MIN_CANDLES`
 * consecutive candles moving strongly in one direction with no opposing wick
 * overlap (price moved so fast it left an unfilled void).
 *
 * Looks forward from `start_idx`.
 */
export function detectLiquidityVoid(
  candles: OBCandle[],
  start_idx: number,
  direction: 'BULLISH' | 'BEARISH',
): LiquidityVoid | null {
  if (start_idx < 0 || start_idx >= candles.length) return null

  let end_idx = start_idx
  let voidHigh = candles[start_idx].high
  let voidLow = candles[start_idx].low

  for (let i = start_idx + 1; i < candles.length; i++) {
    const c = candles[i]
    const prevC = candles[i - 1]

    // Check for gap (no overlap between consecutive candles)
    if (direction === 'BULLISH') {
      if (c.low <= prevC.high) break // overlap — void ends
      voidHigh = Math.max(voidHigh, c.high)
      end_idx = i
    } else {
      if (c.high >= prevC.low) break
      voidLow = Math.min(voidLow, c.low)
      end_idx = i
    }
  }

  const candle_count = end_idx - start_idx + 1
  if (candle_count < LIQUIDITY_VOID_MIN_CANDLES) return null

  return {
    start_idx,
    end_idx,
    candle_count,
    direction,
    zone_high: voidHigh,
    zone_low: voidLow,
  }
}
