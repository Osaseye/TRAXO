import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'
import {
  PiArrowsClockwise,
  PiBroadcast,
  PiCaretDown,
  PiCaretUp,
  PiCheck,
  PiCopy,
  PiCrosshair,
  PiLightning,
  PiMagnifyingGlass,
  PiRows,
  PiSidebarSimple,
  PiSpinnerGap,
  PiX,
  PiXCircle,
} from 'react-icons/pi'
import { useSearchParams } from 'react-router'
import {
  MARKET_CATEGORIES,
  TIMEFRAMES,
  type MarketCategory,
  type SymbolOption,
} from '@/components/layout/DashboardHeader'
import {
  ChartPanel,
  type ChartPanelActiveSignal,
  type ChartPanelManualSetup,
  type ChartPanelMarker,
} from '@/components/dashboard/ChartPanel'
import { SignalFeed } from '@/components/dashboard/SignalFeed'
import type { DashboardSignalItem } from '@/components/dashboard/SignalCard'
import { RiskPanel } from '@/components/dashboard/RiskPanel'
import { StatsRow } from '@/components/dashboard/StatsRow'
import { StrategyPanel } from '@/components/dashboard/StrategyPanel'
import { useMetaApi } from '@/hooks/useMetaApi'
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket'
import { getCandles, type Candle } from '@/lib/marketData'
import { getMarketRiskContext } from '@/lib/marketRisk'
import {
  priceDigits,
  riskFromConfidence,
  runSignalsForStrategies,
  type RiskLabel,
} from '@/lib/signalDetection'
import { calculateLots, cn, formatMT4OrderClipboardPayload, formatPrice } from '@/lib/utils'
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore, type OnboardingStrategyId } from '@/stores/useOnboardingStore'
import { useStrategyStore } from '@/stores/useStrategyStore'
import { showToast } from '@/stores/useToastStore'
import {
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
} from '@/stores/useTradingContextStore'
import type { DashboardStats, Strategy, StrategyId } from '@/types'

type TradeAction = 'BUY' | 'SELL'
type InspectorTab = 'setups' | 'planner' | 'risk'
type DockTab = 'positions' | 'orders'
type MobileView = 'chart' | 'setups' | 'order' | 'risk' | 'positions'

interface PendingOrder {
  id: string
  symbol: string
  type: string
  volume: number
  openPrice: number
  currentPrice?: number
  sl?: number
  tp?: number
  state?: string
  comment?: string
  time?: string
}

interface LiveQuote {
  bid: number | null
  ask: number | null
  spreadPips: number | null
  source: 'mt5' | 'feed'
}

interface ManualPlannerState {
  time: UTCTimestamp
  entry: number
  action: TradeAction
  entryType: 'market' | 'limit'
  sl: number
  tp: number
  range: number
  digits: number
  activeOnChart: boolean
}

interface EngineDef {
  storeId: StrategyId
  kebabId: OnboardingStrategyId
  name: string
  description: string
}

const ENGINE_DEFINITIONS: EngineDef[] = [
  {
    storeId: 'wick_rejection',
    kebabId: 'wick-rejection',
    name: 'Wick Rejection',
    description: 'Liquidity sweep and rejection wick reversal engine.',
  },
  {
    storeId: 'breakout',
    kebabId: 'breakout',
    name: 'Breakout',
    description: 'Consolidation range expansion with momentum filter.',
  },
  {
    storeId: 'order_block',
    kebabId: 'order-block',
    name: 'Order Block',
    description: 'Institutional displacement and mitigation zone retest.',
  },
  {
    storeId: 'supply_demand',
    kebabId: 'supply-demand',
    name: 'Supply & Demand',
    description: 'Imbalance zone reaction and structural flip setups.',
  },
  {
    storeId: 'trend_following',
    kebabId: 'trend-following',
    name: 'Trend Following',
    description: 'Pullback continuation aligned with dominant structure.',
  },
]

const CANONICAL_KEBAB_MAP: Record<string, OnboardingStrategyId> = {
  wick_rejection: 'wick-rejection',
  'wick-rejection': 'wick-rejection',
  breakout: 'breakout',
  order_block: 'order-block',
  'order-block': 'order-block',
  supply_demand: 'supply-demand',
  'supply-demand': 'supply-demand',
  trend_following: 'trend-following',
  'trend-following': 'trend-following',
  traxo_london_apex: 'traxo-london-apex',
  'traxo-london-apex': 'traxo-london-apex',
  traxo_tokyo_yield: 'traxo-tokyo-yield',
  'traxo-tokyo-yield': 'traxo-tokyo-yield',
  traxo_sovereign_fix: 'traxo-sovereign-fix',
  'traxo-sovereign-fix': 'traxo-sovereign-fix',
  traxo_barrier_grid: 'traxo-barrier-grid',
  'traxo-barrier-grid': 'traxo-barrier-grid',
  traxo_macro_vector: 'traxo-macro-vector',
  'traxo-macro-vector': 'traxo-macro-vector',
  traxo_aurum_sweep: 'traxo-aurum-sweep',
  'traxo-aurum-sweep': 'traxo-aurum-sweep',
  traxo_bullion_strike: 'traxo-bullion-strike',
  'traxo-bullion-strike': 'traxo-bullion-strike',
  traxo_ny_bullet: 'traxo-ny-bullet',
  'traxo-ny-bullet': 'traxo-ny-bullet',
  traxo_aurum_fix: 'traxo-aurum-fix',
  'traxo-aurum-fix': 'traxo-aurum-fix',
  traxo_kinetic_nr7: 'traxo-kinetic-nr7',
  'traxo-kinetic-nr7': 'traxo-kinetic-nr7',
  traxo_globex_sweep: 'traxo-globex-sweep',
  'traxo-globex-sweep': 'traxo-globex-sweep',
  traxo_velocity_orb: 'traxo-velocity-orb',
  'traxo-velocity-orb': 'traxo-velocity-orb',
  traxo_initial_balance: 'traxo-initial-balance',
  'traxo-initial-balance': 'traxo-initial-balance',
  traxo_mean_equilibrium: 'traxo-mean-equilibrium',
  'traxo-mean-equilibrium': 'traxo-mean-equilibrium',
  traxo_power_hour_moc: 'traxo-power-hour-moc',
  'traxo-power-hour-moc': 'traxo-power-hour-moc',
}

function getCategoryForSymbol(sym: string): MarketCategory {
  if ((MARKET_CATEGORIES[0]?.symbols as string[]).includes(sym)) return 'forex'
  if ((MARKET_CATEGORIES[1]?.symbols as string[]).includes(sym)) return 'metals'
  return 'stocks'
}

function formatCategoryLabel(cat: MarketCategory): string {
  if (cat === 'forex') return 'Forex'
  if (cat === 'metals') return 'Metals'
  return 'Stocks'
}

function generateManualLevels(entry: number, action: TradeAction, range: number, digits: number) {
  const safeRange = Math.max(range, entry * 0.0015)
  const slGap = safeRange * 1.15
  const rr = 2.2
  const tpGap = slGap * rr
  const sl = action === 'BUY' ? entry - slGap : entry + slGap
  const tp = action === 'BUY' ? entry + tpGap : entry - tpGap
  return {
    sl: Number(sl.toFixed(digits)),
    tp: Number(tp.toFixed(digits)),
  }
}

function signalMarkerKey(signal: { strategyId: string; direction: string; time: number }) {
  return `${signal.strategyId}:${signal.direction}:${signal.time}`
}

function normalizeStrategyToKebab(id: string): string {
  return CANONICAL_KEBAB_MAP[id] ?? id.replace(/_/g, '-')
}

function defaultPlannerLevels(
  symbol: string,
  lastCandle: Candle | undefined,
  action: TradeAction
): ManualPlannerState {
  const digits = priceDigits(symbol)
  const basePrice =
    lastCandle?.close ?? (symbol.includes('JPY') ? 150.0 : symbol.includes('XAU') ? 2650.0 : 1.085)
  const range = lastCandle
    ? Math.max(lastCandle.high - lastCandle.low, basePrice * 0.002)
    : basePrice * 0.002
  const levels = generateManualLevels(basePrice, action, range, digits)
  return {
    time: lastCandle?.time ?? (Math.floor(Date.now() / 1000) as UTCTimestamp),
    entry: Number(basePrice.toFixed(digits)),
    action,
    entryType: 'market',
    sl: levels.sl,
    tp: levels.tp,
    range,
    digits,
    activeOnChart: false,
  }
}

