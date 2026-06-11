import type { UTCTimestamp } from 'lightweight-charts'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { useToastStore } from '@/stores/useToastStore'
import { useNotificationStore } from '@/stores/useNotificationStore'

function intervalSeconds(timeframe: string): number {
  switch (timeframe) {
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '1H': return 3600;
    case '4H': return 14400;
    case '1D': return 86400;
    default: return 60;
  }
}

const globalSeenIds = new Set<string>()

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
  time?: number
}

function playSignalChime(direction: 'BUY' | 'SELL') {
  try {
    const ctx = new AudioContext()
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0.18, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    gainNode.connect(ctx.destination)

    const freqs = direction === 'BUY' ? [523.25, 659.25] : [659.25, 523.25]

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      osc.connect(gainNode)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.18)
    })

    setTimeout(() => { void ctx.close() }, 600)
  } catch { /* AudioContext not available */ }
}

function firePushNotification(signal: SignalForNotification) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const title = `${signal.direction === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${signal.symbol} — ${signal.strategyLabel}`
  const body = `Entry ${signal.entry} · SL ${signal.sl} · TP ${signal.tp} · ${signal.confidence}% confidence`

  try {
    new Notification(title, { body, tag: signal.id, icon: '/favicon.ico', silent: true })
  } catch { /* Notification constructor can throw */ }
}

export function notifySignal(signal: SignalForNotification): boolean {
  if (globalSeenIds.has(signal.id)) return false

  const {
    notifToastEnabled, notifSoundEnabled, notifPushEnabled, notifSymbolFilters,
    notifTimeframeFilters, notifStrategyFilters, notifMinConfidencePct
  } = useTradingContextStore.getState()

  const isAllowed = 
    (notifSymbolFilters.length === 0 || notifSymbolFilters.includes(signal.symbol as any)) &&
    (notifTimeframeFilters.length === 0 || notifTimeframeFilters.includes(signal.timeframe as any)) &&
    (notifStrategyFilters.length === 0 || !signal.strategyId || notifStrategyFilters.includes(signal.strategyId)) &&
    (signal.confidence >= notifMinConfidencePct)

  if (!isAllowed) return false

  const intervalS = intervalSeconds(signal.timeframe)
  const nowS = Math.floor(Date.now() / 1000)
  const signalAgeS = signal.time ? nowS - signal.time : 0
  if (signal.time && signalAgeS > intervalS * 2) {
      globalSeenIds.add(signal.id) // Mark stale signals as seen to prevent re-triggering
      return false
  }

  globalSeenIds.add(signal.id)

  useNotificationStore.getState().addNotifications([{
    ...signal,
    strategyId: signal.strategyId ?? 'unknown',
    reason: signal.reason ?? [],
    time: signal.time as UTCTimestamp | undefined,
    read: false,
    createdAt: Date.now(),
  }])

  if (notifToastEnabled) useToastStore.getState().addToast(signal)
  if (notifSoundEnabled) playSignalChime(signal.direction)
  if (notifPushEnabled) firePushNotification(signal)

  return true
}
