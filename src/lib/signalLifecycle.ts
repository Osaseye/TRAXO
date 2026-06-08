import type { UTCTimestamp } from 'lightweight-charts'

export type SignalLifecycleStatus = 'live' | 'resolved' | 'expired'
export type SignalResolution = 'tp' | 'sl' | 'ambiguous' | 'expired'

export interface SignalLifecycleLike {
  id: string
  time: UTCTimestamp
  strategyId: string
  direction: 'BUY' | 'SELL'
  sl: number
  tp: number
}

export interface SignalLifecycleCandle {
  time: UTCTimestamp
  high: number
  low: number
}

export interface SignalLifecycleMeta {
  status: SignalLifecycleStatus
  resolution?: SignalResolution
  expiryCandles: number
}

const SIGNAL_EXPIRY_CANDLES: Record<string, number> = {
  'wick-rejection': 5,
  'order-block': 50,
  'trend-following': 20,
  breakout: 20,
  'supply-demand': 50,
  supply_demand: 50,
}

function getSignalExpiryCandles(strategyId: string): number {
  return SIGNAL_EXPIRY_CANDLES[strategyId] ?? 20
}

function getSignalIndex(candles: SignalLifecycleCandle[], signal: SignalLifecycleLike): number {
  return candles.findIndex((candle) => candle.time === signal.time)
}

export function annotateSignalLifecycle<T extends SignalLifecycleLike>(
  candles: SignalLifecycleCandle[],
  signal: T,
): T & SignalLifecycleMeta {
  const signalIndex = getSignalIndex(candles, signal)
  const expiryCandles = getSignalExpiryCandles(signal.strategyId)

  if (signalIndex < 0) {
    return {
      ...signal,
      status: 'expired',
      resolution: 'expired',
      expiryCandles,
    }
  }

  const ageCandles = candles.length - 1 - signalIndex
  if (ageCandles >= expiryCandles) {
    return {
      ...signal,
      status: 'expired',
      resolution: 'expired',
      expiryCandles,
    }
  }

  for (let i = signalIndex + 1; i < candles.length; i++) {
    const candle = candles[i]
    const hitStop = signal.direction === 'BUY'
      ? candle.low <= signal.sl
      : candle.high >= signal.sl
    const hitTarget = signal.direction === 'BUY'
      ? candle.high >= signal.tp
      : candle.low <= signal.tp

    if (hitStop && hitTarget) {
      return {
        ...signal,
        status: 'resolved',
        resolution: 'ambiguous',
        expiryCandles,
      }
    }

    if (hitTarget) {
      return {
        ...signal,
        status: 'resolved',
        resolution: 'tp',
        expiryCandles,
      }
    }

    if (hitStop) {
      return {
        ...signal,
        status: 'resolved',
        resolution: 'sl',
        expiryCandles,
      }
    }
  }

  return {
    ...signal,
    status: 'live',
    expiryCandles,
  }
}