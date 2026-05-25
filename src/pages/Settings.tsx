import { useMemo } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Crown,
  Landmark,
  Layers3,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Wallet,
  Zap,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, type OnboardingStrategyId, useOnboardingStore } from '@/stores/useOnboardingStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

export default function Settings() {
  const plan = useOnboardingStore((s) => s.plan)
  const setPlan = useOnboardingStore((s) => s.setPlan)

  const selectedStrategyId = useOnboardingStore((s) => s.selectedStrategyId)
  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)
  const setSelectedStrategy = useOnboardingStore((s) => s.setSelectedStrategy)
  const toggleSelectedStrategy = useOnboardingStore((s) => s.toggleSelectedStrategy)

  const accountBalance = useTradingContextStore((s) => s.accountBalance)
  const setAccountBalance = useTradingContextStore((s) => s.setAccountBalance)
  const riskPerTradePct = useTradingContextStore((s) => s.riskPerTradePct)
  const setRiskPerTradePct = useTradingContextStore((s) => s.setRiskPerTradePct)
  const maxDailyLossPct = useTradingContextStore((s) => s.maxDailyLossPct)
  const setMaxDailyLossPct = useTradingContextStore((s) => s.setMaxDailyLossPct)

  const activeStrategies = useMemo(() => {
    const ids = plan === 'pro' ? selectedStrategyIds : [selectedStrategyId]
    return ids
      .map((id) => ONBOARDING_STRATEGIES.find((strategy) => strategy.id === id)?.name)
      .filter((name): name is NonNullable<typeof name> => Boolean(name))
  }, [plan, selectedStrategyId, selectedStrategyIds])

  const activeStrategyText = useMemo(() => {
    if (plan === 'pro') {
      return `${selectedStrategyIds.length} strategies active for blended chart suggestions.`
    }

    return `${activeStrategies[0] ?? 'No strategy'} is active for chart suggestions.`
  }, [activeStrategies, plan, selectedStrategyIds])

  const riskBudget = accountBalance * (riskPerTradePct / 100)
  const dailyLossBudget = accountBalance * (maxDailyLossPct / 100)

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Settings</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Control Center</p>
              <h2 className="mt-2 text-2xl font-bold text-[#f8fafc]">Trading preferences and access</h2>
              <p className="mt-2 text-[13px] text-[#94a3b8] max-w-3xl">
                Configure plan access, strategy routing, risk limits, and market-event behavior from one focused workspace.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto lg:min-w-[38rem]">
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Plan</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc] capitalize">{plan}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Strategies</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{activeStrategies.length}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Risk Trade</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{riskPerTradePct.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Daily Cap</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">{maxDailyLossPct.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-5">
          <div className="space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Crown size={16} className="text-[#fde68a]" />
                    <p className="text-[13px] font-semibold">Plan and Access</p>
                  </div>
                  <p className="mt-2 text-[12px] text-[#94a3b8]">{activeStrategyText}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full sm:w-64">
                  <button
                    type="button"
                    onClick={() => setPlan('free')}
                    className={`h-10 rounded-lg text-[12px] font-semibold transition-colors ${
                      plan === 'free'
                        ? 'bg-white text-[#111827]'
                        : 'bg-[#0b0f17] border border-white/[0.12] text-[#cbd5e1] hover:border-white/[0.22]'
                    }`}
                  >
                    Free
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlan('pro')}
                    className={`h-10 rounded-lg text-[12px] font-semibold transition-colors ${
                      plan === 'pro'
                        ? 'bg-white text-[#111827]'
                        : 'bg-[#0b0f17] border border-white/[0.12] text-[#cbd5e1] hover:border-white/[0.22]'
                    }`}
                  >
                    Pro
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Free Mode</p>
                  <p className="mt-2 text-[13px] font-semibold text-[#e5e7eb]">One active strategy</p>
                  <p className="mt-2 text-[12px] text-[#94a3b8]">Focused suggestions from a single framework.</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Pro Mode</p>
                  <p className="mt-2 text-[13px] font-semibold text-[#e5e7eb]">Two to five strategies</p>
                  <p className="mt-2 text-[12px] text-[#94a3b8]">Blended suggestions across selected frameworks.</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers3 size={16} className="text-[#93c5fd]" />
                    <p className="text-[13px] font-semibold">Strategy Selection</p>
                  </div>
                  <p className="mt-2 text-[12px] text-[#94a3b8]">
                    Choose which frameworks are allowed to influence chart suggestions.
                  </p>
                </div>
                <span className="h-8 px-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[11px] font-semibold text-[#cbd5e1] inline-flex items-center justify-center w-fit">
                  Selected {activeStrategies.length}/{plan === 'pro' ? 5 : 1}
                </span>
              </div>

              {plan === 'free' ? (
                <label className="mt-5 block text-[12px] text-[#94a3b8]">
                  Active strategy
                  <select
                    value={selectedStrategyId}
                    onChange={(event) => setSelectedStrategy(event.target.value as OnboardingStrategyId)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  >
                    {ONBOARDING_STRATEGIES.map((strategy) => (
                      <option key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ONBOARDING_STRATEGIES.map((strategy) => {
                    const isSelected = selectedStrategyIds.includes(strategy.id)
                    const canDeselect = selectedStrategyIds.length > 1
                    const canSelect = selectedStrategyIds.length < 5
                    const disabled = isSelected ? !canDeselect : !canSelect

                    return (
                      <button
                        key={strategy.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSelectedStrategy(strategy.id as OnboardingStrategyId)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-[#93c5fd]/50 bg-[#1e3a8a]/20 text-[#dbeafe]'
                            : 'border-white/[0.12] bg-[#0b0f17] text-[#cbd5e1] hover:border-white/[0.26]'
                        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-semibold">{strategy.name}</span>
                          <span className="text-[10px] text-[#94a3b8]">{strategy.winRate}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">{strategy.signalsPerDay} signals per day</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#86efac]" />
                <p className="text-[13px] font-semibold">Risk Controls</p>
              </div>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                These values drive dashboard position sizing and capital protection guidance.
              </p>

              <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
                <label className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4 text-[12px] text-[#94a3b8]">
                  <span className="flex items-center gap-2">
                    <Wallet size={14} />
                    Account balance
                  </span>
                  <input
                    type="number"
                    value={accountBalance}
                    onChange={(event) => setAccountBalance(Number(event.target.value))}
                    className="mt-3 h-10 w-full rounded-lg border border-white/[0.12] bg-[#070709] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                  <span className="mt-2 block text-[11px] text-[#64748b]">{formatCurrency(accountBalance)} available baseline</span>
                </label>

                <label className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4 text-[12px] text-[#94a3b8]">
                  <span className="flex items-center gap-2">
                    <Target size={14} />
                    Risk per trade
                  </span>
                  <input
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={riskPerTradePct}
                    onChange={(event) => setRiskPerTradePct(Number(event.target.value))}
                    className="mt-3 h-10 w-full rounded-lg border border-white/[0.12] bg-[#070709] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                  <span className="mt-2 block text-[11px] text-[#64748b]">{formatCurrency(riskBudget)} risk budget</span>
                </label>

                <label className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4 text-[12px] text-[#94a3b8]">
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} />
                    Max daily loss
                  </span>
                  <input
                    type="number"
                    min={0.5}
                    max={20}
                    step={0.1}
                    value={maxDailyLossPct}
                    onChange={(event) => setMaxDailyLossPct(Number(event.target.value))}
                    className="mt-3 h-10 w-full rounded-lg border border-white/[0.12] bg-[#070709] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                  <span className="mt-2 block text-[11px] text-[#64748b]">{formatCurrency(dailyLossBudget)} daily stop</span>
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-[#bfdbfe]" />
                <p className="text-[13px] font-semibold">Execution Pilot</p>
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Pilot - Phase 2</p>
              <h3 className="mt-2 text-lg font-bold text-[#f8fafc]">Autopilot execution</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                A guided pilot will route validated setups to broker execution profiles with safety limits and post-trade compliance checks.
              </p>
              <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
                Current status: preparation mode
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[#fde68a]" />
                <p className="text-[13px] font-semibold">Market Event Awareness</p>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                Market events can override technical setups. TRAXO treats each market type with a different risk lens.
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <div className="flex items-center gap-2">
                    <Landmark size={14} className="text-[#7dd3fc]" />
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Forex</p>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                    Use a calendar-first filter around inflation, jobs, GDP, and central bank releases.
                  </p>
                </div>

                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={14} className="text-[#a5b4fc]" />
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Crypto</p>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                    Use a catalyst-first filter for regulation, ETF flows, token unlocks, listings, and protocol upgrades.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-[#86efac]" />
                <p className="text-[13px] font-semibold">Active Configuration</p>
              </div>
              <div className="mt-4 space-y-3 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8]">Plan</span>
                  <span className="font-semibold text-[#e5e7eb] capitalize">{plan}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8]">Strategies</span>
                  <span className="font-semibold text-[#e5e7eb] text-right">{activeStrategies.join(', ')}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8]">Per-trade risk</span>
                  <span className="font-semibold text-[#e5e7eb]">{formatCurrency(riskBudget)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8]">Daily stop</span>
                  <span className="font-semibold text-[#e5e7eb]">{formatCurrency(dailyLossBudget)}</span>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
