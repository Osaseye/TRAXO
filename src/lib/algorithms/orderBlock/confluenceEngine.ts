/**
 * TRAXO Order Block — Confluence Engine
 *
 * Aggregates all scoring factors into a raw score, normalized confidence_pct,
 * and tier classification. Also provides per-factor scoring helpers.
 */

import {
  MAX_POSSIBLE_SCORE,
  TIER_PRIME_PCT,
  TIER_STANDARD_PCT,
  TIER_AGGRESSIVE_PCT,
  SCORE_BOS_STRONG,
  SCORE_BOS_MEDIUM,
  SCORE_FVG_INSTITUTIONAL,
  SCORE_FVG_NORMAL,
  SCORE_FVG_MICRO,
  SCORE_DISPLACEMENT_STRONG,
  SCORE_DISPLACEMENT_MEDIUM,
  SCORE_LIQUIDITY_VOID,
  SCORE_KILL_ZONE,
  SCORE_REGIME_TRENDING,
  SCORE_REGIME_EXPANDING,
  SCORE_REGIME_CONTRACTING,
  SCORE_REGIME_RANGING,
  OB_FRESHNESS_SCORES,
  SCORE_HTF_ALIGNMENT_BONUS,
  SCORE_HTF_COUNTER_PENALTY,
  SCORE_WRONG_ZONE_PENALTY,
  SCORE_VOLUME_LOW_PENALTY,
  SCORE_ASIA_SESSION_PENALTY,
  SESSION_SCORE_LONDON_NY_OVERLAP,
  SESSION_SCORE_LONDON_OPEN,
  SESSION_SCORE_NY_OPEN,
  NEWS_KILL_PENALTY,
  NEWS_CRITICAL_BLOCK_BEFORE_MINUTES,
  NEWS_CRITICAL_BLOCK_AFTER_MINUTES,
  NEWS_HIGH_BLOCK_MINUTES,
  NEWS_MEDIUM_BLOCK_MINUTES,
  NEWS_MEDIUM_PENALTY,
  ORDER_BLOCK_VOLUME_CONFIRMATION_RVOL,
  ORDER_BLOCK_VOLUME_STRONG_RVOL,
  ORDER_BLOCK_VOLUME_INSTITUTIONAL_RVOL,
} from '../strategyConfig'
import type {
  BosQuality,
  FVGGrade,
  DisplacementQuality,
  MarketRegime,
  OBTier,
  NewsEvent,
} from './types'
import type { HTFBias } from './types'

// ─────────────────────────────────────────────
// Input contract for scoreSignal()
// ─────────────────────────────────────────────

export interface ScoringInputs {
  bos_quality: BosQuality
  fvg_grade: FVGGrade | null
  displacement_quality: DisplacementQuality
  liquidity_void: boolean
  ob_tap_count: number
  cluster_count: number
  kill_zone_active: boolean
  market_regime: MarketRegime | null
  htf_bias: HTFBias | undefined
  ob_direction: 'BULLISH' | 'BEARISH'
  /** Price location of OB (PREMIUM vs DISCOUNT vs EQUILIBRIUM) */
  price_location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' | null
  /** Volume of the current candle vs volume MA20 */
  volume_ratio: number
  /** News events (sorted by timestamp) */
  news_events: NewsEvent[]
  /** ISO 8601 timestamp for the signal */
  signal_timestamp: string
  /** Whether all four OB conditions are met */
  all_conditions: boolean
}

export interface ScoringResult {
  raw_score: number
  confidence_pct: number
  tier: OBTier
  reason: string[]
  /** true when a news kill condition blocks the trade entirely */
  news_kill: boolean
}

// ─────────────────────────────────────────────
// BOS Score
// ─────────────────────────────────────────────

function scoreBOS(quality: BosQuality): { points: number; label: string } {
  if (quality === 'STRONG') return { points: SCORE_BOS_STRONG, label: 'BOS_STRONG (+2)' }
  if (quality === 'MEDIUM') return { points: SCORE_BOS_MEDIUM, label: 'BOS_MEDIUM (+1)' }
  return { points: 0, label: 'BOS_WEAK (+0)' }
}

