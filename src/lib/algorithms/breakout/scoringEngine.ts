/**
 * TRAXO Breakout Algorithm — Scoring Engine
 *
 * 14-point confidence matrix (spec §6).
 * Additive and subtractive factors assess pattern quality, volume, HTF
 * alignment, retest, session, and global circuit breakers.
 *
 * Volume scoring respects Fix 3: if `hasRealVolume = false` the gate is
 * neutral (no bonus, no penalty) rather than penalising algo-mapped volume=0.
 */

import type { ConsolidationZone, BreakoutEvent, BKAssetType, BKTier } from './types'

// ─────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────

export interface ScoringResult {
  score:        number
  confidencePct: number
  tier:         BKTier
  reason:       string[]
  hardKilled:   boolean
}

export interface ScoringOptions {
  zone:             ConsolidationZone
  event:            BreakoutEvent
  hasRealVolume:    boolean
  htfAligned:       boolean | null   // null = unknown
  sessionActive:    boolean
  assetType:        BKAssetType
  newsMinutesAway?: number
  rollingDrawdownPct?: number
  consecutiveLosses?: number
}

// ─────────────────────────────────────────────
// Tier & Confidence Mapping
// ─────────────────────────────────────────────

function tierFromScore(score: number): BKTier {
  if (score >= 10) return 'prime'
  if (score >= 8)  return 'standard'
  if (score >= 6)  return 'aggressive'
  return 'discard'
}

function confidenceFromTier(score: number, tier: BKTier): number {
  if (tier === 'prime')      return Math.min(99, 85 + (score - 10) * 3.5)
  if (tier === 'standard')   return score >= 9 ? 77 : 70
  if (tier === 'aggressive') return score >= 7 ? 60 : 50
  return 0
}

// ─────────────────────────────────────────────
// Scorer
// ─────────────────────────────────────────────

