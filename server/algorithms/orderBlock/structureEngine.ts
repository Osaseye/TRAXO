/**
 * TRAXO Order Block — Structure Engine
 *
 * Detects market structure (BOS/CHoCH), swing classification, AMD phase,
 * and price-location helpers.
 */

import {
  BOS_STRONG_DISPLACEMENT_ATR,
  BOS_MEDIUM_DISPLACEMENT_ATR,
  EQ_TOLERANCE_PCT,
  AMD_ACCUMULATION_RANGE_MULTIPLIER,
  AMD_MANIPULATION_PROXIMITY_ATR,
  AMD_NO_BOS_LOOKBACK,
  AMD_DISTRIBUTION_VOLUME_MULTIPLIER,
  AMD_DISTRIBUTION_VOLUME_MULTIPLIER_CRYPTO,
  PROVISIONAL_BOS_ATR_THRESHOLD,
  SWING_LOOKBACK,
} from '../strategyConfig'
import type { AssetType } from '../strategyConfig'
import type {
  OBCandle,
  SwingPoint,
  StructureState,
  AMDPhase,
  BosQuality,
  PriceLocation,
} from './types'

// ─────────────────────────────────────────────
// Swing Detection
// ─────────────────────────────────────────────

/**
 * Detect raw swing highs: candle[i].high is the highest within `lookback` candles
 * on both sides.
 */
function detectRawSwingHighs(candles: OBCandle[], lookback: number = SWING_LOOKBACK): number[] {
  const indices: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const peak = candles[i].high
    let isSwing = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= peak) {
        isSwing = false
        break
      }
    }
    if (isSwing) indices.push(i)
  }
  return indices
}

/**
 * Detect raw swing lows: candle[i].low is the lowest within `lookback` candles
 * on both sides.
 */
function detectRawSwingLows(candles: OBCandle[], lookback: number = SWING_LOOKBACK): number[] {
  const indices: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const trough = candles[i].low
    let isSwing = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= trough) {
        isSwing = false
        break
      }
    }
    if (isSwing) indices.push(i)
  }
  return indices
}

/**
 * Classify swing points as HH/HL (bullish sequence) or LH/LL (bearish sequence).
 * Processes highs and lows together to maintain proper ordering.
 */
export function detectSwingPoints(
  candles: OBCandle[],
  lookback: number = SWING_LOOKBACK,
): SwingPoint[] {
  const highIndices = detectRawSwingHighs(candles, lookback)
  const lowIndices = detectRawSwingLows(candles, lookback)

  // Merge and sort by index
  const merged: { index: number; kind: 'high' | 'low' }[] = [
    ...highIndices.map((i) => ({ index: i, kind: 'high' as const })),
    ...lowIndices.map((i) => ({ index: i, kind: 'low' as const })),
  ].sort((a, b) => a.index - b.index)

  const points: SwingPoint[] = []
  let prevHigh: number | null = null
  let prevLow: number | null = null

  for (const { index, kind } of merged) {
    const candle = candles[index]
    if (kind === 'high') {
      const type = prevHigh === null || candle.high > prevHigh ? 'HH' : 'LH'
      points.push({
        price: candle.high,
        index,
        type,
        swept: false,
        timestamp: candle.timestamp,
      })
      prevHigh = candle.high
    } else {
      const type = prevLow === null || candle.low < prevLow ? 'LL' : 'HL'
      points.push({
        price: candle.low,
        index,
        type,
        swept: false,
        timestamp: candle.timestamp,
      })
      prevLow = candle.low
    }
  }

  return points
}

// ─────────────────────────────────────────────
// BOS / CHoCH Detection
// ─────────────────────────────────────────────

/**
 * Returns the first BOS event — a candle close beyond the last swing high (bullish)
 * or last swing low (bearish).
 */
