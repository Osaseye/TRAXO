/**
 * TRAXO Order Block — Strategy Orchestrator
 *
 * Entry point: analyzeOrderBlock(context) → OrderBlockSignal
 *
 * Execution order follows the §7 pipeline specification:
 *  1. Guard: minimum candle count
 *  2. ATR + regime
 *  3. Swing detection
 *  4. BOS / CHoCH / structure state
 *  5. Liquidity pools
 *  6. FVG + Liquidity Void
 *  7. Displacement
 *  8. AMD phase
 *  9. Order Block detection (bullish / bearish / breaker / rejection)
 * 10. OB validation & C3 update (FVG adjacency)
 * 11. OB expiry guard
 * 12. MTF Cluster
 * 13. Kill Zone
 * 14. Score + confluence
 * 15. Tier guard (discard → NO_TRADE)
 * 16. Risk calculations
 * 17. Assemble and return OrderBlockSignal
 */

import { buildRegimeState } from './orderBlock/regimeEngine'
import { detectSwingPoints, detectAMDPhase, getPriceLocation, buildStructureState } from './orderBlock/structureEngine'
import { buildLiquidityState } from './orderBlock/liquidityEngine'
import { detectFVG, findAdjacentFVG, detectLiquidityVoid } from './orderBlock/fvgEngine'
import { measureDisplacement } from './orderBlock/displacementEngine'
import {
  detectBullishOB,
  detectBearishOB,
  detectBreakerBlock,
  detectMitigationBlock,
  detectRejectionBlock,
  isOBExpired,
} from './orderBlock/orderBlockEngine'
import { detectMTFCluster } from './orderBlock/obClusterEngine'
import { isInKillZone } from './orderBlock/killZoneEngine'
import { scoreSignal } from './orderBlock/confluenceEngine'
import { calculateSL, calculateTPs, splitEntryPayload, applyCircuitBreakers } from './orderBlock/riskEngine'
import type { OrderBlockContext, OrderBlockSignal, OrderBlock } from './orderBlock/types'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildSignalId(symbol: string, timeframe: string, ts: string): string {
  return `ob_${symbol}_${timeframe}_${ts}`
}

