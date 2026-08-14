/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UTCTimestamp } from 'lightweight-charts'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { useToastStore } from '@/stores/useToastStore'
import { useNotificationStore } from '@/stores/useNotificationStore'

function intervalSeconds(timeframe: string): number {
  switch (timeframe.toLowerCase()) {
    case '1m':
    case '1min':   return 60;
    case '5m':
    case '5min':   return 300;
    case '15m':
    case '15min':  return 900;
    case '1h':
    case '1H':     return 3600;
    case '4h':
    case '4H':     return 14400;
    case '1d':
    case '1D':
    case '1day':   return 86400;
    default:       return 3600; // safe fallback: treat as 1H so signals don't die too fast
  }
}

const globalSeenIds = new Set<string>()

function notificationFingerprint(signal: SignalForNotification) {
  return [
    signal.strategyId ?? 'unknown',
    signal.symbol,
    signal.timeframe,
    signal.direction,
    signal.time ?? 'no-time',
    Number(signal.entry || 0).toPrecision(8),
    Number(signal.sl || 0).toPrecision(8),
    Number(signal.tp || 0).toPrecision(8),
  ].join(':')
}

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

  const title = `${signal.direction} ${signal.symbol} - ${signal.strategyLabel}`
  const body = `Entry ${signal.entry} - SL ${signal.sl} - TP ${signal.tp} - ${signal.confidence}% confidence`

  try {
    new Notification(title, { body, tag: signal.id, icon: '/favicon.ico', silent: true })
  } catch { /* Notification constructor can throw */ }
}

export function notifySignal(signal: SignalForNotification): boolean {
  const fingerprint = notificationFingerprint(signal)

  if (globalSeenIds.has(fingerprint)) {
    console.log('[notifySignal] ⏭ Skipping duplicate:', signal.symbol, signal.timeframe, signal.direction)
    return false
  }

  const {
    notifToastEnabled, notifSoundEnabled, notifPushEnabled, notifSymbolFilters,
    notifTimeframeFilters, notifStrategyFilters, notifMinConfidencePct
  } = useTradingContextStore.getState()

  console.log('[notifySignal] Filter state:', {
    notifToastEnabled, notifSoundEnabled, notifPushEnabled,
    notifSymbolFilters, notifTimeframeFilters, notifStrategyFilters,
    notifMinConfidencePct,
    signalConfidence: signal.confidence,
  })

  const cleanSym = (s: string) => String(s || '').replace('/', '').toUpperCase()
  const cleanTF = (tf: string) => String(tf || '').toLowerCase().replace('min', 'm').replace('day', 'd')
  const cleanStrat = (s: string) => String(s || '').replace(/-/g, '_').toLowerCase()

  const sigConf = (signal.confidence != null && !isNaN(Number(signal.confidence))) ? Number(signal.confidence) : 50
  const minConf = Number(notifMinConfidencePct) || 0

  const symPass = !notifSymbolFilters || notifSymbolFilters.length === 0 || notifSymbolFilters.some((f) => cleanSym(f) === cleanSym(signal.symbol))
  const tfPass = !notifTimeframeFilters || notifTimeframeFilters.length === 0 || notifTimeframeFilters.some((f) => cleanTF(f) === cleanTF(signal.timeframe))
  const stratPass = !notifStrategyFilters || notifStrategyFilters.length === 0 || !signal.strategyId || notifStrategyFilters.some((f) => cleanStrat(f) === cleanStrat(signal.strategyId))
  const confPass = sigConf >= minConf

  console.log(`[notifySignal] Filter checks: sym=${symPass}, tf=${tfPass}, strat=${stratPass}, conf=${confPass} (sigConf=${sigConf} >= minConf=${minConf})`)

  if (!symPass || !tfPass || !stratPass || !confPass) {
    console.log('[notifySignal] ❌ Blocked:', !symPass ? 'SYMBOL' : !tfPass ? 'TIMEFRAME' : !stratPass ? 'STRATEGY' : 'CONFIDENCE')
    return false
  }

  globalSeenIds.add(fingerprint)
  if (signal.id) globalSeenIds.add(signal.id)

  console.log('[notifySignal] ✅ Adding notification + toast for', signal.direction, signal.symbol, signal.timeframe)

  useNotificationStore.getState().addNotifications([{
    ...signal,
    strategyId: signal.strategyId ?? 'unknown',
    reason: signal.reason ?? [],
    time: signal.time as UTCTimestamp | undefined,
    read: false,
    createdAt: Date.now(),
  }])

  if (notifToastEnabled ?? true) {
    console.log('[notifySignal] 🍞 Firing toast for', signal.direction, signal.symbol)
    useToastStore.getState().addToast({
      id: signal.id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      strategyLabel: signal.strategyLabel || 'Signal',
      direction: signal.direction,
      entry: Number(signal.entry) || 0,
      sl: Number(signal.sl) || 0,
      tp: Number(signal.tp) || 0,
      rr: Number(signal.rr) || 0,
      confidence: Number(signal.confidence) || 0,
    })
  }
  if (notifSoundEnabled ?? true) playSignalChime(signal.direction)
  if (notifPushEnabled) firePushNotification(signal)

  return true
}
