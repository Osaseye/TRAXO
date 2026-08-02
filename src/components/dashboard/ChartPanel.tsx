/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react'
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
  locked?: boolean
}

export interface ChartPanelManualSetup {
  entry: number
  action: 'BUY' | 'SELL'
  sl: number | null
  tp: number | null
  generated: boolean
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

  useEffect(() => {
    if (!seriesRef.current) return
    if (candles.length === 0) return

    const timeScale = chartRef.current?.timeScale()
    seriesRef.current.setData(candles as any)
    createSeriesMarkers(seriesRef.current, markers)

    if (!hasSetInitialDataRef.current) {
      timeScale?.fitContent()
      hasSetInitialDataRef.current = true
      return
    }

    if ((timeScale?.scrollPosition() ?? 0) === 0) {
      timeScale?.scrollToRealTime()
    }
  }, [candles, markers])

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
    <div className="flex flex-col h-full bg-surface border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 border-b border-border shrink-0 gap-3">
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

      <div ref={containerRef} className="flex-1 min-h-[320px] w-full" />
    </div>
  )
}
