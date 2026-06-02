import { getWickRejectionAnchorTimeframe } from './algorithms/wickRejectionContext.ts'
import type { Timeframe } from '@/types'

export type HTFBias = 'bullish' | 'bearish' | 'neutral'
export type CacheStatus = 'fresh' | 'stale' | 'failed'

interface HTFEntry {
  bias: HTFBias
  updatedAt: string // ISO
}

const inMemoryHTF: Record<string, HTFEntry> = {}
const CANDLE_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '1D': 86_400_000,
}

// Key format: `${symbol}:${anchorTimeframe}` e.g. EURUSD:1H
export function setHtfCache(symbol: string, timeframe: Timeframe, bias: HTFBias) {
  const anchor = getWickRejectionAnchorTimeframe(timeframe)
  inMemoryHTF[`${symbol}:${anchor}`] = { bias, updatedAt: new Date().toISOString() }
}

export function getHtfCache(symbol: string, timeframe: Timeframe, nowMs = Date.now()): { bias?: HTFBias; status: CacheStatus } {
  const anchor = getWickRejectionAnchorTimeframe(timeframe)
  const entry = inMemoryHTF[`${symbol}:${anchor}`]
  if (!entry) return { status: 'failed' }

  const anchorMs = CANDLE_MS[anchor]
  const ageMs = nowMs - new Date(entry.updatedAt).getTime()
  const status: CacheStatus = ageMs < anchorMs ? 'fresh' : ageMs < anchorMs * 2 ? 'stale' : 'failed'
  return { bias: entry.bias, status }
}

export function clearHtfCache() {
  for (const k of Object.keys(inMemoryHTF)) delete inMemoryHTF[k]
}
