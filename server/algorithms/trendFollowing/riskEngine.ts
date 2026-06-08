/**
 * TRAXO Trend Following — Risk Engine
 *
 * SL placement, TP geometry (liquidity-targeted + RR fallback),
 * suggested risk percentage per tier, and trend exhaustion detection.
 *
 * Spec reference: Sections 7.1, 7.2, 8.1, 8.2, 8.3, 5.3.
 *
 * ── SL placement ────────────────────────────────────────────────────────────
 *  Bullish: sl = pullback_extreme_low  - (0.15 × ATR_14)
 *  Bearish: sl = pullback_extreme_high + (0.15 × ATR_14)
 *
 * ── SL gate ────────────────────────────────────────────────────────────────
 *  If Risk_Distance > 2.5 × ATR_14, the setup is rejected (pullback too deep).
 *
 * ── TP geometry ─────────────────────────────────────────────────────────────
 *  TP1 — Prior swing high/low (structural)  |  fallback: entry + 1.5 × R
 *  TP2 — BSL/SSL liquidity pool              |  fallback: entry + 3.0 × R
 *  TP3 — 1.618× extension of impulse swing   |  fallback: entry + 5.0 × R
 *
 * ── Risk per tier ───────────────────────────────────────────────────────────
 *  PRIME: 1.5%  |  STANDARD: 1.0%  |  AGGRESSIVE: 0.5%
 */

import type { TFTier } from './types'

// ─────────────────────────────────────────────
// SL / Risk Distance
// ─────────────────────────────────────────────

const SL_ATR_BUFFER = 0.15
const MAX_RISK_DISTANCE_ATR = 2.5

export interface SLResult {
  slPrice:       number
  riskDistance:  number
  rejected:      boolean
  rejectionReason?: string
}

/**
 * Calculate stop-loss price and validate it against the ATR gate.
 *
 * @param direction       - 'BUY' (bull) or 'SELL' (bear)
 * @param pullbackExtreme - Pullback low (bull) or pullback high (bear)
 * @param atr14           - Current ATR(14)
 * @param entryPrice      - Indicative entry price
 */
export function calculateSL(
  direction:       'BUY' | 'SELL',
  pullbackExtreme: number,
  atr14:           number,
  entryPrice:      number,
): SLResult {
  const sl = direction === 'BUY'
    ? pullbackExtreme - SL_ATR_BUFFER * atr14
    : pullbackExtreme + SL_ATR_BUFFER * atr14

  const riskDistance = Math.abs(entryPrice - sl)
  const maxAllowed   = MAX_RISK_DISTANCE_ATR * atr14

  if (riskDistance > maxAllowed) {
    return {
      slPrice: sl,
      riskDistance,
      rejected: true,
      rejectionReason: `Risk_Distance (${riskDistance.toFixed(5)}) > 2.5× ATR (${maxAllowed.toFixed(5)}) — pullback too deep`,
    }
  }

  return { slPrice: sl, riskDistance, rejected: false }
}

// ─────────────────────────────────────────────
// TP Geometry
// ─────────────────────────────────────────────

export interface TPResult {
  tp1Price:         number
  tp2Price:         number
  fib1618Extension: number
  tp1Source:        'structure' | 'rr'
  tp2Source:        'structure' | 'rr'
}

/**
 * Calculate TP1, TP2, and the 1.618× extension (runner target).
 *
 * @param direction    - 'BUY' or 'SELL'
 * @param entryPrice   - Entry price
 * @param riskDistance - |entry - sl|
 * @param lastHHPrice  - Most recent swing high (TP1 structural reference for bull)
 * @param lastLLPrice  - Most recent swing low (TP1 structural reference for bear)
 * @param impulseRange - Magnitude of the prior impulse swing (for 1.618× ext)
 * @param nextBSL      - Next Buy-Side Liquidity pool price (TP2 structural for bull)
 * @param nextSSL      - Next Sell-Side Liquidity pool price (TP2 structural for bear)
 */
