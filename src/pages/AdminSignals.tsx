import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PiArrowsClockwise,
  PiArrowsDownUp,
  PiArrowUpRight,
  PiDownloadSimple,
  PiMagnifyingGlass,
  PiGauge,
  PiShieldCheck,
} from 'react-icons/pi'
import { getHistoricalSignals, getLiveSignals, getScannerRejects } from '@/lib/api'
import { auth } from '@/lib/firebase'
import { normalizeStrategyId } from '@/lib/strategyId'
import { ONBOARDING_STRATEGIES } from '@/stores/useOnboardingStore'

interface AdminSignalRow {
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
  timestampMs: number
}

interface AdminRejectRow {
  id: string
  symbol: string
  timeframe: string
  strategy: string
  reason: string
  confidence: string | null
  spread: string | null
  timestampMs: number | null
}

type AdminTab = 'signals' | 'rejects'
type SortKey = 'timestampMs' | 'symbol' | 'confidence' | 'rr' | 'status'

const REJECT_SWEEP_PAIRS = [
  { symbol: 'EURUSD', timeframe: '1H' },
  { symbol: 'EURUSD', timeframe: '15m' },
  { symbol: 'GBPUSD', timeframe: '1H' },
  { symbol: 'USDJPY', timeframe: '1H' },
  { symbol: 'XAUUSD', timeframe: '15m' },
  { symbol: 'XAUUSD', timeframe: '1H' },
  { symbol: 'BTCUSD', timeframe: '1H' },
  { symbol: 'AAPL', timeframe: '1H' },
]

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '')

function formatPrice(val: number): string {
  if (!Number.isFinite(val)) return '—'
  if (val >= 100) return val.toFixed(2)
  if (val >= 10) return val.toFixed(3)
  return val.toFixed(5)
}

function normalizeTs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 1e12 ? raw : raw * 1000
  if (typeof raw === 'string') {
    const num = Number(raw)
    if (Number.isFinite(num) && raw.trim() !== '') return num > 1e12 ? num : num * 1000
    const parsed = Date.parse(raw)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { seconds?: number; _seconds?: number }
    const sec = obj.seconds ?? obj._seconds
    if (typeof sec === 'number') return sec * 1000
  }
  return Date.now()
}

function normalizeStatus(raw: unknown): 'WIN' | 'LOSS' | 'EXPIRED' | 'LIVE' {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'win' || s === 'tp_hit' || s === 'tp') return 'WIN'
  if (s === 'loss' || s === 'sl_hit' || s === 'sl') return 'LOSS'
  if (s === 'expired' || s === 'stale' || s === 'closed') return 'EXPIRED'
  return 'LIVE'
}

function compactSym(s: string): string {
  return s.replace('/', '').trim().toUpperCase()
}

function strategyName(id: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback
  const norm = normalizeStrategyId(id)
  const found = ONBOARDING_STRATEGIES.find((st) => normalizeStrategyId(st.id) === norm)
  return found ? found.name : id
}

