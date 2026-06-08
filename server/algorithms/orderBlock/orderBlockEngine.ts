/**
 * TRAXO Order Block — Order Block Engine
 *
 * Core engine: detects Bullish/Bearish OBs, Breaker Blocks, Mitigation Blocks,
 * and Rejection Blocks. Validates the four-condition framework (C1–C4).
 */

import {
  OB_EXPIRY_CANDLES_DEFAULT,
  OB_MAX_TAP_COUNT,
  C4_SSL_PROXIMITY_ATR,
  REJECTION_BLOCK_MIN_WICK_ATR,
  REJECTION_BLOCK_MAX_OVERSHOOT_ATR,
} from '../strategyConfig'
import type { AssetType } from '../strategyConfig'
import type {
  OBCandle,
  OrderBlock,
  OBType,
  StructureState,
  LiquidityPool,
} from './types'
import type { Timeframe } from '@/types'

// ─────────────────────────────────────────────
// ID helper
// ─────────────────────────────────────────────

function makeOBId(type: OBType, candle_idx: number, formed_at: string): string {
  return `ob_${type.toLowerCase()}_${candle_idx}_${formed_at}`
}

// ─────────────────────────────────────────────
// Condition C4: Structural Origin
// ─────────────────────────────────────────────

/**
 * C4 passes when the OB candle is near a Sell-Side Liquidity pool (for bullish OB)
 * or Buy-Side Liquidity pool (for bearish OB) — confirming the OB formed at a
 * genuine structural origin point.
 */
export function validateC4(
  ob_candle: OBCandle,
  liquidity_pools: LiquidityPool[],
  atr14: number,
  ob_direction: 'BULLISH' | 'BEARISH',
): boolean {
  const threshold = C4_SSL_PROXIMITY_ATR * atr14
  for (const pool of liquidity_pools) {
    if (ob_direction === 'BULLISH' && (pool.type === 'SSL' || pool.type === 'EQL')) {
      if (Math.abs(ob_candle.low - pool.price) <= threshold) return true
    }
    if (ob_direction === 'BEARISH' && (pool.type === 'BSL' || pool.type === 'EQH')) {
      if (Math.abs(ob_candle.high - pool.price) <= threshold) return true
    }
  }
  return false
}

// ─────────────────────────────────────────────
// Bullish OB Detection
// ─────────────────────────────────────────────

/**
 * Finds the most recent bullish Order Block: the last bearish candle before a
 * bullish impulse that created a BOS.
 *
 * C1 — The OB candle engulfs the prior bearish candle (or is the last bearish before impulse)
 * C2 — A BOS (bullish close beyond last swing high) occurs after the OB
 * C3 — An FVG exists in the candles immediately following the OB (checked by caller)
 * C4 — OB formed near a structural liquidity origin
 */
export function detectBullishOB(
  candles: OBCandle[],
  structure: StructureState,
  liquidity_pools: LiquidityPool[],
  atr14: number,
  timeframe: Timeframe,
): OrderBlock | null {
  if (!structure.bos_confirmed || structure.bos_direction !== 'BULLISH') return null

  const bos_idx = structure.bos_candle_idx ?? candles.length - 1

  // Scan back from BOS for the last bearish candle (OB candidate)
  let ob_idx = -1
  for (let i = bos_idx - 1; i >= Math.max(0, bos_idx - 10); i--) {
    if (candles[i].close < candles[i].open) {
      ob_idx = i
      break
    }
  }

  if (ob_idx === -1) return null

  const ob_candle = candles[ob_idx]

  const c1 = true // last bearish candle before bullish impulse by definition
  const c2 = structure.bos_confirmed && structure.bos_direction === 'BULLISH'
  const c3 = false  // set by orchestrator after FVG detection
  const c4 = validateC4(ob_candle, liquidity_pools, atr14, 'BULLISH')

  return {
    id: makeOBId('BULLISH', ob_idx, ob_candle.timestamp),
    type: 'BULLISH',
    high: ob_candle.high,
    low: ob_candle.low,
    midpoint: (ob_candle.high + ob_candle.low) / 2,
    ob_candle_index: ob_idx,
    tap_count: 0,
    formed_at: ob_candle.timestamp,
    timeframe,
    c1_engulf: c1,
    c2_bos: c2,
    c3_fvg: c3,
    c4_structural_origin: c4,
    all_conditions: c1 && c2 && c3 && c4,
  }
}

// ─────────────────────────────────────────────
// Bearish OB Detection
// ─────────────────────────────────────────────

/**
 * Finds the most recent bearish Order Block: the last bullish candle before a
 * bearish impulse that created a BOS.
 */
export function detectBearishOB(
  candles: OBCandle[],
  structure: StructureState,
  liquidity_pools: LiquidityPool[],
  atr14: number,
  timeframe: Timeframe,
): OrderBlock | null {
  if (!structure.bos_confirmed || structure.bos_direction !== 'BEARISH') return null

  const bos_idx = structure.bos_candle_idx ?? candles.length - 1

  let ob_idx = -1
  for (let i = bos_idx - 1; i >= Math.max(0, bos_idx - 10); i--) {
    if (candles[i].close > candles[i].open) {
      ob_idx = i
      break
    }
  }

  if (ob_idx === -1) return null

  const ob_candle = candles[ob_idx]

  const c1 = true
  const c2 = structure.bos_confirmed && structure.bos_direction === 'BEARISH'
  const c3 = false  // set by orchestrator
  const c4 = validateC4(ob_candle, liquidity_pools, atr14, 'BEARISH')

  return {
    id: makeOBId('BEARISH', ob_idx, ob_candle.timestamp),
    type: 'BEARISH',
    high: ob_candle.high,
    low: ob_candle.low,
    midpoint: (ob_candle.high + ob_candle.low) / 2,
    ob_candle_index: ob_idx,
    tap_count: 0,
    formed_at: ob_candle.timestamp,
    timeframe,
    c1_engulf: c1,
    c2_bos: c2,
    c3_fvg: c3,
    c4_structural_origin: c4,
    all_conditions: c1 && c2 && c3 && c4,
  }
}