// ─────────────────────────────────────────────
// FVG Score
// ─────────────────────────────────────────────

function scoreFVG(grade: FVGGrade | null): { points: number; label: string } {
  if (grade === 'INSTITUTIONAL') return { points: SCORE_FVG_INSTITUTIONAL, label: 'FVG_INSTITUTIONAL (+3)' }
  if (grade === 'NORMAL')        return { points: SCORE_FVG_NORMAL,        label: 'FVG_NORMAL (+2)' }
  if (grade === 'MICRO')         return { points: SCORE_FVG_MICRO,          label: 'FVG_MICRO (+1)' }
  return { points: 0, label: 'FVG_NONE (+0)' }
}

// ─────────────────────────────────────────────
// Displacement Score
// ─────────────────────────────────────────────

function scoreDisplacement(quality: DisplacementQuality): { points: number; label: string } {
  if (quality === 'STRONG') return { points: SCORE_DISPLACEMENT_STRONG, label: 'DISP_STRONG (+3)' }
  if (quality === 'MEDIUM') return { points: SCORE_DISPLACEMENT_MEDIUM, label: 'DISP_MEDIUM (+2)' }
  return { points: 0, label: 'DISP_WEAK (+0)' }
}

// ─────────────────────────────────────────────
// Session Score
// ─────────────────────────────────────────────

/**
 * UTC-based session bonus.
 *
 * London–NY overlap 12:00–16:00 UTC → +3
 * London open       07:00–09:00 UTC → +2
 * NY open           12:00–14:00 UTC → +2   (overlaps overlap — take highest)
 * Asia session      00:00–07:00 UTC → −1
 */
export function scoreSession(timestamp_iso: string): { points: number; label: string; active: boolean } {
  const date = new Date(timestamp_iso)
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60

  if (utcHour >= 12 && utcHour < 16) {
    return { points: SESSION_SCORE_LONDON_NY_OVERLAP, label: 'SESSION_LONDON_NY_OVERLAP (+3)', active: true }
  }
  if (utcHour >= 7 && utcHour < 9) {
    return { points: SESSION_SCORE_LONDON_OPEN, label: 'SESSION_LONDON_OPEN (+2)', active: true }
  }
  if (utcHour >= 12 && utcHour < 14) {
    // already captured by overlap above; won't be reached, kept for completeness
    return { points: SESSION_SCORE_NY_OPEN, label: 'SESSION_NY_OPEN (+2)', active: true }
  }
  if (utcHour >= 0 && utcHour < 7) {
    return { points: SCORE_ASIA_SESSION_PENALTY, label: 'SESSION_ASIA (-1)', active: false }
  }

  return { points: 0, label: 'SESSION_NONE (+0)', active: false }
}

// ─────────────────────────────────────────────
// News Score
// ─────────────────────────────────────────────

interface NewsScoreResult {
  penalty: number
  kill: boolean
  label: string
}

export function scoreNews(news_events: NewsEvent[], timestamp_iso: string): NewsScoreResult {
  const signalTime = new Date(timestamp_iso).getTime()

  for (const event of news_events) {
    const eventTime = new Date(event.timestamp_utc).getTime()
    const minutesAway = (eventTime - signalTime) / 60_000  // + = upcoming, - = passed

    if (event.severity === 'CRITICAL') {
      const tooClose =
        minutesAway <= NEWS_CRITICAL_BLOCK_BEFORE_MINUTES && minutesAway >= -NEWS_CRITICAL_BLOCK_AFTER_MINUTES
      if (tooClose) {
        return { penalty: NEWS_KILL_PENALTY, kill: true, label: `NEWS_CRITICAL_KILL (${event.name})` }
      }
    }

    if (event.severity === 'HIGH') {
      const tooClose = Math.abs(minutesAway) <= NEWS_HIGH_BLOCK_MINUTES
      if (tooClose) {
        return { penalty: NEWS_KILL_PENALTY, kill: true, label: `NEWS_HIGH_KILL (${event.name})` }
      }
    }

    if (event.severity === 'MEDIUM') {
      const tooClose = Math.abs(minutesAway) <= NEWS_MEDIUM_BLOCK_MINUTES
      if (tooClose) {
        return { penalty: NEWS_MEDIUM_PENALTY, kill: false, label: `NEWS_MEDIUM (-2, ${event.name})` }
      }
    }
  }

  return { penalty: 0, kill: false, label: 'NEWS_CLEAR' }
}

