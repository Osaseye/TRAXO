import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { getCandles, type Candle } from '@/lib/marketData'
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket'
import { useSignalNotification } from '@/hooks/useSignalNotification'
import { runSignalsForStrategies, type AnalysisSignal } from '@/lib/signalDetection'
import { useOnboardingStore } from '@/stores/useOnboardingStore'

/**
 * Invisible component mounted in App.tsx (outside routing) that maintains a
 * background WebSocket + candle feed for the user's active symbol/timeframe.
 * Fires signal notifications across all pages via useSignalNotification.
 * Only active when the user is authenticated.
 */
export function GlobalSignalMonitor() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const symbol = useTradingContextStore((s) => s.chartSymbol)
  const timeframe = useTradingContextStore((s) => s.chartTimeframe)
  const { plan, selectedStrategyId, selectedStrategyIds } = useOnboardingStore()
  const activeStrategyIds = plan === 'pro' && selectedStrategyIds.length > 0
    ? selectedStrategyIds
    : [selectedStrategyId]

  const [candles, setCandles] = useState<Candle[]>([])
  const [signals, setSignals] = useState<AnalysisSignal[]>([])
  const cancelRef = useRef(false)

  // Fetch candles on symbol/timeframe change
  useEffect(() => {
    if (!isAuthenticated) return
    cancelRef.current = false
    setCandles([])
    setSignals([])

    const load = async () => {
      try {
        const loaded = await getCandles(symbol, timeframe)
        if (cancelRef.current) return
        setCandles(loaded)
        setSignals(runSignalsForStrategies(loaded, symbol, timeframe, activeStrategyIds))
      } catch {
        // silently ignore — Dashboard has its own error handling for the UI
      }
    }

    void load()

    return () => {
      cancelRef.current = true
    }
  }, [symbol, timeframe, isAuthenticated])

  // Keep candles updated via WebSocket / polling
  useMarketWebSocket({
    symbol,
    timeframe,
    candles,
    enabled: isAuthenticated && candles.length > 0,
    onCandleUpdate: (next) => {
      setCandles(next)
      setSignals(runSignalsForStrategies(next, symbol, timeframe, activeStrategyIds))
    },
  })

  // Fire notifications for new signals
  useSignalNotification({
    signals: signals.map((s) => ({
      id: s.id,
      symbol,
      timeframe,
      strategyLabel: s.strategyLabel,
      direction: s.direction,
      entry: s.entry,
      sl: s.sl,
      tp: s.tp,
      rr: s.rr,
      confidence: s.confidence,
      time: s.time,
    })),
    symbol,
    timeframe,
  })

  return null
}
