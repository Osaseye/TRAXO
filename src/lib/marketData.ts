import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'

export interface Candle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

const TWELVEDATA_BASE_URL = 'https://api.twelvedata.com/time_series'

export function intervalSeconds(timeframe: ChartTimeframe) {
  if (timeframe === '1m') return 60
  if (timeframe === '5m') return 300
  if (timeframe === '15m') return 900
  if (timeframe === '1H') return 3600
  if (timeframe === '4H') return 14400
  return 86400
}

function providerSymbol(symbol: ChartSymbol) {
  if (symbol === 'EURUSD') return 'EUR/USD'
  if (symbol === 'GBPUSD') return 'GBP/USD'
  if (symbol === 'USDJPY') return 'USD/JPY'
  if (symbol === 'XAUUSD') return 'XAU/USD'
  if (symbol === 'XAGUSD') return 'XAG/USD'
  if (symbol === 'AUDUSD') return 'AUD/USD'
  if (symbol === 'USDCAD') return 'USD/CAD'
  if (symbol === 'USDCHF') return 'USD/CHF'
  if (symbol === 'NZDUSD') return 'NZD/USD'
  if (symbol === 'EURJPY') return 'EUR/JPY'
  if (symbol === 'GBPJPY') return 'GBP/JPY'
  if (symbol === 'EURGBP') return 'EUR/GBP'
  if (symbol === 'SPX500') return 'SPX500'
  if (symbol === 'NAS100') return 'NAS100'
  if (symbol === 'US30') return 'US30'
  if (symbol === 'DE40') return 'DE40'
  if (symbol === 'UK100') return 'UK100'
  if (symbol === 'JP225') return 'JP225'
  if (symbol === 'FRA40') return 'FRA40'
  if (symbol === 'AUS200') return 'AUS200'
  if (symbol === 'WTI') return 'WTI'
  if (symbol === 'BRENT') return 'BRENT'
  if (symbol === 'NATGAS') return 'NATGAS'
  if (symbol === 'BTCUSDT') return 'BTC/USD'
  if (symbol === 'AAPL') return 'AAPL'
  if (symbol === 'MSFT') return 'MSFT'
  if (symbol === 'NVDA') return 'NVDA'
  if (symbol === 'TSLA') return 'TSLA'
  if (symbol === 'AMZN') return 'AMZN'
  if (symbol === 'META') return 'META'
  if (symbol === 'GOOGL') return 'GOOGL'
  if (symbol === 'NFLX') return 'NFLX'
  if (symbol === 'AMD') return 'AMD'
  if (symbol === 'COIN') return 'COIN'
  if (symbol === 'MSTR') return 'MSTR'
  if (symbol === 'SMCI') return 'SMCI'
  if (symbol === 'MNQ') return '/MNQ'
  if (symbol === 'SOLUSDT') return 'SOL/USD'
  if (symbol === 'XRPUSDT') return 'XRP/USD'
  if (symbol === 'ADAUSDT') return 'ADA/USD'
  if (symbol === 'DOGEUSDT') return 'DOGE/USD'
  if (symbol === 'BNBUSDT') return 'BNB/USD'
  return 'ETH/USD'
}

function timeframeToTwelveDataInterval(timeframe: ChartTimeframe) {
  if (timeframe === '1m') return '1min'
  if (timeframe === '5m') return '5min'
  if (timeframe === '15m') return '15min'
  if (timeframe === '1H') return '1h'
  if (timeframe === '4H') return '4h'
  return '1day'
}

// ── API key rotation + throttle ───────────────────────────────────────────────
// Reads up to 4 TwelveData keys from env and round-robins between them.
// A per-key throttle enforces a minimum gap between consecutive requests on
// the same key (free plan: 8 req/min ≈ 1 req per 7.5 s per key).
// Requests queue up and fire as soon as their assigned key is ready.

const TWELVEDATA_MIN_INTERVAL_MS = 7_500   // 8 req/min = 1 per 7.5 s
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000  // 1 hour cooldown on 429

const keyLastUsed: number[] = []            // epoch-ms of last dispatch per key index
const keyRateLimitedUntil: number[] = []    // epoch-ms when key becomes usable again (0 = not limited)