function parseRejects(payload: unknown, fallbackSym = '', fallbackTf = ''): AdminRejectRow[] {
  const out: AdminRejectRow[] = []
  if (!payload || typeof payload !== 'object') return out

  const pushOne = (sym: string, tf: string, strat: string, val: unknown, idx: number) => {
    const reason =
      typeof val === 'string'
        ? val
        : val && typeof val === 'object'
          ? String(
              (val as Record<string, unknown>).reason ??
                (val as Record<string, unknown>).message ??
                JSON.stringify(val)
            )
          : String(val ?? '')
    if (!reason.trim()) return
    const meta = val && typeof val === 'object' ? (val as Record<string, unknown>) : {}
    const confMatch = reason.match(/conf(?:idence)?\s*[:=]?\s*(\d+(?:\.\d+)?%?)/i)
    const spreadMatch = reason.match(/spread\s*[:=]?\s*(\d+(?:\.\d+)?(?:\s*(?:pips?|bps))?)/i)
    out.push({
      id: `${sym}-${tf}-${strat}-${idx}-${reason.slice(0, 20)}`,
      symbol: compactSym(String(meta.symbol || sym || 'UNKNOWN')),
      timeframe: String(meta.timeframe || tf || '—'),
      strategy: String(meta.strategy || meta.strategyId || strat || 'scanner'),
      reason: reason.trim(),
      confidence:
        meta.confidence !== undefined ? String(meta.confidence) : confMatch?.[1] ?? null,
      spread: meta.spread !== undefined ? String(meta.spread) : spreadMatch?.[1] ?? null,
      timestampMs: meta.timestamp ? normalizeTs(meta.timestamp) : null,
    })
  }

  const root = payload as Record<string, unknown>
  const target = root.rejects ?? root.items ?? root.entries ?? root
  const defSym = String(root.symbol || fallbackSym)
  const defTf = String(root.timeframe || fallbackTf)

  if (Array.isArray(target)) {
    target.forEach((item, idx) => {
      if (item && typeof item === 'object' && 'rejects' in item) {
        out.push(
          ...parseRejects(
            (item as Record<string, unknown>).rejects,
            String((item as Record<string, unknown>).symbol || defSym),
            String((item as Record<string, unknown>).timeframe || defTf)
          )
        )
      } else {
        pushOne(defSym, defTf, 'scanner', item, idx)
      }
    })
  } else if (target && typeof target === 'object') {
    Object.entries(target as Record<string, unknown>).forEach(([k, v]) => {
      let sym = defSym
      let tf = defTf
      let strat = k
      const parts = k.replace(/^scan_rejects:/i, '').split(':')
      if (parts.length >= 2 && /^(1m|5m|15m|1h|4h|1d)$/i.test(parts[1])) {
        sym = parts[0] || sym
        tf = parts[1] || tf
        strat = parts.slice(2).join(':') || 'scanner'
      }
      if (Array.isArray(v)) {
        v.forEach((entry, idx) => pushOne(sym, tf, strat, entry, idx))
      } else if (typeof v === 'string' || (v && typeof v === 'object')) {
        if (v && typeof v === 'object' && !('reason' in v) && !('message' in v)) {
          out.push(...parseRejects(v, sym, tf))
        } else {
          pushOne(sym, tf, strat, v, 0)
        }
      }
    })
  }

  return out
}

