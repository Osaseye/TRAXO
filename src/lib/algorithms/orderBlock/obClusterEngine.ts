/**
 * TRAXO Order Block — OB Cluster Engine
 *
 * Detects Multi-Timeframe (MTF) order block confluence. Scores +2 for 2-TF
 * alignment, +4 for 3+ TF alignment.
 */

import { CLUSTER_SCORE_2TF, CLUSTER_SCORE_3TF } from '../strategyConfig'
import { detectBullishOB, detectBearishOB } from './orderBlockEngine'
import { buildStructureState } from './structureEngine'
import { buildLiquidityState } from './liquidityEngine'
import type { OBCandle, OrderBlock, OBCluster } from './types'
import type { Timeframe } from '@/types'

// ─────────────────────────────────────────────
// Zone Overlap Test
// ─────────────────────────────────────────────

function zonesOverlap(
  a_high: number,
  a_low: number,
  b_high: number,
  b_low: number,
): boolean {
  return a_low <= b_high && a_high >= b_low
}

// ─────────────────────────────────────────────
// MTF Cluster Detection
// ─────────────────────────────────────────────

/**
 * For each HTF candle set provided, runs OB detection and checks whether the
 * resulting OB zone overlaps the base OB zone.
 *
 * Returns an OBCluster describing how many timeframes are aligned and the
 * tightest intersection zone.
 */
export function detectMTFCluster(
  base_ob: OrderBlock,
  htf_candles: Record<string, OBCandle[]>,
  _base_tf: Timeframe,
  base_atr14: number,
): OBCluster {
  const sortedTFs = Object.keys(htf_candles).sort((a, b) => tfWeight(b) - tfWeight(a))

  let count = 1  // base TF always counts as 1
  let highest_tf: Timeframe | null = null
  let zone_high = base_ob.high
  let zone_low = base_ob.low

  for (const tf of sortedTFs) {
    const candles = htf_candles[tf]
    if (!candles || candles.length < 30) continue

    const structure = buildStructureState(candles, base_atr14)
    const liquidity = buildLiquidityState(candles, [], base_atr14)

    let htf_ob: OrderBlock | null = null

    if (structure.bos_direction === 'BULLISH') {
      htf_ob = detectBullishOB(candles, structure, liquidity.all, base_atr14, tf as Timeframe)
    } else if (structure.bos_direction === 'BEARISH') {
      htf_ob = detectBearishOB(candles, structure, liquidity.all, base_atr14, tf as Timeframe)
    }

    if (!htf_ob) continue

    if (zonesOverlap(base_ob.high, base_ob.low, htf_ob.high, htf_ob.low)) {
      count++
      // Narrow the intersection zone
      zone_high = Math.min(zone_high, htf_ob.high)
      zone_low = Math.max(zone_low, htf_ob.low)
      if (!highest_tf) highest_tf = tf as Timeframe
    }
  }

  return {
    count,
    highest_timeframe: highest_tf,
    zone_high,
    zone_low,
  }
}

// ─────────────────────────────────────────────
// Cluster Scoring
// ─────────────────────────────────────────────

/**
 * Returns the confluence bonus for the given cluster count.
 *
 * count ≥ 3 → +4 (CLUSTER_SCORE_3TF)
 * count = 2 → +2 (CLUSTER_SCORE_2TF)
 * count ≤ 1 → +0
 */
export function scoreCluster(cluster: OBCluster): number {
  if (cluster.count >= 3) return CLUSTER_SCORE_3TF
  if (cluster.count === 2) return CLUSTER_SCORE_2TF
  return 0
}

// ─────────────────────────────────────────────
// TF weight helper (higher = heavier TF)
// ─────────────────────────────────────────────

function tfWeight(tf: string): number {
  const weights: Record<string, number> = {
    '1m': 1, '3m': 2, '5m': 3, '15m': 4,
    '30m': 5, '1H': 6, '4H': 7, '1D': 8, '1W': 9,
  }
  return weights[tf] ?? 0
}
