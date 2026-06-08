// ─── Supply & Demand Scoring Engine (14-Point Confidence Matrix) ─────────────
// Phase 4 per spec §6, incorporating Refinement 3 per-asset circuit breakers

import type { SupplyDemandZone, SDTier } from './types'

// ─── Session helpers ─────────────────────────────────────────────────────────

/** Returns true if the current UTC time falls within London or NY sessions. */
export function isActiveSession(): boolean {
  const now  = new Date()
  const hour = now.getUTCHours()
  // London: 07:00–16:00 UTC  |  New York: 12:00–21:00 UTC
  return (hour >= 7 && hour < 16) || (hour >= 12 && hour < 21)
}

/** Returns true if current UTC time is in Asian session only (00:00–07:00). */
export function isAsianSession(): boolean {
  const hour = new Date().getUTCHours()
  return hour >= 0 && hour < 7
}

/** Returns true if the mitigation level is near a round number (integer multiple). */
function isRoundNumber(price: number, atr14: number): boolean {
  const roundInterval = Math.pow(10, Math.floor(Math.log10(price)) - 1) * 10
  const mod = price % roundInterval
  return Math.min(mod, roundInterval - mod) < 0.1 * atr14
}

// ─── Scoring Options ─────────────────────────────────────────────────────────

export interface SDScoringOptions {
  zone:                    SupplyDemandZone
  atr14:                   number
  htfZoneNested:           boolean          // LTF zone sits inside HTF zone of same type
  /** Minutes until next high-impact news (negative = event is past) */
  newsMinutesAway?:        number
  htfTrendDirection?:      'BULLISH' | 'BEARISH' | 'NEUTRAL'
  /** Refinement 3: per-symbol drawdown — 2% triggers symbol kill switch */
  perSymbolDrawdownPct?:   number
  perSymbolConsecLosses?:  number
  /** Global circuit breakers */
  rollingDrawdownPct?:     number
  consecutiveLosses?:      number
}

export interface SDScoringResult {
  score:          number
  tier:           SDTier
  confidence_pct: number
  no_trade:       boolean
  reason:         string[]
}

// ─── 14-Point Matrix ──────────────────────────────────────────────────────────

