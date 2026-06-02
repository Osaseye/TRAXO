/**
 * TRAXO Order Block Algorithm — Shared Type Definitions
 *
 * All interfaces used across the OB engine suite. Engines import from here only;
 * they do not re-declare types locally.
 */

import type { Timeframe } from '@/types'
import type { AssetType } from '../strategyConfig'

// ─────────────────────────────────────────────
// Candle
// ─────────────────────────────────────────────

export interface OBCandle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** ISO 8601 timestamp — required (used by KillZoneEngine for UTC hour parsing) */
  timestamp: string
}

// ─────────────────────────────────────────────
// Market Structure
// ─────────────────────────────────────────────

export type StructureBias = 'BULLISH' | 'BEARISH' | 'RANGING'
export type AMDPhase = 'ACCUMULATION' | 'MANIPULATION' | 'DISTRIBUTION'
export type BosQuality = 'STRONG' | 'MEDIUM' | 'WEAK'
export type PriceLocation = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'

export interface SwingPoint {
  price: number
  index: number
  type: 'HH' | 'HL' | 'LH' | 'LL'
  swept: boolean
  timestamp: string
}

export interface StructureState {
  bias: StructureBias
  last_swing_high: SwingPoint | null
  last_swing_low: SwingPoint | null
  bos_confirmed: boolean
  bos_direction: 'BULLISH' | 'BEARISH' | null
  bos_candle_idx: number | null
  bos_quality: BosQuality
  choch_confirmed: boolean
  current_phase: AMDPhase
}

// ─────────────────────────────────────────────
// Liquidity Pools
// ─────────────────────────────────────────────

export type LiquidityPoolType = 'BSL' | 'SSL' | 'EQH' | 'EQL'

export interface LiquidityPool {
  type: LiquidityPoolType
  price: number
  zone_high: number
  zone_low: number
  candle_index: number
  swept: boolean
}

// ─────────────────────────────────────────────
// Fair Value Gap & Liquidity Void
// ─────────────────────────────────────────────

export type FVGGrade = 'INSTITUTIONAL' | 'NORMAL' | 'MICRO'
export type FVGDirection = 'BULLISH' | 'BEARISH'

export interface FVG {
  high: number
  low: number
  size_atr: number
  grade: FVGGrade
  direction: FVGDirection
  candle_index: number  // index of the middle candle (C2)
  filled: boolean
}

export interface LiquidityVoid {
  start_idx: number
  end_idx: number
  candle_count: number
  direction: FVGDirection
  zone_high: number
  zone_low: number
}

// ─────────────────────────────────────────────
// Displacement
// ─────────────────────────────────────────────

export type DisplacementQuality = 'STRONG' | 'MEDIUM' | 'WEAK'

export interface DisplacementResult {
  quality: DisplacementQuality
  size_atr: number       // body size / ATR14
  body_dominance: number // body / (high - low), 0–1
  consecutive_candles: number
}

// ─────────────────────────────────────────────
// Order Blocks
// ─────────────────────────────────────────────

export type OBType = 'BULLISH' | 'BEARISH' | 'BREAKER_BULL' | 'BREAKER_BEAR' | 'MITIGATION' | 'REJECTION'

export interface OrderBlock {
  id: string
  type: OBType
  high: number
  low: number
  /** Midpoint of the OB zone — used for equilibrium check */
  midpoint: number
  ob_candle_index: number
  tap_count: number
  formed_at: string  // ISO 8601
  timeframe: Timeframe
  /** Four-condition validation flags */
  c1_engulf: boolean
  c2_bos: boolean
  c3_fvg: boolean
  c4_structural_origin: boolean
  /** All four conditions satisfied */
  all_conditions: boolean
}

// ─────────────────────────────────────────────
// Market Regime
// ─────────────────────────────────────────────

export type MarketRegime = 'TRENDING' | 'RANGING' | 'EXPANDING' | 'CONTRACTING'

// ─────────────────────────────────────────────
// Kill Zone
// ─────────────────────────────────────────────

export type KillZone = 'LONDON' | 'NY' | null

// ─────────────────────────────────────────────
// MTF Cluster
// ─────────────────────────────────────────────

export interface OBCluster {
  /** Total aligned timeframes (includes base TF) */
  count: number
  /** Highest timeframe with an aligned OB */
  highest_timeframe: Timeframe | null
  /** Price intersection of all aligned OB zones */
  zone_high: number
  zone_low: number
}

