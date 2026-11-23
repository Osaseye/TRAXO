import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'
import {
  PiArrowsClockwise,
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
import { useMetaApi } from '@/hooks/useMetaApi'
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket'
import { auth } from '@/lib/firebase'
import { getCandles, getOlderCandles, type Candle } from '@/lib/marketData'
import { getMarketRiskContext } from '@/lib/marketRisk'
import {
  formatEntryTypeBadge,
  formatShortEngineTag,
  priceDigits,
  resolveSignalExitMode,
  riskFromConfidence,
  runSignalsForStrategies,
  type RiskLabel,
} from '@/lib/signalDetection'
import { calculateLots, cn, formatMT4OrderClipboardPayload, formatPrice } from '@/lib/utils'
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore, type OnboardingStrategyId } from '@/stores/useOnboardingStore'
import { showToast } from '@/stores/useToastStore'
import {
  isValidChartSymbol,
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
} from '@/stores/useTradingContextStore'
import type { DashboardStats } from '@/types'

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

const CORE_ENGINE_KEBABS: OnboardingStrategyId[] = [
  'wick-rejection',
  'breakout',
  'order-block',
  'supply-demand',
  'trend-following',
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
  return 'futures'
}

function formatCategoryLabel(cat: MarketCategory): string {
  if (cat === 'forex') return 'Forex'
  if (cat === 'metals') return 'Gold'
  return 'Futures'
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

const ALL_ENGINE_KEBABS: OnboardingStrategyId[] = Array.from(
  new Set(Object.values(CANONICAL_KEBAB_MAP))
)

function isSignalLive(status?: string): boolean {
  const st = String(status || 'live').trim().toLowerCase()
  return st === 'live' || st === 'active' || st === 'open' || st === 'pending'
}

function defaultPlannerLevels(
  symbol: string,
  lastCandle: Candle | undefined,
  action: TradeAction
): ManualPlannerState {
  const digits = priceDigits(symbol)
  const basePrice =
    lastCandle?.close ??
    (symbol.includes('JPY')
      ? 150.0
      : symbol.includes('XAU')
      ? 2650.0
      : symbol.includes('MNQ')
      ? 21000.0
      : 1.085)
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

const ENV_API_URL = import.meta.env.VITE_API_URL as string | undefined

function resolveDashboardApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    const isLocalHost = host === 'localhost' || host === '127.0.0.1'
    if (
      !isLocalHost &&
      (!ENV_API_URL || ENV_API_URL.includes('localhost') || ENV_API_URL.includes('127.0.0.1'))
    ) {
      return window.location.origin
    }
  }
  return (ENV_API_URL || 'http://localhost:8080').replace(/\/+$/, '')
}

function getDashboardActiveUid(): string {
  return useAuthStore.getState().user?.id || auth.currentUser?.uid || 'default_trader'
}

