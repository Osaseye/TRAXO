/**
 * TRAXO Trend Following Algorithm — Shared Type Definitions
 *
 * All interfaces and enums used across the TF engine suite.
 * Engines import from here only; they do not re-declare types locally.
 */

// ─────────────────────────────────────────────
// Asset & Direction
// ─────────────────────────────────────────────

export type TFAssetType = 'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'

export type TrendDirection = 'BULLISH' | 'BEARISH' | 'RANGING'
export type TrendStrength  = 'STRONG' | 'MODERATE' | 'WEAK'
export type EMAStackStatus = 'ALIGNED' | 'PARTIAL' | 'MESSY'
export type EntryTrigger   = 'FVG_FILL' | 'OB_AT_PULLBACK' | 'EMA_OTE_CONFLUENCE'
export type LTFConfirmation = 'MSS_CONFIRMED' | 'PIN_BAR_CONFIRMED' | 'NO_CONFIRMATION'
export type TFTier         = 'prime' | 'standard' | 'aggressive' | 'discard'

// ─────────────────────────────────────────────
// Candle
// ─────────────────────────────────────────────

export interface TFCandle {
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
  /** ISO 8601 timestamp */
  timestamp: string
}

// ─────────────────────────────────────────────
// Swing Points
// ─────────────────────────────────────────────

export type SwingLabel = 'HH' | 'HL' | 'LH' | 'LL' | 'SWING_HIGH' | 'SWING_LOW'

export interface TFSwingPoint {
  price: number
  index: number
  type:  SwingLabel
}

// ─────────────────────────────────────────────
// Trend State
// ─────────────────────────────────────────────

export interface TrendState {
  direction:        TrendDirection
  strength:         TrendStrength
  emaStack:         EMAStackStatus
  emaStackBias:     'BULLISH' | 'BEARISH' | 'AMBIGUOUS'
  swingHighs:       TFSwingPoint[]
  swingLows:        TFSwingPoint[]
  /** Most recent confirmed Higher High (uptrend context) */
  lastHH:           TFSwingPoint | null
  /** Most recent confirmed Higher Low (uptrend context) */
  lastHL:           TFSwingPoint | null
  /** Most recent confirmed Lower High (downtrend context) */
  lastLH:           TFSwingPoint | null
  /** Most recent confirmed Lower Low (downtrend context) */
  lastLL:           TFSwingPoint | null
  /** True if a close below the last HL (bull) or above last LH (bear) has occurred */
  chochActive:      boolean
  adxValue:         number
  ema20:            number
  ema50:            number
  ema200:           number
  atr14:            number
  vma20:            number
}

// ─────────────────────────────────────────────
// Zones
// ─────────────────────────────────────────────

export interface FVGZone {
  top:         number     // Higher price boundary
  bottom:      number     // Lower price boundary
  direction:   'BULLISH' | 'BEARISH'
  candleIndex: number     // Middle candle index (in impulse slice)
  sizeAtr:     number     // FVG height expressed as ATR multiples
}

export interface OBZone {
  high:        number
  low:         number
  direction:   'BULLISH' | 'BEARISH'
  candleIndex: number
}

// ─────────────────────────────────────────────
// Pullback Context
// ─────────────────────────────────────────────

export interface PullbackContext {
  valid:                 boolean
  direction:             'BULLISH_PULLBACK' | 'BEARISH_PULLBACK' | null
  /** Price at which the pullback started (HH for bull, LL for bear) */
  pullbackStartPrice:    number
  /** Deepest price reached during the pullback (lowest low for bull) */
  pullbackExtremePrice:  number
  /** Retrace as a percentage of the prior impulse swing range */
  depth:                 number
  fibR382:               number
  fibR500:               number
  fibR618:               number
  fibR786:               number
  /** Upper price boundary of OTE zone — 61.8% retrace level */
  oteZoneHigh:           number
  /** Lower price boundary of OTE zone — 78.6% retrace level */
  oteZoneLow:            number
  ema20Level:            number
  ema50Level:            number
  /** Best qualifying FVG sitting at or below the 50% equilibrium */
  fvgInPullback:         FVGZone | null
  /** Demand/Supply OB inside the pullback range */
  obInPullback:          OBZone | null
  /** Equal lows (bull) / equal highs (bear) swept before current candle */
  internalLiqSwept:      boolean
  pullbackCandleCount:   number
  avgPullbackVolume:     number
}

// ─────────────────────────────────────────────
// Entry Evaluation
// ─────────────────────────────────────────────

export interface TFEntryResult {
  triggered:           boolean
  trigger:             EntryTrigger | null
  /** Indicative entry price (zone midpoint or current close) */
  entryPrice:          number
  ltfConfirmation:     LTFConfirmation
  /** Entry candle volume / VMA_20 */
  volumeAtTrigger:     number
}

// ─────────────────────────────────────────────
// Output Signal
// ─────────────────────────────────────────────

export interface TrendFollowingSignal {
  id:                   string
  strategy_id:          'trend_following'
  signal:               'BUY' | 'SELL' | 'NO_TRADE'
  symbol:               string
  timeframe:            string
  asset_type:           TFAssetType

  // Trend Context
  trend_direction:      TrendDirection
  trend_strength:       TrendStrength
  adx_value:            number
  ema_stack:            EMAStackStatus
  ema20:                number
  ema50:                number
  ema200:               number
  last_hh_price:        number | null
  last_hl_price:        number | null
  choch_active:         boolean

  // Pullback
  pullback_depth_pct:   number
  fib_r382:             number
  fib_r500:             number
  fib_r618:             number
  fib_r786:             number
  ote_zone_high:        number
  ote_zone_low:         number
  internal_liq_swept:   boolean

  // Entry
  entry_trigger:        EntryTrigger | null
  ltf_confirmation:     LTFConfirmation

  // Score & Tier
  score:                number
  confidence_pct:       number
  tier:                 TFTier

  // Execution Levels
  entry_type:           'limit' | 'market'
  entry_price:          number
  sl_price:             number
  tp1_price:            number
  tp2_price:            number
  fib_extension_161_8:  number
  suggested_risk_pct:   number
  breakeven_price:      number
  trailing_sl_price:    number | null

  reason:               string[]
  timestamp:            string
}

// ─────────────────────────────────────────────
// Engine Context (inputs to the orchestrator)
// ─────────────────────────────────────────────

export interface TrendFollowingContext {
  symbol:               string
  timeframe:            string
  asset_type:           TFAssetType
  /** Full candle history — minimum 220 recommended (200 for EMA-200 + buffer) */
  candles:              TFCandle[]
  /** Rolling drawdown percentage (0–100). Circuit breaker at >= 4.0% */
  rollingDrawdownPct?:  number
  /** Consecutive losing trades. Halves risk at >= 3 */
  consecutiveLosses?:   number
  /** Minutes until next high-impact news event */
  newsMinutesAway?:     number | null
  /** HTF trend direction for multi-timeframe alignment */
  htfTrendDirection?:   TrendDirection
  /** HTF ADX value */
  htfAdx?:              number
}
