/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
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
  LogicalRange,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import { PiCheck, PiDotsSixVertical, PiLightning, PiSpinnerGap, PiX } from 'react-icons/pi'
import { priceDigits, type Candle } from '@/lib/signalDetection'
import { cn, formatPrice } from '@/lib/utils'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'

export type ChartPanelMarker = SeriesMarker<Time>

export interface ChartPanelActiveSignal {
  id?: string
  entry: number
  sl: number
  tp: number
  tp2?: number | null
  exitMode?: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2'
  entryType?: 'MARKET' | 'LIMIT' | 'STOP' | 'market' | 'limit' | string
  tier?: 'PRIME' | 'STANDARD' | 'AGGRESSIVE' | string
  status?: string
  confluence?: {
    score?: number
    maxScore?: number
    tier?: string
    passedCriteria?: string[]
    checks?: Array<{ key?: string; label: string; passed: boolean; detail?: string }>
  } | null
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

export interface ChartSignalChoice {
  id: string
  label: string
  action: 'BUY' | 'SELL'
  confidence: number
  entryBadge: string
}

export interface ChartPanelProps {
  symbol: string
  timeframe: ChartTimeframe
  candles: Candle[]
  markers?: ChartPanelMarker[]
  activeSignal?: ChartPanelActiveSignal | null
  manualSetup?: ChartPanelManualSetup | null
  signalChoices?: ChartSignalChoice[]
  selectedSignalId?: string | null
  previewSignalId?: string | null
  onPreviewSignal?: (id: string | null) => void
  onSelectSignal?: (id: string) => void
  onCrosshairMove?: (time: UTCTimestamp | null, price?: number | null) => void
  onChartClick?: (payload: { point?: { x: number; y: number }; time?: Time; price?: number | null }) => void
  onTimeframeChange?: (timeframe: ChartTimeframe) => void
  onExecuteActiveSignal?: () => Promise<void> | void
  onExecuteManualSetup?: () => Promise<void> | void
  onClearSelection?: () => void
  executingSetup?: boolean
  setupExecuted?: boolean
  executionMode?: 'paper' | 'metaapi'
  onLoadMoreHistory?: () => Promise<void> | void
  loadingHistory?: boolean
  hasMoreHistory?: boolean
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

const CONFLUENCE_SHORT_LABELS: Record<string, string> = {
  htf_bias: 'HTF Alignment',
  liquidity_sweep: 'Liquidity Sweep',
  displacement: 'Displacement',
  structural_imbalance: 'Imbalance / FVG',
  optimal_value: 'Optimal Value',
  volume_confirmation: 'Volume RVOL',
  session_killzone: 'Session',
  asymmetric_rr: 'Asymmetric R:R',
  news_clearance: 'News Clear',
}

function isLiveStatus(status?: string): boolean {
  const st = String(status || 'live').trim().toLowerCase()
  return st === 'live' || st === 'active' || st === 'open' || st === 'pending'
}

function isPositionStatus(status?: string): boolean {
  const st = String(status || '').trim().toLowerCase()
  return st === 'position_open' || st === 'position_pending'
}

function formatSignalStatusBadge(status?: string): string {
  const st = String(status || 'live').trim().toLowerCase()
  if (st === 'position_open') return 'OPEN POS'
  if (st === 'position_pending') return 'PENDING ORD'
  if (isLiveStatus(st)) return 'LIVE'
  return 'PAST'
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
  tp2Y: number | null
  showTp2Runner: boolean
  anchorX: number | null
  isBuy: boolean
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
  signalChoices = [],
  selectedSignalId = null,
  previewSignalId = null,
  onPreviewSignal,
  onSelectSignal,
  onCrosshairMove,
  onChartClick,
  onTimeframeChange,
  onExecuteActiveSignal,
  onExecuteManualSetup,
  onClearSelection,
  executingSetup = false,
  setupExecuted = false,
  executionMode = 'paper',
  onLoadMoreHistory,
  loadingHistory = false,
  hasMoreHistory = true,
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
  const activeTp2LineRef = useRef<IPriceLine | null>(null)
  const manualEntryLineRef = useRef<IPriceLine | null>(null)
  const manualSlLineRef = useRef<IPriceLine | null>(null)
  const manualTpLineRef = useRef<IPriceLine | null>(null)
  const hasSetInitialDataRef = useRef(false)
  const isOverBriefingRef = useRef(false)
  const executeClickLockRef = useRef(false)
  const prevCandlesMetaRef = useRef<{ firstTime: number | null; length: number }>({
    firstTime: null,
    length: 0,
  })
  const onLoadMoreHistoryRef = useRef(onLoadMoreHistory)
  const loadingHistoryRef = useRef(loadingHistory)
  const hasMoreHistoryRef = useRef(hasMoreHistory)
  const lastHistoryTriggerAtRef = useRef(0)

  useEffect(() => {
    onLoadMoreHistoryRef.current = onLoadMoreHistory
    loadingHistoryRef.current = loadingHistory
    hasMoreHistoryRef.current = hasMoreHistory
  }, [onLoadMoreHistory, loadingHistory, hasMoreHistory])

  const [overlayData, setOverlayData] = useState<PositionOverlayData | null>(null)
  const [hoveredState, setHoveredState] = useState<{
    key: string
    candle: NormalizedCandle
  } | null>(null)
  const [dismissedBriefingKey, setDismissedBriefingKey] = useState<string | null>(null)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  const [dragState, setDragState] = useState<{ key: string; x: number; y: number }>({
    key: '',
    x: 0,
    y: 0,
  })
  const dragPointerRef = useRef<{
    dragging: boolean
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const activeChartKey = `${symbol}:${timeframe}`
  const dragOffset =
    dragState.key === activeChartKey ? { x: dragState.x, y: dragState.y } : { x: 0, y: 0 }

  const handleDragPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement)?.closest('button')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragPointerRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragOffset.x,
      origY: dragOffset.y,
    }
  }