export function detectBOS(
  candles: OBCandle[],
  swings: SwingPoint[],
): { direction: 'BULLISH' | 'BEARISH'; candle_idx: number; confirmed: boolean } | null {
  if (swings.length === 0) return null

  const lastHigh = swings.filter((s) => s.type === 'HH' || s.type === 'LH').at(-1)
  const lastLow = swings.filter((s) => s.type === 'LL' || s.type === 'HL').at(-1)

  // Search from the most recent swing forward
  const startIdx = swings.at(-1)?.index ?? 0

  for (let i = startIdx + 1; i < candles.length; i++) {
    const c = candles[i]
    if (lastHigh && c.close > lastHigh.price) {
      return { direction: 'BULLISH', candle_idx: i, confirmed: true }
    }
    if (lastLow && c.close < lastLow.price) {
      return { direction: 'BEARISH', candle_idx: i, confirmed: true }
    }
  }

  return null
}

/**
 * Detects a Change of Character (CHoCH) — a BOS in the *opposite* direction of
 * the current structural bias.
 */
export function detectCHoCH(
  candles: OBCandle[],
  swings: SwingPoint[],
  current_bias: 'BULLISH' | 'BEARISH' | 'RANGING',
): boolean {
  if (current_bias === 'RANGING' || swings.length === 0) return false

  const bos = detectBOS(candles, swings)
  if (!bos) return false

  // CHoCH = BOS in opposite direction to current bias
  return (
    (current_bias === 'BULLISH' && bos.direction === 'BEARISH') ||
    (current_bias === 'BEARISH' && bos.direction === 'BULLISH')
  )
}

// ─────────────────────────────────────────────
// BOS Quality Scoring
// ─────────────────────────────────────────────

/**
 * Scores the BOS-creating candle by body size relative to ATR14.
 */
export function scoreBOSQuality(bos_candle: OBCandle, atr14: number): BosQuality {
  if (atr14 <= 0) return 'WEAK'
  const body = Math.abs(bos_candle.close - bos_candle.open)
  const ratio = body / atr14
  if (ratio >= BOS_STRONG_DISPLACEMENT_ATR) return 'STRONG'
  if (ratio >= BOS_MEDIUM_DISPLACEMENT_ATR) return 'MEDIUM'
  return 'WEAK'
}

// ─────────────────────────────────────────────
// Provisional BOS (live price alert)
// ─────────────────────────────────────────────

/**
 * Checks whether the live price is within `PROVISIONAL_BOS_ATR_THRESHOLD` ATR
 * of breaching the last swing level (early warning before close confirmation).
 */
export function monitorProvisionalBOS(
  live_price: number,
  structure_state: StructureState,
  atr14: number,
): { triggered: boolean; direction: 'BULLISH' | 'BEARISH' } | null {
  const threshold = PROVISIONAL_BOS_ATR_THRESHOLD * atr14
  const { last_swing_high, last_swing_low } = structure_state

  if (last_swing_high && live_price >= last_swing_high.price - threshold) {
    return { triggered: true, direction: 'BULLISH' }
  }
  if (last_swing_low && live_price <= last_swing_low.price + threshold) {
    return { triggered: true, direction: 'BEARISH' }
  }

  return null
}

// ─────────────────────────────────────────────
// AMD Phase Detection
// ─────────────────────────────────────────────

/**
 * Classifies the current price action into Accumulation / Manipulation / Distribution
 * using range compression, sweep, and volume signals.
 */
