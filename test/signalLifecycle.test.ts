import { annotateSignalLifecycle, type SignalLifecycleLike } from '../src/lib/signalLifecycle.ts'

function assertEqual(actual: unknown, expected: unknown, message = '') {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${String(actual)} !== ${String(expected)} ${message}`)
  }
}

const candles = [
  { time: 1 as const, high: 101, low: 99 },
  { time: 2 as const, high: 102, low: 100 },
  { time: 3 as const, high: 110, low: 101 },
  { time: 4 as const, high: 111, low: 102 },
]

const liveSignal: SignalLifecycleLike = {
  id: 'bk_live',
  time: 4 as const,
  strategyId: 'breakout',
  direction: 'BUY',
  sl: 96,
  tp: 115,
}

const resolvedSignal = annotateSignalLifecycle(candles, liveSignal)
assertEqual(resolvedSignal.status, 'live', 'fresh breakout should remain live when untouched')

const tpHitSignal: SignalLifecycleLike = {
  ...liveSignal,
  time: 2 as const,
  tp: 109,
}

const tpHit = annotateSignalLifecycle(candles, tpHitSignal)
assertEqual(tpHit.status, 'resolved', 'TP touch should resolve the signal')
assertEqual(tpHit.resolution, 'tp', 'TP touch should be marked as take profit')

const staleCandles = [
  { time: 10 as const, high: 101, low: 99 },
  { time: 11 as const, high: 102, low: 100 },
  { time: 12 as const, high: 103, low: 101 },
  { time: 13 as const, high: 104, low: 102 },
  { time: 14 as const, high: 105, low: 103 },
  { time: 15 as const, high: 106, low: 104 },
  { time: 16 as const, high: 107, low: 105 },
  { time: 17 as const, high: 108, low: 106 },
  { time: 18 as const, high: 109, low: 107 },
  { time: 19 as const, high: 110, low: 108 },
  { time: 20 as const, high: 111, low: 109 },
  { time: 21 as const, high: 112, low: 110 },
  { time: 22 as const, high: 113, low: 111 },
  { time: 23 as const, high: 114, low: 112 },
  { time: 24 as const, high: 115, low: 113 },
  { time: 25 as const, high: 116, low: 114 },
  { time: 26 as const, high: 117, low: 115 },
  { time: 27 as const, high: 118, low: 116 },
  { time: 28 as const, high: 119, low: 117 },
  { time: 29 as const, high: 120, low: 118 },
  { time: 30 as const, high: 121, low: 119 },
  { time: 31 as const, high: 122, low: 120 },
]

const staleSignal: SignalLifecycleLike = {
  id: 'bk_stale',
  time: 10 as const,
  strategyId: 'breakout',
  direction: 'BUY',
  sl: 95,
  tp: 140,
}

const expired = annotateSignalLifecycle(staleCandles, staleSignal)
assertEqual(expired.status, 'expired', 'breakout should expire after its window if untouched')
assertEqual(expired.resolution, 'expired', 'expired signals should be marked as expired')

console.log('All signalLifecycle tests passed')