// ─────────────────────────────────────────────
// News
// ─────────────────────────────────────────────

export type NewsSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM'

export interface NewsEvent {
  name: string
  severity: NewsSeverity
  /** ISO 8601 UTC timestamp of the event */
  timestamp_utc: string
  /** Minutes until event (negative = event has passed) */
  minutes_away?: number
}

// ─────────────────────────────────────────────
// Top-level Context (input to analyzeOrderBlock)
// ─────────────────────────────────────────────

export type HTFBias = 'bullish' | 'bearish' | 'neutral'

export interface OrderBlockContext {
  symbol: string
  asset_type: AssetType
  timeframe: Timeframe
  /** Candle series — must be closed candles in ascending time order */
  candles: OBCandle[]
  /**
   * Higher-timeframe candle sets for MTF cluster detection.
   * Key = timeframe string (e.g. '4H', '1D'). Caller provides these.
   * If omitted, cluster score will be +0 (no MTF bonus applied).
   */
  htfCandles?: Record<string, OBCandle[]>
  /** Pre-calculated ATR(14) for the base timeframe */
  atr14: number
  /** Volume moving average, 20 periods */
  volumeMa20: number
  /** HTF structural bias sourced from htfCache */
  htfBias?: HTFBias
  htfBiasStatus?: 'fresh' | 'stale' | 'failed'
  /** Upcoming news events (fetched by caller, sorted by timestamp) */
  newsEvents?: NewsEvent[]
  /** Account equity metrics for circuit breakers */
  rollingDrawdownPct?: number
  consecutiveLosses?: number
  accountBalance?: number
}

// ─────────────────────────────────────────────
// Signal Output (§9 Developer Output Schema)
// ─────────────────────────────────────────────

export type OBTier = 'prime' | 'standard' | 'aggressive' | 'discard'

export interface OrderBlockSignal {
  id: string
  strategy_id: 'order_block'
  signal: 'BUY' | 'SELL' | 'NO_TRADE'
  symbol: string
  asset_type: AssetType
  timeframe: Timeframe

  // Score & UI
  score: number
  confidence_pct: number
  tier: OBTier

  // BOS & Displacement
  bos_quality: BosQuality
  displacement_quality: DisplacementQuality
  displacement_size_atr: number

  // FVG & Void
  fvg_confluence: boolean
  fvg_grade: FVGGrade | null
  liquidity_void: boolean

  // Entry & Risk
  ob_type: OBType | null
  ob_high: number
  ob_low: number
  entry_proximal: number   // 30% allocation — OB zone edge
  entry_ote: number        // 70% allocation — OTE (0.618–0.786 Fib)
  sl_price: number
  tp1_price: number
  tp2_price: number
  tp3_price: number
  tp1_source: 'structure' | 'rr'
  tp2_source: 'structure' | 'rr'
  tp3_source: 'structure' | 'rr'
  suggested_risk_pct: number
  /** Size fraction for proximal entry (default 0.30) */
  entry1_size_pct: number
  /** Size fraction for OTE entry (default 0.70) */
  entry2_size_pct: number

  // Confluence Trace
  amd_phase: AMDPhase
  bos_confirmed: boolean
  choch_confirmed: boolean
  liquidity_sweep: boolean
  market_regime: MarketRegime | null
  ob_cluster_count: number
  ob_cluster_htf: Timeframe | null
  kill_zone_active: boolean
  kill_zone: KillZone
  htf_aligned: boolean
  session_active: boolean
  reason: string[]
  timestamp: string  // ISO 8601
}

// ─────────────────────────────────────────────
// Analytics (§12 TradeOutcomeRecord)
// ─────────────────────────────────────────────

export interface TradeOutcomeRecord {
  signal_id: string
  symbol: string
  asset_type: AssetType
  timeframe: Timeframe
  timestamp_signal: string
  timestamp_entry: string
  timestamp_exit: string

  ob_type: OBType | null
  bos_quality: BosQuality
  displacement_quality: DisplacementQuality
  fvg_grade: FVGGrade | null
  liquidity_void: boolean
  market_regime: MarketRegime | null
  session: string
  kill_zone: KillZone
  ob_cluster_count: number
  htf_aligned: boolean
  amd_phase: AMDPhase
  confidence_pct: number
  tier: OBTier
  score: number

  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN'
  pnl_r: number
  exit_reason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'BREAKEVEN' | 'TIME_DECAY' | 'MANUAL'
  max_favorable_r: number
  max_adverse_r: number
}
