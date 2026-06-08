/**
 * TRAXO Order Block — Displacement Engine
 *
 * Measures the displacement move that created an order block and classifies it.
 */

import { DISPLACEMENT_STRONG_ATR, DISPLACEMENT_MEDIUM_ATR } from '../strategyConfig'
import type { OBCandle, DisplacementResult, DisplacementQuality } from './types'

// ─────────────────────────────────────────────
// Measurement
// ─────────────────────────────────────────────

/**
 * Measures the displacement starting at `impulse_idx` (the first candle of the
 * impulse move) and looking forward until momentum wanes.
 *
 * - `size_atr`            — body size of the impulse candle / ATR14
 * - `body_dominance`      — body / full candle range (0–1)
 * - `consecutive_candles` — how many consecutive same-direction closes follow
 */
export function measureDisplacement(
  candles: OBCandle[],
  impulse_idx: number,
  atr14: number,
): DisplacementResult {
  if (impulse_idx < 0 || impulse_idx >= candles.length || atr14 <= 0) {
    return { quality: 'WEAK', size_atr: 0, body_dominance: 0, consecutive_candles: 1 }
  }

  const impulse = candles[impulse_idx]
  const body = Math.abs(impulse.close - impulse.open)
  const range = impulse.high - impulse.low
  const size_atr = atr14 > 0 ? body / atr14 : 0
  const body_dominance = range > 0 ? body / range : 0

  const isBullish = impulse.close > impulse.open
  let consecutive_candles = 1

  for (let i = impulse_idx + 1; i < candles.length; i++) {
    const c = candles[i]
    const sameDirection = isBullish ? c.close > c.open : c.close < c.open
    if (sameDirection) {
      consecutive_candles++
    } else {
      break
    }
  }

  const quality = classifyDisplacement(size_atr, body_dominance)

  return { quality, size_atr, body_dominance, consecutive_candles }
}

// ─────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────

/**
 * Classifies displacement quality by ATR-normalised body size and body dominance.
 *
 * STRONG : size_atr ≥ 1.5  AND body_dominance ≥ 0.70
 * MEDIUM : size_atr ≥ 0.8  AND body_dominance ≥ 0.50
 * WEAK   : everything else
 */
export function classifyDisplacement(
  size_atr: number,
  body_dominance: number,
): DisplacementQuality {
  if (size_atr >= DISPLACEMENT_STRONG_ATR && body_dominance >= 0.70) return 'STRONG'
  if (size_atr >= DISPLACEMENT_MEDIUM_ATR && body_dominance >= 0.50) return 'MEDIUM'
  return 'WEAK'
}
