/**
 * TRAXO Breakout Algorithm — Volume Engine
 *
 * FIX 3 — Session-Weighted Relative Volume (RVOL):
 *
 * The original spec used a flat VMA(20) for volume comparison. This breaks
 * down at session transitions: a candle at 08:00 UTC (London open) will
 * always read high vs. a 20-period average dragged down by dead Asian hours,
 * even if that candle's volume is entirely normal for that time of day.
 *
 * The fix: compare the current candle's volume against the historical average
 * volume for that *same UTC-hour bucket* over all available history.
 * This makes RVOL = 2.0 mean "twice the typical volume for this hour of day"
 * rather than "twice the volume of the last 20 candles".
 *
 * Fallback chain (most specific → least specific):
 *   1. Session-weighted RVOL (same UTC-hour, >= 3 historical data points)
 *   2. VMA(20) ratio  (if insufficient same-hour history)
 *   3. 1.0 (neutral) (if no volume data in the array at all)
 */

import type { BKCandle } from './types'

// ─────────────────────────────────────────────
// Volume Data Availability
// ─────────────────────────────────────────────

/**
 * Returns true if the candle array contains any real (non-zero) volume data.
 * Many broker OHLC feeds provide no volume — in that case the volume scoring
 * gate is treated as neutral (neither bonus nor penalty applied).
 */
export function hasRealVolume(candles: BKCandle[]): boolean {
  return candles.some((c) => c.volume > 0)
}

// ─────────────────────────────────────────────
// Standard VMA(20) Fallback
// ─────────────────────────────────────────────

export function computeVMA20(candles: BKCandle[], upToIndex: number): number {
  const start = Math.max(0, upToIndex - 20)
  const slice = candles.slice(start, upToIndex)
  if (slice.length === 0) return 0
  return slice.reduce((s, c) => s + c.volume, 0) / slice.length
}

// ─────────────────────────────────────────────
// Session-Weighted RVOL — FIX 3
// ─────────────────────────────────────────────

/**
 * Compute the Relative Volume (RVOL) for the candle at `currentIndex`
 * using session-weighted averaging.
 *
 * Steps:
 *  1. If no real volume data exists → return 1.0 (neutral, skip gate)
 *  2. Extract the UTC hour-of-day for the current candle
 *  3. Collect volume from all earlier candles in the same UTC-hour bucket
 *  4. Average those volumes → session baseline
 *  5. RVOL = currentVolume / sessionBaseline
 *  6. If fewer than 3 same-hour samples exist → fall back to VMA(20)
 *
 * Example (Forex, 08:00 UTC):
 *   Past 08:00 candles: [1.2M, 1.4M, 1.3M, 1.5M] → avg = 1.35M
 *   Current 08:00 volume: 2.7M → RVOL = 2.0 (genuinely high for this hour)
 *
 *   With flat VMA20 (dragged by Asian hours avg ~0.4M):
 *   RVOL would be 6.75× — a severe over-count, triggering false "institutional" signals.
 */
export function computeSessionRVOL(candles: BKCandle[], currentIndex: number): number {
  if (!hasRealVolume(candles)) return 1.0

  const current = candles[currentIndex]
  if (current.volume === 0) return 0

  let currentHour: number
  try {
    currentHour = new Date(current.timestamp).getUTCHours()
  } catch {
    const vma = computeVMA20(candles, currentIndex)
    return vma > 0 ? current.volume / vma : 1.0
  }

  // Collect volumes from same UTC-hour buckets in history
  const bucketVolumes: number[] = []
  for (let i = 0; i < currentIndex; i++) {
    try {
      const h = new Date(candles[i].timestamp).getUTCHours()
      if (h === currentHour && candles[i].volume > 0) {
        bucketVolumes.push(candles[i].volume)
      }
    } catch {
      // Skip candles with unparseable timestamps
    }
  }

  // Require at least 3 data points for a meaningful session average
  if (bucketVolumes.length < 3) {
    const vma = computeVMA20(candles, currentIndex)
    return vma > 0 ? current.volume / vma : 1.0
  }

  const sessionAvg = bucketVolumes.reduce((s, v) => s + v, 0) / bucketVolumes.length
  return sessionAvg > 0 ? current.volume / sessionAvg : 1.0
}
