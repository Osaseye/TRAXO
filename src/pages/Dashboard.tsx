import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts'
import type { IPriceLine, UTCTimestamp, Time, SeriesMarker } from 'lightweight-charts'
import { ChevronDown, X } from 'lucide-react'
import { useOnboardingStore } from '@/stores/useOnboardingStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import type { Timeframe } from '@/types'
import { getMarketRiskContext } from '@/lib/marketRisk'

type SymbolOption = 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD' | 'BTCUSDT' | 'ETHUSD'

type RiskLabel = 'Low' | 'Medium' | 'High'
type TradeAction = 'BUY' | 'SELL'

interface AnalysisSignal {
  id: string
  time: UTCTimestamp
  strategyId: string
  strategyLabel: string
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  risk: RiskLabel
  reason: string[]
}

interface TradeHistoryMarker {
  id: string
  time: UTCTimestamp
  pnl: 'WIN' | 'LOSS'
}

interface ManualSetup {
  time: UTCTimestamp
  entry: number
  action: TradeAction
  suggestedAction: TradeAction
  confidence: number
  risk: RiskLabel
  reason: string[]
  range: number
  digits: number
  generated: boolean
  sl: number | null
  tp: number | null
  rr: number
}

interface MoneyContext {
  riskBudget: number
  dailyLossCap: number
  todayLoss: number
  remainingDailyLoss: number
  slDistancePct: number
  suggestedPosition: number
  maxLossAtSL: number
  positionPctOfBalance: number
  capitalRisk: RiskLabel
}