function getKeys(): string[] {
  return [
    import.meta.env.VITE_TWELVEDATA_API_KEY,
    import.meta.env.VITE_TWELVEDATA_API_KEY_2,
    import.meta.env.VITE_TWELVEDATA_API_KEY_3,
    import.meta.env.VITE_TWELVEDATA_API_KEY_4,
  ].filter(Boolean) as string[]
}

/** Mark a key index as rate-limited (429) for RATE_LIMIT_COOLDOWN_MS. */
function markKeyRateLimited(index: number) {
  keyRateLimitedUntil[index] = Date.now() + RATE_LIMIT_COOLDOWN_MS
  // Push last-used far into the future so it won't be picked
  keyLastUsed[index] = keyRateLimitedUntil[index]
}

/**
 * Returns the next available API key (index + key string), skipping any keys
 * that are currently rate-limited and any indices in `excludeIndices`.
 * If all keys were recently used, waits until the least-recently-used eligible
 * key is past its throttle window before resolving.
 * Returns undefined if no eligible keys exist.
 */
function nextTwelveDataKey(excludeIndices: Set<number> = new Set()): Promise<{ key: string; index: number } | undefined> {
  const keys = getKeys()
  if (keys.length === 0) return Promise.resolve(undefined)

  // Initialise tracking arrays on first call
  while (keyLastUsed.length < keys.length) keyLastUsed.push(0)
  while (keyRateLimitedUntil.length < keys.length) keyRateLimitedUntil.push(0)

  const now = Date.now()

  // Filter out rate-limited and explicitly excluded keys
  const eligible = keys
    .map((_, i) => i)
    .filter(i => !excludeIndices.has(i) && now >= keyRateLimitedUntil[i])

  if (eligible.length === 0) return Promise.resolve(undefined)

  // Pick the eligible key with the earliest last-used time (least-recently used)
  let best = eligible[0]
  for (const i of eligible) {
    if (keyLastUsed[i] < keyLastUsed[best]) best = i
  }

  const wait = Math.max(0, keyLastUsed[best] + TWELVEDATA_MIN_INTERVAL_MS - now)
  keyLastUsed[best] = now + wait   // reserve the slot immediately

  return new Promise(resolve =>
    setTimeout(() => resolve({ key: keys[best], index: best }), wait)
  )
}

// ── Candle cache ──────────────────────────────────────────────────────────────
// Keyed by `symbol:timeframe`. On revisit, only new candles since the last
// known timestamp are fetched (typically 1–5 candles) instead of a full 220.
interface CandleCacheEntry {
  candles: Candle[]
  fetchedAt: number   // epoch ms
  intervalMs: number  // candle duration in ms
}

const candleCache = new Map<string, CandleCacheEntry>()

/** Cache is valid for 2× the candle interval before a full re-fetch is triggered. */
function isCacheValid(entry: CandleCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < entry.intervalMs * 2
}

/** Merge incoming candles into existing ones, dedup by timestamp, keep latest `maxCount`. */
function mergeCandles(existing: Candle[], incoming: Candle[], maxCount: number): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const c of existing) byTime.set(c.time as number, c)
  for (const c of incoming) byTime.set(c.time as number, c)
  return [...byTime.values()]
    .sort((a, b) => (a.time as number) - (b.time as number))
    .slice(-maxCount)
}

/** Evict a specific symbol/timeframe from cache (e.g. on manual refresh). */
export function clearCandleCache(symbol?: ChartSymbol, timeframe?: ChartTimeframe) {
  if (symbol && timeframe) {
    candleCache.delete(`${symbol}:${timeframe}`)
  } else {
    candleCache.clear()
  }
}

class RateLimitError extends Error {
  constructor() { super('Rate limit exceeded (429)') }
}

