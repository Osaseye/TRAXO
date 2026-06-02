/**
 * TRAXO Breakout Algorithm — Strategy Orchestrator
 *
 * Entry point: analyzeBreakout(context) → BreakoutSignal
 *
 * Pipeline:
 *  1.  Guard: minimum candle count (30 hard, 50 recommended)
 *  2.  Compute ATR14
 *  3.  Detect consolidation zone (trendline fitting + pattern classification)
 *  4.  Triangle apex guard (reject < 10% or > 90%)
 *  5.  Attempt trendline lock if zone is mature (Fix 1)
 *  6.  Compute session-weighted RVOL (Fix 3)
 *  7.  Detect breakout / stop hunt event (Fix 2 inside detectBreakout)
 *  8.  False breakout guard (non-stop-hunt)
 *  9.  Retest monitoring
 * 10.  HTF trend alignment
 * 11.  Score signal (14-point matrix)
 * 12.  Discard guard
 * 13.  Entry price — Fix 4: force limit on 1m/5m timeframes
 * 14.  SL width gate
 * 15.  TP geometry (range height projection)
 * 16.  Assemble and return BreakoutSignal
 */

import {
  computeBKATR,
  detectConsolidation,
  getTrendlinePrice,
  maybeLockTrendlines,
  computeApexPct,
} from './breakout/consolidationEngine'
import { detectBreakout, checkRetest }     from './breakout/breakoutEngine'
import { hasRealVolume, computeSessionRVOL } from './breakout/volumeEngine'
import { scoreBreakout }                    from './breakout/scoringEngine'
import {
  calculateBreakoutSL,
  calculateBreakoutTPs,
  getBreakoutRiskPct,
} from './breakout/riskEngine'
import type { BreakoutContext, BreakoutSignal } from './breakout/types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MIN_CANDLES = 30

/**
 * FIX 4 — Low Timeframe Limit Order Enforcement.
 *
 * On 1m and 5m charts, by the time a breakout candle *closes* with 3× volume,
 * price may already be 60% of the way to TP1. A market order at that point
 * produces catastrophic slippage and ruins the R:R.
 *
 * For these timeframes: always set entry_type = 'limit' at the broken level.
 * This forces a retest entry discipline and avoids chasing fast micro-moves.
 */
const LOW_TF_RETEST_ONLY = new Set(['1m', '5m'])

// ─────────────────────────────────────────────
// Session Detection
// ─────────────────────────────────────────────

