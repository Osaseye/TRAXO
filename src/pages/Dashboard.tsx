import { useEffect, useMemo, useRef, useState } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'
import { ChevronDown, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useOnboardingStore } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { ChartPanel, type ChartPanelMarker, type ChartPanelActiveSignal, type ChartPanelManualSetup } from '@/components/dashboard/ChartPanel'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { getMarketRiskContext } from '@/lib/marketRisk'
import { getCandles, type Candle } from '@/lib/marketData'
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket'
import { runSignalsForStrategies, riskFromConfidence, priceDigits, type AnalysisSignal, type RiskLabel } from '@/lib/signalDetection'

type SymbolOption =
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'XAUUSD'
  | 'XAGUSD'
  | 'AUDUSD'
  | 'USDCAD'
  | 'USDCHF'
  | 'NZDUSD'
  | 'EURJPY'
  | 'GBPJPY'
  | 'EURGBP'
  | 'SPX500'
  | 'NAS100'
  | 'US30'
  | 'DE40'
  | 'UK100'
  | 'JP225'
  | 'FRA40'
  | 'AUS200'
  | 'WTI'
  | 'BRENT'
  | 'NATGAS'
  | 'BTCUSDT'
  | 'ETHUSD'
  | 'SOLUSDT'
  | 'XRPUSDT'
  | 'ADAUSDT'
  | 'DOGEUSDT'
  | 'BNBUSDT'
  | 'AAPL'
  | 'MSFT'
  | 'NVDA'
  | 'TSLA'
  | 'AMZN'
  | 'META'
  | 'GOOGL'
  | 'NFLX'
  | 'AMD'
  | 'COIN'
  | 'MSTR'
  | 'SMCI'
  | 'MNQ'

type TradeAction = 'BUY' | 'SELL'

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

