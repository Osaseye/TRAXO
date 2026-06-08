/**
 * TRAXO Trend Following — Strategy Orchestrator
 *
 * Entry point: analyzeTrendFollowing(context) → TrendFollowingSignal
 *
 * Execution pipeline (follows Section 3–9 specification order):
 *  1. Guard: minimum candle count (220 recommended for EMA-200 warmup)
 *  2. Compute indicators: ATR, EMA-20/50/200, ADX-14, VMA-20
 *  3. Detect swing points + label HH/HL/LH/LL
 *  4. Determine trend direction
 *  5. Assess EMA stack + ADX strength
 *  6. Detect CHoCH (trend invalidation)
 *  7. Detect pullback + Fibonacci levels + FVG/OB zones
 *  8. Evaluate entry triggers (T1 / T2 / T3)
 *  9. Detect trend exhaustion
 * 10. Score signal (14-point matrix)
 * 11. Tier guard: DISCARD → NO_TRADE
 * 12. Calculate SL (ATR gate check)
 * 13. Calculate TPs (structural + RR fallback)
 * 14. Assemble and return TrendFollowingSignal
 */

import { computeEMA, computeSMA, computeATR, computeADX, assessEMAStack, getTrendStrength } from './trendFollowing/emaEngine'
import {
  detectSwingHighs,
  detectSwingLows,
  labelSwingHighs,
  labelSwingLows,
  determineTrend,
  detectCHoCH,
  getLastHH, getLastHL, getLastLH, getLastLL,
} from './trendFollowing/structureEngine'
import { detectPullback } from './trendFollowing/pullbackEngine'
import { evaluateEntryTriggers } from './trendFollowing/entryEngine'
import { scoreTrendFollowing } from './trendFollowing/confluenceEngine'
import { calculateSL, calculateTPs, calculateBreakevenPrice, getRiskPct, detectTrendExhaustion } from './trendFollowing/riskEngine'
import type {
  TrendFollowingContext,
  TrendFollowingSignal,
  TrendState,
} from './trendFollowing/types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MIN_CANDLES = 50   // Hard minimum

// ─────────────────────────────────────────────
// Session Detection (London / NY heuristic)
// ─────────────────────────────────────────────

