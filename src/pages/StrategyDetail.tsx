import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Clock,
  BarChart2,
  Target,
  Shield,
  ChevronDown,
  ChevronUp,
  Radio,
  Trash2,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore'

// --- Strategy metadata ---

const STRATEGY_META: Record<string, { name: string; tagline: string; color: string }> = {
  'wick-rejection': {
    name: 'Wick Rejection',
    tagline: 'Reversal at liquidity sweeps',
    color: '#818cf8',
  },
  breakout: {
    name: 'Breakout',
    tagline: 'Consolidation break with momentum',
    color: '#34d399',
  },
  'order-block': {
    name: 'Order Block',
    tagline: 'Institutional footprint retest',
    color: '#f59e0b',
  },
  'supply-demand': {
    name: 'Supply & Demand',
    tagline: 'Imbalance zone reaction trades',
    color: '#f472b6',
  },
  'trend-following': {
    name: 'Trend Following',
    tagline: 'Pullback entries in directional structure',
    color: '#22d3ee',
  },
}

// --- Helpers ---

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(1)
  if (price >= 100) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(5)
}

// --- Signal Card ---

function SignalCard({ signal }: { signal: StoredSignal }) {
  const [expanded, setExpanded] = useState(false)
  const isBuy = signal.direction === 'BUY'

  const riskColor =
    signal.risk === 'Low'
      ? 'text-emerald-400 bg-emerald-400/10'
      : signal.risk === 'Medium'
      ? 'text-amber-400 bg-amber-400/10'
      : 'text-red-400 bg-red-400/10'

  const confColor =
    signal.confidence >= 85
      ? 'text-emerald-400'
      : signal.confidence >= 75
      ? 'text-amber-400'
      : 'text-red-400'

  return (
    <div
      className={`rounded-2xl border bg-[#0d1117] overflow-hidden transition-all ${
        isBuy ? 'border-emerald-500/20' : 'border-red-500/20'
      }`}
    >
      <div className={`h-0.5 w-full ${isBuy ? 'bg-emerald-500' : 'bg-red-500'}`} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider ${
                isBuy
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-red-500/15 text-red-400 border border-red-500/25'
              }`}
            >
              {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {signal.direction}
            </div>
            <div>
              <span className="text-[14px] font-bold text-white">{signal.symbol}</span>
              <span className="text-[11px] text-[#64748b] ml-1.5">· {signal.timeframe}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-[16px] font-extrabold tabular-nums ${confColor}`}>
              {signal.confidence}%
            </p>
            <p className="text-[10px] text-[#64748b] mt-0.5">confidence</p>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2">
          {[
            { label: 'ENTRY', value: formatPrice(signal.entry), icon: Target },
            { label: 'STOP', value: formatPrice(signal.sl), icon: Shield },
            { label: 'TARGET', value: formatPrice(signal.tp), icon: Activity },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl bg-[#0b0f17] border border-white/[0.06] p-2.5">
              <div className="flex items-center gap-1 mb-1">
                <Icon size={9} className="text-[#475569]" />
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#475569]">{label}</p>
              </div>
              <p className="text-[12px] font-bold text-white tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${riskColor}`}>
              {signal.risk} Risk
            </span>
            <span className="text-[11px] text-[#64748b] font-semibold">{signal.rr.toFixed(1)}R</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#475569]">
            <Clock size={9} />
            <span>{timeAgo(signal.time as number)}</span>
          </div>
        </div>

        {signal.reason.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center gap-1 text-[11px] text-[#64748b] hover:text-[#94a3b8] transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide' : 'Show'} reasoning ({signal.reason.length})
          </button>
        )}

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {signal.reason.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-[#94a3b8]">
                <span className="text-[#475569] mt-0.5 shrink-0">·</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Empty State ---

function EmptyState({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: `${color}15`, border: `1px solid ${color}25` }}
      >
        <Radio size={28} style={{ color }} className="animate-pulse" />
      </div>
      <p className="text-[15px] font-semibold text-white mb-2">Scanning markets…</p>
      <p className="text-[13px] text-[#475569] max-w-xs leading-relaxed">
        Signals will appear here automatically as the algorithm detects valid setups in real time.
      </p>
    </div>
  )
}

// --- Stats Bar ---

function StatsBar({ signals }: { signals: StoredSignal[] }) {
  const buys = signals.filter((s) => s.direction === 'BUY').length
  const sells = signals.filter((s) => s.direction === 'SELL').length
  const avgConf =
    signals.length > 0
      ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length)
      : 0
  const avgRR =
    signals.length > 0
      ? (signals.reduce((a, s) => a + s.rr, 0) / signals.length).toFixed(1)
      : null

  const items = [
    { label: 'Total', value: signals.length.toString(), icon: Zap, color: '#94a3b8' },
    { label: 'BUY', value: buys.toString(), icon: TrendingUp, color: '#34d399' },
    { label: 'SELL', value: sells.toString(), icon: TrendingDown, color: '#f87171' },
    { label: 'Avg Conf', value: signals.length > 0 ? `${avgConf}%` : '—', icon: BarChart2, color: '#818cf8' },
    { label: 'Avg RR', value: avgRR ? `${avgRR}R` : '—', icon: Target, color: '#f59e0b' },
  ]

  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-3 flex flex-col items-center text-center"
        >
          <Icon size={13} style={{ color }} className="mb-1.5" />
          <p className="text-[15px] font-bold text-white tabular-nums">{value}</p>
          <p className="text-[9px] uppercase tracking-[0.1em] text-[#475569] mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}

// --- Main Page ---

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>()
  const allSignals = useAnalysisSignalStore((s) => s.signals)
  const clearSignals = useAnalysisSignalStore((s) => s.clearSignals)
  const clearFirestoreSignals = useAnalysisSignalStore((s) => s.clearFirestoreSignals)
  const uid = useAnalysisSignalStore((s) => s._uid)
  const meta = strategyId ? STRATEGY_META[strategyId] : undefined
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [confirmClear, setConfirmClear] = useState(false)

  const strategySignals = useMemo(
    () => allSignals.filter((s) => s.strategyId === strategyId),
    [allSignals, strategyId],
  )

  const displayed = useMemo(
    () =>
      filter === 'ALL'
        ? strategySignals
        : strategySignals.filter((s) => s.direction === filter),
    [strategySignals, filter],
  )

  if (!meta) {
    return (
      <div className="min-h-screen bg-[#070709] text-white p-6">
        <p className="text-[#cbd5e1]">Strategy not found.</p>
        <Link to="/strategies" className="inline-flex items-center gap-2 text-[13px] text-[#93c5fd] mt-3">
          <ArrowLeft size={14} /> Back to strategies
        </Link>
      </div>
    )
  }

  const buys = strategySignals.filter((s) => s.direction === 'BUY').length
  const sells = strategySignals.filter((s) => s.direction === 'SELL').length

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Link
            to="/strategies"
            className="w-8 h-8 rounded-lg border border-white/[0.12] flex items-center justify-center text-[#cbd5e1] hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
          </Link>
          <div>
            <h1 className="text-[14px] font-semibold leading-none">{meta.name}</h1>
            <p className="text-[10px] text-[#475569] mt-0.5">{meta.tagline}</p>
          </div>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div
          className="rounded-2xl border bg-[#0d1117] p-5 relative overflow-hidden"
          style={{ borderColor: `${meta.color}20` }}
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ background: `radial-gradient(circle at 20% 50%, ${meta.color}, transparent 60%)` }}
          />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1"
                style={{ color: meta.color }}
              >
                Live Signal Feed
              </p>
              <h2 className="text-[22px] font-extrabold">{meta.name}</h2>
              <p className="text-[12px] text-[#64748b] mt-1">{meta.tagline}</p>
            </div>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
            >
              <Activity size={20} style={{ color: meta.color }} />
            </div>
          </div>
        </div>

        <StatsBar signals={strategySignals} />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(['ALL', 'BUY', 'SELL'] as const).map((f) => {
              const count = f === 'ALL' ? strategySignals.length : f === 'BUY' ? buys : sells
              const active = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    active
                      ? f === 'BUY'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : f === 'SELL'
                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                        : 'bg-white/10 border-white/20 text-white'
                      : 'bg-transparent border-white/[0.08] text-[#64748b] hover:text-[#94a3b8]'
                  }`}
                >
                  {f === 'BUY' && <TrendingUp size={10} />}
                  {f === 'SELL' && <TrendingDown size={10} />}
                  {f}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/10' : 'bg-white/[0.05]'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {strategySignals.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#64748b]">Clear all?</span>
                <button
                  onClick={() => { clearSignals(); if (uid) void clearFirestoreSignals(uid); setConfirmClear(false) }}
                  className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-[11px] text-[#475569] hover:text-[#94a3b8] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 text-[11px] text-[#475569] hover:text-red-400 transition-colors"
              >
                <Trash2 size={11} />
                Clear
              </button>
            )
          )}
        </div>

        {displayed.length === 0 ? (
          <EmptyState color={meta.color} />
        ) : (
          <div className="space-y-3">
            {displayed.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
