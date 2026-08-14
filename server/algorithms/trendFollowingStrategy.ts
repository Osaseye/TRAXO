/**
 * TRAXO Trend Following — Strategy Orchestrator
 *
 * Entry point: analyzeTrendFollowing(context) → TrendFollowingSignal
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
  TrendDirection,
} from './trendFollowing/types'

const MIN_CANDLES = 50   // Hard minimum

function isOptimalSession(timestamp: string): boolean {
  try {
    const h = new Date(timestamp).getUTCHours()
    return (h >= 7 && h < 10) || (h >= 13 && h < 16)
  } catch {
    return false
  }
}

function buildId(symbol: string, tf: string, ts: string): string {
  return `tf_${symbol}_${tf}_${ts}`
}

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

export function analyzeTrendFollowing(ctx: TrendFollowingContext): TrendFollowingSignal {
  const { candles } = ctx

  if (candles.length < MIN_CANDLES) {
    return noTrade(ctx, [`NO_TRADE: Insufficient candles (${candles.length} < ${MIN_CANDLES})`])
  }

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

  const rawHighs  = detectSwingHighs(candles)
  const rawLows   = detectSwingLows(candles)
  const swingHighs = labelSwingHighs(rawHighs)
  const swingLows  = labelSwingLows(rawLows)

  const stackResult  = assessEMAStack(candles[lastIdx].close, ema20, ema50, ema200)
  const emaBias: TrendDirection = stackResult.direction === 'AMBIGUOUS' ? 'RANGING' : stackResult.direction
  const trendDir = determineTrend(swingHighs, swingLows, emaBias)

  if (trendDir === 'RANGING') {
    return noTrade(ctx, ['NO_TRADE: Market structure is RANGING — no trend following entries'])
  }

  const trendStrength = getTrendStrength(adxValue)

  if (adxValue > 0 && adxValue < 18) {
    return noTrade(ctx, [`NO_TRADE: ADX ${adxValue.toFixed(1)} < 18 — market not trending`])
  }

  const lastHH = getLastHH(swingHighs)
  const lastHL = getLastHL(swingLows)
  const lastLH = getLastLH(swingHighs)
  const lastLL = getLastLL(swingLows)

  const chochActive = detectCHoCH(trendDir, candles[lastIdx].close, lastHL, lastLH)

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

  const pullback = detectPullback(
    candles, trendDir,
    lastHH, lastHL, lastLH, lastLL,
    ema20, ema50, atr14,
  )

  if (!pullback.valid) {
    return noTrade(ctx, ['NO_TRADE: No valid pullback detected — trend may be mid-impulse'])
  }

  const entry = evaluateEntryTriggers(candles, pullback, vma20, trendDir, atr14)

  if (!entry.triggered) {
    return noTrade(ctx, ['NO_TRADE: Price not in any qualifying entry zone (T1/T2/T3)'])
  }

  const lastSwingIndex = trendDir === 'BULLISH'
    ? (lastHL?.index ?? 0)
    : (lastLH?.index ?? 0)
  const candlesSinceSwing = lastIdx - lastSwingIndex
  const trendExhausted = detectTrendExhaustion(candlesSinceSwing, atr14, atrArr)

  const inOptimalSession = isOptimalSession(candles[lastIdx].timestamp)

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

  const direction: 'BUY' | 'SELL' = trendDir === 'BULLISH' ? 'BUY' : 'SELL'
  const slResult = calculateSL(direction, pullback.pullbackExtremePrice, atr14, entry.entryPrice)

  if (slResult.rejected) {
    return noTrade(ctx, [`NO_TRADE: ${slResult.rejectionReason}`])
  }

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

  const breakevenPrice = calculateBreakevenPrice(direction, entry.entryPrice, atr14)
  const suggestedRisk = getRiskPct(scoring.tier)

  return {
    id: buildId(ctx.symbol, ctx.timeframe, candles[lastIdx].timestamp),
    strategy_id: 'trend_following',
    signal: direction,
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    asset_type: ctx.asset_type,
    trend_direction: trendDir,
    trend_strength: trendStrength,
    adx_value: Number(adxValue.toFixed(1)),
    ema_stack: stackResult.status,
    ema20: Number(ema20.toFixed(5)),
    ema50: Number(ema50.toFixed(5)),
    ema200: Number(ema200.toFixed(5)),
    last_hh_price: lastHH?.price ?? null,
    last_hl_price: lastHL?.price ?? null,
    choch_active: chochActive,
    pullback_depth_pct: Number(pullback.depth.toFixed(1)),
    fib_r382: Number(pullback.fibR382.toFixed(5)),
    fib_r500: Number(pullback.fibR500.toFixed(5)),
    fib_r618: Number(pullback.fibR618.toFixed(5)),
    fib_r786: Number(pullback.fibR786.toFixed(5)),
    ote_zone_high: Number(pullback.oteZoneHigh.toFixed(5)),
    ote_zone_low: Number(pullback.oteZoneLow.toFixed(5)),
    internal_liq_swept: pullback.internalLiqSwept,
    entry_trigger: entry.trigger,
    ltf_confirmation: entry.ltfConfirmation,
    score: scoring.score,
    confidence_pct: scoring.confidence_pct,
    tier: scoring.tier,
    entry_type: 'limit',
    entry_price: Number(entry.entryPrice.toFixed(5)),
    sl_price: Number(slResult.slPrice.toFixed(5)),
    tp1_price: Number(tps.tp1Price.toFixed(5)),
    tp2_price: Number(tps.tp2Price.toFixed(5)),
    fib_extension_161_8: Number(tps.fib1618Extension.toFixed(5)),
    suggested_risk_pct: suggestedRisk,
    breakeven_price: Number(breakevenPrice.toFixed(5)),
    trailing_sl_price: null,
    reason: scoring.reason,
    timestamp: candles[lastIdx].timestamp,
  }
}