// ─────────────────────────────────────────────
// HTF Alignment Score
// ─────────────────────────────────────────────

export function scoreHTFAlignment(
  htf_bias: HTFBias | undefined,
  ob_direction: 'BULLISH' | 'BEARISH',
): { points: number; label: string; aligned: boolean } {
  if (!htf_bias || htf_bias === 'neutral') {
    return { points: 0, label: 'HTF_NEUTRAL (+0)', aligned: false }
  }

  const aligned =
    (htf_bias === 'bullish' && ob_direction === 'BULLISH') ||
    (htf_bias === 'bearish' && ob_direction === 'BEARISH')

  if (aligned) {
    return { points: SCORE_HTF_ALIGNMENT_BONUS, label: 'HTF_ALIGNED (+2)', aligned: true }
  }

  return { points: SCORE_HTF_COUNTER_PENALTY, label: 'HTF_COUNTER (-2)', aligned: false }
}

// ─────────────────────────────────────────────
// Regime Score
// ─────────────────────────────────────────────

export function scoreRegime(regime: MarketRegime | null): { points: number; label: string } {
  switch (regime) {
    case 'TRENDING':    return { points: SCORE_REGIME_TRENDING,    label: 'REGIME_TRENDING (+0)' }
    case 'EXPANDING':   return { points: SCORE_REGIME_EXPANDING,   label: 'REGIME_EXPANDING (+1)' }
    case 'CONTRACTING': return { points: SCORE_REGIME_CONTRACTING, label: 'REGIME_CONTRACTING (-1)' }
    case 'RANGING':     return { points: SCORE_REGIME_RANGING,     label: 'REGIME_RANGING (-2)' }
    default:            return { points: 0,                         label: 'REGIME_UNKNOWN (+0)' }
  }
}

// ─────────────────────────────────────────────
// Equilibrium / Premium-Discount Score
// ─────────────────────────────────────────────

function scoreEquilibrium(
  price_location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' | null,
  ob_direction: 'BULLISH' | 'BEARISH',
): { points: number; label: string } {
  if (!price_location) return { points: 0, label: 'EQ_UNKNOWN (+0)' }

  // Bullish OB should be in DISCOUNT (below equilibrium)
  // Bearish OB should be in PREMIUM (above equilibrium)
  const correctZone =
    (ob_direction === 'BULLISH' && price_location === 'DISCOUNT') ||
    (ob_direction === 'BEARISH' && price_location === 'PREMIUM')

  if (correctZone) return { points: 0, label: 'EQ_CORRECT_ZONE (+0)' }
  if (price_location === 'EQUILIBRIUM') return { points: 0, label: 'EQ_NEUTRAL (+0)' }

  return { points: SCORE_WRONG_ZONE_PENALTY, label: 'EQ_WRONG_ZONE (-2)' }
}

// ─────────────────────────────────────────────
// Tier from confidence_pct
// ─────────────────────────────────────────────

function tierFromPct(confidence_pct: number): OBTier {
  if (confidence_pct >= TIER_PRIME_PCT)      return 'prime'
  if (confidence_pct >= TIER_STANDARD_PCT)   return 'standard'
  if (confidence_pct >= TIER_AGGRESSIVE_PCT) return 'aggressive'
  return 'discard'
}

// ─────────────────────────────────────────────
// Master Score Aggregator
// ─────────────────────────────────────────────

