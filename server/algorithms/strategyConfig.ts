/**
 * TRAXO Strategy Configuration
 *
 * All numeric thresholds used across the Order Block (and future) strategy engines
 * are exported from this single file.
 *
 * Engine code MUST import from here — never hardcode thresholds inside engine logic.
 * This allows per-instrument tuning without touching engine code.
 */

/**
 * Asset type used by the Order Block strategy.
 * FUTURES is added here beyond WickRejection's type because OB trades futures instruments.
 */
export type AssetType = 'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'

// ─────────────────────────────────────────────
// Scoring Normalization
// ─────────────────────────────────────────────

/**
 * Theoretical maximum raw score if all additive confluence factors align.
 * Tier thresholds are derived from (score / MAX_POSSIBLE_SCORE) * 100.
 * Update this constant when new additive scoring items are added.
 */
export const MAX_POSSIBLE_SCORE = 32

// ─────────────────────────────────────────────
// Tier Confidence Thresholds (normalized %)
// ─────────────────────────────────────────────

export const TIER_PRIME_PCT      = 75  // confidence_pct >= 75 → PRIME
export const TIER_STANDARD_PCT   = 55  // confidence_pct >= 55 → STANDARD
export const TIER_AGGRESSIVE_PCT = 40  // confidence_pct >= 40 → AGGRESSIVE
// Below TIER_AGGRESSIVE_PCT → DISCARD

// ─────────────────────────────────────────────
// AMD Phase Detection
// ─────────────────────────────────────────────

/** range_width < N × ATR(14) classifies the market as ACCUMULATION */
export const AMD_ACCUMULATION_RANGE_MULTIPLIER = 1.5

/** Max proximity (in ATR units) from EQH/EQL for a stop-hunt sweep to count as MANIPULATION */
export const AMD_MANIPULATION_PROXIMITY_ATR = 0.15

/** Number of recent candles with no BOS required before declaring ACCUMULATION */
export const AMD_NO_BOS_LOOKBACK = 20

/** VMA multiplier for DISTRIBUTION phase volume confirmation (V1 fallback — prefer CVD when available) */
export const AMD_DISTRIBUTION_VOLUME_MULTIPLIER = 1.5

/** Elevated VMA multiplier used for CRYPTO asset type */
export const AMD_DISTRIBUTION_VOLUME_MULTIPLIER_CRYPTO = 2.0

// ─────────────────────────────────────────────
// Provisional BOS (Intra-Candle Sub-Routine)
// ─────────────────────────────────────────────

/** Price must pierce structure by more than N × ATR(14) to trigger a Provisional BOS */
export const PROVISIONAL_BOS_ATR_THRESHOLD = 0.5

// ─────────────────────────────────────────────
// BOS Quality Scoring
// ─────────────────────────────────────────────

/** Body displacement > N × ATR(14) classifies BOS as STRONG (+2) */
export const BOS_STRONG_DISPLACEMENT_ATR = 1.2

/** Body displacement > N × ATR(14) classifies BOS as MEDIUM (+1) */
export const BOS_MEDIUM_DISPLACEMENT_ATR = 0.6
// Below BOS_MEDIUM_DISPLACEMENT_ATR → WEAK (+0)

// ─────────────────────────────────────────────
// FVG Grading
// ─────────────────────────────────────────────

/** Minimum FVG size (in ATR units) to pass the noise gate */
export const FVG_MIN_SIZE_ATR      = 0.10

/** FVG size threshold (ATR units) for NORMAL grade (+2) */
export const FVG_NORMAL_ATR        = 0.25

/** FVG size threshold (ATR units) for INSTITUTIONAL grade (+3) */
export const FVG_INSTITUTIONAL_ATR = 1.00

// ─────────────────────────────────────────────
// Displacement Engine
// ─────────────────────────────────────────────

/** Body size ≥ N × ATR(14) required for STRONG displacement (+3) */
export const DISPLACEMENT_STRONG_ATR = 1.5

/** Body size ≥ N × ATR(14) required for MEDIUM displacement (+2) */
export const DISPLACEMENT_MEDIUM_ATR = 0.8
// Body dominance thresholds: STRONG ≥ 0.7, MEDIUM ≥ 0.5 (hardcoded in engine logic)

// ─────────────────────────────────────────────
// Liquidity Void
// ─────────────────────────────────────────────

/** Minimum number of consecutive non-overlapping candles to qualify as a Liquidity Void */
export const LIQUIDITY_VOID_MIN_CANDLES = 3

// ─────────────────────────────────────────────
// Market Regime Engine
// ─────────────────────────────────────────────

/** Number of recent swing highs/lows to inspect for trend direction in regime detection */
export const REGIME_SWING_LOOKBACK = 4