// ─────────────────────────────────────────────
// Breaker Block
// ─────────────────────────────────────────────

/**
 * A Breaker Block forms when price closes THROUGH a prior OB zone, invalidating it
 * and converting it into an institutional reference in the opposite direction.
 */
export function detectBreakerBlock(
  ob: OrderBlock,
  candles: OBCandle[],
  timeframe: Timeframe,
): OrderBlock | null {
  for (let i = ob.ob_candle_index + 1; i < candles.length; i++) {
    const c = candles[i]
    if (ob.type === 'BULLISH' && c.close < ob.low) {
      // Bullish OB broken through → becomes bearish breaker
      return {
        ...ob,
        id: makeOBId('BREAKER_BEAR', i, c.timestamp),
        type: 'BREAKER_BEAR',
        formed_at: c.timestamp,
        timeframe,
        tap_count: 0,
      }
    }
    if (ob.type === 'BEARISH' && c.close > ob.high) {
      return {
        ...ob,
        id: makeOBId('BREAKER_BULL', i, c.timestamp),
        type: 'BREAKER_BULL',
        formed_at: c.timestamp,
        timeframe,
        tap_count: 0,
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────
// Mitigation Block
// ─────────────────────────────────────────────

/**
 * Updates the tap_count of an OB when price re-enters the zone.
 * Returns a new OrderBlock with updated tap_count (does not mutate input).
 */
export function detectMitigationBlock(ob: OrderBlock, candles: OBCandle[]): OrderBlock {
  let taps = ob.tap_count
  for (let i = ob.ob_candle_index + 1; i < candles.length; i++) {
    const c = candles[i]
    if (c.low <= ob.high && c.high >= ob.low) {
      taps++
    }
  }
  return { ...ob, tap_count: taps, type: taps > 0 ? 'MITIGATION' : ob.type }
}

// ─────────────────────────────────────────────
// Rejection Block
// ─────────────────────────────────────────────

/**
 * Detects a Rejection Block at EQH/EQL liquidity clusters.
 * Requires: large wick ≥ REJECTION_BLOCK_MIN_WICK_ATR × ATR14,
 *           overshoot ≤ REJECTION_BLOCK_MAX_OVERSHOOT_ATR[asset_type] × ATR14.
 */
export function detectRejectionBlock(
  candles: OBCandle[],
  liquidity_pools: LiquidityPool[],
  atr14: number,
  asset_type: AssetType,
  timeframe: Timeframe,
): OrderBlock | null {
  if (candles.length === 0) return null

  const minWick = REJECTION_BLOCK_MIN_WICK_ATR * atr14
  const maxOvershoot = REJECTION_BLOCK_MAX_OVERSHOOT_ATR[asset_type] * atr14

  // Scan recent candles for qualifying rejection wicks
  const lookback = Math.min(10, candles.length)
  for (let i = candles.length - lookback; i < candles.length; i++) {
    const c = candles[i]
    const upperWick = c.high - Math.max(c.open, c.close)
    const lowerWick = Math.min(c.open, c.close) - c.low

    // Bullish rejection (lower wick)
    if (lowerWick >= minWick) {
      const nearSSL = liquidity_pools.some(
        (p) =>
          (p.type === 'SSL' || p.type === 'EQL') &&
          Math.abs(c.low - p.price) <= maxOvershoot,
      )
      if (nearSSL) {
        return {
          id: makeOBId('REJECTION', i, c.timestamp),
          type: 'REJECTION',
          high: Math.max(c.open, c.close),
          low: c.low,
          midpoint: (Math.max(c.open, c.close) + c.low) / 2,
          ob_candle_index: i,
          tap_count: 0,
          formed_at: c.timestamp,
          timeframe,
          c1_engulf: false,
          c2_bos: false,
          c3_fvg: false,
          c4_structural_origin: nearSSL,
          all_conditions: false,
        }
      }
    }

    // Bearish rejection (upper wick)
    if (upperWick >= minWick) {
      const nearBSL = liquidity_pools.some(
        (p) =>
          (p.type === 'BSL' || p.type === 'EQH') &&
          Math.abs(c.high - p.price) <= maxOvershoot,
      )
      if (nearBSL) {
        return {
          id: makeOBId('REJECTION', i, c.timestamp),
          type: 'REJECTION',
          high: c.high,
          low: Math.min(c.open, c.close),
          midpoint: (c.high + Math.min(c.open, c.close)) / 2,
          ob_candle_index: i,
          tap_count: 0,
          formed_at: c.timestamp,
          timeframe,
          c1_engulf: false,
          c2_bos: false,
          c3_fvg: false,
          c4_structural_origin: nearBSL,
          all_conditions: false,
        }
      }
    }
  }

  return null
}

// ─────────────────────────────────────────────
// Expiry Check
// ─────────────────────────────────────────────

/**
 * Returns true if the OB should be discarded — either too many candles have
 * elapsed or the tap count has been exhausted.
 */
export function isOBExpired(ob: OrderBlock, current_idx: number): boolean {
  const age = current_idx - ob.ob_candle_index
  return age > OB_EXPIRY_CANDLES_DEFAULT || ob.tap_count >= OB_MAX_TAP_COUNT
}
