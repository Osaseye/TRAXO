import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Layers3,
  Lock,
  Mail,
  Play,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, useOnboardingStore } from '@/stores/useOnboardingStore'

const STRATEGIES = [
  {
    id: 'wick-rejection',
    name: 'Wick Rejection',
    tagline: 'Reversal at liquidity sweeps',
    timeframe: '1H / 4H',
    winRate: '74%',
    signalsPerDay: 4,
    type: 'reversal',
    cover: '/strategies/wick-rejection/wick-rejection.png',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    tagline: 'Consolidation break with momentum',
    timeframe: '1H / 4H / 1D',
    winRate: '68%',
    signalsPerDay: 3,
    type: 'continuation',
    cover: null,
  },
  {
    id: 'order-block',
    name: 'Order Block',
    tagline: 'Institutional footprint retest',
    timeframe: '1H / 4H',
    winRate: '71%',
    signalsPerDay: 3,
    type: 'reversal',
    cover: null,
  },
  {
    id: 'supply-demand',
    name: 'Supply & Demand',
    tagline: 'Zone reaction framework',
    timeframe: '1H / 4H',
    winRate: '77%',
    signalsPerDay: 3,
    type: 'reversal',
    cover: null,
  },
  {
    id: 'trend-following',
    name: 'Trend Following',
    tagline: 'Pullback continuation model',
    timeframe: '4H / 1D',
    winRate: '69%',
    signalsPerDay: 2,
    type: 'continuation',
    cover: null,
  },
] as const

type FilterType = 'all' | 'reversal' | 'continuation'

function getWinRateTone(rateStr: string) {
  const rate = parseInt(rateStr, 10)
  if (rate >= 75) return 'border-[#22c55e]/30 bg-[#22c55e]/10 text-[#86efac]'
  if (rate >= 70) return 'border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#bfdbfe]'
  return 'border-white/[0.12] bg-white/[0.05] text-[#cbd5e1]'
}

function getStrategyIcon(id: string) {
  switch (id) {
    case 'wick-rejection':
      return TrendingUp
    case 'breakout':
      return ArrowUpRight
    case 'order-block':
      return Layers3
    case 'supply-demand':
      return Target
    case 'trend-following':
      return BarChart3
    default:
      return Zap
  }
}

