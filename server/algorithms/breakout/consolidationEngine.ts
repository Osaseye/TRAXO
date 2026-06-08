/**
 * TRAXO Breakout Algorithm — Consolidation Engine
 *
 * Detects and classifies consolidation zones using regression-fitted trendlines
 * across swing highs and lows. Implements the trendline lock mechanism (Fix 1)
 * to prevent the "moving goalpost" problem described in Section 10.3.
 *
 * Key exports:
 *   detectConsolidation()   — main zone detector
 *   getTrendlinePrice()     — price at index (respects lock)
 *   maybeLockTrendlines()   — Fix 1: freeze mature trendlines
 *   computeApexPct()        — triangle apex progress %
 *   computeBKATR()          — ATR(14) for BKCandle arrays
 */

import type {
  BKCandle,
  SwingPoint,
  Trendline,
  ConsolidationZone,
  PatternType,
  TriangleSubtype,
  WedgeDirection,
  PriorTrend,
} from './types'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SWING_LOOKBACK          = 5      // bars each side for swing detection
const TOUCH_TOLERANCE_MULT    = 0.15   // ATR multiplier for trendline touch
const MIN_TOUCH_COUNT         = 2      // touches required on each trendline
const MIN_RANGE_HEIGHT_ATR    = 1.0    // zone must span >= 1 ATR
const MIN_FORMATION_CANDLES   = 8      // zone must be at least 8 candles old
const CONSOLIDATION_LOOKBACK  = 100    // max candles scanned for zone detection

// ─────────────────────────────────────────────
// ATR (Wilder smoothing) for BKCandle
// ─────────────────────────────────────────────

export function computeBKATR(candles: BKCandle[], period = 14): number[] {
  const n = candles.length
  const tr  = new Array<number>(n).fill(0)
  const atr = new Array<number>(n).fill(0)

  for (let i = 0; i < n; i++) {
    const hl = candles[i].high - candles[i].low
    tr[i] = i === 0
      ? hl
      : Math.max(
          hl,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low  - candles[i - 1].close),
        )
  }

  for (let i = 0; i < n; i++) {
    if (i === period - 1) {
      let s = 0; for (let j = 0; j < period; j++) s += tr[j]
      atr[i] = s / period
    } else if (i >= period) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    } else {
      let s = 0; for (let j = 0; j <= i; j++) s += tr[j]
      atr[i] = s / (i + 1)
    }
  }
  return atr
}

// ─────────────────────────────────────────────
// Swing Point Detection
// ─────────────────────────────────────────────

export function detectSwingHighs(
  candles:  BKCandle[],
  lookback: number = SWING_LOOKBACK,
): SwingPoint[] {
  const result: SwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) { isHigh = false; break }
    }
    if (isHigh) result.push({ price: candles[i].high, index: i })
  }
  return result
}

export function detectSwingLows(
  candles:  BKCandle[],
  lookback: number = SWING_LOOKBACK,
): SwingPoint[] {
  const result: SwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].low <= candles[i].low) { isLow = false; break }
    }
    if (isLow) result.push({ price: candles[i].low, index: i })
  }
  return result
}

// ─────────────────────────────────────────────
// Trendline Fitting (Least-Squares Regression)
// ─────────────────────────────────────────────

export function fitTrendline(points: SwingPoint[], atr14: number): Trendline | null {
  const n = points.length
  if (n < 2) return null

  const sumX  = points.reduce((s, p) => s + p.index, 0)
  const sumY  = points.reduce((s, p) => s + p.price, 0)
  const sumXY = points.reduce((s, p) => s + p.index * p.price, 0)
  const sumX2 = points.reduce((s, p) => s + p.index * p.index, 0)

  const denom    = n * sumX2 - sumX * sumX
  const slope    = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n

  const tolerance  = TOUCH_TOLERANCE_MULT * atr14
  const touchCount = points.filter(
    (p) => Math.abs(p.price - (slope * p.index + intercept)) <= tolerance,
  ).length

  return {
    slope,
    intercept,
    touchCount,
    locked:         false,
    lockedPrice:    null,
    lastTouchIndex: points[points.length - 1].index,
  }
}

// ─────────────────────────────────────────────
// Trendline Price Getter (respects lock — Fix 1)
// ─────────────────────────────────────────────

/**
 * Returns the trendline's price at the given candle index.
 * If the line is locked (mature zone), returns the frozen lockedPrice
 * instead of re-evaluating the slope equation. This is the core of Fix 1.
 */
export function getTrendlinePrice(line: Trendline, index: number): number {
  if (line.locked && line.lockedPrice !== null) return line.lockedPrice
  return line.slope * index + line.intercept
}

// ─────────────────────────────────────────────
// Trendline Lock Mechanism — FIX 1
// ─────────────────────────────────────────────

/**
 * FIX 1 — Moving Goalpost Prevention.
 *
 * Once BOTH trendlines have >= 3 confirmed touches AND (for triangles) the
 * apex is more than 50% complete, the trendline coordinates are frozen.
 * Subsequent new candles cannot shift the regression line — price must break
 * the *locked* structural level, not a drifting recalculation.
 *
 * Effect: prevents a tight apex candle from shifting the resistance line to
 * "accommodate" price just before the breakout fires.
 */
