import { useEffect, useRef } from 'react'
import type { Candle } from '@/lib/marketData'
import { getCandles, intervalSeconds } from '@/lib/marketData'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'
import type { ChartSymbol } from '@/stores/useTradingContextStore'

interface UseMarketWebSocketParams {
  symbol: ChartSymbol
  timeframe: ChartTimeframe
  candles: Candle[]
  onCandleUpdate: (candles: Candle[]) => void
  enabled: boolean
}

function websocketSymbol(symbol: ChartSymbol) {
  if (symbol === 'EURUSD') return 'OANDA:EUR_USD'
  if (symbol === 'GBPUSD') return 'OANDA:GBP_USD'
  if (symbol === 'USDJPY') return 'OANDA:USD_JPY'
  if (symbol === 'XAUUSD') return 'OANDA:XAU_USD'
  if (symbol === 'BTCUSDT') return 'BINANCE:BTCUSDT'
  if (symbol === 'ETHUSD') return 'BINANCE:ETHUSDT'
  if (symbol === 'MNQ') return 'CME_MINI:MNQ1!'
  return symbol
}

function supportsTradeFeed(symbol: ChartSymbol) {
  return (
    symbol === 'EURUSD' ||
    symbol === 'GBPUSD' ||
    symbol === 'USDJPY' ||
    symbol === 'XAUUSD' ||
    symbol === 'BTCUSDT' ||
    symbol === 'ETHUSD' ||
    symbol === 'SOLUSDT' ||
    symbol === 'XRPUSDT' ||
    symbol === 'ADAUSDT' ||
    symbol === 'DOGEUSDT' ||
    symbol === 'BNBUSDT' ||
    symbol === 'AAPL' ||
    symbol === 'MSFT' ||
    symbol === 'NVDA' ||
    symbol === 'TSLA' ||
    symbol === 'AMZN' ||
    symbol === 'META' ||
    symbol === 'GOOGL' ||
    symbol === 'NFLX' ||
    symbol === 'AMD' ||
    symbol === 'COIN' ||
    symbol === 'MSTR' ||
    symbol === 'SMCI'
  )
}

function candleStart(timeMs: number, stepSeconds: number) {
  return Math.floor(timeMs / 1000 / stepSeconds) * stepSeconds
}

function normalizeTradeTimeMs(value: unknown) {
  const time = Number(value)
  if (!Number.isFinite(time)) return Date.now()
  return time < 1_000_000_000_000 ? time * 1000 : time
}

function snapshotChanged(nextCandles: Candle[], currentCandles: Candle[]) {
  if (nextCandles.length !== currentCandles.length) return true
  const nextLast = nextCandles[nextCandles.length - 1]
  const currentLast = currentCandles[currentCandles.length - 1]
  if (!nextLast || !currentLast) return true
  return (
    nextLast.time !== currentLast.time ||
    nextLast.open !== currentLast.open ||
    nextLast.high !== currentLast.high ||
    nextLast.low !== currentLast.low ||
    nextLast.close !== currentLast.close
  )
}

export function useMarketWebSocket({ symbol, timeframe, candles, onCandleUpdate, enabled }: UseMarketWebSocketParams) {
  const candlesRef = useRef(candles)
  const onCandleUpdateRef = useRef(onCandleUpdate)

  useEffect(() => {
    candlesRef.current = candles
  }, [candles])

  useEffect(() => {
    onCandleUpdateRef.current = onCandleUpdate
  }, [onCandleUpdate])

  useEffect(() => {
    if (!enabled) return

    const apiKey = import.meta.env.VITE_FINNHUB_API_KEY as string | undefined
    const hasWebSocket = typeof WebSocket !== 'undefined'
    const canUseWebSocket = Boolean(apiKey && hasWebSocket && supportsTradeFeed(symbol))

    const wsSymbol = websocketSymbol(symbol)
    const step = intervalSeconds(timeframe)
    const url = apiKey ? `wss://ws.finnhub.io?token=${encodeURIComponent(apiKey)}` : ''

    let closed = false
    let reconnectTimer: number | null = null
    let backoffMs = 1000
    let socket: WebSocket | null = null
    let snapshotTimer: number | null = null
    let snapshotInFlight = false

    const refreshMs = timeframe === '1m' ? 5000 : timeframe === '5m' ? 10000 : timeframe === '15m' ? 15000 : timeframe === '1H' ? 30000 : timeframe === '4H' ? 60000 : 120000

    const pushCandles = (price: number, tradeTimeMs: number) => {
      const currentCandles = candlesRef.current
      if (currentCandles.length === 0) return

      const latestStart = candleStart(tradeTimeMs, step)
      const last = currentCandles[currentCandles.length - 1]
      if (latestStart < last.time) return

      let nextCandles: Candle[]

      if (latestStart === last.time) {
        const updatedLast: Candle = {
          ...last,
          high: Math.max(last.high, price),
          low: Math.min(last.low, price),
          close: price,
        }
        nextCandles = [...currentCandles.slice(0, -1), updatedLast]
      } else {
        nextCandles = [
          ...currentCandles,
          {
            time: latestStart as Candle['time'],
            open: last.close,
            high: price,
            low: price,
            close: price,
          },
        ]
      }

      candlesRef.current = nextCandles
      onCandleUpdateRef.current(nextCandles)
    }

    const pollSnapshot = async () => {
      if (snapshotInFlight || closed) return
      snapshotInFlight = true
      try {
        const snapshot = await getCandles(symbol, timeframe)
        if (closed || snapshot.length === 0) return
        const currentCandles = candlesRef.current
        if (!snapshotChanged(snapshot, currentCandles)) return
        candlesRef.current = snapshot
        onCandleUpdateRef.current(snapshot)
      } catch {
        // Ignore polling failures; websocket can still carry the live feed.
      } finally {
        snapshotInFlight = false
      }
    }

    const connect = () => {
      if (closed || !canUseWebSocket) return

      socket = new WebSocket(url)

      socket.onopen = () => {
        backoffMs = 1000
        socket?.send(JSON.stringify({ type: 'subscribe', symbol: wsSymbol }))
      }

      socket.onmessage = (event) => {
        let message: any
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }

        if (message?.type !== 'trade' || !Array.isArray(message.data)) return

        for (const trade of message.data) {
          const price = Number(trade?.p)
          const tradeTimeMs = normalizeTradeTimeMs(trade?.t)
          if (!Number.isFinite(price)) continue
          pushCandles(price, tradeTimeMs)
        }
      }

      socket.onerror = () => {
        socket?.close()
      }

      socket.onclose = () => {
        if (closed) return
        reconnectTimer = window.setTimeout(connect, backoffMs)
        backoffMs = Math.min(backoffMs * 2, 15000)
      }
    }

    connect()
    void pollSnapshot()
    snapshotTimer = window.setInterval(() => {
      void pollSnapshot()
    }, refreshMs)

    return () => {
      closed = true
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer)
      }
      if (snapshotTimer != null) {
        window.clearInterval(snapshotTimer)
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'unsubscribe', symbol: wsSymbol }))
      }
      socket?.close()
      socket = null
    }
  }, [symbol, timeframe, enabled])
}