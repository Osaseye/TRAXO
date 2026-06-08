/**
 * TRAXO Trend Following — Pullback Engine
 *
 * Detects structured pullbacks within a trend, calculates Fibonacci retracements,
 * OTE zones, and identifies FVGs / Order Blocks sitting in the pullback range.
 *
 * Spec reference: Sections 2.4, 3.5, 4.1.
 */

import type { TFCandle, TFSwingPoint, PullbackContext, FVGZone, OBZone } from './types'

// ─────────────────────────────────────────────
// FVG Detection (in the prior impulse leg)
// ─────────────────────────────────────────────

/**
 * Scan a slice of candles (typically the prior impulse leg) for FVGs.
 *
 * Bullish FVG: candle[i-1].high < candle[i+1].low  (upward gap — unfilled demand)
 * Bearish FVG: candle[i-1].low  > candle[i+1].high (downward gap — unfilled supply)
 *
 * @param impulseCandles  - Candles in the prior impulse move (oldest → newest)
 * @param atr14           - Current ATR(14) for size grading
 * @param direction       - 'BULLISH' looks for bullish FVGs, 'BEARISH' for bearish
 * @param fib500          - 50% equilibrium price. Only FVGs whose top (bull) or
 *                          bottom (bear) sits at/below (bull) or at/above (bear)
 *                          this level pass the depth gate.
 */
function detectFVGsInImpulse(
  impulseCandles: TFCandle[],
  atr14:          number,
  direction:      'BULLISH' | 'BEARISH',
  fib500:         number,
  indexOffset:    number,
): FVGZone[] {
  const fvgs: FVGZone[] = []
  for (let i = 1; i < impulseCandles.length - 1; i++) {
    const prev = impulseCandles[i - 1]
    const next = impulseCandles[i + 1]
    if (direction === 'BULLISH') {
      // Bullish FVG: gap between prev.high and next.low
      const top    = next.low
      const bottom = prev.high
      if (top > bottom) {
        // Depth gate: FVG must be at or below the 50% equilibrium
        if (top <= fib500) {
          fvgs.push({
            top,
            bottom,
            direction: 'BULLISH',
            candleIndex: indexOffset + i,
            sizeAtr: atr14 > 0 ? (top - bottom) / atr14 : 0,
          })
        }
      }
    } else {
      // Bearish FVG: gap between prev.low and next.high
      const top    = prev.low
      const bottom = next.high
      if (top > bottom) {
        // Depth gate: FVG bottom must be at or above the 50% equilibrium
        if (bottom >= fib500) {
          fvgs.push({
            top,
            bottom,
            direction: 'BEARISH',
            candleIndex: indexOffset + i,
            sizeAtr: atr14 > 0 ? (top - bottom) / atr14 : 0,
          })
        }
      }
    }
  }
  return fvgs
}

// ─────────────────────────────────────────────
// Order Block Detection (in the prior impulse leg)
// ─────────────────────────────────────────────

/**
 * Find the highest-conviction Order Block inside the impulse leg.
 *
 * For a bullish impulse, a demand OB is the LAST bearish candle before
 * a strong consecutive bullish sequence (the institutional accumulation point).
 * For a bearish impulse, a supply OB is the LAST bullish candle before
 * a strong consecutive bearish sequence.
 *
 * @param impulseCandles  - Candles from lastHL/lastLH to lastHH/lastLL
 * @param atr14           - ATR for minimum displacement threshold
 * @param direction       - 'BULLISH' → demand OB; 'BEARISH' → supply OB
 * @param indexOffset     - Global candle index of impulseCandles[0]
 */
