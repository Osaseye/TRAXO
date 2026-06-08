/**
 * TRAXO Breakout Algorithm — Shared Type Definitions
 *
 * All interfaces and union types used across the Breakout engine suite.
 * Engines import from here only; they do not re-declare types locally.
 */

// ─────────────────────────────────────────────
// Primitive Types
// ─────────────────────────────────────────────

export type BKAssetType     = 'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'
export type PatternType     = 'FLAG' | 'PENNANT' | 'TRIANGLE' | 'WEDGE' | 'RECTANGLE' | 'CUP_HANDLE'
export type TriangleSubtype = 'ASCENDING' | 'DESCENDING' | 'SYMMETRICAL'
export type WedgeDirection  = 'RISING' | 'FALLING'
export type BKTier          = 'prime' | 'standard' | 'aggressive' | 'discard'
export type PriorTrend      = 'BULLISH' | 'BEARISH' | 'NEUTRAL'
export type BreakoutDir     = 'BULLISH' | 'BEARISH'

// ─────────────────────────────────────────────
// Candle
// ─────────────────────────────────────────────

export interface BKCandle {
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
  /** ISO 8601 timestamp */
  timestamp: string
}

// ─────────────────────────────────────────────
// Swing Point
// ─────────────────────────────────────────────

export interface SwingPoint {
  price: number
  index: number
}

// ─────────────────────────────────────────────
// Trendline
// ─────────────────────────────────────────────

/**
 * Linear regression trendline.
 * price_at_index = slope * index + intercept  (unless locked)
 *
 * FIX 1 — Lock Mechanism:
 * When the zone is mature (touch_count >= 3 on both lines AND apex > 50%),
 * trendlines are frozen via `locked = true`. Once locked, `lockedPrice` is
 * used instead of re-evaluating the linear equation. This prevents the
 * "moving goalpost" problem where new swing points shift the breakout level.
 */
export interface Trendline {
  slope:          number        // price per candle index
  intercept:      number        // price at index 0
  touchCount:     number        // swing points within 0.15 × ATR14 tolerance
  locked:         boolean       // FIX 1: true = coordinates frozen
  lockedPrice:    number | null // captured price when lock was applied
  lastTouchIndex: number
}

// ─────────────────────────────────────────────
// Consolidation Zone
// ─────────────────────────────────────────────

export interface ConsolidationZone {
  id:               string
  patternType:      PatternType
  triangleSubtype:  TriangleSubtype | null
  wedgeDirection:   WedgeDirection | null
  resistanceLine:   Trendline
  supportLine:      Trendline
  rangeHeight:      number       // max distance between lines (price)
  rangeHeightAtr:   number       // rangeHeight / ATR14
  apexPct:          number | null // % through triangle formation (50–75% = optimal)
  compressionRatio: number       // current width / initial width (lower = tighter)
  formationCandles: number       // number of candles the pattern spans
  formationStart:   number       // candle index where pattern began
  priorTrend:       PriorTrend
  prevMoveSize:     number       // in ATR units
  active:           boolean
  falseBreakoutCount: number
}

// ─────────────────────────────────────────────
// Breakout Event
// ─────────────────────────────────────────────

export interface BreakoutEvent {
  zoneId:                     string
  direction:                  BreakoutDir    // Signal direction (already flipped for stop hunts)
  breakoutCandleIndex:        number
  closeBeyondLevel:           boolean        // Body close confirmed
  volumeRatio:                number         // RVOL vs session average
  resistanceLevelAtBreakout:  number
  supportLevelAtBreakout:     number
  retestPending:              boolean
  retestTriggered:            boolean
  retestCandleIndex:          number | null
  falseBreakout:              boolean
  stopHuntDetected:           boolean
  /**
   * FIX 2 — direction the stop hunt WICK went.
   * The signal fires in the OPPOSITE direction.
   * e.g. stopHuntWickDirection='BULLISH' → direction='BEARISH'
   */
  stopHuntWickDirection: BreakoutDir | null
}

// ─────────────────────────────────────────────
// Strategy Context
// ─────────────────────────────────────────────

export interface BreakoutContext {
  symbol:              string
  timeframe:           string
  assetType:           BKAssetType
  candles:             BKCandle[]
  rollingDrawdownPct?: number
  consecutiveLosses?:  number
  newsMinutesAway?:    number
  htfTrendDirection?:  'BULLISH' | 'BEARISH' | 'NEUTRAL'
}

// ─────────────────────────────────────────────
// Output Signal
// ─────────────────────────────────────────────

export interface BreakoutSignal {
  id:           string
  strategy_id:  'breakout'
  signal:       'BUY' | 'SELL' | 'NO_TRADE'
  symbol:       string
  timeframe:    string
  asset_type:   BKAssetType

  // Pattern
  pattern_type:        PatternType | null
  triangle_subtype:    TriangleSubtype | null
  wedge_direction:     WedgeDirection | null
  resistance_level:    number
  support_level:       number
  range_height:        number
  pattern_candles:     number
  apex_pct:            number | null

  // Breakout event
  breakout_direction:   BreakoutDir | null
  body_close_confirmed: boolean
  volume_ratio:         number
  stop_hunt_detected:   boolean
  false_breakout:       boolean
  retest_entry:         boolean

  // Score & confidence
  score:          number
  confidence_pct: number
  tier:           BKTier

  // Execution
  entry_type:       'limit' | 'market'
  entry_price:      number
  sl_price:         number
  tp1_price:        number
  tp2_price:        number
  tp3_trailing:     boolean
  suggested_risk_pct: number

  // Breakeven
  breakeven_price: number

  // Confluence trace
  htf_aligned:    boolean
  prior_trend:    PriorTrend
  prior_move_atr: number
  session_active: boolean
  bsl_pool_target: number | null
  reason:         string[]
  timestamp:      string
}
