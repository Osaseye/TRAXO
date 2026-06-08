import type { SignalDirection, Timeframe } from '@/types'
import { resolveWickRejectionSession } from './wickRejectionContext.ts'

export type WickRejectionAssetType = 'STOCKS' | 'CRYPTO' | 'FOREX'
export type WickRejectionTier = 'prime' | 'standard' | 'aggressive' | 'discard'
export type WickRejectionSession = 'normal' | 'london_ny_overlap' | 'off_hours' | 'opening_bell'
export type WickRejectionHTFBias = 'bullish' | 'bearish' | 'neutral'
export type WickRejectionZoneType = 'support' | 'resistance' | 'equal_highs' | 'equal_lows' | 'fvg'

export interface WickRejectionCandle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp?: string
}

export interface WickRejectionContext {
  symbol: string
  assetType: WickRejectionAssetType
  timeframe: Timeframe
  candle: WickRejectionCandle
  confirmationCandle?: WickRejectionCandle
  atr14: number
  volumeMa20: number
  nearestZone: number | null
  zoneType?: WickRejectionZoneType
  htfBias?: WickRejectionHTFBias
  htfCacheStatus?: 'fresh' | 'stale' | 'failed'
  session?: WickRejectionSession
  newsMinutesAway?: number | null
  earningsHoursAway?: number | null
  rollingDrawdownPct?: number
  consecutiveLosses?: number
  expiryCandles?: number
  riskBudgetPct?: number
  /**
   * Fraction of entry price applied to widen entry/SL for spread and execution
   * slip. Defaults: FOREX 0.00005 (0.5 pip), CRYPTO 0.001 (0.1%).
   */
  slippagePct?: number
  /** Pre-calculated recent swing highs above current price (external liquidity). */
  swingHighs?: number[]
  /** Pre-calculated recent swing lows below current price (external liquidity). */
  swingLows?: number[]
  /**
   * Identified order block zone — the last opposite-direction candle before a
   * significant institutional move. Scored when the wick rejection candle
   * touches or sits within this zone.
   */
  orderBlockZone?: { high: number; low: number; type: 'bullish' | 'bearish' }
}

export interface WickRejectionSignal {
  id: string
  strategy_id: 'wick_rejection'
  signal: SignalDirection
  symbol: string
  asset_type: WickRejectionAssetType
  score: number
  confidence_pct: number
  tier: WickRejectionTier
  entry_type: 'market' | 'limit'
  entry_price: number
  limit_entry_price: number | null
  sl_price: number
  tp1_price: number
  tp2_price: number
  time_decay_limit: number
  suggested_risk_pct: number
  liquidity_sweep: boolean
  fvg_confluence: boolean
  htf_aligned: boolean
  order_block_confluence: boolean
  session_override: boolean
  /** 'structure' = TP pinned to a real swing level; 'rr' = flat risk-reward fallback */
  tp1_source: 'structure' | 'rr'
  tp2_source: 'structure' | 'rr'
  /** Slippage fraction actually applied to entry price */
  slippage_pct: number
  reason: string[]
  timestamp: string
}

interface CandleGeometry {
  body: number
  upperWick: number
  lowerWick: number
  wickMax: number
  wickRatio: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits))
}

function geometry(candle: WickRejectionCandle): CandleGeometry {
  const body = Math.abs(candle.open - candle.close)
  const upperWick = candle.high - Math.max(candle.open, candle.close)
  const lowerWick = Math.min(candle.open, candle.close) - candle.low
  const wickMax = Math.max(upperWick, lowerWick)

  return {
    body,
    upperWick,
    lowerWick,
    wickMax,
    wickRatio: body <= Number.EPSILON ? Number.POSITIVE_INFINITY : wickMax / body,
  }
}

function isCrypto(assetType: WickRejectionAssetType) {
  return assetType === 'CRYPTO'
}

/**
 * SL buffer is deliberately wider than entry buffer to survive stop-hunt wicks.
 * Prime setups use 0.75x ATR; all others use 1.0x ATR (wider = more conservative
 * to account for lower confidence).  Crypto gets an extra 50% on top.
 */
function slBuffer(assetType: WickRejectionAssetType, tier: WickRejectionTier, atr14: number) {
  const base = tier === 'prime' ? 0.75 : 1.0
  const multiplier = assetType === 'CRYPTO' ? base * 1.5 : base
  return atr14 * multiplier
}

function scoreToConfidence(score: number, tier: WickRejectionTier) {
  if (tier === 'prime') return clamp(85 + (score - 10) * 2, 85, 99)
  if (tier === 'standard') return clamp(70 + (score - 8) * 4, 70, 84)
  if (tier === 'aggressive') return clamp(50 + (score - 6) * 9, 50, 69)
  return 0
}

