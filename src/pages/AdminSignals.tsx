import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert,
  Radio,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Filter,
  Download,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Zap,
  Target,
  BarChart2,
  Clock,
  Search,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore'
import { getScannerRejects } from '@/lib/api'
import { useEffect } from 'react'

// ... (Keep all constants, helpers, and sub-components as they are)

const STRATEGY_COLORS: Record<string, string> = {
  'wick-rejection':  '#f59e0b',
  'breakout':        '#6366f1',
  'order-block':     '#10b981',
  'supply-demand':   '#3b82f6',
  'trend-following': '#a855f7',
}

const STRATEGY_LABELS: Record<string, string> = {
  'wick-rejection':  'Wick Rejection',
  'breakout':        'Breakout',
  'order-block':     'Order Block',
  'supply-demand':   'Supply & Demand',
  'trend-following': 'Trend Following',
}

const ALL_TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'] as const

type SortKey = 'time' | 'confidence' | 'rr' | 'symbol' | 'strategy'
type SortDir = 'asc' | 'desc'

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}


function confColor(c: number) {
  if (c >= 75) return 'text-[#86efac]'
  if (c >= 55) return 'text-[#fde68a]'
  return 'text-[#fca5a5]'
}

function exportCSV(signals: StoredSignal[]) {
  const headers = ['Time', 'Symbol', 'Timeframe', 'Strategy', 'Direction', 'Entry', 'SL', 'TP', 'RR', 'Confidence', 'Risk', 'Reasons']
  const rows = signals.map((s) => [
    fmtDate(s.time as unknown as number),
    s.symbol,
    s.timeframe,
    STRATEGY_LABELS[s.strategyId] ?? s.strategyLabel,
    s.direction,
    s.entry,
    s.sl,
    s.tp,
    s.rr.toFixed(2),
    `${s.confidence}%`,
    s.risk,
    s.reason.join(' | '),
  ])
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `traxo-signals-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SortHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold select-none group"
    >
      <span className={active ? 'text-[#e5e7eb]' : 'text-[#475569] group-hover:text-[#94a3b8]'}>{label}</span>
      {active ? (
        dir === 'desc' ? <ChevronDown size={11} className="text-[#6366f1]" /> : <ChevronUp size={11} className="text-[#6366f1]" />
      ) : (
        <ArrowUpDown size={10} className="text-[#334155] group-hover:text-[#475569]" />
      )}
    </button>
  )
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0`} style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-[#475569]">{label}</p>
        <p className="text-xl font-bold text-[#f8fafc] leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-[#64748b] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function AdminSignals() {
  const allSignals = useAnalysisSignalStore((s) => s.signals)

  // Filters
  const [searchSymbol, setSearchSymbol] = useState('')
  const [filterStrategy, setFilterStrategy] = useState('ALL')
  const [filterTimeframe, setFilterTimeframe] = useState('ALL')
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterRisk, setFilterRisk] = useState('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [activeTab, setActiveTab] = useState<'signals' | 'rejects'>('signals')
  const [rejectSymbol, setRejectSymbol] = useState('EURUSD')
  const [rejectTimeframe, setRejectTimeframe] = useState('15m')
  const [rejectsData, setRejectsData] = useState<Record<string, string[]> | null>(null)
  const [isLoadingRejects, setIsLoadingRejects] = useState(false)



  useEffect(() => {
    if (activeTab === 'rejects') {
      setIsLoadingRejects(true)
      getScannerRejects(rejectSymbol, rejectTimeframe)
        .then((res) => setRejectsData(res.rejects))
        .catch(console.error)
        .finally(() => setIsLoadingRejects(false))
    }
  }, [activeTab, rejectSymbol, rejectTimeframe])

  const PAGE_SIZE = 50

  // Derived collections
  const allStrategies = useMemo(() => {
    const s = new Set(allSignals.map((x) => x.strategyId))
    return Array.from(s).sort()
  }, [allSignals])

  const allSymbols = useMemo(() => {
    const s = new Set(allSignals.map((x) => x.symbol))
    return Array.from(s).sort()
  }, [allSignals])

  // Stats (over full dataset)
  const stats = useMemo(() => {
    const buys = allSignals.filter((s) => s.direction === 'BUY').length
    const sells = allSignals.filter((s) => s.direction === 'SELL').length
    const avgConf = allSignals.length > 0
      ? (allSignals.reduce((a, s) => a + s.confidence, 0) / allSignals.length).toFixed(0)
      : '—'
    const avgRR = allSignals.length > 0
      ? (allSignals.reduce((a, s) => a + s.rr, 0) / allSignals.length).toFixed(2)
      : '—'
    return { total: allSignals.length, buys, sells, avgConf, avgRR, symbols: allSymbols.length }
  }, [allSignals, allSymbols])

  // Filtered + sorted
  const filtered = useMemo(() => {
    let list = [...allSignals]
    if (searchSymbol) list = list.filter((s) => s.symbol.toLowerCase().includes(searchSymbol.toLowerCase()))
    if (filterStrategy !== 'ALL') list = list.filter((s) => s.strategyId === filterStrategy)
    if (filterTimeframe !== 'ALL') list = list.filter((s) => s.timeframe === filterTimeframe)
    if (filterDirection !== 'ALL') list = list.filter((s) => s.direction === filterDirection)
    if (filterRisk !== 'ALL') list = list.filter((s) => s.risk === filterRisk)

    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'time')       cmp = (a.time as unknown as number) - (b.time as unknown as number)
      else if (sortKey === 'confidence') cmp = a.confidence - b.confidence
      else if (sortKey === 'rr')    cmp = a.rr - b.rr
      else if (sortKey === 'symbol') cmp = a.symbol.localeCompare(b.symbol)
      else if (sortKey === 'strategy') cmp = a.strategyId.localeCompare(b.strategyId)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return list
  }, [allSignals, searchSymbol, filterStrategy, filterTimeframe, filterDirection, filterRisk, sortKey, sortDir])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(k); setSortDir('desc') }
    setPage(0)
  }

  function resetFilters() {
    setSearchSymbol('')
    setFilterStrategy('ALL')
    setFilterTimeframe('ALL')
    setFilterDirection('ALL')
    setFilterRisk('ALL')
    setPage(0)
  }

  const hasActiveFilters =
    searchSymbol || filterStrategy !== 'ALL' || filterTimeframe !== 'ALL' ||
    filterDirection !== 'ALL' || filterRisk !== 'ALL'

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      {/* Header */}
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link to="/admin" className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0">
            <ArrowLeft size={15} className="text-[#94a3b8]" />
          </Link>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <ShieldAlert size={14} className="text-[#fca5a5] shrink-0" />
          <Radio size={14} className="text-[#6366f1] shrink-0" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Admin View</h1>

          {/* Tab switcher */}
          <div className="flex items-center bg-[#0b0f17] rounded-lg border border-white/[0.08] p-0.5 ml-2">
            <button
              onClick={() => setActiveTab('signals')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                activeTab === 'signals' ? 'bg-[#6366f1] text-white' : 'text-[#64748b] hover:text-[#94a3b8]'
              }`}
            >
              Signals {allSignals.length > 0 && `(${allSignals.length})`}
            </button>
            <button
              onClick={() => setActiveTab('rejects')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                activeTab === 'rejects' ? 'bg-[#f59e0b] text-black' : 'text-[#64748b] hover:text-[#94a3b8]'
              }`}
            >
              Scan Rejects
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(filtered)}
            disabled={filtered.length === 0}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] font-medium text-[#94a3b8] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            Export CSV
          </button>
          <DesktopWorkspaceNav />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5">

        {/* ─── Scan Rejects Tab ─── */}
        {activeTab === 'rejects' && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#64748b] uppercase tracking-wider">Symbol</label>
                <input
                  value={rejectSymbol}
                  onChange={(e) => setRejectSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. EURUSD"
                  className="h-8 px-3 rounded-lg bg-[#0b0f17] border border-white/[0.08] text-[12px] font-semibold text-white focus:outline-none focus:border-[#f59e0b]/50 w-32"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#64748b] uppercase tracking-wider">Timeframe</label>
                <select
                  value={rejectTimeframe}
                  onChange={(e) => setRejectTimeframe(e.target.value)}
                  className="h-8 px-3 rounded-lg bg-[#0b0f17] border border-white/[0.08] text-[12px] font-semibold text-white focus:outline-none focus:border-[#f59e0b]/50"
                >
                  {['1m','5m','15m','1H','4H','1D'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </div>
              <button
                onClick={() => {
                  setIsLoadingRejects(true)
                  getScannerRejects(rejectSymbol, rejectTimeframe)
                    .then((res) => setRejectsData(res.rejects))
                    .catch(console.error)
                    .finally(() => setIsLoadingRejects(false))
                }}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[11px] font-semibold text-[#fcd34d] hover:bg-[#f59e0b]/20 transition-all"
              >
                <RefreshCw size={11} className={isLoadingRejects ? 'animate-spin' : ''} />
                Refresh
              </button>
              <p className="text-[11px] text-[#475569]">
                Showing why each strategy rejected a signal for <span className="text-[#e5e7eb] font-semibold">{rejectSymbol}</span> on <span className="text-[#e5e7eb] font-semibold">{rejectTimeframe}</span>
              </p>
            </div>

            {/* Results */}
            {isLoadingRejects ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={20} className="animate-spin text-[#f59e0b]" />
              </div>
            ) : !rejectsData ? (
              <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-8 text-center">
                <AlertCircle size={28} className="text-[#475569] mx-auto mb-2" />
                <p className="text-[#64748b] text-sm">No scan data found.</p>
                <p className="text-[#475569] text-[12px] mt-1">The scanner may not have run yet, or this symbol/timeframe hasn't been scanned.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Object.entries(rejectsData).map(([strategyId, reasons]) => {
                  const label = {
                    breakout: 'Breakout',
                    order_block: 'Order Block',
                    supply_demand: 'Supply & Demand',
                    trend_following: 'Trend Following',
                    wick_rejection: 'Wick Rejection',
                  }[strategyId] ?? strategyId
                  const color = {
                    breakout: '#6366f1',
                    order_block: '#10b981',
                    supply_demand: '#3b82f6',
                    trend_following: '#a855f7',
                    wick_rejection: '#f59e0b',
                  }[strategyId] ?? '#94a3b8'
                  return (
                    <div key={strategyId} className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[13px] font-bold text-[#e5e7eb]">{label}</span>
                        <span className="ml-auto px-1.5 py-0.5 rounded-md bg-[#ef4444]/10 border border-[#ef4444]/20 text-[9px] font-bold text-[#fca5a5] uppercase">REJECTED</span>
                      </div>
                      <div className="space-y-1.5">
                        {(Array.isArray(reasons) ? reasons : [reasons]).map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] text-[#94a3b8] leading-relaxed">
                            <X size={11} className="text-[#ef4444] mt-0.5 shrink-0" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {Object.keys(rejectsData).length === 0 && (
                  <div className="col-span-full rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/5 p-8 text-center">
                    <CheckCircle2 size={28} className="text-[#86efac] mx-auto mb-2" />
                    <p className="text-[#86efac] text-sm font-semibold">All strategies fired a signal!</p>
                    <p className="text-[#4ade80] text-[12px] mt-1">No rejections were recorded for this combination.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Signals Tab ─── */}
        {activeTab === 'signals' && (
          <div className="space-y-5">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Signals" value={stats.total.toLocaleString()} icon={Zap} color="#6366f1" />
          <StatCard label="BUY Signals" value={stats.buys} sub={stats.total > 0 ? `${((stats.buys / stats.total) * 100).toFixed(0)}% of total` : undefined} icon={TrendingUp} color="#86efac" />
          <StatCard label="SELL Signals" value={stats.sells} sub={stats.total > 0 ? `${((stats.sells / stats.total) * 100).toFixed(0)}% of total` : undefined} icon={TrendingDown} color="#fca5a5" />
          <StatCard label="Avg Confidence" value={stats.avgConf === '—' ? '—' : `${stats.avgConf}%`} icon={Target} color="#f59e0b" />
          <StatCard label="Avg R:R" value={stats.avgRR} icon={BarChart2} color="#a855f7" />
          <StatCard label="Symbols Seen" value={stats.symbols} sub={`${allStrategies.length} strategies`} icon={Clock} color="#3b82f6" />
        </div>

        {/* Filters row */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={13} className="text-[#6366f1]" />
            <span className="text-[12px] font-semibold text-[#94a3b8]">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="ml-auto flex items-center gap-1 text-[11px] text-[#94a3b8] hover:text-white px-2 py-0.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.05] transition-all"
              >
                <X size={10} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Symbol search */}
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input
                value={searchSymbol}
                onChange={(e) => { setSearchSymbol(e.target.value); setPage(0) }}
                placeholder="Symbol…"
                className="w-full pl-7 pr-3 py-2 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[12px] text-[#e5e7eb] placeholder-[#334155] focus:outline-none focus:border-[#6366f1]/50 transition-colors"
              />
            </div>

            {/* Strategy */}
            <select
              value={filterStrategy}
              onChange={(e) => { setFilterStrategy(e.target.value); setPage(0) }}
              className="px-3 py-2 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[12px] text-[#e5e7eb] focus:outline-none focus:border-[#6366f1]/50"
            >
              <option value="ALL">All Strategies</option>
              {allStrategies.map((s) => (
                <option key={s} value={s}>{STRATEGY_LABELS[s] ?? s}</option>
              ))}
            </select>

            {/* Timeframe */}
            <select
              value={filterTimeframe}
              onChange={(e) => { setFilterTimeframe(e.target.value); setPage(0) }}
              className="px-3 py-2 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[12px] text-[#e5e7eb] focus:outline-none focus:border-[#6366f1]/50"
            >
              <option value="ALL">All Timeframes</option>
              {ALL_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>

            {/* Direction */}
            <div className="flex rounded-lg border border-white/[0.08] bg-[#0b0f17] overflow-hidden">
              {(['ALL', 'BUY', 'SELL'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => { setFilterDirection(d); setPage(0) }}
                  className={`flex-1 py-2 text-[11px] font-semibold transition-all ${
                    filterDirection === d
                      ? d === 'BUY' ? 'bg-[#86efac]/15 text-[#86efac]'
                        : d === 'SELL' ? 'bg-[#fca5a5]/15 text-[#fca5a5]'
                        : 'bg-[#6366f1]/15 text-[#818cf8]'
                      : 'text-[#475569] hover:text-[#94a3b8]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Risk */}
            <select
              value={filterRisk}
              onChange={(e) => { setFilterRisk(e.target.value); setPage(0) }}
              className="px-3 py-2 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[12px] text-[#e5e7eb] focus:outline-none focus:border-[#6366f1]/50"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="Low">Low Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="High">High Risk</option>
            </select>

            {/* Results count */}
            <div className="flex items-center justify-center px-3 py-2 rounded-lg border border-white/[0.05] bg-[#0b0f17]">
              <span className="text-[12px] text-[#475569]">
                <span className="text-[#94a3b8] font-semibold">{filtered.length.toLocaleString()}</span> result{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Signal table */}
        {allSignals.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-16 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
              <Radio size={24} className="text-[#6366f1] animate-pulse" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[#94a3b8]">No signals yet</p>
              <p className="text-[12px] text-[#475569] mt-1">
                Signals are generated automatically as the system scans markets. <br />
                Navigate to the dashboard or strategy pages to trigger scanning.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="mt-2 px-4 py-2 rounded-xl bg-[#6366f1]/15 border border-[#6366f1]/25 text-[12px] font-semibold text-[#818cf8] hover:bg-[#6366f1]/25 transition-colors"
            >
              Open Dashboard
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-12 flex flex-col items-center gap-3 text-center">
            <Search size={20} className="text-[#334155]" />
            <p className="text-[13px] text-[#64748b]">No signals match your filters</p>
            <button onClick={resetFilters} className="text-[12px] text-[#6366f1] hover:underline">Reset filters</button>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_80px_60px_90px_80px_80px_80px_80px_80px] gap-x-3 px-4 py-3 border-b border-white/[0.05] bg-[#0b0f17]">
                <SortHeader label="Symbol / Strategy" sortKey="symbol" current={sortKey} dir={sortDir} onSort={handleSort} />
                <span className="text-[11px] uppercase tracking-wider text-[#475569] font-semibold">TF</span>
                <SortHeader label="Dir" sortKey="strategy" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Entry" sortKey="time" current={sortKey} dir={sortDir} onSort={handleSort} />
                <span className="text-[11px] uppercase tracking-wider text-[#475569] font-semibold">SL</span>
                <span className="text-[11px] uppercase tracking-wider text-[#475569] font-semibold">TP</span>
                <SortHeader label="R:R" sortKey="rr" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Conf" sortKey="confidence" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Time" sortKey="time" current={sortKey} dir={sortDir} onSort={handleSort} />
              </div>

              {/* Rows */}
              <div className="divide-y divide-white/[0.03]">
                {pageSlice.map((sig) => {
                  const entry = Number(sig.entry) || 0
                  const sl = Number(sig.sl) || 0
                  const tp = Number(sig.tp) || 0
                  const rr = Number(sig.rr) || 0
                  const color = STRATEGY_COLORS[sig.strategyId] ?? '#6366f1'
                  const isBuy = sig.direction === 'BUY'
                  const digits = entry >= 1000 ? 1 : entry >= 10 ? 2 : entry >= 1 ? 4 : 5
                  return (
                    <div
                      key={sig.id}
                      className="grid grid-cols-[1fr_80px_60px_90px_80px_80px_80px_80px_80px] gap-x-3 px-4 py-3 hover:bg-white/[0.015] transition-colors group"
                      style={{ borderLeft: `2px solid ${color}30` }}
                    >
                      {/* Symbol + strategy */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-[#f1f5f9]">{sig.symbol}</span>
                          <span
                            className="hidden sm:inline text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider border"
                            style={{ color, borderColor: `${color}30`, background: `${color}12` }}
                          >
                            {STRATEGY_LABELS[sig.strategyId]?.split(' ')[0] ?? sig.strategyId}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#475569] mt-0.5 truncate">{(sig.reason?.[0]) ?? ''}</p>
                      </div>

                      {/* Timeframe */}
                      <span className="text-[12px] text-[#64748b] self-center">{sig.timeframe}</span>

                      {/* Direction */}
                      <div className="self-center">
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-[#86efac]/10 text-[#86efac]' : 'bg-[#fca5a5]/10 text-[#fca5a5]'}`}>
                          {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {sig.direction}
                        </span>
                      </div>

                      {/* Entry */}
                      <span className="text-[12px] font-mono text-[#e5e7eb] self-center">
                        {entry.toFixed(digits)}
                      </span>

                      {/* SL */}
                      <span className="text-[12px] font-mono text-[#fca5a5] self-center">
                        {sl.toFixed(digits)}
                      </span>

                      {/* TP */}
                      <span className="text-[12px] font-mono text-[#86efac] self-center">
                        {tp.toFixed(digits)}
                      </span>

                      {/* RR */}
                      <span className="text-[12px] font-semibold text-[#fde68a] self-center">
                        {rr.toFixed(2)}R
                      </span>

                      {/* Confidence */}
                      <div className="self-center">
                        <span className={`text-[12px] font-bold ${confColor(sig.confidence)}`}>
                          {sig.confidence}%
                        </span>
                        <div className="w-full h-1 rounded-full bg-white/[0.05] mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${sig.confidence}%`,
                              background: sig.confidence >= 75 ? '#86efac' : sig.confidence >= 55 ? '#fde68a' : '#fca5a5',
                            }}
                          />
                        </div>
                      </div>

                      {/* Time */}
                      <div className="self-center text-right">
                        <p className="text-[11px] text-[#64748b]">{timeAgo(sig.time as unknown as number)}</p>
                        <p className="text-[9px] text-[#334155] mt-0.5">{fmtDate(sig.time as unknown as number)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] text-[#475569]">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#0d1117] text-[11px] text-[#94a3b8] hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    const p = totalPages <= 7 ? i : page < 4 ? i : page > totalPages - 4 ? totalPages - 7 + i : page - 3 + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-[11px] font-semibold transition-all ${
                          p === page
                            ? 'bg-[#6366f1] text-white'
                            : 'border border-white/[0.08] bg-[#0d1117] text-[#64748b] hover:bg-white/[0.05]'
                        }`}
                      >
                        {p + 1}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#0d1117] text-[11px] text-[#94a3b8] hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Mobile export */}
            <div className="sm:hidden">
              <button
                onClick={() => exportCSV(filtered)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-[#0d1117] text-[12px] font-semibold text-[#94a3b8] hover:text-white hover:bg-white/[0.03] transition-all"
              >
                <Download size={14} />
                Export {filtered.length} Signals as CSV
              </button>
            </div>
          </>
        )}
          </div>
        )}
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
