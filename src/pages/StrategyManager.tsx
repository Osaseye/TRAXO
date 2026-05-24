import { Link } from 'react-router'
import { ArrowUpRight, Lock, Sparkles } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'

const STRATEGIES = [
  {
    id: 'wick-rejection',
    name: 'Wick Rejection',
    tagline: 'Reversal at liquidity sweeps',
    timeframe: '1H · 4H',
    winRate: '74%',
    art: 'from-[#0f172a] via-[#1e293b] to-[#0b1220]',
    cover: '/strategies/wick-rejection/wick-rejection.png',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    tagline: 'Consolidation break with momentum',
    timeframe: '1H · 4H · 1D',
    winRate: '68%',
    art: 'from-[#111827] via-[#1f2937] to-[#0f172a]',
  },
  {
    id: 'order-block',
    name: 'Order Block',
    tagline: 'Institutional footprint retest',
    timeframe: '1H · 4H',
    winRate: '71%',
    art: 'from-[#0c1220] via-[#1e293b] to-[#111827]',
  },
  {
    id: 'supply-demand',
    name: 'Supply & Demand',
    tagline: 'Zone reaction framework',
    timeframe: '1H · 4H',
    winRate: '77%',
    art: 'from-[#0b0f17] via-[#111827] to-[#0f172a]',
  },
  {
    id: 'trend-following',
    name: 'Trend Following',
    tagline: 'Pullback continuation model',
    timeframe: '4H · 1D',
    winRate: '69%',
    art: 'from-[#0f172a] via-[#111827] to-[#0b1325]',
  },
] as const

export default function StrategyManager() {
  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <h1 className="text-[14px] font-semibold text-[#e5e7eb]">Strategies</h1>
        <DesktopWorkspaceNav />
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Strategy Library</p>
          <h2 className="text-[clamp(1.35rem,3vw,2rem)] font-extrabold tracking-tight mt-2">Choose a framework. Study the edge.</h2>
          <p className="text-[13px] text-[#94a3b8] mt-2 max-w-2xl">
            No toggles here. Each strategy has its own deep-dive page with concept, trigger logic, and risk behavior examples.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {STRATEGIES.map((s) => (
            <Link
              key={s.id}
              to={`/strategies/${s.id}`}
              className="group rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden hover:border-white/[0.18] transition-colors"
            >
              <div className={`h-28 bg-gradient-to-br ${s.art} relative`}>
                {s.id === 'wick-rejection' && (
                  <img
                    src={s.cover}
                    alt="Wick Rejection cover"
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                  />
                )}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_40%)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/45 to-transparent" />
                <div className="absolute top-3 right-3 w-8 h-8 rounded-full border border-white/[0.2] bg-black/20 flex items-center justify-center">
                  <ArrowUpRight size={14} className="text-white" />
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-white">{s.name}</h3>
                  <span className="text-[11px] font-semibold text-[#cbd5e1]">{s.winRate}</span>
                </div>
                <p className="text-[12px] text-[#94a3b8]">{s.tagline}</p>
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">{s.timeframe}</p>
              </div>
            </Link>
          ))}
        </section>

        <section className="rounded-2xl border border-dashed border-white/[0.15] bg-[#0d1117] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl border border-white/[0.14] bg-[#111827] flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-[#cbd5e1]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Phase 2 Teaser</p>
              <h3 className="text-[16px] font-bold mt-1">Custom Strategy Builder</h3>
              <p className="text-[13px] text-[#94a3b8] mt-2 max-w-3xl">
                Drag-and-drop rule blocks, no code required. Build, validate, and run your own frameworks. Backtesting and paper-trade validation will be included before live mode.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-white/[0.12] bg-[#0b0f17] text-[#cbd5e1]">
                <Lock size={12} /> Coming soon for Pro and Elite
              </div>
            </div>
          </div>
        </section>
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
