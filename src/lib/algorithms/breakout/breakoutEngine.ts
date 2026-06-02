/**
 * TRAXO Breakout Algorithm — Breakout Engine
 *
 * Detects breakout and stop hunt events against a consolidation zone,
 * and monitors for retest entries after an initial breakout.
 *
 * FIX 2 — Stop Hunt Reversal Direction:
 * The spec's Section 10.4 had an ambiguity: it said to fire a signal in the
 * "stop-hunt direction" (e.g. up, for a bullish wick through resistance).
 * This is WRONG — a bullish wick through resistance that closes back inside
 * proves the level is a trap for longs. The institutional move is DOWN.
 *
 * Correction: when `stopHuntDetected = true`, the signal direction is the
 * OPPOSITE of `stopHuntWickDirection`. The `direction` field on the event
 * already reflects the corrected (flipped) signal direction.
 */

import type { BKCandle, ConsolidationZone, BreakoutEvent } from './types'
import { getTrendlinePrice } from './consolidationEngine'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Max candles after breakout to monitor for retest. After this window, retest expires. */
const RETEST_WINDOW = 20

/**
 * Body-close threshold: candle close must be this far beyond the trendline
 * to qualify as a confirmed breakout (avoids borderline spikes).
 */
const BREAKOUT_BODY_THRESHOLD_ATR = 0.5

// ─────────────────────────────────────────────
// Breakout / Stop Hunt Detection
// ─────────────────────────────────────────────

/**
 * Scan the last 1–3 candles for a breakout event or stop hunt against the zone.
 *
 * Breakout (confirmed):
 *   Bull — candle body closes > resistanceLevel + 0.5 × ATR14
 *   Bear — candle body closes < supportLevel  - 0.5 × ATR14
 *
 * Stop Hunt (FIX 2):
 *   Bullish wick above resistance, closed back inside → institutional trap for longs.
 *   Signal fires BEARISH (opposite of the wick). The zone acts as supply.
 *
 *   Bearish wick below support, closed back inside → institutional trap for shorts.
 *   Signal fires BULLISH (opposite of the wick). The zone acts as demand.
 *
 * For stop hunt confirmation (post-hunt reversal), we require the candle after
 * the stop hunt to close strongly in the signal direction — that confirmation
 * check is done in the orchestrator after this function fires.
 */
export function detectBreakout(
  candles:     BKCandle[],
  zone:        ConsolidationZone,
  atr14:       number,
  volumeRatio: number,
): BreakoutEvent | null {
  const n = candles.length
  const threshold = BREAKOUT_BODY_THRESHOLD_ATR * atr14

  for (let offset = 0; offset < 3; offset++) {
    const idx = n - 1 - offset
    if (idx < 0) break

    const c         = candles[idx]
    const resLevel  = getTrendlinePrice(zone.resistanceLine, idx)
    const supLevel  = getTrendlinePrice(zone.supportLine,    idx)

    // ── Confirmed bullish breakout (body close above resistance) ──────────
    if (c.close > resLevel + threshold) {
      return {
        zoneId:                    zone.id,
        direction:                 'BULLISH',
        breakoutCandleIndex:       idx,
        closeBeyondLevel:          true,
        volumeRatio,
        resistanceLevelAtBreakout: resLevel,
        supportLevelAtBreakout:    supLevel,
        retestPending:             offset > 0,  // earlier candle → retest window open
        retestTriggered:           false,
        retestCandleIndex:         null,
        falseBreakout:             false,
        stopHuntDetected:          false,
        stopHuntWickDirection:     null,
      }
    }

    // ── Confirmed bearish breakout (body close below support) ─────────────
    if (c.close < supLevel - threshold) {
      return {
        zoneId:                    zone.id,
        direction:                 'BEARISH',
        breakoutCandleIndex:       idx,
        closeBeyondLevel:          true,
        volumeRatio,
        resistanceLevelAtBreakout: resLevel,
        supportLevelAtBreakout:    supLevel,
        retestPending:             offset > 0,
        retestTriggered:           false,
        retestCandleIndex:         null,
        falseBreakout:             false,
        stopHuntDetected:          false,
        stopHuntWickDirection:     null,
      }
    }

    // ── Bullish stop hunt (FIX 2) ─────────────────────────────────────────
    // Wick above resistance but closed BACK INSIDE → trap for retail longs.
    // Institutional move is DOWN — signal fires BEARISH.
    if (c.high > resLevel && c.close <= resLevel && c.close >= supLevel) {
      return {
        zoneId:                    zone.id,
        direction:                 'BEARISH',   // FIX 2: opposite of wick
        breakoutCandleIndex:       idx,
        closeBeyondLevel:          false,        // no confirmed body close
        volumeRatio,
        resistanceLevelAtBreakout: resLevel,
        supportLevelAtBreakout:    supLevel,
        retestPending:             false,
        retestTriggered:           false,
        retestCandleIndex:         null,
        falseBreakout:             true,
        stopHuntDetected:          true,
        stopHuntWickDirection:     'BULLISH',   // the wick that hunted stops
      }
    }

    // ── Bearish stop hunt (FIX 2) ─────────────────────────────────────────
    // Wick below support but closed BACK INSIDE → trap for retail shorts.
    // Institutional move is UP — signal fires BULLISH.
    if (c.low < supLevel && c.close >= supLevel && c.close <= resLevel) {
      return {
        zoneId:                    zone.id,
        direction:                 'BULLISH',   // FIX 2: opposite of wick
        breakoutCandleIndex:       idx,
        closeBeyondLevel:          false,
        volumeRatio,
        resistanceLevelAtBreakout: resLevel,
        supportLevelAtBreakout:    supLevel,
        retestPending:             false,
        retestTriggered:           false,
        retestCandleIndex:         null,
        falseBreakout:             true,
        stopHuntDetected:          true,
        stopHuntWickDirection:     'BEARISH',
      }
    }
  }

  return null
}

