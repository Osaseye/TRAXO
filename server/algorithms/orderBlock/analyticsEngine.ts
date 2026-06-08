/**
 * TRAXO Order Block — Analytics Engine
 *
 * Logs trade outcome records to localStorage (key: traxo_ob_analytics).
 * Storage layer is swappable — replace getStore/setStore to migrate to Firestore.
 */

import { ANALYTICS_MIN_RECORDS_FOR_SIGNIFICANCE } from '../strategyConfig'
import type { TradeOutcomeRecord, BosQuality, FVGGrade, MarketRegime, OBTier, AMDPhase, OBType } from './types'

const STORAGE_KEY = 'traxo_ob_analytics'

// ─────────────────────────────────────────────
// Storage Layer (swappable)
// ─────────────────────────────────────────────

function getStore(): TradeOutcomeRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TradeOutcomeRecord[]
  } catch {
    return []
  }
}

function setStore(records: TradeOutcomeRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // localStorage full or unavailable — silent fail; production upgrade to Firestore
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/** Appends a completed trade outcome record to the store */
export function logTradeOutcome(record: TradeOutcomeRecord): void {
  const records = getStore()
  records.push(record)
  setStore(records)
}

/** Returns all stored records, optionally filtered by symbol and/or timeframe */
export function getRecords(symbol?: string, timeframe?: string): TradeOutcomeRecord[] {
  let records = getStore()
  if (symbol) records = records.filter((r) => r.symbol === symbol)
  if (timeframe) records = records.filter((r) => r.timeframe === timeframe)
  return records
}

/** Deletes all records (for testing or user-initiated reset) */
export function clearAnalytics(): void {
  setStore([])
}

// ─────────────────────────────────────────────
// Edge Query
// ─────────────────────────────────────────────

export interface EdgeFilters {
  symbol?: string
  timeframe?: string
  ob_type?: OBType
  bos_quality?: BosQuality
  fvg_grade?: FVGGrade | null
  market_regime?: MarketRegime
  amd_phase?: AMDPhase
  tier?: OBTier
  htf_aligned?: boolean
  kill_zone?: string | null
}

export interface EdgeResult {
  win_rate: number      // 0–1
  avg_r: number         // average PnL in R
  sample_size: number
  significant: boolean  // true when sample_size >= ANALYTICS_MIN_RECORDS_FOR_SIGNIFICANCE
}

/**
 * Queries the edge of a particular setup context.
 *
 * Returns win_rate, average R, and whether the sample is statistically significant.
 */
export function queryEdgeByContext(filters: EdgeFilters): EdgeResult {
  let records = getStore()

  if (filters.symbol)       records = records.filter((r) => r.symbol === filters.symbol)
  if (filters.timeframe)    records = records.filter((r) => r.timeframe === filters.timeframe)
  if (filters.ob_type)      records = records.filter((r) => r.ob_type === filters.ob_type)
  if (filters.bos_quality)  records = records.filter((r) => r.bos_quality === filters.bos_quality)
  if (filters.fvg_grade !== undefined) records = records.filter((r) => r.fvg_grade === filters.fvg_grade)
  if (filters.market_regime) records = records.filter((r) => r.market_regime === filters.market_regime)
  if (filters.amd_phase)    records = records.filter((r) => r.amd_phase === filters.amd_phase)
  if (filters.tier)         records = records.filter((r) => r.tier === filters.tier)
  if (filters.htf_aligned !== undefined) records = records.filter((r) => r.htf_aligned === filters.htf_aligned)
  if (filters.kill_zone !== undefined) records = records.filter((r) => r.kill_zone === filters.kill_zone)

  const sample_size = records.length
  if (sample_size === 0) {
    return { win_rate: 0, avg_r: 0, sample_size: 0, significant: false }
  }

  const wins = records.filter((r) => r.outcome === 'WIN').length
  const win_rate = wins / sample_size
  const avg_r = records.reduce((sum, r) => sum + r.pnl_r, 0) / sample_size
  const significant = sample_size >= ANALYTICS_MIN_RECORDS_FOR_SIGNIFICANCE

  return { win_rate, avg_r, sample_size, significant }
}
