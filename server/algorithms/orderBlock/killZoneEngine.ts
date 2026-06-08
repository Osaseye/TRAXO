/**
 * TRAXO Order Block — Kill Zone Engine
 *
 * Detects active kill zones (London / NY), Judas Swings, and provides the
 * HTF anchor timeframe lookup for OB analysis.
 */

import {
  KILL_ZONE_LONDON_START,
  KILL_ZONE_LONDON_END,
  KILL_ZONE_NY_START,
  KILL_ZONE_NY_END,
} from '../strategyConfig'
import type { OBCandle, KillZone, StructureState } from './types'

// ─────────────────────────────────────────────
// Kill Zone Detection
// ─────────────────────────────────────────────

/**
 * Determines if the given ISO 8601 UTC timestamp falls within London or NY kill zone.
 *
 * London open : 07:00–10:00 UTC
 * NY open     : 12:00–15:00 UTC
 *
 * Returns the zone name or null.
 */
export function isInKillZone(timestamp_iso: string): KillZone {
  const date = new Date(timestamp_iso)
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60

  if (utcHour >= KILL_ZONE_LONDON_START && utcHour < KILL_ZONE_LONDON_END) return 'LONDON'
  if (utcHour >= KILL_ZONE_NY_START && utcHour < KILL_ZONE_NY_END) return 'NY'

  return null
}

// ─────────────────────────────────────────────
// Judas Swing
// ─────────────────────────────────────────────

/**
 * A Judas Swing is a false breakout during a kill zone that sweeps liquidity
 * before reversing. Detected by:
 * 1. We are in a kill zone
 * 2. The last candle swept an opposing structural level (wick beyond last swing)
 * 3. Price then closed back inside the range
 */
export function detectJudasSwing(
  candles: OBCandle[],
  kill_zone: KillZone,
  structure_state: StructureState,
): boolean {
  if (!kill_zone || candles.length < 2) return false

  const lastCandle = candles.at(-1)!
  const prevCandle = candles.at(-2)!
  const { last_swing_high, last_swing_low } = structure_state

  // Bearish Judas: wick above last swing high but close below it
  if (
    last_swing_high &&
    lastCandle.high > last_swing_high.price &&
    lastCandle.close < last_swing_high.price
  ) {
    return true
  }

  // Bullish Judas: wick below last swing low but close above it
  if (
    last_swing_low &&
    lastCandle.low < last_swing_low.price &&
    lastCandle.close > last_swing_low.price
  ) {
    return true
  }

  // Also check if the previous candle's wick triggered it
  if (
    last_swing_high &&
    prevCandle.high > last_swing_high.price &&
    prevCandle.close < last_swing_high.price
  ) {
    return true
  }

  if (
    last_swing_low &&
    prevCandle.low < last_swing_low.price &&
    prevCandle.close > last_swing_low.price
  ) {
    return true
  }

  return false
}

// ─────────────────────────────────────────────
// Anchor Timeframe Mapping
// ─────────────────────────────────────────────

const OB_ANCHOR_MAP: Record<string, string> = {
  '1m': '15m',
  '3m': '15m',
  '5m': '1H',
  '15m': '4H',
  '30m': '4H',
  '1H': '1D',
  '4H': '1W',
  '1D': '1W',
}

/**
 * Maps a signal timeframe to the HTF reference timeframe used for OB context.
 * Falls back to '1D' if the timeframe is unknown.
 */
export function getOBAnchorTimeframe(timeframe: string): string {
  return OB_ANCHOR_MAP[timeframe] ?? '1D'
}