export default function Dashboard() {
  const displayName = useAuthStore(
    (s) => s.user?.displayName || s.user?.fullName || s.user?.email || 'Operator'
  )
  const [searchParams, setSearchParams] = useSearchParams()

  const { selectedStrategyIds, toggleSelectedStrategy, setSelectedStrategies } =
    useOnboardingStore()
  const storeStrategies = useStrategyStore((s) => s.strategies)
  const setStoreStrategies = useStrategyStore((s) => s.setStrategies)
  const toggleStoreStrategy = useStrategyStore((s) => s.toggleStrategy)

  const {
    accountBalance,
    riskMode,
    setRiskMode,
    fixedRiskAmount,
    setFixedRiskAmount,
    riskPerTradePct,
    setRiskPerTradePct,
    maxDailyLossPct,
    autoTradeMaxPositions,
    autoTradeSpreadCapPips,
    autoTradeSessionFilter,
    journal,
    logSuggestionDecision,
    setJournalOutcome,
  } = useTradingContextStore()

  const symbol = useTradingContextStore((s) => s.chartSymbol)
  const setSymbol = useTradingContextStore((s) => s.setChartSymbol)
  const timeframe = useTradingContextStore((s) => s.chartTimeframe)
  const setTimeframe = useTradingContextStore((s) => s.setChartTimeframe)

  const allSignals = useAnalysisSignalStore((s) => s.signals)
  const addSignals = useAnalysisSignalStore((s) => s.addSignals)

  const {
    account,
    positions: metaPositions,
    executeManualTrade,
    closeOpenPosition,
    refreshPositions,
    refreshAccount,
    loading: metaLoading,
  } = useMetaApi()

  // Terminal UI states
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('setups')
  const [dockVisible, setDockVisible] = useState(true)
  const [dockExpanded, setDockExpanded] = useState(true)
  const [dockTab, setDockTab] = useState<DockTab>('positions')
  const [signalScope, setSignalScope] = useState<'chart' | 'all'>('chart')
  const [mobileView, setMobileView] = useState<MobileView>('chart')

  const handleSelectMobileView = useCallback((view: MobileView) => {
    setMobileView(view)
    if (view === 'setups') {
      setInspectorOpen(true)
      setInspectorTab('setups')
    } else if (view === 'order') {
      setInspectorOpen(true)
      setInspectorTab('planner')
    } else if (view === 'risk') {
      setInspectorOpen(true)
      setInspectorTab('risk')
    } else if (view === 'positions') {
      setDockVisible(true)
      setDockExpanded(true)
    }
  }, [])

  // Symbol selector dropdown state
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false)
  const [pickerCategory, setPickerCategory] = useState<MarketCategory>(() =>
    getCategoryForSymbol(symbol)
  )
  const [symbolSearch, setSymbolSearch] = useState('')
  const symbolPickerRef = useRef<HTMLDivElement>(null)

  // Chart & scan state
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [candles, setCandles] = useState<Candle[]>([])
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null)
  const [lockedSignalId, setLockedSignalId] = useState<string | null>(null)
  const [focusTime, setFocusTime] = useState<UTCTimestamp | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)

  // Live quote & pending orders
  const [liveQuote, setLiveQuote] = useState<LiveQuote>({
    bid: null,
    ask: null,
    spreadPips: null,
    source: 'feed',
  })
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [closingPosId, setClosingPosId] = useState<string | null>(null)
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null)
  const [executingTrade, setExecutingTrade] = useState(false)
  const [executingChartSignal, setExecutingChartSignal] = useState(false)
  const [orderCopied, setOrderCopied] = useState(false)
  const [dismissedNoticeKeys, setDismissedNoticeKeys] = useState<string[]>([])

  // Manual planner state
  const [manualPlanner, setManualPlanner] = useState<ManualPlannerState>(() =>
    defaultPlannerLevels(symbol, undefined, 'BUY')
  )

  // Sync URL query params -> store
  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')
    const urlTimeframe = searchParams.get('timeframe')
    if (urlSymbol && urlSymbol !== symbol) setSymbol(urlSymbol as ChartSymbol)
    if (urlTimeframe && urlTimeframe !== timeframe) setTimeframe(urlTimeframe as ChartTimeframe)
  }, [searchParams, symbol, timeframe, setSymbol, setTimeframe])

  // Close symbol dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (symbolPickerRef.current && !symbolPickerRef.current.contains(e.target as Node)) {
        setSymbolPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Unlock all 5 engines cleanly if onboarding store only had 1 default or empty
  const activeEngineKebabs = useMemo<OnboardingStrategyId[]>(() => {
    const valid = selectedStrategyIds.filter((id) =>
      ENGINE_DEFINITIONS.some((e) => e.kebabId === id)
    )
    return valid.length > 0 ? valid : ENGINE_DEFINITIONS.map((e) => e.kebabId)
  }, [selectedStrategyIds])

  // Compute live per-engine counts & win rates from real signal store
  const engineStats = useMemo(() => {
    const counts: Record<string, number> = {}
    const wins: Record<string, number> = {}
    const settled: Record<string, number> = {}

    for (const def of ENGINE_DEFINITIONS) {
      counts[def.storeId] = 0
      wins[def.storeId] = 0
      settled[def.storeId] = 0
    }

    for (const sig of allSignals) {
      const kebab = normalizeStrategyToKebab(sig.strategyId)
      const def = ENGINE_DEFINITIONS.find((d) => d.kebabId === kebab)
      if (!def) continue
      counts[def.storeId] = (counts[def.storeId] ?? 0) + 1
      const st = (sig.status || '').toLowerCase()
      if (st === 'win' || st === 'tp_hit') {
        wins[def.storeId] = (wins[def.storeId] ?? 0) + 1
        settled[def.storeId] = (settled[def.storeId] ?? 0) + 1
      } else if (st === 'loss' || st === 'sl_hit') {
        settled[def.storeId] = (settled[def.storeId] ?? 0) + 1
      }
    }

    return { counts, wins, settled }
  }, [allSignals])

  // Keep useStrategyStore synchronized with the 5 engines + live store metrics
  useEffect(() => {
    const nextStrategies: Strategy[] = ENGINE_DEFINITIONS.map((def) => {
      const existing = storeStrategies.find((s) => s.id === def.storeId)
      const totalSignals = engineStats.counts[def.storeId] ?? 0
      const settledCount = engineStats.settled[def.storeId] ?? 0
      const winCount = engineStats.wins[def.storeId] ?? 0
      const active =
        existing !== undefined
          ? activeEngineKebabs.includes(def.kebabId)
          : activeEngineKebabs.includes(def.kebabId)

      return {
        id: def.storeId,
        name: def.name,
        description: def.description,
        active,
        winRate: settledCount > 0 ? winCount / settledCount : 0,
        totalSignals,
        avgRR: 2.2,
      }
    })

    const unchanged =
      storeStrategies.length === nextStrategies.length &&
      nextStrategies.every((s, idx) => {
        const cur = storeStrategies[idx]
        return (
          cur &&
          cur.id === s.id &&
          cur.active === s.active &&
          cur.totalSignals === s.totalSignals &&
          cur.winRate === s.winRate
        )
      })

    if (!unchanged) {
      setStoreStrategies(nextStrategies)
    }
  }, [activeEngineKebabs, engineStats, storeStrategies, setStoreStrategies])

  const handleToggleEngine = useCallback(
    (id: StrategyId) => {
      const def = ENGINE_DEFINITIONS.find((d) => d.storeId === id)
      if (!def) return
      toggleStoreStrategy(id)
      const currentlyOn = activeEngineKebabs.includes(def.kebabId)
      if (currentlyOn && activeEngineKebabs.length === 1) {
        setSelectedStrategies([def.kebabId])
        return
      }
      toggleSelectedStrategy(def.kebabId)
    },
    [activeEngineKebabs, setSelectedStrategies, toggleSelectedStrategy, toggleStoreStrategy]
  )

  const handleSelectSymbol = useCallback(
    (nextSym: SymbolOption) => {
      setSymbol(nextSym)
      setSearchParams({ symbol: nextSym, timeframe }, { replace: true })
      setSymbolPickerOpen(false)
      setSymbolSearch('')
    },
    [setSearchParams, setSymbol, timeframe]
  )

  const handleSelectTimeframe = useCallback(
    (nextTf: ChartTimeframe) => {
      setTimeframe(nextTf)
      setSearchParams({ symbol, timeframe: nextTf }, { replace: true })
    },
    [setSearchParams, setTimeframe, symbol]
  )

  // Fetch candles when symbol or timeframe changes
  useEffect(() => {
    let cancelled = false
    const initTimer = setTimeout(() => {
      setLoading(true)
      setHoveredSignalId(null)
      setLockedSignalId(null)
      setCandles([])
    }, 0)

    const loadCandles = async () => {
      const generatedCandles = await getCandles(symbol, timeframe, 2000)
      if (cancelled) return
      setCandles(generatedCandles)
      setLoading(false)
      const last = generatedCandles[generatedCandles.length - 1]
      setManualPlanner((prev) => ({
        ...defaultPlannerLevels(symbol, last, prev.action),
        activeOnChart: false,
      }))
    }

    void loadCandles()

    return () => {
      cancelled = true
      clearTimeout(initTimer)
    }
  }, [symbol, timeframe])

  // Real-time WebSocket candle updates
  useMarketWebSocket({
    symbol,
    timeframe,
    candles,
    enabled: candles.length > 0,
    onCandleUpdate: (nextCandles) => {
      setCandles(nextCandles as Candle[])
    },
  })

  // Fetch live broker quote & pending orders
  const fetchLiveQuote = useCallback(async () => {
    try {
      const res = await fetch(`/api/metaapi/quote?symbol=${encodeURIComponent(symbol)}`)
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.bid === 'number' && typeof data.ask === 'number') {
          setLiveQuote({
            bid: data.bid,
            ask: data.ask,
            spreadPips: typeof data.spreadPips === 'number' ? data.spreadPips : null,
            source: 'mt5',
          })
          return
        }
      }
    } catch {
      // Fall back to candle feed via effectiveBid/effectiveAsk
    }
    setLiveQuote({
      bid: null,
      ask: null,
      spreadPips: null,
      source: 'feed',
    })
  }, [symbol])

  const fetchPendingOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/metaapi/orders')
      if (res.ok) {
        const data = await res.json()
        setPendingOrders(Array.isArray(data.orders) ? data.orders : [])
      }
    } catch {
      // Endpoint unavailable when offline
    }
  }, [])

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchLiveQuote()
      void fetchPendingOrders()
    }, 0)
    const timer = setInterval(() => {
      void fetchLiveQuote()
      void fetchPendingOrders()
    }, 5000)
    return () => {
      clearTimeout(initialTimer)
      clearInterval(timer)
    }
  }, [fetchLiveQuote, fetchPendingOrders])

  // Fallback live bid/ask from latest candle when MT5 quote is offline
  const effectiveBid = liveQuote.bid ?? candles[candles.length - 1]?.close ?? null
  const effectiveAsk = liveQuote.ask ?? candles[candles.length - 1]?.close ?? null
  const effectiveSpreadPips = liveQuote.spreadPips

  // Signals filtered for current chart + active engines
  const activeEngineSet = useMemo(() => new Set<string>(activeEngineKebabs), [activeEngineKebabs])

  const chartSignals = useMemo(() => {
    const bySetup = new Map<string, StoredSignal>()
    for (const signal of allSignals) {
      if (signal.symbol !== symbol || signal.timeframe !== timeframe) continue
      if (!activeEngineSet.has(normalizeStrategyToKebab(signal.strategyId))) continue
      const key = signalMarkerKey(signal)
      const existing = bySetup.get(key)
      if (!existing || (existing.status !== 'live' && signal.status === 'live')) {
        bySetup.set(key, signal)
      }
    }
    return Array.from(bySetup.values()).sort((a, b) => b.time - a.time)
  }, [activeEngineSet, allSignals, symbol, timeframe])

  const feedSignals = useMemo(() => {
    if (signalScope === 'chart') return chartSignals
    return allSignals
      .filter((s) => activeEngineSet.has(normalizeStrategyToKebab(s.strategyId)))
      .slice(0, 60)
  }, [activeEngineSet, allSignals, chartSignals, signalScope])

  const hoveredSignal = useMemo(
    () => chartSignals.find((s) => s.id === hoveredSignalId) ?? null,
    [chartSignals, hoveredSignalId]
  )

  const lockedSignal = useMemo(
    () => chartSignals.find((s) => s.id === lockedSignalId) ?? null,
    [chartSignals, lockedSignalId]
  )

  const activeLiveSignal = useMemo(
    () => chartSignals.find((s) => s.status === 'live') ?? null,
    [chartSignals]
  )

  const marketRiskContext = useMemo(
    () => getMarketRiskContext(symbol, timeframe, activeEngineKebabs.length),
    [symbol, timeframe, activeEngineKebabs.length]
  )

  // Account & Journal Analytics
  const liveEquity = account?.connected
    ? account.equity ?? account.balance ?? accountBalance
    : accountBalance
  const liveBalance = account?.connected
    ? account.balance ?? accountBalance
    : accountBalance

  const activeRiskUsd = useMemo(() => {
    if (riskMode === 'fixedAmount' && fixedRiskAmount > 0) {
      return fixedRiskAmount
    }
    return Math.max(1, (liveBalance * Math.max(0.1, riskPerTradePct)) / 100)
  }, [fixedRiskAmount, liveBalance, riskMode, riskPerTradePct])

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
      if (j.outcome === 'loss') count++
      else break
    }
    return count
  }, [journal])

  const totalOpenProfit = useMemo(
    () => metaPositions.reduce((sum, p) => sum + (p.profit || 0), 0),
    [metaPositions]
  )

  const dashboardStats = useMemo<DashboardStats>(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const startSec = Math.floor(start.getTime() / 1000)
    const signalsToday = allSignals.filter((s) => {
      const tSec = s.time > 1e12 ? Math.floor(s.time / 1000) : s.time
      return tSec >= startSec
    }).length

    const settled = journal.filter((j) => j.taken && (j.outcome === 'win' || j.outcome === 'loss'))
    const wins = settled.filter((j) => j.outcome === 'win').length
    const weeklyWinRate = settled.length > 0 ? wins / settled.length : 0

    return {
      signalsToday,
      weeklyWinRate,
      activeTrades: metaPositions.length + pendingOrders.length,
      pnlToday: totalOpenProfit,
    }
  }, [allSignals, journal, metaPositions.length, pendingOrders.length, totalOpenProfit])

  const currentLossPct = liveBalance > 0 ? (todayLoss / liveBalance) * 100 : 0

  const journalMarkers = useMemo(() => {
    return journal
      .filter(
        (j) =>
          j.symbol === symbol &&
          j.timeframe === timeframe &&
          j.createdAt > 0 &&
          (j.outcome === 'win' || j.outcome === 'loss' || j.outcome === 'breakeven')
      )
      .slice(0, 12)
      .map((j) => ({
        id: `hist-${j.id}`,
        time: Math.floor(j.createdAt / 1000) as UTCTimestamp,
        pnl: (j.outcome === 'loss' ? 'LOSS' : 'WIN') as 'WIN' | 'LOSS',
      }))
  }, [journal, symbol, timeframe])

  const chartMarkers = useMemo<ChartPanelMarker[]>(() => {
    const markerBySetup = new Map<string, ChartPanelMarker>()

    for (const s of chartSignals) {
      const isLive = s.status === 'live'
      const shortStrat =
        s.strategyLabel === 'Supply & Demand'
          ? 'S&D'
          : s.strategyLabel === 'Wick Rejection'
          ? 'WICK'
          : s.strategyLabel.split(' ')[0].toUpperCase()
      markerBySetup.set(signalMarkerKey(s), {
        time: s.time as UTCTimestamp,
        position: s.direction === 'BUY' ? 'belowBar' : 'aboveBar',
        shape: s.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
        color: isLive ? (s.direction === 'BUY' ? '#34D399' : '#F87171') : '#71717A',
        text: `${shortStrat} ${s.direction} ${s.confidence}%`,
      })
    }

    const historicalMarkers: ChartPanelMarker[] = journalMarkers.map((m) => ({
      time: m.time,
      position: 'inBar',
      shape: 'circle',
      color: '#71717A',
      text: m.pnl,
    }))

    return [...Array.from(markerBySetup.values()), ...historicalMarkers]
  }, [chartSignals, journalMarkers])

  // Manual planner computations
  const plannerRiskDist = Math.abs(manualPlanner.entry - manualPlanner.sl)
  const plannerRewardDist = Math.abs(manualPlanner.tp - manualPlanner.entry)
  const plannerRR = plannerRiskDist > 0 ? plannerRewardDist / plannerRiskDist : 0
  const plannerValid =
    manualPlanner.entry > 0 &&
    manualPlanner.sl > 0 &&
    manualPlanner.tp > 0 &&
    (manualPlanner.action === 'BUY'
      ? manualPlanner.sl < manualPlanner.entry && manualPlanner.tp > manualPlanner.entry
      : manualPlanner.sl > manualPlanner.entry && manualPlanner.tp < manualPlanner.entry)
  const plannerLots = plannerValid
    ? calculateLots(symbol, manualPlanner.entry, manualPlanner.sl, activeRiskUsd)
    : 0.01
  const plannerPotentialProfit = plannerValid ? activeRiskUsd * plannerRR : 0

  const activeSignalForChart = lockedSignal || hoveredSignal || activeLiveSignal

  const chartActiveSignal: ChartPanelActiveSignal | null =
    manualPlanner.activeOnChart && inspectorTab === 'planner'
      ? null
      : activeSignalForChart
      ? {
          id: activeSignalForChart.id,
          entry: activeSignalForChart.entry,
          sl: activeSignalForChart.sl,
          tp: activeSignalForChart.tp,
          action: activeSignalForChart.direction,
          entryTime: activeSignalForChart.time as UTCTimestamp,
          confidence:
            activeSignalForChart.confidence <= 1
              ? Math.round(activeSignalForChart.confidence * 100)
              : Math.round(activeSignalForChart.confidence),
          rr: activeSignalForChart.rr,
          locked: Boolean(lockedSignal),
          strategyLabel: activeSignalForChart.strategyLabel,
          risk: activeSignalForChart.risk,
          reason: activeSignalForChart.reason,
          lotSize: calculateLots(
            symbol,
            activeSignalForChart.entry,
            activeSignalForChart.sl,
            activeRiskUsd
          ),
          riskAmountUsd: activeRiskUsd,
        }
      : null

  const chartManualSetup: ChartPanelManualSetup | null =
    manualPlanner.activeOnChart && inspectorTab === 'planner'
      ? {
          entry: manualPlanner.entry,
          action: manualPlanner.action,
          sl: manualPlanner.sl,
          tp: manualPlanner.tp,
          generated: true,
          entryTime: manualPlanner.time,
          rr: plannerRR,
          entryType: manualPlanner.entryType,
          lotSize: plannerLots,
          riskAmountUsd: activeRiskUsd,
          valid: plannerValid,
          reason: [
            `${manualPlanner.entryType === 'limit' ? 'Limit' : 'Market'} ${manualPlanner.action} order anchored to ${formatPrice(manualPlanner.entry, undefined, symbol)}`,
            plannerValid
              ? `Sized for ${plannerLots.toFixed(2)} lots with $${activeRiskUsd.toFixed(2)} max risk (${plannerRR.toFixed(2)}R target)`
              : manualPlanner.action === 'BUY'
              ? 'Invalid geometry: ensure SL < Entry < TP'
              : 'Invalid geometry: ensure TP < Entry < SL',
          ],
        }
      : null

  // Chart interactions
  const handleCrosshairMove = useCallback(
    (time: UTCTimestamp | null) => {
      if (chartSignals.length === 0 || time == null) {
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
      const closest = chartSignals.find((s) => Math.abs(s.time - time) <= tolerance) ?? null

      if (closest) {
        setHoveredSignalId(closest.id)
      } else if (!lockedSignalId) {
        setHoveredSignalId(null)
      }
    },
    [chartSignals, lockedSignalId, timeframe]
  )

  const handleChartClick = useCallback(
    ({ point, time, price }: { point?: { x: number; y: number }; time?: Time; price?: number | null }) => {
      if (!point) return
      const clickedTime = typeof time === 'number' ? (time as UTCTimestamp) : null

      if (clickedTime != null) {
        const nearestSignal = chartSignals.find((s) => s.time === clickedTime) ?? null
        if (nearestSignal) {
          setLockedSignalId(nearestSignal.id)
          setHoveredSignalId(nearestSignal.id)
          setFocusTime(nearestSignal.time as UTCTimestamp)
          setFocusNonce((n) => n + 1)
          setInspectorOpen(true)
          setInspectorTab('setups')
          return
        }
      }

      if (price == null) return

      const digits = priceDigits(symbol)
      const entry = Number(price.toFixed(digits))
      const fallbackTime =
        candles[candles.length - 1]?.time ?? (Math.floor(Date.now() / 1000) as UTCTimestamp)
      const anchorTime = clickedTime ?? fallbackTime

      let nearest = candles[0]
      for (const c of candles) {
        if (!nearest || Math.abs(c.time - anchorTime) < Math.abs(nearest.time - anchorTime)) {
          nearest = c
        }
      }

      const liveRef = effectiveBid ?? nearest?.close ?? entry
      const action: TradeAction = entry <= liveRef ? 'BUY' : 'SELL'
      const range = Math.max((nearest?.high ?? entry) - (nearest?.low ?? entry), entry * 0.0015)
      const levels = generateManualLevels(entry, action, range, digits)

      setLockedSignalId(null)
      setHoveredSignalId(null)
      setManualPlanner({
        time: anchorTime,
        entry,
        action,
        entryType: Math.abs(entry - liveRef) > entry * 0.0005 ? 'limit' : 'market',
        sl: levels.sl,
        tp: levels.tp,
        range,
        digits,
        activeOnChart: true,
      })
      setInspectorOpen(true)
      setInspectorTab('planner')
    },
    [candles, chartSignals, effectiveBid, symbol]
  )

  // Focus chart on any SignalCard click (cross-symbol capable)
  const handleFocusSignal = useCallback(
    (raw: DashboardSignalItem) => {
      const targetTime = (
        'time' in raw
          ? raw.time > 1e12
            ? Math.floor(raw.time / 1000)
            : raw.time
          : Math.floor(new Date(raw.timestamp).getTime() / 1000)
      ) as UTCTimestamp

      if (raw.symbol !== symbol || raw.timeframe !== timeframe) {
        setSymbol(raw.symbol as ChartSymbol)
        setTimeframe(raw.timeframe as ChartTimeframe)
        setSearchParams({ symbol: raw.symbol, timeframe: raw.timeframe }, { replace: true })
      }

      setManualPlanner((prev) => ({ ...prev, activeOnChart: false }))
      setLockedSignalId(raw.id)
      setHoveredSignalId(raw.id)
      setFocusTime(targetTime)
      setFocusNonce((n) => n + 1)
      setMobileView('chart')
    },
    [setSearchParams, setSymbol, setTimeframe, symbol, timeframe]
  )

  // Manual Scan action
  const handleManualScan = async () => {
    if (scanning) return
    setScanning(true)
    try {
      void fetch('/api/scanner/trigger', { method: 'POST' }).catch(() => {})

      const [freshCandles, backendGlobal] = await Promise.all([
        getCandles(symbol, timeframe, 2000),
        fetch(
          `/api/global-signals?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        refreshAccount(),
        refreshPositions(),
        fetchPendingOrders(),
        fetchLiveQuote(),
      ])

      if (freshCandles.length > 0) {
        setCandles(freshCandles)
      }

      const detected = runSignalsForStrategies(freshCandles, symbol, timeframe, activeEngineKebabs)
      const storedDetected: StoredSignal[] = detected.map((s) => ({
        ...s,
        symbol,
        timeframe,
        status: 'live',
      }))

      const backendSignals: StoredSignal[] = Array.isArray(backendGlobal?.signals)
        ? backendGlobal.signals
        : []

      const merged = [...storedDetected, ...backendSignals]
      if (merged.length > 0) {
        addSignals(merged)
      }

      if (storedDetected.length > 0) {
        showToast(
          'Scan Complete',
          `${storedDetected.length} live setup(s) detected on ${symbol} ${timeframe}`,
          'success'
        )
      } else {
        showToast(
          'Scan Complete',
          `Candles & MT5 synced — no new active setup on ${symbol} ${timeframe}`,
          'info'
        )
      }
    } catch {
      showToast('Scan Notice', 'Unable to complete manual scan on current feed', 'error')
    } finally {
      setScanning(false)
    }
  }

  // Execute trade helper for SignalCard & Obsidian Briefing Card
  const handleExecuteSignal = async (raw: DashboardSignalItem, lotSize: number) => {
    const direction = 'signal' in raw ? raw.signal : raw.direction
    if (direction === 'NO_TRADE') return
    const result = await executeManualTrade({
      symbol: raw.symbol,
      action: direction,
      volume: lotSize,
      sl: raw.sl,
      tp: raw.tp,
    })
    if (result?.success) {
      showToast(
        'Trade Executed',
        `${direction} ${lotSize}L ${raw.symbol} placed on Exness MT5`,
        'success'
      )
      await fetchPendingOrders()
    } else {
      showToast(
        'MT5 Notice',
        result?.error || `Calculated ${lotSize}L — MetaApi terminal standby`,
        'info'
      )
    }
  }

  const handleExecuteChartSignal = async () => {
    if (!activeSignalForChart || executingChartSignal) return
    const lotSize = calculateLots(
      symbol,
      activeSignalForChart.entry,
      activeSignalForChart.sl,
      activeRiskUsd
    )
    try {
      setExecutingChartSignal(true)
      await handleExecuteSignal(activeSignalForChart, lotSize)
    } finally {
      setExecutingChartSignal(false)
    }
  }

  // Log decision helper
  const handleLogSignalDecision = (raw: DashboardSignalItem, taken: boolean) => {
    const direction = 'signal' in raw ? raw.signal : raw.direction
    if (direction === 'NO_TRADE') return
    const confidence =
      'strategyLabel' in raw ? Math.round(raw.confidence) : Math.round(raw.confidence * 100)
    const strategyLabel =
      'strategyLabel' in raw ? raw.strategyLabel : raw.strategy_id.replace(/[_-]/g, ' ')
    const risk: RiskLabel = 'risk' in raw ? raw.risk : riskFromConfidence(confidence)
    const key = `auto:${raw.symbol}:${raw.timeframe}:${raw.id}`
    const lots = calculateLots(raw.symbol, raw.entry, raw.sl, activeRiskUsd)

    logSuggestionDecision({
      suggestionKey: key,
      symbol: raw.symbol,
      timeframe: raw.timeframe,
      strategy: strategyLabel,
      action: direction,
      entry: raw.entry,
      sl: raw.sl,
      tp: raw.tp,
      confidence,
      risk,
      suggestedPosition: lots,
      riskAmount: activeRiskUsd,
      taken,
      outcome: taken ? 'pending' : 'skipped',
    })
    showToast(
      taken ? 'Trade Logged' : 'Setup Skipped',
      `${direction} ${raw.symbol} saved to journal`,
      'info'
    )
  }

  const handlePlannerFieldChange = (field: 'entry' | 'sl' | 'tp', raw: string) => {
    const val = parseFloat(raw)
    if (Number.isNaN(val)) return
    setManualPlanner((prev) => ({
      ...prev,
      [field]: val,
      activeOnChart: true,
    }))
  }

  const handlePlannerAutoLevels = () => {
    const last = candles[candles.length - 1]
    const range = last
      ? Math.max(last.high - last.low, manualPlanner.entry * 0.002)
      : manualPlanner.range
    const levels = generateManualLevels(
      manualPlanner.entry,
      manualPlanner.action,
      range,
      manualPlanner.digits
    )
    setManualPlanner((prev) => ({
      ...prev,
      sl: levels.sl,
      tp: levels.tp,
      range,
      activeOnChart: true,
    }))
  }

  const handlePlannerSnapLive = () => {
    const live = manualPlanner.action === 'BUY' ? effectiveAsk : effectiveBid
    if (!live) return
    const rounded = Number(live.toFixed(manualPlanner.digits))
    const levels = generateManualLevels(
      rounded,
      manualPlanner.action,
      manualPlanner.range,
      manualPlanner.digits
    )
    setManualPlanner((prev) => ({
      ...prev,
      entry: rounded,
      sl: levels.sl,
      tp: levels.tp,
      entryType: 'market',
      activeOnChart: true,
    }))
  }

  const handleExecutePlanner = async () => {
    if (!plannerValid || executingTrade) return
    try {
      setExecutingTrade(true)
      const res = await fetch('/api/metaapi/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          action: manualPlanner.action,
          volume: plannerLots,
          sl: manualPlanner.sl,
          tp: manualPlanner.tp,
          entryType: manualPlanner.entryType,
          price: manualPlanner.entryType === 'limit' ? manualPlanner.entry : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showToast(
          'Order Placed',
          `${manualPlanner.entryType.toUpperCase()} ${manualPlanner.action} ${plannerLots}L ${symbol} sent to MT5`,
          'success'
        )
        await Promise.all([refreshPositions(), refreshAccount(), fetchPendingOrders()])
      } else {
        showToast(
          'Exness MT5 Notice',
          data.error || `Lot Size ${plannerLots}L — broker bridge standby`,
          'info'
        )
      }
    } catch {
      showToast('Execution Error', 'Unable to connect to MT5 execution endpoint', 'error')
    } finally {
      setExecutingTrade(false)
    }
  }

  const handleCancelPendingOrder = async (orderId: string) => {
    try {
      setCancelingOrderId(orderId)
      const res = await fetch('/api/metaapi/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (data.success || data.ok) {
        showToast('Order Cancelled', `Pending order ${orderId} cancelled`, 'success')
        await fetchPendingOrders()
      } else {
        showToast('Cancel Notice', data.error || 'Unable to cancel order', 'info')
      }
    } catch {
      showToast('Server Error', 'Failed to reach pending order endpoint', 'error')
    } finally {
      setCancelingOrderId(null)
    }
  }

  // Risk & Behavior alerts (rendered inside Tab 3 Risk, zero chart clutter)
  const riskNotices = useMemo(() => {
    const items: Array<{ id: string; title: string; body: string; critical?: boolean }> = []
    if (consecutiveLosses >= 4) {
      items.push({
        id: `streak-${consecutiveLosses}`,
        title: 'Consecutive loss cooldown',
        body: `${displayName}, ${consecutiveLosses} consecutive losses recorded. Guardrail reduces risk exposure.`,
        critical: true,
      })
    }
    if (todayTakenCount >= autoTradeMaxPositions) {
      items.push({
        id: `overtrade-${todayTakenCount}`,
        title: 'Daily frequency warning',
        body: `${todayTakenCount} trades logged today (cap ${autoTradeMaxPositions}). Guard against overtrading.`,
      })
    }
    if (currentLossPct >= maxDailyLossPct) {
      items.push({
        id: `daily-cap-${symbol}`,
        title: 'Daily loss cap reached',
        body: `Loss threshold ${maxDailyLossPct}% exceeded. Stand down for remaining session.`,
        critical: true,
      })
    }
    if (marketRiskContext.riskLevel !== 'Low') {
      items.push({
        id: `market-${symbol}-${timeframe}`,
        title: marketRiskContext.title,
        body: marketRiskContext.userFacingWarning,
      })
    }
    return items.filter((n) => !dismissedNoticeKeys.includes(n.id))
  }, [
    autoTradeMaxPositions,
    consecutiveLosses,
    currentLossPct,
    dismissedNoticeKeys,
    displayName,
    marketRiskContext,
    maxDailyLossPct,
    symbol,
    timeframe,
    todayTakenCount,
  ])

  const lockedSuggestionKey = lockedSignal
    ? `auto:${symbol}:${timeframe}:${lockedSignal.id}`
    : null
  const lockedJournal = useMemo(
    () =>
      lockedSuggestionKey
        ? journal.find((j) => j.suggestionKey === lockedSuggestionKey) ?? null
        : null,
    [journal, lockedSuggestionKey]
  )

  const currentCatObj =
    MARKET_CATEGORIES.find((c) => c.id === pickerCategory) ?? MARKET_CATEGORIES[0]
  const displayedSymbols: SymbolOption[] = symbolSearch.trim()
    ? MARKET_CATEGORIES.flatMap((c) => c.symbols).filter((s) =>
        s.toLowerCase().includes(symbolSearch.trim().toLowerCase())
      )
    : currentCatObj.symbols

  const spreadAlert =
    effectiveSpreadPips != null && effectiveSpreadPips > autoTradeSpreadCapPips
  const activePositionsTotal = metaPositions.length + pendingOrders.length

  const isMobileInspectorView =
    mobileView === 'setups' || mobileView === 'order' || mobileView === 'risk'

  return (
    <div className="h-full min-h-0 bg-[#09090B] text-[#FAFAFA] flex flex-col overflow-hidden">
      {/* 1. SLEEK CONTROL HEADER */}
      <div className="px-3 sm:px-4 py-2 lg:py-1.5 lg:min-h-[52px] bg-[#09090B] border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 lg:gap-3 shrink-0 z-30">
        {/* Top Row on Mobile / Left Cluster on Desktop: Symbol Picker + Mobile Scan + Desktop Timeframes */}
        <div className="flex items-center justify-between lg:justify-start gap-2 sm:gap-2.5 min-w-0">
          <div className="relative shrink-0" ref={symbolPickerRef}>
            <button
              type="button"
              onClick={() => {
                if (!symbolPickerOpen) {
                  setPickerCategory(getCategoryForSymbol(symbol))
                }
                setSymbolPickerOpen((v) => !v)
              }}
              className={cn(
                'h-10 lg:h-auto rounded-full bg-[#141417] border px-3.5 py-1.5 text-[13px] font-medium flex items-center gap-2 transition-colors',
                symbolPickerOpen
                  ? 'border-white/[0.24] text-[#FAFAFA]'
                  : 'border-white/[0.08] text-[#FAFAFA] hover:border-white/[0.16]'
              )}
            >
              <span className="text-[12px] text-[#71717A]">
                {formatCategoryLabel(getCategoryForSymbol(symbol))}
              </span>
              <span className="font-semibold text-[#FAFAFA]">{symbol}</span>
              <PiCaretDown
                size={15}
                className={cn(
                  'text-[#71717A] transition-transform',
                  symbolPickerOpen && 'rotate-180'
                )}
              />
            </button>

            {symbolPickerOpen && (
              <div className="absolute top-12 lg:top-11 left-0 w-[min(340px,calc(100vw-1.5rem))] sm:w-[360px] rounded-2xl bg-[#111113] border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.75)] p-3.5 z-50 space-y-3">
                <div className="relative">
                  <PiMagnifyingGlass
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]"
                  />
                  <input
                    type="text"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search EURUSD, XAUUSD, NVDA..."
                    className="w-full h-10 lg:h-9 pl-9 pr-3 rounded-xl bg-[#161619] border border-white/[0.06] text-[13px] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-white/[0.18]"
                    autoFocus
                  />
                </div>

                {!symbolSearch.trim() && (
                  <div className="grid grid-cols-3 rounded-full bg-[#161619] p-1">
                    {MARKET_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setPickerCategory(cat.id)}
                        className={cn(
                          'min-h-[36px] lg:min-h-0 py-1 rounded-full text-[12px] font-medium transition-colors',
                          pickerCategory === cat.id
                            ? 'bg-white/[0.1] text-[#FAFAFA]'
                            : 'text-[#71717A] hover:text-[#A1A1AA]'
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto grid grid-cols-3 gap-1.5">
                  {displayedSymbols.map((sym) => {
                    const active = sym === symbol
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => handleSelectSymbol(sym)}
                        className={cn(
                          'h-10 lg:h-8 px-2.5 rounded-xl text-[13px] font-medium flex items-center justify-between transition-colors',
                          active
                            ? 'bg-white/[0.1] text-[#FAFAFA]'
                            : 'text-[#A1A1AA] hover:bg-white/[0.05] hover:text-[#FAFAFA]'
                        )}
                      >
                        <span>{sym}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Segmented Timeframe Pill */}
          <div className="hidden lg:flex items-center gap-0.5 rounded-full bg-[#141417] border border-white/[0.06] p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleSelectTimeframe(tf)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                  timeframe === tf
                    ? 'bg-white/[0.12] text-[#FAFAFA]'
                    : 'text-[#71717A] hover:text-[#A1A1AA]'
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Mobile Scan Action (aligned on Row 1 with Symbol Picker) */}
          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleManualScan()}
            className="lg:hidden h-10 rounded-full bg-[#141417] border border-white/[0.08] hover:border-white/[0.18] px-3.5 text-[13px] font-medium text-[#FAFAFA] flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
            title="Run multi-strategy scan & refresh MT5"
          >
            {scanning ? (
              <PiSpinnerGap size={15} className="animate-spin text-[#FAFAFA]" />
            ) : (
              <PiBroadcast size={15} className="text-[#A1A1AA]" />
            )}
            <span>{scanning ? 'Scanning...' : 'Scan'}</span>
          </button>
        </div>

        {/* Mobile Row 2: Touch-Friendly Full-Width Timeframe Strip */}
        <div className="lg:hidden grid grid-cols-6 gap-1 rounded-full bg-[#141417] border border-white/[0.06] p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleSelectTimeframe(tf)}
              className={cn(
                'h-8 rounded-full text-[12px] font-medium transition-colors text-center',
                timeframe === tf
                  ? 'bg-white/[0.12] text-[#FAFAFA]'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Center: Bare Inline Bid / Ask / Spread & Equity Telemetry (desktop) */}
        <div className="hidden lg:flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-4 text-[13px]">
            <span
              className="flex items-center gap-1.5"
              title={liveQuote.source === 'mt5' ? 'Live MT5 Quote' : 'Market Feed Quote'}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  liveQuote.source === 'mt5' ? 'bg-[#34D399]' : 'bg-[#71717A]'
                )}
              />
              <span className="text-[12px] text-[#71717A]">Bid</span>
              <span className="font-mono tabular-nums text-[#FAFAFA]">
                {effectiveBid != null ? formatPrice(effectiveBid, undefined, symbol) : '—'}
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <span className="text-[12px] text-[#71717A]">Ask</span>
              <span className="font-mono tabular-nums text-[#FAFAFA]">
                {effectiveAsk != null ? formatPrice(effectiveAsk, undefined, symbol) : '—'}
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <span className="text-[12px] text-[#71717A]">Spread</span>
              <span
                className={cn(
                  'font-mono tabular-nums',
                  spreadAlert ? 'text-[#F87171]' : 'text-[#A1A1AA]'
                )}
              >
                {effectiveSpreadPips != null ? `${effectiveSpreadPips.toFixed(1)}p` : '—'}
              </span>
            </span>
          </div>

          <span className="hidden xl:block w-px h-4 bg-white/[0.07]" aria-hidden="true" />

          <div className="hidden xl:flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                account?.connected ? 'bg-[#34D399]' : 'bg-[#71717A]'
              )}
              title={account?.connected ? 'Exness MT5 Connected' : 'Local Account Balance'}
            />
            <span className="text-[12px] text-[#71717A]">Equity</span>
            <span
              className={cn(
                'font-mono tabular-nums font-medium',
                liveEquity < liveBalance ? 'text-[#F87171]' : 'text-[#FAFAFA]'
              )}
            >
              ${liveEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Right: Clean Pill Actions (desktop) */}
        <div className="hidden lg:flex items-center gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleManualScan()}
            className="rounded-full bg-[#141417] border border-white/[0.08] hover:border-white/[0.18] px-3.5 py-1.5 text-[13px] font-medium text-[#FAFAFA] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Run multi-strategy scan & refresh MT5"
          >
            {scanning ? (
              <PiSpinnerGap size={15} className="animate-spin text-[#FAFAFA]" />
            ) : (
              <PiBroadcast size={15} className="text-[#A1A1AA]" />
            )}
            <span>{scanning ? 'Scanning...' : 'Scan'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDockVisible((v) => !v)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13px] font-medium flex items-center gap-2 transition-colors',
              dockVisible
                ? 'bg-white/[0.08] border-white/[0.14] text-[#FAFAFA]'
                : 'bg-[#141417] border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA]'
            )}
            title="Toggle Positions & Orders drawer"
          >
            <PiRows size={15} />
            <span>Positions</span>
            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[12px] font-mono tabular-nums leading-none text-[#FAFAFA]">
              {activePositionsTotal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13px] font-medium flex items-center gap-1.5 transition-colors',
              inspectorOpen
                ? 'bg-white/[0.08] border-white/[0.14] text-[#FAFAFA]'
                : 'bg-[#141417] border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA]'
            )}
            title="Toggle right inspector drawer"
          >
            <PiSidebarSimple size={15} />
            <span>Inspector</span>
          </button>
        </div>
      </div>

      {/* MOBILE WORKSPACE VIEW SWITCHER (< lg) */}
      <div className="lg:hidden px-3 py-2 bg-[#09090B] border-b border-white/[0.06] shrink-0 z-20">
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-[#111113] border border-white/[0.06] p-1">
          {(
            [
              { id: 'chart', label: 'Chart', count: 0, dot: false },
              { id: 'setups', label: 'Setups', count: chartSignals.length, dot: false },
              { id: 'order', label: 'Order', count: 0, dot: manualPlanner.activeOnChart },
              { id: 'risk', label: 'Risk', count: 0, dot: riskNotices.some((n) => n.critical) },
              { id: 'positions', label: 'Book', count: activePositionsTotal, dot: false },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectMobileView(tab.id)}
              className={cn(
                'relative min-h-[38px] px-1 rounded-lg text-[12px] font-medium transition-colors flex items-center justify-center gap-1 truncate',
                mobileView === tab.id
                  ? 'bg-white/[0.11] text-[#FAFAFA]'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              )}
            >
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && (
                <span className="font-mono text-[10px] tabular-nums px-1 py-0.5 rounded-full bg-white/[0.1] text-[#FAFAFA] leading-none">
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}
              {tab.dot && tab.count === 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 2. CHART-FIRST CANVAS + CALM 340px INSPECTOR DRAWER */}
      <div
        className={cn(
          'flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden',
          mobileView === 'positions' && 'hidden lg:flex'
        )}
      >
        {/* LEFT: Chart Canvas */}
        <div
          className={cn(
            'flex-1 min-w-0 relative bg-[#09090B] flex flex-col min-h-0',
            mobileView === 'chart' ? 'flex' : 'hidden lg:flex'
          )}
        >
          {/* Mobile Compact Live Quote & Equity Telemetry Bar */}
          <div className="lg:hidden flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.05] bg-[#0D0D10] text-[11.5px] overflow-x-auto shrink-0">
            <div className="flex items-center gap-3 shrink-0">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    liveQuote.source === 'mt5' ? 'bg-[#34D399]' : 'bg-[#71717A]'
                  )}
                />
                <span className="text-[#71717A]">Bid</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {effectiveBid != null ? formatPrice(effectiveBid, undefined, symbol) : '—'}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[#71717A]">Ask</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {effectiveAsk != null ? formatPrice(effectiveAsk, undefined, symbol) : '—'}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[#71717A]">Spd</span>
                <span
                  className={cn(
                    'font-mono tabular-nums',
                    spreadAlert ? 'text-[#F87171]' : 'text-[#A1A1AA]'
                  )}
                >
                  {effectiveSpreadPips != null ? `${effectiveSpreadPips.toFixed(1)}p` : '—'}
                </span>
              </span>
            </div>
            <span
              className={cn(
                'font-mono tabular-nums font-medium shrink-0',
                liveEquity < liveBalance ? 'text-[#F87171]' : 'text-[#FAFAFA]'
              )}
            >
              ${liveEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex-1 min-h-[340px] lg:min-h-0 relative flex flex-col">
            {candles.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
                {loading ? (
                  <div className="w-full max-w-2xl rounded-2xl bg-[#111113] border border-white/[0.07] h-[300px] sm:h-[340px] flex items-center justify-center">
                    <div className="flex items-center gap-2.5 text-[13px] text-[#A1A1AA]">
                      <PiSpinnerGap size={16} className="animate-spin text-[#FAFAFA]" />
                      <span>
                        Loading {symbol} {timeframe} market data...
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-3 rounded-2xl bg-[#111113] border border-white/[0.07] px-6 sm:px-8 py-7 max-w-md">
                    <p className="text-[14px] font-medium text-[#FAFAFA]">
                      No candle data available for {symbol} ({timeframe})
                    </p>
                    <p className="text-[13px] text-[#71717A]">
                      Reconnect or run a manual scan to refresh the feed.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleManualScan()}
                      className="h-10 lg:h-9 px-4 rounded-full bg-[#161619] border border-white/[0.08] hover:border-white/[0.18] text-[13px] font-medium text-[#FAFAFA] inline-flex items-center gap-2 transition-colors"
                    >
                      <PiArrowsClockwise size={15} />
                      <span>Retry feed</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ChartPanel
                hideHeader
                symbol={symbol}
                timeframe={timeframe}
                candles={candles}
                markers={chartMarkers}
                activeSignal={chartActiveSignal}
                manualSetup={chartManualSetup}
                onCrosshairMove={handleCrosshairMove}
                onChartClick={handleChartClick}
                onTimeframeChange={handleSelectTimeframe}
                onExecuteActiveSignal={handleExecuteChartSignal}
                onExecuteManualSetup={handleExecutePlanner}
                onClearSelection={() => {
                  setLockedSignalId(null)
                  setHoveredSignalId(null)
                  setManualPlanner((prev) => ({ ...prev, activeOnChart: false }))
                }}
                executingSetup={executingChartSignal || executingTrade}
                livePrice={effectiveBid}
                focusTime={focusTime}
                focusNonce={focusNonce}
                loading={loading || scanning}
              />
            )}
          </div>
        </div>

        {/* RIGHT: Calm 340px Collapsible Inspector Drawer (Full-Pane on Mobile) */}
        {(inspectorOpen || isMobileInspectorView) && (
          <aside
            className={cn(
              'w-full lg:w-[340px] lg:shrink-0 lg:border-l border-white/[0.07] bg-[#111113] flex-col min-h-0',
              isMobileInspectorView ? 'flex flex-1 lg:flex-none' : 'hidden lg:flex',
              !inspectorOpen && 'lg:hidden'
            )}
          >
            {/* Clean Pill Tab Switcher (Desktop only — mobile uses top view switcher) */}
            <div className="hidden lg:block p-3 border-b border-white/[0.06] shrink-0">
              <div className="grid grid-cols-3 rounded-full bg-[#161619] p-1">
                {(
                  [
                    { id: 'setups', label: 'Setups' },
                    { id: 'planner', label: 'Order' },
                    { id: 'risk', label: 'Risk' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInspectorTab(tab.id)}
                    className={cn(
                      'h-8 rounded-full text-[13px] font-medium transition-colors truncate px-2',
                      inspectorTab === tab.id
                        ? 'bg-white/[0.1] text-[#FAFAFA]'
                        : 'text-[#71717A] hover:text-[#A1A1AA]'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TAB 1: SETUPS */}
            {inspectorTab === 'setups' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Scope Switch & Clear Lock */}
                <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSignalScope('chart')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                        signalScope === 'chart'
                          ? 'bg-white/[0.1] text-[#FAFAFA]'
                          : 'text-[#71717A] hover:text-[#A1A1AA]'
                      )}
                    >
                      {symbol} {timeframe}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignalScope('all')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                        signalScope === 'all'
                          ? 'bg-white/[0.1] text-[#FAFAFA]'
                          : 'text-[#71717A] hover:text-[#A1A1AA]'
                      )}
                    >
                      All markets
                    </button>
                  </div>

                  {lockedSignal && (
                    <button
                      type="button"
                      onClick={() => {
                        setLockedSignalId(null)
                        setHoveredSignalId(null)
                      }}
                      className="text-[12px] font-medium text-[#71717A] hover:text-[#FAFAFA] inline-flex items-center gap-1 transition-colors"
                    >
                      <PiX size={15} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {/* Locked Journal Quick Outcome Strip (when logged as taken) */}
                {lockedSignal && lockedJournal?.taken && lockedSuggestionKey && (
                  <div className="px-4 py-3 border-b border-white/[0.06] bg-[#161619]/60 space-y-2 shrink-0">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[#A1A1AA] font-medium truncate">
                        Record outcome · {lockedSignal.strategyLabel}
                      </span>
                      <span className="font-mono tabular-nums text-[#71717A]">
                        {calculateLots(symbol, lockedSignal.entry, lockedSignal.sl, activeRiskUsd)}L
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['win', 'loss', 'breakeven'] as const).map((outcome) => (
                        <button
                          key={outcome}
                          type="button"
                          onClick={() => setJournalOutcome(lockedSuggestionKey, outcome)}
                          className={cn(
                            'h-7 rounded-lg text-[12px] font-medium transition-colors',
                            lockedJournal.outcome === outcome
                              ? outcome === 'win'
                                ? 'bg-[#34D399]/15 text-[#34D399]'
                                : outcome === 'loss'
                                ? 'bg-[#F87171]/15 text-[#F87171]'
                                : 'bg-white/[0.1] text-[#FAFAFA]'
                              : 'bg-[#111113] text-[#71717A] hover:text-[#FAFAFA]'
                          )}
                        >
                          {outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Breakeven'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* SignalFeed */}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <SignalFeed
                    signals={feedSignals}
                    selectedSignalId={lockedSignalId}
                    riskAmountUsd={activeRiskUsd}
                    onFocusSignal={handleFocusSignal}
                    onExecuteSignal={handleExecuteSignal}
                    onLogDecision={handleLogSignalDecision}
                    className="flex-1 min-h-0"
                  />
                </div>

                {/* Strategy Engines Matrix */}
                <div className="shrink-0">
                  <StrategyPanel
                    compact
                    strategies={storeStrategies}
                    onToggle={handleToggleEngine}
                    signalCounts={engineStats.counts}
                  />
                </div>
              </div>
            )}

            {/* TAB 2: ORDER (Manual Planner) */}
            {inspectorTab === 'planner' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
                {/* Active Symbol + Order Type */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold text-[#FAFAFA]">Order builder</p>
                    <p className="text-[12px] text-[#71717A]">
                      {symbol} · {timeframe}
                    </p>
                  </div>
                  <div className="flex items-center rounded-full bg-[#161619] p-1">
                    {(['market', 'limit'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setManualPlanner((prev) => ({
                            ...prev,
                            entryType: type,
                            activeOnChart: true,
                          }))
                        }
                        className={cn(
                          'px-3 py-1 rounded-full text-[12px] font-medium transition-colors',
                          manualPlanner.entryType === type
                            ? 'bg-white/[0.12] text-[#FAFAFA]'
                            : 'text-[#71717A] hover:text-[#A1A1AA]'
                        )}
                      >
                        {type === 'market' ? 'Market' : 'Limit'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buy / Sell Selector */}
                <div className="grid grid-cols-2 gap-2">
                  {(['BUY', 'SELL'] as const).map((side) => {
                    const active = manualPlanner.action === side
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => {
                          const levels = generateManualLevels(
                            manualPlanner.entry,
                            side,
                            manualPlanner.range,
                            manualPlanner.digits
                          )
                          setManualPlanner((prev) => ({
                            ...prev,
                            action: side,
                            sl: levels.sl,
                            tp: levels.tp,
                            activeOnChart: true,
                          }))
                        }}
                        className={cn(
                          'h-11 lg:h-9 rounded-xl border text-[13px] font-semibold transition-colors',
                          active
                            ? side === 'BUY'
                              ? 'bg-[#34D399]/15 border-[#34D399]/40 text-[#34D399]'
                              : 'bg-[#F87171]/15 border-[#F87171]/40 text-[#F87171]'
                            : 'bg-[#161619] border-white/[0.06] text-[#71717A] hover:text-[#FAFAFA]'
                        )}
                      >
                        {side === 'BUY' ? 'Buy' : 'Sell'}
                      </button>
                    )
                  })}
                </div>

                {/* Risk Allocation */}
                <div className="pt-4 border-t border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[#A1A1AA]">Risk allocation</span>
                    <div className="flex items-center rounded-full bg-[#161619] p-0.5">
                      <button
                        type="button"
                        onClick={() => setRiskMode('percentage')}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                          riskMode === 'percentage'
                            ? 'bg-white/[0.1] text-[#FAFAFA]'
                            : 'text-[#71717A] hover:text-[#A1A1AA]'
                        )}
                      >
                        % equity
                      </button>
                      <button
                        type="button"
                        onClick={() => setRiskMode('fixedAmount')}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
                          riskMode === 'fixedAmount'
                            ? 'bg-white/[0.1] text-[#FAFAFA]'
                            : 'text-[#71717A] hover:text-[#A1A1AA]'
                        )}
                      >
                        $ USD
                      </button>
                    </div>
                  </div>

                  {riskMode === 'percentage' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="number"
                          min={0.1}
                          max={10}
                          step={0.1}
                          value={riskPerTradePct}
                          onChange={(e) => setRiskPerTradePct(parseFloat(e.target.value) || 0.5)}
                          className="h-9 flex-1 px-3 rounded-xl bg-[#161619] border border-white/[0.06] focus:border-white/[0.2] text-[13px] font-mono tabular-nums text-[#FAFAFA] focus:outline-none"
                        />
                        <span className="text-[13px] font-mono tabular-nums text-[#A1A1AA]">
                          ${activeRiskUsd.toFixed(2)}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0.5, 1.0, 2.0, 3.0].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setRiskPerTradePct(pct)}
                            className={cn(
                              'h-7 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                              riskPerTradePct === pct
                                ? 'bg-white/[0.12] text-[#FAFAFA]'
                                : 'bg-[#161619] text-[#71717A] hover:text-[#FAFAFA]'
                            )}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={fixedRiskAmount || ''}
                          onChange={(e) => setFixedRiskAmount(parseFloat(e.target.value) || 0)}
                          className="h-9 flex-1 px-3 rounded-xl bg-[#161619] border border-white/[0.06] focus:border-white/[0.2] text-[13px] font-mono tabular-nums text-[#FAFAFA] focus:outline-none"
                        />
                        <span className="text-[12px] text-[#71717A]">USD</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[10, 25, 50, 100, 250].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setFixedRiskAmount(amt)}
                            className={cn(
                              'h-7 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                              fixedRiskAmount === amt
                                ? 'bg-white/[0.12] text-[#FAFAFA]'
                                : 'bg-[#161619] text-[#71717A] hover:text-[#FAFAFA]'
                            )}
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Price Levels */}
                <div className="pt-4 border-t border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[#A1A1AA]">Price levels</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handlePlannerSnapLive}
                        className="text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                      >
                        Snap live
                      </button>
                      <button
                        type="button"
                        onClick={handlePlannerAutoLevels}
                        className="text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                      >
                        Auto 2.2R
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="w-16 text-[12px] text-[#71717A]">Entry</label>
                      <input
                        type="number"
                        step="any"
                        value={manualPlanner.entry}
                        onChange={(e) => handlePlannerFieldChange('entry', e.target.value)}
                        className="h-9 flex-1 px-3 rounded-xl bg-[#161619] border border-white/[0.06] focus:border-white/[0.2] text-[13px] font-mono tabular-nums text-[#FAFAFA] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-16 text-[12px] text-[#F87171]">Stop loss</label>
                      <input
                        type="number"
                        step="any"
                        value={manualPlanner.sl}
                        onChange={(e) => handlePlannerFieldChange('sl', e.target.value)}
                        className="h-9 flex-1 px-3 rounded-xl bg-[#161619] border border-[#F87171]/25 focus:border-[#F87171]/60 text-[13px] font-mono tabular-nums text-[#F87171] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-16 text-[12px] text-[#34D399]">Target</label>
                      <input
                        type="number"
                        step="any"
                        value={manualPlanner.tp}
                        onChange={(e) => handlePlannerFieldChange('tp', e.target.value)}
                        className="h-9 flex-1 px-3 rounded-xl bg-[#161619] border border-[#34D399]/25 focus:border-[#34D399]/60 text-[13px] font-mono tabular-nums text-[#34D399] focus:outline-none"
                      />
                    </div>
                  </div>

                  {!plannerValid && (
                    <p className="text-[12px] text-[#F87171]">
                      {manualPlanner.action === 'BUY'
                        ? 'Invalid Buy levels: require SL < Entry < TP'
                        : 'Invalid Sell levels: require TP < Entry < SL'}
                    </p>
                  )}
                </div>

                {/* Unboxed Output Summary */}
                <div className="pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <span className="block text-[12px] text-[#71717A]">Position size</span>
                    <span className="block text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-0.5">
                      {plannerValid ? `${plannerLots.toFixed(2)} lots` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] text-[#71717A]">Risk / reward</span>
                    <span className="block text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-0.5">
                      {plannerValid ? `${plannerRR.toFixed(2)}R` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] text-[#71717A]">Max loss</span>
                    <span className="block text-[13px] font-mono tabular-nums text-[#F87171] mt-0.5">
                      -${activeRiskUsd.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] text-[#71717A]">Target profit</span>
                    <span className="block text-[13px] font-mono tabular-nums text-[#34D399] mt-0.5">
                      +${plannerPotentialProfit.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Execution & Chart Preview Controls */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    disabled={!plannerValid || executingTrade}
                    onClick={() => void handleExecutePlanner()}
                    className={cn(
                      'w-full h-11 lg:h-10 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50',
                      manualPlanner.action === 'BUY'
                        ? 'bg-[#34D399]/15 border-[#34D399]/30 text-[#34D399] hover:bg-[#34D399]/25'
                        : 'bg-[#F87171]/15 border-[#F87171]/30 text-[#F87171] hover:bg-[#F87171]/25'
                    )}
                  >
                    {executingTrade ? (
                      <PiSpinnerGap size={16} className="animate-spin" />
                    ) : (
                      <PiLightning size={16} />
                    )}
                    <span>
                      {executingTrade
                        ? 'Submitting to MT5...'
                        : `Execute ${manualPlanner.entryType === 'limit' ? 'Limit' : 'Market'} ${
                            manualPlanner.action === 'BUY' ? 'Buy' : 'Sell'
                          }`}
                    </span>
                    {!executingTrade && (
                      <span className="font-mono tabular-nums text-[12px] opacity-85">
                        ({plannerLots}L)
                      </span>
                    )}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const payload = formatMT4OrderClipboardPayload({
                          symbol,
                          direction: manualPlanner.action,
                          entry: manualPlanner.entry,
                          sl: manualPlanner.sl,
                          tp: manualPlanner.tp,
                          riskAmount: activeRiskUsd,
                        })
                        void navigator.clipboard.writeText(payload)
                        setOrderCopied(true)
                        setTimeout(() => setOrderCopied(false), 1800)
                      }}
                      className="h-9 rounded-xl bg-[#161619] hover:bg-white/[0.08] border border-white/[0.06] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {orderCopied ? (
                        <PiCheck size={15} className="text-[#34D399]" />
                      ) : (
                        <PiCopy size={15} />
                      )}
                      <span>{orderCopied ? 'Copied' : 'Copy plan'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setManualPlanner((prev) => ({
                          ...prev,
                          activeOnChart: !prev.activeOnChart,
                        }))
                      }
                      className={cn(
                        'h-9 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors',
                        manualPlanner.activeOnChart
                          ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA]'
                          : 'bg-[#161619] border-white/[0.06] text-[#A1A1AA] hover:text-[#FAFAFA]'
                      )}
                    >
                      <PiCrosshair size={15} />
                      <span>{manualPlanner.activeOnChart ? 'On chart' : 'Preview'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RISK */}
            {inspectorTab === 'risk' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                <StatsRow compact stats={dashboardStats} />

                <RiskPanel
                  maxDailyLoss={maxDailyLossPct}
                  currentLoss={currentLossPct}
                  riskPerTrade={riskPerTradePct}
                  maxTrades={autoTradeMaxPositions}
                  tradesUsed={todayTakenCount}
                  accountBalance={liveBalance}
                  equity={liveEquity}
                  marginUsed={account?.margin}
                  freeMargin={account?.freeMargin}
                  openPositionsCount={metaPositions.length}
                  maxPositions={autoTradeMaxPositions}
                  consecutiveLosses={consecutiveLosses}
                  spreadPips={effectiveSpreadPips}
                  maxSpreadPips={autoTradeSpreadCapPips}
                  sessionFilter={autoTradeSessionFilter}
                  marketRiskTitle={marketRiskContext.title}
                  marketRiskLevel={marketRiskContext.riskLevel}
                  marketRiskSummary={marketRiskContext.summary}
                  riskMode={riskMode}
                  fixedRiskAmount={fixedRiskAmount}
                />

                {riskNotices.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    {riskNotices.map((notice) => (
                      <div
                        key={notice.id}
                        className={cn(
                          'p-3.5 rounded-xl border bg-[#161619] flex items-start justify-between gap-2.5',
                          notice.critical ? 'border-[#F87171]/30' : 'border-white/[0.06]'
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'text-[13px] font-medium',
                              notice.critical ? 'text-[#F87171]' : 'text-[#FAFAFA]'
                            )}
                          >
                            {notice.title}
                          </p>
                          <p className="text-[12px] text-[#A1A1AA] mt-1 leading-relaxed">
                            {notice.body}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDismissedNoticeKeys((prev) => [...prev, notice.id])}
                          className="text-[#71717A] hover:text-[#FAFAFA] shrink-0 p-0.5"
                          aria-label="Dismiss notice"
                        >
                          <PiX size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 3. COLLAPSIBLE BOTTOM POSITIONS & PENDING ORDERS SHEET (Full-Pane Book on Mobile) */}
      {(dockVisible || mobileView === 'positions') && (
        <section
          className={cn(
            'lg:border-t border-white/[0.07] bg-[#111113] lg:shrink-0 z-20 flex-col min-h-0',
            mobileView === 'positions' ? 'flex flex-1 lg:flex-none' : 'hidden lg:flex',
            !dockVisible && 'lg:hidden'
          )}
        >
          {/* Sheet Header */}
          <div className="min-h-[48px] lg:h-11 px-3 sm:px-4 py-2 lg:py-0 flex items-center justify-between gap-2 sm:gap-3 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="hidden sm:flex items-center gap-2">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    account?.connected ? 'bg-[#34D399]' : 'bg-[#71717A]'
                  )}
                />
                <span className="text-[13px] font-medium text-[#A1A1AA]">Exness MT5</span>
              </div>

              <div className="flex items-center gap-1 rounded-full bg-[#161619] p-0.5 max-w-full overflow-x-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDockTab('positions')
                    setDockExpanded(true)
                  }}
                  className={cn(
                    'h-8 lg:h-7 px-3 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0',
                    dockTab === 'positions'
                      ? 'bg-white/[0.1] text-[#FAFAFA]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  )}
                >
                  <span>Positions</span>
                  <span className="font-mono tabular-nums text-[#A1A1AA]">
                    {metaPositions.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDockTab('orders')
                    setDockExpanded(true)
                  }}
                  className={cn(
                    'h-8 lg:h-7 px-3 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0',
                    dockTab === 'orders'
                      ? 'bg-white/[0.1] text-[#FAFAFA]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  )}
                >
                  <span>Orders</span>
                  <span className="font-mono tabular-nums text-[#A1A1AA]">
                    {pendingOrders.length}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-[12px] text-[#71717A] hidden sm:inline">Net P&L</span>
                <span
                  className={cn(
                    'font-mono font-semibold tabular-nums',
                    totalOpenProfit >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                  )}
                >
                  {totalOpenProfit >= 0 ? '+' : '-'}${Math.abs(totalOpenProfit).toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  void refreshPositions()
                  void refreshAccount()
                  void fetchPendingOrders()
                }}
                className="w-9 h-9 lg:w-auto lg:h-auto lg:p-1.5 rounded-lg flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.05] transition-colors"
                title="Refresh MT5 positions & orders"
              >
                <PiArrowsClockwise size={15} className={cn(metaLoading && 'animate-spin')} />
              </button>

              <button
                type="button"
                onClick={() => setDockExpanded((v) => !v)}
                className="hidden lg:flex p-1.5 rounded-lg text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.05] transition-colors"
                title={dockExpanded ? 'Collapse sheet' : 'Expand sheet'}
              >
                {dockExpanded ? <PiCaretDown size={16} /> : <PiCaretUp size={16} />}
              </button>
            </div>
          </div>

          {/* Sheet Body */}
          {(dockExpanded || mobileView === 'positions') && (
            <div className="flex-1 lg:flex-none lg:max-h-48 overflow-auto">
              {dockTab === 'positions' ? (
                metaPositions.length === 0 ? (
                  <div className="py-10 lg:py-6 text-center text-[13px] text-[#71717A]">
                    No open positions on MT5
                  </div>
                ) : (
                  <>
                    {/* Mobile Position Cards (< md) */}
                    <div className="md:hidden p-3 space-y-2.5">
                      {metaPositions.map((pos) => {
                        const isBuy = pos.type.toUpperCase().includes('BUY')
                        const isCurrent = pos.symbol === symbol
                        return (
                          <div
                            key={pos.id}
                            onClick={() => {
                              setSymbol(pos.symbol as ChartSymbol)
                              setSearchParams({ symbol: pos.symbol, timeframe }, { replace: true })
                              setMobileView('chart')
                            }}
                            className={cn(
                              'rounded-xl border p-3.5 space-y-3 transition-colors',
                              isCurrent
                                ? 'bg-white/[0.04] border-white/[0.14]'
                                : 'bg-[#161619] border-white/[0.06]'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[14px] font-semibold text-[#FAFAFA]">
                                  {pos.symbol}
                                </span>
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded-md text-[11px] font-semibold',
                                    isBuy
                                      ? 'bg-[#34D399]/10 text-[#34D399]'
                                      : 'bg-[#F87171]/10 text-[#F87171]'
                                  )}
                                >
                                  {isBuy ? 'BUY' : 'SELL'}
                                </span>
                                <span className="text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                                  {pos.volume.toFixed(2)}L
                                </span>
                              </div>
                              <span
                                className={cn(
                                  'text-[14px] font-mono font-semibold tabular-nums',
                                  pos.profit >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                                )}
                              >
                                {pos.profit >= 0 ? '+' : '-'}${Math.abs(pos.profit).toFixed(2)}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[12px] pt-2 border-t border-white/[0.06]">
                              <div>
                                <span className="block text-[11px] text-[#71717A]">Entry</span>
                                <span className="font-mono tabular-nums text-[#FAFAFA]">
                                  {formatPrice(pos.openPrice, undefined, pos.symbol)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[11px] text-[#71717A]">Current</span>
                                <span className="font-mono tabular-nums text-[#FAFAFA]">
                                  {formatPrice(pos.currentPrice, undefined, pos.symbol)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[11px] text-[#71717A]">SL / TP</span>
                                <span className="font-mono tabular-nums text-[#A1A1AA] truncate block">
                                  {pos.sl ? formatPrice(pos.sl, undefined, pos.symbol) : '—'} /{' '}
                                  {pos.tp ? formatPrice(pos.tp, undefined, pos.symbol) : '—'}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={closingPosId === pos.id}
                              onClick={async (e) => {
                                e.stopPropagation()
                                try {
                                  setClosingPosId(pos.id)
                                  const res = await closeOpenPosition(pos.id)
                                  if (res?.success) {
                                    showToast(
                                      'Position Closed',
                                      `Closed ${pos.symbol} on Exness MT5`,
                                      'success'
                                    )
                                    await refreshPositions()
                                  } else {
                                    showToast('Notice', res?.error || 'Failed to close position', 'info')
                                  }
                                } finally {
                                  setClosingPosId(null)
                                }
                              }}
                              className="w-full h-10 rounded-xl bg-[#111113] hover:bg-[#F87171]/15 border border-white/[0.08] hover:border-[#F87171]/40 text-[13px] font-medium text-[#F87171] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {closingPosId === pos.id ? (
                                <PiSpinnerGap size={15} className="animate-spin" />
                              ) : (
                                <PiXCircle size={15} />
                              )}
                              <span>Close position</span>
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop Position Table (>= md) */}
                    <table className="hidden md:table w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#111113] border-b border-white/[0.06] text-[12px] font-medium text-[#71717A] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Symbol</th>
                        <th className="py-2.5 px-3 font-medium">Side</th>
                        <th className="py-2.5 px-3 text-right font-medium">Lots</th>
                        <th className="py-2.5 px-3 text-right font-medium">Entry</th>
                        <th className="py-2.5 px-3 text-right font-medium">Current</th>
                        <th className="py-2.5 px-3 text-right hidden md:table-cell font-medium">
                          SL / TP
                        </th>
                        <th className="py-2.5 px-3 text-right font-medium">Live P&L</th>
                        <th className="py-2.5 px-4 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {metaPositions.map((pos) => {
                        const isBuy = pos.type.toUpperCase().includes('BUY')
                        const isCurrent = pos.symbol === symbol
                        return (
                          <tr
                            key={pos.id}
                            onClick={() => {
                              setSymbol(pos.symbol as ChartSymbol)
                              setSearchParams({ symbol: pos.symbol, timeframe }, { replace: true })
                            }}
                            className={cn(
                              'cursor-pointer transition-colors',
                              isCurrent ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                            )}
                          >
                            <td className="py-2.5 px-4 font-semibold text-[#FAFAFA] whitespace-nowrap">
                              {pos.symbol}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={cn(
                                  'text-[12px] font-semibold',
                                  isBuy ? 'text-[#34D399]' : 'text-[#F87171]'
                                )}
                              >
                                {isBuy ? 'BUY' : 'SELL'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#A1A1AA]">
                              {pos.volume.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#FAFAFA]">
                              {formatPrice(pos.openPrice, undefined, pos.symbol)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#FAFAFA]">
                              {formatPrice(pos.currentPrice, undefined, pos.symbol)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#71717A] hidden md:table-cell">
                              {pos.sl ? formatPrice(pos.sl, undefined, pos.symbol) : '—'} /{' '}
                              {pos.tp ? formatPrice(pos.tp, undefined, pos.symbol) : '—'}
                            </td>
                            <td
                              className={cn(
                                'py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap',
                                pos.profit >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                              )}
                            >
                              {pos.profit >= 0 ? '+' : '-'}${Math.abs(pos.profit).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                disabled={closingPosId === pos.id}
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  try {
                                    setClosingPosId(pos.id)
                                    const res = await closeOpenPosition(pos.id)
                                    if (res?.success) {
                                      showToast(
                                        'Position Closed',
                                        `Closed ${pos.symbol} on Exness MT5`,
                                        'success'
                                      )
                                      await refreshPositions()
                                    } else {
                                      showToast('Notice', res?.error || 'Failed to close position', 'info')
                                    }
                                  } finally {
                                    setClosingPosId(null)
                                  }
                                }}
                                className="h-7 px-2.5 rounded-lg bg-[#161619] hover:bg-[#F87171]/15 border border-white/[0.08] hover:border-[#F87171]/40 text-[12px] font-medium text-[#F87171] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                {closingPosId === pos.id ? (
                                  <PiSpinnerGap size={15} className="animate-spin" />
                                ) : (
                                  <PiXCircle size={15} />
                                )}
                                <span>Close</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </>
                )
              ) : pendingOrders.length === 0 ? (
                <div className="py-10 lg:py-6 text-center text-[13px] text-[#71717A]">
                  No pending MT5 limit or stop orders
                </div>
              ) : (
                <>
                  {/* Mobile Pending Order Cards (< md) */}
                  <div className="md:hidden p-3 space-y-2.5">
                    {pendingOrders.map((order) => {
                      const isBuy = order.type.toUpperCase().includes('BUY')
                      return (
                        <div
                          key={order.id}
                          onClick={() => {
                            setSymbol(order.symbol as ChartSymbol)
                            setSearchParams({ symbol: order.symbol, timeframe }, { replace: true })
                            setMobileView('chart')
                          }}
                          className="rounded-xl border border-white/[0.06] bg-[#161619] p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[14px] font-semibold text-[#FAFAFA]">
                                {order.symbol}
                              </span>
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-md text-[11px] font-semibold',
                                  isBuy
                                    ? 'bg-[#34D399]/10 text-[#34D399]'
                                    : 'bg-[#F87171]/10 text-[#F87171]'
                                )}
                              >
                                {order.type.replace('ORDER_TYPE_', '').replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span className="text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                              {order.volume.toFixed(2)}L · {order.state ?? 'Placed'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-[12px] pt-2 border-t border-white/[0.06]">
                            <div>
                              <span className="block text-[11px] text-[#71717A]">Limit</span>
                              <span className="font-mono tabular-nums text-[#FAFAFA]">
                                {formatPrice(order.openPrice, undefined, order.symbol)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[11px] text-[#71717A]">Current</span>
                              <span className="font-mono tabular-nums text-[#A1A1AA]">
                                {order.currentPrice != null
                                  ? formatPrice(order.currentPrice, undefined, order.symbol)
                                  : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[11px] text-[#71717A]">SL / TP</span>
                              <span className="font-mono tabular-nums text-[#A1A1AA] truncate block">
                                {order.sl ? formatPrice(order.sl, undefined, order.symbol) : '—'} /{' '}
                                {order.tp ? formatPrice(order.tp, undefined, order.symbol) : '—'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={cancelingOrderId === order.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleCancelPendingOrder(order.id)
                            }}
                            className="w-full h-10 rounded-xl bg-[#111113] hover:bg-[#F87171]/15 border border-white/[0.08] hover:border-[#F87171]/40 text-[13px] font-medium text-[#F87171] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            {cancelingOrderId === order.id ? (
                              <PiSpinnerGap size={15} className="animate-spin" />
                            ) : (
                              <PiXCircle size={15} />
                            )}
                            <span>Cancel order</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop Pending Orders Table (>= md) */}
                  <table className="hidden md:table w-full text-left border-collapse text-[13px]">
                  <thead className="bg-[#111113] border-b border-white/[0.06] text-[12px] font-medium text-[#71717A] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Symbol</th>
                      <th className="py-2.5 px-3 font-medium">Type</th>
                      <th className="py-2.5 px-3 text-right font-medium">Lots</th>
                      <th className="py-2.5 px-3 text-right font-medium">Limit price</th>
                      <th className="py-2.5 px-3 text-right font-medium">Current</th>
                      <th className="py-2.5 px-3 text-right hidden md:table-cell font-medium">
                        SL / TP
                      </th>
                      <th className="py-2.5 px-3 text-right font-medium">State</th>
                      <th className="py-2.5 px-4 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {pendingOrders.map((order) => {
                      const isBuy = order.type.toUpperCase().includes('BUY')
                      return (
                        <tr
                          key={order.id}
                          onClick={() => {
                            setSymbol(order.symbol as ChartSymbol)
                            setSearchParams({ symbol: order.symbol, timeframe }, { replace: true })
                          }}
                          className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="py-2.5 px-4 font-semibold text-[#FAFAFA] whitespace-nowrap">
                            {order.symbol}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                'text-[12px] font-semibold',
                                isBuy ? 'text-[#34D399]' : 'text-[#F87171]'
                              )}
                            >
                              {order.type.replace('ORDER_TYPE_', '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#A1A1AA]">
                            {order.volume.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#FAFAFA]">
                            {formatPrice(order.openPrice, undefined, order.symbol)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#A1A1AA]">
                            {order.currentPrice != null
                              ? formatPrice(order.currentPrice, undefined, order.symbol)
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#71717A] hidden md:table-cell">
                            {order.sl ? formatPrice(order.sl, undefined, order.symbol) : '—'} /{' '}
                            {order.tp ? formatPrice(order.tp, undefined, order.symbol) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[12px] text-[#A1A1AA]">
                            {order.state ?? 'Placed'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              disabled={cancelingOrderId === order.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleCancelPendingOrder(order.id)
                              }}
                              className="h-7 px-2.5 rounded-lg bg-[#161619] hover:bg-[#F87171]/15 border border-white/[0.08] hover:border-[#F87171]/40 text-[12px] font-medium text-[#F87171] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {cancelingOrderId === order.id ? (
                                <PiSpinnerGap size={15} className="animate-spin" />
                              ) : (
                                <PiXCircle size={15} />
                              )}
                              <span>Cancel</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