function detectOBInImpulse(
  impulseCandles: TFCandle[],
  atr14:          number,
  direction:      'BULLISH' | 'BEARISH',
  indexOffset:    number,
): OBZone | null {
  const minDisplacement = atr14 * 0.6

  for (let i = impulseCandles.length - 2; i >= 1; i--) {
    const c = impulseCandles[i]
    const next = impulseCandles[i + 1]
    if (direction === 'BULLISH') {
      // Last bearish candle (close < open) before a bullish displacement
      if (c.close < c.open) {
        const move = next.close - next.open
        if (move >= minDisplacement && next.close > next.open) {
          return { high: c.high, low: c.low, direction: 'BULLISH', candleIndex: indexOffset + i }
        }
      }
    } else {
      // Last bullish candle (close > open) before a bearish displacement
      if (c.close > c.open) {
        const move = next.open - next.close
        if (move >= minDisplacement && next.close < next.open) {
          return { high: c.high, low: c.low, direction: 'BEARISH', candleIndex: indexOffset + i }
        }
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────
// Internal Liquidity Sweep Detection
// ─────────────────────────────────────────────

/**
 * Check whether internal equal lows (bull) or equal highs (bear) have been
 * swept during the pullback — confirming the manipulation phase.
 *
 * Equal level tolerance: 0.1% of the current price.
 */
function detectInternalLiqSweep(
  pullbackCandles: TFCandle[],
  direction:       'BULLISH' | 'BEARISH',
  currentPrice:    number,
): boolean {
  if (pullbackCandles.length < 4) return false
  const tolerance = currentPrice * 0.001

  if (direction === 'BULLISH') {
    // Look for two equal lows followed by a close above them (sweep + reversal)
    const lows = pullbackCandles.map(c => c.low)
    for (let i = 0; i < lows.length - 2; i++) {
      for (let j = i + 1; j < lows.length - 1; j++) {
        if (Math.abs(lows[i] - lows[j]) < tolerance) {
          // Equal lows found at i and j — check for close above afterwards
          const afterSlice = pullbackCandles.slice(j + 1)
          if (afterSlice.some(c => c.close > lows[j] + tolerance)) return true
        }
      }
    }
  } else {
    // Equal highs swept in downtrend pullback
    const highs = pullbackCandles.map(c => c.high)
    for (let i = 0; i < highs.length - 2; i++) {
      for (let j = i + 1; j < highs.length - 1; j++) {
        if (Math.abs(highs[i] - highs[j]) < tolerance) {
          const afterSlice = pullbackCandles.slice(j + 1)
          if (afterSlice.some(c => c.close < highs[j] - tolerance)) return true
        }
      }
    }
  }
  return false
}

// ─────────────────────────────────────────────
// Main Pullback Detector
// ─────────────────────────────────────────────

function nullPullback(): PullbackContext {
  return {
    valid: false, direction: null,
    pullbackStartPrice: 0, pullbackExtremePrice: 0, depth: 0,
    fibR382: 0, fibR500: 0, fibR618: 0, fibR786: 0,
    oteZoneHigh: 0, oteZoneLow: 0,
    ema20Level: 0, ema50Level: 0,
    fvgInPullback: null, obInPullback: null,
    internalLiqSwept: false, pullbackCandleCount: 0, avgPullbackVolume: 0,
  }
}

/**
 * Detect and measure the current pullback in a trending market.
 *
 * BULLISH: measures the retrace from lastHH down toward lastHL.
 * BEARISH: measures the retrace from lastLL up toward lastLH.
 *
 * Also searches the prior impulse leg for qualifying FVGs and OBs.
 *
 * @param candles       - Full candle array
 * @param direction     - Active trend direction
 * @param lastHH        - Most recent Higher High (for bull context)
 * @param lastHL        - Most recent Higher Low (for bull context)
 * @param lastLH        - Most recent Lower High (for bear context)
 * @param lastLL        - Most recent Lower Low (for bear context)
 * @param ema20         - Current EMA-20 value
 * @param ema50         - Current EMA-50 value
 * @param atr14         - Current ATR(14)
 */
export function detectPullback(
  candles:    TFCandle[],
  direction:  'BULLISH' | 'BEARISH',
  lastHH:     TFSwingPoint | null,
  lastHL:     TFSwingPoint | null,
  lastLH:     TFSwingPoint | null,
  lastLL:     TFSwingPoint | null,
  ema20:      number,
  ema50:      number,
  atr14:      number,
): PullbackContext {
  const base = nullPullback()
  base.ema20Level = ema20
  base.ema50Level = ema50

  if (direction === 'BULLISH') {
    if (!lastHH || !lastHL) return base

    const hhPrice = lastHH.price
    const hlPrice = lastHL.price
    const range   = hhPrice - hlPrice
    if (range <= 0) return base

    // Candles from lastHH onward (the current pullback)
    const pullbackStart = lastHH.index + 1
    if (pullbackStart >= candles.length) return base
    const pullbackCandles = candles.slice(pullbackStart)

    const currentLow = pullbackCandles.reduce((m, c) => Math.min(m, c.low), Infinity)
    const retracePct = ((hhPrice - currentLow) / range) * 100

    // Valid pullback window: 20–85% retrace
    if (retracePct < 20) return base  // Not enough retrace — likely still impulsing
    if (retracePct > 85) return base  // Too deep — CHoCH risk, handled by structure engine

    // Fibonacci levels
    const fibR382 = hhPrice - 0.382 * range
    const fibR500 = hhPrice - 0.500 * range
    const fibR618 = hhPrice - 0.618 * range
    const fibR786 = hhPrice - 0.786 * range

    // OTE zone: between 61.8% (higher price) and 78.6% (lower price)
    const oteZoneHigh = fibR618
    const oteZoneLow  = fibR786

    // Prior impulse candles (from lastHL to lastHH) for FVG/OB scanning
    const impulseStart  = Math.max(0, lastHL.index)
    const impulseEnd    = lastHH.index + 1
    const impulseCandles = candles.slice(impulseStart, impulseEnd)

    // FVGs that pass the depth gate (top <= fib_r500)
    const fvgs = detectFVGsInImpulse(impulseCandles, atr14, 'BULLISH', fibR500, impulseStart)
    // Prefer the deepest (lowest top) qualifying FVG
    const bestFVG = fvgs.length > 0
      ? fvgs.reduce((best, f) => f.top < best.top ? f : best)
      : null

    // OB in impulse (demand zone)
    const ob = detectOBInImpulse(impulseCandles, atr14, 'BULLISH', impulseStart)
    // Keep the OB if its top reaches into the pullback range (≥ 78.6% retrace price).
    // ob.high >= fibR786 ensures the OB zone overlaps with where price pulls back to.
    const qualifiedOB = ob && ob.high >= fibR786 ? ob : null

    // Internal liquidity sweep
    const liqSwept = detectInternalLiqSweep(pullbackCandles, 'BULLISH', candles[candles.length - 1].close)

    const avgVol = pullbackCandles.length > 0
      ? pullbackCandles.reduce((s, c) => s + c.volume, 0) / pullbackCandles.length
      : 0

    return {
      valid:                true,
      direction:            'BULLISH_PULLBACK',
      pullbackStartPrice:   hhPrice,
      pullbackExtremePrice: currentLow,
      depth:                retracePct,
      fibR382, fibR500, fibR618, fibR786,
      oteZoneHigh, oteZoneLow,
      ema20Level: ema20, ema50Level: ema50,
      fvgInPullback:  bestFVG,
      obInPullback:   qualifiedOB,
      internalLiqSwept: liqSwept,
      pullbackCandleCount: pullbackCandles.length,
      avgPullbackVolume: avgVol,
    }
  }

  // ── BEARISH ─────────────────────────────────────────────────────────────
  if (!lastLH || !lastLL) return base

  const llPrice = lastLL.price
  const lhPrice = lastLH.price
  const range   = lhPrice - llPrice
  if (range <= 0) return base

  const pullbackStart   = lastLL.index + 1
  if (pullbackStart >= candles.length) return base
  const pullbackCandles = candles.slice(pullbackStart)

  const currentHigh = pullbackCandles.reduce((m, c) => Math.max(m, c.high), -Infinity)
  const retracePct  = ((currentHigh - llPrice) / range) * 100

  if (retracePct < 20 || retracePct > 85) return base

  const fibR382 = llPrice + 0.382 * range
  const fibR500 = llPrice + 0.500 * range
  const fibR618 = llPrice + 0.618 * range
  const fibR786 = llPrice + 0.786 * range

  // For bear: OTE zone between 61.8% (lower price) and 78.6% (higher price)
  const oteZoneLow  = fibR618
  const oteZoneHigh = fibR786

  const impulseStart   = Math.max(0, lastLH.index)
  const impulseEnd     = lastLL.index + 1
  const impulseCandles = candles.slice(impulseStart, impulseEnd)

  // Bearish FVGs — bottom must be >= fib500 (depth gate for bear = above equilibrium)
  const fvgs    = detectFVGsInImpulse(impulseCandles, atr14, 'BEARISH', fibR500, impulseStart)
  const bestFVG = fvgs.length > 0
    ? fvgs.reduce((best, f) => f.bottom > best.bottom ? f : best)
    : null

  const ob = detectOBInImpulse(impulseCandles, atr14, 'BEARISH', impulseStart)
  // Keep the OB if its low is at or below the bearish OTE zone (fibR786 = 78.6% retrace up).
  // ob.low <= fibR786 ensures the OB zone overlaps with where price pulls back to.
  const qualifiedOB = ob && ob.low <= fibR786 ? ob : null

  const liqSwept = detectInternalLiqSweep(pullbackCandles, 'BEARISH', candles[candles.length - 1].close)

  const avgVol = pullbackCandles.length > 0
    ? pullbackCandles.reduce((s, c) => s + c.volume, 0) / pullbackCandles.length
    : 0

  return {
    valid:                true,
    direction:            'BEARISH_PULLBACK',
    pullbackStartPrice:   llPrice,
    pullbackExtremePrice: currentHigh,
    depth:                retracePct,
    fibR382, fibR500, fibR618, fibR786,
    oteZoneHigh, oteZoneLow,
    ema20Level: ema20, ema50Level: ema50,
    fvgInPullback:  bestFVG,
    obInPullback:   qualifiedOB,
    internalLiqSwept: liqSwept,
    pullbackCandleCount: pullbackCandles.length,
    avgPullbackVolume: avgVol,
  }
}