/** ATR SMA period used to detect ATR expansion (EXPANDING regime) */
export const REGIME_ATR_SMA_PERIOD = 10

// ─────────────────────────────────────────────
// OB Cluster Engine (Multi-Timeframe Alignment)
// ─────────────────────────────────────────────

/** Score bonus for 2-timeframe OB alignment */
export const CLUSTER_SCORE_2TF = 2

/** Score bonus for 3+ timeframe OB alignment */
export const CLUSTER_SCORE_3TF = 4

// ─────────────────────────────────────────────
// News Severity
// ─────────────────────────────────────────────

/** Hard kill block window (minutes BEFORE event) for CRITICAL severity (NFP, FOMC, CPI) */
export const NEWS_CRITICAL_BLOCK_BEFORE_MINUTES = 120

/** Hard kill block window (minutes AFTER event) for CRITICAL severity */
export const NEWS_CRITICAL_BLOCK_AFTER_MINUTES = 60

/** Hard kill block window (minutes before/after) for HIGH severity */
export const NEWS_HIGH_BLOCK_MINUTES = 30

/** Block window (minutes before/after) for MEDIUM severity */
export const NEWS_MEDIUM_BLOCK_MINUTES = 15

export const NEWS_MEDIUM_PENALTY = -2

// ─────────────────────────────────────────────
// Kill Zone Engine
// ─────────────────────────────────────────────

/** UTC hour at which London Kill Zone begins (07:00) */
export const KILL_ZONE_LONDON_START = 7.0

/** UTC hour at which London Kill Zone ends (10:00) */
export const KILL_ZONE_LONDON_END = 10.0

/** UTC hour at which NY Kill Zone begins (12:00) */
export const KILL_ZONE_NY_START = 12.0

/** UTC hour at which NY Kill Zone ends (15:00) */
export const KILL_ZONE_NY_END = 15.0

/** Score bonus for being inside an active Kill Zone */
export const KILL_ZONE_SCORE_BONUS = 2

// ─────────────────────────────────────────────
// Market Structure
// ─────────────────────────────────────────────

/** Candles on each side required to confirm a swing high or low */
export const SWING_LOOKBACK = 5

/** Tolerance band (as fraction of range) at the equilibrium midpoint for PREMIUM/DISCOUNT classification */
export const EQ_TOLERANCE_PCT = 0.05

/** Max distance (ATR units) between two swing highs/lows to classify them as Equal (EQH/EQL) */
export const EQH_EQL_PROXIMITY_ATR = 0.05

/** Max distance (ATR units) from a swept swing low/high for C4 (structural origin) to be confirmed */
export const C4_SSL_PROXIMITY_ATR = 0.3

// ─────────────────────────────────────────────
// Rejection Block
// ─────────────────────────────────────────────

/** Minimum wick size above the candle body (in ATR units) for a Rejection Block to qualify */
export const REJECTION_BLOCK_MIN_WICK_ATR = 1.5

/**
 * Maximum wick overshoot beyond the swept swing level, per asset type (in ATR units).
 *
 * A fixed cap (e.g. 0.2) would incorrectly filter crypto liquidation-cascade wicks.
 * These defaults reflect typical sweep depths per market structure.
 */
export const REJECTION_BLOCK_MAX_OVERSHOOT_ATR: Record<AssetType, number> = {
  FOREX:     0.5,
  STOCKS:    1.0,
  CRYPTO:    2.5,
  FUTURES:   2.0,
  COMMODITY: 1.5,
}

// ─────────────────────────────────────────────
// Scoring Matrix Modifiers
// ─────────────────────────────────────────────

export const SCORE_HTF_ALIGNMENT_BONUS       =  2
export const SCORE_HTF_COUNTER_PENALTY       = -2
export const SCORE_WRONG_ZONE_PENALTY        = -2
export const SCORE_VOLUME_LOW_PENALTY        = -1
export const SCORE_ASIA_SESSION_PENALTY      = -1

/** Breakout RVOL thresholds. */
export const BREAKOUT_VOLUME_CONFIRMATION_RVOL = 1.2
export const BREAKOUT_VOLUME_STRONG_RVOL = 2.0
export const BREAKOUT_VOLUME_INSTITUTIONAL_RVOL = 3.0

/** Order-block volume-to-VMA20 thresholds. */
export const ORDER_BLOCK_VOLUME_CONFIRMATION_RVOL = 1.3
export const ORDER_BLOCK_VOLUME_STRONG_RVOL = 1.75
export const ORDER_BLOCK_VOLUME_INSTITUTIONAL_RVOL = 2.25

/** Hard kill — news event within this many minutes wipes the signal */
export const NEWS_KILL_PENALTY               = -3
export const NEWS_KILL_WINDOW_MINUTES        = 30