function scoreToRiskPct(tier: WickRejectionTier, consecutiveLosses = 0) {
  const base = tier === 'prime' ? 1.5 : tier === 'standard' ? 1.0 : tier === 'aggressive' ? 0.5 : 0
  return consecutiveLosses >= 3 ? round(base * 0.5, 2) : base
}

function tierFromScore(score: number): WickRejectionTier {
  if (score >= 10) return 'prime'
  if (score >= 8) return 'standard'
  if (score >= 6) return 'aggressive'
  return 'discard'
}

function buildSignalId(symbol: string, timestamp?: string) {
  return `wick-rejection-${symbol}-${timestamp ?? new Date().toISOString()}`
}

function noTradeSignal(
  context: WickRejectionContext,
  now: string,
  reason: string[],
  overrides: Partial<WickRejectionSignal> = {}
): WickRejectionSignal {
  return {
    id: buildSignalId(context.symbol, now),
    strategy_id: 'wick_rejection',
    signal: 'NO_TRADE',
    symbol: context.symbol,
    asset_type: context.assetType,
    score: 0,
    confidence_pct: 0,
    tier: 'discard',
    entry_type: 'market',
    entry_price: 0,
    limit_entry_price: null,
    sl_price: 0,
    tp1_price: 0,
    tp2_price: 0,
    time_decay_limit: context.expiryCandles ?? 5,
    suggested_risk_pct: 0,
    liquidity_sweep: false,
    fvg_confluence: false,
    htf_aligned: false,
    order_block_confluence: false,
    session_override: false,
    tp1_source: 'rr',
    tp2_source: 'rr',
    slippage_pct: 0,
    reason,
    timestamp: now,
    ...overrides,
  }
}

function isNewsKill(newsMinutesAway?: number | null) {
  return typeof newsMinutesAway === 'number' && newsMinutesAway >= 0 && newsMinutesAway <= 30
}

function volumeMultiplier(candle: WickRejectionCandle, volumeMa20: number) {
  if (volumeMa20 <= 0) return 0
  return candle.volume / volumeMa20
}

function limitEntryPrice(assetType: WickRejectionAssetType, candle: WickRejectionCandle, direction: SignalDirection) {
  const midpoint = direction === 'BUY'
    ? candle.low + (Math.min(candle.open, candle.close) - candle.low) * 0.5
    : candle.high - (candle.high - Math.max(candle.open, candle.close)) * 0.5

  return round(midpoint, isCrypto(assetType) ? 2 : 6)
}

function takeProfit(entry: number, sl: number, direction: SignalDirection, rr: number) {
  const risk = Math.abs(entry - sl)
  return direction === 'BUY' ? round(entry + risk * rr) : round(entry - risk * rr)
}

/**
 * Internal-to-External liquidity TP targeting.
 * Finds the nearest real structural swing level in the trade direction at least
 * 0.8R away. Falls back to flat RR multiples when no structural level exists.
 */
function i2eTargets(
  entry: number,
  sl: number,
  direction: SignalDirection,
  swingHighs: number[],
  swingLows: number[],
  rr1: number,
  rr2: number,
): { tp1: number; tp2: number; tp1_source: 'structure' | 'rr'; tp2_source: 'structure' | 'rr' } {
  const minRisk = Math.abs(entry - sl)
  const dp = 6

  if (direction === 'BUY') {
    const targets = swingHighs
      .filter((h) => h > entry + minRisk * 0.8)
      .sort((a, b) => a - b)
    const tp1 = targets[0] != null ? round(targets[0], dp) : takeProfit(entry, sl, direction, rr1)
    const tp2 = targets[1] != null ? round(targets[1], dp) : takeProfit(entry, sl, direction, rr2)
    return {
      tp1,
      tp2,
      tp1_source: targets[0] != null ? 'structure' : 'rr',
      tp2_source: targets[1] != null ? 'structure' : 'rr',
    }
  } else {
    const targets = swingLows
      .filter((l) => l < entry - minRisk * 0.8)
      .sort((a, b) => b - a)
    const tp1 = targets[0] != null ? round(targets[0], dp) : takeProfit(entry, sl, direction, rr1)
    const tp2 = targets[1] != null ? round(targets[1], dp) : takeProfit(entry, sl, direction, rr2)
    return {
      tp1,
      tp2,
      tp1_source: targets[0] != null ? 'structure' : 'rr',
      tp2_source: targets[1] != null ? 'structure' : 'rr',
    }
  }
}

function stopLoss(assetType: WickRejectionAssetType, candle: WickRejectionCandle, direction: SignalDirection, atr14: number, tier: WickRejectionTier) {
  const buffer = slBuffer(assetType, tier, atr14)
  const price = direction === 'BUY' ? candle.low - buffer : candle.high + buffer
  return round(price, isCrypto(assetType) ? 2 : 6)
}

