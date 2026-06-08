/**
 * TRAXO Order Block — Risk Engine
 *
 * Calculates stop loss, take profits, position size, split-entry payload,
 * and circuit breakers.
 */

import {
  SL_ATR_BUFFER,
  OTE_HIGH_FIB,
  ENTRY_PROXIMAL_FRACTION,
  ENTRY_OTE_FRACTION,
  DAILY_DRAWDOWN_KILL_PCT,
  STREAK_MITIGATION_LOSSES,
} from '../strategyConfig'
import type { OrderBlock, StructureState, LiquidityPool } from './types'

// ─────────────────────────────────────────────
// Stop Loss
// ─────────────────────────────────────────────

/**
 * Places SL `SL_ATR_BUFFER` × ATR14 beyond the OB wick extreme.
 *
 * Bullish OB → SL below ob.low minus buffer
 * Bearish OB → SL above ob.high plus buffer
 */
export function calculateSL(ob: OrderBlock, atr14: number): number {
  const buffer = SL_ATR_BUFFER * atr14
  if (ob.type === 'BULLISH' || ob.type === 'BREAKER_BULL' || ob.type === 'REJECTION') {
    return ob.low - buffer
  }
  return ob.high + buffer
}

// ─────────────────────────────────────────────
// Take Profits
// ─────────────────────────────────────────────

interface TPResult {
  tp1: number
  tp2: number
  tp3: number
  tp1_source: 'structure' | 'rr'
  tp2_source: 'structure' | 'rr'
  tp3_source: 'structure' | 'rr'
}

/**
 * Calculates three take-profit levels.
 *
 * TP1 — nearest opposing liquidity pool (BSL for bullish, SSL for bearish)
 *        fallback: 2R
 * TP2 — next swing beyond TP1
 *        fallback: 3R
 * TP3 — HTF target (highest swing or further pool)
 *        fallback: 5R
 */
export function calculateTPs(
  entry: number,
  sl: number,
  structure_state: StructureState,
  liquidity_pools: LiquidityPool[],
  ob_direction: 'BULLISH' | 'BEARISH',
): TPResult {
  const riskSize = Math.abs(entry - sl)

  // TP1: nearest opposing pool
  let tp1 = 0
  let tp1_source: 'structure' | 'rr' = 'rr'

  const targets =
    ob_direction === 'BULLISH'
      ? liquidity_pools
          .filter((p) => (p.type === 'BSL' || p.type === 'EQH') && p.price > entry)
          .sort((a, b) => a.price - b.price)
      : liquidity_pools
          .filter((p) => (p.type === 'SSL' || p.type === 'EQL') && p.price < entry)
          .sort((a, b) => b.price - a.price)

  if (targets.length > 0) {
    tp1 = targets[0].price
    tp1_source = 'structure'
  } else {
    tp1 = ob_direction === 'BULLISH' ? entry + 2 * riskSize : entry - 2 * riskSize
  }

  // TP2: next pool beyond TP1 or 3R
  let tp2 = 0
  let tp2_source: 'structure' | 'rr' = 'rr'

  if (targets.length >= 2) {
    tp2 = targets[1].price
    tp2_source = 'structure'
  } else {
    tp2 = ob_direction === 'BULLISH' ? entry + 3 * riskSize : entry - 3 * riskSize
  }

  // TP3: structural extreme or 5R
  let tp3 = 0
  let tp3_source: 'structure' | 'rr' = 'rr'

  const extremeSwing =
    ob_direction === 'BULLISH'
      ? structure_state.last_swing_high
      : structure_state.last_swing_low

  if (extremeSwing && ob_direction === 'BULLISH' && extremeSwing.price > tp2) {
    tp3 = extremeSwing.price
    tp3_source = 'structure'
  } else if (extremeSwing && ob_direction === 'BEARISH' && extremeSwing.price < tp2) {
    tp3 = extremeSwing.price
    tp3_source = 'structure'
  } else {
    tp3 = ob_direction === 'BULLISH' ? entry + 5 * riskSize : entry - 5 * riskSize
  }

  return { tp1, tp2, tp3, tp1_source, tp2_source, tp3_source }
}

// ─────────────────────────────────────────────
// Position Size
// ─────────────────────────────────────────────

/**
 * Returns the position size in units given a risk amount.
 *
 * position_size = (account_balance × risk_pct/100) / |entry − sl|
 */
export function calculatePositionSize(
  account_balance: number,
  risk_pct: number,
  entry: number,
  sl: number,
): number {
  const risk_amount = account_balance * (risk_pct / 100)
  const pip_risk = Math.abs(entry - sl)
  if (pip_risk === 0) return 0
  return risk_amount / pip_risk
}

// ─────────────────────────────────────────────
// Split Entry Payload
// ─────────────────────────────────────────────

/**
 * Calculates the two entry prices for the split-entry strategy.
 *
 * entry_proximal — OB zone edge (proximal line)
 *   Bullish: ob.high (first touch of top of OB zone)
 *   Bearish: ob.low  (first touch of bottom of OB zone)
 *
 * entry_ote — OTE Fibonacci retracement (0.618–0.786 into the impulse move)
 *   Uses the OB high–low range as the impulse leg.
 */
export function splitEntryPayload(
  ob: OrderBlock,
): {
  entry_proximal: number
  entry_ote: number
  entry1_size_pct: number
  entry2_size_pct: number
} {
  const isBullish =
    ob.type === 'BULLISH' || ob.type === 'BREAKER_BULL' || ob.type === 'REJECTION'

  const entry_proximal = isBullish ? ob.high : ob.low

  // OTE: Fib retracement from ob.low (for bullish) into the OB zone
  const range = ob.high - ob.low
  const entry_ote = isBullish
    ? ob.high - OTE_HIGH_FIB * range // 0.618 retrace from top of OB
    : ob.low + OTE_HIGH_FIB * range  // 0.618 retrace from bottom of OB

  return {
    entry_proximal,
    entry_ote,
    entry1_size_pct: ENTRY_PROXIMAL_FRACTION,
    entry2_size_pct: ENTRY_OTE_FRACTION,
  }
}

// ─────────────────────────────────────────────
// Circuit Breakers
// ─────────────────────────────────────────────

/**
 * Applies drawdown and streak mitigation to the base risk percentage.
 *
 * - Daily drawdown ≥ DAILY_DRAWDOWN_KILL_PCT → return 0 (kill switch)
 * - Consecutive losses ≥ STREAK_MITIGATION_LOSSES → halve risk
 *
 * Returns the adjusted risk_pct (0 = no trade).
 */
export function applyCircuitBreakers(
  drawdown_pct: number,
  consecutive_losses: number,
  base_risk_pct: number,
): number {
  if (drawdown_pct >= DAILY_DRAWDOWN_KILL_PCT) return 0
  if (consecutive_losses >= STREAK_MITIGATION_LOSSES) return base_risk_pct / 2
  return base_risk_pct
}