export function detectAMDPhase(
  candles: OBCandle[],
  structure_state: StructureState,
  atr14: number,
  volumeMa20: number,
  assetType: AssetType = 'FOREX',
): AMDPhase {
  if (candles.length < 5) return 'ACCUMULATION'

  const recent = candles.slice(-AMD_NO_BOS_LOOKBACK)
  const currentCandle = candles.at(-1)!

  // Distribution check: strong volume spike + BOS confirmed in prior structure
  if (structure_state.bos_confirmed) {
    const volMultiplier =
      assetType === 'CRYPTO'
        ? AMD_DISTRIBUTION_VOLUME_MULTIPLIER_CRYPTO
        : AMD_DISTRIBUTION_VOLUME_MULTIPLIER

    const recentHighVol = recent.some((c) => c.volume > volumeMa20 * volMultiplier)
    if (recentHighVol) return 'DISTRIBUTION'
  }

  // Manipulation check: price sweeps a liquidity level then reverses
  const { last_swing_high, last_swing_low } = structure_state
  const sweepProximity = AMD_MANIPULATION_PROXIMITY_ATR * atr14

  if (last_swing_high && currentCandle.high > last_swing_high.price - sweepProximity) {
    return 'MANIPULATION'
  }
  if (last_swing_low && currentCandle.low < last_swing_low.price + sweepProximity) {
    return 'MANIPULATION'
  }

  // Accumulation: range-bound, no recent BOS
  const recentHigh = Math.max(...recent.map((c) => c.high))
  const recentLow = Math.min(...recent.map((c) => c.low))
  const range = recentHigh - recentLow
  if (range < atr14 * AMD_ACCUMULATION_RANGE_MULTIPLIER) return 'ACCUMULATION'

  // Default: if BOS not confirmed recently, assume accumulation
  return structure_state.bos_confirmed ? 'DISTRIBUTION' : 'ACCUMULATION'
}

// ─────────────────────────────────────────────
// Price Location
// ─────────────────────────────────────────────

/** Returns the midpoint between two price levels */
export function getEquilibrium(high: number, low: number): number {
  return (high + low) / 2
}

/**
 * Classifies a price relative to a high–low range.
 * - PREMIUM: above equilibrium + EQ_TOLERANCE_PCT × range
 * - DISCOUNT: below equilibrium − EQ_TOLERANCE_PCT × range
 * - EQUILIBRIUM: in between
 */
export function getPriceLocation(price: number, high: number, low: number): PriceLocation {
  const eq = getEquilibrium(high, low)
  const range = high - low
  const band = EQ_TOLERANCE_PCT * range
  if (price > eq + band) return 'PREMIUM'
  if (price < eq - band) return 'DISCOUNT'
  return 'EQUILIBRIUM'
}

// ─────────────────────────────────────────────
// Structure State Builder (convenience)
// ─────────────────────────────────────────────

/**
 * Builds a full StructureState from a candle series.
 * Used by the orchestrator to avoid imperative sequencing at the top level.
 */
export function buildStructureState(candles: OBCandle[], atr14: number): StructureState {
  const swings = detectSwingPoints(candles)

  const lastHH = swings.filter((s) => s.type === 'HH').at(-1) ?? null
  const lastHL = swings.filter((s) => s.type === 'HL').at(-1) ?? null
  const lastLH = swings.filter((s) => s.type === 'LH').at(-1) ?? null
  const lastLL = swings.filter((s) => s.type === 'LL').at(-1) ?? null

  // Infer bias from latest swing pair
  let bias: StructureState['bias'] = 'RANGING'
  if (lastHH && lastHL) bias = 'BULLISH'
  else if (lastLH && lastLL) bias = 'BEARISH'

  const last_swing_high =
    bias === 'BULLISH'
      ? (lastHH ?? null)
      : bias === 'BEARISH'
        ? (lastLH ?? null)
        : (lastHH ?? lastLH ?? null)

  const last_swing_low =
    bias === 'BULLISH'
      ? (lastHL ?? null)
      : bias === 'BEARISH'
        ? (lastLL ?? null)
        : (lastLL ?? lastHL ?? null)

  const bos = detectBOS(candles, swings)
  const bosCandle = bos ? candles[bos.candle_idx] : null
  const bosQuality: BosQuality = bosCandle ? scoreBOSQuality(bosCandle, atr14) : 'WEAK'
  const choch = bos ? detectCHoCH(candles, swings, bias) : false

  return {
    bias,
    last_swing_high,
    last_swing_low,
    bos_confirmed: bos !== null,
    bos_direction: bos?.direction ?? null,
    bos_candle_idx: bos?.candle_idx ?? null,
    bos_quality: bosQuality,
    choch_confirmed: choch,
    current_phase: 'ACCUMULATION', // refined by detectAMDPhase
  }
}