const FX_SYMBOLS: SymbolOption[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP']
const METAL_SYMBOLS: SymbolOption[] = ['XAUUSD', 'XAGUSD']
const INDEX_SYMBOLS: SymbolOption[] = ['SPX500', 'NAS100', 'US30', 'DE40', 'UK100', 'JP225', 'FRA40', 'AUS200']
const ENERGY_SYMBOLS: SymbolOption[] = ['WTI', 'BRENT', 'NATGAS']
const CRYPTO_SYMBOLS: SymbolOption[] = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
const STOCK_SYMBOLS: SymbolOption[] = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
const FUTURES_SYMBOLS: SymbolOption[] = ['MNQ']

const STRATEGY_LABELS: Record<string, string> = {
  'wick-rejection': 'Wick Rejection',
  breakout: 'Breakout',
  'order-block': 'Order Block',
  'supply-demand': 'Supply & Demand',
  'trend-following': 'Trend Following',
}

function hash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
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
  const displayName = useAuthStore((s) => s.user?.displayName || s.user?.fullName || s.user?.email || 'Trader')
  const [searchParams] = useSearchParams()
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
  const symbol = useTradingContextStore((s) => s.chartSymbol)
  const setSymbol = useTradingContextStore((s) => s.setChartSymbol)
  const timeframe = useTradingContextStore((s) => s.chartTimeframe)
  const setTimeframe = useTradingContextStore((s) => s.setChartTimeframe)
  const [loading, setLoading] = useState(true)
  const [candles, setCandles] = useState<Candle[]>([])
  const [signals, setSignals] = useState<AnalysisSignal[]>([])
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null)
  const [lockedSignalId, setLockedSignalId] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 24, y: 120 })
  const [manualSetup, setManualSetup] = useState<ManualSetup | null>(null)
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)
  const [draggingPopup, setDraggingPopup] = useState(false)
  const [dismissedNoticeKeys, setDismissedNoticeKeys] = useState<string[]>([])
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const nextSymbol = searchParams.get('symbol')
    const nextTimeframe = searchParams.get('timeframe')

    if (nextSymbol) {
      setSymbol(nextSymbol as typeof symbol)
    }
    if (nextTimeframe) {
      setTimeframe(nextTimeframe as typeof timeframe)
    }
  }, [searchParams, setSymbol, setTimeframe])

  const hoveredSignal = useMemo(
    () => signals.find((s) => s.id === hoveredSignalId && s.status === 'live') ?? null,
    [signals, hoveredSignalId]
  )

  const lockedSignal = useMemo(
    () => signals.find((s) => s.id === lockedSignalId && s.status === 'live') ?? null,
    [signals, lockedSignalId]
  )

  const activeSignal = lockedSignal ?? hoveredSignal
  const liveSignals = useMemo(
    () => signals.filter((signal) => signal.status === 'live'),
    [signals]
  )
  const marketRiskContext = useMemo(
    () => getMarketRiskContext(symbol, timeframe, activeStrategyIds.length),
    [symbol, timeframe, activeStrategyIds.length]
  )

  useMarketWebSocket({
    symbol,
    timeframe,
    candles,
    enabled: candles.length > 0,
    onCandleUpdate: (nextCandles: any) => {
      setCandles(nextCandles)
      setSignals(runSignalsForStrategies(nextCandles, symbol, timeframe, activeStrategyIds))
    },
  })

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
      items.push(`Hey ${displayName}, this is your ${consecutiveLosses}th consecutive loss. Consider reducing risk or stepping away.`)
    }
    if (todayTakenCount >= 5) {
      items.push(`${displayName}, you've taken ${todayTakenCount} trades today. Make sure you aren't overtrading!`)
    }
    if (lockedMoneyContext && lockedMoneyContext.remainingDailyLoss <= 0) {
      items.push(`Daily loss limit reached, ${displayName}. Step back from the charts for today.`)
    }
    return items
  }, [consecutiveLosses, todayTakenCount, lockedMoneyContext, displayName])

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

  const stockMarketFilter: 'forex' | 'metals' | 'indices' | 'energy' | 'crypto' | 'stocks' | 'futures' = FX_SYMBOLS.includes(symbol)
    ? 'forex'
    : METAL_SYMBOLS.includes(symbol)
      ? 'metals'
      : INDEX_SYMBOLS.includes(symbol)
        ? 'indices'
        : ENERGY_SYMBOLS.includes(symbol)
          ? 'energy'
          : CRYPTO_SYMBOLS.includes(symbol)
            ? 'crypto'
            : FUTURES_SYMBOLS.includes(symbol)
              ? 'futures'
              : 'stocks'
  const marketFilter = stockMarketFilter

  const chartMarkers = useMemo(() => {
    const suggestionMarkers: ChartPanelMarker[] = liveSignals.map((s) => ({
      time: s.time as UTCTimestamp,
      position: s.direction === 'BUY' ? 'belowBar' : 'aboveBar',
      shape: s.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
      color: s.direction === 'BUY' ? '#22c55e' : '#ef4444',
      text: `${s.strategyLabel.split(' ')[0]} ${s.direction} ${s.confidence}%`,
    }))

    const historicalMarkers: ChartPanelMarker[] = journalMarkers.map((m) => ({
      time: m.time,
      position: 'inBar',
      shape: 'circle',
      color: '#64748b',
      text: m.pnl,
    }))

    return [...suggestionMarkers, ...historicalMarkers]
  }, [liveSignals, journalMarkers])

  const chartActiveSignal: ChartPanelActiveSignal | null = activeSignal
    ? {
      entry: activeSignal.entry,
      sl: activeSignal.sl,
      tp: activeSignal.tp,
      locked: Boolean(lockedSignal),
    }
    : null

  const chartManualSetup: ChartPanelManualSetup | null = manualSetup
    ? {
      entry: manualSetup.entry,
      action: manualSetup.action,
      sl: manualSetup.sl,
      tp: manualSetup.tp,
      generated: manualSetup.generated,
    }
    : null

  const handleCrosshairMove = (time: UTCTimestamp | null) => {
    if (liveSignals.length === 0 || time == null) {
      if (!lockedSignalId) setHoveredSignalId(null)
      return
    }

    const closest = liveSignals.find((s) => s.time === time) ?? null

    if (closest) {
      setHoveredSignalId(closest.id)
    } else if (!lockedSignalId) {
      setHoveredSignalId(null)
    }
  }

  const handleChartClick = ({ point, time, price }: { point?: { x: number; y: number }; time?: Time; price?: number | null }) => {
    if (!point) return

    const clickedTime = typeof time === 'number' ? (time as UTCTimestamp) : null

    if (clickedTime != null) {
      const nearestSignal = liveSignals.find((s) => s.time === clickedTime) ?? null

      if (nearestSignal) {
        setLockedSignalId(nearestSignal.id)
        setHoveredSignalId(nearestSignal.id)
        setManualSetup(null)
        return
      }

      const nearestHistory = journalMarkers.find((h) => h.time === clickedTime) ?? null
      if (nearestHistory) {
        return
      }
    }

    if (price == null) return

    const digits = priceDigits(symbol)
    const entry = Number(price.toFixed(digits))
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHoveredSignalId(null)
    setLockedSignalId(null)
    setManualSetup(null)
    setCandles([])
    setSignals([])

    const loadCandles = async () => {
      const generatedCandles = await getCandles(symbol, timeframe)
      if (cancelled) return
      const generatedSignals = runSignalsForStrategies(generatedCandles, symbol, timeframe, activeStrategyIds)
      setCandles(generatedCandles)
      setSignals(generatedSignals)
      setLoading(false)
    }

    void loadCandles()

    return () => {
      cancelled = true
    }
  }, [symbol, timeframe, activeStrategyIds, marketRiskContext.confidencePenalty])

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
          <span className="hidden md:inline-flex items-center h-8 px-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1]">
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="hidden sm:inline-flex items-center h-8 px-2.5 sm:px-3 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1]">
            Balance {fmtUSD(accountBalance)}
          </span>

          <div className="relative">
            <select
              value={marketFilter}
              onChange={(e) => {
                const m = e.target.value as 'forex' | 'crypto' | 'stocks' | 'metals' | 'indices' | 'energy' | 'futures'
                if (m === 'forex') setSymbol(FX_SYMBOLS[0])
                if (m === 'metals') setSymbol(METAL_SYMBOLS[0])
                if (m === 'indices') setSymbol(INDEX_SYMBOLS[0])
                if (m === 'energy') setSymbol(ENERGY_SYMBOLS[0])
                if (m === 'crypto') setSymbol(CRYPTO_SYMBOLS[0])
                if (m === 'stocks') setSymbol(STOCK_SYMBOLS[0])
                if (m === 'futures') setSymbol(FUTURES_SYMBOLS[0])
              }}
              className="appearance-none h-9 pl-3 pr-8 rounded-lg bg-[#0b0f17] border border-white/[0.08] text-[12px] font-bold text-white focus:outline-none focus:border-[#3b82f6]/50 uppercase"
            >
              <option value="forex">FOREX</option>
              <option value="metals">METALS</option>
              <option value="indices">INDICES</option>
              <option value="energy">ENERGY</option>
              <option value="crypto">CRYPTO</option>
              <option value="stocks">STOCKS</option>
              <option value="futures">FUTURES</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b5563] pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as SymbolOption)}
              className="appearance-none h-9 pl-3 pr-8 rounded-lg bg-[#0b0f17] border border-white/[0.08] text-[12px] font-semibold text-white focus:outline-none focus:border-[#3b82f6]/50"
            >
              {(stockMarketFilter === 'forex'
                ? FX_SYMBOLS
                : stockMarketFilter === 'metals'
                  ? METAL_SYMBOLS
                  : stockMarketFilter === 'indices'
                    ? INDEX_SYMBOLS
                    : stockMarketFilter === 'energy'
                      ? ENERGY_SYMBOLS
                      : stockMarketFilter === 'crypto'
                        ? CRYPTO_SYMBOLS
                        : stockMarketFilter === 'futures'
                          ? FUTURES_SYMBOLS
                          : STOCK_SYMBOLS
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b5563] pointer-events-none" />
          </div>

        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden xl:inline-flex items-center h-8 px-3 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/[0.14] bg-[#0d1117] text-[#cbd5e1]">
            {strategyLabel} ┬╖ Locked
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
        <div className="relative h-full">
          {candles.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="w-full max-w-6xl">
                <div className="h-[420px] w-full rounded-lg bg-gradient-to-r from-[#071018] via-[#0b1118] to-[#071018] animate-pulse border border-white/[0.04]" />
                <div className="mt-4 flex items-center justify-center">
                  <svg className="h-6 w-6 text-[#60a5fa] animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <ChartPanel
              symbol={symbol}
              timeframe={timeframe}
              candles={candles}
              markers={chartMarkers}
              activeSignal={chartActiveSignal}
              manualSetup={chartManualSetup}
              onCrosshairMove={handleCrosshairMove}
              onChartClick={handleChartClick}
              onTimeframeChange={setTimeframe}
            />
          )}
        </div>

        <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 px-3 py-2 rounded-lg bg-[#0d1117]/90 border border-white/[0.08] text-[11px] text-[#94a3b8] pointer-events-none">
          Hover TRAXO suggestions to preview. Click one to lock it. Previous trades (gray dots) are reference-only.
        </div>

        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2 pointer-events-none">
          <span className="px-2.5 py-1 rounded-md bg-[#0d1117]/95 border border-white/[0.08] text-[11px] text-[#e5e7eb] font-semibold">
            {symbol} ┬╖ {timeframe}
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

            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              {hoveredSignal.confidence >= 85 && (
                <span className="text-[10px] items-center gap-1 inline-flex px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold uppercase tracking-wider shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  High Quality Pattern
                </span>
              )}
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
                Why we flagged this for you, {displayName.split(' ')[0]}
              </div>
              <div className="space-y-1.5">
                {hoveredSignal.reason.map((r, i) => (
                  <p key={i} className="text-[11px] text-[#94a3b8] leading-relaxed">
                    ΓÇó {r}
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
                <div className="text-[13px] font-semibold text-white mt-1">{lockedSignal.direction} ┬╖ {symbol}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {lockedSignal.confidence >= 85 && (
                    <span className="text-[10px] items-center gap-1 inline-flex px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold uppercase tracking-wider shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      High Quality Pattern
                    </span>
                  )}
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

            <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
              <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">
                Why we flagged this for you, {displayName.split(' ')[0]}
              </div>
              {lockedSignal.reason.map((line, i) => (
                <p key={i} className="text-[11px] text-[#94a3b8] leading-relaxed">ΓÇó {line}</p>
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
                <div className="text-[13px] text-white font-semibold mt-1">{symbol} ┬╖ {timeframe}</div>
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
                    <p key={i} className="text-[11px] text-[#94a3b8] leading-relaxed">ΓÇó {line}</p>
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