function sessionBonus(session?: WickRejectionSession) {
  if (session === 'london_ny_overlap') return 1
  if (session === 'opening_bell') return -3
  if (session === 'off_hours') return -1
  return 0
}

function htfAlignment(direction: SignalDirection, bias?: WickRejectionHTFBias, cacheStatus: 'fresh' | 'stale' | 'failed' = 'fresh') {
  if (cacheStatus === 'failed') return { aligned: false, points: -2 }
  if (!bias || bias === 'neutral') return { aligned: false, points: cacheStatus === 'stale' ? -1 : 0 }

  const aligned = (direction === 'BUY' && bias === 'bullish') || (direction === 'SELL' && bias === 'bearish')
  if (!aligned) return { aligned: false, points: cacheStatus === 'stale' ? -1 : -2 }

  return { aligned: true, points: cacheStatus === 'stale' ? 1 : 2 }
}

function liquiditySweep(direction: SignalDirection, candle: WickRejectionCandle, zone: number, atr14: number) {
  const wickTip = direction === 'BUY' ? candle.low : candle.high
  const distance = Math.abs(wickTip - zone)
  const reclaimDistance = Math.abs(candle.close - zone)
  const closeBackInside = direction === 'BUY'
    ? candle.close > zone && reclaimDistance <= atr14 * 0.3
    : candle.close < zone && reclaimDistance <= atr14 * 0.3
  const piercesZone = direction === 'BUY' ? candle.low <= zone : candle.high >= zone

  return {
    hit: piercesZone && distance <= atr14 * 0.3 && closeBackInside,
    wickTip,
    distance,
    reclaimDistance,
    closeBackInside,
    piercesZone,
  }
}

