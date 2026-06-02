/**
 * TRAXO Order Block — Liquidity Engine
 *
 * Detects BSL, SSL, EQH, EQL liquidity pools and marks swept levels.
 */

import { SWING_LOOKBACK, EQH_EQL_PROXIMITY_ATR } from '../strategyConfig'
import type { OBCandle, LiquidityPool, SwingPoint } from './types'

// ─────────────────────────────────────────────
// Raw Swing Helpers (exported for cluster engine)
// ─────────────────────────────────────────────

/**
 * Returns candle indices where the high is a pivot high within `lookback` bars
 * on each side.
 */
export function detectSwingHighs(
  candles: OBCandle[],
  lookback: number = SWING_LOOKBACK,
): number[] {
  const out: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const peak = candles[i].high
    let ok = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= peak) {
        ok = false
        break
      }
    }
    if (ok) out.push(i)
  }
  return out
}

/**
 * Returns candle indices where the low is a pivot low within `lookback` bars
 * on each side.
 */
export function detectSwingLows(
  candles: OBCandle[],
  lookback: number = SWING_LOOKBACK,
): number[] {
  const out: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const trough = candles[i].low
    let ok = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= trough) {
        ok = false
        break
      }
    }
    if (ok) out.push(i)
  }
  return out
}

// ─────────────────────────────────────────────
// EQH / EQL  (Equal Highs / Lows)
// ─────────────────────────────────────────────

/**
 * Finds pairs of swing highs whose prices are within `EQH_EQL_PROXIMITY_ATR` × ATR14
 * of each other — a liquidity cluster above the market.
 */
export function detectEQH(candles: OBCandle[], atr14: number): LiquidityPool[] {
  const highIdxs = detectSwingHighs(candles)
  const tolerance = EQH_EQL_PROXIMITY_ATR * atr14
  const pools: LiquidityPool[] = []

  for (let i = 0; i < highIdxs.length - 1; i++) {
    for (let j = i + 1; j < highIdxs.length; j++) {
      const priceA = candles[highIdxs[i]].high
      const priceB = candles[highIdxs[j]].high
      if (Math.abs(priceA - priceB) <= tolerance) {
        const avgPrice = (priceA + priceB) / 2
        pools.push({
          type: 'EQH',
          price: avgPrice,
          zone_high: avgPrice + tolerance,
          zone_low: avgPrice - tolerance,
          candle_index: highIdxs[j], // most recent of the pair
          swept: false,
        })
      }
    }
  }

  return pools
}

/**
 * Finds pairs of swing lows whose prices are within `EQH_EQL_PROXIMITY_ATR` × ATR14
 * of each other — a liquidity cluster below the market.
 */
export function detectEQL(candles: OBCandle[], atr14: number): LiquidityPool[] {
  const lowIdxs = detectSwingLows(candles)
  const tolerance = EQH_EQL_PROXIMITY_ATR * atr14
  const pools: LiquidityPool[] = []

  for (let i = 0; i < lowIdxs.length - 1; i++) {
    for (let j = i + 1; j < lowIdxs.length; j++) {
      const priceA = candles[lowIdxs[i]].low
      const priceB = candles[lowIdxs[j]].low
      if (Math.abs(priceA - priceB) <= tolerance) {
        const avgPrice = (priceA + priceB) / 2
        pools.push({
          type: 'EQL',
          price: avgPrice,
          zone_high: avgPrice + tolerance,
          zone_low: avgPrice - tolerance,
          candle_index: lowIdxs[j],
          swept: false,
        })
      }
    }
  }

  return pools
}

// ─────────────────────────────────────────────
// BSL / SSL  (Buy-Side / Sell-Side Liquidity)
// ─────────────────────────────────────────────

/**
 * The highest swing high across the classified SwingPoints → Buy-Side Liquidity.
 */
export function detectBSL(swings: SwingPoint[]): LiquidityPool | null {
  const highs = swings.filter((s) => s.type === 'HH' || s.type === 'LH')
  if (highs.length === 0) return null

  const top = highs.reduce((best, s) => (s.price > best.price ? s : best))
  return {
    type: 'BSL',
    price: top.price,
    zone_high: top.price * 1.001, // 0.1% buffer
    zone_low: top.price * 0.999,
    candle_index: top.index,
    swept: top.swept,
  }
}

/**
 * The lowest swing low across the classified SwingPoints → Sell-Side Liquidity.
 */
export function detectSSL(swings: SwingPoint[]): LiquidityPool | null {
  const lows = swings.filter((s) => s.type === 'LL' || s.type === 'HL')
  if (lows.length === 0) return null

  const bottom = lows.reduce((best, s) => (s.price < best.price ? s : best))
  return {
    type: 'SSL',
    price: bottom.price,
    zone_high: bottom.price * 1.001,
    zone_low: bottom.price * 0.999,
    candle_index: bottom.index,
    swept: bottom.swept,
  }
}

// ─────────────────────────────────────────────
// Sweep Detection
// ─────────────────────────────────────────────

/**
 * Returns true if any candle after `pool.candle_index` has traded through the pool price
 * (wick beyond the zone_high for BSL/EQH, wick below zone_low for SSL/EQL).
 */
export function markSwept(pool: LiquidityPool, candles: OBCandle[]): boolean {
  for (let i = pool.candle_index + 1; i < candles.length; i++) {
    const c = candles[i]
    if ((pool.type === 'BSL' || pool.type === 'EQH') && c.high >= pool.zone_high) return true
    if ((pool.type === 'SSL' || pool.type === 'EQL') && c.low <= pool.zone_low) return true
  }
  return false
}

// ─────────────────────────────────────────────
// All Pools (convenience for orchestrator)
// ─────────────────────────────────────────────

export interface LiquidityState {
  bsl: LiquidityPool | null
  ssl: LiquidityPool | null
  eqh: LiquidityPool[]
  eql: LiquidityPool[]
  all: LiquidityPool[]
  /** true if the most recent candle swept BSL or an EQH */
  swept_highs: boolean
  /** true if the most recent candle swept SSL or an EQL */
  swept_lows: boolean
}

export function buildLiquidityState(
  candles: OBCandle[],
  swings: SwingPoint[],
  atr14: number,
): LiquidityState {
  const bsl = detectBSL(swings)
  const ssl = detectSSL(swings)
  const eqh = detectEQH(candles, atr14)
  const eql = detectEQL(candles, atr14)

  // Mutate swept flags
  if (bsl) bsl.swept = markSwept(bsl, candles)
  if (ssl) ssl.swept = markSwept(ssl, candles)
  eqh.forEach((p) => { p.swept = markSwept(p, candles) })
  eql.forEach((p) => { p.swept = markSwept(p, candles) })

  const all: LiquidityPool[] = [
    ...(bsl ? [bsl] : []),
    ...(ssl ? [ssl] : []),
    ...eqh,
    ...eql,
  ]

  const swept_highs = (bsl?.swept ?? false) || eqh.some((p) => p.swept)
  const swept_lows = (ssl?.swept ?? false) || eql.some((p) => p.swept)

  return { bsl, ssl, eqh, eql, all, swept_highs, swept_lows }
}