// ─────────────────────────────────────────────
// Retest Monitor
// ─────────────────────────────────────────────

/**
 * After a confirmed body-close breakout, monitors subsequent candles for a
 * retest of the broken level (polarity flip: broken resistance → new support).
 *
 * For bullish breakout:
 *   Price retraces back to old resistance → must CLOSE ABOVE it.
 *   If it closes back below → false breakout.
 *
 * For bearish breakout:
 *   Price retraces back to old support → must CLOSE BELOW it.
 *   If it closes back above → false breakout.
 *
 * Window: RETEST_WINDOW candles. After that, retest opportunity expires
 * (market has moved on without retesting — momentum entry only).
 */
export function checkRetest(
  candles: BKCandle[],
  event:   BreakoutEvent,
  atr14:   number,
): BreakoutEvent {
  // Only look for retests on confirmed body-close breakouts
  if (!event.closeBeyondLevel) return event

  const brokenLevel = event.direction === 'BULLISH'
    ? event.resistanceLevelAtBreakout
    : event.supportLevelAtBreakout

  const tolerance  = 0.1 * atr14
  const startIdx   = event.breakoutCandleIndex + 1
  const n          = candles.length

  for (let i = startIdx; i < Math.min(n, startIdx + RETEST_WINDOW); i++) {
    const c = candles[i]

    if (event.direction === 'BULLISH') {
      // Price touched old resistance level
      if (c.low <= brokenLevel + tolerance) {
        if (c.close > brokenLevel) {
          // Closed above → polarity confirmed → retest valid
          return { ...event, retestTriggered: true, retestCandleIndex: i, retestPending: false }
        }
        if (c.close < brokenLevel - tolerance) {
          // Closed below → false breakout
          return { ...event, falseBreakout: true, retestPending: false }
        }
      }
    } else {
      // Bearish: price touched old support level from below
      if (c.high >= brokenLevel - tolerance) {
        if (c.close < brokenLevel) {
          return { ...event, retestTriggered: true, retestCandleIndex: i, retestPending: false }
        }
        if (c.close > brokenLevel + tolerance) {
          return { ...event, falseBreakout: true, retestPending: false }
        }
      }
    }
  }

  // Window check
  const candlesSinceBreakout = n - 1 - event.breakoutCandleIndex
  if (candlesSinceBreakout >= RETEST_WINDOW) {
    return { ...event, retestPending: false }
  }

  return { ...event, retestPending: true }
}
