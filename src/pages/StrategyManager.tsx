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
  Search,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
  BookOpenText,
  SlidersHorizontal,
} from 'lucide-react'
import { StrategiesHeader } from '@/components/layout/StrategiesHeader'
import { MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, useOnboardingStore } from '@/stores/useOnboardingStore'
import { cn } from '@/lib/utils'

const STRATEGIES = [
  {
    id: 'wick-rejection',
    name: 'Wick Rejection',
    tagline: 'Reversal at key liquidity sweeps & wick tip rejections',
    timeframe: '1H / 4H',
    winRate: '74%',
    signalsPerDay: 4,
    type: 'reversal',
    description: 'Detects high-volume wick exhaustion at key structural liquidity levels with ATR tolerance validation.',
  },
  {
    id: 'breakout',
    name: 'Breakout Momentum',
    tagline: 'Consolidation range expansion with institutional momentum',
    timeframe: '1H / 4H / 1D',
    winRate: '68%',
    signalsPerDay: 3,
    type: 'continuation',
    description: 'Captures volatility expansion when price breaks out of multi-candle compression zones with volume confluence.',
  },
  {
    id: 'order-block',
    name: 'Order Block Retest',
    tagline: 'Institutional footprint zone retest & order flow entry',
    timeframe: '1H / 4H',
    winRate: '71%',
    signalsPerDay: 3,
    type: 'reversal',
    description: 'Identifies major institutional order blocks preceding energetic displacements and tracks mitigation retests.',
  },
  {
    id: 'supply-demand',
    name: 'Supply & Demand',
    tagline: 'Imbalance zone reaction & structural flip framework',
    timeframe: '1H / 4H',
    winRate: '77%',
    signalsPerDay: 3,
    type: 'reversal',
    description: 'Pins unmitigated supply and demand zones, targeting liquidity voids with precision stop-loss placement.',
  },
  {
    id: 'trend-following',
    name: 'Trend Following',
    tagline: 'High-probability pullback continuation in dominant trend',
    timeframe: '4H / 1D',
    winRate: '69%',
    signalsPerDay: 2,
    type: 'continuation',
    description: 'Filters market structure for higher-high/higher-low sequences and triggers entries on healthy retracements.',
  },
] as const

