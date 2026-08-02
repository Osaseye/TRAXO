/**
 * GlobalMultiSymbolScanner
 *
 * Invisible background component that continuously scans the chart universe in
 * a rolling queue and notifies the user as soon as a fresh signal is found.
 *
 * Why this exists:
 *   GlobalSignalMonitor only watches the single chart that is currently active.
 *   This scanner fills the gap by walking all supported symbols/timeframes so
 *   alerts are independent of what chart the user has open.
 *
 * Rate-limit safety:
 *   Each getCandles() call already goes through the key-rotation throttle in
 *   marketData.ts. We process one pair at a time, once per second, and let the
 *   cache + throttle layer decide whether the call is instant or queued.
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/stores/useOnboardingStore'
import { getCandleData as getCandles } from '@/lib/api'
import { runSignalsForStrategies } from '@/lib/signalDetection'
import { notifySignal } from '@/hooks/useSignalNotification'
import type { StoredSignal } from '@/stores/useAnalysisSignalStore'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'

// ---------------------------------------------------------------------------
// Scan config — edit this list to add/remove markets from the background scan
// ---------------------------------------------------------------------------

/** Symbols that will be scanned automatically in the background. */
const SCAN_SYMBOLS: ChartSymbol[] = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'EURGBP', 'SPX500', 'NAS100', 'US30', 'DE40', 'UK100', 'JP225', 'FRA40',
  'AUS200', 'WTI', 'BRENT', 'NATGAS', 'BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'BNBUSDT', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX',
  'AMD', 'COIN', 'MSTR', 'SMCI', 'MNQ',
]

/** Timeframes to scan per symbol. Lower TFs are excluded to protect API quota. */
const SCAN_TIMEFRAMES: ChartTimeframe[] = ['1H', '4H', '1D']

/** Full queue of pairs scanned in a rolling loop. */
const SCAN_PAIRS: Array<[ChartSymbol, ChartTimeframe]> = SCAN_TIMEFRAMES.flatMap((tf) =>
  SCAN_SYMBOLS.map((symbol) => [symbol, tf] as [ChartSymbol, ChartTimeframe]),
)

/** One tick per second. The scanner advances one pair per tick. */
const TICK_INTERVAL_MS = 1_000

/** Milliseconds to wait after login before the first scan starts. */
const STARTUP_DELAY_MS = 2_000

const globalNotifiedIds = new Set<string>()

// ---------------------------------------------------------------------------
// Store for scan state — shared so AdminSignals can read it
// ---------------------------------------------------------------------------

export interface ScanProgress {
  running: boolean
  current: string       // e.g. "EURUSD / 4H"
  done: number
  total: number
  lastCompletedAt: number | null   // epoch ms
  /** Signals found in the most recent completed scan cycle — not yet in the main store. */
  newBatch: StoredSignal[]
}

type ScanProgressListener = (p: ScanProgress) => void
const _listeners = new Set<ScanProgressListener>()
let _progress: ScanProgress = { running: false, current: '', done: 0, total: 0, lastCompletedAt: null, newBatch: [] }

// eslint-disable-next-line react-refresh/only-export-components
export function subscribeScanProgress(fn: ScanProgressListener) {
  _listeners.add(fn)
  fn(_progress)   // emit current state immediately
  return () => _listeners.delete(fn)
}

function emitProgress(p: Partial<ScanProgress>) {
  _progress = { ..._progress, ...p }
  _listeners.forEach((fn) => fn(_progress))
}

/**
 * Called by AdminSignals (or any consumer) to commit the pending newBatch into
 * the main signal store and save to Firestore.
 */
// eslint-disable-next-line react-refresh/only-export-components, @typescript-eslint/no-unused-vars
export function commitNewBatch(_userId: string | null) {
  // Client no longer writes global-scan results to Firestore.
  // Keep this API as a no-op so existing Admin UI wiring doesn't crash.
  emitProgress({ newBatch: [] })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GlobalMultiSymbolScanner() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const { plan, selectedStrategyId, selectedStrategyIds } = useOnboardingStore()

  // Track when each (symbol:timeframe) was last scanned so we don't re-scan
  // too frequently even if the component re-mounts.
  const lastScannedAt = useRef<Map<string, number>>(new Map())
  const scanRunning = useRef(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      globalNotifiedIds.clear()
      return
    }

    cancelRef.current = false

    const activeStrategyIds =
      plan === 'pro' && selectedStrategyIds.length > 0
        ? selectedStrategyIds
        : [selectedStrategyId]

    let pairIndex = 0
    let cycleBatch: StoredSignal[] = []

    async function scanPair(symbol: ChartSymbol, timeframe: ChartTimeframe): Promise<StoredSignal[]> {
      if (cancelRef.current) return []
      try {
        const candles = await getCandles(symbol, timeframe)
        if (cancelRef.current) return []
        const computed = runSignalsForStrategies(candles, symbol, timeframe, activeStrategyIds)
        return computed.map((s) => ({ ...s, symbol, timeframe }))
      } catch {
        return []
      }
    }

    async function tick() {
      if (scanRunning.current || cancelRef.current) return
      scanRunning.current = true

      const [symbol, timeframe] = SCAN_PAIRS[pairIndex]
      if (pairIndex === 0) {
        cycleBatch = []
        emitProgress({ running: true, done: 0, total: SCAN_PAIRS.length, current: '', newBatch: [] })
      }

      emitProgress({ current: `${symbol} / ${timeframe}`, done: pairIndex })
      const found = await scanPair(symbol, timeframe)

      // No Firestore persistence. Only notify (and keep a local preview batch for Admin UI).
      if (found.length > 0) {
        for (const signal of found) {
          if (globalNotifiedIds.has(signal.id)) continue
          const didNotify = notifySignal(signal)
          if (didNotify) {
            globalNotifiedIds.add(signal.id)
            cycleBatch.push(signal)
          }
        }
      }

      lastScannedAt.current.set(`${symbol}:${timeframe}`, Date.now())
      pairIndex = (pairIndex + 1) % SCAN_PAIRS.length

      if (pairIndex === 0) {
        emitProgress({
          running: false,
          done: SCAN_PAIRS.length,
          current: '',
          lastCompletedAt: Date.now(),
          newBatch: cycleBatch,
        })
      }

      scanRunning.current = false
    }

    const startTimer = setTimeout(() => {
      void tick()
    }, STARTUP_DELAY_MS)

    const pollTimer = setInterval(() => {
      void tick()
    }, TICK_INTERVAL_MS)

    return () => {
      cancelRef.current = true
      clearTimeout(startTimer)
      clearInterval(pollTimer)
      scanRunning.current = false
      emitProgress({ running: false, current: '' })
    }
  }, [isAuthenticated, userId, plan, selectedStrategyId, selectedStrategyIds])

  return null
}
