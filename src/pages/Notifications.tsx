import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  PiArrowCounterClockwise,
  PiArrowsClockwise,
  PiArrowUpRight,
  PiBell,
  PiCaretDown,
  PiCaretUp,
  PiCheck,
  PiChecks,
  PiCpu,
  PiDatabase,
  PiDownloadSimple,
  PiHardDrives,
  PiLightning,
  PiMagnifyingGlass,
  PiPlay,
  PiGauge,
  PiShieldCheck,
  PiSlidersHorizontal,
  PiTerminalWindow,
  PiTrash,
  PiWarning,
  PiWifiHigh,
  PiWifiSlash,
} from 'react-icons/pi'
import {
  getCandleData,
  getHistoricalSignals,
  getLiveSignals,
  getScannerRejects,
  getScannerStatus,
} from '@/lib/api'
import { auth } from '@/lib/firebase'
import { runSignalsForStrategies } from '@/lib/signalDetection'
import { normalizeStrategyId } from '@/lib/strategyId'
import { useMetaApi } from '@/hooks/useMetaApi'
import { useStrategyOptimizer } from '@/hooks/useStrategyOptimizer'
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import { ONBOARDING_STRATEGIES, useOnboardingStore } from '@/stores/useOnboardingStore'
import {
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
} from '@/stores/useTradingContextStore'
import {
  subscribeScanProgress,
  type ScanProgress,
} from '@/components/shared/GlobalMultiSymbolScanner'

type OpsTab = 'ledger' | 'rejections' | 'telemetry'
type SignalStatusFilter = 'ALL' | 'LIVE' | 'WIN' | 'LOSS' | 'EXPIRED'
type DirectionFilter = 'ALL' | 'BUY' | 'SELL'

interface LedgerSignal {
  key: string
  id: string
  symbol: string
  timeframe: string
  strategyId: string
  strategyLabel: string
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  status: 'WIN' | 'LOSS' | 'EXPIRED' | 'LIVE'
  rawStatus: string
  reason: string[]
  timestampMs: number
  read: boolean
  hasNotification: boolean
  source: 'alert' | 'live' | 'historical'
}

interface RejectionRecord {
  id: string
  symbol: string
  timeframe: string
  strategy: string
  reason: string
  confidence: string | null
  spread: string | null
  timestampMs: number | null
}

interface BackendHealthData {
  status: string
  twelvedata?: {
    availableKeys: number
    keys?: Array<{
      index?: number
      id?: string
      usedToday?: number
      remaining?: number
      cooldownUntil?: number | null
      exhausted?: boolean
    }>
  }
}

interface GlobalScannerStatus {
  ok: boolean
  running: boolean
  current: string
  done: number
  total: number
  lastCompletedAt: string | number | null
  lastError: string | null
}

interface DiagnosticProbeResult {
  ranAt: number
  totalSignals: number
  items: Array<{
    symbol: string
    timeframe: string
    candles: number
    signals: number
    latencyMs: number
    error?: string
  }>
}

const WATCHLIST_REJECT_SWEEP: ReadonlyArray<{ symbol: string; timeframe: string }> = [
  { symbol: 'EURUSD', timeframe: '1H' },
  { symbol: 'EURUSD', timeframe: '15m' },
  { symbol: 'GBPUSD', timeframe: '1H' },
  { symbol: 'GBPUSD', timeframe: '15m' },
  { symbol: 'USDJPY', timeframe: '1H' },
  { symbol: 'XAUUSD', timeframe: '15m' },
  { symbol: 'XAUUSD', timeframe: '1H' },
  { symbol: 'BTCUSD', timeframe: '1H' },
  { symbol: 'AAPL', timeframe: '1H' },
  { symbol: 'NVDA', timeframe: '1H' },
  { symbol: 'TSLA', timeframe: '15m' },
]

const VALID_CHART_SYMBOLS = new Set<string>([
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'AUDUSD',
  'USDCAD',
  'USDCHF',
  'NZDUSD',
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'AAPL',
  'NVDA',
  'TSLA',
])

const VALID_CHART_TIMEFRAMES = new Set<string>(['1m', '5m', '15m', '1H', '4H', '1D'])

const ALG_CONFIG = {
  minScore: { prime: 7, standard: 5, aggressive: 4 },
  minConfidence: { prime: 70, standard: 55, aggressive: 45 },
  slBuffer: { primeForex: '0.75x ATR', standardForex: '1.0x ATR', crypto: '+50% on top of base' },
  defaultSlippage: { forex: '0.005%', crypto: '0.1%' },
  rrFallback: { tp1: '1.5R', tp2: '2.5R' },
  obLookback: '20 candles',
  swingLookback: '3 bars',
  i2eMinR: '0.8R (min distance for structure TP)',
}

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '')
const HEALTH_URL = API_BASE
  ? `${API_BASE}/health`
  : `${((import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:8080').replace(/\/$/, '')}/health`

function buildApiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken().catch(() => null)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatPrice(val: number): string {
  if (!Number.isFinite(val)) return '—'
  if (val >= 100) return val.toFixed(2)
  if (val >= 10) return val.toFixed(3)
  return val.toFixed(5)
}

function normalizeTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000
  }
  if (typeof raw === 'string') {
    const asNum = Number(raw)
    if (Number.isFinite(asNum) && raw.trim() !== '') {
      return asNum > 1e12 ? asNum : asNum * 1000
    }
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { seconds?: number; _seconds?: number }
    const secs = obj.seconds ?? obj._seconds
    if (typeof secs === 'number') return secs * 1000
  }
  return Date.now()
}

function formatDateTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatRelative(ms: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function normalizeSignalStatus(raw: unknown): 'WIN' | 'LOSS' | 'EXPIRED' | 'LIVE' {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'win' || s === 'tp_hit' || s === 'tp' || s === 'won') return 'WIN'
  if (s === 'loss' || s === 'sl_hit' || s === 'sl' || s === 'lost') return 'LOSS'
  if (s === 'expired' || s === 'stale' || s === 'cancelled' || s === 'closed') return 'EXPIRED'
  return 'LIVE'
}

function compactSymbol(sym: string): string {
  return sym.replace('/', '').trim().toUpperCase()
}

function slashSymbolFallback(sym: string): string | null {
  const clean = compactSymbol(sym)
  if (clean.length === 6 && !sym.includes('/')) {
    return `${clean.slice(0, 3)}/${clean.slice(3)}`
  }
  return null
}

function strategyDisplayName(id: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback
  const norm = normalizeStrategyId(id)
  const found = ONBOARDING_STRATEGIES.find((s) => normalizeStrategyId(s.id) === norm)
  return found ? found.name : id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractInlineTelemetry(reason: string): { confidence: string | null; spread: string | null } {
  const confMatch = reason.match(/conf(?:idence)?\s*[:=]?\s*(\d+(?:\.\d+)?%?)/i)
  const spreadMatch = reason.match(/spread\s*[:=]?\s*(\d+(?:\.\d+)?(?:\s*(?:pips?|bps|pts))?)/i)
  return {
    confidence: confMatch ? confMatch[1] : null,
    spread: spreadMatch ? spreadMatch[1] : null,
  }
}

function parseRejectionPayload(
  payload: unknown,
  defaultSymbol = '',
  defaultTimeframe = ''
): RejectionRecord[] {
  const records: RejectionRecord[] = []
  if (!payload || typeof payload !== 'object') return records

  const pushEntry = (
    sym: string,
    tf: string,
    strat: string,
    reasonVal: unknown,
    idx: number,
    meta?: Record<string, unknown>
  ) => {
    const reasonStr =
      typeof reasonVal === 'string'
        ? reasonVal
        : reasonVal && typeof reasonVal === 'object'
          ? String(
              (reasonVal as Record<string, unknown>).reason ??
                (reasonVal as Record<string, unknown>).message ??
                JSON.stringify(reasonVal)
            )
          : String(reasonVal ?? '')

    if (!reasonStr.trim()) return
    const itemMeta =
      reasonVal && typeof reasonVal === 'object'
        ? (reasonVal as Record<string, unknown>)
        : meta || {}
    const parsed = extractInlineTelemetry(reasonStr)
    const rawConf = itemMeta.confidence ?? itemMeta.conf
    const rawSpread = itemMeta.spread ?? itemMeta.spreadPips
    const rawTs = itemMeta.timestamp ?? itemMeta.time ?? itemMeta.ts ?? itemMeta.createdAt

    records.push({
      id: `${sym}-${tf}-${strat}-${idx}-${reasonStr.slice(0, 24)}`,
      symbol: compactSymbol(String(itemMeta.symbol || sym || 'UNKNOWN')),
      timeframe: String(itemMeta.timeframe || tf || '—'),
      strategy: String(itemMeta.strategy || itemMeta.strategyId || strat || 'scanner'),
      reason: reasonStr.trim(),
      confidence:
        rawConf !== undefined && rawConf !== null
          ? `${Number.isFinite(Number(rawConf)) ? `${Number(rawConf)}%` : String(rawConf)}`
          : parsed.confidence,
      spread:
        rawSpread !== undefined && rawSpread !== null
          ? String(rawSpread)
          : parsed.spread,
      timestampMs: rawTs !== undefined && rawTs !== null ? normalizeTimestampMs(rawTs) : null,
    })
  }

  const root = payload as Record<string, unknown>
  const candidate =
    root.rejects !== undefined
      ? root.rejects
      : root.items !== undefined
        ? root.items
        : root.entries !== undefined
          ? root.entries
          : root

  const rootSym = String(root.symbol || defaultSymbol || '')
  const rootTf = String(root.timeframe || defaultTimeframe || '')

  if (Array.isArray(candidate)) {
    candidate.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (obj.rejects && typeof obj.rejects === 'object') {
          records.push(
            ...parseRejectionPayload(
              obj.rejects,
              String(obj.symbol || rootSym),
              String(obj.timeframe || rootTf)
            )
          )
        } else {
          pushEntry(
            String(obj.symbol || rootSym),
            String(obj.timeframe || rootTf),
            String(obj.strategy || obj.strategyId || 'guardrail'),
            obj,
            idx,
            obj
          )
        }
      } else {
        pushEntry(rootSym, rootTf, 'guardrail', item, idx)
      }
    })
    return records
  }

  if (candidate && typeof candidate === 'object') {
    const mapObj = candidate as Record<string, unknown>
    Object.entries(mapObj).forEach(([key, val]) => {
      let sym = rootSym
      let tf = rootTf
      let strat = key

      const cleanedKey = key.replace(/^scan_rejects:/i, '')
      const parts = cleanedKey.split(':')
      if (parts.length >= 2 && (parts.length >= 3 || /^(1m|5m|15m|30m|1h|4h|1d|1w)$/i.test(parts[1]))) {
        sym = parts[0] || sym
        tf = parts[1] || tf
        strat = parts.slice(2).join(':') || 'scanner'
      }

      if (Array.isArray(val)) {
        val.forEach((entry, idx) => pushEntry(sym, tf, strat, entry, idx))
      } else if (val && typeof val === 'object') {
        const nested = val as Record<string, unknown>
        if (nested.reason || nested.message) {
          pushEntry(sym, tf, strat, nested, 0, nested)
        } else {
          records.push(...parseRejectionPayload(nested, sym, tf))
        }
      } else if (typeof val === 'string') {
        pushEntry(sym, tf, strat, val, 0)
      }
    })
  }

  return records
}