/** Session score bonuses */
export const SESSION_SCORE_LONDON_NY_OVERLAP =  3  // 12:00–16:00 UTC
export const SESSION_SCORE_LONDON_OPEN       =  2  // 07:00–09:00 UTC
export const SESSION_SCORE_NY_OPEN           =  2  // 12:00–14:00 UTC

/** Freshness decay — points applied based on OB tap count */
export const OB_FRESHNESS_SCORES: Record<number, number> = {
  0: 3,   // Fresh — first approach, never tapped
  1: 0,   // Tapped once — neutral
  2: -2,  // Tapped twice — significantly reduced
  // 3+ taps: auto-discard before scoring (see OB_MAX_TAP_COUNT)
}

// ─────────────────────────────────────────────
// Tier Thresholds (legacy raw-point values — DEPRECATED)
// Use TIER_PRIME_PCT / TIER_STANDARD_PCT / TIER_AGGRESSIVE_PCT above for V3 logic
// ─────────────────────────────────────────────

/** @deprecated Use TIER_PRIME_PCT */
export const TIER_PRIME_MIN      = 11
/** @deprecated Use TIER_STANDARD_PCT */
export const TIER_STANDARD_MIN   = 8
/** @deprecated Use TIER_AGGRESSIVE_PCT */
export const TIER_AGGRESSIVE_MIN = 6

// ─────────────────────────────────────────────
// OB Lifecycle
// ─────────────────────────────────────────────

/** Cancel an un-tapped OB after this many candles */
export const OB_EXPIRY_CANDLES_DEFAULT = 50

/** Discard OB when tap count reaches or exceeds this value */
export const OB_MAX_TAP_COUNT = 3

/** Force break-even exit when trade has been open this many candles near $0 PnL */
export const TIME_DECAY_CANDLES = 30

// ─────────────────────────────────────────────
// Risk & Position Sizing
// ─────────────────────────────────────────────

/** Daily drawdown % that triggers the kill switch */
export const DAILY_DRAWDOWN_KILL_PCT = 4.0

/** Consecutive losing trades before risk multiplier is halved */
export const STREAK_MITIGATION_LOSSES = 3

/** ATR buffer beyond OB candle wick for stop loss placement */
export const SL_ATR_BUFFER = 0.15

/** ATR slippage buffer added at break-even to avoid commission-induced losses */
export const BREAKEVEN_SLIPPAGE_ATR = 0.1

/** Fraction of position to close at TP1 */
export const PARTIAL_EXIT_TP1_PCT = 0.50

/** Fraction of position to close at TP2 */
export const PARTIAL_EXIT_TP2_PCT = 0.30

// ─────────────────────────────────────────────
// Split Entry Payload
// ─────────────────────────────────────────────

/** Fraction of position deployed at the proximal line (OB candle Open — first touch) */
export const ENTRY_PROXIMAL_FRACTION = 0.30

/** Fraction of position deployed at the OTE zone (deeper limit) */
export const ENTRY_OTE_FRACTION = 0.70

/** Fibonacci level for the shallow boundary of the OTE zone */
export const OTE_HIGH_FIB = 0.618

/** Fibonacci level for the deep boundary of the OTE zone */
export const OTE_LOW_FIB = 0.786

// ─────────────────────────────────────────────
// V3 Score Point Matrix (named constants for each point)
// ─────────────────────────────────────────────

// BOS Quality
export const SCORE_BOS_STRONG = 2
export const SCORE_BOS_MEDIUM = 1

// FVG
export const SCORE_FVG_INSTITUTIONAL = 3
export const SCORE_FVG_NORMAL        = 2
export const SCORE_FVG_MICRO         = 1

// Displacement
export const SCORE_DISPLACEMENT_STRONG = 3
export const SCORE_DISPLACEMENT_MEDIUM = 2

// Liquidity Void
export const SCORE_LIQUIDITY_VOID = 2

// OB Cluster
export const SCORE_CLUSTER_2TF   = 2
export const SCORE_CLUSTER_3TF   = 4

// Kill Zone
export const SCORE_KILL_ZONE     = 2

// Regime
export const SCORE_REGIME_TRENDING    = 0
export const SCORE_REGIME_EXPANDING   = 1
export const SCORE_REGIME_CONTRACTING = -1
export const SCORE_REGIME_RANGING     = -2

// News (MEDIUM penalty only — CRITICAL and HIGH use NEWS_KILL_PENALTY = -3)
export const SCORE_NEWS_MEDIUM = -2

// ─────────────────────────────────────────────
// Analytics Engine
// ─────────────────────────────────────────────

/**
 * Minimum number of TradeOutcomeRecords required per (symbol, timeframe) pair
 * before edge queries are considered statistically significant.
 */
export const ANALYTICS_MIN_RECORDS_FOR_SIGNIFICANCE = 100