async function fetchJson(url: string, timeoutMs = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (response.status === 429) throw new RateLimitError()
    if (!response.ok) throw new Error(`Request failed with ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timer)
  }
}

function normalizeFromTwelveData(payload: any): Candle[] {
  const values = Array.isArray(payload?.values) ? payload.values : []
  return values
    .map((row: any) => {
      const open = Number(row?.open)
      const high = Number(row?.high)
      const low = Number(row?.low)
      const close = Number(row?.close)
      const rawVolume = Number(row?.volume)
      const ts = row?.datetime ? Math.floor(new Date(row.datetime).getTime() / 1000) : NaN

      if ([open, high, low, close, ts].some((value) => Number.isNaN(value))) return null

      return {
        time: ts as UTCTimestamp,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(rawVolume) ? rawVolume : 0,
      }
    })
    .filter(Boolean)
    .reverse() as Candle[]
}

/** Full fetch — used on first load or after cache expiry. Retries with next key on 429. */
async function fetchFullCandles(symbol: ChartSymbol, timeframe: ChartTimeframe, count: number): Promise<Candle[]> {
  const interval = timeframeToTwelveDataInterval(timeframe)
  const tried = new Set<number>()

  while (true) {
    const result = await nextTwelveDataKey(tried)
    if (!result) break  // no more eligible keys

    const { key, index } = result
    tried.add(index)
    try {
      const url = `${TWELVEDATA_BASE_URL}?symbol=${encodeURIComponent(providerSymbol(symbol))}&interval=${encodeURIComponent(interval)}&outputsize=${count}&apikey=${encodeURIComponent(key)}`
      const payload = await fetchJson(url)
      if (payload?.status === 'error') throw new Error(payload.message ?? 'TwelveData error')
      const candles = normalizeFromTwelveData(payload)
      if (candles.length > 0) return candles
    } catch (err) {
      if (err instanceof RateLimitError) {
        markKeyRateLimited(index)  // remove this key from rotation until cooldown expires
        continue                   // try next key immediately
      }
      break  // non-rate-limit error — stop retrying
    }
  }

  return []
}

/** Incremental fetch — only requests candles newer than `sinceUnix`. Retries with next key on 429. */
async function fetchCandlesSince(symbol: ChartSymbol, timeframe: ChartTimeframe, sinceUnix: number): Promise<Candle[]> {
  const interval = timeframeToTwelveDataInterval(timeframe)
  const startDate = new Date(sinceUnix * 1000).toISOString().replace('T', ' ').slice(0, 19)
  const tried = new Set<number>()

  while (true) {
    const result = await nextTwelveDataKey(tried)
    if (!result) return []

    const { key, index } = result
    tried.add(index)
    try {
      const url = `${TWELVEDATA_BASE_URL}?symbol=${encodeURIComponent(providerSymbol(symbol))}&interval=${encodeURIComponent(interval)}&start_date=${encodeURIComponent(startDate)}&outputsize=10&apikey=${encodeURIComponent(key)}`
      const payload = await fetchJson(url)
      if (payload?.status === 'error') return []
      return normalizeFromTwelveData(payload)
    } catch (err) {
      if (err instanceof RateLimitError) {
        markKeyRateLimited(index)
        continue
      }
      return []
    }
  }
}

/**
 * Get candles for a symbol/timeframe.
 * - First load: full 220-candle fetch, stored in cache.
 * - Revisit within 2× the candle interval: incremental fetch (only new candles
 *   since last known timestamp), merged into cache — no full re-fetch needed.
 * - After cache expiry: full re-fetch.
 * - Concurrent calls for the same key share one in-flight promise to avoid
 *   duplicate API requests (e.g. GlobalSignalMonitor + Dashboard mounting together).
 */
const inFlight = new Map<string, Promise<Candle[]>>()

export function getCandles(symbol: ChartSymbol, timeframe: ChartTimeframe, count = 220): Promise<Candle[]> {
  const key = `${symbol}:${timeframe}`
  const existing = inFlight.get(key)
  if (existing) return existing
  const promise = _fetchCandles(symbol, timeframe, count).finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

async function _fetchCandles(symbol: ChartSymbol, timeframe: ChartTimeframe, count: number): Promise<Candle[]> {
  const key = `${symbol}:${timeframe}`
  const cached = candleCache.get(key)
  const intervalMs = intervalSeconds(timeframe) * 1000

  if (cached && isCacheValid(cached) && cached.candles.length > 0) {
    const lastTime = cached.candles[cached.candles.length - 1].time as number
    const fresh = await fetchCandlesSince(symbol, timeframe, lastTime)
    if (fresh.length > 0) {
      const merged = mergeCandles(cached.candles, fresh, count)
      candleCache.set(key, { candles: merged, fetchedAt: Date.now(), intervalMs })
      return merged
    }
    // No new candles yet — return cached (market may be closed or no new bar formed)
    return cached.candles
  }

  // Cache miss or expired — full fetch
  const candles = await fetchFullCandles(symbol, timeframe, count)
  if (candles.length > 0) {
    candleCache.set(key, { candles, fetchedAt: Date.now(), intervalMs })
  }
  return candles
}
