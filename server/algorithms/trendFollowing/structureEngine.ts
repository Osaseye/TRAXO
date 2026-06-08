/**
 * TRAXO Trend Following — Structure Engine
 *
 * Swing point detection, trend direction classification, CHoCH detection,
 * and swing labelling (HH / HL / LH / LL).
 *
 * Spec reference: Section 3.1 (trend), 3.4 (CHoCH), 3.5 (AMD phase).
 */

import type { TFCandle, TFSwingPoint, TrendDirection, SwingLabel } from './types'

// ─────────────────────────────────────────────
// Swing Detection
// ─────────────────────────────────────────────

const DEFAULT_LOOKBACK = 5

/**
 * Detect confirmed swing highs in a candle series.
 * A swing high at index i requires it to be the highest point
 * in the window [i - lookback, i + lookback].
 *
 * Returns points ordered chronologically (oldest [0] → newest [-1]).
 */
export function detectSwingHighs(
  candles: TFCandle[],
  lookback = DEFAULT_LOOKBACK,
): TFSwingPoint[] {
  const points: TFSwingPoint[] = []
  // Note: we stop at candles.length - lookback so the right window is full.
  // The last `lookback` candles are not yet confirmed swing highs.
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) {
        isHigh = false
        break
      }
    }
    if (isHigh) {
      points.push({ price: candles[i].high, index: i, type: 'SWING_HIGH' })
    }
  }
  return points
}

/**
 * Detect confirmed swing lows in a candle series.
 * Returns points ordered chronologically (oldest [0] → newest [-1]).
 */
export function detectSwingLows(
  candles: TFCandle[],
  lookback = DEFAULT_LOOKBACK,
): TFSwingPoint[] {
  const points: TFSwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].low <= candles[i].low) {
        isLow = false
        break
      }
    }
    if (isLow) {
      points.push({ price: candles[i].low, index: i, type: 'SWING_LOW' })
    }
  }
  return points
}

// ─────────────────────────────────────────────
// Swing Labelling (HH / HL / LH / LL)
// ─────────────────────────────────────────────

/**
 * Labels swing highs as HH or LH relative to the prior swing high.
 * Index [0] receives generic 'SWING_HIGH'; subsequent points are labelled.
 */
export function labelSwingHighs(swingHighs: TFSwingPoint[]): TFSwingPoint[] {
  return swingHighs.map((p, i) => {
    if (i === 0) return { ...p, type: 'SWING_HIGH' as SwingLabel }
    const label: SwingLabel = p.price > swingHighs[i - 1].price ? 'HH' : 'LH'
    return { ...p, type: label }
  })
}

/**
 * Labels swing lows as HL or LL relative to the prior swing low.
 * Index [0] receives generic 'SWING_LOW'; subsequent points are labelled.
 */
export function labelSwingLows(swingLows: TFSwingPoint[]): TFSwingPoint[] {
  return swingLows.map((p, i) => {
    if (i === 0) return { ...p, type: 'SWING_LOW' as SwingLabel }
    const label: SwingLabel = p.price > swingLows[i - 1].price ? 'HL' : 'LL'
    return { ...p, type: label }
  })
}

// ─────────────────────────────────────────────
// Trend Determination
// ─────────────────────────────────────────────

/**
 * Determine the macro trend direction using the two-layer check from Section 3.1.
 *
 * Primary check  — macro anchor: newest vs. oldest swing in last-3 window.
 * Secondary check — consecutive confirmation: newest vs. middle swing.
 *
 * This tolerates complex pullbacks where an intermediate swing temporarily
 * moves against the trend without falsely returning RANGING.
 *
 * Indexing contract: swingHighs/swingLows are oldest-first (chronological).
 */
export function determineTrend(
  swingHighs: TFSwingPoint[],
  swingLows:  TFSwingPoint[],
): TrendDirection {
  if (swingHighs.length < 3 || swingLows.length < 3) return 'RANGING'

  const h = swingHighs.slice(-3)  // [oldest, middle, newest]
  const l = swingLows.slice(-3)

  // ── Macro anchoring (oldest → newest) ──────────────────────────────────────
  const macroHH = h[2].price > h[0].price
  const macroHL = l[2].price > l[0].price
  // ── Secondary consecutive check (middle → newest) ─────────────────────────
  const confirmHH = h[2].price > h[1].price
  const confirmHL = l[2].price > l[1].price

  if (macroHH && macroHL && (confirmHH || confirmHL)) return 'BULLISH'

  const macroLH = h[2].price < h[0].price
  const macroLL = l[2].price < l[0].price
  const confirmLH = h[2].price < h[1].price
  const confirmLL = l[2].price < l[1].price

  if (macroLH && macroLL && (confirmLH || confirmLL)) return 'BEARISH'

  return 'RANGING'
}

// ─────────────────────────────────────────────
// CHoCH Detection
// ─────────────────────────────────────────────

/**
 * Detect a Change of Character on the current candle.
 *
 * BULLISH context: CHoCH fires if the candle CLOSES below the last confirmed HL.
 * BEARISH context: CHoCH fires if the candle CLOSES above the last confirmed LH.
 *
 * Returns true when a CHoCH is triggered (does not check previous state).
 */
export function detectCHoCH(
  trendDirection: TrendDirection,
  currentClose:   number,
  lastHL:         TFSwingPoint | null,
  lastLH:         TFSwingPoint | null,
): boolean {
  if (trendDirection === 'BULLISH' && lastHL !== null) {
    return currentClose < lastHL.price
  }
  if (trendDirection === 'BEARISH' && lastLH !== null) {
    return currentClose > lastLH.price
  }
  return false
}

// ─────────────────────────────────────────────
// Named Swing Accessors
// ─────────────────────────────────────────────

/** Returns the most recent HH from a labelled swing-high array, or null. */
export function getLastHH(labelledHighs: TFSwingPoint[]): TFSwingPoint | null {
  for (let i = labelledHighs.length - 1; i >= 0; i--) {
    if (labelledHighs[i].type === 'HH') return labelledHighs[i]
  }
  return labelledHighs.length > 0 ? labelledHighs[labelledHighs.length - 1] : null
}

/** Returns the most recent HL from a labelled swing-low array, or null. */
export function getLastHL(labelledLows: TFSwingPoint[]): TFSwingPoint | null {
  for (let i = labelledLows.length - 1; i >= 0; i--) {
    if (labelledLows[i].type === 'HL') return labelledLows[i]
  }
  return labelledLows.length > 0 ? labelledLows[labelledLows.length - 1] : null
}

/** Returns the most recent LH from a labelled swing-high array, or null. */
export function getLastLH(labelledHighs: TFSwingPoint[]): TFSwingPoint | null {
  for (let i = labelledHighs.length - 1; i >= 0; i--) {
    if (labelledHighs[i].type === 'LH') return labelledHighs[i]
  }
  return labelledHighs.length > 0 ? labelledHighs[labelledHighs.length - 1] : null
}

/** Returns the most recent LL from a labelled swing-low array, or null. */
export function getLastLL(labelledLows: TFSwingPoint[]): TFSwingPoint | null {
  for (let i = labelledLows.length - 1; i >= 0; i--) {
    if (labelledLows[i].type === 'LL') return labelledLows[i]
  }
  return labelledLows.length > 0 ? labelledLows[labelledLows.length - 1] : null
}
