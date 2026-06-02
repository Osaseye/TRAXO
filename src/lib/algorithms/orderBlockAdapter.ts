/**
 * TRAXO Order Block — Signal Adapter
 *
 * Converts an OrderBlockSignal (internal OB engine format) to the shared Signal
 * interface used by the rest of the TRAXO application (stores, UI, backend).
 *
 * Returns null for NO_TRADE signals so callers can easily filter them out.
 */

import type { Signal, Timeframe } from '@/types'
import type { OrderBlockSignal } from './orderBlock/types'

/**
 * Maps an OrderBlockSignal to a Signal, or returns null if the signal is NO_TRADE.
 *
 * @param s        - The raw signal produced by analyzeOrderBlock()
 * @param userId   - The authenticated user's ID to embed in the signal record
 */
export function mapOrderBlockToSignal(s: OrderBlockSignal, userId: string): Signal | null {
  if (s.signal === 'NO_TRADE') return null

  const entryPrice = s.entry_proximal
  const riskSize = Math.abs(entryPrice - s.sl_price)
  const rewardSize = Math.abs(s.tp1_price - entryPrice)
  const rr_ratio = riskSize > 0 ? rewardSize / riskSize : 0

  return {
    id: s.id,
    strategy_id: 'order_block',
    user_id: userId,
    signal: s.signal,
    symbol: s.symbol,
    confidence: Math.min(1, s.confidence_pct / 100),
    reason: s.reason,
    entry: entryPrice,
    sl: s.sl_price,
    tp: s.tp1_price,
    rr_ratio,
    timeframe: s.timeframe as Timeframe,
    timestamp: s.timestamp,
  }
}