function noTradeSignal(
  context: OrderBlockContext,
  reason: string[],
): OrderBlockSignal {
  return {
    id: buildSignalId(context.symbol, context.timeframe, new Date().toISOString()),
    strategy_id: 'order_block',
    signal: 'NO_TRADE',
    symbol: context.symbol,
    asset_type: context.asset_type,
    timeframe: context.timeframe,
    score: 0,
    confidence_pct: 0,
    tier: 'discard',
    bos_quality: 'WEAK',
    displacement_quality: 'WEAK',
    displacement_size_atr: 0,
    fvg_confluence: false,
    fvg_grade: null,
    liquidity_void: false,
    ob_type: null,
    ob_high: 0,
    ob_low: 0,
    entry_proximal: 0,
    entry_ote: 0,
    entry1_size_pct: 0,
    entry2_size_pct: 0,
    sl_price: 0,
    tp1_price: 0,
    tp2_price: 0,
    tp3_price: 0,
    tp1_source: 'rr',
    tp2_source: 'rr',
    tp3_source: 'rr',
    suggested_risk_pct: 0,
    amd_phase: 'ACCUMULATION',
    bos_confirmed: false,
    choch_confirmed: false,
    liquidity_sweep: false,
    market_regime: null,
    ob_cluster_count: 1,
    ob_cluster_htf: null,
    kill_zone_active: false,
    kill_zone: null,
    htf_aligned: false,
    session_active: false,
    reason,
    timestamp: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────

export function analyzeOrderBlock(context: OrderBlockContext): OrderBlockSignal {
  const { candles, atr14, volumeMa20, htfCandles, htfBias, newsEvents = [], timeframe } = context

  // ── 1. Guard: minimum candle count ──────────────────────────────────
  if (candles.length < 30) {
    return noTradeSignal(context, ['INSUFFICIENT_DATA: need ≥ 30 candles'])
  }

  // ── 2. ATR + Regime ──────────────────────────────────────────────────
  const regimeState = buildRegimeState(candles)
  // Use caller-supplied atr14 as the authoritative value (pre-calculated on the
  // same series) but fall back to regimeState value when not provided.
  const effectiveATR = atr14 > 0 ? atr14 : regimeState.atr14
  if (effectiveATR <= 0) {
    return noTradeSignal(context, ['INVALID_ATR: ATR14 is 0 or negative'])
  }

  // ── 3. Swing Points ──────────────────────────────────────────────────
  const swings = detectSwingPoints(candles)

  // ── 4. Structure State (BOS / CHoCH) ────────────────────────────────
  const structure = buildStructureState(candles, effectiveATR)

  // ── 5. Liquidity Pools ───────────────────────────────────────────────
  const liquidity = buildLiquidityState(candles, swings, effectiveATR)

  // ── 6. FVG + Liquidity Void ──────────────────────────────────────────
  const fvgs = detectFVG(candles, effectiveATR)

  // ── 7. Displacement ──────────────────────────────────────────────────
  const impulse_idx = structure.bos_candle_idx ?? candles.length - 1
  const displacement = measureDisplacement(candles, impulse_idx, effectiveATR)

  // ── 8. AMD Phase ─────────────────────────────────────────────────────
  const amdPhase = detectAMDPhase(candles, structure, effectiveATR, volumeMa20, context.asset_type)
  structure.current_phase = amdPhase

  // ── 9. Order Block Detection ─────────────────────────────────────────
  let ob: OrderBlock | null = null

  if (structure.bos_direction === 'BULLISH') {
    ob = detectBullishOB(candles, structure, liquidity.all, effectiveATR, timeframe)
  } else if (structure.bos_direction === 'BEARISH') {
    ob = detectBearishOB(candles, structure, liquidity.all, effectiveATR, timeframe)
  }

  // Fallback: check for rejection block (at liquidity clusters)
  if (!ob) {
    ob = detectRejectionBlock(candles, liquidity.all, effectiveATR, context.asset_type, timeframe)
  }

  // Upgrade to breaker if applicable
  if (ob) {
    const breaker = detectBreakerBlock(ob, candles, timeframe)
    if (breaker) ob = breaker
  }

  // Update tap count (mitigation)
  if (ob) {
    ob = detectMitigationBlock(ob, candles)
  }

  // ── 10. C3: FVG adjacency update ────────────────────────────────────
  let adjacentFVG = null
  if (ob) {
    adjacentFVG = findAdjacentFVG(ob, fvgs)
    if (adjacentFVG) {
      ob = { ...ob, c3_fvg: true, all_conditions: ob.c1_engulf && ob.c2_bos && true && ob.c4_structural_origin }
    }
  }

  // ── 11. OB Validity Guard ────────────────────────────────────────────
  if (!ob) {
    return noTradeSignal(context, ['NO_OB: no qualifying order block found'])
  }

  if (isOBExpired(ob, candles.length - 1)) {
    return noTradeSignal(context, [`OB_EXPIRED: age or tap_count exceeded (taps=${ob.tap_count})`])
  }

  // ── 12. MTF Cluster ──────────────────────────────────────────────────
  let cluster_count = 1
  let cluster_htf = null
  if (htfCandles && Object.keys(htfCandles).length > 0) {
    const cluster = detectMTFCluster(ob, htfCandles, timeframe, effectiveATR)
    cluster_count = cluster.count
    cluster_htf = cluster.highest_timeframe
  }

  // ── 13. Kill Zone ────────────────────────────────────────────────────
  const latestTimestamp = candles.at(-1)!.timestamp
  const killZone = isInKillZone(latestTimestamp)

  // ── 14. Liquidity Void (from ob candle forward) ──────────────────────
  const obDirection = (ob.type === 'BULLISH' || ob.type === 'BREAKER_BULL') ? 'BULLISH' : 'BEARISH'
  const liqVoid = detectLiquidityVoid(candles, ob.ob_candle_index + 1, obDirection)

  // ── 15. Price location ───────────────────────────────────────────────
  const swingHigh = structure.last_swing_high?.price ?? candles.at(-1)!.high
  const swingLow  = structure.last_swing_low?.price  ?? candles.at(-1)!.low
  const currentPrice = candles.at(-1)!.close
  const priceLocation = getPriceLocation(currentPrice, swingHigh, swingLow)

  // ── 16. Score ────────────────────────────────────────────────────────
  const scoring = scoreSignal({
    bos_quality: structure.bos_quality,
    fvg_grade: adjacentFVG?.grade ?? null,
    displacement_quality: displacement.quality,
    liquidity_void: liqVoid !== null,
    ob_tap_count: ob.tap_count,
    cluster_count,
    kill_zone_active: killZone !== null,
    market_regime: regimeState.regime,
    htf_bias: htfBias,
    ob_direction: obDirection,
    price_location: priceLocation,
    volume_ratio: volumeMa20 > 0 ? (candles.at(-1)!.volume / volumeMa20) : 1,
    news_events: newsEvents,
    signal_timestamp: latestTimestamp,
    all_conditions: ob.all_conditions,
  })

  // ── 17. Tier guard ───────────────────────────────────────────────────
  if (scoring.tier === 'discard') {
    return noTradeSignal(context, scoring.reason)
  }

  if (scoring.news_kill) {
    return noTradeSignal(context, scoring.reason)
  }

  // ── 18. Risk calculations ─────────────────────────────────────────────
  const sl = calculateSL(ob, effectiveATR)
  const entry = splitEntryPayload(ob)
  const entryPrice = entry.entry_proximal  // primary entry for TP calc

  const tps = calculateTPs(entryPrice, sl, structure, liquidity.all, obDirection)

  const baseRisk = 1.0  // default 1% — caller can override via context extensions
  const adjustedRisk = applyCircuitBreakers(
    context.rollingDrawdownPct ?? 0,
    context.consecutiveLosses ?? 0,
    baseRisk,
  )

  if (adjustedRisk === 0) {
    return noTradeSignal(context, ['CIRCUIT_BREAKER: daily drawdown or loss streak limit hit'])
  }

  // ── 19. Determine signal direction ────────────────────────────────────
  const signalDirection = obDirection === 'BULLISH' ? 'BUY' : 'SELL'

  // ── 20. HTF alignment flag ────────────────────────────────────────────
  const htfAligned =
    (htfBias === 'bullish' && obDirection === 'BULLISH') ||
    (htfBias === 'bearish' && obDirection === 'BEARISH')

  // ── 21. Assemble signal ───────────────────────────────────────────────
  const ts = latestTimestamp
  const signalId = buildSignalId(context.symbol, timeframe, ts)

  return {
    id: signalId,
    strategy_id: 'order_block',
    signal: signalDirection,
    symbol: context.symbol,
    asset_type: context.asset_type,
    timeframe,

    score: scoring.raw_score,
    confidence_pct: scoring.confidence_pct,
    tier: scoring.tier,

    bos_quality: structure.bos_quality,
    displacement_quality: displacement.quality,
    displacement_size_atr: displacement.size_atr,

    fvg_confluence: adjacentFVG !== null,
    fvg_grade: adjacentFVG?.grade ?? null,
    liquidity_void: liqVoid !== null,

    ob_type: ob.type,
    ob_high: ob.high,
    ob_low: ob.low,

    entry_proximal: entry.entry_proximal,
    entry_ote: entry.entry_ote,
    entry1_size_pct: entry.entry1_size_pct,
    entry2_size_pct: entry.entry2_size_pct,

    sl_price: sl,
    tp1_price: tps.tp1,
    tp2_price: tps.tp2,
    tp3_price: tps.tp3,
    tp1_source: tps.tp1_source,
    tp2_source: tps.tp2_source,
    tp3_source: tps.tp3_source,
    suggested_risk_pct: adjustedRisk,

    amd_phase: amdPhase,
    bos_confirmed: structure.bos_confirmed,
    choch_confirmed: structure.choch_confirmed,
    liquidity_sweep: liquidity.swept_highs || liquidity.swept_lows,
    market_regime: regimeState.regime,
    ob_cluster_count: cluster_count,
    ob_cluster_htf: cluster_htf,
    kill_zone_active: killZone !== null,
    kill_zone: killZone,
    htf_aligned: htfAligned,
    session_active: scoring.reason.some((r: string) => r.startsWith('SESSION_') && !r.includes('+0') && !r.includes('-1')),
    reason: scoring.reason,
    timestamp: ts,
  }
}