export function maybeLockTrendlines(zone: ConsolidationZone, currentIndex: number): void {
  const apexReady = zone.apexPct === null || zone.apexPct > 50
  const mature    = zone.resistanceLine.touchCount >= 3
                 && zone.supportLine.touchCount >= 3
                 && apexReady

  if (!mature) return

  if (!zone.resistanceLine.locked) {
    zone.resistanceLine.locked     = true
    zone.resistanceLine.lockedPrice = getTrendlinePrice(zone.resistanceLine, currentIndex)
  }
  if (!zone.supportLine.locked) {
    zone.supportLine.locked     = true
    zone.supportLine.lockedPrice = getTrendlinePrice(zone.supportLine, currentIndex)
  }
}

// ─────────────────────────────────────────────
// Apex Percentage
// ─────────────────────────────────────────────

/**
 * How far (0–100%) the current candle is through the triangle from
 * pattern start to the geometric apex (intersection of the two lines).
 * Returns null for parallel lines (no apex) or if apex is behind start.
 */
export function computeApexPct(
  resistanceLine: Trendline,
  supportLine:    Trendline,
  formationStart: number,
  currentIndex:   number,
): number | null {
  const dSlope = resistanceLine.slope - supportLine.slope
  if (Math.abs(dSlope) < 1e-10) return null

  const apexIdx = (supportLine.intercept - resistanceLine.intercept) / dSlope
  if (apexIdx <= formationStart) return null

  const totalSpan = apexIdx - formationStart
  if (totalSpan <= 0) return null

  return Math.max(0, Math.min(100, ((currentIndex - formationStart) / totalSpan) * 100))
}

// ─────────────────────────────────────────────
// Prior Trend (pre-consolidation impulse)
// ─────────────────────────────────────────────

function getPriorTrend(
  candles:           BKCandle[],
  consolidationStart: number,
  atr14:             number,
): { trend: PriorTrend; moveSize: number } {
  const lookback = 30
  const start = Math.max(0, consolidationStart - lookback)
  const slice = candles.slice(start, consolidationStart)
  if (slice.length < 5) return { trend: 'NEUTRAL', moveSize: 0 }

  const netMove  = slice[slice.length - 1].close - slice[0].close
  const moveSize = atr14 > 0 ? Math.abs(netMove) / atr14 : 0

  if (moveSize < 1.5) return { trend: 'NEUTRAL', moveSize }
  return { trend: netMove > 0 ? 'BULLISH' : 'BEARISH', moveSize }
}

// ─────────────────────────────────────────────
// Pattern Classifier
// ─────────────────────────────────────────────

function classifyPattern(
  resistanceLine: Trendline,
  supportLine:    Trendline,
  priorTrend:     PriorTrend,
  prevMoveSize:   number,
  atr14:          number,
): {
  patternType:     PatternType
  triangleSubtype: TriangleSubtype | null
  wedgeDirection:  WedgeDirection | null
} {
  // Normalize slopes to ATR units per candle (dimensionless comparison)
  const ns  = (slope: number) => (atr14 > 0 ? slope / atr14 : slope)
  const res = ns(resistanceLine.slope)
  const sup = ns(supportLine.slope)

  // FLAGS / PENNANTS: occur after sharp impulse (prevMoveSize >= 2× ATR)
  if (priorTrend !== 'NEUTRAL' && prevMoveSize >= 2.0) {
    // FLAG: both lines nearly parallel, tilted against the prior trend
    if (Math.abs(res - sup) < 0.001 && Math.abs(res) > 0.001) {
      return { patternType: 'FLAG', triangleSubtype: null, wedgeDirection: null }
    }
    // PENNANT: converging (one up, one down) after sharp move
    if (res < 0 && sup > 0) {
      return { patternType: 'PENNANT', triangleSubtype: null, wedgeDirection: null }
    }
  }

  // TRIANGLES: converging trendlines
  if (res < 0 && sup > 0) {
    return { patternType: 'TRIANGLE', triangleSubtype: 'SYMMETRICAL', wedgeDirection: null }
  }
  if (Math.abs(res) < 0.0005 && sup > 0) {
    // Flat top, rising bottom
    return { patternType: 'TRIANGLE', triangleSubtype: 'ASCENDING', wedgeDirection: null }
  }
  if (res < 0 && Math.abs(sup) < 0.0005) {
    // Declining top, flat bottom
    return { patternType: 'TRIANGLE', triangleSubtype: 'DESCENDING', wedgeDirection: null }
  }

  // WEDGES: both lines slope same direction, converging
  if (res > 0 && sup > 0 && sup > res) {
    // Rising wedge — buyers exhausting → bearish bias
    return { patternType: 'WEDGE', triangleSubtype: null, wedgeDirection: 'RISING' }
  }
  if (res < 0 && sup < 0 && res < sup) {
    // Falling wedge — sellers exhausting → bullish bias
    return { patternType: 'WEDGE', triangleSubtype: null, wedgeDirection: 'FALLING' }
  }

  // RECTANGLE: both lines near-flat
  if (Math.abs(res) < 0.0005 && Math.abs(sup) < 0.0005) {
    return { patternType: 'RECTANGLE', triangleSubtype: null, wedgeDirection: null }
  }

  // Default: treat as rectangle (horizontal consolidation)
  return { patternType: 'RECTANGLE', triangleSubtype: null, wedgeDirection: null }
}

