/**
 * TRAXO Trend Following — Entry Engine
 *
 * Evaluates the three-tier entry trigger hierarchy (T1 / T2 / T3) and the
 * lower-timeframe confirmation heuristic for the current candle context.
 *
 * Spec reference: Sections 4.2, 4.3, 4.4.
 *
 * ── Trigger priority ────────────────────────────────────────────────────────
 *  T1  FVG Fill          — Highest  (+3 score in confluenceEngine)
 *  T2  OB at Pullback    — High     (+2 score)
 *  T3  EMA + OTE Zone    — Standard (+1 score)
 *
 * ── Depth gate (T1) ─────────────────────────────────────────────────────────
 *  A qualifying FVG must have its TOP at or below the 50% equilibrium (fib_r500).
 *  Shallow FVGs above equilibrium are excluded — they produce unacceptable
 *  Risk_Distance to the pullback low SL.
 */

import type { TFCandle, PullbackContext, TFEntryResult, EntryTrigger, LTFConfirmation } from './types'

// ─────────────────────────────────────────────
// LTF Confirmation Heuristic
// ─────────────────────────────────────────────

/**
 * Approximate lower-timeframe confirmation using the current timeframe's
 * most recent three candles.
 *
 * MSS_CONFIRMED  — Recent close above pullback zone top (bull) with strong body
 * PIN_BAR_CONFIRMED — Recent pin bar at the pullback zone boundary
 * NO_CONFIRMATION   — Neither pattern detected
 *
 * @param candles       - Full candle array (signal timeframe)
 * @param pullbackZoneTop - Upper boundary of the entry zone (for bull)
 * @param pullbackZoneLow - Lower boundary of the entry zone (for bull)
 * @param direction     - 'BUY' or 'SELL'
 */
function assessLTFConfirmation(
  candles:           TFCandle[],
  pullbackZoneTop:   number,
  pullbackZoneLow:   number,
  direction:         'BUY' | 'SELL',
): LTFConfirmation {
  if (candles.length < 3) return 'NO_CONFIRMATION'

  // Look at the last 3 candles
  const recent = candles.slice(-3)

  for (const c of recent) {
    const body       = Math.abs(c.close - c.open)
    const totalRange = c.high - c.low
    const bodyRatio  = totalRange > 0 ? body / totalRange : 0

    if (direction === 'BUY') {
      // MSS: strong bullish close breaking above the pullback zone top
      if (c.close > pullbackZoneTop && c.close > c.open && bodyRatio >= 0.6) {
        return 'MSS_CONFIRMED'
      }
      // Pin bar: long lower wick at or below the zone low with bullish close
      const lowerWick = Math.min(c.open, c.close) - c.low
      const wickRatio = totalRange > 0 ? lowerWick / totalRange : 0
      if (c.low <= pullbackZoneLow && wickRatio >= 0.6 && c.close > c.open) {
        return 'PIN_BAR_CONFIRMED'
      }
    } else {
      // MSS: strong bearish close breaking below the pullback zone low
      if (c.close < pullbackZoneLow && c.close < c.open && bodyRatio >= 0.6) {
        return 'MSS_CONFIRMED'
      }
      // Pin bar: long upper wick at zone high with bearish close
      const upperWick = c.high - Math.max(c.open, c.close)
      const wickRatio = totalRange > 0 ? upperWick / totalRange : 0
      if (c.high >= pullbackZoneTop && wickRatio >= 0.6 && c.close < c.open) {
        return 'PIN_BAR_CONFIRMED'
      }
    }
  }
  return 'NO_CONFIRMATION'
}

// ─────────────────────────────────────────────
// Main Entry Evaluator
// ─────────────────────────────────────────────

/**
 * Evaluate the T1 / T2 / T3 trigger hierarchy for the current candle.
 *
 * @param candles   - Full candle array (signal timeframe)
 * @param pullback  - Computed pullback context from pullbackEngine
 * @param vma20     - Volume moving average (20) — used for volume ratio
 * @param direction - 'BULLISH' or 'BEARISH' trend direction
 * @param atr14     - ATR(14) for EMA proximity check in T3
 */
