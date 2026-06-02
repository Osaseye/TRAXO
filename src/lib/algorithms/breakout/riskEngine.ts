/**
 * TRAXO Breakout Algorithm — Risk Engine
 *
 * SL placement, TP geometry, breakeven price, and risk percentage per tier.
 * All calculations are derived from the range height projection principle
 * described in spec §8.
 */

import type { BKTier, BreakoutEvent, ConsolidationZone } from './types'

// ─────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────

export interface BKSLResult {
  slPrice: number
  valid:   boolean
}

export interface BKTPResult {
  tp1:           number   // 50% range height  — breakeven trigger zone
  tp2:           number   // 100% range height — full projection
  tp3Price:      number   // 161.8% Fibonacci extension — runner target
  breakevenPrice: number  // entry + slippage buffer
}

// ─────────────────────────────────────────────
// Stop Loss
// ─────────────────────────────────────────────

/**
 * SL placement per spec §8.1:
 *   Bullish breakout: below pattern support - 0.15 × ATR14
 *   Bearish breakout: above pattern resistance + 0.15 × ATR14
 *
 * Hard gate: if |entry - SL| > 2.0 × ATR14, the trade is rejected.
 * This prevents over-wide risk on micro-timeframes where breakouts are
 * often confirmed only after significant extension.
 */
export function calculateBreakoutSL(
  event:      BreakoutEvent,
  entryPrice: number,
  atr14:      number,
): BKSLResult {
  const buffer = 0.15 * atr14

  const slPrice = event.direction === 'BULLISH'
    ? event.supportLevelAtBreakout    - buffer   // below pattern low
    : event.resistanceLevelAtBreakout + buffer   // above pattern high

  const riskDistance = Math.abs(entryPrice - slPrice)
  if (riskDistance > 2.0 * atr14) {
    return { slPrice, valid: false }
  }

  return { slPrice, valid: true }
}

// ─────────────────────────────────────────────
// Take Profits (Range Height Projection)
// ─────────────────────────────────────────────

/**
 * TP levels per spec §8.2:
 *   TP1 = brokenLevel + 50% of rangeHeight  (partial close, move SL to B/E)
 *   TP2 = brokenLevel + 100% of rangeHeight (main close target)
 *   TP3 = brokenLevel + 161.8% of rangeHeight (Fibonacci extension runner)
 *
 * The "brokenLevel" is the level that price broke through:
 *   Bullish → old resistance level (now new support)
 *   Bearish → old support level (now new resistance)
 */
export function calculateBreakoutTPs(
  event:      BreakoutEvent,
  zone:       ConsolidationZone,
  entryPrice: number,
  atr14:      number,
): BKTPResult {
  const { rangeHeight } = zone
  const isBull          = event.direction === 'BULLISH'
  const brokenLevel     = isBull
    ? event.resistanceLevelAtBreakout
    : event.supportLevelAtBreakout

  const tp1 = isBull
    ? brokenLevel + rangeHeight * 0.500
    : brokenLevel - rangeHeight * 0.500

  const tp2 = isBull
    ? brokenLevel + rangeHeight * 1.000
    : brokenLevel - rangeHeight * 1.000

  const tp3Price = isBull
    ? brokenLevel + rangeHeight * 1.618
    : brokenLevel - rangeHeight * 1.618

  // Breakeven = entry + slippage buffer (0.10 × ATR so commission is covered)
  const slippage      = 0.10 * atr14
  const breakevenPrice = isBull
    ? entryPrice + slippage
    : entryPrice - slippage

  return { tp1, tp2, tp3Price, breakevenPrice }
}

// ─────────────────────────────────────────────
// Risk Percentage Per Tier
// ─────────────────────────────────────────────

/**
 * Suggested risk % of account balance per tier.
 * The orchestrator applies a 0.5× streak multiplier on top if
 * consecutiveLosses >= 3 (circuit breaker mitigation).
 */
export function getBreakoutRiskPct(tier: BKTier): number {
  if (tier === 'prime')      return 1.5
  if (tier === 'standard')   return 1.0
  if (tier === 'aggressive') return 0.5
  return 0
}