const SYMBOLS: SymbolOption[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSDT', 'ETHUSD']
const TF_OPTIONS: Timeframe[] = ['1H', '4H', '1D']

const STRATEGY_LABELS: Record<string, string> = {
  'wick-rejection': 'Wick Rejection',
  breakout: 'Breakout',
  'order-block': 'Order Block',
  'supply-demand': 'Supply & Demand',
  'trend-following': 'Trend Following',
}

function seeded(seed: number) {
  let t = seed + 0x6d2b79f5
  return function rand() {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function intervalSeconds(tf: Timeframe) {
  if (tf === '1H') return 3600
  if (tf === '4H') return 14400
  return 86400
}

function basePrice(symbol: SymbolOption) {
  if (symbol === 'EURUSD') return 1.082
  if (symbol === 'GBPUSD') return 1.274
  if (symbol === 'USDJPY') return 155.4
  if (symbol === 'XAUUSD') return 2330
  if (symbol === 'BTCUSDT') return 67250
  return 3340
}

function priceDigits(symbol: SymbolOption) {
  if (symbol === 'USDJPY') return 3
  if (symbol === 'XAUUSD') return 2
  if (symbol === 'BTCUSDT' || symbol === 'ETHUSD') return 1
  return 5
}

function generateCandles(symbol: SymbolOption, timeframe: Timeframe, count = 220) {
  const now = Math.floor(Date.now() / 1000)
  const step = intervalSeconds(timeframe)
  const rand = seeded(hash(`${symbol}:${timeframe}:candles`))
  const digits = priceDigits(symbol)
  const bars: Array<{
    time: UTCTimestamp
    open: number
    high: number
    low: number
    close: number
  }> = []

  let px = basePrice(symbol)
  const vol = symbol === 'BTCUSDT' ? 0.009 : symbol === 'ETHUSD' ? 0.0075 : symbol === 'XAUUSD' ? 0.003 : 0.0012

  for (let i = count; i >= 0; i--) {
    const drift = (rand() - 0.48) * vol
    const open = px
    const close = px * (1 + drift)
    const wickScale = px * (vol * 0.6)
    const high = Math.max(open, close) + rand() * wickScale
    const low = Math.min(open, close) - rand() * wickScale

    bars.push({
      time: (now - i * step) as UTCTimestamp,
      open: Number(open.toFixed(digits)),
      high: Number(high.toFixed(digits)),
      low: Number(low.toFixed(digits)),
      close: Number(close.toFixed(digits)),
    })
    px = close
  }

  return bars
}

function buildReasons(strategyId: string, direction: 'BUY' | 'SELL') {
  const dirWord = direction === 'BUY' ? 'bullish' : 'bearish'
  if (strategyId === 'wick-rejection') {
    return [
      `Long ${direction === 'BUY' ? 'lower' : 'upper'} wick rejection confirmed on candle close`,
      `${dirWord} close position inside range supports continuation`,
      'Confluence zone respected with clean structure retest',
    ]
  }
  if (strategyId === 'breakout') {
    return [
      `Range break with strong ${dirWord} body close`,
      'Breakout leg holds above key range boundary after retest',
      'Momentum profile supports follow-through into measured move',
    ]
  }
  if (strategyId === 'order-block') {
    return [
      'Institutional block retest produced immediate reaction candle',
      `${dirWord} displacement confirms order-flow imbalance`,
      'Entry aligns with protected liquidity zone and trend bias',
    ]
  }
  if (strategyId === 'supply-demand') {
    return [
      'Fresh zone touch with strong response at boundary',
      'Impulse profile from zone remains valid and unmitigated',
      `${dirWord} rejection supports continuation to next target zone`,
    ]
  }
  return [
    'Trend filter remains aligned with active directional bias',
    `${dirWord} continuation trigger confirmed after pullback`,
    'Momentum and structure conditions remain in sync for entry',
  ]
}

function createSignalsForStrategy(
  candles: Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }>,
  symbol: SymbolOption,
  strategyId: string,
  pointShift = 0,
  marketPenalty = 0
) {
  const rand = seeded(hash(`${symbol}:${strategyId}:signals`))
  const digits = priceDigits(symbol)
  const strategyLabel = STRATEGY_LABELS[strategyId] ?? strategyId
  const points = [150, 168, 186, 203]
    .map((p, i) => p + ((pointShift + i) % 5))
    .filter((p) => p < candles.length - 2)

  return points.map((idx, i) => {
    const c = candles[idx]
    const direction: 'BUY' | 'SELL' = c.close >= c.open ? 'BUY' : 'SELL'
    const range = Math.max(c.high - c.low, c.close * 0.0006)
    const entry = c.close
    const slGap = range * (0.8 + rand() * 0.7)
    const rr = Number((1.8 + rand() * 0.9).toFixed(1))
    const tpGap = slGap * rr
    const sl = direction === 'BUY' ? entry - slGap : entry + slGap
    const tp = direction === 'BUY' ? entry + tpGap : entry - tpGap
    const confidence = Math.max(0, Number((72 + rand() * 20).toFixed(0)) - marketPenalty)
    const risk: RiskLabel = confidence >= 85 ? 'Low' : confidence >= 78 ? 'Medium' : 'High'

    return {
      id: `sig-${strategyId}-${i}-${c.time}`,
      time: c.time,
      strategyId,
      strategyLabel,
      direction,
      entry: Number(entry.toFixed(digits)),
      sl: Number(sl.toFixed(digits)),
      tp: Number(tp.toFixed(digits)),
      rr,
      confidence,
      risk,
      reason: [
        `${strategyLabel} selected this setup based on live structure context`,
        ...buildReasons(strategyId, direction),
      ],
    } satisfies AnalysisSignal
  })
}

function createSignals(
  candles: Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }>,
  symbol: SymbolOption,
  strategyIds: string[],
  marketPenalty = 0
) {
  const merged = strategyIds.flatMap((strategyId, idx) =>
    createSignalsForStrategy(candles, symbol, strategyId, idx * 2, marketPenalty)
  )

  return merged.sort((a, b) => Number(a.time) - Number(b.time))
}

function riskFromConfidence(confidence: number): RiskLabel {
  if (confidence >= 85) return 'Low'
  if (confidence >= 77) return 'Medium'
  return 'High'
}

function buildMoneyContext(
  balance: number,
  riskPerTradePct: number,
  maxDailyLossPct: number,
  todayLoss: number,
  consecutiveLosses: number,
  todayTrades: number,
  entry: number,
  sl: number
): MoneyContext {
  const safeBalance = Math.max(balance, 0)
  const riskBudget = safeBalance * (Math.max(riskPerTradePct, 0) / 100)
  const dailyLossCap = safeBalance * (Math.max(maxDailyLossPct, 0) / 100)
  const remainingDailyLoss = Math.max(0, dailyLossCap - todayLoss)
  const slDistancePct = entry > 0 ? Math.abs(entry - sl) / entry : 0

  // No leverage assumption for now: cap suggested position to available balance.
  let behaviorFactor = 1
  if (consecutiveLosses >= 2) behaviorFactor *= 0.8
  if (consecutiveLosses >= 4) behaviorFactor *= 0.65
  if (todayTrades >= 5) behaviorFactor *= 0.85
  if (todayTrades >= 7) behaviorFactor *= 0.7

  const adjustedRiskBudget = riskBudget * behaviorFactor
  const rawPosition = slDistancePct > 0 ? adjustedRiskBudget / slDistancePct : 0
  const maxDeployPct = 0.25
  const maxByBalancePolicy = safeBalance * maxDeployPct
  const suggestedPosition = Math.min(rawPosition, safeBalance, maxByBalancePolicy)
  const maxLossAtSL = suggestedPosition * slDistancePct
  const positionPctOfBalance = safeBalance > 0 ? (suggestedPosition / safeBalance) * 100 : 0

  let capitalRisk: RiskLabel = 'Low'
  if (remainingDailyLoss <= 0 || maxLossAtSL > remainingDailyLoss * 0.9) {
    capitalRisk = 'High'
  } else if (maxLossAtSL > remainingDailyLoss * 0.55) {
    capitalRisk = 'Medium'
  }

  return {
    riskBudget: adjustedRiskBudget,
    dailyLossCap,
    todayLoss,
    remainingDailyLoss,
    slDistancePct,
    suggestedPosition,
    maxLossAtSL,
    positionPctOfBalance,
    capitalRisk,
  }
}

function generateLevels(entry: number, action: TradeAction, range: number, digits: number) {
  const slGap = range * 1.15
  const rr = 2.2
  const tpGap = slGap * rr
  const sl = action === 'BUY' ? entry - slGap : entry + slGap
  const tp = action === 'BUY' ? entry + tpGap : entry - tpGap
  return {
    sl: Number(sl.toFixed(digits)),
    tp: Number(tp.toFixed(digits)),
    rr,
  }
}

export default function Dashboard() {
  const { plan, selectedStrategyId, selectedStrategyIds } = useOnboardingStore()
  const {
    accountBalance,
    riskPerTradePct,
    maxDailyLossPct,
    journal,
    logSuggestionDecision,
    setJournalOutcome,
  } = useTradingContextStore()
  const activeStrategyIds = useMemo(() => {
    if (plan === 'pro') {
      const picked = selectedStrategyIds.filter((id) => Boolean(STRATEGY_LABELS[id]))
      return picked.length > 0 ? picked.slice(0, 5) : [selectedStrategyId]
    }
    return [selectedStrategyId]
  }, [plan, selectedStrategyId, selectedStrategyIds])

  const strategyLabel =
    plan === 'pro' && activeStrategyIds.length > 1
      ? `Multi-Strategy (${activeStrategyIds.length})`
      : STRATEGY_LABELS[activeStrategyIds[0]] ?? 'Wick Rejection'
  const [symbol, setSymbol] = useState<SymbolOption>('EURUSD')
  const [timeframe, setTimeframe] = useState<Timeframe>('4H')
  const [loading, setLoading] = useState(true)
  const [candles, setCandles] = useState<ReturnType<typeof generateCandles>>([])
  const [signals, setSignals] = useState<AnalysisSignal[]>([])
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null)
  const [lockedSignalId, setLockedSignalId] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 24, y: 120 })
  const [manualSetup, setManualSetup] = useState<ManualSetup | null>(null)
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)
  const [draggingPopup, setDraggingPopup] = useState(false)
  const [dismissedNoticeKeys, setDismissedNoticeKeys] = useState<string[]>([])
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null)
  const entryLineRef = useRef<IPriceLine | null>(null)
  const slLineRef = useRef<IPriceLine | null>(null)
  const tpLineRef = useRef<IPriceLine | null>(null)
  const manualEntryLineRef = useRef<IPriceLine | null>(null)
  const manualSLLineRef = useRef<IPriceLine | null>(null)
  const manualTPLineRef = useRef<IPriceLine | null>(null)

  const hoveredSignal = useMemo(
    () => signals.find((s) => s.id === hoveredSignalId) ?? null,
    [signals, hoveredSignalId]
  )

  const lockedSignal = useMemo(
    () => signals.find((s) => s.id === lockedSignalId) ?? null,
    [signals, lockedSignalId]
  )

  const activeSignal = lockedSignal ?? hoveredSignal
  const marketRiskContext = useMemo(
    () => getMarketRiskContext(symbol, timeframe, activeStrategyIds.length),
    [symbol, timeframe, activeStrategyIds.length]
  )

  const todayLoss = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return journal
      .filter((j) => j.createdAt >= start.getTime() && j.outcome === 'loss')
      .reduce((sum, j) => sum + j.riskAmount, 0)
  }, [journal])

  const todayTakenCount = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return journal.filter((j) => j.createdAt >= start.getTime() && j.taken).length
  }, [journal])

  const consecutiveLosses = useMemo(() => {
    const sorted = [...journal]
      .filter((j) => j.taken && (j.outcome === 'win' || j.outcome === 'loss' || j.outcome === 'breakeven'))
      .sort((a, b) => b.createdAt - a.createdAt)

    let count = 0
    for (const j of sorted) {
      if (j.outcome === 'loss') {
        count++
      } else {
        break
      }
    }
    return count
  }, [journal])

  const journalMarkers = useMemo(() => {
    return journal
      .filter((j) => j.symbol === symbol && j.timeframe === timeframe && (j.outcome === 'win' || j.outcome === 'loss' || j.outcome === 'breakeven'))
      .slice(0, 12)
      .map((j) => ({
        id: `hist-${j.id}`,
        time: j.createdAt ? (Math.floor(j.createdAt / 1000) as UTCTimestamp) : (Math.floor(Date.now() / 1000) as UTCTimestamp),
        pnl: j.outcome === 'loss' ? 'LOSS' : 'WIN',
      })) satisfies TradeHistoryMarker[]
  }, [journal, symbol, timeframe])

  const lockedSuggestionKey = lockedSignal ? `auto:${symbol}:${timeframe}:${lockedSignal.id}` : null
  const lockedJournal = useMemo(
    () => (lockedSuggestionKey ? journal.find((j) => j.suggestionKey === lockedSuggestionKey) ?? null : null),
    [journal, lockedSuggestionKey]
  )

  const lockedMoneyContext = useMemo(() => {
    if (!lockedSignal) return null
    return buildMoneyContext(accountBalance, riskPerTradePct, maxDailyLossPct, todayLoss, consecutiveLosses, todayTakenCount, lockedSignal.entry, lockedSignal.sl)
  }, [lockedSignal, accountBalance, riskPerTradePct, maxDailyLossPct, todayLoss, consecutiveLosses, todayTakenCount])

  const hoveredMoneyContext = useMemo(() => {
    if (!hoveredSignal || lockedSignal) return null
    return buildMoneyContext(accountBalance, riskPerTradePct, maxDailyLossPct, todayLoss, consecutiveLosses, todayTakenCount, hoveredSignal.entry, hoveredSignal.sl)
  }, [hoveredSignal, lockedSignal, accountBalance, riskPerTradePct, maxDailyLossPct, todayLoss, consecutiveLosses, todayTakenCount])

  const manualSuggestionKey = manualSetup ? `manual:${symbol}:${timeframe}:${manualSetup.time}:${manualSetup.action}` : null
  const manualJournal = useMemo(
    () => (manualSuggestionKey ? journal.find((j) => j.suggestionKey === manualSuggestionKey) ?? null : null),
    [journal, manualSuggestionKey]
  )

  const manualMoneyContext = useMemo(() => {
    if (!manualSetup || !manualSetup.generated || manualSetup.sl == null) return null
    return buildMoneyContext(accountBalance, riskPerTradePct, maxDailyLossPct, todayLoss, consecutiveLosses, todayTakenCount, manualSetup.entry, manualSetup.sl)
  }, [manualSetup, accountBalance, riskPerTradePct, maxDailyLossPct, todayLoss, consecutiveLosses, todayTakenCount])

  const warnings = useMemo(() => {
    const items: string[] = []
    if (consecutiveLosses >= 4) {
      items.push(`This is your ${consecutiveLosses}th consecutive loss. Consider reducing risk or pausing.`)
    }
    if (todayTakenCount >= 6) {
      items.push(`You have taken ${todayTakenCount} trades today. Want to take a short break?`)
    }
    if (lockedMoneyContext && lockedMoneyContext.remainingDailyLoss <= 0) {
      items.push('Daily loss limit reached. New risk suggestions are now constrained.')
    }
    return items
  }, [consecutiveLosses, todayTakenCount, lockedMoneyContext])

  const alertNotices = useMemo(() => {
    const notices: Array<{ id: string; title: string; body: string }> = []
    if (marketRiskContext.riskLevel !== 'Low') {
      notices.push({
        id: `market-risk:${symbol}:${timeframe}`,
        title: marketRiskContext.title,
        body: marketRiskContext.userFacingWarning,
      })
    }

    warnings.forEach((warning) => {
      notices.push({
        id: `warning:${symbol}:${timeframe}:${hash(warning)}`,
        title: 'Trade caution',
        body: warning,
      })
    })

    return notices.filter((notice) => !dismissedNoticeKeys.includes(notice.id))
  }, [warnings, marketRiskContext, symbol, timeframe, dismissedNoticeKeys])

  const dismissNotice = (noticeId: string) => {
    setDismissedNoticeKeys((prev) => (prev.includes(noticeId) ? prev : [...prev, noticeId]))
  }

  useEffect(() => {
    if (!chartContainerRef.current) return

    const initialWidth = chartContainerRef.current.clientWidth || 1200
    const initialHeight = chartContainerRef.current.clientHeight || 700

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#070709' },
        textColor: '#475569',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#0d1117' },
        horzLines: { color: '#0d1117' },
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
      autoSize: false,
      width: initialWidth,
      height: initialHeight,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (!chartContainerRef.current || !chartRef.current) return
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      })
    })

    ro.observe(chartContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setHoveredSignalId(null)
    setLockedSignalId(null)
    setManualSetup(null)
    const timer = setTimeout(() => {
      const generatedCandles = generateCandles(symbol, timeframe)
      const generatedSignals = createSignals(generatedCandles, symbol, activeStrategyIds, marketRiskContext.confidencePenalty)
      setCandles(generatedCandles)
      setSignals(generatedSignals)
      setLoading(false)
    }, 1400)

    return () => clearTimeout(timer)
  }, [symbol, timeframe, activeStrategyIds, marketRiskContext.confidencePenalty])

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    seriesRef.current.setData(candles)
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    if (!seriesRef.current) return

    const suggestionMarkers: SeriesMarker<UTCTimestamp>[] = signals.map((s) => ({
      time: s.time,
      position: s.direction === 'BUY' ? 'belowBar' : 'aboveBar',
      shape: s.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
      color: s.direction === 'BUY' ? '#22c55e' : '#ef4444',
      text: `${s.strategyLabel.split(' ')[0]} ${s.direction} ${s.confidence}%`,
    }))

    const historicalMarkers: SeriesMarker<UTCTimestamp>[] = journalMarkers.map((m) => ({
      time: m.time,
      position: 'inBar',
      shape: 'circle',
      color: '#64748b',
      text: m.pnl,
    }))

    createSeriesMarkers(
      seriesRef.current,
      [...suggestionMarkers, ...historicalMarkers]
    )
  }, [signals, journalMarkers])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || signals.length === 0) return

    const threshold = intervalSeconds(timeframe) * 0.7
    const handleMove = (param: { time?: Time }) => {
      if (!param.time || typeof param.time !== 'number') {
        if (!lockedSignalId) setHoveredSignalId(null)
        return
      }

      let closest: AnalysisSignal | null = null
      let minDistance = Number.MAX_SAFE_INTEGER
      for (const s of signals) {
        const d = Math.abs(s.time - (param.time as number))
        if (d < minDistance) {
          minDistance = d
          closest = s
        }
      }

      if (closest && minDistance <= threshold) {
        setHoveredSignalId(closest.id)
      } else {
        if (!lockedSignalId) setHoveredSignalId(null)
      }
    }

    chart.subscribeCrosshairMove(handleMove)
    return () => chart.unsubscribeCrosshairMove(handleMove)
  }, [signals, timeframe, lockedSignalId])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return

    const handleClick = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (!param.point) return

      const clickedTime = typeof param.time === 'number' ? (param.time as UTCTimestamp) : null
      const threshold = intervalSeconds(timeframe) * 0.7

      if (clickedTime != null) {
        let nearestSignal: AnalysisSignal | null = null
        let nearestSignalDistance = Number.MAX_SAFE_INTEGER
        for (const s of signals) {
          const d = Math.abs(s.time - clickedTime)
          if (d < nearestSignalDistance) {
            nearestSignalDistance = d
            nearestSignal = s
          }
        }

        if (nearestSignal && nearestSignalDistance <= threshold) {
          setLockedSignalId(nearestSignal.id)
          setHoveredSignalId(nearestSignal.id)
          setManualSetup(null)
          return
        }

        let nearestHistoryDistance = Number.MAX_SAFE_INTEGER
        for (const h of journalMarkers) {
          const d = Math.abs(h.time - clickedTime)
          if (d < nearestHistoryDistance) nearestHistoryDistance = d
        }

        // Previous trades are reference-only and cannot be used as fresh entry anchors.
        if (nearestHistoryDistance <= threshold) {
          return
        }
      }

      const entryRaw = series.coordinateToPrice(param.point.y)
      if (entryRaw == null) return

      const digits = priceDigits(symbol)
      const entry = Number(entryRaw.toFixed(digits))
      const fallbackTime = candles[candles.length - 1]?.time ?? (Math.floor(Date.now() / 1000) as UTCTimestamp)
      const anchorTime = clickedTime ?? fallbackTime

      let nearest = candles[0]
      for (const c of candles) {
        if (!nearest || Math.abs(c.time - anchorTime) < Math.abs(nearest.time - anchorTime)) {
          nearest = c
        }
      }

      const suggestedAction: TradeAction = nearest && nearest.close >= nearest.open ? 'BUY' : 'SELL'
      const confidenceSeed = 72 + (hash(`${symbol}:${timeframe}:${anchorTime}`) % 21)
      const confidence = Number(confidenceSeed.toFixed(0))
      const risk = riskFromConfidence(confidence)
      const range = Math.max((nearest?.high ?? entry) - (nearest?.low ?? entry), entry * 0.001)

      const reason = [
        `${strategyLabel} sees structure interest around the selected entry`,
        `Market context suggests ${suggestedAction} bias with ${confidence}% confidence`,
        marketRiskContext.summary,
        'Confirm direction, then generate SL/TP based on this exact point',
      ]

      setHoveredSignalId(null)
      setLockedSignalId(null)
      setManualSetup({
        time: anchorTime,
        entry,
        action: suggestedAction,
        suggestedAction,
        confidence,
        risk,
        reason,
        range,
        digits,
        generated: false,
        sl: null,
        tp: null,
        rr: 0,
      })
    }

    chart.subscribeClick(handleClick)
    return () => chart.unsubscribeClick(handleClick)
  }, [candles, symbol, strategyLabel, timeframe, signals, journalMarkers, marketRiskContext.summary])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current)
      entryLineRef.current = null
    }
    if (slLineRef.current) {
      series.removePriceLine(slLineRef.current)
      slLineRef.current = null
    }
    if (tpLineRef.current) {
      series.removePriceLine(tpLineRef.current)
      tpLineRef.current = null
    }

    if (!activeSignal) return

    entryLineRef.current = series.createPriceLine({
      price: activeSignal.entry,
      color: '#cbd5e1',
      lineWidth: 1,
      lineStyle: LineStyle.SparseDotted,
      axisLabelVisible: true,
      title: lockedSignal ? 'Entry · Locked' : 'Entry',
    })

    slLineRef.current = series.createPriceLine({
      price: activeSignal.sl,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'SL',
    })

    tpLineRef.current = series.createPriceLine({
      price: activeSignal.tp,
      color: '#22c55e',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'TP',
    })
  }, [activeSignal, lockedSignal])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    if (manualEntryLineRef.current) {
      series.removePriceLine(manualEntryLineRef.current)
      manualEntryLineRef.current = null
    }
    if (manualSLLineRef.current) {
      series.removePriceLine(manualSLLineRef.current)
      manualSLLineRef.current = null
    }
    if (manualTPLineRef.current) {
      series.removePriceLine(manualTPLineRef.current)
      manualTPLineRef.current = null
    }

    if (!manualSetup) return

    manualEntryLineRef.current = series.createPriceLine({
      price: manualSetup.entry,
      color: '#d1d5db',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Entry · ${manualSetup.action}`,
    })

    if (!manualSetup.generated || manualSetup.sl == null || manualSetup.tp == null) return

    manualSLLineRef.current = series.createPriceLine({
      price: manualSetup.sl,
      color: '#ef4444',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Stop Loss',
    })

    manualTPLineRef.current = series.createPriceLine({
      price: manualSetup.tp,
      color: '#22c55e',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Take Profit',
    })
  }, [manualSetup])

  const generateManualSLTP = () => {
    setManualSetup((prev) => {
      if (!prev) return prev
      const generated = generateLevels(prev.entry, prev.action, prev.range, prev.digits)
      return {
        ...prev,
        generated: true,
        sl: generated.sl,
        tp: generated.tp,
        rr: generated.rr,
      }
    })
  }

  const updateManualValue = (field: 'entry' | 'sl' | 'tp', raw: string) => {
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    setManualSetup((prev) => {
      if (!prev) return prev
      const next: ManualSetup = { ...prev, [field]: Number(parsed.toFixed(prev.digits)) } as ManualSetup
      if (next.generated && next.sl != null && next.tp != null) {
        const riskDist = Math.abs(next.entry - next.sl)
        const rewardDist = Math.abs(next.tp - next.entry)
        next.rr = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 0
      }
      return next
    })
  }

  const actionBadgeTone = (risk: RiskLabel) => {
    if (risk === 'Low') return { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' }
    if (risk === 'Medium') return { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' }
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' }
  }

  const fmtUSD = (n: number) =>
    `$${n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })}`

  const saveLockedFeedback = (taken: boolean) => {
    if (!lockedSignal || !lockedSuggestionKey || !lockedMoneyContext) return
    logSuggestionDecision({
      suggestionKey: lockedSuggestionKey,
      symbol,
      timeframe,
      strategy: lockedSignal.strategyLabel,
      action: lockedSignal.direction,
      entry: lockedSignal.entry,
      sl: lockedSignal.sl,
      tp: lockedSignal.tp,
      confidence: lockedSignal.confidence,
      risk: lockedMoneyContext.capitalRisk,
      suggestedPosition: lockedMoneyContext.suggestedPosition,
      riskAmount: lockedMoneyContext.maxLossAtSL,
      taken,
      outcome: taken ? 'pending' : 'skipped',
    })
  }

  const saveManualFeedback = (taken: boolean) => {
    if (!manualSetup || !manualSuggestionKey || !manualMoneyContext || manualSetup.sl == null || manualSetup.tp == null) return
    logSuggestionDecision({
      suggestionKey: manualSuggestionKey,
      symbol,
      timeframe,
      strategy: strategyLabel,
      action: manualSetup.action,
      entry: manualSetup.entry,
      sl: manualSetup.sl,
      tp: manualSetup.tp,
      confidence: manualSetup.confidence,
      risk: manualMoneyContext.capitalRisk,
      suggestedPosition: manualMoneyContext.suggestedPosition,
      riskAmount: manualMoneyContext.maxLossAtSL,
      taken,
      outcome: taken ? 'pending' : 'skipped',
    })
  }

  const getPopupWidth = () => Math.min(480, Math.max(320, window.innerWidth * 0.92))
  const clampPopupPosition = (x: number, y: number) => {
    const width = getPopupWidth()
    const maxX = Math.max(8, window.innerWidth - width - 8)
    const maxY = Math.max(88, window.innerHeight - 110)
    return {
      x: Math.max(8, Math.min(x, maxX)),
      y: Math.max(62, Math.min(y, maxY)),
    }
  }

  useEffect(() => {
    if (!manualSetup) {
      setPopupPosition(null)
      setDraggingPopup(false)
      return
    }
    if (popupPosition) return
    const width = getPopupWidth()
    const x = window.innerWidth - width - (window.innerWidth < 640 ? 8 : 16)
    const y = window.innerWidth < 640 ? 70 : 84
    setPopupPosition(clampPopupPosition(x, y))
  }, [manualSetup, popupPosition])

  useEffect(() => {
    if (!draggingPopup) return

    const move = (e: PointerEvent) => {
      e.preventDefault()
      const next = clampPopupPosition(e.clientX - dragOffsetRef.current.x, e.clientY - dragOffsetRef.current.y)
      setPopupPosition(next)
    }

    const stop = () => setDraggingPopup(false)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [draggingPopup])

  return (
    <div className="min-h-screen h-screen bg-[#070709] text-white flex flex-col overflow-hidden pb-20 lg:pb-0">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="hidden sm:inline-flex items-center h-8 px-2.5 sm:px-3 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1]">
            Balance {fmtUSD(accountBalance)}
          </span>

          <div className="relative">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as SymbolOption)}
              className="appearance-none h-9 pl-3 pr-8 rounded-lg bg-[#0b0f17] border border-white/[0.08] text-[12px] font-semibold text-white focus:outline-none focus:border-[#3b82f6]/50"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b5563] pointer-events-none" />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-[#0b0f17] border border-white/[0.08] p-1">
            {TF_OPTIONS.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors"
                style={{
                  background: timeframe === tf ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: timeframe === tf ? '#bfdbfe' : '#4b5563',
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden xl:inline-flex items-center h-8 px-3 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1]">
            {strategyLabel} · Locked
          </span>

          <span className="hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1] text-[10px] font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9ca3af] animate-pulse" />
            Analyst Mode
          </span>

          <DesktopWorkspaceNav />
        </div>
      </header>

      <div className="sm:hidden px-3 py-2 border-b border-white/[0.04] bg-[#070709]/95">
        <span className="inline-flex items-center h-7 px-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1]">
          Balance {fmtUSD(accountBalance)}
        </span>
      </div>

      <div
        className="relative flex-1 min-h-0"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }}
      >
        <div ref={chartContainerRef} className="absolute inset-0" />

        <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 px-3 py-2 rounded-lg bg-[#0d1117]/90 border border-white/[0.08] text-[11px] text-[#94a3b8] pointer-events-none">
          Hover TRAXO suggestions to preview. Click one to lock it. Previous trades (gray dots) are reference-only.
        </div>

        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2 pointer-events-none">
          <span className="px-2.5 py-1 rounded-md bg-[#0d1117]/95 border border-white/[0.08] text-[11px] text-[#e5e7eb] font-semibold">
            {symbol} · {timeframe}
          </span>
          {loading && (
            <span className="px-2.5 py-1 rounded-md bg-[#3b82f6]/10 border border-[#3b82f6]/25 text-[11px] text-[#93c5fd] font-medium animate-pulse">
              Analyzing market...
            </span>
          )}
        </div>

        {alertNotices.length > 0 && (
          <div className="absolute top-14 right-3 sm:top-16 sm:right-4 z-20 flex flex-wrap justify-end gap-2 max-w-[calc(100vw-1.5rem)]">
            {alertNotices.map((notice) => (
              <div
                key={notice.id}
                className="w-[min(92vw,18rem)] rounded-lg border border-white/[0.08] bg-[#0b1118]/95 p-3 shadow-2xl backdrop-blur"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#93c5fd] font-semibold truncate">{notice.title}</p>
                    <p className="mt-1 text-[11px] text-[#cbd5e1] leading-relaxed">{notice.body}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss notice"
                    onClick={() => dismissNotice(notice.id)}
                    className="shrink-0 mt-0.5 text-[#64748b] hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                {notice.id.startsWith('market-risk:') && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[#94a3b8]">
                      <span>{marketRiskContext.marketType.toUpperCase()}</span>
                      <span className="font-semibold text-white">-{marketRiskContext.confidencePenalty}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {marketRiskContext.drivers.slice(0, 3).map((driver) => (
                        <span key={driver} className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[#94a3b8]">
                          {driver}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {hoveredSignal && !lockedSignal && !loading && (
          <div
            className="absolute z-20 w-[300px] sm:w-[360px] max-w-[calc(100vw-0.9rem)] rounded-xl bg-[#0d1117]/95 border border-white/[0.1] shadow-2xl p-4 pointer-events-none"
            style={{
              left: Math.max(6, Math.min(mouse.x + 16, window.innerWidth - 368)),
              top: Math.max(66, Math.min(mouse.y - 10, window.innerHeight - 320)),
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    background: hoveredSignal.direction === 'BUY' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: hoveredSignal.direction === 'BUY' ? '#22c55e' : '#ef4444',
                  }}
                >
                  {hoveredSignal.direction}
                </span>
                <span className="text-[13px] font-bold text-white shrink-0">{symbol}</span>
              </div>

              <span className="text-[12px] font-bold text-[#3b82f6] shrink-0">{hoveredSignal.confidence}%</span>
            </div>

            <div className="flex items-center gap-1.5 mb-3 whitespace-nowrap overflow-hidden">
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.14] bg-[#0b0f17] text-[#cbd5e1] truncate">
                {hoveredSignal.strategyLabel}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border shrink-0"
                style={{
                  color:
                    hoveredSignal.risk === 'Low'
                      ? '#22c55e'
                      : hoveredSignal.risk === 'Medium'
                      ? '#f59e0b'
                      : '#ef4444',
                  borderColor:
                    hoveredSignal.risk === 'Low'
                      ? 'rgba(34,197,94,0.25)'
                      : hoveredSignal.risk === 'Medium'
                      ? 'rgba(245,158,11,0.25)'
                      : 'rgba(239,68,68,0.25)',
                  background:
                    hoveredSignal.risk === 'Low'
                      ? 'rgba(34,197,94,0.08)'
                      : hoveredSignal.risk === 'Medium'
                      ? 'rgba(245,158,11,0.08)'
                      : 'rgba(239,68,68,0.08)',
                }}
              >
                {hoveredSignal.risk} Risk
              </span>
            </div>

            <div className="grid grid-cols-4 border border-white/[0.06] rounded-lg overflow-hidden mb-3">
              {[
                ['Entry', hoveredSignal.entry, '#e5e7eb'],
                ['SL', hoveredSignal.sl, '#ef4444'],
                ['TP', hoveredSignal.tp, '#22c55e'],
                ['R:R', hoveredSignal.rr, '#e5e7eb'],
              ].map(([k, v, color]) => (
                <div key={String(k)} className="px-2 py-2 bg-[#0b0f17] border-r border-white/[0.04] last:border-r-0 text-center">
                  <div className="text-[9px] text-[#475569] mb-0.5">{k}</div>
                  <div className="text-[10px] font-bold tabular-nums" style={{ color: String(color) }}>
                    {typeof v === 'number' ? v : String(v)}
                  </div>
                </div>
              ))}
            </div>

            {hoveredMoneyContext && (
              <div className="rounded-lg border border-white/[0.06] bg-[#0b0f17] p-2.5 mb-3">
                <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
                  <span>Suggested amount</span>
                  <span className="text-white font-semibold">{fmtUSD(hoveredMoneyContext.suggestedPosition)}</span>
                </div>
              </div>
            )}

            <div>
              <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">
                Why {hoveredSignal.strategyLabel} picked this signal
              </div>
              <div className="space-y-1.5">
                {hoveredSignal.reason.map((r, i) => (
                  <p key={i} className="text-[11px] text-[#94a3b8] leading-relaxed">
                    • {r}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {lockedSignal && !loading && (
          <div className="absolute z-30 left-3 top-16 sm:left-4 sm:top-20 w-[320px] sm:w-[360px] max-w-[calc(100vw-0.9rem)] rounded-xl bg-[#0d1117]/95 border border-white/[0.12] shadow-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">Locked TRAXO Suggestion</div>
                <div className="text-[13px] font-semibold text-white mt-1">{lockedSignal.direction} · {symbol}</div>
                <div className="flex items-center gap-1.5 mt-1 whitespace-nowrap overflow-hidden">
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.14] bg-[#0b0f17] text-[#cbd5e1] truncate">
                    {lockedSignal.strategyLabel}
                  </span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full border shrink-0"
                    style={{
                      color:
                        lockedSignal.risk === 'Low'
                          ? '#22c55e'
                          : lockedSignal.risk === 'Medium'
                          ? '#f59e0b'
                          : '#ef4444',
                      borderColor:
                        lockedSignal.risk === 'Low'
                          ? 'rgba(34,197,94,0.25)'
                          : lockedSignal.risk === 'Medium'
                          ? 'rgba(245,158,11,0.25)'
                          : 'rgba(239,68,68,0.25)',
                      background:
                        lockedSignal.risk === 'Low'
                          ? 'rgba(34,197,94,0.08)'
                          : lockedSignal.risk === 'Medium'
                          ? 'rgba(245,158,11,0.08)'
                          : 'rgba(239,68,68,0.08)',
                    }}
                  >
                    {lockedSignal.risk} Risk
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setLockedSignalId(null)
                  setHoveredSignalId(null)
                }}
                className="text-[11px] text-[#6b7280] hover:text-white transition-colors"
              >
                Unlock
              </button>
            </div>

            <div className="grid grid-cols-4 border border-white/[0.08] rounded-lg overflow-hidden">
              {[
                ['Entry', lockedSignal.entry, '#e5e7eb'],
                ['SL', lockedSignal.sl, '#ef4444'],
                ['TP', lockedSignal.tp, '#22c55e'],
                ['R:R', lockedSignal.rr, '#e5e7eb'],
              ].map(([k, v, color]) => (
                <div key={String(k)} className="px-2 py-2 bg-[#0b0f17] border-r border-white/[0.04] last:border-r-0 text-center">
                  <div className="text-[9px] text-[#475569] mb-0.5">{k}</div>
                  <div className="text-[10px] font-bold tabular-nums" style={{ color: String(color) }}>
                    {typeof v === 'number' ? v : String(v)}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#cbd5e1]">Confidence</span>
              <span className="text-[11px] font-semibold text-[#93c5fd]">{lockedSignal.confidence}%</span>
            </div>

            {lockedMoneyContext && (
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">Money Context</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#94a3b8]">Suggested trade amount</span>
                  <span className="text-white font-semibold">{fmtUSD(lockedMoneyContext.suggestedPosition)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#94a3b8]">Loss at SL</span>
                  <span className="text-[#ef4444] font-semibold">{fmtUSD(lockedMoneyContext.maxLossAtSL)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#94a3b8]">Remaining daily loss budget</span>
                  <span className="text-white font-semibold">{fmtUSD(lockedMoneyContext.remainingDailyLoss)}</span>
                </div>
                <div className="text-[10px] text-[#64748b]">
                  Capital risk: <span className="text-[#cbd5e1] font-semibold">{lockedMoneyContext.capitalRisk}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {lockedSignal.reason.map((line, i) => (
                <p key={i} className="text-[11px] text-[#94a3b8] leading-relaxed">• {line}</p>
              ))}
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-2">
              <p className="text-[11px] text-[#cbd5e1]">Did you take this trade?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveLockedFeedback(true)}
                  className="h-8 px-3 rounded-md border border-white/[0.14] text-[11px] text-white hover:border-white/[0.25] transition-colors"
                >
                  Yes, took it
                </button>
                <button
                  onClick={() => saveLockedFeedback(false)}
                  className="h-8 px-3 rounded-md border border-white/[0.14] text-[11px] text-[#94a3b8] hover:text-white transition-colors"
                >
                  No, skipped
                </button>
              </div>

              {lockedJournal?.taken && lockedSuggestionKey && (
                <div className="pt-1 space-y-2">
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wider">Journal Outcome</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'win')} className="h-7 px-2.5 rounded-md border border-white/[0.12] text-[10px] text-[#22c55e]">Win</button>
                    <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'loss')} className="h-7 px-2.5 rounded-md border border-white/[0.12] text-[10px] text-[#ef4444]">Loss</button>
                    <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'breakeven')} className="h-7 px-2.5 rounded-md border border-white/[0.12] text-[10px] text-[#cbd5e1]">Breakeven</button>
                    <span className="text-[10px] text-[#94a3b8]">Current: {lockedJournal.outcome}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {manualSetup && !loading && (
          <div
            data-entry-popup="true"
            className="absolute z-30 w-[min(92vw,30rem)] max-h-[calc(100vh-8.25rem)] overflow-y-auto rounded-xl bg-[#0d1117]/95 border border-white/[0.12] shadow-2xl p-3 space-y-3 touch-pan-y"
            style={{ left: popupPosition?.x ?? 8, top: popupPosition?.y ?? 70 }}
          >
            <div
              className="flex items-start justify-between gap-2 cursor-move select-none"
              onPointerDown={(e) => {
                const card = (e.currentTarget.parentElement as HTMLDivElement | null)
                if (!card) return
                const rect = card.getBoundingClientRect()
                dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
                setDraggingPopup(true)
              }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">Entry Analysis</div>
                <div className="text-[13px] text-white font-semibold mt-1">{symbol} · {timeframe}</div>
                <div className="text-[11px] text-[#94a3b8] mt-0.5">Entry {manualSetup.entry.toFixed(manualSetup.digits)}</div>
                <div className="text-[10px] text-[#64748b] mt-1">Drag this header to move</div>
              </div>
              <button
                onClick={() => setManualSetup(null)}
                className="text-[11px] text-[#6b7280] hover:text-white transition-colors"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">

            <div className="col-span-1 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold mb-2">Action</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['BUY', 'SELL'] as const).map((action) => (
                  <button
                    key={action}
                    onClick={() =>
                      setManualSetup((prev) =>
                        prev
                          ? {
                              ...prev,
                              action,
                              generated: false,
                              sl: null,
                              tp: null,
                              rr: 0,
                            }
                          : prev
                      )
                    }
                    className="h-8 rounded-lg border text-[11px] font-semibold transition-colors"
                    style={{
                      borderColor: manualSetup.action === action ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.12)',
                      background: manualSetup.action === action ? 'rgba(59,130,246,0.14)' : '#0b0f17',
                      color: manualSetup.action === action ? '#dbeafe' : '#94a3b8',
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-1 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#cbd5e1] font-semibold">System opinion</span>
                <span className="text-[11px] text-[#93c5fd] font-bold">{manualSetup.confidence}%</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.14] bg-[#0f172a] text-[#cbd5e1]">
                  Suggested: {manualSetup.suggestedAction}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full border"
                  style={actionBadgeTone(manualSetup.risk)}
                >
                  {manualSetup.risk} Risk
                </span>
              </div>
              <div className="space-y-1.5">
                {manualSetup.reason.map((line, i) => (
                  <p key={i} className="text-[11px] text-[#94a3b8] leading-relaxed">• {line}</p>
                ))}
              </div>

              {manualMoneyContext && (
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#94a3b8]">Suggested trade amount</span>
                    <span className="text-white font-semibold">{fmtUSD(manualMoneyContext.suggestedPosition)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#94a3b8]">Loss at SL</span>
                    <span className="text-[#ef4444] font-semibold">{fmtUSD(manualMoneyContext.maxLossAtSL)}</span>
                  </div>
                  <div className="text-[10px] text-[#64748b]">Capital risk: <span className="text-[#cbd5e1] font-semibold">{manualMoneyContext.capitalRisk}</span></div>
                </div>
              )}
            </div>

            {!manualSetup.generated && (
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-2.5 col-span-2">
                <p className="text-[11px] text-[#cbd5e1] mb-2">
                  Generate TradingView-style Stop Loss and Take Profit levels for this selected point?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={generateManualSLTP}
                    className="h-8 px-2.5 rounded-lg bg-[#111827] border border-white/[0.16] text-[11px] text-white font-semibold hover:border-white/[0.28] transition-colors"
                  >
                    Generate SL / TP
                  </button>
                  <button
                    onClick={() => setManualSetup((prev) => (prev ? { ...prev, generated: false, sl: null, tp: null, rr: 0 } : prev))}
                    className="h-8 px-2.5 rounded-lg border border-white/[0.12] text-[11px] text-[#94a3b8] hover:text-white transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}

            {manualSetup.generated && manualSetup.sl != null && manualSetup.tp != null && (
              <div className="rounded-lg border border-white/[0.1] bg-[#0b0f17] p-2.5 space-y-2.5 col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#e5e7eb]">Trade Plan Levels</span>
                  <span className="text-[11px] text-[#cbd5e1] font-semibold">R:R {manualSetup.rr.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="grid grid-cols-[60px_1fr] items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#9ca3af]">Entry</span>
                    <input
                      value={manualSetup.entry}
                      onChange={(e) => updateManualValue('entry', e.target.value)}
                      className="h-8 px-2 rounded-md bg-[#070709] border border-white/[0.12] text-[12px] text-white tabular-nums focus:outline-none focus:border-[#475569]"
                    />
                  </div>
                  <div className="grid grid-cols-[60px_1fr] items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#ef4444]">Stop Loss</span>
                    <input
                      value={manualSetup.sl}
                      onChange={(e) => updateManualValue('sl', e.target.value)}
                      className="h-8 px-2 rounded-md bg-[#070709] border border-[#ef4444]/40 text-[12px] text-white tabular-nums focus:outline-none focus:border-[#ef4444]/70"
                    />
                  </div>
                  <div className="grid grid-cols-[60px_1fr] items-center gap-2 col-span-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#22c55e]">Take Profit</span>
                    <input
                      value={manualSetup.tp}
                      onChange={(e) => updateManualValue('tp', e.target.value)}
                      className="h-8 px-2 rounded-md bg-[#070709] border border-[#22c55e]/40 text-[12px] text-white tabular-nums focus:outline-none focus:border-[#22c55e]/70"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-[#111827] overflow-hidden">
                    <div className="h-full w-[34%] bg-[#ef4444]/75" />
                  </div>
                  <div className="h-1.5 rounded-full bg-[#111827] overflow-hidden">
                    <div className="h-full w-[72%] bg-[#22c55e]/75" />
                  </div>
                  <p className="text-[10px] text-[#64748b]">SL and TP remain fully editable after generation.</p>
                </div>

                <button
                  onClick={generateManualSLTP}
                  className="h-8 px-3 rounded-md border border-white/[0.14] text-[11px] text-[#cbd5e1] hover:text-white hover:border-white/[0.25] transition-colors"
                >
                  Regenerate from selected entry
                </button>

                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  <p className="text-[11px] text-[#cbd5e1]">Did you take this trade?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => saveManualFeedback(true)} className="h-8 px-3 rounded-md border border-white/[0.14] text-[11px] text-white hover:border-white/[0.25]">Yes, took it</button>
                    <button onClick={() => saveManualFeedback(false)} className="h-8 px-3 rounded-md border border-white/[0.14] text-[11px] text-[#94a3b8] hover:text-white">No, skipped</button>
                  </div>
                  {manualJournal?.taken && manualSuggestionKey && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setJournalOutcome(manualSuggestionKey, 'win')} className="h-7 px-2.5 rounded-md border border-white/[0.12] text-[10px] text-[#22c55e]">Win</button>
                      <button onClick={() => setJournalOutcome(manualSuggestionKey, 'loss')} className="h-7 px-2.5 rounded-md border border-white/[0.12] text-[10px] text-[#ef4444]">Loss</button>
                      <button onClick={() => setJournalOutcome(manualSuggestionKey, 'breakeven')} className="h-7 px-2.5 rounded-md border border-white/[0.12] text-[10px] text-[#cbd5e1]">Breakeven</button>
                      <span className="text-[10px] text-[#94a3b8]">Current: {manualJournal.outcome}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