export function evaluateEntryTriggers(
  candles:   TFCandle[],
  pullback:  PullbackContext,
  vma20:     number,
  direction: 'BULLISH' | 'BEARISH',
  atr14:     number,
): TFEntryResult {
  const noEntry: TFEntryResult = {
    triggered: false, trigger: null,
    entryPrice: 0, ltfConfirmation: 'NO_CONFIRMATION',
    volumeAtTrigger: 0,
  }

  if (!pullback.valid) return noEntry

  const current      = candles[candles.length - 1]
  const currentPrice = current.close
  const volRatio     = vma20 > 0 ? current.volume / vma20 : 0

  const isBull = direction === 'BULLISH'

  // Helper: returns which LTF confirmation pattern was seen
  function ltfFor(zoneTop: number, zoneLow: number): LTFConfirmation {
    return assessLTFConfirmation(candles, zoneTop, zoneLow, isBull ? 'BUY' : 'SELL')
  }

  // ── T1: FVG Fill (Highest Priority) ─────────────────────────────────────
  // Depth gate is already applied in pullbackEngine (only FVGs with top ≤ fib_r500
  // are stored in pullback.fvgInPullback). The engine simply checks if current
  // price is inside the zone.
  const fvg = pullback.fvgInPullback
  if (fvg !== null) {
    const inFVG = isBull
      ? currentPrice >= fvg.bottom && currentPrice <= fvg.top
      : currentPrice <= fvg.top && currentPrice >= fvg.bottom

    if (inFVG) {
      const ltf = ltfFor(fvg.top, fvg.bottom)
      return {
        triggered:       true,
        trigger:         'FVG_FILL' as EntryTrigger,
        entryPrice:      (fvg.top + fvg.bottom) / 2,
        ltfConfirmation: ltf,
        volumeAtTrigger: volRatio,
      }
    }
  }

  // ── T2: Order Block at Pullback ──────────────────────────────────────────
  const ob = pullback.obInPullback
  if (ob !== null) {
    const inOB = currentPrice >= ob.low && currentPrice <= ob.high
    if (inOB) {
      const ltf = ltfFor(ob.high, ob.low)
      return {
        triggered:       true,
        trigger:         'OB_AT_PULLBACK' as EntryTrigger,
        entryPrice:      (ob.high + ob.low) / 2,
        ltfConfirmation: ltf,
        volumeAtTrigger: volRatio,
      }
    }
  }

  // ── T3: EMA + Fibonacci OTE Zone ─────────────────────────────────────────
  // Price must be inside the 61.8–78.6% OTE zone AND at least one EMA
  // (20 or 50) must also sit within or just above the zone (confluence).
  const inOTE = isBull
    ? currentPrice >= pullback.oteZoneLow && currentPrice <= pullback.oteZoneHigh
    : currentPrice >= pullback.oteZoneLow && currentPrice <= pullback.oteZoneHigh

  if (inOTE) {
    // EMA must be within 2 ATR of the OTE zone — not necessarily inside it.
    // In a bull trend EMAs sit above the pullback zone; in a bear trend below.
    const ema20Near = isBull
      ? pullback.ema20Level >= pullback.oteZoneLow && pullback.ema20Level <= pullback.oteZoneHigh + 2 * atr14
      : pullback.ema20Level >= pullback.oteZoneLow - 2 * atr14 && pullback.ema20Level <= pullback.oteZoneHigh
    const ema50Near = isBull
      ? pullback.ema50Level >= pullback.oteZoneLow && pullback.ema50Level <= pullback.oteZoneHigh + 2 * atr14
      : pullback.ema50Level >= pullback.oteZoneLow - 2 * atr14 && pullback.ema50Level <= pullback.oteZoneHigh
    const emaInZone = ema20Near || ema50Near

    if (emaInZone) {
      const ltf = ltfFor(pullback.oteZoneHigh, pullback.oteZoneLow)
      return {
        triggered:       true,
        trigger:         'EMA_OTE_CONFLUENCE' as EntryTrigger,
        entryPrice:      currentPrice,
        ltfConfirmation: ltf,
        volumeAtTrigger: volRatio,
      }
    }
  }

  return noEntry
}