export function scoreSignal(inputs: ScoringInputs): ScoringResult {
  const reasons: string[] = []
  let raw = 0

  // ── BOS Quality ──────────────────────────────
  const bos = scoreBOS(inputs.bos_quality)
  raw += bos.points
  reasons.push(bos.label)

  // ── FVG ──────────────────────────────────────
  const fvg = scoreFVG(inputs.fvg_grade)
  raw += fvg.points
  reasons.push(fvg.label)

  // ── Displacement ─────────────────────────────
  const disp = scoreDisplacement(inputs.displacement_quality)
  raw += disp.points
  reasons.push(disp.label)

  // ── Liquidity Void ───────────────────────────
  if (inputs.liquidity_void) {
    raw += SCORE_LIQUIDITY_VOID
    reasons.push('LIQ_VOID (+2)')
  }

  // ── OB Freshness (tap count) ─────────────────
  const tapKey = Math.min(inputs.ob_tap_count, 2) as 0 | 1 | 2
  const freshnessScore = OB_FRESHNESS_SCORES[tapKey] ?? -2
  raw += freshnessScore
  reasons.push(`OB_FRESHNESS_TAP${inputs.ob_tap_count} (${freshnessScore >= 0 ? '+' : ''}${freshnessScore})`)

  // ── MTF Cluster ──────────────────────────────
  if (inputs.cluster_count >= 3) {
    raw += 4
    reasons.push('MTF_CLUSTER_3TF (+4)')
  } else if (inputs.cluster_count === 2) {
    raw += 2
    reasons.push('MTF_CLUSTER_2TF (+2)')
  }

  // ── Kill Zone ────────────────────────────────
  if (inputs.kill_zone_active) {
    raw += SCORE_KILL_ZONE
    reasons.push('KILL_ZONE (+2)')
  }

  // ── Market Regime ────────────────────────────
  const regime = scoreRegime(inputs.market_regime)
  raw += regime.points
  reasons.push(regime.label)

  // ── HTF Alignment ────────────────────────────
  const htf = scoreHTFAlignment(inputs.htf_bias, inputs.ob_direction)
  raw += htf.points
  reasons.push(htf.label)

  // ── Session ──────────────────────────────────
  const session = scoreSession(inputs.signal_timestamp)
  raw += session.points
  reasons.push(session.label)

  // ── Equilibrium / Zone Penalty ───────────────
  const eq = scoreEquilibrium(inputs.price_location, inputs.ob_direction)
  raw += eq.points
  reasons.push(eq.label)

  // ── Volume ───────────────────────────────────
  if (inputs.volume_ratio >= ORDER_BLOCK_VOLUME_INSTITUTIONAL_RVOL) {
    raw += 2
    reasons.push(`VOLUME_INSTITUTIONAL (+2, ${inputs.volume_ratio.toFixed(1)}× VMA20)`)
  } else if (inputs.volume_ratio >= ORDER_BLOCK_VOLUME_STRONG_RVOL) {
    raw += 1
    reasons.push(`VOLUME_STRONG (+1, ${inputs.volume_ratio.toFixed(1)}× VMA20)`)
  } else if (inputs.volume_ratio >= ORDER_BLOCK_VOLUME_CONFIRMATION_RVOL) {
    reasons.push(`VOLUME_CONFIRMATION (+0, ${inputs.volume_ratio.toFixed(1)}× VMA20)`)
  } else if (inputs.volume_ratio < 0.8) {
    raw += SCORE_VOLUME_LOW_PENALTY
    reasons.push(`VOLUME_LOW (-1, ${inputs.volume_ratio.toFixed(1)}× VMA20)`)
  }

  if (inputs.all_conditions) {
    raw += 1
    reasons.push('OB_FULL_CONFLUENCE (+1)')
  }

  // ── News ─────────────────────────────────────
  const news = scoreNews(inputs.news_events, inputs.signal_timestamp)
  if (news.kill) {
    return {
      raw_score: raw + news.penalty,
      confidence_pct: 0,
      tier: 'discard',
      reason: [...reasons, news.label],
      news_kill: true,
    }
  }
  if (news.penalty !== 0) {
    raw += news.penalty
    reasons.push(news.label)
  }

  // ── Normalize ────────────────────────────────
  const clamped = Math.max(0, raw)
  const confidence_pct = Math.min(100, Math.round((clamped / MAX_POSSIBLE_SCORE) * 100))
  const tier = tierFromPct(confidence_pct)

  return {
    raw_score: raw,
    confidence_pct,
    tier,
    reason: reasons,
    news_kill: false,
  }
}
