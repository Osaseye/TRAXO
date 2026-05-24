import { useMemo } from 'react'
import { Crown, Rocket } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, type OnboardingStrategyId, useOnboardingStore } from '@/stores/useOnboardingStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'

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

  const activeStrategyText = useMemo(() => {
    if (plan === 'pro') {
      return `Pro mode: ${selectedStrategyIds.length} active strategies selected for chart suggestions.`
    }
    const current = ONBOARDING_STRATEGIES.find((s) => s.id === selectedStrategyId)
    return `Free mode: 1 strategy active (${current?.name ?? 'N/A'}).`
  }, [plan, selectedStrategyId, selectedStrategyIds])

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <h1 className="text-[14px] font-semibold">Settings</h1>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <section className="rounded-2xl border border-white/[0.1] bg-gradient-to-br from-[#0d1117] via-[#101827] to-[#0b1020] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl border border-white/[0.16] bg-black/20 flex items-center justify-center">
              <Rocket size={16} className="text-[#bfdbfe]" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#94a3b8]">Pilot · Phase 2</p>
              <h2 className="text-[clamp(1.25rem,3vw,1.9rem)] font-extrabold mt-1">Autopilot execution and portfolio orchestration</h2>
              <p className="text-[13px] text-[#cbd5e1] mt-2 max-w-3xl">
                We are preparing a guided pilot where approved users can route validated setups to broker execution profiles with safety limits and post-trade compliance checks.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#64748b]">Subscription</p>
            <h3 className="text-[16px] font-bold mt-2">Plan Access</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlan('free')}
                className={`h-10 rounded-lg text-[12px] font-semibold ${plan === 'free' ? 'bg-white text-[#111827]' : 'bg-[#111827] border border-white/[0.12] text-[#cbd5e1]'}`}
              >
                Free
              </button>
              <button
                onClick={() => setPlan('pro')}
                className={`h-10 rounded-lg text-[12px] font-semibold ${plan === 'pro' ? 'bg-white text-[#111827]' : 'bg-[#111827] border border-white/[0.12] text-[#cbd5e1]'}`}
              >
                Pro
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
              <div className="inline-flex items-center gap-1.5 text-[#e2e8f0] font-semibold"><Crown size={13} /> Access policy</div>
              <p className="mt-1.5">{activeStrategyText}</p>
            </div>

            {plan === 'free' && (
              <div className="mt-3">
                <label className="text-[12px] text-[#94a3b8]">Select your single active strategy</label>
                <select
                  value={selectedStrategyId}
                  onChange={(e) => setSelectedStrategy(e.target.value as OnboardingStrategyId)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]"
                >
                  {ONBOARDING_STRATEGIES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <section className="mt-3 rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6 space-y-4">
              <div>
                <p className="text-[12px] uppercase tracking-[0.16em] text-[#64748b]">Market event awareness</p>
                <h3 className="text-[16px] font-bold mt-2">News changes the playbook by market</h3>
                <p className="text-[13px] text-[#cbd5e1] mt-2 max-w-3xl">
                  Forex needs an economic calendar. High-impact releases like inflation, jobs, GDP, and central bank decisions can override technical setups. Crypto does not have the same calendar, so the app watches macro headlines and crypto-native catalysts instead.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#7dd3fc] font-semibold">Forex</p>
                  <p className="text-[13px] text-[#e2e8f0] mt-2 font-semibold">Use a calendar-first filter.</p>
                  <p className="text-[12px] text-[#94a3b8] mt-2 leading-relaxed">
                    Avoid taking fresh USD, EUR, GBP, JPY, AUD, CAD, NZD, or CHF trades right before red-folder releases unless the setup is specifically built for news volatility.
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#a5b4fc] font-semibold">Crypto</p>
                  <p className="text-[13px] text-[#e2e8f0] mt-2 font-semibold">Use a catalyst-first filter.</p>
                  <p className="text-[12px] text-[#94a3b8] mt-2 leading-relaxed">
                    BTC and ETH still react to macro data, but they also move on regulation, ETF flows, token unlocks, exchange listings, and protocol upgrades.
                  </p>
                </div>
              </div>
            </section>

            {plan === 'pro' && (
              <div className="mt-3 space-y-2">
                <p className="text-[12px] text-[#94a3b8]">Choose 2 to 5 strategies for blended chart suggestions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                        className={`h-10 px-3 rounded-lg border text-[12px] text-left transition-colors ${
                          isSelected
                            ? 'border-[#93c5fd]/50 bg-[#1e3a8a]/20 text-[#dbeafe]'
                            : 'border-white/[0.12] bg-[#0b0f17] text-[#cbd5e1]'
                        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-white/[0.28]'}`}
                      >
                        {strategy.name}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-[#64748b]">Selected: {selectedStrategyIds.length}/5</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 space-y-3">
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#64748b]">Risk Parameters</p>
            <h3 className="text-[16px] font-bold">Capital and loss limits</h3>

            <label className="block text-[12px] text-[#94a3b8]">Account balance
              <input
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]"
              />
            </label>

            <label className="block text-[12px] text-[#94a3b8]">Risk per trade (%)
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={riskPerTradePct}
                onChange={(e) => setRiskPerTradePct(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]"
              />
            </label>

            <label className="block text-[12px] text-[#94a3b8]">Max daily loss (%)
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.1}
                value={maxDailyLossPct}
                onChange={(e) => setMaxDailyLossPct(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]"
              />
            </label>
          </div>
        </section>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