export default function StrategyManager() {
  const [filter, setFilter] = useState<FilterType>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const plan = useOnboardingStore((s) => s.plan)
  const selectedStrategyId = useOnboardingStore((s) => s.selectedStrategyId)
  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)

  const activeStrategyIds = plan === 'pro' ? selectedStrategyIds : [selectedStrategyId]

  const filteredStrategies = STRATEGIES.filter((strategy) => {
    if (filter === 'all') return true
    return strategy.type === filter
  })

  const stats = useMemo(() => {
    const reversal = STRATEGIES.filter((strategy) => strategy.type === 'reversal').length
    const continuation = STRATEGIES.filter((strategy) => strategy.type === 'continuation').length
    const avgWinRate = Math.round(
      STRATEGIES.reduce((sum, strategy) => sum + parseInt(strategy.winRate, 10), 0) / STRATEGIES.length
    )
    const signalCapacity = STRATEGIES.reduce((sum, strategy) => sum + strategy.signalsPerDay, 0)

    return { reversal, continuation, avgWinRate, signalCapacity }
  }, [])

  function handleJoinWaitlist(event: React.FormEvent) {
    event.preventDefault()
    if (email.trim()) {
      setIsSubmitted(true)
    }
  }

  function openBetaModal() {
    setIsModalOpen(true)
    setIsSubmitted(false)
    setEmail('')
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 relative">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Strategies</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Strategy Library</p>
              <h2 className="mt-2 text-2xl font-bold text-[#f8fafc]">Choose the framework behind your signals</h2>
              <p className="mt-2 text-[13px] text-[#94a3b8] max-w-3xl">
                Study entries, invalidation logic, risk models, and strategy-specific execution rules before taking setups live.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto xl:min-w-[38rem]">
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Guides</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{STRATEGIES.length}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Active</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{activeStrategyIds.length}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Avg WR</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{stats.avgWinRate}%</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Signals</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{stats.signalCapacity}/day</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-5">
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-[#0d1117] border border-white/[0.06] rounded-xl w-fit">
                {(['all', 'reversal', 'continuation'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilter(type)}
                    className={`h-8 px-3 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      filter === type
                        ? 'bg-white/[0.09] text-white border border-white/[0.12]'
                        : 'text-[#94a3b8] hover:text-white border border-transparent'
                    }`}
                  >
                    {type === 'all' ? 'All Guides' : type}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-[#64748b]">{filteredStrategies.length} guides shown</p>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStrategies.map((strategy) => {
                const Icon = getStrategyIcon(strategy.id)
                const isActive = activeStrategyIds.includes(strategy.id)

                return (
                  <Link
                    key={strategy.id}
                    to={`/strategies/${strategy.id}`}
                    className="group rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden hover:border-[#3b82f6]/35 transition-colors flex flex-col"
                  >
                    <div className="h-32 bg-[#0b0f17] relative border-b border-white/[0.06] overflow-hidden">
                      {strategy.cover ? (
                        <img
                          src={strategy.cover}
                          alt={`${strategy.name} cover`}
                          className="absolute inset-0 w-full h-full object-cover opacity-75"
                        />
                      ) : (
                        <div className="absolute inset-0 grid grid-cols-6 gap-px opacity-40">
                          {Array.from({ length: 36 }).map((_, index) => (
                            <span key={index} className="bg-white/[0.04]" />
                          ))}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/45 to-transparent" />
                      <div className="absolute top-3 left-3 w-9 h-9 rounded-lg border border-white/[0.12] bg-black/35 backdrop-blur-sm flex items-center justify-center text-[#bfdbfe]">
                        <Icon size={17} />
                      </div>
                      <div className="absolute top-3 right-3 w-8 h-8 rounded-lg border border-white/[0.12] bg-black/35 backdrop-blur-sm flex items-center justify-center text-[#cbd5e1] group-hover:text-white group-hover:border-[#3b82f6]/45 transition-colors">
                        <ArrowUpRight size={14} />
                      </div>
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
                        <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase ${getWinRateTone(strategy.winRate)}`}>
                          {strategy.winRate} win rate
                        </span>
                        <span
                          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase ${
                            isActive
                              ? 'border-[#22c55e]/30 bg-[#22c55e]/10 text-[#86efac]'
                              : 'border-white/[0.12] bg-black/25 text-[#cbd5e1]'
                          }`}
                        >
                          {isActive ? 'Active' : 'Available'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[15px] font-bold text-white group-hover:text-[#bfdbfe] transition-colors">
                            {strategy.name}
                          </h3>
                          <p className="mt-1 text-[12px] text-[#94a3b8]">{strategy.tagline}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-2">
                          <p className="text-[#64748b]">Type</p>
                          <p className="mt-1 font-semibold text-[#e5e7eb] capitalize">{strategy.type}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-2">
                          <p className="text-[#64748b]">Timeframe</p>
                          <p className="mt-1 font-semibold text-[#e5e7eb]">{strategy.timeframe}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-2">
                          <p className="text-[#64748b]">Signals</p>
                          <p className="mt-1 font-semibold text-[#e5e7eb]">{strategy.signalsPerDay}/day</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <Layers3 size={16} className="text-[#93c5fd]" />
                <p className="text-[13px] font-semibold">Library Mix</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Reversal</p>
                  <p className="mt-2 text-2xl font-bold">{stats.reversal}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Continuation</p>
                  <p className="mt-2 text-2xl font-bold">{stats.continuation}</p>
                </div>
              </div>
            </section>

            <section
              onClick={openBetaModal}
              className="rounded-2xl border border-dashed border-white/[0.15] bg-[#0d1117] p-5 cursor-pointer hover:border-[#3b82f6]/45 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg border border-white/[0.12] bg-[#0b0f17] flex items-center justify-center text-[#bfdbfe]">
                <Sparkles size={17} />
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Phase 2 Sandbox</p>
              <h3 className="mt-2 text-lg font-bold text-[#f8fafc] group-hover:text-[#bfdbfe] transition-colors">
                Custom Strategy Builder
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                Build rule blocks, define validation checkpoints, and run backtests before launching a live framework.
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.12] bg-[#0b0f17] text-[10px] font-semibold uppercase tracking-wider text-[#cbd5e1]">
                <Lock size={11} />
                Request beta access
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-[#86efac]" />
                <p className="text-[13px] font-semibold">Active Stack</p>
              </div>
              <div className="mt-4 space-y-2">
                {ONBOARDING_STRATEGIES.filter((strategy) => activeStrategyIds.includes(strategy.id)).map((strategy) => (
                  <div key={strategy.id} className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-[#e5e7eb]">{strategy.name}</p>
                      <span className="text-[10px] text-[#94a3b8]">{strategy.winRate}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#64748b]">{strategy.signalsPerDay} signals per day</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 shadow-2xl">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-white/[0.08] hover:border-white/[0.15] bg-[#0b0f17] flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X size={14} />
            </button>

            {!isSubmitted ? (
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#bfdbfe]">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Custom Strategy Builder Beta</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                    Define entries, validation checkpoints, filters, and stop structures before compiling them into a backtesting workflow.
                  </p>
                </div>

                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-2 text-[10px]">
                  <p className="uppercase tracking-[0.16em] text-[#64748b]">Rule Flow Preview</p>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#070709] border border-white/[0.06]">
                    <span className="text-[#e5e7eb]">Rule 1: Rejection Wick Ratio</span>
                    <span className="text-[#94a3b8]">&gt;= 2:1</span>
                  </div>
                  <div className="flex justify-center">
                    <ChevronRight size={12} className="text-[#64748b] rotate-90" />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#070709] border border-white/[0.06]">
                    <span className="text-[#e5e7eb]">Rule 2: Volatility Filter</span>
                    <span className="text-[#94a3b8]">ATR &gt; 1.5</span>
                  </div>
                </div>

                <form onSubmit={handleJoinWaitlist} className="space-y-2.5">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your trading account email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full h-10 pl-9 pr-4 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-xs text-white placeholder:text-[#64748b] focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full h-10 rounded-lg bg-white text-[#111827] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#e5e7eb] transition-colors"
                  >
                    <Play size={12} fill="currentColor" />
                    Join sandbox beta waitlist
                  </button>
                </form>
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/25 flex items-center justify-center text-[#86efac] mx-auto">
                  <CheckCircle2 size={22} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">You are on the list</h3>
                  <p className="text-xs text-[#94a3b8] leading-relaxed">
                    We saved your beta request under <span className="text-white font-semibold">{email}</span>.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 h-9 rounded-lg border border-white/[0.08] hover:border-white/[0.15] bg-[#0b0f17] text-xs text-[#cbd5e1] transition-colors"
                >
                  Return to library
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
