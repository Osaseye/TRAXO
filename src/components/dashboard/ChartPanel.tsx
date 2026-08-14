/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useMemo } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts'
import type { IPriceLine, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'
import type { Candle } from '@/lib/signalDetection'

export type ChartPanelMarker = SeriesMarker<Time>

export interface ChartPanelActiveSignal {
  entry: number
  sl: number
  tp: number
  action: 'BUY' | 'SELL'
  entryTime?: UTCTimestamp
  confidence?: number
  rr?: number
  locked?: boolean
}

export interface ChartPanelManualSetup {
  entry: number
  action: 'BUY' | 'SELL'
  sl: number | null
  tp: number | null
  generated: boolean
  entryTime?: UTCTimestamp
  rr?: number
}

interface ChartPanelProps {
  symbol: string
  timeframe: ChartTimeframe
  candles: Candle[]
  markers?: ChartPanelMarker[]
  activeSignal?: ChartPanelActiveSignal | null
  manualSetup?: ChartPanelManualSetup | null
  onCrosshairMove?: (time: UTCTimestamp | null) => void
  onChartClick?: (payload: { point?: { x: number; y: number }; time?: Time; price?: number | null }) => void
  onTimeframeChange: (timeframe: ChartTimeframe) => void
}

const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

function pricePrecision(symbol: string) {
  if (symbol === 'USDJPY') return 3
  if (symbol === 'XAUUSD') return 2
  if (symbol === 'BTCUSDT' || symbol === 'ETHUSD') return 1
  return 5
}

interface PositionOverlayData {
  entryY: number
  slY: number
  tpY: number
  startX: number
  endX: number
  action: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  digits: number
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
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null)
  const activeEntryLineRef = useRef<IPriceLine | null>(null)
  const activeSlLineRef = useRef<IPriceLine | null>(null)
  const activeTpLineRef = useRef<IPriceLine | null>(null)
  const manualEntryLineRef = useRef<IPriceLine | null>(null)
  const manualSlLineRef = useRef<IPriceLine | null>(null)
  const manualTpLineRef = useRef<IPriceLine | null>(null)
  const hasSetInitialDataRef = useRef(false)

  const [overlayData, setOverlayData] = useState<PositionOverlayData | null>(null)

  // Initialize Lightweight Charts instance
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#070709' },
        textColor: '#94A3B8',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(15, 23, 42, 0.35)' },
        horzLines: { color: 'rgba(15, 23, 42, 0.35)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3b82f6', labelBackgroundColor: '#1d4ed8' },
        horzLine: { color: '#3b82f6', labelBackgroundColor: '#1d4ed8' },
      },
      rightPriceScale: { borderColor: '#111827' },
      timeScale: {
        borderColor: '#111827',
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
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceFormat: {
        type: 'price',
        precision: pricePrecision(symbol),
        minMove: 1 / 10 ** pricePrecision(symbol),
      },
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current) return

    seriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision: pricePrecision(symbol),
        minMove: 1 / 10 ** pricePrecision(symbol),
      },
    })
  }, [symbol])

  useEffect(() => {
    hasSetInitialDataRef.current = false
  }, [symbol, timeframe])

  // SANITIZED CANDLES PROCESSOR:
  // Eliminates duplicate timestamps and ensures strict ascending order by time.
  const sanitizedCandles = useMemo(() => {
    if (!candles || candles.length === 0) return []

    const byTime = new Map<number, Candle>()
    for (const c of candles) {
      if (!c || c.time == null) continue
      const tNum = typeof c.time === 'string' ? Math.floor(new Date(c.time).getTime() / 1000) : Number(c.time)
      if (Number.isNaN(tNum)) continue

      // Deduplicate by time: latest candle updates previous entry
      byTime.set(tNum, { ...c, time: tNum as UTCTimestamp })
    }

    return Array.from(byTime.values()).sort((a, b) => (a.time as number) - (b.time as number))
  }, [candles])

  // RESILIENT MARKERS PROCESSOR:
  // Snaps timestamps to available candle timestamps so signals NEVER vanish when zooming/scaling.
  const validMarkers = useMemo(() => {
    if (!sanitizedCandles || sanitizedCandles.length === 0 || !markers || markers.length === 0) return []

    const candleTimeSet = new Set(sanitizedCandles.map((c) => c.time as number))
    const candleTimes = sanitizedCandles.map((c) => c.time as number)

    const mapped = markers.map((m) => {
      const tNum = m.time as number
      if (candleTimeSet.has(tNum)) return m

      // Snap to nearest candle timestamp in dataset
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

    // Deduplicate and strictly sort ascending by timestamp
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

  // Feed candle data and markers
  useEffect(() => {
    if (!seriesRef.current) return
    if (sanitizedCandles.length === 0) return

    const timeScale = chartRef.current?.timeScale()
    seriesRef.current.setData(sanitizedCandles as any)
    createSeriesMarkers(seriesRef.current, validMarkers)

    if (!hasSetInitialDataRef.current) {
      timeScale?.fitContent()
      hasSetInitialDataRef.current = true
      return
    }

    if ((timeScale?.scrollPosition() ?? 0) === 0) {
      timeScale?.scrollToRealTime()
    }
  }, [sanitizedCandles, validMarkers])

  // Update Price Lines for Active Signal
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
      color: '#cbd5e1',
      lineWidth: 1,
      lineStyle: LineStyle.SparseDotted,
      axisLabelVisible: true,
      title: activeSignal.locked ? 'Entry - Locked' : 'Entry',
    })

    activeSlLineRef.current = series.createPriceLine({
      price: activeSignal.sl,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'SL',
    })

    activeTpLineRef.current = series.createPriceLine({
      price: activeSignal.tp,
      color: '#22c55e',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'TP',
    })
  }, [activeSignal])

  // Update Price Lines for Manual Setup
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
      color: '#d1d5db',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Entry - ${manualSetup.action}`,
    })

    if (!manualSetup.generated || manualSetup.sl == null || manualSetup.tp == null) return

    manualSlLineRef.current = series.createPriceLine({
      price: manualSetup.sl,
      color: '#ef4444',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Stop Loss',
    })

    manualTpLineRef.current = series.createPriceLine({
      price: manualSetup.tp,
      color: '#22c55e',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Take Profit',
    })
  }, [manualSetup])

  // POSITION TOOL OVERLAY CALCULATOR:
  // Dynamically computes pixel coordinates to draw TradingView-style TP & SL Shaded Boxes
  const updateOverlay = () => {
    const chart = chartRef.current
    const series = seriesRef.current
    const container = containerRef.current
    if (!chart || !series || !container) {
      setOverlayData(null)
      return
    }

    const active = activeSignal || (manualSetup && manualSetup.generated && manualSetup.sl != null && manualSetup.tp != null ? manualSetup : null)
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

    const width = container.clientWidth
    const timeScale = chart.timeScale()
    let startX = width * 0.15

    let rawTime = (active as any).time ?? (active as any).entryTime ?? null
    if (typeof rawTime === 'string') {
      rawTime = Math.floor(new Date(rawTime).getTime() / 1000)
    }
    if (typeof rawTime === 'number' && rawTime > 2000000000) {
      rawTime = Math.floor(rawTime / 1000)
    }

    if (rawTime != null) {
      let xCoord = timeScale.timeToCoordinate(rawTime as UTCTimestamp)
      if (xCoord === null && candles.length > 0) {
        let closestCandle = candles[0]
        let minDiff = Math.abs((candles[0].time as number) - (rawTime as number))
        for (const c of candles) {
          const diff = Math.abs((c.time as number) - (rawTime as number))
          if (diff < minDiff) {
            minDiff = diff
            closestCandle = c
          }
        }
        xCoord = timeScale.timeToCoordinate(closestCandle.time as UTCTimestamp)
      }
      if (xCoord !== null) {
        startX = Math.max(0, xCoord)
      }
    }

    const rightMargin = 55
    const endX = Math.max(startX + 140, width - rightMargin)

    const digits = pricePrecision(symbol)
    const riskDist = Math.abs(active.entry - active.sl)
    const rewardDist = Math.abs(active.tp - active.entry)
    const rr = active.rr || (riskDist > 0 ? rewardDist / riskDist : 0)

    setOverlayData({
      entryY,
      slY,
      tpY,
      startX,
      endX,
      action: active.action || 'BUY',
      entry: active.entry,
      sl: active.sl,
      tp: active.tp,
      rr,
      digits,
    })
  }

  // Subscribe overlay positioning to chart zoom, scale, scroll, crosshair, and resize events
  useEffect(() => {
    updateOverlay()

    const chart = chartRef.current
    if (!chart) return

    const timeScale = chart.timeScale()
    const handleRangeChange = () => updateOverlay()

    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange)
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange)
    chart.subscribeCrosshairMove(handleRangeChange)

    window.addEventListener('resize', handleRangeChange)

    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange)
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange)
      chart.unsubscribeCrosshairMove(handleRangeChange)
      window.removeEventListener('resize', handleRangeChange)
    }
  }, [activeSignal, manualSetup, candles, symbol, timeframe])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !onCrosshairMove) return

    const handleMove = (param: { time?: Time }) => {
      onCrosshairMove(typeof param.time === 'number' ? (param.time as UTCTimestamp) : null)
    }

    chart.subscribeCrosshairMove(handleMove)
    return () => chart.unsubscribeCrosshairMove(handleMove)
  }, [onCrosshairMove])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !onChartClick) return

    const handleClick = (param: { point?: { x: number; y: number }; time?: Time }) => {
      const price = param.point && seriesRef.current ? seriesRef.current.coordinateToPrice(param.point.y) : null
      onChartClick({ ...param, price })
    }

    chart.subscribeClick(handleClick)
    return () => chart.unsubscribeClick(handleClick)
  }, [onChartClick])

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-lg overflow-hidden relative">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 border-b border-border shrink-0 gap-3 z-10 bg-[#070709]">
        <div />
        <div className="flex items-center justify-center gap-2 text-center min-w-0">
          <span className="text-sm font-semibold text-text-primary truncate">{symbol}</span>
          <span className="text-xs text-text-muted uppercase tracking-wide whitespace-nowrap">Market chart</span>
        </div>
        <div className="flex justify-end">
          <Tabs value={timeframe} onValueChange={(value) => onTimeframeChange(value as ChartTimeframe)}>
            <TabsList className="h-7 gap-0.5 p-0.5">
              {TIMEFRAMES.map((option) => (
                <TabsTrigger key={option} value={option} className="h-6 px-2 text-[11px]">
                  {option}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Lightweight Charts Container */}
      <div ref={containerRef} className="flex-1 min-h-[320px] w-full relative">
        {/* TRADINGVIEW-STYLE LONG/SHORT POSITION TOOL OVERLAY */}
        {overlayData && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          <svg className="w-full h-full">
            {/* Take Profit (TP) Shaded Rectangle (Green) */}
            <rect
              x={overlayData.startX}
              y={Math.min(overlayData.entryY, overlayData.tpY)}
              width={Math.max(20, overlayData.endX - overlayData.startX)}
              height={Math.max(2, Math.abs(overlayData.tpY - overlayData.entryY))}
              fill="rgba(34, 197, 94, 0.18)"
              stroke="rgba(34, 197, 94, 0.5)"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Stop Loss (SL) Shaded Rectangle (Red) */}
            <rect
              x={overlayData.startX}
              y={Math.min(overlayData.entryY, overlayData.slY)}
              width={Math.max(20, overlayData.endX - overlayData.startX)}
              height={Math.max(2, Math.abs(overlayData.slY - overlayData.entryY))}
              fill="rgba(239, 68, 68, 0.18)"
              stroke="rgba(239, 68, 68, 0.5)"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Entry Axis Line */}
            <line
              x1={overlayData.startX}
              y1={overlayData.entryY}
              x2={overlayData.endX}
              y2={overlayData.entryY}
              stroke="#cbd5e1"
              strokeWidth="2"
            />
          </svg>

          {/* TP Target Header Tag */}
          <div
            className="absolute bg-emerald-600/90 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-lg border border-emerald-400/40 flex items-center gap-2 whitespace-nowrap"
            style={{
              left: overlayData.startX + 12,
              top: Math.min(overlayData.entryY, overlayData.tpY) - 10,
            }}
          >
            <span>Target: {overlayData.tp.toFixed(overlayData.digits)}</span>
            <span className="opacity-90 text-[9px] font-semibold">
              (+{Math.abs(overlayData.tp - overlayData.entry).toFixed(overlayData.digits)})
            </span>
          </div>

          {/* SL Stop Header Tag */}
          <div
            className="absolute bg-rose-600/90 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-lg border border-rose-400/40 flex items-center gap-2 whitespace-nowrap"
            style={{
              left: overlayData.startX + 12,
              top: Math.max(overlayData.entryY, overlayData.slY) - 10,
            }}
          >
            <span>Stop: {overlayData.sl.toFixed(overlayData.digits)}</span>
            <span className="opacity-90 text-[9px] font-semibold">
              (-{Math.abs(overlayData.entry - overlayData.sl).toFixed(overlayData.digits)})
            </span>
          </div>

          {/* Risk/Reward Center Floating Pill */}
          <div
            className="absolute bg-[#090d14]/95 text-white border border-white/[0.2] px-3 py-1 rounded-full text-[10px] font-extrabold shadow-xl flex items-center gap-1.5 -translate-y-1/2"
            style={{
              left: overlayData.startX + (overlayData.endX - overlayData.startX) / 2 - 55,
              top: overlayData.entryY,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span>Risk/Reward {overlayData.rr.toFixed(2)}x</span>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
