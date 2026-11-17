/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts'
import type {
  IPriceLine,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import { PiLightning, PiSpinnerGap, PiX } from 'react-icons/pi'
import { priceDigits, type Candle } from '@/lib/signalDetection'
import { cn, formatPrice } from '@/lib/utils'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'

export type ChartPanelMarker = SeriesMarker<Time>

export interface ChartPanelActiveSignal {
  id?: string
  entry: number
  sl: number
  tp: number
  action: 'BUY' | 'SELL'
  entryTime?: UTCTimestamp
  confidence?: number
  rr?: number
  locked?: boolean
  strategyLabel?: string
  risk?: 'Low' | 'Medium' | 'High'
  reason?: string[]
  lotSize?: number
  riskAmountUsd?: number
}

export interface ChartPanelManualSetup {
  entry: number
  action: 'BUY' | 'SELL'
  sl: number | null
  tp: number | null
  generated: boolean
  entryTime?: UTCTimestamp
  rr?: number
  entryType?: 'market' | 'limit'
  lotSize?: number
  riskAmountUsd?: number
  valid?: boolean
  reason?: string[]
}

export interface ChartPanelProps {
  symbol: string
  timeframe: ChartTimeframe
  candles: Candle[]
  markers?: ChartPanelMarker[]
  activeSignal?: ChartPanelActiveSignal | null
  manualSetup?: ChartPanelManualSetup | null
  onCrosshairMove?: (time: UTCTimestamp | null) => void
  onChartClick?: (payload: { point?: { x: number; y: number }; time?: Time; price?: number | null }) => void
  onTimeframeChange?: (timeframe: ChartTimeframe) => void
  onExecuteActiveSignal?: () => Promise<void> | void
  onExecuteManualSetup?: () => Promise<void> | void
  onClearSelection?: () => void
  executingSetup?: boolean
  livePrice?: number | null
  hideHeader?: boolean
  focusTime?: UTCTimestamp | null
  focusNonce?: number
  loading?: boolean
}

const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
}

function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface PositionOverlayData {
  entryY: number
  slY: number
  tpY: number
  startX: number
  endX: number
}