function isOptimalSession(timestamp: string): boolean {
  try {
    const h = new Date(timestamp).getUTCHours()
    // London open: 07:00–10:00 UTC  |  NY open: 13:00–16:00 UTC
    return (h >= 7 && h < 10) || (h >= 13 && h < 16)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// Signal ID
// ─────────────────────────────────────────────

function buildId(symbol: string, tf: string, ts: string): string {
  return `tf_${symbol}_${tf}_${ts}`
}

// ─────────────────────────────────────────────
// NO_TRADE factory
// ─────────────────────────────────────────────

function noTrade(ctx: TrendFollowingContext, reason: string[]): TrendFollowingSignal {
  const ts = new Date().toISOString()
  return {
    id: buildId(ctx.symbol, ctx.timeframe, ts),
    strategy_id: 'trend_following',
    signal: 'NO_TRADE',
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    asset_type: ctx.asset_type,
    trend_direction: 'RANGING',
    trend_strength: 'WEAK',
    adx_value: 0,
    ema_stack: 'MESSY',
    ema20: 0, ema50: 0, ema200: 0,
    last_hh_price: null, last_hl_price: null,
    choch_active: false,
    pullback_depth_pct: 0,
    fib_r382: 0, fib_r500: 0, fib_r618: 0, fib_r786: 0,
    ote_zone_high: 0, ote_zone_low: 0,
    internal_liq_swept: false,
    entry_trigger: null,
    ltf_confirmation: 'NO_CONFIRMATION',
    score: 0, confidence_pct: 0, tier: 'discard',
    entry_type: 'limit', entry_price: 0,
    sl_price: 0, tp1_price: 0, tp2_price: 0,
    fib_extension_161_8: 0,
    suggested_risk_pct: 0, breakeven_price: 0, trailing_sl_price: null,
    reason,
    timestamp: ts,
  }
}

// ─────────────────────────────────────────────
// Main Orchestrator
// ─────────────────────────────────────────────

export function analyzeTrendFollowing(ctx: TrendFollowingContext): TrendFollowingSignal {
  const { candles } = ctx

  // ── 1. Guard ──────────────────────────────────────────────────────────────
  if (candles.length < MIN_CANDLES) {
    return noTrade(ctx, [`NO_TRADE: Insufficient candles (${candles.length} < ${MIN_CANDLES})`])
  }

  // ── 2. Indicators ─────────────────────────────────────────────────────────
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)

  const atrArr  = computeATR(candles)
  const ema20Arr = computeEMA(closes, 20)
  const ema50Arr = computeEMA(closes, 50)
  const ema200Arr= computeEMA(closes, 200)
  const adxArr  = computeADX(candles)
  const vma20Arr = computeSMA(volumes, 20)

  const lastIdx  = candles.length - 1
  const atr14    = atrArr[lastIdx]  ?? atrArr[atrArr.length - 1] ?? 0
  const ema20    = ema20Arr[lastIdx] ?? 0
  const ema50    = ema50Arr[lastIdx] ?? 0
  const ema200   = ema200Arr[lastIdx] ?? 0
  const adxValue = adxArr[lastIdx]  ?? 0
  const vma20    = vma20Arr[lastIdx] ?? 0

  if (atr14 === 0) {
    return noTrade(ctx, ['NO_TRADE: ATR calculation failed (insufficient data)'])
  }

  // ── 3. Swing Points + Labelling ───────────────────────────────────────────
  const rawHighs  = detectSwingHighs(candles)
  const rawLows   = detectSwingLows(candles)
  const swingHighs = labelSwingHighs(rawHighs)
  const swingLows  = labelSwingLows(rawLows)

  // ── 4. Trend Direction ────────────────────────────────────────────────────
  const trendDir = determineTrend(swingHighs, swingLows)

  if (trendDir === 'RANGING') {
    return noTrade(ctx, ['NO_TRADE: Market structure is RANGING — no trend following entries'])
  }

  // ── 5. EMA Stack + ADX ───────────────────────────────────────────────────
  const stackResult  = assessEMAStack(candles[lastIdx].close, ema20, ema50, ema200)
  const trendStrength = getTrendStrength(adxValue)

  // ADX hard block for ranging (< 20)
  if (adxValue > 0 && adxValue < 20) {
    return noTrade(ctx, [`NO_TRADE: ADX ${adxValue.toFixed(1)} < 20 — market not trending`])
  }

  // ── 6. Named Swing Points ─────────────────────────────────────────────────
  const lastHH = getLastHH(swingHighs)
  const lastHL = getLastHL(swingLows)
  const lastLH = getLastLH(swingHighs)
  const lastLL = getLastLL(swingLows)

  // ── 7. CHoCH Detection ────────────────────────────────────────────────────
  const chochActive = detectCHoCH(trendDir, candles[lastIdx].close, lastHL, lastLH)

  // Build TrendState (for downstream use)
  const trendState: TrendState = {
    direction:    trendDir,
    strength:     trendStrength,
    emaStack:     stackResult.status,
    emaStackBias: stackResult.direction,
    swingHighs, swingLows,
    lastHH, lastHL, lastLH, lastLL,
    chochActive,
    adxValue, ema20, ema50, ema200,
    atr14, vma20,
  }
  void trendState

  // ── 8. Pullback Detection ─────────────────────────────────────────────────
  const pullback = detectPullback(
    candles, trendDir,
    lastHH, lastHL, lastLH, lastLL,
    ema20, ema50, atr14,
  )

  if (!pullback.valid) {
    return noTrade(ctx, ['NO_TRADE: No valid pullback detected — trend may be mid-impulse'])
  }

  // ── 9. Entry Trigger Evaluation ───────────────────────────────────────────
  const entry = evaluateEntryTriggers(candles, pullback, vma20, trendDir, atr14)

  if (!entry.triggered) {
    return noTrade(ctx, ['NO_TRADE: Price not in any qualifying entry zone (T1/T2/T3)'])
  }

  // ── 10. Trend Exhaustion ──────────────────────────────────────────────────
  const lastSwingIndex = trendDir === 'BULLISH'
    ? (lastHL?.index ?? 0)
    : (lastLH?.index ?? 0)
  const candlesSinceSwing = lastIdx - lastSwingIndex
  const trendExhausted = detectTrendExhaustion(candlesSinceSwing, atr14, atrArr)

  // ── 11. Session ───────────────────────────────────────────────────────────
  const inOptimalSession = isOptimalSession(candles[lastIdx].timestamp)

  // ── 12. Confidence Scoring ────────────────────────────────────────────────
  const scoring = scoreTrendFollowing({
    direction:         trendDir,
    emaStack:          stackResult.status,
    adxValue,
    chochActive,
    pullback,
    entry,
    vma20,
    avgPullbackVolume: pullback.avgPullbackVolume,
    entryVolumeRatio:  entry.volumeAtTrigger,
    htfTrendDirection: ctx.htfTrendDirection,
    htfAdx:            ctx.htfAdx,
    newsMinutesAway:   ctx.newsMinutesAway,
    consecutiveLosses: ctx.consecutiveLosses,
    rollingDrawdownPct: ctx.rollingDrawdownPct,
    inOptimalSession,
    trendExhausted,
  })

  if (scoring.hardKilled || scoring.tier === 'discard') {
    return noTrade(ctx, scoring.reason)
  }

  // ── 13. SL Calculation + ATR Gate ─────────────────────────────────────────
  const direction: 'BUY' | 'SELL' = trendDir === 'BULLISH' ? 'BUY' : 'SELL'
  const slResult = calculateSL(direction, pullback.pullbackExtremePrice, atr14, entry.entryPrice)

  if (slResult.rejected) {
    return noTrade(ctx, [`NO_TRADE: ${slResult.rejectionReason}`])
  }

  // ── 14. TP Geometry ───────────────────────────────────────────────────────
  const impulseRange = trendDir === 'BULLISH'
    ? Math.abs((lastHH?.price ?? entry.entryPrice) - (lastHL?.price ?? entry.entryPrice))
    : Math.abs((lastLH?.price ?? entry.entryPrice) - (lastLL?.price ?? entry.entryPrice))

  const tps = calculateTPs(
    direction,
    entry.entryPrice,
    slResult.riskDistance,
    lastHH?.price ?? null,
    lastLL?.price ?? null,
    impulseRange,
  )

  const breakeven = calculateBreakevenPrice(direction, entry.entryPrice, atr14)

  // ── 15. Assemble Signal ───────────────────────────────────────────────────
  const ts = new Date().toISOString()
  return {
    id:             buildId(ctx.symbol, ctx.timeframe, ts),
    strategy_id:    'trend_following',
    signal:         direction,
    symbol:         ctx.symbol,
    timeframe:      ctx.timeframe,
    asset_type:     ctx.asset_type,

    trend_direction: trendDir,
    trend_strength:  trendStrength,
    adx_value:       adxValue,
    ema_stack:       stackResult.status,
    ema20, ema50, ema200,
    last_hh_price:   lastHH?.price ?? null,
    last_hl_price:   lastHL?.price ?? null,
    choch_active:    chochActive,

    pullback_depth_pct: pullback.depth,
    fib_r382:  pullback.fibR382,
    fib_r500:  pullback.fibR500,
    fib_r618:  pullback.fibR618,
    fib_r786:  pullback.fibR786,
    ote_zone_high: pullback.oteZoneHigh,
    ote_zone_low:  pullback.oteZoneLow,
    internal_liq_swept: pullback.internalLiqSwept,

    entry_trigger:    entry.trigger,
    ltf_confirmation: entry.ltfConfirmation,

    score:          scoring.score,
    confidence_pct: scoring.confidence_pct,
    tier:           scoring.tier,

    entry_type:  'limit',
    entry_price: entry.entryPrice,
    sl_price:    slResult.slPrice,
    tp1_price:   tps.tp1Price,
    tp2_price:   tps.tp2Price,
    fib_extension_161_8: tps.fib1618Extension,
    suggested_risk_pct: getRiskPct(scoring.tier),
    breakeven_price:    breakeven,
    trailing_sl_price:  null,   // Set by trade management layer post-entry

    reason:    scoring.reason,
    timestamp: ts,
  }
}