export function calculateTPs(
  direction:    'BUY' | 'SELL',
  entryPrice:   number,
  riskDistance: number,
  lastHHPrice:  number | null,
  lastLLPrice:  number | null,
  impulseRange: number,
  nextBSL?:     number | null,
  nextSSL?:     number | null,
): TPResult {
  const R = riskDistance

  if (direction === 'BUY') {
    // TP1: prior swing high, otherwise 1.5R
    let tp1Price  = lastHHPrice ?? (entryPrice + 1.5 * R)
    const tp1Src: 'structure' | 'rr' = lastHHPrice && lastHHPrice > entryPrice ? 'structure' : 'rr'
    if (tp1Src === 'rr') tp1Price = entryPrice + 1.5 * R

    // TP2: BSL pool, otherwise 3R
    let tp2Price  = (nextBSL && nextBSL > tp1Price) ? nextBSL : entryPrice + 3.0 * R
    const tp2Src: 'structure' | 'rr' = (nextBSL && nextBSL > tp1Price) ? 'structure' : 'rr'

    // 1.618× extension
    const fib1618 = entryPrice + 1.618 * impulseRange

    return { tp1Price, tp2Price, fib1618Extension: fib1618, tp1Source: tp1Src, tp2Source: tp2Src }
  }

  // SELL
  let tp1Price  = lastLLPrice ?? (entryPrice - 1.5 * R)
  const tp1Src: 'structure' | 'rr' = lastLLPrice && lastLLPrice < entryPrice ? 'structure' : 'rr'
  if (tp1Src === 'rr') tp1Price = entryPrice - 1.5 * R

  let tp2Price  = (nextSSL && nextSSL < tp1Price) ? nextSSL : entryPrice - 3.0 * R
  const tp2Src: 'structure' | 'rr' = (nextSSL && nextSSL < tp1Price) ? 'structure' : 'rr'

  const fib1618 = entryPrice - 1.618 * impulseRange

  return { tp1Price, tp2Price, fib1618Extension: fib1618, tp1Source: tp1Src, tp2Source: tp2Src }
}

// ─────────────────────────────────────────────
// Break-Even Price
// ─────────────────────────────────────────────

/**
 * Calculate the break-even price, adding a small tolerance for commission
 * and slippage (approximated as 0.10 × ATR_14 when no commission data available).
 *
 * NOTE: The engine does NOT auto-move the SL to break-even at TP1.
 * Per Section 8.3, the SL is only promoted after a new LTF HL forms or
 * the trail is moved to the launch OB bottom. This price is stored
 * in the signal for the trade management layer to reference.
 */
export function calculateBreakevenPrice(
  direction:   'BUY' | 'SELL',
  entryPrice:  number,
  atr14:       number,
): number {
  const tolerance = 0.10 * atr14
  return direction === 'BUY'
    ? entryPrice + tolerance
    : entryPrice - tolerance
}

// ─────────────────────────────────────────────
// Risk Percentage per Tier
// ─────────────────────────────────────────────

/** Returns the suggested account risk percentage for the given tier. */
export function getRiskPct(tier: TFTier): number {
  switch (tier) {
    case 'prime':      return 1.5
    case 'standard':   return 1.0
    case 'aggressive': return 0.5
    default:           return 0
  }
}

// ─────────────────────────────────────────────
// Trend Exhaustion Guard
// ─────────────────────────────────────────────

/**
 * Detect late-cycle entry risk (Section 5.3).
 *
 * Two triggers:
 *  1. No pullback for > 30 consecutive candles since the last HL/LH
 *  2. Current ATR is > 2.5× the average ATR of the last 20 swing periods
 *
 * @param candlesSinceLastSwing - Count of candles since the last HL (bull) or LH (bear)
 * @param currentAtr            - Latest ATR(14) value
 * @param atrArr                - Full ATR array (for average calculation)
 */
export function detectTrendExhaustion(
  candlesSinceLastSwing: number,
  currentAtr:            number,
  atrArr:                number[],
): boolean {
  if (candlesSinceLastSwing > 30) return true

  if (atrArr.length >= 20) {
    const recent20 = atrArr.slice(-20)
    const avgAtr   = recent20.reduce((a, b) => a + b, 0) / recent20.length
    if (avgAtr > 0 && currentAtr / avgAtr > 2.5) return true
  }
  return false
}