interface NormalizedCandle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export function ChartPanel({
  symbol,
  timeframe,
  candles,
  markers = [],
  activeSignal = null,
  manualSetup = null,
  onCrosshairMove,
  onChartClick,
  onTimeframeChange,
  onExecuteActiveSignal,
  onExecuteManualSetup,
  onClearSelection,
  executingSetup = false,
  livePrice = null,
  hideHeader = false,
  focusTime = null,
  focusNonce = 0,
  loading = false,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null)
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const activeEntryLineRef = useRef<IPriceLine | null>(null)
  const activeSlLineRef = useRef<IPriceLine | null>(null)
  const activeTpLineRef = useRef<IPriceLine | null>(null)
  const manualEntryLineRef = useRef<IPriceLine | null>(null)
  const manualSlLineRef = useRef<IPriceLine | null>(null)
  const manualTpLineRef = useRef<IPriceLine | null>(null)
  const hasSetInitialDataRef = useRef(false)
  const isOverBriefingRef = useRef(false)

  const [overlayData, setOverlayData] = useState<PositionOverlayData | null>(null)
  const [hoveredState, setHoveredState] = useState<{
    key: string
    candle: NormalizedCandle
  } | null>(null)
  const [dismissedBriefingKey, setDismissedBriefingKey] = useState<string | null>(null)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  const digits = useMemo(() => priceDigits(symbol), [symbol])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Initialize Lightweight Charts instance once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090B' },
        textColor: '#71717A',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#131316' },
        horzLines: { color: '#131316' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#52525B',
          labelBackgroundColor: '#161619',
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: '#52525B',
          labelBackgroundColor: '#161619',
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: '#1C1C20',
        textColor: '#71717A',
      },
      timeScale: {
        borderColor: '#1C1C20',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000)
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        },
      },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34D399',
      downColor: '#F87171',
      borderUpColor: '#34D399',
      borderDownColor: '#F87171',
      wickUpColor: '#34D399',
      wickDownColor: '#F87171',
      priceFormat: {
        type: 'price',
        precision: digits,
        minMove: 1 / 10 ** digits,
      },
    })

    const markersPlugin = createSeriesMarkers(series, [])

    chartRef.current = chart
    seriesRef.current = series
    markersPluginRef.current = markersPlugin

    return () => {
      markersPluginRef.current = null
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!seriesRef.current) return
    seriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision: digits,
        minMove: 1 / 10 ** digits,
      },
    })
  }, [digits])

  useEffect(() => {
    hasSetInitialDataRef.current = false
  }, [symbol, timeframe])

  // Sanitized candles: deduplicated and sorted ascending by Unix seconds
  const sanitizedCandles = useMemo<NormalizedCandle[]>(() => {
    if (!candles || candles.length === 0) return []

    const byTime = new Map<number, NormalizedCandle>()
    for (const c of candles) {
      if (!c || c.time == null) continue
      const rawNum =
        typeof c.time === 'string' ? Math.floor(new Date(c.time).getTime() / 1000) : Number(c.time)
      if (Number.isNaN(rawNum)) continue
      const tNum = rawNum > 1e12 ? Math.floor(rawNum / 1000) : Math.floor(rawNum)

      byTime.set(tNum, {
        time: tNum as UTCTimestamp,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: c.volume,
      })
    }

    return Array.from(byTime.values()).sort((a, b) => (a.time as number) - (b.time as number))
  }, [candles])

  // Snap marker timestamps to loaded candles so markers remain visible across scales
  const validMarkers = useMemo(() => {
    if (!sanitizedCandles || sanitizedCandles.length === 0 || !markers || markers.length === 0) {
      return []
    }

    const candleTimes = sanitizedCandles.map((c) => c.time as number)
    const candleTimeSet = new Set(candleTimes)

    const mapped = markers.map((m) => {
      const tNum = m.time as number
      if (candleTimeSet.has(tNum)) return m

      let closest = candleTimes[0]
      let minDiff = Math.abs(candleTimes[0] - tNum)
      for (let i = 1; i < candleTimes.length; i++) {
        const diff = Math.abs(candleTimes[i] - tNum)
        if (diff < minDiff) {
          minDiff = diff
          closest = candleTimes[i]
        }
      }
      return { ...m, time: closest as UTCTimestamp }
    })

    const seen = new Set<string>()
    const deduped: ChartPanelMarker[] = []
    for (const m of mapped) {
      const key = `${m.time}:${m.text}:${m.position}`
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(m)
      }
    }

    return deduped.sort((a, b) => (a.time as number) - (b.time as number))
  }, [sanitizedCandles, markers])

  // Feed candle data and update markers via persistent plugin instance
  useEffect(() => {
    if (!seriesRef.current) return
    if (sanitizedCandles.length === 0) return

    const timeScale = chartRef.current?.timeScale()
    seriesRef.current.setData(sanitizedCandles as any)
    markersPluginRef.current?.setMarkers(validMarkers)

    if (!hasSetInitialDataRef.current) {
      const total = sanitizedCandles.length
      if (total > 120 && timeScale) {
        timeScale.setVisibleLogicalRange({
          from: total - 120,
          to: total + 6,
        })
      } else {
        timeScale?.fitContent()
      }
      hasSetInitialDataRef.current = true
      return
    }

    if ((timeScale?.scrollPosition() ?? 0) === 0) {
      timeScale?.scrollToRealTime()
    }
  }, [sanitizedCandles, validMarkers])

  // Focus chart on a selected signal timestamp when requested
  useEffect(() => {
    if (focusTime == null || sanitizedCandles.length === 0 || !chartRef.current) return
    const timeScale = chartRef.current.timeScale()
    let bestIdx = sanitizedCandles.length - 1
    let minDiff = Infinity
    for (let i = 0; i < sanitizedCandles.length; i++) {
      const diff = Math.abs((sanitizedCandles[i].time as number) - (focusTime as number))
      if (diff < minDiff) {
        minDiff = diff
        bestIdx = i
      }
    }
    const from = Math.max(0, bestIdx - 48)
    const to = Math.min(sanitizedCandles.length + 8, Math.max(bestIdx + 24, from + 60))
    timeScale.setVisibleLogicalRange({ from, to })
  }, [focusTime, focusNonce, sanitizedCandles])

  // Price Lines for Active Signal
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    if (activeEntryLineRef.current) {
      series.removePriceLine(activeEntryLineRef.current)
      activeEntryLineRef.current = null
    }
    if (activeSlLineRef.current) {
      series.removePriceLine(activeSlLineRef.current)
      activeSlLineRef.current = null
    }
    if (activeTpLineRef.current) {
      series.removePriceLine(activeTpLineRef.current)
      activeTpLineRef.current = null
    }

    if (!activeSignal) return

    activeEntryLineRef.current = series.createPriceLine({
      price: activeSignal.entry,
      color: 'rgba(250, 250, 250, 0.55)',
      lineWidth: 1,
      lineStyle: LineStyle.SparseDotted,
      axisLabelVisible: true,
      title: activeSignal.locked ? 'Entry · Locked' : 'Entry',
    })

    activeSlLineRef.current = series.createPriceLine({
      price: activeSignal.sl,
      color: '#F87171',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'SL',
    })

    activeTpLineRef.current = series.createPriceLine({
      price: activeSignal.tp,
      color: '#34D399',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'TP',
    })
  }, [activeSignal])

  // Price Lines for Manual Setup
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    if (manualEntryLineRef.current) {
      series.removePriceLine(manualEntryLineRef.current)
      manualEntryLineRef.current = null
    }
    if (manualSlLineRef.current) {
      series.removePriceLine(manualSlLineRef.current)
      manualSlLineRef.current = null
    }
    if (manualTpLineRef.current) {
      series.removePriceLine(manualTpLineRef.current)
      manualTpLineRef.current = null
    }

    if (!manualSetup) return

    manualEntryLineRef.current = series.createPriceLine({
      price: manualSetup.entry,
      color: 'rgba(250, 250, 250, 0.7)',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Plan ${manualSetup.action}`,
    })

    if (manualSetup.sl != null) {
      manualSlLineRef.current = series.createPriceLine({
        price: manualSetup.sl,
        color: '#F87171',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'SL',
      })
    }

    if (manualSetup.tp != null) {
      manualTpLineRef.current = series.createPriceLine({
        price: manualSetup.tp,
        color: '#34D399',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP',
      })
    }
  }, [manualSetup])

  // Compute subtle TP & SL zone coordinates synced with zoom/pan/crosshair
  const updateOverlay = () => {
    const chart = chartRef.current
    const series = seriesRef.current
    const container = containerRef.current
    if (!chart || !series || !container) {
      setOverlayData(null)
      return
    }

    const active =
      activeSignal ||
      (manualSetup && manualSetup.generated && manualSetup.sl != null && manualSetup.tp != null
        ? manualSetup
        : null)

    if (!active || active.sl == null || active.tp == null) {
      setOverlayData(null)
      return
    }

    const entryY = series.priceToCoordinate(active.entry)
    const slY = series.priceToCoordinate(active.sl)
    const tpY = series.priceToCoordinate(active.tp)

    if (entryY === null || slY === null || tpY === null) {
      setOverlayData(null)
      return
    }

    const width = container.clientWidth || 600
    const timeScale = chart.timeScale()
    let startX = width * 0.2

    let rawTime = (active as any).time ?? (active as any).entryTime ?? null
    if (typeof rawTime === 'string') {
      rawTime = Math.floor(new Date(rawTime).getTime() / 1000)
    }
    if (typeof rawTime === 'number' && rawTime > 2000000000) {
      rawTime = Math.floor(rawTime / 1000)
    }

    if (rawTime != null && sanitizedCandles.length > 0) {
      let xCoord = timeScale.timeToCoordinate(rawTime as UTCTimestamp)
      if (xCoord === null) {
        let closestCandle = sanitizedCandles[0]
        let minDiff = Math.abs((sanitizedCandles[0].time as number) - (rawTime as number))
        for (const c of sanitizedCandles) {
          const diff = Math.abs((c.time as number) - (rawTime as number))
          if (diff < minDiff) {
            minDiff = diff
            closestCandle = c
          }
        }
        xCoord = timeScale.timeToCoordinate(closestCandle.time)
      }
      if (xCoord !== null) {
        startX = Math.max(0, xCoord)
      }
    }

    const rightMargin = 62
    const endX = Math.max(startX + 110, width - rightMargin)

    setOverlayData({
      entryY,
      slY,
      tpY,
      startX,
      endX,
    })
  }

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      updateOverlay()
    })

    const chart = chartRef.current
    if (!chart) {
      return () => cancelAnimationFrame(rafId)
    }

    const timeScale = chart.timeScale()
    const handleRangeChange = () => updateOverlay()
    const observer =
      typeof ResizeObserver !== 'undefined' && containerRef.current
        ? new ResizeObserver(handleRangeChange)
        : null
    if (observer && containerRef.current) {
      observer.observe(containerRef.current)
    }

    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange)
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange)
    chart.subscribeCrosshairMove(handleRangeChange)
    window.addEventListener('resize', handleRangeChange)

    return () => {
      cancelAnimationFrame(rafId)
      observer?.disconnect()
      timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange)
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange)
      chart.unsubscribeCrosshairMove(handleRangeChange)
      window.removeEventListener('resize', handleRangeChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSignal, manualSetup, sanitizedCandles, symbol, timeframe])

  // Track crosshair OHLC + external signal hover callback
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return

    const hoverKey = `${symbol}:${timeframe}`
    const handleMove = (param: { time?: Time; seriesData: Map<any, any> }) => {
      const point = param.seriesData?.get(series)
      if (point && typeof point.open === 'number') {
        setHoveredState({
          key: hoverKey,
          candle: {
            time: (typeof param.time === 'number' ? param.time : 0) as UTCTimestamp,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close,
          },
        })
      } else {
        setHoveredState(null)
      }
      if (onCrosshairMove) {
        if (param.time == null && isOverBriefingRef.current) return
        onCrosshairMove(typeof param.time === 'number' ? (param.time as UTCTimestamp) : null)
      }
    }

    chart.subscribeCrosshairMove(handleMove)
    return () => chart.unsubscribeCrosshairMove(handleMove)
  }, [onCrosshairMove, symbol, timeframe])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !onChartClick) return

    const handleClick = (param: { point?: { x: number; y: number }; time?: Time }) => {
      const price =
        param.point && seriesRef.current ? seriesRef.current.coordinateToPrice(param.point.y) : null
      onChartClick({ ...param, price })
    }

    chart.subscribeClick(handleClick)
    return () => chart.unsubscribeClick(handleClick)
  }, [onChartClick])

  const hoveredCandle =
    hoveredState && hoveredState.key === `${symbol}:${timeframe}` ? hoveredState.candle : null
  const latestCandle = sanitizedCandles[sanitizedCandles.length - 1] ?? null
  const hudCandle = hoveredCandle ?? latestCandle
  const isBull = hudCandle ? hudCandle.close >= hudCandle.open : true
  const deltaPct =
    hudCandle && hudCandle.open > 0
      ? ((hudCandle.close - hudCandle.open) / hudCandle.open) * 100
      : 0
  const headlinePrice = livePrice ?? hudCandle?.close ?? null

  const tfSec = TIMEFRAME_SECONDS[timeframe] ?? 3600
  const nextCloseSec = latestCandle
    ? latestCandle.time + tfSec > nowSec
      ? latestCandle.time + tfSec - nowSec
      : tfSec - (nowSec % tfSec)
    : tfSec - (nowSec % tfSec)

  // Determine active Obsidian Briefing Card model (active signal or manual setup)
  const briefingKey = activeSignal
    ? `sig:${activeSignal.id ?? `${activeSignal.action}:${activeSignal.entry}:${activeSignal.entryTime ?? ''}`}`
    : manualSetup && manualSetup.generated
    ? `man:${manualSetup.action}:${manualSetup.entry}:${manualSetup.sl ?? ''}:${manualSetup.tp ?? ''}`
    : null

  const showBriefing = Boolean(briefingKey && briefingKey !== dismissedBriefingKey)

  const briefingData = useMemo(() => {
    if (activeSignal) {
      const riskDist = Math.abs(activeSignal.entry - activeSignal.sl)
      const rewardDist = Math.abs(activeSignal.tp - activeSignal.entry)
      const rr = activeSignal.rr ?? (riskDist > 0 ? rewardDist / riskDist : 0)
      return {
        mode: 'signal' as const,
        action: activeSignal.action,
        confidence: activeSignal.confidence,
        strategyLabel: activeSignal.strategyLabel || 'Strategy setup',
        risk: activeSignal.risk,
        entry: activeSignal.entry,
        sl: activeSignal.sl,
        tp: activeSignal.tp,
        rr,
        lotSize: activeSignal.lotSize,
        riskAmountUsd: activeSignal.riskAmountUsd,
        reasons: activeSignal.reason ?? [],
        locked: Boolean(activeSignal.locked),
        canExecute: Boolean(onExecuteActiveSignal),
      }
    }

    if (manualSetup && manualSetup.generated) {
      const riskDist =
        manualSetup.sl != null ? Math.abs(manualSetup.entry - manualSetup.sl) : 0
      const rewardDist =
        manualSetup.tp != null ? Math.abs(manualSetup.tp - manualSetup.entry) : 0
      const rr = manualSetup.rr ?? (riskDist > 0 ? rewardDist / riskDist : 0)
      return {
        mode: 'manual' as const,
        action: manualSetup.action,
        confidence: undefined,
        strategyLabel: manualSetup.entryType === 'limit' ? 'Limit order plan' : 'Market order plan',
        risk: undefined,
        entry: manualSetup.entry,
        sl: manualSetup.sl,
        tp: manualSetup.tp,
        rr,
        lotSize: manualSetup.lotSize,
        riskAmountUsd: manualSetup.riskAmountUsd,
        reasons:
          manualSetup.reason && manualSetup.reason.length > 0
            ? manualSetup.reason
            : [
                `${manualSetup.entryType === 'limit' ? 'Limit' : 'Market'} ${manualSetup.action} setup anchored directly from chart levels`,
                rr > 0
                  ? `Risk-to-reward calibrated at ${rr.toFixed(2)}R across current range`
                  : 'Adjust stop loss or target in the Order tab to refine sizing',
              ],
        locked: true,
        canExecute: Boolean(onExecuteManualSetup) && manualSetup.valid !== false,
      }
    }

    return null
  }, [activeSignal, manualSetup, onExecuteActiveSignal, onExecuteManualSetup])

  return (
    <div className="flex flex-col h-full bg-[#09090B] overflow-hidden relative">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 h-[52px] border-b border-white/[0.06] shrink-0 gap-3 bg-[#09090B]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[14px] font-semibold text-[#FAFAFA] truncate">{symbol}</span>
            <span className="text-[13px] text-[#71717A]">{timeframe}</span>
          </div>
          {onTimeframeChange && (
            <div className="flex items-center gap-0.5 bg-[#141417] rounded-full p-1">
              {TIMEFRAMES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onTimeframeChange(option)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                    timeframe === option
                      ? 'bg-white/[0.12] text-[#FAFAFA]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Chart Viewport Wrapper */}
      <div className="flex-1 min-h-[320px] w-full relative bg-[#09090B]">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Calm Top-Left OHLC Overlay */}
        <div className="absolute top-3.5 left-4 right-20 z-10 pointer-events-none select-none space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                {symbol}
              </span>
              <span className="text-[13px] font-medium text-[#71717A]">{timeframe}</span>
            </div>

            {headlinePrice != null && (
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-mono tabular-nums font-medium text-[#FAFAFA]">
                  {formatPrice(headlinePrice, digits, symbol)}
                </span>
                {hudCandle && (
                  <span
                    className={cn(
                      'text-[13px] font-mono tabular-nums',
                      isBull ? 'text-[#34D399]' : 'text-[#F87171]'
                    )}
                  >
                    {deltaPct >= 0 ? '+' : ''}
                    {deltaPct.toFixed(2)}%
                  </span>
                )}
              </div>
            )}

            <span className="text-[12px] text-[#71717A] tabular-nums">
              Bar closes{' '}
              <span className="font-mono text-[#A1A1AA]">{formatCountdown(nextCloseSec)}</span>
            </span>

            {loading && <span className="text-[12px] text-[#71717A]">Syncing...</span>}
          </div>

          {hudCandle && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] font-mono tabular-nums">
              <span>
                <span className="text-[#71717A] mr-1">O</span>
                <span className="text-[#A1A1AA]">{hudCandle.open.toFixed(digits)}</span>
              </span>
              <span>
                <span className="text-[#71717A] mr-1">H</span>
                <span className="text-[#A1A1AA]">{hudCandle.high.toFixed(digits)}</span>
              </span>
              <span>
                <span className="text-[#71717A] mr-1">L</span>
                <span className="text-[#A1A1AA]">{hudCandle.low.toFixed(digits)}</span>
              </span>
              <span>
                <span className="text-[#71717A] mr-1">C</span>
                <span className={isBull ? 'text-[#34D399]' : 'text-[#F87171]'}>
                  {hudCandle.close.toFixed(digits)}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Ultra-Subtle Translucent TP / SL Zone Shading */}
        {overlayData && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            <svg className="w-full h-full">
              <rect
                x={overlayData.startX}
                y={Math.min(overlayData.entryY, overlayData.tpY)}
                width={Math.max(20, overlayData.endX - overlayData.startX)}
                height={Math.max(2, Math.abs(overlayData.tpY - overlayData.entryY))}
                fill="rgba(52, 211, 153, 0.045)"
              />
              <rect
                x={overlayData.startX}
                y={Math.min(overlayData.entryY, overlayData.slY)}
                width={Math.max(20, overlayData.endX - overlayData.startX)}
                height={Math.max(2, Math.abs(overlayData.slY - overlayData.entryY))}
                fill="rgba(248, 113, 113, 0.045)"
              />
            </svg>
          </div>
        )}

        {/* Floating Obsidian Briefing Card (signal-chart.png inspired) */}
        {showBriefing && briefingData && (
          <div
            onMouseEnter={() => {
              isOverBriefingRef.current = true
            }}
            onMouseLeave={() => {
              isOverBriefingRef.current = false
            }}
            className="hidden sm:flex flex-col absolute bottom-4 right-[76px] z-20 w-[348px] max-w-[calc(100%-6rem)] max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-2xl bg-[#111113]/95 border border-white/[0.08] p-5 space-y-4"
          >
            {/* Header: Direction + Symbol + Confidence + Dismiss */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    'px-2.5 py-0.5 rounded-md text-[12px] font-semibold shrink-0',
                    briefingData.action === 'BUY'
                      ? 'bg-[#34D399]/15 text-[#34D399]'
                      : 'bg-[#F87171]/15 text-[#F87171]'
                  )}
                >
                  {briefingData.action}
                </span>
                <span className="text-[15px] font-semibold text-[#FAFAFA] truncate">
                  {symbol}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {briefingData.confidence != null && (
                  <span
                    className={cn(
                      'text-[14px] font-mono tabular-nums font-semibold',
                      briefingData.action === 'BUY' ? 'text-[#34D399]' : 'text-[#FAFAFA]'
                    )}
                  >
                    {briefingData.confidence}%
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (briefingData.locked && onClearSelection) {
                      onClearSelection()
                    } else if (briefingKey) {
                      setDismissedBriefingKey(briefingKey)
                    }
                  }}
                  className="p-1 rounded-lg text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors"
                  aria-label="Hide setup briefing"
                  title="Hide setup briefing"
                >
                  <PiX size={16} />
                </button>
              </div>
            </div>

            {/* Strategy & Risk Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#161619] border border-white/[0.06] px-2.5 py-0.5 text-[12px] font-medium text-[#A1A1AA]">
                {briefingData.strategyLabel}
              </span>
              {briefingData.risk && (
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[12px] font-medium',
                    briefingData.risk === 'High'
                      ? 'bg-[#F87171]/12 text-[#F87171]'
                      : briefingData.risk === 'Low'
                      ? 'bg-[#34D399]/12 text-[#34D399]'
                      : 'bg-[#161619] border border-white/[0.06] text-[#A1A1AA]'
                  )}
                >
                  {briefingData.risk} risk
                </span>
              )}
            </div>

            {/* 4-Column Entry / SL / TP / R:R Strip */}
            <div className="grid grid-cols-4 gap-2 bg-[#161619] rounded-xl p-3">
              <div className="min-w-0">
                <span className="block text-[12px] text-[#71717A]">Entry</span>
                <span className="block text-[13px] font-mono tabular-nums font-medium text-[#FAFAFA] truncate mt-0.5">
                  {formatPrice(briefingData.entry, digits, symbol)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[12px] text-[#71717A]">SL</span>
                <span className="block text-[13px] font-mono tabular-nums font-medium text-[#F87171] truncate mt-0.5">
                  {briefingData.sl != null ? formatPrice(briefingData.sl, digits, symbol) : '—'}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[12px] text-[#71717A]">TP</span>
                <span className="block text-[13px] font-mono tabular-nums font-medium text-[#34D399] truncate mt-0.5">
                  {briefingData.tp != null ? formatPrice(briefingData.tp, digits, symbol) : '—'}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[12px] text-[#71717A]">R:R</span>
                <span className="block text-[13px] font-mono tabular-nums font-medium text-[#FAFAFA] truncate mt-0.5">
                  {briefingData.rr > 0 ? `${briefingData.rr.toFixed(2)}R` : '—'}
                </span>
              </div>
            </div>

            {/* Suggested Sizing Row */}
            {(briefingData.lotSize != null || briefingData.riskAmountUsd != null) && (
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06] text-[13px]">
                <span className="text-[#71717A]">Suggested sizing</span>
                <span className="font-mono tabular-nums font-medium text-[#FAFAFA]">
                  {briefingData.lotSize != null ? `${briefingData.lotSize.toFixed(2)} lots` : ''}
                  {briefingData.lotSize != null && briefingData.riskAmountUsd != null ? ' · ' : ''}
                  {briefingData.riskAmountUsd != null
                    ? `$${briefingData.riskAmountUsd.toFixed(2)}`
                    : ''}
                </span>
              </div>
            )}

            {/* Plain-English Confluence Reasons */}
            {briefingData.reasons.length > 0 && (
              <div className="space-y-2">
                <p className="text-[12px] font-medium text-[#71717A]">
                  {briefingData.mode === 'signal'
                    ? `Why ${briefingData.strategyLabel} picked this setup`
                    : 'Plan summary'}
                </p>
                <ul className="space-y-1.5">
                  {briefingData.reasons.slice(0, 4).map((reason, idx) => (
                    <li
                      key={idx}
                      className="text-[13px] leading-relaxed text-[#A1A1AA] flex items-start gap-2"
                    >
                      <span className="text-[#71717A] mt-[2px]">·</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* One-Click MT5 Execution Action */}
            {briefingData.canExecute && (
              <button
                type="button"
                disabled={executingSetup}
                onClick={() => {
                  if (briefingData.mode === 'signal' && onExecuteActiveSignal) {
                    void onExecuteActiveSignal()
                  } else if (briefingData.mode === 'manual' && onExecuteManualSetup) {
                    void onExecuteManualSetup()
                  }
                }}
                className={cn(
                  'w-full h-10 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50',
                  briefingData.action === 'BUY'
                    ? 'bg-[#34D399]/15 hover:bg-[#34D399]/25 border-[#34D399]/30 text-[#34D399]'
                    : 'bg-[#F87171]/15 hover:bg-[#F87171]/25 border-[#F87171]/30 text-[#F87171]'
                )}
              >
                {executingSetup ? (
                  <PiSpinnerGap size={16} className="animate-spin" />
                ) : (
                  <PiLightning size={16} />
                )}
                <span>
                  {executingSetup
                    ? 'Submitting to MT5...'
                    : `Execute ${briefingData.action} on MT5`}
                </span>
                {briefingData.lotSize != null && !executingSetup && (
                  <span className="font-mono tabular-nums text-[12px] opacity-85">
                    ({briefingData.lotSize.toFixed(2)}L)
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
