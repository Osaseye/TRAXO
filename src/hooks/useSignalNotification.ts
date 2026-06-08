import { useEffect, useRef } from 'react'
import type { UTCTimestamp } from 'lightweight-charts'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { useToastStore } from '@/stores/useToastStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { intervalSeconds } from '@/lib/marketData'

// Module-level: shared across all instances so Dashboard + GlobalSignalMonitor never double-fire
const globalSeenIds = new Set<string>()
// Only alert for signals whose candle closed DURING this session
const SESSION_START_S = Math.floor(Date.now() / 1000)

export interface SignalForNotification {
  id: string
  symbol: string
  timeframe: string
  strategyId?: string
  strategyLabel: string
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  reason?: string[]
  /** UTC seconds of the signal's candle. Used to filter out pre-session signals. */
  time?: number
}

function playSignalChime(direction: 'BUY' | 'SELL') {
  try {
    const ctx = new AudioContext()
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0.18, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    gainNode.connect(ctx.destination)

    // BUY: ascending C5 → E5 ; SELL: descending E5 → C5
    const freqs = direction === 'BUY' ? [523.25, 659.25] : [659.25, 523.25]

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      osc.connect(gainNode)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.18)
    })

    // Clean up context after tones finish
    setTimeout(() => {
      void ctx.close()
    }, 600)
  } catch {
    // AudioContext not available (e.g. tests/SSR) — silently ignore
  }
}

function firePushNotification(signal: SignalForNotification) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  const dirLabel = signal.direction === 'BUY' ? '🟢 BUY' : '🔴 SELL'
  const title = `${dirLabel} ${signal.symbol} — ${signal.strategyLabel}`
  const body = `Entry ${signal.entry} · SL ${signal.sl} · TP ${signal.tp} · ${signal.confidence}% confidence`

  try {
    // eslint-disable-next-line no-new
    new Notification(title, {
      body,
      tag: signal.id,
      icon: '/favicon.ico',
      silent: true, // we play our own chime
    })
  } catch {
    // Notification constructor can throw if the browser blocks it
  }
}

export function notifySignal(signal: SignalForNotification): boolean {
  if (globalSeenIds.has(signal.id)) return false

  const { notifToastEnabled, notifSoundEnabled, notifPushEnabled } =
    useTradingContextStore.getState()
  const { notifSymbolFilters, notifTimeframeFilters, notifStrategyFilters, notifMinConfidencePct } = useTradingContextStore.getState()
  const addToast = useToastStore.getState().addToast
  const addNotifications = useNotificationStore.getState().addNotifications

  const symbolAllowed = notifSymbolFilters.length === 0 || notifSymbolFilters.includes(signal.symbol as any)
  const timeframeAllowed = notifTimeframeFilters.length === 0 || notifTimeframeFilters.includes(signal.timeframe as any)
  const strategyAllowed = notifStrategyFilters.length === 0 || !signal.strategyId || notifStrategyFilters.includes(signal.strategyId)
  const confidenceAllowed = signal.confidence >= notifMinConfidencePct
  const intervalS = intervalSeconds(signal.timeframe as Parameters<typeof intervalSeconds>[0])
  const nowS = Math.floor(Date.now() / 1000)
  const signalAgeS = signal.time !== undefined ? nowS - signal.time : 0
  const freshnessAllowed = signal.time === undefined || signalAgeS <= intervalS * 2

  if (!symbolAllowed || !timeframeAllowed || !strategyAllowed || !confidenceAllowed || !freshnessAllowed) {
    if (!freshnessAllowed) {
      globalSeenIds.add(signal.id)
    }
    return false
  }

  globalSeenIds.add(signal.id)

  const inboxItem = {
    id: signal.id,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    strategyId: signal.strategyId ?? 'unknown',
    strategyLabel: signal.strategyLabel,
    direction: signal.direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp,
    rr: signal.rr,
    confidence: signal.confidence,
    reason: signal.reason ?? [],
    time: signal.time as UTCTimestamp | undefined,
    read: false,
    createdAt: Date.now(),
  }

  addNotifications([inboxItem])

  if (notifToastEnabled) {
    addToast({
      id: signal.id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      strategyLabel: signal.strategyLabel,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp,
      rr: signal.rr,
      confidence: signal.confidence,
    })
  }

  if (notifSoundEnabled) {
    playSignalChime(signal.direction)
  }

  if (notifPushEnabled) {
    firePushNotification(signal)
  }

  return true
}

interface UseSignalNotificationParams {
  signals: SignalForNotification[]
  symbol: string
  timeframe: string
}

export function useSignalNotification({ signals, symbol, timeframe }: UseSignalNotificationParams) {
  const isInitializedRef = useRef(false)

  useEffect(() => {
    // Reset initialized flag when symbol/timeframe changes so the first batch is still suppressed
    isInitializedRef.current = false
  }, [symbol, timeframe])

  useEffect(() => {
    if (signals.length === 0) return

    // First batch after mount/symbol-change: seed globalSeenIds silently, no alerts
    if (!isInitializedRef.current) {
      for (const s of signals) {
        globalSeenIds.add(s.id)
      }
      isInitializedRef.current = true
      return
    }

    const intervalS = intervalSeconds(timeframe as Parameters<typeof intervalSeconds>[0])

    for (const signal of signals) {
      if (globalSeenIds.has(signal.id)) continue

      // Freshness guard: only fire for candles that formed during this session.
      // A signal on candle time T means the candle closed at roughly T + intervalS.
      // Allow up to 1 interval of grace so a candle that was just closing when
      // the session started still triggers.
      const nowS = Math.floor(Date.now() / 1000)
      if (signal.time !== undefined && signal.time < SESSION_START_S - intervalS) {
        globalSeenIds.add(signal.id) // mark as seen so we never revisit it
        continue
      }

      if (signal.time !== undefined && nowS - signal.time > intervalS * 2) {
        globalSeenIds.add(signal.id)
        continue
      }

      notifySignal(signal)
    }
  }, [signals])
}