// ─────────────────────────────────────────────
// Main Consolidation Detector
// ─────────────────────────────────────────────

/**
 * Scans the most recent candles for a valid consolidation zone.
 *
 * Algorithm:
 * 1. Take the last CONSOLIDATION_LOOKBACK candles
 * 2. Detect swing highs + lows (lookback = 5 bars each side)
 * 3. Fit resistance trendline through highs, support through lows
 * 4. Require >= 2 touches on each line within tolerance (0.15 × ATR)
 * 5. Range height must be >= 1.0 × ATR (filter noise)
 * 6. Formation must span >= 8 candles (filter premature zones)
 * 7. Classify pattern and compute apex/compression metrics
 */
export function detectConsolidation(
  candles: BKCandle[],
  atr14:   number,
): ConsolidationZone | null {
  const n = candles.length
  if (n < 30) return null

  const windowStart   = Math.max(0, n - CONSOLIDATION_LOOKBACK)
  const windowCandles = candles.slice(windowStart)

  // Detect swing points, re-map indices to global candle array
  const swingHighs = detectSwingHighs(windowCandles)
    .map((p) => ({ ...p, index: p.index + windowStart }))
  const swingLows = detectSwingLows(windowCandles)
    .map((p) => ({ ...p, index: p.index + windowStart }))

  if (swingHighs.length < MIN_TOUCH_COUNT || swingLows.length < MIN_TOUCH_COUNT) return null

  const resistanceLine = fitTrendline(swingHighs, atr14)
  const supportLine    = fitTrendline(swingLows,  atr14)
  if (!resistanceLine || !supportLine) return null

  if (resistanceLine.touchCount < MIN_TOUCH_COUNT) return null
  if (supportLine.touchCount    < MIN_TOUCH_COUNT) return null

  // Range height: widest point = at the earliest candle of the window
  const resFirst = getTrendlinePrice(resistanceLine, windowStart)
  const supFirst = getTrendlinePrice(supportLine,    windowStart)
  const rangeHeight = resFirst - supFirst
  if (rangeHeight <= 0) return null

  const rangeHeightAtr = atr14 > 0 ? rangeHeight / atr14 : 0
  if (rangeHeightAtr < MIN_RANGE_HEIGHT_ATR) return null

  // Identify confirmed touches to determine formation start
  const tolerance = TOUCH_TOLERANCE_MULT * atr14
  const confirmedHighTouches = swingHighs.filter(
    (p) => Math.abs(p.price - getTrendlinePrice(resistanceLine, p.index)) <= tolerance,
  )
  const confirmedLowTouches = swingLows.filter(
    (p) => Math.abs(p.price - getTrendlinePrice(supportLine, p.index)) <= tolerance,
  )

  if (confirmedHighTouches.length < MIN_TOUCH_COUNT) return null
  if (confirmedLowTouches.length  < MIN_TOUCH_COUNT) return null

  const firstTouch = Math.min(
    ...confirmedHighTouches.map((p) => p.index),
    ...confirmedLowTouches.map((p) => p.index),
  )
  const formationCandles = (n - 1) - firstTouch
  if (formationCandles < MIN_FORMATION_CANDLES) return null

  // Prior trend analysis
  const { trend: priorTrend, moveSize: prevMoveSize } = getPriorTrend(candles, firstTouch, atr14)

  // Pattern classification
  const { patternType, triangleSubtype, wedgeDirection } = classifyPattern(
    resistanceLine, supportLine, priorTrend, prevMoveSize, atr14,
  )

  // Apex (for triangles & pennants) and compression
  const currentIndex = n - 1
  const apexPct      = computeApexPct(resistanceLine, supportLine, firstTouch, currentIndex)

  const resNow       = getTrendlinePrice(resistanceLine, currentIndex)
  const supNow       = getTrendlinePrice(supportLine,    currentIndex)
  const currentWidth = resNow - supNow
  const compressionRatio = rangeHeight > 0 ? Math.max(0, currentWidth / rangeHeight) : 1

  return {
    id:               `bk_zone_${candles[currentIndex].timestamp}`,
    patternType,
    triangleSubtype,
    wedgeDirection,
    resistanceLine,
    supportLine,
    rangeHeight,
    rangeHeightAtr,
    apexPct,
    compressionRatio,
    formationCandles,
    formationStart:   firstTouch,
    priorTrend,
    prevMoveSize,
    active:           true,
    falseBreakoutCount: 0,
  }
}
