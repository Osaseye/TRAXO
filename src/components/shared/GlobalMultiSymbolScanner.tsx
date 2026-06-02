/**
 * GlobalMultiSymbolScanner
 *
 * Invisible background component that automatically scans a curated set of
 * markets across key timeframes, regardless of which chart the user has open.
 *
 * Why this exists:
 *   GlobalSignalMonitor only watches the single chart that is currently active.
 *   This scanner fills the gap by periodically cycling through all priority
 *   markets so signals are generated proactively, not just on manual visits.
 *
 * Rate-limit safety:
 *   Each getCandles() call already goes through the key-rotation throttle in
 *   marketData.ts (7.5 s gap per key, up to 4 keys).  We simply queue each
 *   pair sequentially — the throttle layer handles the actual timing.
 *   The in-memory candle cache means recently-fetched pairs return instantly
 *   without hitting the API at all.
 *
 * Scan schedule:
 *   - 1H candles: re-scan every 60 minutes
 *   - 4H candles: re-scan every 4 hours
 *   - 1D candles: re-scan every 12 hours
 *   On first mount a full scan runs immediately (staggered 2 s after auth).
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/stores/useOnboardingStore'
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore'
import { getCandles } from '@/lib/marketData'
import { runSignalsForStrategies } from '@/lib/signalDetection'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'

// ---------------------------------------------------------------------------
// Scan config — edit this list to add/remove markets from the background scan
// ---------------------------------------------------------------------------

/** Symbols that will be scanned automatically in the background. */
const SCAN_SYMBOLS: ChartSymbol[] = [
  // Major Forex
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  // Metals / commodities
  'XAUUSD', 'XAGUSD', 'WTI', 'BRENT',
  // Indices
  'SPX500', 'NAS100', 'US30', 'DE40',
  // Crypto
  'BTCUSDT', 'ETHUSD', 'SOLUSDT',
]

/** Timeframes to scan per symbol. Lower TFs are excluded to protect API quota. */
const SCAN_TIMEFRAMES: ChartTimeframe[] = ['1H', '4H', '1D']

/** How long to wait between full scan cycles (ms) per timeframe. */
const RESCAN_INTERVAL: Record<ChartTimeframe, number> = {
  '1m':  5  * 60 * 1000,
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1H':  60 * 60 * 1000,
  '4H':  4  * 60 * 60 * 1000,
  '1D':  12 * 60 * 60 * 1000,
}

/** Milliseconds to wait after login before the first scan starts (avoids
 *  competing with the initial chart load in GlobalSignalMonitor). */
const STARTUP_DELAY_MS = 4_000

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
export function commitNewBatch(userId: string | null) {
  const batch = _progress.newBatch
  if (batch.length === 0) return
  const store = useAnalysisSignalStore.getState()
  store.addSignals(batch)
  if (userId) void store.saveToFirestore(userId, batch)
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
    if (!isAuthenticated) return
    cancelRef.current = false

    // Determine strategy set once (re-run if plan/strategy changes)
    const activeStrategyIds =
      plan === 'pro' && selectedStrategyIds.length > 0
        ? selectedStrategyIds
        : [selectedStrategyId]

    /** Process a single symbol/timeframe pair. Returns new signals found. */
    async function scanPair(symbol: ChartSymbol, timeframe: ChartTimeframe): Promise<StoredSignal[]> {
      if (cancelRef.current) return []
      try {
        const candles = await getCandles(symbol, timeframe)
        if (cancelRef.current) return []
        const computed = runSignalsForStrategies(candles, symbol, timeframe, activeStrategyIds)
        if (computed.length === 0) return []
        return computed.map((s) => ({ ...s, symbol, timeframe }))
      } catch {
        // silently ignore per-pair errors (rate limit, network)
        return []
      }
    }

    /** Build the work queue — only pairs that are due for a re-scan. */
    function buildQueue(): Array<[ChartSymbol, ChartTimeframe]> {
      const now = Date.now()
      const queue: Array<[ChartSymbol, ChartTimeframe]> = []
      for (const tf of SCAN_TIMEFRAMES) {
        for (const sym of SCAN_SYMBOLS) {
          const key = `${sym}:${tf}`
          const last = lastScannedAt.current.get(key) ?? 0
          if (now - last >= RESCAN_INTERVAL[tf]) {
            queue.push([sym, tf])
          }
        }
      }
      return queue
    }

    /** Run one full scan cycle — processes each pair sequentially so the
     *  throttle layer inside getCandles() keeps us within API rate limits.
     *  Signals are collected during the cycle and emitted as a single batch
     *  at the end, so AdminSignals can preview them before they merge. */
    async function runScan() {
      if (scanRunning.current) return
      scanRunning.current = true

      const queue = buildQueue()
      if (queue.length === 0) {
        scanRunning.current = false
        return
      }

      emitProgress({ running: true, done: 0, total: queue.length, current: '', newBatch: [] })

      // Accumulate signals for the whole cycle before showing them
      const cycleBatch: StoredSignal[] = []

      for (let i = 0; i < queue.length; i++) {
        if (cancelRef.current) break
        const [sym, tf] = queue[i]
        emitProgress({ current: `${sym} / ${tf}`, done: i })
        const found = await scanPair(sym, tf)
        cycleBatch.push(...found)
        lastScannedAt.current.set(`${sym}:${tf}`, Date.now())
      }

      // Emit the full batch — AdminSignals will show it as a preview.
      // commitNewBatch() (called by the UI or auto-timer) merges them into the store.
      emitProgress({
        running: false,
        done: queue.length,
        current: '',
        lastCompletedAt: Date.now(),
        newBatch: cycleBatch,
      })
      scanRunning.current = false
    }

    // Delay the initial scan so it doesn't fight the active chart load
    const startTimer = setTimeout(() => {
      void runScan()
    }, STARTUP_DELAY_MS)

    // Schedule periodic re-scans — check every minute if any pair is due
    const pollTimer = setInterval(() => {
      void runScan()
    }, 60_000)

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