function isActiveSession(timestamp: string): boolean {
  try {
    const h = new Date(timestamp).getUTCHours()
    // London: 08:00–17:00 UTC | NY: 13:00–22:00 UTC (overlap maximises reliability)
    return (h >= 8 && h < 17) || (h >= 13 && h < 22)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// HTF Trend Estimation (from candle array)
// ─────────────────────────────────────────────

function estimateHTFTrend(
  candles: { close: number }[],
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (candles.length < 50) return 'NEUTRAL'
  const period = Math.min(100, candles.length)
  const slice  = candles.slice(-period)
  const avg    = slice.reduce((s, c) => s + c.close, 0) / period
  const last   = candles[candles.length - 1].close
  const band   = avg * 0.002   // 0.2% threshold to avoid noise
  if (last > avg + band) return 'BULLISH'
  if (last < avg - band) return 'BEARISH'
  return 'NEUTRAL'
}

// ─────────────────────────────────────────────
// NO_TRADE Builder
// ─────────────────────────────────────────────

function noTrade(ctx: BreakoutContext, reason: string[]): BreakoutSignal {
  const last = ctx.candles[ctx.candles.length - 1]
  return {
    id:                   `bk_no_${ctx.symbol}_${ctx.timeframe}_${last.timestamp}`,
    strategy_id:          'breakout',
    signal:               'NO_TRADE',
    symbol:               ctx.symbol,
    timeframe:            ctx.timeframe,
    asset_type:           ctx.assetType,
    pattern_type:         null,
    triangle_subtype:     null,
    wedge_direction:      null,
    resistance_level:     0,
    support_level:        0,
    range_height:         0,
    pattern_candles:      0,
    apex_pct:             null,
    breakout_direction:   null,
    body_close_confirmed: false,
    volume_ratio:         0,
    stop_hunt_detected:   false,
    false_breakout:       false,
    retest_entry:         false,
    score:                0,
    confidence_pct:       0,
    tier:                 'discard',
    entry_type:           'limit',
    entry_price:          0,
    sl_price:             0,
    tp1_price:            0,
    tp2_price:            0,
    tp3_trailing:         false,
    suggested_risk_pct:   0,
    breakeven_price:      0,
    htf_aligned:          false,
    prior_trend:          'NEUTRAL',
    prior_move_atr:       0,
    session_active:       false,
    bsl_pool_target:      null,
    reason,
    timestamp:            last.timestamp,
  }
}

// ─────────────────────────────────────────────
// Main Orchestrator
// ─────────────────────────────────────────────

export function analyzeBreakout(ctx: BreakoutContext): BreakoutSignal {
  const { candles, symbol, timeframe, assetType } = ctx

  // ── 1. Guard ──────────────────────────────────────────────────────────────
  if (candles.length < MIN_CANDLES) {
    return noTrade(ctx, [`NO_TRADE: Insufficient candles (${candles.length} < ${MIN_CANDLES})`])
  }

  // ── 2. ATR ────────────────────────────────────────────────────────────────
  const atrArr = computeBKATR(candles, 14)
  const atr14  = atrArr[atrArr.length - 1]
  if (atr14 === 0) return noTrade(ctx, ['NO_TRADE: ATR is zero'])

  // ── 3. Consolidation zone ────────────────────────────────────────────────
  const zone = detectConsolidation(candles, atr14)
  if (!zone) return noTrade(ctx, ['NO_TRADE: No valid consolidation zone detected'])

  // ── 4. Triangle apex guard ───────────────────────────────────────────────
  const currentIndex = candles.length - 1
  if (zone.apexPct !== null) {
    // Recompute with latest candle position
    const latestApex = computeApexPct(
      zone.resistanceLine,
      zone.supportLine,
      zone.formationStart,
      currentIndex,
    )
    if (latestApex !== null) zone.apexPct = latestApex

    if (zone.apexPct < 10) {
      return noTrade(ctx, ['NO_TRADE: Triangle undeveloped — apex < 10%'])
    }
    if (zone.apexPct > 90) {
      return noTrade(ctx, ['NO_TRADE: Triangle exhausted — apex > 90%'])
    }
  }

  // ── 5. Trendline lock (Fix 1) ────────────────────────────────────────────
  maybeLockTrendlines(zone, currentIndex)

  // ── 6. Session, HTF, RVOL ────────────────────────────────────────────────
  const last          = candles[currentIndex]
  const sessionActive = isActiveSession(last.timestamp)
  const htfDir        = ctx.htfTrendDirection ?? estimateHTFTrend(candles)
  const volumeAvail   = hasRealVolume(candles)
  const volumeRatio   = computeSessionRVOL(candles, currentIndex)

  // ── 7. Breakout / stop hunt detection (Fix 2 inside) ─────────────────────
  const rawEvent = detectBreakout(candles, zone, atr14, volumeRatio)
  if (!rawEvent) {
    return noTrade(ctx, ['NO_TRADE: No breakout detected on recent candles'])
  }

  // ── 8. False breakout guard ───────────────────────────────────────────────
  // A confirmed false breakout (non-stop-hunt) is disqualified immediately
  if (rawEvent.falseBreakout && !rawEvent.stopHuntDetected) {
    return noTrade(ctx, ['NO_TRADE: False breakout — price closed back inside zone'])
  }

  // For stop hunt reversals (Fix 2), require the current candle to confirm
  // by closing in the signal direction (i.e., reversal actually started)
  if (rawEvent.stopHuntDetected) {
    const confirmationCandle = candles[currentIndex]
    const isBullSignal = rawEvent.direction === 'BULLISH'
    // Must have a candle closing in signal direction with some body
    const body = Math.abs(confirmationCandle.close - confirmationCandle.open)
    const range = confirmationCandle.high - confirmationCandle.low
    const bodyRatio = range > 0 ? body / range : 0
    const directionOk = isBullSignal
      ? confirmationCandle.close > confirmationCandle.open
      : confirmationCandle.close < confirmationCandle.open
    if (!directionOk || bodyRatio < 0.3) {
      return noTrade(ctx, ['NO_TRADE: Stop hunt detected but reversal not yet confirmed'])
    }
  }

  // ── 9. Retest monitoring ─────────────────────────────────────────────────
  const event = checkRetest(candles, rawEvent, atr14)
  if (event.falseBreakout && !event.stopHuntDetected) {
    return noTrade(ctx, ['NO_TRADE: Retest failed — false breakout confirmed'])
  }

  // ── 10. HTF alignment ────────────────────────────────────────────────────
  const isBull    = event.direction === 'BULLISH'
  const htfAligned: boolean | null =
    htfDir === 'NEUTRAL' ? null :
    ((isBull && htfDir === 'BULLISH') || (!isBull && htfDir === 'BEARISH')) ? true : false

  // ── 11. Score ─────────────────────────────────────────────────────────────
  const scoring = scoreBreakout({
    zone,
    event,
    hasRealVolume:     volumeAvail,
    htfAligned,
    sessionActive,
    assetType,
    newsMinutesAway:    ctx.newsMinutesAway,
    rollingDrawdownPct: ctx.rollingDrawdownPct,
    consecutiveLosses:  ctx.consecutiveLosses,
  })

  // ── 12. Discard guard ────────────────────────────────────────────────────
  if (scoring.hardKilled || scoring.tier === 'discard') {
    return noTrade(ctx, scoring.reason)
  }

  // ── 13. Entry price (Fix 4: force limit on low timeframes) ───────────────
  const isLowTF     = LOW_TF_RETEST_ONLY.has(timeframe)
  const brokenLevel = isBull
    ? event.resistanceLevelAtBreakout
    : event.supportLevelAtBreakout

  let entryPrice: number
  let entryType: 'limit' | 'market'

  if (isLowTF) {
    // FIX 4: On 1m/5m always place limit at broken level — no chasing fast moves
    entryType  = 'limit'
    entryPrice = isBull
      ? brokenLevel + 0.1 * atr14    // slightly above for bull (fill margin)
      : brokenLevel - 0.1 * atr14    // slightly below for bear
  } else if (event.retestTriggered) {
    // Retest entry: limit at broken level + small tolerance
    entryType  = 'limit'
    entryPrice = isBull
      ? brokenLevel + 0.1 * atr14
      : brokenLevel - 0.1 * atr14
  } else if (event.stopHuntDetected) {
    // Stop hunt reversal: enter at current close (reversal already in motion)
    entryType  = 'market'
    entryPrice = last.close
  } else {
    // Chase entry on breakout candle close (higher timeframes)
    entryType  = 'market'
    entryPrice = last.close
  }

  // ── 14. SL ────────────────────────────────────────────────────────────────
  const slResult = calculateBreakoutSL(event, entryPrice, atr14)
  if (!slResult.valid) {
    return noTrade(ctx, [...scoring.reason, 'NO_TRADE: SL too wide (> 2× ATR) — skip'])
  }

  // ── 15. TPs ───────────────────────────────────────────────────────────────
  const tpResult = calculateBreakoutTPs(event, zone, entryPrice, atr14)

  // ── 16. Risk percentage ───────────────────────────────────────────────────
  let riskPct = getBreakoutRiskPct(scoring.tier)
  if ((ctx.consecutiveLosses ?? 0) >= 3) riskPct *= 0.5  // streak mitigation

  // ── 17. Assemble signal ───────────────────────────────────────────────────
  const resLevel = getTrendlinePrice(zone.resistanceLine, currentIndex)
  const supLevel = getTrendlinePrice(zone.supportLine,    currentIndex)
  const id       = `bk_${symbol}_${timeframe}_${last.timestamp}`

  return {
    id,
    strategy_id:          'breakout',
    signal:               isBull ? 'BUY' : 'SELL',
    symbol,
    timeframe,
    asset_type:           assetType,
    pattern_type:         zone.patternType,
    triangle_subtype:     zone.triangleSubtype,
    wedge_direction:      zone.wedgeDirection,
    resistance_level:     resLevel,
    support_level:        supLevel,
    range_height:         zone.rangeHeight,
    pattern_candles:      zone.formationCandles,
    apex_pct:             zone.apexPct,
    breakout_direction:   event.direction,
    body_close_confirmed: event.closeBeyondLevel,
    volume_ratio:         volumeRatio,
    stop_hunt_detected:   event.stopHuntDetected,
    false_breakout:       event.falseBreakout,
    retest_entry:         event.retestTriggered,
    score:                scoring.score,
    confidence_pct:       scoring.confidencePct,
    tier:                 scoring.tier,
    entry_type:           entryType,
    entry_price:          entryPrice,
    sl_price:             slResult.slPrice,
    tp1_price:            tpResult.tp1,
    tp2_price:            tpResult.tp2,
    tp3_trailing:         true,
    suggested_risk_pct:   riskPct,
    breakeven_price:      tpResult.breakevenPrice,
    htf_aligned:          htfAligned === true,
    prior_trend:          zone.priorTrend,
    prior_move_atr:       zone.prevMoveSize,
    session_active:       sessionActive,
    bsl_pool_target:      null,
    reason:               scoring.reason,
    timestamp:            last.timestamp,
  }
}
