// ─── Supply & Demand Algorithm Types ────────────────────────────────────────

export type SDAssetType = 'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'
export type SDZoneType  = 'DEMAND' | 'SUPPLY'
export type SDPattern   = 'DBR' | 'RBR' | 'RBD' | 'DBD'
export type SDTier      = 'prime' | 'standard' | 'aggressive' | 'discard'

// ─── Candle ──────────────────────────────────────────────────────────────────

export interface SDCandle {
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number   // 0 when feed provides no real volume
  timestamp: string
}

// ─── Swing Points & Liquidity Pools ─────────────────────────────────────────

export interface SDSwingPoint {
  price:        number
  index:        number
  type:         'high' | 'low'
}

/**
 * Internal / External liquidity pools used for stop-hunt validation.
 * `formedAtIndex` is used by the GC (Refinement 4: Orphaned LP pruning).
 */
export interface LiquidityPool {
  price:          number
  type:           'BSL' | 'SSL'   // Buy-side (above swing high) | Sell-side (below swing low)
  formedAtIndex:  number
}

// ─── Zone ────────────────────────────────────────────────────────────────────

export interface SupplyDemandZone {
  id:                     string
  type:                   SDZoneType
  pattern:                SDPattern
  proximal_line:          number
  distal_line:            number
  mitigation_level:       number        // 50% midpoint
  zone_width:             number        // abs(distal - proximal) in price
  zone_width_atr:         number        // zone_width / ATR14
  base_candle_count:      number
  departure_speed:        number        // departure body / ATR14
  /** Refinement 1: departure candle volume / VMA20 (null when no real volume) */
  departure_volume_ratio: number | null
  quality_score:          number        // 0–10 rubric
  fresh:                  boolean
  tap_count:              number
  formed_at:              number        // Unix timestamp ms
  base_start_index:       number        // candle index where base starts
  departure_index:        number        // candle index of departure candle
  htf_aligned:            boolean
  fvg_inside:             boolean
  liquidity_swept:        boolean
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface SupplyDemandContext {
  symbol:                  string
  timeframe:               string
  assetType:               SDAssetType
  candles:                 SDCandle[]
  /** Global rolling drawdown % (4% kill switch) */
  rollingDrawdownPct?:     number
  consecutiveLosses?:      number
  /** Refinement 3: per-symbol drawdown % (2% symbol-level kill switch) */
  perSymbolDrawdownPct?:   number
  perSymbolConsecLosses?:  number
  /** Minutes until next high-impact news event (negative = event is past) */
  newsMinutesAway?:        number
  htfTrendDirection?:      'BULLISH' | 'BEARISH' | 'NEUTRAL'
}

// ─── Signal ──────────────────────────────────────────────────────────────────

export interface SupplyDemandSignal {
  id:                   string
  strategy_id:          'supply_demand'
  signal:               'BUY' | 'SELL' | 'NO_TRADE'
  symbol:               string
  asset_type:           SDAssetType

  // Zone Properties
  zone_type:            SDZoneType
  pattern:              SDPattern
  proximal_line:        number
  distal_line:          number
  mitigation_level:     number
  zone_width_atr:       number

  // Quality
  zone_quality_score:   number
  score:                number
  confidence_pct:       number
  tier:                 SDTier
  fresh:                boolean
  tap_count:            number

  // Execution Levels
  entry_type:           'limit' | 'market'
  entry_price:          number
  sl_price:             number
  tp1_price:            number
  tp2_price:            number
  suggested_risk_pct:   number

  // Breakeven
  breakeven_price:      number
  breakeven_triggered:  boolean

  // Lifecycle
  expiry_candles:       number
  time_decay_limit:     number
  zone_invalidated:     boolean

  // Confluence Trace
  htf_aligned:          boolean
  htf_zone_nested:      boolean
  fvg_inside:           boolean
  liquidity_swept:      boolean
  departure_candles:    number
  session_active:       boolean
  reason:               string[]
  timestamp:            string
}
