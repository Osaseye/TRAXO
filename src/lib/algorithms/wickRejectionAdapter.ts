import type { WickRejectionSignal } from './wickRejection.ts'
import type { Signal, Timeframe } from '@/types'

export function mapWickToSignal(w: WickRejectionSignal, userId: string, timeframe: Timeframe): Signal | null {
  if (w.signal === 'NO_TRADE') return null

  const risk = Math.abs(w.entry_price - w.sl_price)

  return {
    id: w.id,
    strategy_id: w.strategy_id,
    user_id: userId,
    signal: w.signal,
    symbol: w.symbol,
    confidence: Math.min(0.99, w.confidence_pct / 100),
    reason: w.reason,
    entry: w.entry_price,
    sl: w.sl_price,
    tp: w.tp1_price,
    rr_ratio: risk > 0 ? Math.abs((w.tp1_price - w.entry_price) / risk) : 0,
    timeframe,
    timestamp: w.timestamp,
  }
}