export function scoreBreakout(opts: ScoringOptions): ScoringResult {
  const {
    zone, event, hasRealVolume, htfAligned, sessionActive,
    assetType, newsMinutesAway, rollingDrawdownPct, consecutiveLosses,
  } = opts
  const reason: string[] = []
  let score = 0

  // ── Global Circuit Breakers ───────────────────────────────────────────────
  if ((rollingDrawdownPct ?? 0) >= 4.0) {
    return {
      score: 0, confidencePct: 0, tier: 'discard',
      reason: ['NO_TRADE: Daily drawdown ≥ 4% — kill switch active'],
      hardKilled: true,
    }
  }

  // News penalty applied early (may trigger hard kill below)
  if ((newsMinutesAway ?? 999) <= 30) {
    score -= 3
    reason.push(`-3 High-impact news in ${newsMinutesAway} min — macro risk`)
  }

  // ── Pattern Quality ───────────────────────────────────────────────────────
  if (zone.patternType === 'FLAG' || zone.patternType === 'PENNANT') {
    score += 3
    reason.push('+3 Flag/Pennant — highest reliability, clear prior trend')
  } else if (
    zone.patternType === 'TRIANGLE' &&
    (zone.triangleSubtype === 'ASCENDING' || zone.triangleSubtype === 'DESCENDING')
  ) {
    score += 2
    reason.push('+2 Directional Triangle — structural directional bias')
  }
  // Symmetrical triangle, wedge, rectangle: no additive bonus (neutral quality)

  // ── Volume Expansion ──────────────────────────────────────────────────────
  if (hasRealVolume) {
    if (event.volumeRatio >= 3.0) {
      score += 3
      reason.push(`+3 Institutional-grade volume (${event.volumeRatio.toFixed(1)}× RVOL)`)
    } else if (event.volumeRatio >= 2.0) {
      score += 2
      reason.push(`+2 Strong volume expansion (${event.volumeRatio.toFixed(1)}× RVOL)`)
    } else if (event.volumeRatio < 1.5) {
      score -= 2
      reason.push(`-2 Weak volume (${event.volumeRatio.toFixed(1)}× RVOL) — institutional absent`)
    }
    // 1.5 ≤ rvol < 2.0: no bonus, no penalty (acceptable but not ideal)
  }
  // No real volume data: skip gate entirely (neutral)

  // ── HTF Trend Alignment ───────────────────────────────────────────────────
  if (htfAligned === true) {
    score += 2
    reason.push('+2 HTF trend aligned with breakout direction')
  } else if (htfAligned === false) {
    score -= 2
    reason.push('-2 Counter-HTF breakout — low conviction without CHoCH')
  }

  // ── Retest Entry vs Chase Entry ───────────────────────────────────────────
  if (event.retestTriggered) {
    score += 2
    reason.push('+2 Retest entry — broken level confirmed as new support/resistance')
  } else if (event.closeBeyondLevel && !event.retestTriggered) {
    // Chase entry: entered on the breakout candle without waiting for retest
    score -= 1
    reason.push('-1 Chase entry — no retest confirmation, degraded R:R')
  }

  // ── Body Close Confirmation ───────────────────────────────────────────────
  if (!event.closeBeyondLevel && !event.stopHuntDetected) {
    score -= 2
    reason.push('-2 Wick-only penetration — body close not confirmed, not a breakout')
  }

  // ── Session Timing ────────────────────────────────────────────────────────
  if (sessionActive) {
    score += 1
    reason.push('+1 Active session (London/NY overlap)')
  } else if (assetType === 'FOREX') {
    score -= 1
    reason.push('-1 Asian session breakout (Forex) — high false-breakout rate')
  }

  // ── Asset-Type Specific Overrides (§5.1) ─────────────────────────────────
  if (assetType === 'STOCKS' && hasRealVolume && event.volumeRatio < 2.5) {
    score -= 1
    reason.push('-1 Stocks require ≥ 2.5× volume for institutional participation')
  }

  // ── Pattern Maturity ──────────────────────────────────────────────────────
  if (zone.formationCandles >= 10) {
    score += 1
    reason.push(`+1 Mature pattern (${zone.formationCandles} candles)`)
  }

  // ── Triangle Apex Timing ──────────────────────────────────────────────────
  if (zone.apexPct !== null) {
    if (zone.apexPct >= 50 && zone.apexPct <= 75) {
      score += 1
      reason.push(`+1 Apex at optimal compression window (${zone.apexPct.toFixed(0)}%)`)
    } else if (zone.apexPct < 50 || zone.apexPct > 90) {
      reason.push(`Note: Apex at ${zone.apexPct.toFixed(0)}% — outside optimal 50–75% window`)
    }
  }

  // ── Prior Impulse ─────────────────────────────────────────────────────────
  if (zone.prevMoveSize >= 2.0) {
    score += 1
    reason.push(`+1 Strong prior impulse (${zone.prevMoveSize.toFixed(1)}× ATR)`)
  } else if (zone.priorTrend === 'NEUTRAL') {
    score -= 1
    reason.push('-1 No prior trend — neutral context reduces conviction')
  }

  // ── Stop Hunt Context (FIX 2) ────────────────────────────────────────────
  // After a stop hunt flip we don't apply the wick-only penalty (already
  // excluded above via closeBeyondLevel check). Log informational note.
  if (event.stopHuntDetected) {
    reason.push(
      `Note: Stop hunt — wick ${event.stopHuntWickDirection}, signal fires opposite (Fix 2)`,
    )
  }

  // ── Streak Mitigation ─────────────────────────────────────────────────────
  if ((consecutiveLosses ?? 0) >= 3) {
    reason.push('Note: 3 consecutive losses — risk reduced to 0.5×')
  }

  // ── News Hard Kill (post-penalty) ────────────────────────────────────────
  if ((newsMinutesAway ?? 999) <= 30 && score < 6) {
    return {
      score,
      confidencePct: 0,
      tier: 'discard',
      reason: [...reason, 'NO_TRADE: News hard kill (score < 6 after news penalty)'],
      hardKilled: true,
    }
  }

  const tier         = tierFromScore(score)
  const confidencePct = confidenceFromTier(score, tier)

  return { score, confidencePct, tier, reason, hardKilled: false }
}