export function scoreSupplyDemand(opts: SDScoringOptions): SDScoringResult {
  const {
    zone,
    atr14,
    htfZoneNested,
    newsMinutesAway,
    htfTrendDirection,
    perSymbolDrawdownPct,
    perSymbolConsecLosses,
    rollingDrawdownPct,
    consecutiveLosses,
  } = opts

  const reason: string[] = []
  let score = 0

  // ── Global circuit breaker (Refinement 3 + spec §7.1) ───────────────────
  if ((rollingDrawdownPct ?? 0) >= 4.0) {
    reason.push('GLOBAL_KILL: rolling drawdown ≥ 4%')
    return { score: 0, tier: 'discard', confidence_pct: 0, no_trade: true, reason }
  }

  // ── Per-asset circuit breaker (Refinement 3) ────────────────────────────
  if ((perSymbolDrawdownPct ?? 0) >= 2.0) {
    reason.push('SYMBOL_KILL: per-symbol drawdown ≥ 2%')
    return { score: 0, tier: 'discard', confidence_pct: 0, no_trade: true, reason }
  }

  // ── Base from zone quality score ─────────────────────────────────────────
  if (zone.quality_score >= 9) {
    score += 3
    reason.push('+3 prime zone quality (9–10)')
  } else if (zone.quality_score >= 7) {
    score += 2
    reason.push('+2 standard zone quality (7–8)')
  } else {
    reason.push(`zone quality too low (${zone.quality_score})`)
    return { score: 0, tier: 'discard', confidence_pct: 0, no_trade: true, reason }
  }

  // ── HTF zone confluence (nesting bonus) ──────────────────────────────────
  if (htfZoneNested) {
    score += 2
    reason.push('+2 LTF zone nested inside HTF zone')
  }

  // ── Departure speed bonus ────────────────────────────────────────────────
  if (zone.base_candle_count <= 2 && zone.departure_speed >= 2.0) {
    score += 2
    reason.push('+2 departure in 1–2 candles (fastest institutional execution)')
  }

  // ── Session active ────────────────────────────────────────────────────────
  const sessionActive = isActiveSession()
  if (sessionActive) {
    score += 1
    reason.push('+1 London/NY session active')
  }

  // ── Mitigation level at round number / HTF structure ─────────────────────
  if (isRoundNumber(zone.mitigation_level, atr14)) {
    score += 1
    reason.push('+1 mitigation level at round number')
  }

  // ── FVG inside zone ───────────────────────────────────────────────────────
  if (zone.fvg_inside) {
    score += 1
    reason.push('+1 FVG embedded inside zone')
  }

  // ── Liquidity sweep confirmed ─────────────────────────────────────────────
  if (zone.liquidity_swept) {
    score += 1
    reason.push('+1 liquidity sweep confirmed (stop hunt validated)')
  }

  // ── Subtractive: news penalty ─────────────────────────────────────────────
  if (typeof newsMinutesAway === 'number' && newsMinutesAway >= 0 && newsMinutesAway <= 30) {
    score -= 3
    reason.push(`-3 high-impact news in ${newsMinutesAway}min`)
    if (score < 6) {
      reason.push('HARD_KILL: post-news score < 6')
      return { score, tier: 'discard', confidence_pct: 0, no_trade: true, reason }
    }
  }

  // ── Subtractive: zone tapped twice ───────────────────────────────────────
  if (zone.tap_count >= 2) {
    score -= 2
    reason.push(`-2 zone tapped ${zone.tap_count}× (third-touch failure risk)`)
  }

  // ── Subtractive: counter-HTF without CHoCH ───────────────────────────────
  const counterTrend =
    (zone.type === 'DEMAND' && htfTrendDirection === 'BEARISH') ||
    (zone.type === 'SUPPLY' && htfTrendDirection === 'BULLISH')
  if (counterTrend && !zone.htf_aligned) {
    score -= 2
    reason.push('-2 counter-HTF trend, no CHoCH confirmation')
  }

  // ── Subtractive: wide base ────────────────────────────────────────────────
  if (zone.base_candle_count >= 3) {
    score -= 1
    reason.push('-1 wide base (3–4 candles — institutional indecision)')
  }

  // ── Subtractive: Asian session, no LTF confirmation ──────────────────────
  if (!sessionActive && isAsianSession()) {
    score -= 1
    reason.push('-1 Asian session trigger, no LTF confirmation candle')
  }

  // ── Streak mitigation (per-asset) ────────────────────────────────────────
  if ((perSymbolConsecLosses ?? 0) >= 3 || (consecutiveLosses ?? 0) >= 3) {
    reason.push('STREAK: consecutive losses ≥ 3, risk halved')
  }

  score = Math.max(0, score)

  // ── Tier & confidence mapping ─────────────────────────────────────────────
  let tier:           SDTier
  let confidence_pct: number
  let no_trade        = false

  if (score >= 10) {
    tier           = 'prime'
    confidence_pct = 85 + Math.min(14, score - 10) * (14 / 4)
    confidence_pct = Math.min(99, Math.round(confidence_pct))
  } else if (score >= 8) {
    tier           = 'standard'
    confidence_pct = 70 + (score - 8) * 7
    confidence_pct = Math.min(84, Math.round(confidence_pct))
  } else if (score >= 6) {
    tier           = 'aggressive'
    confidence_pct = 50 + (score - 6) * 9
    confidence_pct = Math.min(69, Math.round(confidence_pct))
  } else {
    tier           = 'discard'
    confidence_pct = 0
    no_trade       = true
    reason.push('DISCARD: score < 6')
  }

  return { score, tier, confidence_pct, no_trade, reason }
}

// ─── Suggested risk % by tier ────────────────────────────────────────────────

export function getSDRiskPct(
  tier:                 SDTier,
  consecutiveLosses     = 0,
  perSymbolConsecLosses = 0,
): number {
  const streakHalve = consecutiveLosses >= 3 || perSymbolConsecLosses >= 3
  const base =
    tier === 'prime'      ? 1.5 :
    tier === 'standard'   ? 1.0 :
    tier === 'aggressive' ? 0.5 : 0

  return streakHalve ? base * 0.5 : base
}