async function dashboardApiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = resolveDashboardApiBaseUrl()
  const url =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
  const activeUid = getDashboardActiveUid()
  const headers = new Headers(options.headers)

  if (!headers.has('X-Traxo-Uid')) {
    headers.set('X-Traxo-Uid', activeUid)
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth.currentUser && !headers.has('Authorization')) {
    try {
      const token = await auth.currentUser.getIdToken()
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    } catch {
      // Proceed with X-Traxo-Uid header if token refresh fails
    }
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

export default function Dashboard() {
  const activeStoreUid = useAuthStore((s) => s.user?.id ?? null)
  const displayName = useAuthStore(
    (s) => s.user?.displayName || s.user?.fullName || s.user?.email || 'Operator'
  )
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)

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
    paperTrades,
    executeManualTrade,
    closeOpenPosition,
    refreshPositions,
    refreshAccount,
    loading: metaLoading,
  } = useMetaApi()

  const executionMode: 'paper' | 'metaapi' = account?.mode === 'metaapi' ? 'metaapi' : 'paper'
  const isPaperMode = executionMode !== 'metaapi'
  const executionVenueLabel = isPaperMode ? 'Paper Broker' : 'Broker Bridge'
  const executionDeskBadge = isPaperMode ? 'TRAXO Paper' : 'Live Broker'

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

  // Chart & feed reload state
  const [loading, setLoading] = useState(true)
  const [retryingFeed, setRetryingFeed] = useState(false)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const loadingHistoryRef = useRef(false)
  const hasMoreHistoryRef = useRef(true)
  const candlesRef = useRef<Candle[]>([])
  const activeChartKeyRef = useRef(`${symbol}:${timeframe}`)
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null)
  const [lockedSignalId, setLockedSignalId] = useState<string | null>(null)
  const [lockedPositionId, setLockedPositionId] = useState<string | null>(null)
  // Survives the symbol/timeframe reset so cross-chart focus (signal card / position row) is not wiped
  const pendingFocusRef = useRef<{
    key: string
    signalId: string | null
    positionId: string | null
  } | null>(null)
  const [focusTime, setFocusTime] = useState<UTCTimestamp | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)

  useEffect(() => {
    candlesRef.current = candles
  }, [candles])

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
  const executingSignalIdsRef = useRef<Set<string>>(new Set())
  const [executingSignalIds, setExecutingSignalIds] = useState<string[]>([])
  const [localExecutedSignalIds, setLocalExecutedSignalIds] = useState<string[]>([])
  const executingPlannerRef = useRef<boolean>(false)
  const [plannerCooldownKey, setPlannerCooldownKey] = useState<string | null>(null)
  const plannerCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [orderCopied, setOrderCopied] = useState(false)
  const [dismissedNoticeKeys, setDismissedNoticeKeys] = useState<string[]>([])

  useEffect(() => {
    return () => {
      if (plannerCooldownTimerRef.current) {
        clearTimeout(plannerCooldownTimerRef.current)
      }
    }
  }, [])

  // Manual planner state
  const [manualPlanner, setManualPlanner] = useState<ManualPlannerState>(() =>
    defaultPlannerLevels(symbol, undefined, 'BUY')
  )

  // Sync URL query params -> store
  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')
    const urlTimeframe = searchParams.get('timeframe')
    if (urlSymbol && isValidChartSymbol(urlSymbol) && urlSymbol !== symbol) setSymbol(urlSymbol)
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

  // Include all active TRAXO proprietary engines + core engines cleanly so signals are never dropped
  const activeEngineKebabs = useMemo<OnboardingStrategyId[]>(() => {
    const valid = selectedStrategyIds
      .map((id) => normalizeStrategyToKebab(id) as OnboardingStrategyId)
      .filter((id) => ALL_ENGINE_KEBABS.includes(id))
    const merged = Array.from(new Set([...valid, ...CORE_ENGINE_KEBABS]))
    return valid.length > 0 ? merged : ALL_ENGINE_KEBABS
  }, [selectedStrategyIds])

  const activeEngineKebabsRef = useRef<OnboardingStrategyId[]>(activeEngineKebabs)
  useEffect(() => {
    activeEngineKebabsRef.current = activeEngineKebabs
  }, [activeEngineKebabs])

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
    activeChartKeyRef.current = `${symbol}:${timeframe}`
    loadingHistoryRef.current = false
    hasMoreHistoryRef.current = true
    const initTimer = setTimeout(() => {
      setLoading(true)
      setLoadingHistory(false)
      setHasMoreHistory(true)
      setHoveredSignalId(null)
      const pendingFocus = pendingFocusRef.current
      if (pendingFocus && pendingFocus.key === `${symbol}:${timeframe}`) {
        setLockedSignalId(pendingFocus.signalId)
        setLockedPositionId(pendingFocus.positionId)
      } else {
        setLockedSignalId(null)
        setLockedPositionId(null)
      }
      pendingFocusRef.current = null
      setCandles([])
    }, 0)

    const loadCandles = async () => {
      const generatedCandles = await getCandles(symbol, timeframe, 2000)
      if (cancelled) return
      setCandles(generatedCandles)
      setLoading(false)
      if (generatedCandles.length > 0) {
        const detected = runSignalsForStrategies(
          generatedCandles,
          symbol,
          timeframe,
          activeEngineKebabsRef.current
        )
        if (detected.length > 0) {
          addSignals(
            detected.map((s) => ({
              ...s,
              symbol,
              timeframe,
              status: 'live',
            }))
          )
        }
      }
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
  }, [addSignals, symbol, timeframe])

  const handleLoadMoreHistory = useCallback(async () => {
    if (loadingHistoryRef.current || !hasMoreHistoryRef.current || candlesRef.current.length === 0) {
      return
    }
    const oldestRaw = candlesRef.current[0]?.time
    const oldestTime =
      typeof oldestRaw === 'string'
        ? Math.floor(new Date(oldestRaw).getTime() / 1000)
        : Number(oldestRaw)
    if (!Number.isFinite(oldestTime) || oldestTime <= 0) return

    const requestKey = `${symbol}:${timeframe}`
    loadingHistoryRef.current = true
    setLoadingHistory(true)

    try {
      const older = await getOlderCandles(symbol, timeframe, oldestTime - 1, 1000)
      if (activeChartKeyRef.current !== requestKey) return

      const strictlyOlder = older.filter((c) => Number(c.time) < oldestTime)
      if (strictlyOlder.length === 0) {
        hasMoreHistoryRef.current = false
        setHasMoreHistory(false)
        return
      }

      setCandles((prev) => {
        const byTime = new Map<number, Candle>()
        for (const c of [...strictlyOlder, ...prev]) {
          byTime.set(Number(c.time), c)
        }
        return Array.from(byTime.values()).sort((a, b) => Number(a.time) - Number(b.time))
      })

      if (strictlyOlder.length < 1000) {
        hasMoreHistoryRef.current = false
        setHasMoreHistory(false)
      }
    } finally {
      if (activeChartKeyRef.current === requestKey) {
        loadingHistoryRef.current = false
        setLoadingHistory(false)
      }
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
      const res = await dashboardApiFetch(`/api/metaapi/quote?symbol=${encodeURIComponent(symbol)}`)
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
      const uid = activeStoreUid || auth.currentUser?.uid || 'default_trader'
      const res = await dashboardApiFetch(`/api/metaapi/orders?uid=${encodeURIComponent(uid)}`)
      if (res.ok) {
        const data = await res.json()
        setPendingOrders(Array.isArray(data.orders) ? data.orders : [])
      }
    } catch {
      // Endpoint unavailable when offline
    }
  }, [activeStoreUid])

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
      if (!existing || (!isSignalLive(existing.status) && isSignalLive(signal.status))) {
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

  const lockedSignal = useMemo(() => {
    if (!lockedSignalId) return null
    return (
      chartSignals.find((s) => s.id === lockedSignalId) ??
      // Fallback: the signal may belong to an engine that is currently filtered out
      allSignals.find(
        (s) => s.id === lockedSignalId && s.symbol === symbol && s.timeframe === timeframe
      ) ??
      null
    )
  }, [allSignals, chartSignals, lockedSignalId, symbol, timeframe])

  const liveChartSignals = useMemo(
    () => chartSignals.filter((s) => isSignalLive(s.status)),
    [chartSignals]
  )

  // Only auto-draw a setup when there is exactly one live signal. With several live
  // signals the trader picks one (hover to preview, click / chip to lock).
  const activeLiveSignal = liveChartSignals.length === 1 ? liveChartSignals[0] : null

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
      const isLive = isSignalLive(s.status)
      const shortStrat = formatShortEngineTag(s.strategyId, s.strategyLabel)
      const entryBadge = formatEntryTypeBadge(s.rawEntryType || s.entryType)
      const confPct =
        s.confidence <= 1 ? Math.round(s.confidence * 100) : Math.round(s.confidence)
      const sigTimeSec = (s.time > 1e12 ? Math.floor(s.time / 1000) : Math.floor(s.time)) as UTCTimestamp
      markerBySetup.set(signalMarkerKey(s), {
        time: sigTimeSec,
        position: s.direction === 'BUY' ? 'belowBar' : 'aboveBar',
        shape: s.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
        color: isLive ? (s.direction === 'BUY' ? '#34D399' : '#F87171') : '#71717A',
        text: `${shortStrat} · ${entryBadge} ${s.direction} ${confPct}%`,
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

  const executingSignalIdSet = useMemo(() => new Set(executingSignalIds), [executingSignalIds])
  const executedSignalIdSet = useMemo(() => {
    const s = new Set(localExecutedSignalIds)
    for (const t of paperTrades) {
      if (t.signalId && t.status !== 'CANCELLED') {
        s.add(t.signalId)
      }
    }
    return s
  }, [localExecutedSignalIds, paperTrades])
  const plannerFingerprint = `${symbol}:${manualPlanner.action}:${manualPlanner.entryType}:${manualPlanner.entry}:${manualPlanner.sl}:${manualPlanner.tp}:${plannerLots}`
  const isPlannerJustPlaced = plannerCooldownKey === plannerFingerprint

  // Locked open position / pending order → draw its real levels (incl. BE-moved SL)
  const lockedPositionSetup = useMemo<ChartPanelActiveSignal | null>(() => {
    if (!lockedPositionId) return null
    const trade = paperTrades.find((t) => t.id === lockedPositionId)
    if (trade) {
      if (trade.symbol !== symbol) return null
      const entry = trade.fillPrice ?? trade.requestedEntry
      const riskDist = Math.abs(entry - trade.slPrice)
      const rr = riskDist > 0 ? Math.abs(trade.tp1Price - entry) / riskDist : undefined
      const anchor = trade.filledAt ?? trade.createdAt
      return {
        id: trade.signalId ?? trade.id,
        entry,
        sl: trade.currentSl ?? trade.slPrice,
        tp: trade.tp1Price,
        tp2: trade.tp2Price,
        exitMode: trade.exitMode,
        entryType: trade.entryType,
        tier: trade.confluence?.tier ?? trade.tier,
        status: trade.status === 'PENDING' ? 'position_pending' : 'position_open',
        confluence: trade.confluence
          ? {
              score: trade.confluence.score,
              maxScore: trade.confluence.maxScore,
              tier: trade.confluence.tier,
              passedCriteria: trade.confluence.passedCriteria,
              checks: trade.confluence.checks,
            }
          : null,
        action: trade.direction,
        entryTime: (anchor > 1e12 ? Math.floor(anchor / 1000) : anchor) as UTCTimestamp,
        confidence:
          trade.confidence <= 1 ? Math.round(trade.confidence * 100) : Math.round(trade.confidence),
        rr: trade.plannedRr || rr,
        locked: true,
        strategyLabel: trade.strategyLabel,
        reason: trade.reasons,
        lotSize: trade.openVolume || trade.initialVolume,
        riskAmountUsd: trade.riskAmountUsd,
      }
    }

    const pos = metaPositions.find((p) => p.id === lockedPositionId)
    const order = pos ? null : pendingOrders.find((o) => o.id === lockedPositionId)
    const src = pos ?? order
    if (!src || src.symbol !== symbol || !src.sl || !src.tp) return null
    const isBuy = (pos?.direction ?? src.type).toUpperCase().includes('BUY')
    const tSec = src.time ? Math.floor(new Date(src.time).getTime() / 1000) : null
    return {
      id: src.id,
      entry: src.openPrice,
      sl: src.sl,
      tp: pos?.tp1 ?? src.tp,
      tp2: pos?.tp2 ?? null,
      exitMode: pos?.exitMode,
      entryType: order ? (src.type.includes('STOP') ? 'STOP' : 'LIMIT') : 'MARKET',
      status: order ? 'position_pending' : 'position_open',
      action: isBuy ? 'BUY' : 'SELL',
      entryTime: (tSec ?? undefined) as UTCTimestamp | undefined,
      locked: true,
      strategyLabel: pos?.strategyLabel ?? src.comment,
      lotSize: src.volume,
    }
  }, [lockedPositionId, metaPositions, paperTrades, pendingOrders, symbol])

  // Hover previews any marker (even while something is locked); lock wins otherwise.
  const hoverPreviewSignal =
    hoveredSignal && hoveredSignal.id !== lockedSignal?.id ? hoveredSignal : null
  const activeSignalForChart: StoredSignal | null =
    hoverPreviewSignal ?? (lockedPositionSetup ? null : lockedSignal ?? activeLiveSignal)

  const chartActiveSignal: ChartPanelActiveSignal | null = (() => {
    if (manualPlanner.activeOnChart && inspectorTab === 'planner') return null
    if (!activeSignalForChart) return lockedPositionSetup
    const confPct =
      activeSignalForChart.confidence <= 1
        ? Math.round(activeSignalForChart.confidence * 100)
        : Math.round(activeSignalForChart.confidence)
    const lotSize = calculateLots(
      symbol,
      activeSignalForChart.entry,
      activeSignalForChart.sl,
      activeRiskUsd
    )
    const tp2 =
      typeof activeSignalForChart.tp2 === 'number' &&
      Number.isFinite(activeSignalForChart.tp2) &&
      activeSignalForChart.tp2 > 0
        ? activeSignalForChart.tp2
        : null
    const tier =
      activeSignalForChart.tier ??
      activeSignalForChart.confluence?.tier ??
      (confPct >= 82 ? 'PRIME' : confPct >= 72 ? 'STANDARD' : 'AGGRESSIVE')
    const entryType =
      activeSignalForChart.rawEntryType ?? activeSignalForChart.entryType ?? 'MARKET'
    const exitMode =
      activeSignalForChart.exitMode ??
      resolveSignalExitMode({
        strategyId: activeSignalForChart.strategyId,
        market: activeSignalForChart.market,
        symbol,
        tier,
        volume: lotSize,
        tp2,
      })

    return {
      id: activeSignalForChart.id,
      entry: activeSignalForChart.entry,
      sl: activeSignalForChart.sl,
      tp: activeSignalForChart.tp,
      tp2,
      exitMode,
      entryType,
      tier,
      status: isSignalLive(activeSignalForChart.status) ? 'live' : activeSignalForChart.status,
      confluence: activeSignalForChart.confluence ?? null,
      action: activeSignalForChart.direction,
      entryTime: activeSignalForChart.time as UTCTimestamp,
      confidence: confPct,
      rr: activeSignalForChart.rr,
      locked: Boolean(lockedSignal && lockedSignal.id === activeSignalForChart.id),
      strategyLabel: activeSignalForChart.strategyLabel,
      risk: activeSignalForChart.risk,
      reason: activeSignalForChart.reason,
      lotSize,
      riskAmountUsd: activeRiskUsd,
    }
  })()

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

  // Pick the signal under the cursor. When several signals sit on the same / adjacent
  // candles, disambiguate by the price closest to the cursor (BUY arrows below, SELL above).
  const pickSignalAt = useCallback(
    (time: number, price: number | null | undefined): StoredSignal | null => {
      const tfMap: Record<string, number> = {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '1H': 3600,
        '4H': 14400,
        '1D': 86400,
      }
      const tolerance = (tfMap[timeframe] || 900) * 0.9
      const candidates = chartSignals.filter((s) => {
        const tSec = s.time > 1e12 ? Math.floor(s.time / 1000) : s.time
        return Math.abs(tSec - time) <= tolerance
      })
      if (candidates.length === 0) return null
      if (candidates.length === 1 || price == null || !Number.isFinite(price)) {
        return [...candidates].sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0]
      }
      const candle = candles.find((c) => Math.abs(c.time - time) <= tolerance)
      const scoreOf = (s: StoredSignal) => {
        // Marker anchor ≈ candle low for BUY (arrow below bar), candle high for SELL
        const anchor = candle ? (s.direction === 'BUY' ? candle.low : candle.high) : s.entry
        return Math.min(Math.abs(anchor - price), Math.abs(s.entry - price))
      }
      return [...candidates].sort((a, b) => scoreOf(a) - scoreOf(b))[0]
    },
    [candles, chartSignals, timeframe]
  )

  // Chart interactions
  const handleCrosshairMove = useCallback(
    (time: UTCTimestamp | null, price?: number | null) => {
      if (chartSignals.length === 0 || time == null) {
        setHoveredSignalId(null)
        return
      }
      const closest = pickSignalAt(time, price)
      setHoveredSignalId(closest ? closest.id : null)
    },
    [chartSignals.length, pickSignalAt]
  )

  // Explicit selection from the multi-signal chooser strip
  const handlePreviewSignal = useCallback((id: string | null) => {
    setHoveredSignalId(id)
  }, [])

  const handleLockSignal = useCallback(
    (id: string) => {
      const sig = chartSignals.find((s) => s.id === id)
      if (!sig) return
      setManualPlanner((prev) => ({ ...prev, activeOnChart: false }))
      setLockedPositionId(null)
      setLockedSignalId(id)
      setHoveredSignalId(null)
      setFocusTime((sig.time > 1e12 ? Math.floor(sig.time / 1000) : sig.time) as UTCTimestamp)
      setFocusNonce((n) => n + 1)
    },
    [chartSignals]
  )

  const signalChoices = useMemo(
    () =>
      liveChartSignals.map((s) => ({
        id: s.id,
        label: formatShortEngineTag(s.strategyId, s.strategyLabel),
        action: s.direction,
        confidence: s.confidence <= 1 ? Math.round(s.confidence * 100) : Math.round(s.confidence),
        entryBadge: formatEntryTypeBadge(s.rawEntryType || s.entryType),
      })),
    [liveChartSignals]
  )

  const handleChartClick = useCallback(
    ({ point, time, price }: { point?: { x: number; y: number }; time?: Time; price?: number | null }) => {
      if (!point) return
      const clickedTime = typeof time === 'number' ? (time as UTCTimestamp) : null

      if (clickedTime != null) {
        const nearestSignal = pickSignalAt(clickedTime, price)
        if (nearestSignal) {
          setLockedPositionId(null)
          setLockedSignalId(nearestSignal.id)
          setHoveredSignalId(null)
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
      setLockedPositionId(null)
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
    [candles, effectiveBid, pickSignalAt, symbol]
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
        pendingFocusRef.current = {
          key: `${raw.symbol}:${raw.timeframe}`,
          signalId: raw.id,
          positionId: null,
        }
        setSymbol(raw.symbol as ChartSymbol)
        setTimeframe(raw.timeframe as ChartTimeframe)
        setSearchParams({ symbol: raw.symbol, timeframe: raw.timeframe }, { replace: true })
      }

      setManualPlanner((prev) => ({ ...prev, activeOnChart: false }))
      setLockedPositionId(null)
      setLockedSignalId(raw.id)
      setHoveredSignalId(null)
      setFocusTime(targetTime)
      setFocusNonce((n) => n + 1)
      setMobileView('chart')
    },
    [setSearchParams, setSymbol, setTimeframe, symbol, timeframe]
  )

  // Open position / pending order row → jump to the exact setup on its own chart
  const handleFocusPosition = useCallback(
    (posId: string, posSymbol: string, posTime?: string) => {
      const tfNormalize: Record<string, ChartTimeframe> = {
        '1m': '1m',
        '5m': '5m',
        '15m': '15m',
        '1h': '1H',
        '4h': '4H',
        '1d': '1D',
      }
      const trade = paperTrades.find((t) => t.id === posId)
      const targetSymbol = (trade?.symbol ?? posSymbol) as ChartSymbol
      const targetTf: ChartTimeframe =
        (trade?.timeframe && tfNormalize[trade.timeframe.toLowerCase()]) || timeframe
      const linkedSignalId =
        trade?.signalId && allSignals.some((s) => s.id === trade.signalId) ? trade.signalId : null

      const anchorRaw = trade
        ? trade.filledAt ?? trade.createdAt
        : posTime
          ? Math.floor(new Date(posTime).getTime() / 1000)
          : null

      setManualPlanner((prev) => ({ ...prev, activeOnChart: false }))
      setHoveredSignalId(null)

      if (targetSymbol !== symbol || targetTf !== timeframe) {
        pendingFocusRef.current = {
          key: `${targetSymbol}:${targetTf}`,
          signalId: linkedSignalId,
          positionId: posId,
        }
        setSymbol(targetSymbol)
        setTimeframe(targetTf)
        setSearchParams({ symbol: targetSymbol, timeframe: targetTf }, { replace: true })
      } else {
        setLockedSignalId(linkedSignalId)
        setLockedPositionId(posId)
      }

      if (anchorRaw != null && Number.isFinite(anchorRaw)) {
        setFocusTime(
          (anchorRaw > 1e12 ? Math.floor(anchorRaw / 1000) : anchorRaw) as UTCTimestamp
        )
        setFocusNonce((n) => n + 1)
      }
      setMobileView('chart')
    },
    [allSignals, paperTrades, setSearchParams, setSymbol, setTimeframe, symbol, timeframe]
  )

  // Retry loading candles & account telemetry when feed is empty
  const handleRetryFeed = async () => {
    if (retryingFeed) return
    setRetryingFeed(true)
    try {
      const [freshCandles] = await Promise.all([
        getCandles(symbol, timeframe, 2000),
        refreshAccount(),
        refreshPositions(),
        fetchPendingOrders(),
        fetchLiveQuote(),
      ])

      if (freshCandles.length > 0) {
        setCandles(freshCandles)
      }
    } catch {
      showToast('Feed Notice', 'Unable to reload market data on current feed', 'error')
    } finally {
      setRetryingFeed(false)
    }
  }

  // Execute trade helper for SignalCard & Obsidian Briefing Card
  const handleExecuteSignal = async (raw: DashboardSignalItem, lotSize: number) => {
    const direction = 'signal' in raw ? raw.signal : raw.direction
    if (direction === 'NO_TRADE') return

    if (executingSignalIdsRef.current.has(raw.id)) return
    if (executedSignalIdSet.has(raw.id)) {
      showToast('Already Executed', 'This setup has already been executed', 'info')
      return
    }

    executingSignalIdsRef.current.add(raw.id)
    setExecutingSignalIds((prev) => (prev.includes(raw.id) ? prev : [...prev, raw.id]))

    try {
      const isLegacy = 'signal' in raw
      const strategyId = isLegacy ? raw.strategy_id : raw.strategyId
      const strategyLabel = isLegacy ? undefined : raw.strategyLabel
      const rawConf = raw.confidence
      const confidence = rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf)
      const rawEntry = isLegacy ? undefined : raw.rawEntryType || raw.entryType
      const entryUpper = String(rawEntry || 'MARKET').toUpperCase()
      const normalizedEntryType: 'market' | 'limit' | 'stop' =
        entryUpper === 'LIMIT' ? 'limit' : entryUpper === 'STOP' ? 'stop' : 'market'
      const signalTimeRaw = isLegacy ? new Date(raw.timestamp).getTime() : raw.time

      const result = await executeManualTrade({
        signalId: raw.id,
        symbol: raw.symbol,
        timeframe: raw.timeframe,
        market: isLegacy ? undefined : raw.market,
        strategyId,
        strategyLabel,
        tier: isLegacy ? undefined : raw.tier,
        action: direction,
        volume: lotSize,
        sl: raw.sl,
        tp: raw.tp,
        tp2: !isLegacy && typeof raw.tp2 === 'number' ? raw.tp2 : undefined,
        entryType: normalizedEntryType,
        rawEntryType: rawEntry ? String(rawEntry) : undefined,
        price: raw.entry,
        referencePrice: raw.entry,
        riskAmountUsd: activeRiskUsd,
        rr: isLegacy ? raw.rr_ratio : raw.rr,
        confidence,
        signalTime: Number.isFinite(signalTimeRaw) ? signalTimeRaw : undefined,
        reasons: raw.reason,
        confluence: isLegacy ? undefined : raw.confluence,
      })

      if (result?.success) {
        setLocalExecutedSignalIds((prev) => (prev.includes(raw.id) ? prev : [...prev, raw.id]))
        showToast(
          isPaperMode ? 'Paper Trade Executed' : 'Trade Executed',
          `${direction} ${lotSize}L ${raw.symbol} placed on ${executionVenueLabel}`,
          'success'
        )
        await fetchPendingOrders()
      } else if (result?.duplicate) {
        setLocalExecutedSignalIds((prev) => (prev.includes(raw.id) ? prev : [...prev, raw.id]))
        showToast(
          'Already Executed',
          result.error || 'This setup has already been executed',
          'info'
        )
      } else {
        showToast(
          isPaperMode ? 'Paper Broker Notice' : 'Execution Notice',
          result?.error || `Calculated ${lotSize}L — ${executionVenueLabel} standby`,
          'info'
        )
      }
    } catch {
      showToast('Execution Error', 'Unable to reach execution endpoint', 'error')
    } finally {
      executingSignalIdsRef.current.delete(raw.id)
      setExecutingSignalIds((prev) => prev.filter((id) => id !== raw.id))
    }
  }

  const handleExecuteChartSignal = async () => {
    if (
      !activeSignalForChart ||
      executingSignalIdsRef.current.has(activeSignalForChart.id) ||
      executedSignalIdSet.has(activeSignalForChart.id)
    ) {
      return
    }
    const lotSize = calculateLots(
      symbol,
      activeSignalForChart.entry,
      activeSignalForChart.sl,
      activeRiskUsd
    )
    await handleExecuteSignal(activeSignalForChart, lotSize)
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
    if (!plannerValid || executingPlannerRef.current || isPlannerJustPlaced) return
    executingPlannerRef.current = true
    setExecutingTrade(true)
    try {
      const result = await executeManualTrade({
        symbol,
        action: manualPlanner.action,
        volume: plannerLots,
        sl: manualPlanner.sl,
        tp: manualPlanner.tp,
        entryType: manualPlanner.entryType,
        rawEntryType: manualPlanner.entryType.toUpperCase(),
        price: manualPlanner.entry,
        referencePrice: manualPlanner.entry,
        timeframe,
        strategyId: 'manual_order',
        strategyLabel:
          manualPlanner.entryType === 'limit' ? 'Manual Limit Order' : 'Manual Market Order',
        riskAmountUsd: activeRiskUsd,
        rr: plannerRR,
      })

      if (result?.success) {
        if (plannerCooldownTimerRef.current) {
          clearTimeout(plannerCooldownTimerRef.current)
        }
        setPlannerCooldownKey(plannerFingerprint)
        plannerCooldownTimerRef.current = setTimeout(() => {
          setPlannerCooldownKey(null)
        }, 3000)

        showToast(
          isPaperMode ? 'Paper Order Placed' : 'Order Placed',
          `${manualPlanner.entryType.toUpperCase()} ${manualPlanner.action} ${plannerLots}L ${symbol} placed on ${executionVenueLabel}`,
          'success'
        )
        await fetchPendingOrders()
      } else if (result?.duplicate) {
        showToast(
          'Order Already Placed',
          result.error || 'Duplicate order ignored — already placed',
          'info'
        )
      } else {
        showToast(
          isPaperMode ? 'Paper Broker Notice' : 'Broker Notice',
          result?.error || `Lot Size ${plannerLots}L — ${executionVenueLabel} standby`,
          'info'
        )
      }
    } catch {
      showToast('Execution Error', 'Unable to connect to execution endpoint', 'error')
    } finally {
      executingPlannerRef.current = false
      setExecutingTrade(false)
    }
  }

  const handleCancelPendingOrder = async (orderId: string) => {
    try {
      setCancelingOrderId(orderId)
      const res = await dashboardApiFetch('/api/metaapi/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, uid: getDashboardActiveUid() }),
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
        {/* Top Row on Mobile / Left Cluster on Desktop: Symbol Picker + Mobile Venue + Desktop Timeframes */}
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
                    placeholder="Search EURUSD, XAUUSD, MNQ..."
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

          {/* Mobile Execution Mode Indicator (aligned on Row 1 with Symbol Picker) */}
          <div
            className="lg:hidden flex items-center gap-1.5 text-[12px] text-[#A1A1AA] shrink-0"
            title={account?.connected ? `${executionVenueLabel} Active` : `${executionVenueLabel} Standby`}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                account?.connected ? 'bg-[#34D399]' : 'bg-[#71717A]'
              )}
            />
            <span>{isPaperMode ? 'Paper' : 'MT5'}</span>
          </div>
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
              title={
                liveQuote.source === 'mt5'
                  ? isPaperMode
                    ? 'Paper Broker Quote'
                    : 'Live Broker Quote'
                  : 'Market Feed Quote'
              }
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
              title={account?.connected ? `${executionVenueLabel} Connected` : 'Local Account Balance'}
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
                      Reconnect or retry loading the market feed.
                    </p>
                    <button
                      type="button"
                      disabled={retryingFeed}
                      onClick={() => void handleRetryFeed()}
                      className="h-10 lg:h-9 px-4 rounded-full bg-[#161619] border border-white/[0.08] hover:border-white/[0.18] text-[13px] font-medium text-[#FAFAFA] inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <PiArrowsClockwise size={15} className={cn(retryingFeed && 'animate-spin')} />
                      <span>{retryingFeed ? 'Retrying...' : 'Retry feed'}</span>
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
                signalChoices={signalChoices}
                selectedSignalId={lockedPositionId ? null : lockedSignalId}
                previewSignalId={hoveredSignalId}
                onPreviewSignal={handlePreviewSignal}
                onSelectSignal={handleLockSignal}
                onTimeframeChange={handleSelectTimeframe}
                onExecuteActiveSignal={handleExecuteChartSignal}
                onExecuteManualSetup={handleExecutePlanner}
                onClearSelection={() => {
                  setLockedSignalId(null)
                  setLockedPositionId(null)
                  setHoveredSignalId(null)
                  setManualPlanner((prev) => ({ ...prev, activeOnChart: false }))
                }}
                executingSetup={
                  chartActiveSignal
                    ? Boolean(chartActiveSignal.id && executingSignalIdSet.has(chartActiveSignal.id))
                    : executingTrade
                }
                setupExecuted={
                  chartActiveSignal
                    ? Boolean(chartActiveSignal.id && executedSignalIdSet.has(chartActiveSignal.id))
                    : isPlannerJustPlaced
                }
                executionMode={executionMode}
                onLoadMoreHistory={handleLoadMoreHistory}
                loadingHistory={loadingHistory}
                hasMoreHistory={hasMoreHistory}
                livePrice={effectiveBid}
                focusTime={focusTime}
                focusNonce={focusNonce}
                loading={loading || retryingFeed}
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
                    executionMode={executionMode}
                    executingSignalIds={executingSignalIdSet}
                    executedSignalIds={executedSignalIdSet}
                    onFocusSignal={handleFocusSignal}
                    onExecuteSignal={handleExecuteSignal}
                    onLogDecision={handleLogSignalDecision}
                    className="flex-1 min-h-0"
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
                    disabled={!plannerValid || executingTrade || isPlannerJustPlaced}
                    onClick={() => void handleExecutePlanner()}
                    className={cn(
                      'w-full h-11 lg:h-10 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-70',
                      isPlannerJustPlaced
                        ? 'bg-[#34D399]/15 border-[#34D399]/35 text-[#34D399] cursor-default'
                        : manualPlanner.action === 'BUY'
                        ? 'bg-[#34D399]/15 border-[#34D399]/30 text-[#34D399] hover:bg-[#34D399]/25 disabled:opacity-50'
                        : 'bg-[#F87171]/15 border-[#F87171]/30 text-[#F87171] hover:bg-[#F87171]/25 disabled:opacity-50'
                    )}
                  >
                    {isPlannerJustPlaced ? (
                      <PiCheck size={16} />
                    ) : executingTrade ? (
                      <PiSpinnerGap size={16} className="animate-spin" />
                    ) : (
                      <PiLightning size={16} />
                    )}
                    <span>
                      {isPlannerJustPlaced
                        ? isPaperMode
                          ? 'Paper Order Placed'
                          : 'Order Placed'
                        : executingTrade
                        ? isPaperMode
                          ? 'Placing Paper Order...'
                          : 'Submitting to MT5...'
                        : `Execute ${manualPlanner.entryType === 'limit' ? 'Limit' : 'Market'} ${
                            manualPlanner.action === 'BUY' ? 'Buy' : 'Sell'
                          } (${isPaperMode ? 'Paper' : 'MT5'})`}
                    </span>
                    {!executingTrade && !isPlannerJustPlaced && (
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
                <StatsRow compact stats={dashboardStats} executionMode={executionMode} />

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
                <span className="text-[13px] font-medium text-[#A1A1AA]">{executionDeskBadge}</span>
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
                title={isPaperMode ? 'Refresh paper positions & orders' : 'Refresh broker positions & orders'}
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
                    {isPaperMode ? 'No open paper positions' : 'No open broker positions'}
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
                            onClick={() => handleFocusPosition(pos.id, pos.symbol, pos.time)}
                            className={cn(
                              'rounded-xl border p-3.5 space-y-3 transition-colors cursor-pointer',
                              lockedPositionId === pos.id
                                ? 'bg-white/[0.06] border-[#38BDF8]/40'
                                : isCurrent
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
                                      `Closed ${pos.symbol} on ${executionVenueLabel}`,
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
                            onClick={() => handleFocusPosition(pos.id, pos.symbol, pos.time)}
                            title="Show this setup on the chart"
                            className={cn(
                              'cursor-pointer transition-colors',
                              lockedPositionId === pos.id
                                ? 'bg-white/[0.07] shadow-[inset_2px_0_0_#38BDF8]'
                                : isCurrent
                                  ? 'bg-white/[0.04]'
                                  : 'hover:bg-white/[0.03]'
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
                                        `Closed ${pos.symbol} on ${executionVenueLabel}`,
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
                  {isPaperMode ? 'No pending limit or stop orders' : 'No pending broker limit or stop orders'}
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
                          onClick={() => handleFocusPosition(order.id, order.symbol, order.time)}
                          className={cn(
                            'rounded-xl border p-3.5 space-y-3 cursor-pointer',
                            lockedPositionId === order.id
                              ? 'bg-white/[0.06] border-[#38BDF8]/40'
                              : 'border-white/[0.06] bg-[#161619]'
                          )}
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
                          onClick={() => handleFocusPosition(order.id, order.symbol, order.time)}
                          title="Show this order on the chart"
                          className={cn(
                            'cursor-pointer transition-colors',
                            lockedPositionId === order.id
                              ? 'bg-white/[0.07] shadow-[inset_2px_0_0_#38BDF8]'
                              : 'hover:bg-white/[0.03]'
                          )}
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
