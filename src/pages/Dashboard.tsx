/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'
import { ChevronDown, X, ArrowUpRight, ArrowDownRight, ExternalLink, Copy, Check, Zap } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useOnboardingStore } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { ChartPanel, type ChartPanelMarker, type ChartPanelActiveSignal, type ChartPanelManualSetup } from '@/components/dashboard/ChartPanel'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { getMarketRiskContext } from '@/lib/marketRisk'
import { getCandles, type Candle } from '@/lib/marketData'
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket'
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore'
import { riskFromConfidence, priceDigits, type RiskLabel } from '@/lib/signalDetection'
import { formatMT4OrderClipboardPayload } from '@/lib/utils'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { cn, formatPrice } from '@/lib/utils'

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

function signalMarkerKey(signal: { strategyId: string; direction: string; time: number }) {
  return `${signal.strategyId}:${signal.direction}:${signal.time}`
}

export default function Dashboard() {
  const displayName = useAuthStore((s) => s.user?.displayName || s.user?.fullName || s.user?.email || 'Trader')
  const [searchParams, setSearchParams] = useSearchParams()
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
  const allSignals = useAnalysisSignalStore((s) => s.signals)
  const chartSignals = useMemo(() => {
    const bySetup = new Map<string, typeof allSignals[number]>()
    for (const signal of allSignals) {
      if (signal.symbol !== symbol || signal.timeframe !== timeframe) continue
      const key = signalMarkerKey(signal)
      const existing = bySetup.get(key)
      if (!existing || (existing.status !== 'live' && signal.status === 'live')) {
        bySetup.set(key, signal)
      }
    }
    return Array.from(bySetup.values()).sort((a, b) => b.time - a.time)
  }, [allSignals, symbol, timeframe])
  
  const signals = chartSignals
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null)
  const [lockedSignalId, setLockedSignalId] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 24, y: 120 })
  const [manualSetup, setManualSetup] = useState<ManualSetup | null>(null)
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)
  const [draggingPopup, setDraggingPopup] = useState(false)
  const [dismissedNoticeKeys, setDismissedNoticeKeys] = useState<string[]>([])
  const [orderCopied, setOrderCopied] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const handleCopyMT4Order = (sig: { symbol: string; direction: string; entry: number; sl: number; tp: number }, riskAmt?: number) => {
    const payload = formatMT4OrderClipboardPayload({
      symbol: sig.symbol,
      direction: sig.direction,
      entry: sig.entry,
      sl: sig.sl,
      tp: sig.tp,
      riskAmount: riskAmt,
    })
    navigator.clipboard.writeText(payload)
    setOrderCopied(true)
    setTimeout(() => setOrderCopied(false), 2000)
  }



  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')
    const urlTimeframe = searchParams.get('timeframe')
    if (urlSymbol && urlSymbol !== symbol) setSymbol(urlSymbol as typeof symbol)
    if (urlTimeframe && urlTimeframe !== timeframe) setTimeframe(urlTimeframe as typeof timeframe)
  }, [searchParams, symbol, timeframe, setSymbol, setTimeframe])

  const hoveredSignal = useMemo(
    () => signals.find((s) => s.id === hoveredSignalId) ?? null,
    [signals, hoveredSignalId]
  )

  const lockedSignal = useMemo(
    () => signals.find((s) => s.id === lockedSignalId) ?? null,
    [signals, lockedSignalId]
  )

  const activeSignal = lockedSignal ?? hoveredSignal
  const activeLiveSignal = activeSignal?.status === 'live' ? activeSignal : null
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
        // eslint-disable-next-line react-hooks/purity
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

  const chartMarkers = useMemo(() => {
    const markerBySetup = new Map<string, ChartPanelMarker>()

    for (const s of signals) {
      const isLive = s.status === 'live'
      markerBySetup.set(signalMarkerKey(s), {
        time: s.time as UTCTimestamp,
        position: s.direction === 'BUY' ? 'belowBar' : 'aboveBar',
        shape: s.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
        color: isLive ? (s.direction === 'BUY' ? '#22c55e' : '#ef4444') : '#64748b',
        text: `${isLive ? '' : 'Prev '}${s.strategyLabel === 'Supply & Demand' ? 'S&D' : s.strategyLabel.split(' ')[0]} ${s.direction} ${s.confidence}%`,
      })
    }

    const suggestionMarkers = Array.from(markerBySetup.values())

    const historicalMarkers: ChartPanelMarker[] = journalMarkers.map((m) => ({
      time: m.time,
      position: 'inBar',
      shape: 'circle',
      color: '#64748b',
      text: m.pnl,
    }))

    return [...suggestionMarkers, ...historicalMarkers]
  }, [signals, journalMarkers])

  const activeSignalForChart = lockedSignal || hoveredSignal || activeLiveSignal

  const chartActiveSignal: ChartPanelActiveSignal | null = activeSignalForChart
    ? {
      entry: activeSignalForChart.entry,
      sl: activeSignalForChart.sl,
      tp: activeSignalForChart.tp,
      action: activeSignalForChart.direction,
      entryTime: activeSignalForChart.time as UTCTimestamp,
      confidence: activeSignalForChart.confidence,
      rr: activeSignalForChart.rr,
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
    if (signals.length === 0 || time == null) {
      if (!lockedSignalId) setHoveredSignalId(null)
      return
    }

    const tfMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1H': 3600,
      '4H': 14400,
      '1D': 86400,
    }
    const tolerance = (tfMap[timeframe] || 900) * 0.9

    const closest = signals.find((s) => Math.abs(s.time - time) <= tolerance) ?? null

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
      const nearestSignal = signals.find((s) => s.time === clickedTime) ?? null

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
    const initTimer = setTimeout(() => {
      setLoading(true)
      setHoveredSignalId(null)
      setLockedSignalId(null)
      setManualSetup(null)
      setCandles([])
    }, 0)

    const loadCandles = async () => {
      // Fetch 2000 candles to provide much more chart history than the default 200
      const generatedCandles = await getCandles(symbol, timeframe, 2000)
      if (cancelled) return
      setCandles(generatedCandles)
      setLoading(false)
    }

    void loadCandles()

    return () => {
      cancelled = true
      clearTimeout(initTimer)
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
      const t = setTimeout(() => {
        setPopupPosition(null)
        setDraggingPopup(false)
      }, 0)
      return () => clearTimeout(t)
    }
    if (popupPosition) return
    const width = getPopupWidth()
    const x = window.innerWidth - width - (window.innerWidth < 640 ? 8 : 16)
    const y = window.innerWidth < 640 ? 70 : 84
    const t2 = setTimeout(() => {
       
      setPopupPosition(clampPopupPosition(x, y))
    }, 0)
    return () => clearTimeout(t2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingPopup])

  return (
    <div className="min-h-screen h-screen bg-[#070709] text-white flex flex-col overflow-hidden pb-20 lg:pb-0">
      <DashboardHeader
        symbol={symbol as any}
        timeframe={timeframe as any}
        onSymbolChange={(s) => setSearchParams({ symbol: s, timeframe }, { replace: true })}
        onTimeframeChange={(t) => setSearchParams({ symbol, timeframe: t }, { replace: true })}
        accountBalance={accountBalance}
        riskPerTradePct={riskPerTradePct}
        maxDailyLossPct={maxDailyLossPct}
        todayLoss={todayLoss}
        consecutiveLosses={consecutiveLosses}
        todayTakenCount={todayTakenCount}
        strategyLabel={strategyLabel}
        displayName={displayName}
      />

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
              onTimeframeChange={(tf) => setSearchParams({ symbol, timeframe: tf }, { replace: true })}
            />
          )}
        </div>

        <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 px-3 py-2 rounded-lg bg-[#0d1117]/90 border border-white/[0.08] text-[11px] text-[#94a3b8] pointer-events-none">
          Hover TRAXO suggestions to preview. Click one to lock it. Previous trades (gray dots) are reference-only.
        </div>

        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2 pointer-events-none">
          <span className="px-2.5 py-1 rounded-md bg-[#0d1117]/95 border border-white/[0.08] text-[11px] text-[#e5e7eb] font-semibold">
            {symbol} • {timeframe}
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
            className="absolute z-20 w-[350px] max-w-[calc(100vw-0.9rem)] bg-[#090d14]/90 backdrop-blur-xl border border-white/[0.14] rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.6)] p-3.5 pointer-events-none"
            style={{
              left: Math.max(6, Math.min(mouse.x + 16, window.innerWidth - 370)),
              top: Math.max(66, Math.min(mouse.y - 10, window.innerHeight - 250)),
            }}
          >
            {/* Top Row: Action, Symbol, Strategy */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border shrink-0',
                    hoveredSignal.direction === 'BUY'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  )}
                >
                  {hoveredSignal.direction}
                </span>
                <span className="text-[14px] font-extrabold text-white tracking-wide shrink-0">{symbol}</span>
                <span className="text-[10px] font-semibold text-slate-300 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] whitespace-nowrap shrink-0">
                  {hoveredSignal.strategyLabel}
                </span>
              </div>
            </div>

            {/* Second Row: Outcome & Confidence */}
            <div className="flex items-center justify-between mb-2.5">
              {hoveredSignal.status !== 'live' ? (
                <span className={cn(
                  "text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase whitespace-nowrap",
                  hoveredSignal.status === 'WIN' || hoveredSignal.status === 'tp_hit'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : hoveredSignal.status === 'LOSS' || hoveredSignal.status === 'sl_hit'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                )}>
                  {hoveredSignal.status === 'WIN' || hoveredSignal.status === 'tp_hit'
                    ? `HIT TP (+${(hoveredSignal.rr ?? 1.5).toFixed(1)}x)`
                    : hoveredSignal.status === 'LOSS' || hoveredSignal.status === 'sl_hit'
                    ? 'HIT SL (-1.0x)'
                    : 'EXPIRED'}
                </span>
              ) : (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  Active Signal
                </span>
              )}
              <span className="text-[10px] font-bold text-blue-400 px-2 py-0.5 bg-blue-500/10 rounded-md border border-blue-500/20 whitespace-nowrap">
                {hoveredSignal.confidence}% Conf.
              </span>
            </div>

            {/* Spacious Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 mb-2 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
              {[
                ['ENTRY', hoveredSignal.entry, 'text-white'],
                ['SL', hoveredSignal.sl, 'text-rose-400'],
                ['TP', hoveredSignal.tp, 'text-emerald-400'],
                ['R:R', hoveredSignal.rr, 'text-blue-400'],
              ].map(([k, v, color]) => (
                <div key={String(k)} className="min-w-0">
                  <span className="block text-[9px] font-semibold text-slate-500 uppercase mb-0.5">{k}</span>
                  <span className={cn('text-[11px] font-bold tabular-nums whitespace-nowrap block truncate', color)}>
                    {typeof v === 'number' && String(k) !== 'R:R' ? formatPrice(v, undefined, symbol) : typeof v === 'number' ? v.toFixed(1) + 'x' : String(v)}
                  </span>
                </div>
              ))}
            </div>

            {hoveredMoneyContext && (
              <div className="flex items-center justify-between text-[11px] font-medium pt-0.5 mb-1.5 px-0.5">
                <span className="text-slate-400">Pos: <span className="text-white font-semibold">{fmtUSD(hoveredMoneyContext.suggestedPosition)}</span></span>
                <span className="text-slate-400">Risk: <span className="text-rose-400 font-semibold">{fmtUSD(hoveredMoneyContext.maxLossAtSL)}</span></span>
              </div>
            )}

            {/* Brief Concise Signal Selection Reason */}
            {hoveredSignal.reason && hoveredSignal.reason.length > 0 && (
              <p className="text-[10px] text-slate-300 bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-white/[0.05] font-medium leading-tight truncate">
                • {hoveredSignal.reason[0]}
              </p>
            )}
          </div>
        )}

        {lockedSignal && !loading && (
          <div className="absolute z-30 left-3 top-14 sm:left-4 sm:top-16 w-[350px] sm:w-[360px] max-w-[calc(100vw-0.9rem)] rounded-2xl bg-[#090d14]/95 backdrop-blur-xl border border-white/[0.14] shadow-[0_16px_36px_rgba(0,0,0,0.6)] p-3.5">
            {/* Top Row: Action, Symbol, Strategy & Close */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border shrink-0',
                    lockedSignal.direction === 'BUY'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  )}
                >
                  {lockedSignal.direction}
                </span>
                <span className="text-[14px] font-extrabold text-white tracking-wide shrink-0">{symbol}</span>
                <span className="text-[10px] font-semibold text-slate-300 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] whitespace-nowrap shrink-0">
                  {lockedSignal.strategyLabel}
                </span>
              </div>
              <button
                onClick={() => {
                  setLockedSignalId(null)
                  setHoveredSignalId(null)
                }}
                className="px-2 py-0.5 rounded-md border border-white/[0.1] text-[10px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                Close
              </button>
            </div>

            {/* Second Row: Outcome & Confidence */}
            <div className="flex items-center justify-between mb-2.5">
              {lockedSignal.status !== 'live' ? (
                <span className={cn(
                  "text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase whitespace-nowrap",
                  lockedSignal.status === 'WIN' || lockedSignal.status === 'tp_hit'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : lockedSignal.status === 'LOSS' || lockedSignal.status === 'sl_hit'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                )}>
                  {lockedSignal.status === 'WIN' || lockedSignal.status === 'tp_hit'
                    ? `HIT TP (+${(lockedSignal.rr ?? 1.5).toFixed(1)}x)`
                    : lockedSignal.status === 'LOSS' || lockedSignal.status === 'sl_hit'
                    ? 'HIT SL (-1.0x)'
                    : 'EXPIRED'}
                </span>
              ) : (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md border uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  Active Signal
                </span>
              )}
              <span className="text-[10px] font-bold text-blue-400 px-2 py-0.5 bg-blue-500/10 rounded-md border border-blue-500/20 whitespace-nowrap">
                {lockedSignal.confidence}% Conf.
              </span>
            </div>

            {/* Spacious Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 mb-2 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
              {[
                ['ENTRY', lockedSignal.entry, 'text-white'],
                ['SL', lockedSignal.sl, 'text-rose-400'],
                ['TP', lockedSignal.tp, 'text-emerald-400'],
                ['R:R', lockedSignal.rr, 'text-blue-400'],
              ].map(([k, v, color]) => (
                <div key={String(k)} className="min-w-0">
                  <span className="block text-[9px] font-semibold text-slate-500 uppercase mb-0.5">{k}</span>
                  <span className={cn('text-[11px] font-bold tabular-nums whitespace-nowrap block truncate', color)}>
                    {typeof v === 'number' && String(k) !== 'R:R' ? formatPrice(v, undefined, symbol) : typeof v === 'number' ? v.toFixed(1) + 'x' : String(v)}
                  </span>
                </div>
              ))}
            </div>

            {lockedMoneyContext && (
              <div className="flex items-center justify-between text-[11px] font-medium mb-2 pb-2 border-b border-white/[0.06] px-0.5">
                <div className="flex gap-3">
                  <span className="text-slate-400">Pos: <span className="text-white font-semibold">{fmtUSD(lockedMoneyContext.suggestedPosition)}</span></span>
                  <span className="text-slate-400">Risk: <span className="text-rose-400 font-semibold">{fmtUSD(lockedMoneyContext.maxLossAtSL)}</span></span>
                </div>
              </div>
            )}

            {/* Brief Concise Signal Selection Reason */}
            {lockedSignal.reason && lockedSignal.reason.length > 0 && (
              <p className="text-[10px] text-slate-300 bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-white/[0.05] font-medium leading-tight truncate mb-2">
                • {lockedSignal.reason[0]}
              </p>
            )}

            {/* Hybrid Broker Execution & Order Assistant Actions (Live Signals Only) */}
            {lockedSignal.status === 'live' && (
              <div className="grid grid-cols-2 gap-1.5 mb-2.5 pt-1">
                <button
                  onClick={() => handleCopyMT4Order({ symbol, direction: lockedSignal.direction, entry: lockedSignal.entry, sl: lockedSignal.sl, tp: lockedSignal.tp }, lockedMoneyContext?.maxLossAtSL)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 text-[10px] font-semibold transition-colors"
                  title="Copy Entry, SL, TP & Lot Sizing to clipboard"
                >
                  {orderCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-blue-400" />}
                  <span>{orderCopied ? 'Copied Order!' : 'Copy Order Details'}</span>
                </button>
                <button
                  onClick={() => {
                    alert(`Executing ${lockedSignal.direction} ${symbol} on your connected Exness / FxPro account via MetaApi Cloud Bridge... (Lot size: ${(lockedMoneyContext ? lockedMoneyContext.maxLossAtSL / (Math.abs(lockedSignal.entry - lockedSignal.sl) * 100000) : 0.1).toFixed(2)})`)
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] font-bold shadow-md transition-all border border-emerald-400/30"
                  title="1-Click execution on your connected Exness / FxPro account"
                >
                  <Zap size={11} className="fill-current text-yellow-300" />
                  <span>Execute Exness / FxPro</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
              <span className="text-[11px] text-slate-300 font-medium">Log Decision</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => saveLockedFeedback(true)}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-medium shadow-sm transition-colors"
                >
                  Took It
                </button>
                <button
                  onClick={() => saveLockedFeedback(false)}
                  className="px-2.5 py-1 rounded-lg border border-white/[0.12] text-slate-400 hover:text-white text-[10px] font-medium transition-colors"
                >
                  Skipped
                </button>
              </div>
            </div>

            {lockedJournal?.taken && lockedSuggestionKey && (
              <div className="pt-2 mt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'win')} className={cn("flex-1 h-6 rounded-md border text-[9px] font-semibold transition-colors", lockedJournal.outcome === 'win' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400' : 'border-white/[0.1] text-slate-400 hover:bg-white/[0.05]')}>Win</button>
                  <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'loss')} className={cn("flex-1 h-6 rounded-md border text-[9px] font-semibold transition-colors", lockedJournal.outcome === 'loss' ? 'border-rose-500/50 bg-rose-500/20 text-rose-400' : 'border-white/[0.1] text-slate-400 hover:bg-white/[0.05]')}>Loss</button>
                  <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'breakeven')} className={cn("flex-1 h-6 rounded-md border text-[9px] font-semibold transition-colors", lockedJournal.outcome === 'breakeven' ? 'border-slate-400/50 bg-slate-500/20 text-slate-300' : 'border-white/[0.1] text-slate-400 hover:bg-white/[0.05]')}>BE</button>
                </div>
              </div>
            )}
          </div>
        )}

        {manualSetup && !loading && (
          <div
            data-entry-popup="true"
            className="absolute z-30 w-[340px] max-w-[calc(100vw-0.9rem)] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl bg-[#090d14]/95 border border-white/[0.14] shadow-[0_16px_36px_rgba(0,0,0,0.6)] backdrop-blur-xl p-3.5 space-y-3 touch-pan-y"
            style={{ left: popupPosition?.x ?? 8, top: popupPosition?.y ?? 70 }}
          >
            {/* Header with Drag Handle */}
            <div
              className="flex items-center justify-between cursor-move select-none"
              onPointerDown={(e) => {
                const card = (e.currentTarget.parentElement as HTMLDivElement | null)
                if (!card) return
                const rect = card.getBoundingClientRect()
                dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
                setDraggingPopup(true)
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-5 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 border',
                    manualSetup.action === 'BUY'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  )}
                >
                  {manualSetup.action}
                </span>
                <span className="text-[13px] font-extrabold text-white tracking-wide">{symbol}</span>
                <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.06]">
                  {strategyLabel}
                </span>
              </div>
              <button
                onClick={() => setManualSetup(null)}
                className="h-5 px-2 rounded-md border border-white/[0.1] text-[10px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                Close
              </button>
            </div>

            {/* Action Toggle (BUY / SELL) */}
            <div className="grid grid-cols-2 gap-1.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
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
                  className={cn(
                    'h-7 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all',
                    manualSetup.action === action
                      ? action === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  )}
                >
                  {action}
                </button>
              ))}
            </div>

            {/* Compact System Opinion & Money Context */}
            <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">Confidence & Risk</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-blue-400 px-1.5 py-0.5 bg-blue-500/10 rounded border border-blue-500/20">
                    {manualSetup.confidence}% Conf.
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                    style={actionBadgeTone(manualSetup.risk)}
                  >
                    {manualSetup.risk} Risk
                  </span>
                </div>
              </div>

              {manualMoneyContext && (
                <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Position: <span className="text-white font-semibold">{fmtUSD(manualMoneyContext.suggestedPosition)}</span></span>
                  <span className="text-slate-400">Max Loss: <span className="text-rose-400 font-semibold">{fmtUSD(manualMoneyContext.maxLossAtSL)}</span></span>
                </div>
              )}
            </div>

            {/* SL / TP Generation Section */}
            {!manualSetup.generated && (
              <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05] text-center space-y-2">
                <p className="text-[11px] text-slate-300">
                  Generate SL & TP levels for <span className="text-white font-bold">{manualSetup.entry.toFixed(manualSetup.digits)}</span>?
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={generateManualSLTP}
                    className="h-7 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium shadow-sm transition-colors"
                  >
                    Generate SL / TP
                  </button>
                  <button
                    onClick={() => setManualSetup((prev) => (prev ? { ...prev, generated: false, sl: null, tp: null, rr: 0 } : prev))}
                    className="h-7 px-3 rounded-lg border border-white/[0.12] text-slate-400 hover:text-white text-[11px] font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Generated Levels Inputs */}
            {manualSetup.generated && manualSetup.sl != null && manualSetup.tp != null && (
              <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white">Trade Plan Levels</span>
                  <span className="text-[11px] font-bold text-blue-400">R:R {manualSetup.rr.toFixed(2)}x</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase w-14">Entry</span>
                    <input
                      value={manualSetup.entry}
                      onChange={(e) => updateManualValue('entry', e.target.value)}
                      className="h-7 px-2 flex-1 rounded-md bg-[#070709] border border-white/[0.12] text-[11px] text-white tabular-nums focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-rose-400 uppercase w-14">SL</span>
                    <input
                      value={manualSetup.sl}
                      onChange={(e) => updateManualValue('sl', e.target.value)}
                      className="h-7 px-2 flex-1 rounded-md bg-[#070709] border border-rose-500/30 text-[11px] text-rose-400 tabular-nums focus:outline-none focus:border-rose-500/60"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase w-14">TP</span>
                    <input
                      value={manualSetup.tp}
                      onChange={(e) => updateManualValue('tp', e.target.value)}
                      className="h-7 px-2 flex-1 rounded-md bg-[#070709] border border-emerald-500/30 text-[11px] text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-500/60"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={generateManualSLTP}
                    className="text-[10px] text-slate-400 hover:text-white underline transition-colors"
                  >
                    Regenerate levels
                  </button>
                </div>

                {/* Did you take this trade */}
                <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-medium">Log Decision</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => saveManualFeedback(true)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-medium transition-colors"
                      >
                        Took It
                      </button>
                      <button
                        onClick={() => saveManualFeedback(false)}
                        className="px-2.5 py-1 rounded-lg border border-white/[0.12] text-slate-400 hover:text-white text-[10px] font-medium transition-colors"
                      >
                        Skipped
                      </button>
                    </div>
                  </div>
                  {manualJournal?.taken && manualSuggestionKey && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <button onClick={() => setJournalOutcome(manualSuggestionKey, 'win')} className={cn("flex-1 h-6 rounded-md border text-[9px] font-semibold transition-colors", manualJournal.outcome === 'win' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400' : 'border-white/[0.1] text-slate-400 hover:bg-white/[0.05]')}>Win</button>
                      <button onClick={() => setJournalOutcome(manualSuggestionKey, 'loss')} className={cn("flex-1 h-6 rounded-md border text-[9px] font-semibold transition-colors", manualJournal.outcome === 'loss' ? 'border-rose-500/50 bg-rose-500/20 text-rose-400' : 'border-white/[0.1] text-slate-400 hover:bg-white/[0.05]')}>Loss</button>
                      <button onClick={() => setJournalOutcome(manualSuggestionKey, 'breakeven')} className={cn("flex-1 h-6 rounded-md border text-[9px] font-semibold transition-colors", manualJournal.outcome === 'breakeven' ? 'border-slate-400/50 bg-slate-500/20 text-slate-300' : 'border-white/[0.1] text-slate-400 hover:bg-white/[0.05]')}>BE</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