  const handleDragPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragPointerRef.current
    if (!st || !st.dragging) return
    setDragState({
      key: activeChartKey,
      x: st.origX + (e.clientX - st.startX),
      y: st.origY + (e.clientY - st.startY),
    })
  }

  const handleDragPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragPointerRef.current?.dragging) return
    dragPointerRef.current = null
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // ignore if capture already released
    }
  }

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
    prevCandlesMetaRef.current = { firstTime: null, length: 0 }
    lastHistoryTriggerAtRef.current = 0
  }, [symbol, timeframe])

  // Subscribe once on mount to detect scroll-left near start of loaded history
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const timeScale = chart.timeScale()

    const handleLogicalRangeChange = (range: LogicalRange | null) => {
      if (
        hasSetInitialDataRef.current &&
        range &&
        range.from < 20 &&
        onLoadMoreHistoryRef.current &&
        hasMoreHistoryRef.current &&
        !loadingHistoryRef.current &&
        Date.now() - lastHistoryTriggerAtRef.current > 350
      ) {
        lastHistoryTriggerAtRef.current = Date.now()
        void onLoadMoreHistoryRef.current()
      }
    }

    timeScale.subscribeVisibleLogicalRangeChange(handleLogicalRangeChange)
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange)
    }
  }, [])

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
      const rawT =
        typeof m.time === 'string' ? Math.floor(new Date(m.time).getTime() / 1000) : Number(m.time)
      const tNum = rawT > 1e12 ? Math.floor(rawT / 1000) : Math.floor(rawT)
      const normalizedMarker =
        tNum === (m.time as number) ? m : { ...m, time: tNum as UTCTimestamp }
      if (candleTimeSet.has(tNum)) return normalizedMarker

      let closest = candleTimes[0]
      let minDiff = Math.abs(candleTimes[0] - tNum)
      for (let i = 1; i < candleTimes.length; i++) {
        const diff = Math.abs(candleTimes[i] - tNum)
        if (diff < minDiff) {
          minDiff = diff
          closest = candleTimes[i]
        }
      }
      return { ...normalizedMarker, time: closest as UTCTimestamp }
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
    const prevRange = hasSetInitialDataRef.current ? timeScale?.getVisibleLogicalRange() ?? null : null
    const prevFirstTime = prevCandlesMetaRef.current.firstTime
    const newFirstTime = Number(sanitizedCandles[0].time)
    const prependedCount =
      hasSetInitialDataRef.current && prevFirstTime !== null && newFirstTime < prevFirstTime
        ? sanitizedCandles.filter((c) => Number(c.time) < prevFirstTime).length
        : 0
    prevCandlesMetaRef.current = { firstTime: newFirstTime, length: sanitizedCandles.length }

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

    if (prependedCount > 0 && prevRange && timeScale) {
      timeScale.setVisibleLogicalRange({
        from: prevRange.from + prependedCount,
        to: prevRange.to + prependedCount,
      })
    } else if ((timeScale?.scrollPosition() ?? 0) === 0) {
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
    if (activeTp2LineRef.current) {
      series.removePriceLine(activeTp2LineRef.current)
      activeTp2LineRef.current = null
    }

    if (!activeSignal) return

    const rawEntryType = String(activeSignal.entryType || 'MARKET').toUpperCase()
    const entryTitle =
      rawEntryType === 'LIMIT' || rawEntryType === 'LMT' || rawEntryType.includes('LIMIT')
        ? activeSignal.locked
          ? 'Entry · Limit · Locked'
          : 'Entry · Limit'
        : rawEntryType === 'STOP' || rawEntryType === 'STP' || rawEntryType.includes('STOP')
        ? activeSignal.locked
          ? 'Entry · Stop · Locked'
          : 'Entry · Stop'
        : activeSignal.locked
        ? 'Entry · Locked'
        : 'Entry'

    const hasTp2 =
      activeSignal.tp2 != null &&
      Number.isFinite(activeSignal.tp2) &&
      activeSignal.tp2 > 0

    activeEntryLineRef.current = series.createPriceLine({
      price: activeSignal.entry,
      color: '#38BDF8',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: entryTitle,
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
      title: hasTp2 ? 'TP1' : 'TP',
    })

    if (hasTp2 && activeSignal.tp2 != null) {
      activeTp2LineRef.current = series.createPriceLine({
        price: activeSignal.tp2,
        color: '#22D3EE',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'TP2',
      })
    }
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
      color: '#38BDF8',
      lineWidth: 2,
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
    let anchorX: number | null = null

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
        anchorX = xCoord
        startX = Math.max(0, xCoord)
      }
    }

    const tp2Val = (active as any).tp2
    const tp2Y =
      typeof tp2Val === 'number' && Number.isFinite(tp2Val) && tp2Val > 0
        ? series.priceToCoordinate(tp2Val)
        : null
    const showTp2Runner = Boolean(tp2Y !== null && (active as any).exitMode !== 'FULL_TP1')
    const isBuy = active.action === 'BUY'

    const rightMargin = 62
    const endX = Math.max(startX + 110, width - rightMargin)

    setOverlayData({
      entryY,
      slY,
      tpY,
      tp2Y,
      showTp2Runner,
      anchorX,
      isBuy,
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
    const handleMove = (param: { point?: { x: number; y: number }; time?: Time; seriesData: Map<any, any> }) => {
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
        const price =
          param.point && seriesRef.current ? seriesRef.current.coordinateToPrice(param.point.y) : null
        onCrosshairMove(typeof param.time === 'number' ? (param.time as UTCTimestamp) : null, price)
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
    const rawEntryType = String(
      activeSignal?.entryType || manualSetup?.entryType || 'MARKET'
    ).toUpperCase()
    const entryTypeBadge =
      rawEntryType.includes('LIM') || rawEntryType === 'LMT'
        ? 'LMT'
        : rawEntryType.includes('STP') || rawEntryType.includes('STOP')
        ? 'STP'
        : 'MKT'

    if (activeSignal) {
      const riskDist = Math.abs(activeSignal.entry - activeSignal.sl)
      const rewardDist = Math.abs(activeSignal.tp - activeSignal.entry)
      const rr = activeSignal.rr ?? (riskDist > 0 ? rewardDist / riskDist : 0)
      const tp2 =
        activeSignal.tp2 && Number.isFinite(activeSignal.tp2) && activeSignal.tp2 > 0
          ? activeSignal.tp2
          : null
      const exitMode = activeSignal.exitMode ?? null

      let confluence: {
        score: number
        maxScore: number
        tier: string
        chips: string[]
      }

      if (activeSignal.confluence) {
        const rawChips =
          Array.isArray(activeSignal.confluence.checks) &&
          activeSignal.confluence.checks.length > 0
            ? activeSignal.confluence.checks
                .filter((c) => c.passed)
                .map((c) => CONFLUENCE_SHORT_LABELS[c.key || ''] || c.label)
            : Array.isArray(activeSignal.confluence.passedCriteria)
            ? activeSignal.confluence.passedCriteria
            : []
        confluence = {
          score: activeSignal.confluence.score ?? 7,
          maxScore: activeSignal.confluence.maxScore ?? 9,
          tier: String(
            activeSignal.tier || activeSignal.confluence.tier || 'STANDARD'
          ).toUpperCase(),
          chips: Array.from(new Set(rawChips)),
        }
      } else {
        const conf = activeSignal.confidence ?? 75
        confluence = {
          score: conf >= 85 ? 8 : conf >= 75 ? 7 : 6,
          maxScore: 9,
          tier: String(
            activeSignal.tier || (conf >= 82 ? 'PRIME' : conf >= 72 ? 'STANDARD' : 'AGGRESSIVE')
          ).toUpperCase(),
          chips: [
            'Session',
            'Structure',
            rr >= 1.5 ? 'Asymmetric R:R' : 'Momentum',
            'Spread Clear',
            'News Clear',
          ],
        }
      }

      return {
        mode: 'signal' as const,
        action: activeSignal.action,
        confidence: activeSignal.confidence,
        strategyLabel: activeSignal.strategyLabel || 'Strategy setup',
        risk: activeSignal.risk,
        entry: activeSignal.entry,
        sl: activeSignal.sl,
        tp: activeSignal.tp,
        tp2,
        exitMode,
        entryTypeBadge,
        confluence,
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
        tp2: null,
        exitMode: null,
        entryTypeBadge,
        confluence: null,
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

  const isPaperMode = executionMode !== 'metaapi'

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
            {loadingHistory && (
              <span className="inline-flex items-center gap-1 text-[12px] text-[#A1A1AA]">
                <PiSpinnerGap className="h-3.5 w-3.5 animate-spin" />
                <span>Loading older history...</span>
              </span>
            )}
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

          {/* Multi-Signal Chooser Strip when 2+ active setups exist on this chart */}
          {signalChoices.length > 1 && (
            <div className="pt-1 flex flex-wrap items-center gap-1.5 pointer-events-auto">
              <span className="text-[11px] font-mono text-[#71717A] mr-0.5">
                {signalChoices.length} Active Setups:
              </span>
              {signalChoices.map((choice) => {
                const isLocked = selectedSignalId === choice.id
                const isPreview = previewSignalId === choice.id
                const isBuyChoice = choice.action === 'BUY'
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onMouseEnter={() => {
                      isOverBriefingRef.current = true
                      onPreviewSignal?.(choice.id)
                    }}
                    onMouseLeave={() => {
                      isOverBriefingRef.current = false
                      onPreviewSignal?.(null)
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectSignal?.(choice.id)
                    }}
                    className={cn(
                      'h-6 px-2 rounded-md text-[11px] font-mono inline-flex items-center gap-1.5 border transition-colors',
                      isLocked
                        ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold'
                        : isPreview
                        ? 'bg-[#18181B] text-[#FAFAFA] border-white/[0.24]'
                        : 'bg-[#0D0D10]/90 text-[#A1A1AA] hover:text-[#FAFAFA] border-white/[0.09]'
                    )}
                    title="Hover to preview setup · Click to lock setup on chart"
                  >
                    <span
                      className={cn(
                        'font-semibold',
                        isLocked
                          ? isBuyChoice
                            ? 'text-[#059669]'
                            : 'text-[#DC2626]'
                          : isBuyChoice
                          ? 'text-[#34D399]'
                          : 'text-[#F87171]'
                      )}
                    >
                      {choice.action === 'BUY' ? '▲' : '▼'} {choice.label}
                    </span>
                    <span className={isLocked ? 'text-[#27272A]' : 'text-[#71717A]'}>
                      {choice.entryBadge} {choice.confidence}%
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Distinct Translucent TP1 / TP2 / SL Zone Shading + Entry Baseline & Anchor Arrow */}
        {overlayData && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            <svg className="w-full h-full">
              <rect
                x={overlayData.startX}
                y={Math.min(overlayData.entryY, overlayData.tpY)}
                width={Math.max(20, overlayData.endX - overlayData.startX)}
                height={Math.max(2, Math.abs(overlayData.tpY - overlayData.entryY))}
                fill="rgba(52, 211, 153, 0.14)"
                stroke="rgba(52, 211, 153, 0.32)"
                strokeWidth="1"
              />
              {overlayData.showTp2Runner && overlayData.tp2Y !== null && (
                <rect
                  x={overlayData.startX}
                  y={Math.min(overlayData.tpY, overlayData.tp2Y)}
                  width={Math.max(20, overlayData.endX - overlayData.startX)}
                  height={Math.max(2, Math.abs(overlayData.tp2Y - overlayData.tpY))}
                  fill="rgba(34, 211, 238, 0.11)"
                  stroke="rgba(34, 211, 238, 0.28)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}
              <rect
                x={overlayData.startX}
                y={Math.min(overlayData.entryY, overlayData.slY)}
                width={Math.max(20, overlayData.endX - overlayData.startX)}
                height={Math.max(2, Math.abs(overlayData.slY - overlayData.entryY))}
                fill="rgba(248, 113, 113, 0.14)"
                stroke="rgba(248, 113, 113, 0.32)"
                strokeWidth="1"
              />
              <line
                x1={overlayData.startX}
                x2={overlayData.endX}
                y1={overlayData.entryY}
                y2={overlayData.entryY}
                stroke="#38BDF8"
                strokeOpacity="0.75"
                strokeWidth="1.5"
              />
              {overlayData.anchorX !== null &&
                (() => {
                  const ax = overlayData.anchorX
                  const ey = overlayData.entryY
                  const dirAccent = overlayData.isBuy ? '#34D399' : '#F87171'
                  const minY = Math.min(
                    ey,
                    overlayData.slY,
                    overlayData.tpY,
                    overlayData.tp2Y ?? overlayData.tpY
                  )
                  const maxY = Math.max(
                    ey,
                    overlayData.slY,
                    overlayData.tpY,
                    overlayData.tp2Y ?? overlayData.tpY
                  )
                  const arrowPoints = overlayData.isBuy
                    ? `${ax},${ey - 13} ${ax - 6},${ey - 3} ${ax + 6},${ey - 3}`
                    : `${ax},${ey + 13} ${ax - 6},${ey + 3} ${ax + 6},${ey + 3}`
                  return (
                    <g>
                      <line
                        x1={ax}
                        x2={ax}
                        y1={minY}
                        y2={maxY}
                        stroke="#38BDF8"
                        strokeOpacity="0.45"
                        strokeWidth="1"
                        strokeDasharray="2 3"
                      />
                      <circle cx={ax} cy={ey} r="9" fill="#38BDF8" fillOpacity="0.16" />
                      <polygon
                        points={arrowPoints}
                        fill={dirAccent}
                        stroke="#38BDF8"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx={ax}
                        cy={ey}
                        r="3.2"
                        fill="#38BDF8"
                        stroke="#09090B"
                        strokeWidth="1.5"
                      />
                    </g>
                  )
                })()}
            </svg>
          </div>
        )}

        {/* Minimalist Draggable Obsidian Briefing Modal */}
        {showBriefing && briefingData && (
          <div
            onMouseEnter={() => {
              isOverBriefingRef.current = true
            }}
            onMouseLeave={() => {
              isOverBriefingRef.current = false
            }}
            style={{
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            }}
            className="flex flex-col absolute inset-x-2.5 bottom-2.5 sm:inset-x-auto sm:bottom-4 sm:right-[76px] z-20 sm:w-[332px] sm:max-w-[calc(100%-6rem)] max-h-[60%] sm:max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-xl bg-[#0D0D10]/95 backdrop-blur-md border border-white/[0.08] p-3.5 sm:p-4 space-y-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.65)]"
          >
            {/* Draggable Header */}
            <div
              onPointerDown={handleDragPointerDown}
              onPointerMove={handleDragPointerMove}
              onPointerUp={handleDragPointerEnd}
              onPointerCancel={handleDragPointerEnd}
              onDoubleClick={() => setDragState({ key: activeChartKey, x: 0, y: 0 })}
              title="Drag to move · Double-click to reset position"
              className="cursor-grab active:cursor-grabbing select-none touch-none space-y-1"
            >
              <div className="sm:hidden w-9 h-1 rounded-full bg-white/[0.14] mx-auto -mt-1 mb-0.5 shrink-0" />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PiDotsSixVertical size={15} className="text-[#52525B] shrink-0" />
                  <span
                    className={cn(
                      'text-[12px] font-semibold tracking-wide shrink-0',
                      briefingData.action === 'BUY' ? 'text-[#34D399]' : 'text-[#F87171]'
                    )}
                  >
                    {briefingData.action}
                  </span>
                  <span className="text-[14px] font-semibold text-[#FAFAFA] truncate">
                    {symbol}
                  </span>
                  {briefingData.mode === 'signal' && (
                    <span
                      className={cn(
                        'text-[11px] font-mono font-medium shrink-0',
                        isPositionStatus(activeSignal?.status)
                          ? 'text-[#38BDF8]'
                          : isLiveStatus(activeSignal?.status)
                          ? 'text-[#34D399]'
                          : 'text-[#71717A]'
                      )}
                    >
                      {formatSignalStatusBadge(activeSignal?.status)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {briefingData.confidence != null && (
                    <span className="text-[13px] font-mono tabular-nums font-medium text-[#FAFAFA]">
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
                    <PiX size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Single Dot-Separated Metadata Line + Quiet Criteria Summary */}
            <div className="space-y-0.5">
              <p className="text-[11.5px] text-[#A1A1AA] truncate">
                {briefingData.strategyLabel} · {briefingData.entryTypeBadge}
                {briefingData.mode === 'signal' && briefingData.confluence
                  ? ` · ${briefingData.confluence.score}/${briefingData.confluence.maxScore} ${briefingData.confluence.tier}`
                  : ''}
                {briefingData.exitMode
                  ? ` · ${
                      briefingData.exitMode === 'SCALE_50_TP1_BE_TP2'
                        ? '50/50 TP1→TP2'
                        : '100% TP1'
                    }`
                  : ''}
              </p>
              {briefingData.mode === 'signal' &&
                briefingData.confluence &&
                briefingData.confluence.chips.length > 0 && (
                  <p className="text-[11px] text-[#71717A] truncate">
                    {briefingData.confluence.chips.slice(0, 4).join(' · ')}
                  </p>
                )}
            </div>

            {/* Unboxed Hairline Price Grid matching chart line colors */}
            <div
              className={cn(
                'grid gap-2 border-y border-white/[0.06] py-2',
                briefingData.tp2 != null ? 'grid-cols-5' : 'grid-cols-4'
              )}
            >
              <div className="min-w-0">
                <span className="block text-[11px] text-[#38BDF8]/80">Entry</span>
                <span className="block text-[12.5px] font-mono tabular-nums font-medium text-[#38BDF8] truncate mt-0.5">
                  {formatPrice(briefingData.entry, digits, symbol)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-[#F87171]/80">SL</span>
                <span className="block text-[12.5px] font-mono tabular-nums font-medium text-[#F87171] truncate mt-0.5">
                  {briefingData.sl != null ? formatPrice(briefingData.sl, digits, symbol) : '—'}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] text-[#34D399]/80">
                  {briefingData.tp2 != null ? 'TP1' : 'TP'}
                </span>
                <span className="block text-[12.5px] font-mono tabular-nums font-medium text-[#34D399] truncate mt-0.5">
                  {briefingData.tp != null ? formatPrice(briefingData.tp, digits, symbol) : '—'}
                </span>
              </div>
              {briefingData.tp2 != null && (
                <div className="min-w-0">
                  <span className="block text-[11px] text-[#22D3EE]/80">TP2</span>
                  <span className="block text-[12.5px] font-mono tabular-nums font-medium text-[#22D3EE] truncate mt-0.5">
                    {formatPrice(briefingData.tp2, digits, symbol)}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <span className="block text-[11px] text-[#71717A]">R:R</span>
                <span className="block text-[12.5px] font-mono tabular-nums font-medium text-[#FAFAFA] truncate mt-0.5">
                  {briefingData.rr > 0 ? `${briefingData.rr.toFixed(2)}R` : '—'}
                </span>
              </div>
            </div>

            {/* Concise Key Notes (max 2 bullets) + Inline Sizing */}
            {briefingData.reasons.length > 0 && (
              <ul className="space-y-1">
                {briefingData.reasons.slice(0, 2).map((reason, idx) => (
                  <li
                    key={idx}
                    className="text-[12px] leading-snug text-[#A1A1AA] flex items-start gap-1.5"
                  >
                    <span className="text-[#52525B] shrink-0">·</span>
                    <span className="line-clamp-2">{reason}</span>
                  </li>
                ))}
              </ul>
            )}

            {(briefingData.lotSize != null || briefingData.riskAmountUsd != null) && (
              <div className="text-[11.5px] font-mono tabular-nums text-[#71717A]">
                {briefingData.lotSize != null ? `Size ${briefingData.lotSize.toFixed(2)}L` : ''}
                {briefingData.lotSize != null && briefingData.riskAmountUsd != null ? ' · ' : ''}
                {briefingData.riskAmountUsd != null
                  ? `Risk $${briefingData.riskAmountUsd.toFixed(2)}`
                  : ''}
              </div>
            )}

            {/* Clean Monochrome Execution Action (only for Live Signals or Manual Setup, not already-open positions) */}
            {briefingData.canExecute &&
              !isPositionStatus(activeSignal?.status) &&
              (briefingData.mode === 'manual' || isLiveStatus(activeSignal?.status)) && (
                <button
                  type="button"
                  disabled={executingSetup || setupExecuted}
                  onClick={() => {
                    if (executeClickLockRef.current || executingSetup || setupExecuted) return
                    const actionPromise =
                      briefingData.mode === 'signal' && onExecuteActiveSignal
                        ? onExecuteActiveSignal()
                        : briefingData.mode === 'manual' && onExecuteManualSetup
                        ? onExecuteManualSetup()
                        : undefined
                    if (actionPromise !== undefined) {
                      executeClickLockRef.current = true
                      void Promise.resolve(actionPromise).finally(() => {
                        executeClickLockRef.current = false
                      })
                    }
                  }}
                  className={cn(
                    'w-full h-9 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-70',
                    setupExecuted
                      ? 'bg-[#34D399]/15 border border-[#34D399]/30 text-[#34D399] cursor-default'
                      : 'bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] disabled:opacity-50'
                  )}
                >
                  {setupExecuted ? (
                    <PiCheck size={15} />
                  ) : executingSetup ? (
                    <PiSpinnerGap size={15} className="animate-spin" />
                  ) : (
                    <PiLightning size={15} />
                  )}
                  <span>
                    {setupExecuted
                      ? briefingData.mode === 'manual'
                        ? isPaperMode
                          ? 'Paper Order Placed'
                          : 'Order Placed'
                        : isPaperMode
                        ? 'Executed in Paper'
                        : 'Executed in MT5'
                      : executingSetup
                      ? isPaperMode
                        ? 'Placing Paper Trade...'
                        : 'Submitting to MT5...'
                      : isPaperMode
                      ? `Execute ${briefingData.action} in Paper`
                      : `Execute ${briefingData.action} in MT5`}
                  </span>
                </button>
              )}
          </div>
        )}
      </div>
    </div>
  )
}
