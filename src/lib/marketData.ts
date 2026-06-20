import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'
import { getCandleData } from '@/lib/api'

/**
 * Canonical candle shape used throughout the dashboard / chart / signal pipeline.
 * `time` is always normalized to Unix seconds (UTCTimestamp) here, even though
 * the backend (and signalDetection's own Candle type) may return time as a
 * string or number — we don't want every consumer re-deriving that conversion.
 */
export interface Candle {
    time: UTCTimestamp
    open: number
    high: number
    low: number
    close: number
    volume?: number
}

interface RawCandle {
    time?: number | string
    timestamp?: number | string
    t?: number | string
    open: number
    high: number
    low: number
    close: number
    volume?: number
    v?: number
}

/** Normalizes a backend candle's time field (seconds, ms, or ISO string) to Unix seconds. */
function toUnixSeconds(value: number | string | undefined): UTCTimestamp {
    if (value == null) {
        return Math.floor(Date.now() / 1000) as UTCTimestamp
    }
    if (typeof value === 'string') {
        return Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp
    }
    // Heuristic: ms-since-epoch timestamps are ~13 digits, seconds are ~10.
    return (value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)) as UTCTimestamp
}

function normalizeCandle(raw: RawCandle): Candle {
    return {
        time: toUnixSeconds(raw.time ?? raw.timestamp ?? raw.t),
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: raw.volume ?? raw.v,
    }
}

/**
 * Fetches historical candles for a symbol/timeframe from the backend
 * (/api/candles via getCandleData in @/lib/api) and normalizes them into
 * the Candle shape the chart and signal engine expect.
 *
 * Candles are returned oldest -> newest, sorted and de-duplicated by time,
 * since some upstream providers (TwelveData/Finnhub) occasionally return
 * unsorted or overlapping pages.
 */
export async function getCandles(
    symbol: ChartSymbol,
    timeframe: ChartTimeframe,
    outputsize = 200
): Promise<Candle[]> {
    try {
        const response = await getCandleData(symbol, timeframe, outputsize)
        const rawCandles: RawCandle[] = Array.isArray(response) ? response : response?.candles ?? []

        const normalized = rawCandles.map(normalizeCandle).sort((a, b) => a.time - b.time)

        const deduped: Candle[] = []
        for (const candle of normalized) {
            if (deduped.length > 0 && deduped[deduped.length - 1].time === candle.time) {
                deduped[deduped.length - 1] = candle
            } else {
                deduped.push(candle)
            }
        }

        return deduped
    } catch (error) {
        console.error(`Failed to load candles for ${symbol} ${timeframe}:`, error)
        return []
    }
}