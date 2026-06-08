/**
 * TRAXO Trend Following — Confluence Scoring Engine
 *
 * Implements the 14-point scoring matrix from Section 6.1.
 * Returns a score, confidence_pct, tier, and reason array.
 *
 * Spec reference: Sections 6.1, 6.2.
 *
 * ── Additive ──────────────────────────────────────────────────────────────
 *  +3  Internal liquidity swept before entry trigger
 *  +2  FVG fill as entry trigger (T1)
 *  +2  Full EMA stack alignment
 *  +2  HTF trend fully aligned AND ADX > 30 on HTF
 *  +2  Order Block at pullback zone (T2 entry)
 *  +1  ADX > 40 on signal timeframe (very strong trend)
 *  +1  Volume contraction during pullback + expansion on entry candle
 *  +1  Session optimal (London open or NY open continuation)
 *
 * ── Subtractive ───────────────────────────────────────────────────────────
 *  -3  News event ≤ 30 min  (hard kill — signal discarded regardless of score)
 *  -2  CHoCH active on signal timeframe
 *  -2  Counter-HTF entry direction
 *  -2  Trend exhaustion flagged
 *  -1  EMA stack only partially aligned
 *  -1  ADX < 25 on signal timeframe
 *  -1  Pullback retraced ≥ 78.6%
 */

import type {
  TrendDirection,
  EMAStackStatus,
  EntryTrigger,
  PullbackContext,
  TFEntryResult,
  TFTier,
} from './types'

const TF_MAX_SCORE = 14

// ─────────────────────────────────────────────
// Confidence & Tier Mapping
// ─────────────────────────────────────────────

function scoreToConfidence(score: number): number {
  if (score >= 10) return Math.min(99, 85 + (score - 10) * 3)   // 85–97%+
  if (score >= 8)  return 70 + (score - 8) * 7                  // 70, 77
  if (score >= 6)  return 50 + (score - 6) * 10                 // 50, 60
  return 0
}

function scoreToTier(score: number): TFTier {
  if (score >= 10) return 'prime'
  if (score >= 8)  return 'standard'
  if (score >= 6)  return 'aggressive'
  return 'discard'
}

// ─────────────────────────────────────────────
// Score Result
// ─────────────────────────────────────────────

export interface ScoringResult {
  score:          number
  confidence_pct: number
  tier:           TFTier
  hardKilled:     boolean
  reason:         string[]
}

// ─────────────────────────────────────────────
// Scoring Options
// ─────────────────────────────────────────────

export interface ScoringOptions {
  direction:         TrendDirection
  emaStack:          EMAStackStatus
  adxValue:          number
  chochActive:       boolean
  pullback:          PullbackContext
  entry:             TFEntryResult
  /** Volume moving average (20) — for volume signature check */
  vma20:             number
  /** Average volume during pullback candles */
  avgPullbackVolume: number
  /** Entry candle volume / vma20 */
  entryVolumeRatio:  number
  /** HTF trend direction (optional — used for alignment check) */
  htfTrendDirection?: TrendDirection
  /** HTF ADX value */
  htfAdx?:           number
  /** Minutes to next high-impact news event */
  newsMinutesAway?:  number | null
  /** Consecutive losses (for informational purposes — risk is applied in riskEngine) */
  consecutiveLosses?: number
  /** Rolling drawdown pct — circuit breaker */
  rollingDrawdownPct?: number
  /** Whether the candle falls in an optimal session window */
  inOptimalSession?: boolean
  /** Whether trend exhaustion has been flagged */
  trendExhausted?: boolean
}

// ─────────────────────────────────────────────
// Main Scorer
// ─────────────────────────────────────────────

