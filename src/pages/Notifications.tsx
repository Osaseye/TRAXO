import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Filter,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useNotificationStore, type StoredNotification } from '@/stores/useNotificationStore'

const STRATEGY_LABELS: Record<string, string> = {
  'wick-rejection': 'Wick Rejection',
  breakout: 'Breakout',
  'order-block': 'Order Block',
  'supply-demand': 'Supply & Demand',
  'trend-following': 'Trend Following',
}

const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'] as const

function timeAgo(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
      className={`w-full text-left rounded-2xl border p-4 transition-colors ${item.read ? 'border-white/[0.06] bg-[#0b0f17]' : 'border-[#3b82f6]/20 bg-[#0d1626]'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isBuy ? 'bg-[#22c55e]/10 text-[#86efac]' : 'bg-[#ef4444]/10 text-[#fca5a5]'}`}>
          <Bell size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isBuy ? 'bg-[#22c55e]/10 text-[#86efac]' : 'bg-[#ef4444]/10 text-[#fca5a5]'}`}>
              {item.direction}
            </span>
            <span className="text-[14px] font-semibold text-white">{item.symbol}</span>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-[#cbd5e1]">{item.timeframe}</span>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-[#cbd5e1]">
              {STRATEGY_LABELS[item.strategyId] ?? item.strategyLabel}
            </span>
            {!item.read && <span className="rounded-full bg-[#3b82f6]/20 px-2 py-0.5 text-[10px] font-semibold text-[#93c5fd]">New</span>}
          </div>

          <p className="mt-2 text-[12px] text-[#94a3b8]">
            Entry {item.entry} · SL {item.sl} · TP {item.tp} · {item.confidence}% confidence · {item.rr.toFixed(1)}R
          </p>

          {item.reason.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#64748b] line-clamp-2">
              {item.reason.slice(0, 2).join(' · ')}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[#64748b]">
            <span>{timeAgo(item.createdAt)}</span>
            <span className="inline-flex items-center gap-1 text-[#94a3b8]">
              Open details <ChevronRight size={12} />
            </span>
          </div>
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
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link to="/dashboard" className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0">
            <X size={15} className="text-[#94a3b8]" />
          </Link>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <Bell size={14} className="text-[#93c5fd] shrink-0" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Notifications</h1>
          {unreadCount > 0 && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/25 text-[10px] font-semibold text-[#93c5fd]">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] font-medium text-[#94a3b8] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck size={12} />
            Mark all read
          </button>
          <button
            type="button"
            onClick={clearNotifications}
            disabled={notifications.length === 0}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] font-medium text-[#94a3b8] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={12} />
            Clear
          </button>
          <DesktopWorkspaceNav />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Total</p>
            <p className="mt-1 text-2xl font-bold text-white">{notifications.length}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Unread</p>
            <p className="mt-1 text-2xl font-bold text-white">{unreadCount}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Symbols</p>
            <p className="mt-1 text-2xl font-bold text-white">{symbolCount}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Filtered</p>
            <p className="mt-1 text-2xl font-bold text-white">{filtered.length}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-[#0d1117] p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-[#93c5fd]" />
            <span className="text-[12px] font-semibold text-[#94a3b8]">Filters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="relative md:col-span-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search symbol, strategy, or reason"
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#070709] pl-9 pr-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
              />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-xl border border-white/[0.08] bg-[#070709] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50">
              <option value="ALL">All</option>
              <option value="UNREAD">Unread</option>
              <option value="READ">Read</option>
            </select>
            <select value={strategy} onChange={(event) => setStrategy(event.target.value)} className="h-10 rounded-xl border border-white/[0.08] bg-[#070709] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50">
              <option value="ALL">All strategies</option>
              {Object.entries(STRATEGY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[#64748b] mr-1">Timeframes</span>
            <button type="button" onClick={() => setTimeframe('ALL')} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${timeframe === 'ALL' ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>All</button>
            {TIMEFRAMES.map((tf) => (
              <button key={tf} type="button" onClick={() => setTimeframe(tf)} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${timeframe === tf ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>
                {tf}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0d1117] p-10 text-center">
              <p className="text-[14px] font-semibold text-white">No notifications yet</p>
              <p className="mt-2 text-[12px] text-[#64748b]">When signals fire, they will appear here and stay available after refresh.</p>
            </div>
          ) : (
            filtered.map((item) => (
              <NotificationRow key={item.id} item={item} onRead={markRead} />
            ))
          )}
        </section>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}