export function analyzeWickRejection(context: WickRejectionContext): WickRejectionSignal {
  const { candle } = context
  const g = geometry(candle)
  const now = candle.timestamp ?? new Date().toISOString()
  const session = context.session ?? resolveWickRejectionSession(context.assetType, now)
  const reasons: string[] = []

  if (context.rollingDrawdownPct !== undefined && context.rollingDrawdownPct >= 4) {
    return noTradeSignal(context, now, ['Daily kill switch triggered by rolling drawdown.'])
  }

  if (context.assetType === 'STOCKS' && typeof context.earningsHoursAway === 'number' && context.earningsHoursAway <= 24) {
    return noTradeSignal(context, now, [`Earnings block active (${context.earningsHoursAway} hours away).`])
  }

  if (context.assetType === 'STOCKS' && session === 'opening_bell') {
    return noTradeSignal(context, now, ['Rejected by stock opening bell rule (09:30–10:00 EST).'], { session_override: true })
  }

  if (g.body <= Number.EPSILON || g.wickRatio < 2) {
    return noTradeSignal(context, now, ['Failed anatomy test: wick/body ratio below 2:1.'])
  }

  const direction: SignalDirection = g.lowerWick > g.upperWick ? 'BUY' : 'SELL'
  const zone = context.nearestZone
  let score = 0

  if (isNewsKill(context.newsMinutesAway)) {
    score -= 3
    reasons.push(`High-impact news event in ${context.newsMinutesAway} minutes.`)
  }

  if (g.wickRatio >= 3) {
    score += 3
    reasons.push('Elite wick ratio confirmed (>= 3:1).')
  } else {
    score += 2
    reasons.push('Standard wick ratio confirmed (>= 2:1).')
  }

  if (zone === null) {
    score -= 2
    reasons.push('No identifiable zone nearby; setup is floating in space.')
  }

  let sweepHit = false
  if (zone !== null) {
    const sweep = liquiditySweep(direction, candle, zone, context.atr14)
    sweepHit = sweep.hit

    if (sweep.hit) {
      // Zone touch (+2) + liquidity sweep tracked (+1)
      score += 3
      if (context.zoneType === 'fvg') {
        score += 1
        reasons.push('Fair value gap confluence added extra magnetic-zone weight.')
      }
      reasons.push('Liquidity sweep tracked into a nearby key level.')
      reasons.push(`Zone touch validated within ${(context.atr14 * 0.3).toFixed(4)} ATR tolerance.`)
    } else {
      score -= 2
      reasons.push('Wick did not cleanly sweep and reclaim the nearest zone.')
    }
  }

  const volumeAvailable = candle.volume > 0 && context.volumeMa20 > 0
  if (!volumeAvailable) {
    reasons.push('Volume data unavailable — volume filter skipped (neutral).')
  } else {
    const volumeX = volumeMultiplier(candle, context.volumeMa20)
    const cryptoThreshold = isCrypto(context.assetType) ? 2 : 1.5
    if (volumeX >= cryptoThreshold) {
      score += 2
      reasons.push(`Volume expansion confirmed at ${volumeX.toFixed(2)}x volume MA.`)
    } else {
      score -= 1
      reasons.push(`Volume failed to validate (${volumeX.toFixed(2)}x volume MA).`)
    }
  }

  const htf = htfAlignment(direction, context.htfBias, context.htfCacheStatus ?? 'fresh')
  if (htf.points > 0) {
    score += htf.points
    reasons.push('HTF trend alignment confirmed.')
  } else if (htf.points < 0) {
    score += htf.points
    reasons.push('Counter HTF trend detected.')
  }

  if (context.confirmationCandle) {
    const c = context.confirmationCandle
    if (direction === 'BUY') {
      const confirmed = c.close > c.open
      if (confirmed) {
        score += 2
        reasons.push('Confirmation candle closed in reversal direction.')
      }
    } else {
      const confirmed = c.close < c.open
      if (confirmed) {
        score += 2
        reasons.push('Confirmation candle closed in reversal direction.')
      }
    }
  } else {
    reasons.push('Confirmation candle not provided; reversal confirmation was not scored.')
  }

  const sessionPoints = sessionBonus(session)
  score += sessionPoints
  if (sessionPoints > 0) reasons.push('Optimal trading session confirmed.')
  if (sessionPoints < 0) reasons.push('Dead liquidity session or restricted market window.')

  if (context.assetType === 'FOREX' && session === 'off_hours') {
    score -= 1
    reasons.push('Forex trade penalized outside London/NY overlap.')
  }

  // Order block confluence — +2 when wick rejection candle sits inside an
  // institutional order block zone that aligns with trade direction.
  let obConfluence = false
  if (context.orderBlockZone) {
    const ob = context.orderBlockZone
    const inZone = candle.low <= ob.high && candle.high >= ob.low
    const aligned =
      (direction === 'BUY' && ob.type === 'bullish') ||
      (direction === 'SELL' && ob.type === 'bearish')
    if (inZone && aligned) {
      obConfluence = true
      score += 2
      reasons.push('Order block confluence — institutional footprint detected.')
    }
  }

  score = Math.min(score, 14)

  const tier = tierFromScore(score)
  if (tier === 'discard') {
    return noTradeSignal(context, now, reasons, {
      score: Math.max(0, score),
      liquidity_sweep: sweepHit,
      fvg_confluence: context.zoneType === 'fvg',
      htf_aligned: htf.aligned,
      session_override: session === 'opening_bell',
    })
  }

  const confidence_pct = scoreToConfidence(score, tier)
  const sl = stopLoss(context.assetType, candle, direction, context.atr14, tier)

  // Apply slippage to entry: BUY fills slightly above close, SELL slightly below.
  const digits = isCrypto(context.assetType) ? 2 : 6
  const defaultSlippage = isCrypto(context.assetType) ? 0.001 : 0.00005
  const slippagePct = context.slippagePct ?? defaultSlippage
  const rawEntry = round(candle.close, digits)
  const entry = direction === 'BUY'
    ? round(rawEntry * (1 + slippagePct), digits)
    : round(rawEntry * (1 - slippagePct), digits)

  const rr1 = 1.5
  const rr2 = 2.5
  const tpResult = i2eTargets(
    entry,
    sl,
    direction,
    context.swingHighs ?? [],
    context.swingLows ?? [],
    rr1,
    rr2,
  )

  const useLimit = tier !== 'aggressive' && g.wickRatio >= 2.5 && sweepHit
  const limitPrice = useLimit ? limitEntryPrice(context.assetType, candle, direction) : null

  return {
    id: buildSignalId(context.symbol, now),
    strategy_id: 'wick_rejection',
    signal: direction,
    symbol: context.symbol,
    asset_type: context.assetType,
    score: Math.max(0, score),
    confidence_pct,
    tier,
    entry_type: useLimit ? 'limit' : 'market',
    entry_price: entry,
    limit_entry_price: limitPrice,
    sl_price: sl,
    tp1_price: tpResult.tp1,
    tp2_price: tpResult.tp2,
    time_decay_limit: context.expiryCandles ?? 5,
    suggested_risk_pct: scoreToRiskPct(tier, context.consecutiveLosses ?? 0),
    liquidity_sweep: sweepHit,
    fvg_confluence: context.zoneType === 'fvg',
    htf_aligned: htf.aligned,
    order_block_confluence: obConfluence,
    session_override: session === 'opening_bell',
    tp1_source: tpResult.tp1_source,
    tp2_source: tpResult.tp2_source,
    slippage_pct: slippagePct,
    reason: reasons,
    timestamp: now,
  }
}