export default function Notifications() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = ((): OpsTab => {
    const t = searchParams.get('tab')
    if (t === 'rejections' || t === 'telemetry' || t === 'ledger') return t
    return 'ledger'
  })()
  const [activeTab, setActiveTab] = useState<OpsTab>(initialTab)

  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearNotifications = useNotificationStore((s) => s.clearNotifications)
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const storeSignals = useAnalysisSignalStore((s) => s.signals)
  const setChartSymbol = useTradingContextStore((s) => s.setChartSymbol)
  const setChartTimeframe = useTradingContextStore((s) => s.setChartTimeframe)
  const activeStrategies = useOnboardingStore((s) => s.selectedStrategyIds)

  const {
    account: mt5Account,
    positions: mt5Positions,
    autoTradeEnabled,
    loading: mt5Loading,
    refreshAccount: refreshMt5Account,
  } = useMetaApi()

  const {
    status: optimizerStatus,
    loading: optimizerLoading,
    toggleFeedbackEngine,
    resetToFactory,
    refreshStatus: refreshOptimizer,
  } = useStrategyOptimizer()

  // Signal Ledger remote state
  const [liveRemote, setLiveRemote] = useState<Record<string, unknown>[]>([])
  const [historicalRemote, setHistoricalRemote] = useState<Record<string, unknown>[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [expandedSignalKey, setExpandedSignalKey] = useState<string | null>(null)

  // Ledger Filters
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('ALL')
  const [strategyFilter, setStrategyFilter] = useState('ALL')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<SignalStatusFilter>('ALL')
  const [timeframeFilter, setTimeframeFilter] = useState('ALL')
  const [ledgerPage, setLedgerPage] = useState(1)
  const PAGE_SIZE = 25

  // Rejections state
  const [rejections, setRejections] = useState<RejectionRecord[]>([])
  const [rejectionsLoading, setRejectionsLoading] = useState(false)
  const [rejectionsError, setRejectionsError] = useState<string | null>(null)
  const [rejectSearch, setRejectSearch] = useState('')
  const [rejectSymbolFilter, setRejectSymbolFilter] = useState('ALL')
  const [rejectStrategyFilter, setRejectStrategyFilter] = useState('ALL')
  const [rejectTfFilter, setRejectTfFilter] = useState('ALL')

  // System Telemetry state
  const [scannerStatus, setScannerStatus] = useState<{
    status: string
    message: string
    redis?: string
    scanState?: Record<string, unknown>
  } | null>(null)
  const [healthData, setHealthData] = useState<BackendHealthData | null>(null)
  const [globalScanStatus, setGlobalScanStatus] = useState<GlobalScannerStatus | null>(null)
  const [localScanProgress, setLocalScanProgress] = useState<ScanProgress | null>(null)
  const [telemetryLoading, setTelemetryLoading] = useState(false)
  const [manualScanBusy, setManualScanBusy] = useState(false)
  const [manualScanNotice, setManualScanNotice] = useState<{
    tone: 'ok' | 'err'
    text: string
  } | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeResult, setProbeResult] = useState<DiagnosticProbeResult | null>(null)

  const handleSelectTab = (tab: OpsTab) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  // Subscribe to local client MultiSymbolScanner progress
  useEffect(() => {
    const unsub = subscribeScanProgress((p) => {
      setLocalScanProgress(p)
    })
    return () => {
      unsub()
    }
  }, [])

  // Fetch Signals Ledger
  const fetchLedgerSignals = useCallback(async () => {
    setLedgerLoading(true)
    try {
      const [liveRes, histRes] = await Promise.allSettled([
        getLiveSignals(),
        getHistoricalSignals(),
      ])
      if (liveRes.status === 'fulfilled' && Array.isArray(liveRes.value)) {
        setLiveRemote(liveRes.value as Record<string, unknown>[])
      }
      if (histRes.status === 'fulfilled' && Array.isArray(histRes.value?.signals)) {
        setHistoricalRemote(histRes.value.signals as Record<string, unknown>[])
      }
    } finally {
      setLedgerLoading(false)
    }
  }, [])

  // Fetch Scanner Rejections
  const fetchRejections = useCallback(async () => {
    setRejectionsLoading(true)
    setRejectionsError(null)
    try {
      const headers = await getAuthHeaders()
      const collected: RejectionRecord[] = []
      const seenIds = new Set<string>()
      const addUnique = (items: RejectionRecord[]) => {
        for (const item of items) {
          const dedupKey = `${item.symbol}|${item.timeframe}|${item.strategy}|${item.reason}|${item.timestampMs ?? ''}`
          if (!seenIds.has(dedupKey)) {
            seenIds.add(dedupKey)
            collected.push(item)
          }
        }
      }

      let globalSucceeded = false
      try {
        const res = await fetch(buildApiUrl('/api/scanner/rejects'), { headers })
        if (res.ok) {
          const data = await res.json()
          const parsed = parseRejectionPayload(data)
          addUnique(parsed)
          if (parsed.length > 0 || data?.allKeys || Array.isArray(data?.rejects)) {
            globalSucceeded = true
          }
        }
      } catch {
        // Ignore and fall back to per-symbol sweep
      }

      if (!globalSucceeded) {
        const results = await Promise.allSettled(
          WATCHLIST_REJECT_SWEEP.map(async ({ symbol, timeframe }) => {
            const res = await getScannerRejects(symbol, timeframe).catch(() => null)
            if (res?.rejects) {
              return parseRejectionPayload(res, symbol, timeframe)
            }
            const slashed = slashSymbolFallback(symbol)
            if (slashed) {
              const fallbackRes = await getScannerRejects(slashed, timeframe).catch(() => null)
              if (fallbackRes?.rejects) {
                return parseRejectionPayload(fallbackRes, symbol, timeframe)
              }
            }
            return []
          })
        )
        for (const r of results) {
          if (r.status === 'fulfilled') addUnique(r.value)
        }
      }

      collected.sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0))
      setRejections(collected)
    } catch (err) {
      setRejectionsError(err instanceof Error ? err.message : 'Failed to fetch scanner rejections')
    } finally {
      setRejectionsLoading(false)
    }
  }, [])

  // Fetch Telemetry (Scanner Status, Global Signal Status, Health)
  const fetchTelemetry = useCallback(async () => {
    setTelemetryLoading(true)
    try {
      const headers = await getAuthHeaders()
      const [statusRes, globalRes, healthRes] = await Promise.allSettled([
        getScannerStatus(),
        fetch(buildApiUrl('/api/global-signals/status'), { headers }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch(HEALTH_URL).then((r) => (r.ok ? r.json() : null)),
      ])

      if (statusRes.status === 'fulfilled') {
        setScannerStatus(
          statusRes.value as {
            status: string
            message: string
            redis?: string
            scanState?: Record<string, unknown>
          }
        )
      }
      if (globalRes.status === 'fulfilled' && globalRes.value) {
        setGlobalScanStatus(globalRes.value as GlobalScannerStatus)
      }
      if (healthRes.status === 'fulfilled' && healthRes.value) {
        setHealthData(healthRes.value as BackendHealthData)
      }
    } finally {
      setTelemetryLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        void fetchLedgerSignals()
        void fetchRejections()
        void fetchTelemetry()
      }
    })
    return () => {
      cancelled = true
    }
  }, [fetchLedgerSignals, fetchRejections, fetchTelemetry])

  // Merge notifications + storeSignals + liveRemote + historicalRemote cleanly
  const ledgerSignals = useMemo<LedgerSignal[]>(() => {
    const map = new Map<string, LedgerSignal>()

    const upsert = (incoming: LedgerSignal) => {
      const existing = map.get(incoming.key)
      if (!existing) {
        map.set(incoming.key, incoming)
        return
      }
      const statusRank = { WIN: 4, LOSS: 4, EXPIRED: 3, LIVE: 1 }
      const chosenStatus =
        statusRank[incoming.status] >= statusRank[existing.status] ? incoming.status : existing.status
      map.set(incoming.key, {
        ...existing,
        ...incoming,
        status: chosenStatus,
        read: existing.hasNotification ? existing.read : incoming.read,
        hasNotification: existing.hasNotification || incoming.hasNotification,
        reason: incoming.reason.length > existing.reason.length ? incoming.reason : existing.reason,
        timestampMs: Math.max(existing.timestampMs, incoming.timestampMs),
      })
    }

    for (const s of historicalRemote) {
      const id = String(s.id || `${s.symbol}-${s.timeframe}-${s.strategyId}-${s.time}`)
      const symbol = compactSymbol(String(s.symbol || 'UNKNOWN'))
      const tf = String(s.timeframe || '1H')
      const entry = Number(s.entry ?? 0)
      const sl = Number(s.sl ?? 0)
      const tp = Number(s.tp ?? 0)
      const risk = Math.abs(entry - sl)
      const reward = Math.abs(tp - entry)
      const rr = Number(s.rr ?? (risk > 0 ? Number((reward / risk).toFixed(2)) : 0))
      const strategyId = String(s.strategyId || s.strategy || 'scanner')
      const rawStatus = String(s.status || 'expired')
      upsert({
        key: id,
        id,
        symbol,
        timeframe: tf,
        strategyId,
        strategyLabel: strategyDisplayName(
          strategyId,
          typeof s.strategyLabel === 'string' ? s.strategyLabel : undefined
        ),
        direction: String(s.direction || s.action || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        entry,
        sl,
        tp,
        rr,
        confidence: Number(s.confidence ?? 0),
        status: normalizeSignalStatus(rawStatus),
        rawStatus,
        reason: Array.isArray(s.reason) ? s.reason.map(String) : [],
        timestampMs: normalizeTimestampMs(s.time ?? s.createdAt),
        read: true,
        hasNotification: false,
        source: 'historical',
      })
    }

    for (const s of liveRemote) {
      const id = String(s.id || `${s.symbol}-${s.timeframe}-${s.strategyId}-${s.time}`)
      const symbol = compactSymbol(String(s.symbol || 'UNKNOWN'))
      const tf = String(s.timeframe || '1H')
      const entry = Number(s.entry ?? 0)
      const sl = Number(s.sl ?? 0)
      const tp = Number(s.tp ?? 0)
      const risk = Math.abs(entry - sl)
      const reward = Math.abs(tp - entry)
      const rr = Number(s.rr ?? (risk > 0 ? Number((reward / risk).toFixed(2)) : 0))
      const strategyId = String(s.strategyId || s.strategy || 'scanner')
      const rawStatus = String(s.status || 'live')
      upsert({
        key: id,
        id,
        symbol,
        timeframe: tf,
        strategyId,
        strategyLabel: strategyDisplayName(
          strategyId,
          typeof s.strategyLabel === 'string' ? s.strategyLabel : undefined
        ),
        direction: String(s.direction || s.action || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        entry,
        sl,
        tp,
        rr,
        confidence: Number(s.confidence ?? 0),
        status: normalizeSignalStatus(rawStatus),
        rawStatus,
        reason: Array.isArray(s.reason) ? s.reason.map(String) : [],
        timestampMs: normalizeTimestampMs(s.time ?? s.createdAt),
        read: true,
        hasNotification: false,
        source: 'live',
      })
    }

    for (const s of storeSignals) {
      const id = s.id
      upsert({
        key: id,
        id,
        symbol: compactSymbol(s.symbol),
        timeframe: s.timeframe,
        strategyId: s.strategyId,
        strategyLabel: strategyDisplayName(s.strategyId, s.strategyLabel),
        direction: s.direction,
        entry: s.entry,
        sl: s.sl,
        tp: s.tp,
        rr: s.rr,
        confidence: s.confidence,
        status: normalizeSignalStatus(s.status || 'live'),
        rawStatus: String(s.status || 'live'),
        reason: s.reason || [],
        timestampMs: normalizeTimestampMs(s.time),
        read: true,
        hasNotification: false,
        source: 'live',
      })
    }

    for (const n of notifications) {
      const id = n.id
      const risk = Math.abs(n.entry - n.sl)
      const reward = Math.abs(n.tp - n.entry)
      const rr = n.rr ?? (risk > 0 ? Number((reward / risk).toFixed(2)) : 0)
      upsert({
        key: id,
        id,
        symbol: compactSymbol(n.symbol),
        timeframe: n.timeframe,
        strategyId: n.strategyId,
        strategyLabel: strategyDisplayName(n.strategyId, n.strategyLabel),
        direction: n.direction,
        entry: n.entry,
        sl: n.sl,
        tp: n.tp,
        rr,
        confidence: n.confidence,
        status: 'LIVE',
        rawStatus: 'live',
        reason: n.reason || [],
        timestampMs: normalizeTimestampMs(n.createdAt ?? n.time),
        read: n.read,
        hasNotification: true,
        source: 'alert',
      })
    }

    return Array.from(map.values()).sort((a, b) => b.timestampMs - a.timestampMs)
  }, [historicalRemote, liveRemote, storeSignals, notifications])

  // Summary metrics
  const ledgerSummary = useMemo(() => {
    let live = 0
    let win = 0
    let loss = 0
    let expired = 0
    for (const s of ledgerSignals) {
      if (s.status === 'WIN') win += 1
      else if (s.status === 'LOSS') loss += 1
      else if (s.status === 'EXPIRED') expired += 1
      else live += 1
    }
    const decided = win + loss
    const winRate = decided > 0 ? Math.round((win / decided) * 100) : 0
    return { total: ledgerSignals.length, live, win, loss, expired, winRate }
  }, [ledgerSignals])

  const availableSymbols = useMemo(() => {
    const set = new Set<string>()
    for (const s of ledgerSignals) set.add(s.symbol)
    return Array.from(set).sort()
  }, [ledgerSignals])

  const availableStrategies = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of ONBOARDING_STRATEGIES) {
      map.set(normalizeStrategyId(s.id), s.name)
    }
    for (const s of ledgerSignals) {
      const norm = normalizeStrategyId(s.strategyId)
      if (!map.has(norm)) map.set(norm, s.strategyLabel)
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [ledgerSignals])

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase()
    return ledgerSignals.filter((s) => {
      if (symbolFilter !== 'ALL' && s.symbol !== symbolFilter) return false
      if (strategyFilter !== 'ALL' && normalizeStrategyId(s.strategyId) !== strategyFilter) return false
      if (directionFilter !== 'ALL' && s.direction !== directionFilter) return false
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (timeframeFilter !== 'ALL' && s.timeframe !== timeframeFilter) return false
      if (q) {
        const hay = `${s.symbol} ${s.strategyLabel} ${s.strategyId} ${s.direction} ${s.reason.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [ledgerSignals, ledgerSearch, symbolFilter, strategyFilter, directionFilter, statusFilter, timeframeFilter])

  const totalLedgerPages = Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE))
  const safeLedgerPage = Math.min(ledgerPage, totalLedgerPages)
  const paginatedLedger = useMemo(() => {
    const start = (safeLedgerPage - 1) * PAGE_SIZE
    return filteredLedger.slice(start, start + PAGE_SIZE)
  }, [filteredLedger, safeLedgerPage])

  // Rejection filters & top reasons
  const rejectionSymbols = useMemo(() => {
    const set = new Set<string>()
    for (const r of rejections) set.add(r.symbol)
    return Array.from(set).sort()
  }, [rejections])

  const rejectionStrategies = useMemo(() => {
    const set = new Set<string>()
    for (const r of rejections) set.add(r.strategy)
    return Array.from(set).sort()
  }, [rejections])

  const filteredRejections = useMemo(() => {
    const q = rejectSearch.trim().toLowerCase()
    return rejections.filter((r) => {
      if (rejectSymbolFilter !== 'ALL' && r.symbol !== rejectSymbolFilter) return false
      if (rejectStrategyFilter !== 'ALL' && r.strategy !== rejectStrategyFilter) return false
      if (rejectTfFilter !== 'ALL' && r.timeframe !== rejectTfFilter) return false
      if (q) {
        const hay = `${r.symbol} ${r.strategy} ${r.reason} ${r.timeframe}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rejections, rejectSearch, rejectSymbolFilter, rejectStrategyFilter, rejectTfFilter])

  const topRejectionReason = useMemo(() => {
    if (rejections.length === 0) return 'None buffered'
    const counts = new Map<string, number>()
    for (const r of rejections) {
      const bucket = r.reason.split(':')[0].slice(0, 42)
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }
    let top = 'None buffered'
    let max = 0
    for (const [k, v] of counts.entries()) {
      if (v > max) {
        max = v
        top = `${k} (${v})`
      }
    }
    return top
  }, [rejections])

  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Timestamp',
      'Symbol',
      'Timeframe',
      'Strategy',
      'Direction',
      'Status',
      'Entry',
      'SL',
      'TP',
      'RR',
      'Confidence',
      'Reasons',
    ]
    const rows = filteredLedger.map((s) => [
      s.id,
      new Date(s.timestampMs).toISOString(),
      s.symbol,
      s.timeframe,
      `"${s.strategyLabel.replace(/"/g, '""')}"`,
      s.direction,
      s.status,
      formatPrice(s.entry),
      formatPrice(s.sl),
      formatPrice(s.tp),
      s.rr.toFixed(2),
      `${s.confidence}%`,
      `"${s.reason.join(' | ').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `traxo-signals-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenInTerminal = (signal: LedgerSignal) => {
    if (signal.hasNotification && !signal.read) {
      markRead(signal.id)
    }
    if (VALID_CHART_SYMBOLS.has(signal.symbol)) {
      setChartSymbol(signal.symbol as ChartSymbol)
    }
    if (VALID_CHART_TIMEFRAMES.has(signal.timeframe)) {
      setChartTimeframe(signal.timeframe as ChartTimeframe)
    }
    navigate('/dashboard')
  }

  const handleTriggerManualScan = async () => {
    setManualScanBusy(true)
    setManualScanNotice(null)
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      }
      let res = await fetch(buildApiUrl('/api/scanner/trigger'), {
        method: 'POST',
        headers,
      })
      if (res.status === 404) {
        res = await fetch(buildApiUrl('/api/scanner/scan'), {
          method: 'POST',
          headers,
        })
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json().catch(() => ({}))
      setManualScanNotice({
        tone: 'ok',
        text: data?.message || 'Backend scanner cycle triggered. Refreshing telemetry & ledger.',
      })
      setTimeout(() => {
        void fetchTelemetry()
        void fetchRejections()
        void fetchLedgerSignals()
      }, 900)
    } catch (err) {
      setManualScanNotice({
        tone: 'err',
        text: `Backend manual trigger unavailable (${err instanceof Error ? err.message : 'offline'}). Use Client Diagnostic Probe below.`,
      })
    } finally {
      setManualScanBusy(false)
    }
  }

  const handleRunClientProbe = async () => {
    setProbeBusy(true)
    try {
      const targets = [
        { symbol: 'EURUSD', timeframe: '1H' },
        { symbol: 'XAUUSD', timeframe: '15m' },
        { symbol: 'GBPUSD', timeframe: '15m' },
      ]
      const stratIds =
        activeStrategies.length > 0
          ? activeStrategies
          : ['wick-rejection', 'breakout', 'order-block', 'supply-demand', 'trend-following']

      const items = await Promise.all(
        targets.map(async ({ symbol, timeframe }) => {
          const t0 = performance.now()
          try {
            const candles = await getCandleData(symbol, timeframe, 200)
            const detected = runSignalsForStrategies(candles, symbol, timeframe, stratIds)
            return {
              symbol,
              timeframe,
              candles: candles.length,
              signals: detected.length,
              latencyMs: Math.round(performance.now() - t0),
            }
          } catch (err) {
            return {
              symbol,
              timeframe,
              candles: 0,
              signals: 0,
              latencyMs: Math.round(performance.now() - t0),
              error: err instanceof Error ? err.message : 'Fetch error',
            }
          }
        })
      )
      setProbeResult({
        ranAt: Date.now(),
        totalSignals: items.reduce((acc, i) => acc + i.signals, 0),
        items,
      })
    } finally {
      setProbeBusy(false)
    }
  }

  const handleRefreshAll = () => {
    void fetchLedgerSignals()
    void fetchRejections()
    void fetchTelemetry()
    void refreshMt5Account()
    void refreshOptimizer()
  }

  const scanState = scannerStatus?.scanState as
    | {
        running?: boolean
        currentSymbol?: string
        current?: string
        done?: number
        total?: number
        lastCompletedAt?: number | string | null
        lastScanAt?: number | string | null
        signalsFound?: number
        rejectsCount?: number
      }
    | undefined

  const effectiveRunning = Boolean(
    scanState?.running ?? globalScanStatus?.running ?? localScanProgress?.running
  )
  const effectiveDone = Number(scanState?.done ?? globalScanStatus?.done ?? localScanProgress?.done ?? 0)
  const effectiveTotal = Number(scanState?.total ?? globalScanStatus?.total ?? localScanProgress?.total ?? 0)
  const effectiveCurrent = String(
    scanState?.currentSymbol ?? scanState?.current ?? globalScanStatus?.current ?? localScanProgress?.current ?? ''
  )
  const effectiveLastAt =
    scanState?.lastCompletedAt ??
    scanState?.lastScanAt ??
    globalScanStatus?.lastCompletedAt ??
    localScanProgress?.lastCompletedAt ??
    null
  const scanProgressPct =
    effectiveTotal > 0 ? Math.min(100, Math.round((effectiveDone / effectiveTotal) * 100)) : 0

  const isRedisOk = scannerStatus?.redis === 'connected' || scannerStatus?.status === 'ok'
  const isHealthOk = healthData?.status === 'ok'
  const tdKeys = healthData?.twelvedata?.keys ?? []
  const tdAvailable = healthData?.twelvedata?.availableKeys ?? 0

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-[#71717A]">Signals &amp; Ops</p>
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
                Signal Ledger &amp; Engine Ops
              </h1>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161619] text-[12px] text-[#A1A1AA]">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    effectiveRunning ? 'bg-[#34D399]' : isRedisOk ? 'bg-[#FAFAFA]' : 'bg-[#71717A]'
                  }`}
                />
                <span>
                  {effectiveRunning
                    ? `Scanning ${effectiveCurrent || '...'}`
                    : 'Scanner Standby'}
                </span>
              </span>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#18181B] text-[12px] font-mono tabular-nums text-[#FAFAFA]">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
              Setup ledger, guardrail rejections, and real-time scanner infrastructure health.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleTriggerManualScan}
              disabled={manualScanBusy}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-2 rounded-xl bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] disabled:opacity-50 text-[13px] font-medium transition-colors"
            >
              <PiPlay className="h-4 w-4 shrink-0" />
              <span className="truncate">{manualScanBusy ? 'Triggering...' : 'Run Manual Scan'}</span>
            </button>
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={ledgerLoading || rejectionsLoading || telemetryLoading}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] disabled:opacity-50 transition-colors"
            >
              <PiArrowsClockwise
                className={`h-4 w-4 text-[#A1A1AA] shrink-0 ${
                  ledgerLoading || rejectionsLoading || telemetryLoading ? 'animate-spin' : ''
                }`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {manualScanNotice && (
          <div
            className={`px-4 py-3 rounded-2xl border text-[13px] flex items-center justify-between gap-3 ${
              manualScanNotice.tone === 'ok'
                ? 'bg-[#111113] border-[#34D399]/30 text-[#34D399]'
                : 'bg-[#111113] border-[#F87171]/30 text-[#F87171]'
            }`}
          >
            <span>{manualScanNotice.text}</span>
            <button
              type="button"
              onClick={() => setManualScanNotice(null)}
              className="min-h-[36px] px-2 text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Unboxed Summary Strip */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] grid grid-cols-2 lg:grid-cols-4">
          <div className="p-4 sm:p-5 space-y-1 border-r border-b lg:border-b-0 border-white/[0.06]">
            <div className="flex items-center justify-between text-[12px] text-[#71717A]">
              <span>Signal Ledger</span>
              <PiBell className="h-4 w-4 shrink-0" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                {ledgerSummary.total}
              </span>
              <span className="text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                {ledgerSummary.live} live
              </span>
            </div>
            <div className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {unreadCount} unread alerts
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
            <div className="flex items-center justify-between text-[12px] text-[#71717A]">
              <span>Resolved Win Rate</span>
              <PiGauge className="h-4 w-4 shrink-0" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={`text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums ${
                  ledgerSummary.winRate >= 50 ? 'text-[#34D399]' : 'text-[#FAFAFA]'
                }`}
              >
                {ledgerSummary.winRate}%
              </span>
              <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                <span className="text-[#34D399]">{ledgerSummary.win}W</span> /{' '}
                <span className="text-[#F87171]">{ledgerSummary.loss}L</span>
              </span>
            </div>
            <div className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {ledgerSummary.expired} expired
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1 border-r border-white/[0.06]">
            <div className="flex items-center justify-between text-[12px] text-[#71717A]">
              <span>Scanner Rejections</span>
              <PiShieldCheck className="h-4 w-4 shrink-0" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                {rejections.length}
              </span>
              <span className="text-[12px] text-[#71717A]">buffered</span>
            </div>
            <div className="text-[12px] text-[#71717A] truncate" title={topRejectionReason}>
              Top: {topRejectionReason}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="flex items-center justify-between text-[12px] text-[#71717A]">
              <span>Engine &amp; Broker</span>
              <PiHardDrives className="h-4 w-4 shrink-0" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className={`text-[14px] sm:text-[15px] font-medium ${
                  mt5Account?.connected ? 'text-[#34D399]' : 'text-[#FAFAFA]'
                }`}
              >
                {mt5Account?.connected ? 'MT5 Online' : isHealthOk ? 'API Online' : 'Standby'}
              </span>
              <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                {mt5Positions.length} open
              </span>
            </div>
            <div className="text-[11.5px] sm:text-[12px] font-mono tabular-nums text-[#71717A] truncate">
              Opt: {optimizerStatus?.isFeedbackEngineEnabled ? 'Active' : 'Paused'} · TD:{' '}
              {healthData ? tdAvailable : '—'}
            </div>
          </div>
        </section>

        {/* Sleek Rounded-Full 3-Tab Switcher */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center overflow-x-auto pb-1">
          <div className="inline-flex items-center gap-1 rounded-full bg-[#111113] border border-white/[0.07] p-1 sm:p-1.5">
            <button
              type="button"
              onClick={() => handleSelectTab('ledger')}
              className={`min-h-[44px] sm:min-h-0 inline-flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                activeTab === 'ledger'
                  ? 'bg-[#FAFAFA] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
              }`}
            >
              <PiBell className="h-4 w-4" />
              <span>Signal Ledger</span>
              <span
                className={`text-[12px] font-mono tabular-nums ${
                  activeTab === 'ledger' ? 'text-[#52525B]' : 'text-[#71717A]'
                }`}
              >
                {ledgerSignals.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('rejections')}
              className={`min-h-[44px] sm:min-h-0 inline-flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                activeTab === 'rejections'
                  ? 'bg-[#FAFAFA] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
              }`}
            >
              <PiShieldCheck className="h-4 w-4" />
              <span>Scanner Rejections</span>
              <span
                className={`text-[12px] font-mono tabular-nums ${
                  activeTab === 'rejections' ? 'text-[#52525B]' : 'text-[#71717A]'
                }`}
              >
                {rejections.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('telemetry')}
              className={`min-h-[44px] sm:min-h-0 inline-flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                activeTab === 'telemetry'
                  ? 'bg-[#FAFAFA] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
              }`}
            >
              <PiCpu className="h-4 w-4" />
              <span>Engine Health</span>
            </button>
          </div>
        </div>

        {/* TAB 1: SIGNAL LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-5">
            {/* Clean Filter Toolbar */}
            <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1 min-w-0">
                  <PiMagnifyingGlass className="h-4 w-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => {
                      setLedgerSearch(e.target.value)
                      setLedgerPage(1)
                    }}
                    placeholder="Filter by symbol, strategy, or confluence note..."
                    className="w-full min-h-[44px] sm:min-h-0 pl-9 pr-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[13px] text-[#FAFAFA] placeholder:text-[#71717A]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5">
                  <select
                    value={symbolFilter}
                    onChange={(e) => {
                      setSymbolFilter(e.target.value)
                      setLedgerPage(1)
                    }}
                    aria-label="Filter by symbol"
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                  >
                    <option value="ALL">All symbols</option>
                    {availableSymbols.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </select>

                  <select
                    value={timeframeFilter}
                    onChange={(e) => {
                      setTimeframeFilter(e.target.value)
                      setLedgerPage(1)
                    }}
                    aria-label="Filter by timeframe"
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                  >
                    <option value="ALL">All timeframes</option>
                    {['1m', '5m', '15m', '1H', '4H', '1D'].map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>

                  <select
                    value={strategyFilter}
                    onChange={(e) => {
                      setStrategyFilter(e.target.value)
                      setLedgerPage(1)
                    }}
                    aria-label="Filter by strategy"
                    className="col-span-2 sm:col-span-1 w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                  >
                    <option value="ALL">All strategies</option>
                    {availableStrategies.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-white/[0.06]">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
                  <div className="overflow-x-auto max-w-full">
                    <div className="inline-flex items-center rounded-full bg-[#18181B] p-1">
                      {(['ALL', 'BUY', 'SELL'] as DirectionFilter[]).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => {
                            setDirectionFilter(dir)
                            setLedgerPage(1)
                          }}
                          className={`min-h-[38px] sm:min-h-0 px-3.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                            directionFilter === dir
                              ? 'bg-[#FAFAFA] text-[#09090B]'
                              : dir === 'BUY'
                                ? 'text-[#34D399] hover:text-[#FAFAFA]'
                                : dir === 'SELL'
                                  ? 'text-[#F87171] hover:text-[#FAFAFA]'
                                  : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                          }`}
                        >
                          {dir === 'ALL' ? 'All sides' : dir}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto max-w-full">
                    <div className="inline-flex items-center rounded-full bg-[#18181B] p-1">
                      {(['ALL', 'LIVE', 'WIN', 'LOSS', 'EXPIRED'] as SignalStatusFilter[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setStatusFilter(st)
                            setLedgerPage(1)
                          }}
                          className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                            statusFilter === st
                              ? 'bg-[#FAFAFA] text-[#09090B]'
                              : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                          }`}
                        >
                          {st === 'ALL'
                            ? 'All'
                            : st.charAt(0) + st.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[12px] font-medium text-[#FAFAFA] transition-colors"
                    >
                      <PiChecks className="h-4 w-4 text-[#34D399]" />
                      <span>Mark All Read</span>
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={clearNotifications}
                      className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[12px] font-medium text-[#A1A1AA] hover:text-[#F87171] transition-colors"
                    >
                      <PiTrash className="h-4 w-4" />
                      <span>Clear Alerts</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={filteredLedger.length === 0}
                    className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] disabled:opacity-40 text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                  >
                    <PiDownloadSimple className="h-4 w-4" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Table Card */}
            <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
              {filteredLedger.length === 0 ? (
                <div className="p-8 sm:p-12 text-center space-y-3">
                  <img
                    src="/brand/empty-signals.png"
                    alt="No signals matching filter"
                    className="w-full max-w-[260px] mx-auto rounded-xl object-cover opacity-90"
                  />
                  <p className="text-[15px] font-medium text-[#FAFAFA]">
                    {ledgerLoading ? 'Loading signal ledger...' : 'No setups match current filters'}
                  </p>
                  <p className="text-[13px] text-[#71717A] max-w-md mx-auto">
                    Adjust direction or status filters, or run a manual scan to populate recent setups.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Stacked Card Rows (< 768px) */}
                  <div className="md:hidden divide-y divide-white/[0.06]">
                    {paginatedLedger.map((sig) => {
                      const isExpanded = expandedSignalKey === sig.key
                      const isUnread = sig.hasNotification && !sig.read
                      return (
                        <div
                          key={sig.key}
                          className={`p-4 space-y-3 ${isUnread ? 'bg-white/[0.02]' : ''}`}
                        >
                          <div
                            onClick={() => setExpandedSignalKey(isExpanded ? null : sig.key)}
                            className="space-y-2.5 cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                {isUnread && (
                                  <span
                                    className="h-2 w-2 rounded-full bg-[#34D399] shrink-0"
                                    title="Unread alert"
                                  />
                                )}
                                <span className="text-[15px] font-semibold text-[#FAFAFA]">
                                  {sig.symbol}
                                </span>
                                <span className="text-[12px] font-mono text-[#71717A]">
                                  {sig.timeframe}
                                </span>
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                    sig.direction === 'BUY'
                                      ? 'bg-[#34D399]/10 text-[#34D399]'
                                      : 'bg-[#F87171]/10 text-[#F87171]'
                                  }`}
                                >
                                  {sig.direction}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                    sig.status === 'WIN'
                                      ? 'bg-[#34D399]/10 text-[#34D399]'
                                      : sig.status === 'LOSS'
                                        ? 'bg-[#F87171]/10 text-[#F87171]'
                                        : sig.status === 'LIVE'
                                          ? 'bg-[#18181B] text-[#FAFAFA]'
                                          : 'bg-[#161619] text-[#71717A]'
                                  }`}
                                >
                                  {sig.status}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[12px] text-[#A1A1AA]">
                              <span className="truncate">{sig.strategyLabel}</span>
                              <span className="font-mono tabular-nums text-[#71717A] shrink-0">
                                {formatRelative(sig.timestampMs)}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#161619] p-2.5 text-[12px]">
                              <div>
                                <div className="text-[10.5px] text-[#71717A]">Entry</div>
                                <div className="font-mono tabular-nums text-[#FAFAFA] mt-0.5">
                                  {formatPrice(sig.entry)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10.5px] text-[#71717A]">Stop Loss</div>
                                <div className="font-mono tabular-nums text-[#F87171] mt-0.5">
                                  {formatPrice(sig.sl)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10.5px] text-[#71717A]">Take Profit</div>
                                <div className="font-mono tabular-nums text-[#34D399] mt-0.5">
                                  {formatPrice(sig.tp)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                              <span>R:R {sig.rr ? `${sig.rr.toFixed(2)}R` : '—'}</span>
                              <span className="text-[#FAFAFA]">Conf {sig.confidence}%</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleOpenInTerminal(sig)}
                              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[12.5px] font-medium text-[#FAFAFA] transition-colors"
                            >
                              <span>Open Chart</span>
                              <PiArrowUpRight className="h-3.5 w-3.5 text-[#A1A1AA]" />
                            </button>
                            {isUnread && (
                              <button
                                type="button"
                                onClick={() => markRead(sig.id)}
                                title="Mark as read"
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#A1A1AA] hover:text-[#34D399] transition-colors"
                              >
                                <PiCheck className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSignalKey(isExpanded ? null : sig.key)
                              }
                              aria-label="Toggle details"
                              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-[#18181B] text-[#71717A] hover:text-[#FAFAFA]"
                            >
                              {isExpanded ? (
                                <PiCaretUp className="h-4 w-4" />
                              ) : (
                                <PiCaretDown className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="rounded-xl bg-[#0D0D10] border border-white/[0.06] p-3.5 space-y-2.5">
                              <div className="text-[11.5px] text-[#71717A] break-all">
                                <span className="font-mono tabular-nums">{sig.id}</span> · Logged{' '}
                                <span className="font-mono tabular-nums">
                                  {formatDateTime(sig.timestampMs)}
                                </span>{' '}
                                · {sig.source}
                              </div>
                              {sig.reason.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {sig.reason.map((r, i) => (
                                    <span
                                      key={i}
                                      className="px-2.5 py-1 rounded-lg bg-[#161619] text-[12px] text-[#A1A1AA]"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[12.5px] text-[#71717A]">
                                  No extra confluence notes recorded.
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop Table (>= 768px) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-[12px] font-medium text-[#71717A]">
                          <th className="py-3.5 px-4">Detected</th>
                          <th className="py-3.5 px-4">Pair</th>
                          <th className="py-3.5 px-4">Strategy</th>
                          <th className="py-3.5 px-4">Side</th>
                          <th className="py-3.5 px-4 text-right">Entry</th>
                          <th className="py-3.5 px-4 text-right">SL</th>
                          <th className="py-3.5 px-4 text-right">TP</th>
                          <th className="py-3.5 px-4 text-right">R:R</th>
                          <th className="py-3.5 px-4 text-right">Conf</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] text-[13.5px]">
                        {paginatedLedger.map((sig) => {
                          const isExpanded = expandedSignalKey === sig.key
                          const isUnread = sig.hasNotification && !sig.read
                          return (
                            <Fragment key={sig.key}>
                              <tr
                                onClick={() =>
                                  setExpandedSignalKey(isExpanded ? null : sig.key)
                                }
                                className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${
                                  isUnread ? 'bg-white/[0.02]' : ''
                                }`}
                              >
                                <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-[#A1A1AA]">
                                  <div className="flex items-center gap-2">
                                    {isUnread && (
                                      <span
                                        className="h-2 w-2 rounded-full bg-[#34D399] shrink-0"
                                        title="Unread alert"
                                      />
                                    )}
                                    <span>{formatRelative(sig.timestampMs)}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span className="font-medium text-[#FAFAFA]">{sig.symbol}</span>{' '}
                                  <span className="text-[12px] text-[#71717A]">
                                    {sig.timeframe}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-[#A1A1AA] max-w-[180px] truncate">
                                  {sig.strategyLabel}
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
                                      sig.direction === 'BUY'
                                        ? 'bg-[#34D399]/10 text-[#34D399]'
                                        : 'bg-[#F87171]/10 text-[#F87171]'
                                    }`}
                                  >
                                    {sig.direction}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#FAFAFA]">
                                  {formatPrice(sig.entry)}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F87171]">
                                  {formatPrice(sig.sl)}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#34D399]">
                                  {formatPrice(sig.tp)}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#A1A1AA]">
                                  {sig.rr ? `${sig.rr.toFixed(2)}R` : '—'}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#FAFAFA]">
                                  {sig.confidence}%
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
                                      sig.status === 'WIN'
                                        ? 'bg-[#34D399]/10 text-[#34D399]'
                                        : sig.status === 'LOSS'
                                          ? 'bg-[#F87171]/10 text-[#F87171]'
                                          : sig.status === 'LIVE'
                                            ? 'bg-[#18181B] text-[#FAFAFA]'
                                            : 'bg-[#161619] text-[#71717A]'
                                    }`}
                                  >
                                    {sig.status}
                                  </span>
                                </td>
                                <td
                                  className="py-3.5 px-4 text-right whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="inline-flex items-center gap-1.5">
                                    {isUnread && (
                                      <button
                                        type="button"
                                        onClick={() => markRead(sig.id)}
                                        title="Mark as read"
                                        className="p-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#A1A1AA] hover:text-[#34D399] transition-colors"
                                      >
                                        <PiCheck className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenInTerminal(sig)}
                                      title="Open in Terminal"
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[12px] font-medium text-[#FAFAFA] transition-colors"
                                    >
                                      <span>Chart</span>
                                      <PiArrowUpRight className="h-3.5 w-3.5 text-[#A1A1AA]" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedSignalKey(isExpanded ? null : sig.key)
                                      }
                                      aria-label="Toggle details"
                                      className="p-1.5 text-[#71717A] hover:text-[#FAFAFA]"
                                    >
                                      {isExpanded ? (
                                        <PiCaretUp className="h-4 w-4" />
                                      ) : (
                                        <PiCaretDown className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${sig.key}-detail`} className="bg-[#0D0D10]">
                                  <td colSpan={11} className="px-5 py-4 border-t border-white/[0.05]">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                      <div className="space-y-2">
                                        <div className="text-[12px] text-[#71717A]">
                                          <span className="font-mono tabular-nums">{sig.id}</span> ·
                                          Logged{' '}
                                          <span className="font-mono tabular-nums">
                                            {formatDateTime(sig.timestampMs)}
                                          </span>{' '}
                                          · Source: {sig.source}
                                        </div>
                                        {sig.reason.length > 0 ? (
                                          <div className="flex flex-wrap gap-2">
                                            {sig.reason.map((r, i) => (
                                              <span
                                                key={i}
                                                className="px-2.5 py-1 rounded-lg bg-[#161619] text-[12px] text-[#A1A1AA]"
                                              >
                                                {r}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[13px] text-[#71717A]">
                                            No extra confluence notes recorded.
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenInTerminal(sig)}
                                        className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FAFAFA] text-[#09090B] text-[13px] font-medium hover:bg-[#E4E4E7] transition-colors"
                                      >
                                        <PiTerminalWindow className="h-4 w-4" />
                                        <span>
                                          Load {sig.symbol} {sig.timeframe}
                                        </span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {filteredLedger.length > PAGE_SIZE && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-white/[0.06] text-[13px] text-[#A1A1AA]">
                  <span className="font-mono tabular-nums text-center sm:text-left">
                    Showing {(safeLedgerPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(safeLedgerPage * PAGE_SIZE, filteredLedger.length)} of{' '}
                    {filteredLedger.length}
                  </span>
                  <div className="grid grid-cols-3 sm:flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeLedgerPage <= 1}
                      onClick={() => setLedgerPage(Math.max(1, safeLedgerPage - 1))}
                      className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] disabled:opacity-40 text-[12px] font-medium text-[#FAFAFA]"
                    >
                      Previous
                    </button>
                    <span className="px-2 font-mono tabular-nums text-[12px] text-center">
                      {safeLedgerPage} / {totalLedgerPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeLedgerPage >= totalLedgerPages}
                      onClick={() => setLedgerPage(Math.min(totalLedgerPages, safeLedgerPage + 1))}
                      className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] disabled:opacity-40 text-[12px] font-medium text-[#FAFAFA]"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SCANNER REJECTIONS */}
        {activeTab === 'rejections' && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <PiMagnifyingGlass className="h-4 w-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={rejectSearch}
                  onChange={(e) => setRejectSearch(e.target.value)}
                  placeholder="Search exact rejection reason (spread, R:R, cooldown, EMA)..."
                  className="w-full min-h-[44px] sm:min-h-0 pl-9 pr-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[13px] text-[#FAFAFA] placeholder:text-[#71717A]"
                />
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5">
                <select
                  value={rejectSymbolFilter}
                  onChange={(e) => setRejectSymbolFilter(e.target.value)}
                  aria-label="Filter rejections by symbol"
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA]"
                >
                  <option value="ALL">All symbols</option>
                  {rejectionSymbols.map((sym) => (
                    <option key={sym} value={sym}>
                      {sym}
                    </option>
                  ))}
                </select>

                <select
                  value={rejectTfFilter}
                  onChange={(e) => setRejectTfFilter(e.target.value)}
                  aria-label="Filter rejections by timeframe"
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA]"
                >
                  <option value="ALL">All timeframes</option>
                  {['1m', '5m', '15m', '1H', '4H', '1D'].map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>

                <select
                  value={rejectStrategyFilter}
                  onChange={(e) => setRejectStrategyFilter(e.target.value)}
                  aria-label="Filter rejections by strategy"
                  className="col-span-2 sm:col-span-1 w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA]"
                >
                  <option value="ALL">All strategies</option>
                  {rejectionStrategies.map((st) => (
                    <option key={st} value={st}>
                      {strategyDisplayName(st)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={fetchRejections}
                  disabled={rejectionsLoading}
                  className="col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
                >
                  <PiArrowsClockwise className={`h-4 w-4 ${rejectionsLoading ? 'animate-spin' : ''}`} />
                  <span>Reload</span>
                </button>
              </div>
            </div>

            {rejectionsError && (
              <div className="px-4 py-3 rounded-2xl bg-[#111113] border border-[#F87171]/30 text-[13px] text-[#F87171] flex items-center gap-2.5">
                <PiWarning className="h-4 w-4 shrink-0" />
                <span>{rejectionsError}</span>
              </div>
            )}

            <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
              {filteredRejections.length === 0 ? (
                <div className="p-8 sm:p-12 text-center space-y-3">
                  <img
                    src="/brand/empty-signals.png"
                    alt="No buffered scanner rejections"
                    className="w-full max-w-[260px] mx-auto rounded-xl object-cover opacity-90"
                  />
                  <p className="text-[15px] font-medium text-[#FAFAFA]">
                    {rejectionsLoading
                      ? 'Querying scan_rejects telemetry...'
                      : 'No scanner rejections currently buffered'}
                  </p>
                  <p className="text-[13px] text-[#71717A] max-w-md mx-auto">
                    Guardrail and filter rejections from Redis appear here when setups fail
                    confidence, R:R, spread, session, or correlation checks.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Stacked Rejection Cards (< 768px) */}
                  <div className="md:hidden divide-y divide-white/[0.06]">
                    {filteredRejections.map((r) => (
                      <div key={r.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-[14.5px] font-semibold text-[#FAFAFA]">
                              {r.symbol}
                            </span>
                            <span className="text-[12px] font-mono text-[#71717A]">
                              {r.timeframe}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-[#161619] text-[11.5px] text-[#A1A1AA] truncate max-w-[160px]">
                              {strategyDisplayName(r.strategy)}
                            </span>
                          </div>
                          <span className="text-[11.5px] font-mono tabular-nums text-[#71717A] shrink-0">
                            {r.timestampMs ? formatDateTime(r.timestampMs) : 'Latest cycle'}
                          </span>
                        </div>

                        <p className="text-[13px] text-[#FAFAFA] leading-relaxed break-words">
                          {r.reason}
                        </p>

                        {(r.confidence || r.spread) && (
                          <div className="flex flex-wrap items-center gap-2 text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                            {r.confidence && (
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#161619]">
                                Conf: {r.confidence}
                              </span>
                            )}
                            {r.spread && (
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#161619]">
                                Spread: {r.spread}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table (>= 768px) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-[12px] font-medium text-[#71717A]">
                          <th className="py-3.5 px-4">Timestamp</th>
                          <th className="py-3.5 px-4">Symbol</th>
                          <th className="py-3.5 px-4">Strategy</th>
                          <th className="py-3.5 px-4">Rejection Reason</th>
                          <th className="py-3.5 px-4 text-right">Conf</th>
                          <th className="py-3.5 px-4 text-right">Spread</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] text-[13.5px]">
                        {filteredRejections.map((r) => (
                          <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-[#71717A]">
                              {r.timestampMs ? formatDateTime(r.timestampMs) : 'Latest cycle'}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="font-medium text-[#FAFAFA]">{r.symbol}</span>{' '}
                              <span className="text-[12px] text-[#71717A]">{r.timeframe}</span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-[#A1A1AA]">
                              {strategyDisplayName(r.strategy)}
                            </td>
                            <td className="py-3.5 px-4 text-[#FAFAFA]">{r.reason}</td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#A1A1AA]">
                              {r.confidence ?? '—'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#A1A1AA]">
                              {r.spread ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ENGINE HEALTH */}
        {activeTab === 'telemetry' && (
          <div className="space-y-5 sm:space-y-6">
            {/* Row 1: Scanner Heartbeat + Infrastructure Matrix */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
              <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PiGauge className="h-5 w-5 text-[#FAFAFA] shrink-0" />
                    <h2 className="text-[15px] font-medium text-[#FAFAFA] truncate">
                      Scanner Heartbeat
                    </h2>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[12px] font-medium shrink-0 ${
                      effectiveRunning
                        ? 'bg-[#34D399]/10 text-[#34D399]'
                        : 'bg-[#18181B] text-[#A1A1AA]'
                    }`}
                  >
                    {effectiveRunning ? 'Running' : 'Idle'}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[12.5px] sm:text-[13px] text-[#A1A1AA]">
                    <span className="truncate">
                      {effectiveCurrent
                        ? `Active target: ${effectiveCurrent}`
                        : 'Waiting for next sweep'}
                    </span>
                    <span className="font-mono tabular-nums shrink-0">
                      {effectiveDone} / {effectiveTotal} ({scanProgressPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#161619] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FAFAFA] transition-all duration-300"
                      style={{ width: `${scanProgressPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-1">
                    <div className="text-[12px] text-[#71717A]">Last Sweep</div>
                    <div className="text-[13.5px] sm:text-[14px] font-mono tabular-nums text-[#FAFAFA]">
                      {effectiveLastAt
                        ? formatDateTime(normalizeTimestampMs(effectiveLastAt))
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-1">
                    <div className="text-[12px] text-[#71717A]">Global Scanner Error</div>
                    <div
                      className={`text-[13.5px] sm:text-[14px] truncate ${
                        globalScanStatus?.lastError ? 'text-[#F87171]' : 'text-[#A1A1AA]'
                      }`}
                    >
                      {globalScanStatus?.lastError || 'None'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleTriggerManualScan}
                    disabled={manualScanBusy}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] disabled:opacity-50 text-[13px] font-medium transition-colors"
                  >
                    <PiPlay className="h-4 w-4 shrink-0" />
                    <span>{manualScanBusy ? 'Scanning...' : 'Trigger Backend Scan'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRunClientProbe}
                    disabled={probeBusy}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] disabled:opacity-50 transition-colors"
                  >
                    <PiLightning className="h-4 w-4 text-[#A1A1AA] shrink-0" />
                    <span>{probeBusy ? 'Probing Charts...' : 'Run Diagnostic Probe'}</span>
                  </button>
                </div>

                {probeResult && (
                  <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[12px] text-[#A1A1AA]">
                      <span className="font-mono tabular-nums">
                        Probe complete ({formatDateTime(probeResult.ranAt)})
                      </span>
                      <span className="text-[#34D399] font-mono tabular-nums font-medium">
                        {probeResult.totalSignals} setups detected
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.05]">
                      {probeResult.items.map((item) => (
                        <div
                          key={`${item.symbol}-${item.timeframe}`}
                          className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[13px]"
                        >
                          <span className="font-medium text-[#FAFAFA]">
                            {item.symbol} {item.timeframe}
                          </span>
                          {item.error ? (
                            <span className="text-[#F87171]">{item.error}</span>
                          ) : (
                            <span className="font-mono tabular-nums text-[12px] sm:text-[13px] text-[#A1A1AA]">
                              {item.candles} bars · {item.signals} signals · {item.latencyMs}ms
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Infrastructure Matrix */}
              <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PiDatabase className="h-5 w-5 text-[#FAFAFA] shrink-0" />
                    <h2 className="text-[15px] font-medium text-[#FAFAFA] truncate">
                      Backend, Redis, MetaApi &amp; TwelveData
                    </h2>
                  </div>
                  <Link
                    to="/admin"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] shrink-0"
                  >
                    <span>Admin</span>
                    <PiArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3.5 text-[14px]">
                    <div className="flex items-center gap-2.5">
                      {isHealthOk ? (
                        <PiWifiHigh className="h-4 w-4 text-[#34D399] shrink-0" />
                      ) : (
                        <PiWifiSlash className="h-4 w-4 text-[#F87171] shrink-0" />
                      )}
                      <span className="text-[#FAFAFA]">Express Engine (/health)</span>
                    </div>
                    <span
                      className={`text-[13px] font-medium pl-6 sm:pl-0 ${
                        isHealthOk ? 'text-[#34D399]' : 'text-[#A1A1AA]'
                      }`}
                    >
                      {healthData ? healthData.status.toUpperCase() : 'Unreachable'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3.5 text-[14px]">
                    <div className="flex items-center gap-2.5">
                      <PiDatabase className="h-4 w-4 text-[#A1A1AA] shrink-0" />
                      <span className="text-[#FAFAFA]">Redis Signal Cache</span>
                    </div>
                    <span
                      className={`text-[13px] font-medium pl-6 sm:pl-0 ${
                        isRedisOk ? 'text-[#34D399]' : 'text-[#F87171]'
                      }`}
                    >
                      {scannerStatus?.redis || (isRedisOk ? 'Connected' : 'Unknown')}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3.5 text-[14px]">
                    <div className="flex items-center gap-2.5">
                      <PiHardDrives className="h-4 w-4 text-[#A1A1AA] shrink-0" />
                      <span className="text-[#FAFAFA]">Exness MT5 / MetaApi</span>
                    </div>
                    <span
                      className={`text-[13px] font-mono tabular-nums pl-6 sm:pl-0 ${
                        mt5Account?.connected ? 'text-[#34D399]' : 'text-[#A1A1AA]'
                      }`}
                    >
                      {mt5Loading
                        ? 'Checking...'
                        : mt5Account?.connected
                          ? `$${(mt5Account.equity ?? mt5Account.balance ?? 0).toFixed(2)} · Auto ${
                              autoTradeEnabled ? 'On' : 'Off'
                            }`
                          : 'Disconnected'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3.5 text-[14px]">
                    <div className="flex items-center gap-2.5">
                      <PiLightning className="h-4 w-4 text-[#A1A1AA] shrink-0" />
                      <span className="text-[#FAFAFA]">TwelveData Key Pool</span>
                    </div>
                    <span className="text-[13px] font-mono tabular-nums text-[#FAFAFA] pl-6 sm:pl-0">
                      {healthData
                        ? `${tdAvailable} / ${tdKeys.length || tdAvailable} available`
                        : '—'}
                    </span>
                  </div>
                </div>

                {tdKeys.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    {tdKeys.map((k, idx) => (
                      <div
                        key={k.id ?? idx}
                        className="p-3 rounded-xl bg-[#161619] text-[12px] font-mono tabular-nums space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#A1A1AA]">Key #{k.index ?? idx + 1}</span>
                          <span className={k.exhausted ? 'text-[#F87171]' : 'text-[#34D399]'}>
                            {k.exhausted ? 'Cool' : 'OK'}
                          </span>
                        </div>
                        <div className="text-[#71717A]">Used: {k.usedToday ?? 0}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Row 2: Adaptive Strategy Optimizer + Core Constants */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
              <section className="lg:col-span-2 rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-[15px] font-medium text-[#FAFAFA]">
                      Adaptive Strategy Optimizer
                    </h2>
                    <p className="text-[13px] text-[#71717A]">
                      Loss-feedback engine dynamically tuning score, confidence, SL buffer, and cooldowns.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={optimizerLoading || !optimizerStatus}
                      onClick={() =>
                        optimizerStatus &&
                        toggleFeedbackEngine(!optimizerStatus.isFeedbackEngineEnabled)
                      }
                      className={`min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl text-[13px] font-medium transition-colors ${
                        optimizerStatus?.isFeedbackEngineEnabled
                          ? 'bg-[#34D399]/10 text-[#34D399]'
                          : 'bg-[#18181B] text-[#A1A1AA]'
                      }`}
                    >
                      {optimizerStatus?.isFeedbackEngineEnabled ? 'Engine On' : 'Engine Off'}
                    </button>
                    <button
                      type="button"
                      disabled={optimizerLoading || !optimizerStatus}
                      onClick={resetToFactory}
                      className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                    >
                      <PiArrowCounterClockwise className="h-4 w-4 shrink-0" />
                      <span>Reset Defaults</span>
                    </button>
                  </div>
                </div>

                {optimizerStatus ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(optimizerStatus.learnedParameters).map(
                        ([groupKey, params]) => {
                          const defGroup = optimizerStatus.factoryDefaults[groupKey] || {}
                          return (
                            <div
                              key={groupKey}
                              className="rounded-xl bg-[#161619] p-4 space-y-2"
                            >
                              <div className="text-[13px] font-medium text-[#FAFAFA]">
                                {strategyDisplayName(groupKey)}
                              </div>
                              <div className="space-y-1 text-[12px] font-mono tabular-nums">
                                {Object.entries(params || {}).map(([paramKey, learnedVal]) => {
                                  const factoryVal = defGroup[paramKey]
                                  const changed =
                                    factoryVal !== undefined && factoryVal !== learnedVal
                                  return (
                                    <div
                                      key={paramKey}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="font-sans text-[#71717A]">{paramKey}</span>
                                      <span
                                        className={changed ? 'text-[#34D399]' : 'text-[#FAFAFA]'}
                                      >
                                        {learnedVal}
                                        {changed ? ` (def ${factoryVal})` : ''}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-[13px] text-[#71717A]">
                        <span>Recent Optimizer Adjustments</span>
                        <span className="font-mono tabular-nums shrink-0">
                          {optimizerStatus.totalLossesAnalyzed} losses analyzed
                        </span>
                      </div>
                      {optimizerStatus.history.length === 0 ? (
                        <div className="px-4 py-3 rounded-xl bg-[#161619] text-[13px] text-[#71717A]">
                          No automated parameter shifts recorded yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.05] rounded-xl bg-[#161619] max-h-56 overflow-y-auto">
                          {optimizerStatus.history.slice(0, 8).map((item, idx) => {
                            const summary =
                              item.changes && item.changes.length > 0
                                ? item.changes
                                    .map((c) => `${c.param}: ${c.from} -> ${c.to} (${c.reason})`)
                                    .join(' · ')
                                : 'Parameter calibration'
                            return (
                              <div
                                key={`${item.timestamp}-${idx}`}
                                className="px-4 py-2.5 text-[13px] flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3"
                              >
                                <div className="min-w-0 sm:truncate break-words">
                                  <span className="font-medium text-[#FAFAFA]">
                                    {item.symbol || strategyDisplayName(item.strategyId)}
                                  </span>{' '}
                                  <span className="text-[#A1A1AA]">{summary}</span>
                                </div>
                                <span className="font-mono tabular-nums text-[12px] text-[#71717A] shrink-0">
                                  {formatRelative(item.timestamp)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-xl bg-[#161619] text-[13px] text-[#71717A]">
                    {optimizerLoading
                      ? 'Loading optimizer status...'
                      : 'Adaptive optimizer service offline.'}
                  </div>
                )}
              </section>

              {/* Engine Constants */}
              <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PiSlidersHorizontal className="h-5 w-5 text-[#FAFAFA] shrink-0" />
                    <h2 className="text-[15px] font-medium text-[#FAFAFA] truncate">Engine Constants</h2>
                  </div>
                  <Link
                    to="/admin/signals"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] shrink-0"
                  >
                    <span>Archive</span>
                    <PiArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="divide-y divide-white/[0.06] text-[13px]">
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">Min Score (P/S/A)</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
                      {ALG_CONFIG.minScore.prime}/{ALG_CONFIG.minScore.standard}/
                      {ALG_CONFIG.minScore.aggressive}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">Min Conf (P/S/A)</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
                      {ALG_CONFIG.minConfidence.prime}%/{ALG_CONFIG.minConfidence.standard}%/
                      {ALG_CONFIG.minConfidence.aggressive}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">SL Buffer (FX)</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
                      {ALG_CONFIG.slBuffer.primeForex}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">Slippage (FX/Crypto)</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
                      {ALG_CONFIG.defaultSlippage.forex} / {ALG_CONFIG.defaultSlippage.crypto}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">Fallback R:R</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
                      {ALG_CONFIG.rrFallback.tp1} / {ALG_CONFIG.rrFallback.tp2}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">OB / Swing Lookback</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
                      {ALG_CONFIG.obLookback} / {ALG_CONFIG.swingLookback}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 py-3">
                    <span className="text-[#71717A]">I2E Min Distance</span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] text-right">0.8R</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
