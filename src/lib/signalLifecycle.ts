export interface SignalLifecycleCandle {
  time: number | string
  high: number
  low: number
  open?: number
  close?: number
}

export type SignalLifecycleStatus = 'live' | 'resolved' | 'expired'
export type SignalLifecycleResolution = 'tp' | 'sl' | 'expired' | null

export interface SignalLifecycleLike {
  id?: string
  time: number | string
  strategyId?: string
  direction: 'BUY' | 'SELL'
  entry?: number
  sl: number
  tp: number
  status?: string
  resolution?: SignalLifecycleResolution
  resolvedAt?: number | null
}

export type AnnotatedSignalLifecycle<T extends SignalLifecycleLike> = Omit<
  T,
  'status' | 'resolution' | 'resolvedAt'
> & {
  status: SignalLifecycleStatus
  resolution: SignalLifecycleResolution
  resolvedAt: number | null
}

const MAX_POST_SIGNAL_CANDLES = 20

function toUnixSeconds(time: number | string): number {
  if (typeof time === 'number') return time
  const numeric = Number(time)
  if (!Number.isNaN(numeric) && time.trim() !== '') return numeric
  const parsed = Math.floor(new Date(time).getTime() / 1000)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Evaluates candles strictly after `signal.time` to determine whether a signal
 * touched SL or TP, expired untouched after more than 20 post-signal candles, or stays live.
 */
export function annotateSignalLifecycle<T extends SignalLifecycleLike>(
  candles: readonly SignalLifecycleCandle[],
  signal: T,
): AnnotatedSignalLifecycle<T> {
  const signalTime = toUnixSeconds(signal.time)

  const postCandles = candles
    .map((candle) => ({ candle, time: toUnixSeconds(candle.time) }))
    .filter(({ time }) => time > signalTime)
    .sort((a, b) => a.time - b.time)

  const inspectionWindow = postCandles.slice(0, MAX_POST_SIGNAL_CANDLES)

  for (const { candle, time } of inspectionWindow) {
    const isBuy = signal.direction === 'BUY'
    const slHit = isBuy ? candle.low <= signal.sl : candle.high >= signal.sl
    const tpHit = isBuy ? candle.high >= signal.tp : candle.low <= signal.tp

    if (slHit) {
      return {
        ...signal,
        status: 'resolved',
        resolution: 'sl',
        resolvedAt: time,
      }
    }

    if (tpHit) {
      return {
        ...signal,
        status: 'resolved',
        resolution: 'tp',
        resolvedAt: time,
      }
    }
  }

  if (postCandles.length > MAX_POST_SIGNAL_CANDLES) {
    return {
      ...signal,
      status: 'expired',
      resolution: 'expired',
      resolvedAt: postCandles[MAX_POST_SIGNAL_CANDLES]?.time ?? null,
    }
  }

  return {
    ...signal,
    status: 'live',
    resolution: null,
    resolvedAt: null,
  }
}