export function scoreTrendFollowing(opts: ScoringOptions): ScoringResult {
  const reason: string[] = []
  let score = 0

  // ── Hard kill: daily drawdown circuit breaker ──────────────────────────
  if ((opts.rollingDrawdownPct ?? 0) >= 4.0) {
    return {
      score: 0, confidence_pct: 0, tier: 'discard', hardKilled: true,
      reason: ['KILL Daily drawdown circuit breaker triggered (≥ 4.0%)'],
    }
  }

  // ── Hard kill: high-impact news ────────────────────────────────────────
  if (opts.newsMinutesAway !== null && opts.newsMinutesAway !== undefined && opts.newsMinutesAway <= 30) {
    score -= 3
    reason.push(`-3 High-impact news in ${opts.newsMinutesAway}min`)
    // Applied now; hard kill check is below after all adjustments
  }

  // ── Additive: Internal liquidity swept ────────────────────────────────
  if (opts.pullback.internalLiqSwept) {
    score += 3
    reason.push('+3 Internal liquidity swept — manipulation phase confirmed')
  }

  // ── Additive: Entry trigger ────────────────────────────────────────────
  if (opts.entry.trigger === 'FVG_FILL' satisfies EntryTrigger) {
    score += 2
    reason.push('+2 FVG fill at pullback (deep imbalance — institutional rebalancing)')
  } else if (opts.entry.trigger === 'OB_AT_PULLBACK') {
    score += 2
    reason.push('+2 Order Block at pullback zone — institutional demand/supply confirmed')
  } else if (opts.entry.trigger === 'EMA_OTE_CONFLUENCE') {
    score += 1
    reason.push('+1 EMA + OTE zone confluence — standard trend continuation entry')
  }

  // ── Additive: Full EMA stack alignment ────────────────────────────────
  if (opts.emaStack === 'ALIGNED') {
    score += 2
    reason.push('+2 Full EMA stack aligned (EMA20 > EMA50 > EMA200)')
  }

  // ── Additive: HTF alignment ────────────────────────────────────────────
  const htfAligned = opts.htfTrendDirection && opts.htfTrendDirection === opts.direction
  const htfStrong  = (opts.htfAdx ?? 0) > 30
  if (htfAligned && htfStrong) {
    score += 2
    reason.push(`+2 HTF trend aligned and strong (HTF ADX ${opts.htfAdx?.toFixed(1)})`)
  }

  // ── Additive: ADX > 40 ────────────────────────────────────────────────
  if (opts.adxValue > 40) {
    score += 1
    reason.push(`+1 ADX ${opts.adxValue.toFixed(1)} > 40 — very strong trend`)
  }

  // ── Additive: Volume signature ─────────────────────────────────────────
  const pullbackVolContracted = opts.vma20 > 0 &&
    opts.avgPullbackVolume < opts.vma20 * 0.8
  const entryVolExpanded = opts.entryVolumeRatio > 1.5
  if (pullbackVolContracted && entryVolExpanded) {
    score += 1
    reason.push('+1 Volume: contraction during pullback + expansion at entry (buyers returning)')
  } else if (opts.vma20 > 0 && opts.avgPullbackVolume > opts.vma20 * 0.8) {
    score -= 1
    reason.push('-1 Elevated pullback volume — sellers potentially aggressive')
  }

  // ── Additive: Optimal session ─────────────────────────────────────────
  if (opts.inOptimalSession) {
    score += 1
    reason.push('+1 Session optimal (London/NY open continuation)')
  }

  // ── Subtractive: CHoCH active ─────────────────────────────────────────
  if (opts.chochActive) {
    score -= 2
    reason.push('-2 CHoCH active — trend integrity compromised, no new entries')
  }

  // ── Subtractive: Counter-HTF direction ────────────────────────────────
  if (opts.htfTrendDirection && opts.htfTrendDirection !== 'RANGING' && opts.htfTrendDirection !== opts.direction) {
    score -= 2
    reason.push(`-2 Counter-HTF direction (trading ${opts.direction} against HTF ${opts.htfTrendDirection})`)
  }

  // ── Subtractive: Trend exhaustion ─────────────────────────────────────
  if (opts.trendExhausted) {
    score -= 2
    reason.push('-2 Trend exhaustion flagged — extended run without pullback or overexpanded ATR')
  }

  // ── Subtractive: EMA partial alignment ────────────────────────────────
  if (opts.emaStack === 'PARTIAL') {
    score -= 1
    reason.push('-1 EMA stack only partially aligned')
  }

  // ── Subtractive: ADX < 25 ─────────────────────────────────────────────
  if (opts.adxValue < 25) {
    score -= 1
    reason.push(`-1 ADX ${opts.adxValue.toFixed(1)} < 25 — weak trend, lower continuation probability`)
  }

  // ── Subtractive: Too-deep pullback ────────────────────────────────────
  if (opts.pullback.depth >= 78.6) {
    score -= 1
    reason.push(`-1 Pullback depth ${opts.pullback.depth.toFixed(1)}% ≥ 78.6% — trend structure weakening`)
  }

  // ── Hard kill: news penalty pushed score below 6 ──────────────────────
  if ((opts.newsMinutesAway ?? Infinity) <= 30 && score < 6) {
    return { score, confidence_pct: 0, tier: 'discard', hardKilled: true, reason }
  }

  // ── CHoCH hard block (no new entries while CHoCH active) ───────────────
  if (opts.chochActive) {
    return { score, confidence_pct: 0, tier: 'discard', hardKilled: true, reason }
  }

  const clampedScore = Math.max(0, Math.min(TF_MAX_SCORE, score))
  return {
    score:          clampedScore,
    confidence_pct: scoreToConfidence(clampedScore),
    tier:           scoreToTier(clampedScore),
    hardKilled:     false,
    reason,
  }
}