type FilterType = 'all' | 'reversal' | 'continuation'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const plan = useOnboardingStore((s) => s.plan)
  const selectedStrategyId = useOnboardingStore((s) => s.selectedStrategyId)
  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)

  const activeStrategyIds = plan === 'pro' ? selectedStrategyIds : [selectedStrategyId]

  const filteredStrategies = STRATEGIES.filter((strategy) => {
    const matchesFilter = filter === 'all' || strategy.type === filter
    const matchesSearch =
      strategy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      strategy.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      strategy.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
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
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 relative selection:bg-blue-500/20">
      {/* Sleek Top Header */}
      <StrategiesHeader title="Strategies" subtitle="Institutional Trading Frameworks" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* UNIFIED CONTIGUOUS TERMINAL WORKSPACE (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top Panel Banner */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Strategy Execution Engine
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Institutional Algorithmic Strategy Blueprints
              </h1>
              <p className="text-[12px] sm:text-[13px] text-slate-400 leading-relaxed">
                Click any framework to inspect its mathematical entry criteria, stop loss placement rules, invalidation conditions, and live algorithm signal stream.
              </p>
            </div>

            {/* Metrics Bar inside top panel */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto xl:min-w-[34rem]">
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Frameworks</p>
                <p className="mt-1 text-lg font-bold text-white tabular-nums">{STRATEGIES.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Active Stack</p>
                <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums">{activeStrategyIds.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Avg Win Rate</p>
                <p className="mt-1 text-lg font-bold text-blue-400 tabular-nums">{stats.avgWinRate}%</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Daily Capacity</p>
                <p className="mt-1 text-lg font-bold text-slate-200 tabular-nums">{stats.signalCapacity}/day</p>
              </div>
            </div>
          </div>

          {/* Controls Bar inside container */}
          <div className="p-3 bg-[#070b12]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-lg border border-white/[0.06]">
              {(['all', 'reversal', 'continuation'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilter(type)}
                  className={cn(
                    "h-7 px-3 rounded text-[10px] font-extrabold uppercase tracking-wider transition-all",
                    filter === type
                      ? "bg-white/[0.1] text-white border border-white/[0.15] shadow-sm"
                      : "text-slate-400 hover:text-white border border-transparent"
                  )}
                >
                  {type === 'all' ? 'All Frameworks' : type}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search framework rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#090d14] border border-white/[0.08] text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-white/[0.2] transition-colors"
              />
            </div>
          </div>

          {/* Strategy Framework List Table (Contiguous, Zero Floating Cards) */}
          <div className="divide-y divide-white/[0.06]">
            {filteredStrategies.map((strategy) => {
              const Icon = getStrategyIcon(strategy.id)
              const isActive = activeStrategyIds.includes(strategy.id)

              return (
                <Link
                  key={strategy.id}
                  to={`/strategies/${strategy.id}`}
                  className="group p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Left Metadata & Logic */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-[#05080f] border border-white/[0.1] flex items-center justify-center text-blue-400 shrink-0 group-hover:border-blue-500/40 transition-colors mt-0.5">
                      <Icon size={18} />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-[14px] font-bold text-white group-hover:text-blue-300 transition-colors">
                          {strategy.name}
                        </h2>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shrink-0",
                            isActive
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-white/[0.04] text-slate-400 border-white/[0.08]"
                          )}
                        >
                          {isActive ? 'Active in Plan' : 'Available'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                          {strategy.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed max-w-2xl">
                        {strategy.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Metrics & Action Link */}
                  <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/[0.06]">
                    <div className="flex items-center gap-4 text-center">
                      <div>
                        <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Timeframe</span>
                        <span className="text-[11px] font-bold text-slate-200">{strategy.timeframe}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Daily Signals</span>
                        <span className="text-[11px] font-bold text-slate-200">{strategy.signalsPerDay}/day</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Win Rate</span>
                        <span className="text-[11px] font-extrabold text-emerald-400">{strategy.winRate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400 group-hover:text-blue-300 transition-colors pl-2">
                      <BookOpenText className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Inspect Framework</span>
                      <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Bottom Phase 2 Custom Strategy Builder Callout */}
          <div className="p-5 bg-[#05080f]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Sparkles size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-bold text-white">Custom Strategy Builder Sandbox</h3>
                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-white/[0.06] text-slate-400 border border-white/[0.08]">Phase 2</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Design custom entry checkpoints, volatility filters, and backtest execution parameters.</p>
              </div>
            </div>

            <button
              onClick={openBetaModal}
              className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] text-[10px] font-bold text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Lock size={10} />
              <span>Request Sandbox Access</span>
            </button>
          </div>
        </div>
      </main>

      {/* Beta Access Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-xl border border-white/[0.14] bg-[#090d14] p-5 shadow-2xl space-y-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>

            {!isSubmitted ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-white">Custom Strategy Builder Beta</h3>
                    <p className="text-[10px] text-slate-400">Request sandbox access</p>
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.08] bg-[#05080f] p-3 space-y-2 text-[10px]">
                  <p className="uppercase font-bold tracking-widest text-slate-500">Visual Rule Compiler Preview</p>
                  <div className="p-2 rounded bg-[#090d14] border border-white/[0.06] flex justify-between">
                    <span className="text-slate-300 font-semibold">1. Rejection Wick Ratio</span>
                    <span className="text-blue-400 font-bold">&gt;= 3:1</span>
                  </div>
                  <div className="p-2 rounded bg-[#090d14] border border-white/[0.06] flex justify-between">
                    <span className="text-slate-300 font-semibold">2. Volume Confluence</span>
                    <span className="text-emerald-400 font-bold">&gt; 1.5x MA20</span>
                  </div>
                </div>

                <form onSubmit={handleJoinWaitlist} className="space-y-2.5">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your trading email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-white/[0.1] bg-[#05080f] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg"
                  >
                    <Play size={12} fill="currentColor" />
                    Join Strategy Sandbox Beta
                  </button>
                </form>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={20} />
                </div>
                <h3 className="text-[14px] font-bold text-white">Beta Access Requested</h3>
                <p className="text-xs text-slate-400">
                  We registered your request for <span className="text-white font-bold">{email}</span>.
                </p>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="h-8 px-4 rounded-lg bg-white/[0.06] text-xs font-bold text-slate-200 hover:text-white"
                >
                  Return to Frameworks
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