export default function AdminSignals() {
  const [tab, setTab] = useState<AdminTab>('signals')
  const [signals, setSignals] = useState<AdminSignalRow[]>([])
  const [rejects, setRejects] = useState<AdminRejectRow[]>([])
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [directionFilter, setDirectionFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('timestampMs')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null)
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

      const [liveRes, histRes] = await Promise.allSettled([
        getLiveSignals(),
        getHistoricalSignals(),
      ])

      const byId = new Map<string, AdminSignalRow>()
      const ingest = (rawList: Record<string, unknown>[], fallbackStatus: 'LIVE' | 'EXPIRED') => {
        for (const s of rawList) {
          const id = String(s.id || `${s.symbol}-${s.timeframe}-${s.strategyId}-${s.time}`)
          const entry = Number(s.entry ?? 0)
          const sl = Number(s.sl ?? 0)
          const tp = Number(s.tp ?? 0)
          const risk = Math.abs(entry - sl)
          const reward = Math.abs(tp - entry)
          const rr = Number(s.rr ?? (risk > 0 ? Number((reward / risk).toFixed(2)) : 0))
          const strategyId = String(s.strategyId || s.strategy || 'scanner')
          byId.set(id, {
            id,
            symbol: compactSym(String(s.symbol || 'UNKNOWN')),
            timeframe: String(s.timeframe || '1H'),
            strategyId,
            strategyLabel: strategyName(
              strategyId,
              typeof s.strategyLabel === 'string' ? s.strategyLabel : undefined
            ),
            direction: String(s.direction || s.action || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
            entry,
            sl,
            tp,
            rr,
            confidence: Number(s.confidence ?? 0),
            status: s.status ? normalizeStatus(s.status) : fallbackStatus,
            timestampMs: normalizeTs(s.time ?? s.createdAt),
          })
        }
      }

      if (histRes.status === 'fulfilled' && Array.isArray(histRes.value?.signals)) {
        ingest(histRes.value.signals as Record<string, unknown>[], 'EXPIRED')
      }
      if (liveRes.status === 'fulfilled' && Array.isArray(liveRes.value)) {
        ingest(liveRes.value as Record<string, unknown>[], 'LIVE')
      }
      setSignals(Array.from(byId.values()))

      const collectedRejects: AdminRejectRow[] = []
      const seen = new Set<string>()
      const addRejects = (list: AdminRejectRow[]) => {
        for (const item of list) {
          const k = `${item.symbol}|${item.timeframe}|${item.strategy}|${item.reason}`
          if (!seen.has(k)) {
            seen.add(k)
            collectedRejects.push(item)
          }
        }
      }

      let globalOk = false
      try {
        const res = await fetch(
          API_BASE ? `${API_BASE}/api/scanner/rejects` : '/api/scanner/rejects',
          { headers }
        )
        if (res.ok) {
          const body = await res.json()
          const parsed = parseRejects(body)
          addRejects(parsed)
          if (parsed.length > 0 || Array.isArray(body?.rejects)) globalOk = true
        }
      } catch {
        // Fallback below
      }

      if (!globalOk) {
        const sweep = await Promise.allSettled(
          REJECT_SWEEP_PAIRS.map(async ({ symbol, timeframe }) => {
            const res = await getScannerRejects(symbol, timeframe).catch(() => null)
            if (res?.rejects) return parseRejects(res, symbol, timeframe)
            if (symbol.length === 6) {
              const slashed = `${symbol.slice(0, 3)}/${symbol.slice(3)}`
              const alt = await getScannerRejects(slashed, timeframe).catch(() => null)
              if (alt?.rejects) return parseRejects(alt, symbol, timeframe)
            }
            return []
          })
        )
        for (const r of sweep) {
          if (r.status === 'fulfilled') addRejects(r.value)
        }
      }

      setRejects(collectedRejects)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) void loadData()
    })
    return () => {
      cancelled = true
    }
  }, [loadData])

  const filteredSignals = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = signals.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (directionFilter !== 'ALL' && s.direction !== directionFilter) return false
      if (q) {
        const hay = `${s.symbol} ${s.strategyLabel} ${s.timeframe} ${s.id}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    list.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
    return list
  }, [signals, search, statusFilter, directionFilter, sortKey, sortAsc])

  const filteredRejects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rejects
    return rejects.filter((r) =>
      `${r.symbol} ${r.timeframe} ${r.strategy} ${r.reason}`.toLowerCase().includes(q)
    )
  }, [rejects, search])

  const totalPages = Math.max(1, Math.ceil(filteredSignals.length / PAGE_SIZE))
  const paginatedSignals = useMemo(() => {
    const clamped = Math.min(page, totalPages)
    return filteredSignals.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)
  }, [filteredSignals, page, totalPages])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const exportCsv = () => {
    const header = [
      'ID',
      'Time',
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
    ]
    const rows = filteredSignals.map((s) => [
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
    ])
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `admin-signals-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-[#71717A]">Admin Archive</p>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
              Signal &amp; Rejection Archive
            </h1>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
              Raw scanner output ledger and guardrail rejection inspection log.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="col-span-2 sm:col-span-1 sm:order-3 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] disabled:opacity-50 text-[13px] font-medium transition-colors"
            >
              <PiArrowsClockwise className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              to="/notifications"
              className="sm:order-1 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
            >
              <span className="truncate">Signals &amp; Ops</span>
              <PiArrowUpRight className="h-4 w-4 text-[#A1A1AA] shrink-0" />
            </Link>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredSignals.length === 0}
              className="sm:order-2 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] disabled:opacity-40 text-[13px] font-medium text-[#FAFAFA] transition-colors"
            >
              <PiDownloadSimple className="h-4 w-4 text-[#A1A1AA] shrink-0" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Sleek Rounded-Full Tab Switcher */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center overflow-x-auto pb-1">
          <div className="inline-flex items-center gap-1 rounded-full bg-[#111113] border border-white/[0.07] p-1 sm:p-1.5">
            <button
              type="button"
              onClick={() => setTab('signals')}
              className={`min-h-[44px] sm:min-h-0 inline-flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                tab === 'signals'
                  ? 'bg-[#FAFAFA] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
              }`}
            >
              <PiGauge className="h-4 w-4" />
              <span>Signals Table</span>
              <span
                className={`text-[12px] font-mono tabular-nums ${
                  tab === 'signals' ? 'text-[#52525B]' : 'text-[#71717A]'
                }`}
              >
                {signals.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('rejects')}
              className={`min-h-[44px] sm:min-h-0 inline-flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                tab === 'rejects'
                  ? 'bg-[#FAFAFA] text-[#09090B]'
                  : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
              }`}
            >
              <PiShieldCheck className="h-4 w-4" />
              <span>Scan Rejects</span>
              <span
                className={`text-[12px] font-mono tabular-nums ${
                  tab === 'rejects' ? 'text-[#52525B]' : 'text-[#71717A]'
                }`}
              >
                {rejects.length}
              </span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <PiMagnifyingGlass className="h-4 w-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder={
                tab === 'signals'
                  ? 'Search symbol, strategy, ID...'
                  : 'Search rejection reason, symbol, strategy...'
              }
              className="w-full min-h-[44px] sm:min-h-0 pl-9 pr-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[13px] text-[#FAFAFA] placeholder:text-[#71717A]"
            />
          </div>

          {tab === 'signals' && (
            <div className="grid grid-cols-2 sm:flex items-center gap-2.5">
              <select
                value={directionFilter}
                onChange={(e) => {
                  setDirectionFilter(e.target.value)
                  setPage(1)
                }}
                aria-label="Direction filter"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA]"
              >
                <option value="ALL">All sides</option>
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
                aria-label="Status filter"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA]"
              >
                <option value="ALL">All status</option>
                <option value="LIVE">Live</option>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
                <option value="EXPIRED">Expired</option>
              </select>

              <div className="col-span-2 md:hidden flex items-center gap-2">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort signals by"
                  className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA]"
                >
                  <option value="timestampMs">Sort: Time</option>
                  <option value="symbol">Sort: Symbol</option>
                  <option value="rr">Sort: R:R</option>
                  <option value="confidence">Sort: Confidence</option>
                  <option value="status">Sort: Status</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortAsc((p) => !p)}
                  aria-label="Toggle sort order"
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 shrink-0"
                >
                  <PiArrowsDownUp className="h-4 w-4 text-[#A1A1AA]" />
                  <span>{sortAsc ? 'Asc' : 'Desc'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table Container */}
        {tab === 'signals' ? (
          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
            {filteredSignals.length === 0 ? (
              <div className="p-8 sm:p-12 text-center space-y-3">
                <img
                  src="/brand/empty-signals.png"
                  alt="No archived signals"
                  className="w-full max-w-[260px] mx-auto rounded-xl object-cover opacity-90"
                />
                <p className="text-[14px] text-[#A1A1AA]">
                  {loading ? 'Loading signals...' : 'No signals matched current query.'}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Stacked Card Rows (< 768px) */}
                <div className="md:hidden divide-y divide-white/[0.06]">
                  {paginatedSignals.map((s) => (
                    <div key={s.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-[15px] font-semibold text-[#FAFAFA]">
                            {s.symbol}
                          </span>
                          <span className="text-[12px] font-mono text-[#71717A]">
                            {s.timeframe}
                          </span>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              s.direction === 'BUY'
                                ? 'bg-[#34D399]/10 text-[#34D399]'
                                : 'bg-[#F87171]/10 text-[#F87171]'
                            }`}
                          >
                            {s.direction}
                          </span>
                        </div>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${
                            s.status === 'WIN'
                              ? 'bg-[#34D399]/10 text-[#34D399]'
                              : s.status === 'LOSS'
                                ? 'bg-[#F87171]/10 text-[#F87171]'
                                : s.status === 'LIVE'
                                  ? 'bg-[#18181B] text-[#FAFAFA]'
                                  : 'bg-[#161619] text-[#71717A]'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[12px] text-[#A1A1AA]">
                        <span className="truncate">{s.strategyLabel}</span>
                        <span className="font-mono tabular-nums text-[#71717A] shrink-0">
                          {new Date(s.timestampMs).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#161619] p-2.5 text-[12px]">
                        <div>
                          <div className="text-[10.5px] text-[#71717A]">Entry</div>
                          <div className="font-mono tabular-nums text-[#FAFAFA] mt-0.5">
                            {formatPrice(s.entry)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10.5px] text-[#71717A]">Stop Loss</div>
                          <div className="font-mono tabular-nums text-[#F87171] mt-0.5">
                            {formatPrice(s.sl)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10.5px] text-[#71717A]">Take Profit</div>
                          <div className="font-mono tabular-nums text-[#34D399] mt-0.5">
                            {formatPrice(s.tp)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                        <span>R:R {s.rr.toFixed(2)}R</span>
                        <span className="text-[#FAFAFA]">Conf {s.confidence}%</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>= 768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[12px] font-medium text-[#71717A]">
                        <th className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSort('timestampMs')}
                            className="inline-flex items-center gap-1 hover:text-[#FAFAFA]"
                          >
                            <span>Time</span>
                            <PiArrowsDownUp className="h-3.5 w-3.5" />
                          </button>
                        </th>
                        <th className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSort('symbol')}
                            className="inline-flex items-center gap-1 hover:text-[#FAFAFA]"
                          >
                            <span>Symbol</span>
                            <PiArrowsDownUp className="h-3.5 w-3.5" />
                          </button>
                        </th>
                        <th className="py-3.5 px-4">Strategy</th>
                        <th className="py-3.5 px-4">Side</th>
                        <th className="py-3.5 px-4 text-right">Entry</th>
                        <th className="py-3.5 px-4 text-right">SL</th>
                        <th className="py-3.5 px-4 text-right">TP</th>
                        <th className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('rr')}
                            className="inline-flex items-center gap-1 hover:text-[#FAFAFA]"
                          >
                            <span>R:R</span>
                            <PiArrowsDownUp className="h-3.5 w-3.5" />
                          </button>
                        </th>
                        <th className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('confidence')}
                            className="inline-flex items-center gap-1 hover:text-[#FAFAFA]"
                          >
                            <span>Conf</span>
                            <PiArrowsDownUp className="h-3.5 w-3.5" />
                          </button>
                        </th>
                        <th className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSort('status')}
                            className="inline-flex items-center gap-1 hover:text-[#FAFAFA]"
                          >
                            <span>Status</span>
                            <PiArrowsDownUp className="h-3.5 w-3.5" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] text-[13.5px]">
                      {paginatedSignals.map((s) => (
                        <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-4 font-mono tabular-nums text-[#71717A] whitespace-nowrap">
                            {new Date(s.timestampMs).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-medium text-[#FAFAFA]">{s.symbol}</span>{' '}
                            <span className="text-[12px] text-[#71717A]">{s.timeframe}</span>
                          </td>
                          <td className="py-3.5 px-4 text-[#A1A1AA]">{s.strategyLabel}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
                                s.direction === 'BUY'
                                  ? 'bg-[#34D399]/10 text-[#34D399]'
                                  : 'bg-[#F87171]/10 text-[#F87171]'
                              }`}
                            >
                              {s.direction}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#FAFAFA]">
                            {formatPrice(s.entry)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#F87171]">
                            {formatPrice(s.sl)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#34D399]">
                            {formatPrice(s.tp)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#A1A1AA]">
                            {s.rr.toFixed(2)}R
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#FAFAFA]">
                            {s.confidence}%
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
                                s.status === 'WIN'
                                  ? 'bg-[#34D399]/10 text-[#34D399]'
                                  : s.status === 'LOSS'
                                    ? 'bg-[#F87171]/10 text-[#F87171]'
                                    : s.status === 'LIVE'
                                      ? 'bg-[#18181B] text-[#FAFAFA]'
                                      : 'bg-[#161619] text-[#71717A]'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {filteredSignals.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-white/[0.06] text-[13px] text-[#A1A1AA]">
                <span className="font-mono tabular-nums text-center sm:text-left">
                  Page {page} / {totalPages} ({filteredSignals.length} records)
                </span>
                <div className="grid grid-cols-2 sm:flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] disabled:opacity-40 text-[12px] font-medium text-[#FAFAFA]"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] disabled:opacity-40 text-[12px] font-medium text-[#FAFAFA]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
            {filteredRejects.length === 0 ? (
              <div className="p-8 sm:p-12 text-center space-y-3">
                <img
                  src="/brand/empty-signals.png"
                  alt="No scan rejections"
                  className="w-full max-w-[260px] mx-auto rounded-xl object-cover opacity-90"
                />
                <p className="text-[14px] text-[#A1A1AA]">
                  {loading ? 'Loading scan rejections...' : 'No scanner rejections currently buffered.'}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Stacked Rejection Cards (< 768px) */}
                <div className="md:hidden divide-y divide-white/[0.06]">
                  {filteredRejects.map((r) => (
                    <div key={r.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[14.5px] font-semibold text-[#FAFAFA]">
                            {r.symbol}
                          </span>
                          <span className="text-[12px] font-mono text-[#71717A]">
                            {r.timeframe}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-[#161619] text-[11.5px] text-[#A1A1AA] truncate max-w-[170px]">
                          {strategyName(r.strategy)}
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
                        <th className="py-3.5 px-4">Symbol</th>
                        <th className="py-3.5 px-4">Strategy</th>
                        <th className="py-3.5 px-4">Rejection Reason</th>
                        <th className="py-3.5 px-4 text-right">Conf</th>
                        <th className="py-3.5 px-4 text-right">Spread</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] text-[13.5px]">
                      {filteredRejects.map((r) => (
                        <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-medium text-[#FAFAFA]">{r.symbol}</span>{' '}
                            <span className="text-[12px] text-[#71717A]">{r.timeframe}</span>
                          </td>
                          <td className="py-3.5 px-4 text-[#A1A1AA]">{strategyName(r.strategy)}</td>
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
        )}
      </div>
    </div>
  )
}
