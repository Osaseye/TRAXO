import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Filter,
  Search,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useNotificationStore, type StoredNotification } from '@/stores/useNotificationStore'
import { getHistoricalSignals, getLiveSignals } from '@/lib/api'
import { cn } from '@/lib/utils'

const STRATEGY_LABELS: Record<string, string> = {
  'wick-rejection': 'Wick Rejection',
  breakout: 'Breakout Momentum',
  'order-block': 'Order Block Retest',
  'supply-demand': 'Supply & Demand',
  'trend-following': 'Trend Following',
}

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'] as const

function timeAgo(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours(diff) < 24) return `${hours(diff)}h ago`
  return `${Math.floor(hours(diff) / 24)}d ago`
}

function hours(diffMs: number) {
  return Math.floor(diffMs / 3600_000)
}

function NotificationRow({ item, onRead }: { item: StoredNotification; onRead: (id: string) => void }) {
  const navigate = useNavigate()
  const isBuy = item.direction === 'BUY'

  return (
    <button
      type="button"
      onClick={() => {
        onRead(item.id)
        navigate(`/dashboard?symbol=${encodeURIComponent(item.symbol)}&timeframe=${encodeURIComponent(item.timeframe)}`)
      }}
      className={cn(
        "w-full text-left p-4 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group",
        item.read ? 'bg-[#090d14]/40 hover:bg-white/[0.02]' : 'bg-blue-500/[0.04] hover:bg-blue-500/[0.07]'
      )}
    >
      {/* Left Details */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className={cn(
          "mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border font-bold text-[10px]",
          isBuy
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
        )}>
          {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        </div>

        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
              isBuy ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30"
            )}>
              {item.direction}
            </span>
            <span className="text-[13px] font-bold text-white tracking-wide">{item.symbol}</span>
            <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
              {item.timeframe}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
              {STRATEGY_LABELS[item.strategyId] ?? item.strategyLabel}
            </span>

            {!item.read && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold uppercase tracking-wider">
                Unread Alert
              </span>
            )}
          </div>

          {/* Pricing Grid */}
          <div className="flex items-center gap-4 text-[11px] text-slate-300 font-mono pt-1 flex-wrap">
            <span>Entry: <strong className="text-slate-100">{item.entry}</strong></span>
            <span>SL: <strong className="text-rose-400">{item.sl}</strong></span>
            <span>TP: <strong className="text-emerald-400">{item.tp}</strong></span>
            <span>R:R: <strong className="text-blue-400">{item.rr.toFixed(1)}x</strong></span>
            <span className="text-slate-400">Confidence: <strong className="text-blue-300">{item.confidence}%</strong></span>
          </div>

          {item.reason.length > 0 && (
            <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug pt-0.5">
              • {item.reason.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Right Metadata & Action */}
      <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/[0.06]">
        <span className="text-[10px] text-slate-500 font-medium">{timeAgo(item.createdAt)}</span>
        <div className="flex items-center gap-1 text-[11px] font-bold text-blue-400 group-hover:text-blue-300 transition-colors">
          <span>View on Chart</span>
          <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  )
}

export default function Notifications() {
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearNotifications = useNotificationStore((s) => s.clearNotifications)

  useEffect(() => {
    async function syncSignals() {
      try {
        const [liveSignals, historical] = await Promise.all([
          getLiveSignals(),
          getHistoricalSignals(),
        ])
        const liveArr = Array.isArray(liveSignals) ? liveSignals : []
        const histArr = historical?.signals || []
        const allFetched = [...liveArr, ...histArr]
        if (allFetched.length > 0) {
          const notificationsToHydrate: StoredNotification[] = allFetched.map((s: any) => {
            const ms = typeof s.createdAt === 'string'
              ? new Date(s.createdAt).getTime()
              : typeof s.createdAt === 'number'
                ? s.createdAt
                : s.createdAt?.seconds
                  ? s.createdAt.seconds * 1000
                  : s.time
                    ? s.time * 1000
                    : Date.now()

            return {
              id: s.id,
              symbol: s.symbol,
              timeframe: s.timeframe,
              strategyId: s.strategyId || 'unknown',
              strategyLabel: s.strategyLabel || s.strategyId || 'Strategy',
              direction: s.direction || 'BUY',
              entry: Number(s.entry || 0),
              sl: Number(s.sl || 0),
              tp: Number(s.tp || 0),
              rr: Number(s.rr || 1.5),
              confidence: Number(s.confidence || 50),
              reason: Array.isArray(s.reason) ? s.reason : [],
              time: s.time,
              read: false,
              createdAt: ms,
            }
          })
          useNotificationStore.getState().addNotifications(notificationsToHydrate)
        }
      } catch {
        // ignore
      }
    }
    void syncSignals()
  }, [])

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | 'READ' | 'UNREAD'>('ALL')
  const [strategy, setStrategy] = useState('ALL')
  const [timeframe, setTimeframe] = useState('ALL')

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications])
  const symbolCount = useMemo(() => new Set(notifications.map((item) => item.symbol)).size, [notifications])

  const filtered = useMemo(() => {
    let list = [...notifications]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((item) =>
        item.symbol.toLowerCase().includes(q) ||
        item.strategyLabel.toLowerCase().includes(q) ||
        item.reason.join(' ').toLowerCase().includes(q),
      )
    }
    if (status === 'READ') list = list.filter((item) => item.read)
    if (status === 'UNREAD') list = list.filter((item) => !item.read)
    if (strategy !== 'ALL') list = list.filter((item) => item.strategyId === strategy)
    if (timeframe !== 'ALL') list = list.filter((item) => item.timeframe === timeframe)
    return list
  }, [notifications, search, status, strategy, timeframe])

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 selection:bg-blue-500/20">
      {/* Header Bar */}
      <header className="h-14 border-b border-white/[0.08] bg-[#070709]/95 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-[#0d1117] border border-white/[0.12] flex items-center justify-center group-hover:border-white/[0.25] transition-colors">
              <img src="/TRAXO-icon.png" alt="TRAXO" className="w-4 h-4 object-contain" />
            </div>
            <span className="text-[11px] font-black tracking-[0.22em] uppercase text-white hidden sm:inline">
              TRAXO
            </span>
          </Link>

          <span className="h-4 w-px bg-white/[0.1] hidden sm:block shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1117] border border-white/[0.08]">
              <Bell className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-200 truncate">Alerts Stream</span>
            </div>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-[10px] font-extrabold text-blue-400 shrink-0">
                {unreadCount} Unread
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#0d1117] hover:bg-white/[0.06] text-[10px] font-bold uppercase tracking-wider text-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck size={12} />
            <span>Mark All Read</span>
          </button>
          <button
            type="button"
            onClick={clearNotifications}
            disabled={notifications.length === 0}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#0d1117] hover:bg-white/[0.06] text-[10px] font-bold uppercase tracking-wider text-rose-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
          <DesktopWorkspaceNav />
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* UNIFIED CONTIGUOUS WORKSPACE CONTAINER (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top Overview Bar */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Live Notification Stream
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Real-Time Signal Alerts & Notifications
              </h1>
              <p className="text-[12px] sm:text-[13px] text-slate-400 leading-relaxed">
                Review live strategy signal triggers, quantitative confidence scores, Entry/SL/TP levels, and exact algorithm reasoning.
              </p>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto xl:min-w-[34rem]">
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Total Alerts</p>
                <p className="mt-1 text-lg font-bold text-white tabular-nums">{notifications.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Unread Alerts</p>
                <p className="mt-1 text-lg font-bold text-blue-400 tabular-nums">{unreadCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Active Symbols</p>
                <p className="mt-1 text-lg font-bold text-slate-200 tabular-nums">{symbolCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Filtered Stream</p>
                <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums">{filtered.length}</p>
              </div>
            </div>
          </div>

          {/* Controls Bar inside container */}
          <div className="p-3 bg-[#070b12]/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by symbol, strategy, or reason..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#090d14] border border-white/[0.08] text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-white/[0.2] transition-colors"
              />
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-lg border border-white/[0.06]">
                {(['ALL', 'UNREAD', 'READ'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st)}
                    className={cn(
                      "h-6 px-2.5 rounded text-[9px] font-extrabold uppercase tracking-wider transition-all",
                      status === st
                        ? "bg-white/[0.1] text-white border border-white/[0.15]"
                        : "text-slate-400 hover:text-white border border-transparent"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Strategy Selector Dropdown */}
              <select
                value={strategy}
                onChange={(event) => setStrategy(event.target.value)}
                className="h-8 rounded-lg border border-white/[0.08] bg-[#090d14] px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Strategies</option>
                {Object.entries(STRATEGY_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>

              {/* Timeframe Pills */}
              <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-lg border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTimeframe('ALL')}
                  className={cn(
                    "h-6 px-2 rounded text-[9px] font-extrabold uppercase transition-all",
                    timeframe === 'ALL'
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  All TF
                </button>
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={cn(
                      "h-6 px-2 rounded text-[9px] font-extrabold uppercase transition-all",
                      timeframe === tf
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Alert Stream Rows (Contiguous, Zero Floating Cards) */}
          <div className="divide-y divide-white/[0.06]">
            {filtered.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-500 mx-auto">
                  <Bell size={18} />
                </div>
                <p className="text-[13px] font-bold text-white">No alerts found</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Signals will appear here automatically when strategy conditions pass on active charts.
                </p>
              </div>
            ) : (
              filtered.map((item) => (
                <NotificationRow key={item.id} item={item} onRead={markRead} />
              ))
            )}
          </div>
        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}