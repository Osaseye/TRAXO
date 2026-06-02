import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Crown,
  Check,
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
import { useAuthStore } from '@/stores/useAuthStore'
import { useNavigate } from 'react-router'
import { useTradingContextStore } from '@/stores/useTradingContextStore'

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

const PLAN_CARDS = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '₦0',
    period: 'forever',
    badge: 'Starter',
    description: 'Learn Analyst Mode with one strategy and delayed signals.',
    features: [
      '1 active strategy',
      '5-minute signal delay',
      'Basic dashboard and journal',
      'Forex and crypto exposure',
    ],
    cta: 'Keep Free',
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '₦8,000',
    period: 'per month',
    badge: 'Most Popular',
    description: 'Real-time signals, multi-strategy routing, and deeper market context.',
    features: [
      'Up to 5 active strategies',
      'Real-time signals',
      'Full risk controls and journals',
      'Forex, crypto, gold, and majors',
    ],
    cta: 'Switch to Pro',
  },
  {
    id: 'elite' as const,
    name: 'Elite',
    price: '₦20,000',
    period: 'per month',
    badge: 'Roadmap',
    description: 'Everything in Pro plus Autopilot, paper trading, and execution guardrails.',
    features: [
      'Autopilot execution layer',
      'Paper trading and backtesting',
      'Advanced analytics and alerts',
      'Priority support and compliance logs',
    ],
    cta: 'Coming soon',
  },
] as const

const MARKET_CONTEXT = [
  'Forex majors',
  'Gold (XAU)',
  'Bitcoin',
  'Ethereum',
  'Indices',
  'Commodities',
]

const AUTOPILOT_BENEFITS = [
  {
    title: 'Strategy-aware routing',
    body: 'Autopilot will only act on setups that match the active strategy stack and timeframe rules.',
  },
  {
    title: 'Market filter checks',
    body: 'Execution will pause around high-impact news, session flips, and volatile market transitions.',
  },
  {
    title: 'Risk guardrails',
    body: 'Per-trade risk, daily loss caps, and trade limits remain enforced before any execution handoff.',
  },
]

function SignOutButton() {
  const logout = useAuthStore((s) => s.logout)
  const isLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()

  async function handleSignOut() {
    // quick confirmation
    if (!window.confirm('Sign out of TRAXO?')) return
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Sign out failed', err)
      navigate('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      className="ml-2 px-3 py-1 rounded-lg border border-white/[0.08] text-[13px] font-medium text-white hover:bg-white/[0.04] transition-colors"
    >
      Sign out
    </button>
  )
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

  const notifToastEnabled = useTradingContextStore((s) => s.notifToastEnabled)
  const setNotifToastEnabled = useTradingContextStore((s) => s.setNotifToastEnabled)
  const notifSoundEnabled = useTradingContextStore((s) => s.notifSoundEnabled)
  const setNotifSoundEnabled = useTradingContextStore((s) => s.setNotifSoundEnabled)
  const notifPushEnabled = useTradingContextStore((s) => s.notifPushEnabled)
  const setNotifPushEnabled = useTradingContextStore((s) => s.setNotifPushEnabled)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )

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
        <div className="flex items-center gap-2">
          <DesktopWorkspaceNav />
          <SignOutButton />
        </div>
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

              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                {PLAN_CARDS.map((card) => {
                  const active = card.id === plan
                  const disabled = card.id === 'elite'

                  return (
                    <button
                      key={card.name}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setPlan(card.id)}
                      className={`relative flex h-full flex-col rounded-2xl border p-5 text-left transition-all ${
                        active
                          ? 'border-[#3b82f6]/45 bg-[#0d1626] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
                          : 'border-white/[0.08] bg-[#0b0f17] hover:border-white/[0.18]'
                      } ${disabled ? 'opacity-90' : ''}`}
                    >
                      {card.badge && (
                        <span className={`absolute -top-3 left-4 rounded-full px-3 py-1 text-[10px] font-bold tracking-wide ${card.id === 'pro' ? 'bg-[#3b82f6] text-white' : 'bg-[#1e293b] text-[#cbd5e1]'}`}>
                          {card.badge}
                        </span>
                      )}
                      <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#64748b]">{card.name}</p>
                      <div className="mt-3 flex items-end gap-1.5">
                        <span className="text-3xl font-extrabold text-white tracking-tight">{card.price}</span>
                        <span className="text-[12px] text-[#374151] mb-1.5">{card.period}</span>
                      </div>
                      <p className="mt-3 text-[12px] text-[#94a3b8] leading-relaxed">{card.description}</p>
                      <ul className="mt-5 space-y-2.5">
                        {card.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5">
                            <Check size={13} className={`mt-0.5 shrink-0 ${active ? 'text-[#3b82f6]' : 'text-[#374151]'}`} />
                            <span className="text-[12px] text-[#cbd5e1] leading-snug">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white">
                        {disabled ? 'Coming soon' : card.cta}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0b0f17] p-4">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Market coverage</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {MARKET_CONTEXT.map((market) => (
                    <span key={market} className="rounded-full border border-white/[0.08] bg-[#09090d] px-3 py-1 text-[11px] text-[#cbd5e1]">
                      {market}
                    </span>
                  ))}
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

            {/* Signal Alerts */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Bell size={16} className="text-[#93c5fd]" />
                <p className="text-[13px] font-semibold">Signal Alerts</p>
              </div>
              <p className="text-[12px] text-[#94a3b8] mb-5">
                Get notified the moment a live signal is detected on the current candle.
              </p>

              <div className="space-y-3">
                {/* Toast toggle */}
                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0b0f17] px-4 py-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">In-app toasts</p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">Pop-up card in the bottom-right corner of the dashboard</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifToastEnabled(!notifToastEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      notifToastEnabled ? 'bg-[#3b82f6]' : 'bg-[#1e293b]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        notifToastEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Sound toggle */}
                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0b0f17] px-4 py-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Sound alerts</p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">Brief chime when a signal fires (ascending for BUY, descending for SELL)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifSoundEnabled(!notifSoundEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      notifSoundEnabled ? 'bg-[#3b82f6]' : 'bg-[#1e293b]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        notifSoundEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Browser push toggle */}
                <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0b0f17] px-4 py-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Browser push</p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">Fires even when the tab is minimised</p>
                    {pushPermission === 'denied' && (
                      <p className="text-[10px] text-[#ef4444] mt-1">Permission blocked — enable in browser site settings</p>
                    )}
                    {pushPermission === 'default' && notifPushEnabled && (
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await Notification.requestPermission()
                          setPushPermission(result)
                          if (result !== 'granted') setNotifPushEnabled(false)
                        }}
                        className="mt-2 text-[10px] font-semibold text-[#3b82f6] underline"
                      >
                        Request permission
                      </button>
                    )}
                    {pushPermission === 'granted' && (
                      <p className="text-[10px] text-[#22c55e] mt-1">Permission granted</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={pushPermission === 'denied'}
                    onClick={() => {
                      const next = !notifPushEnabled
                      setNotifPushEnabled(next)
                      if (next && pushPermission === 'default') {
                        void Notification.requestPermission().then((result) => {
                          setPushPermission(result)
                          if (result !== 'granted') setNotifPushEnabled(false)
                        })
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      notifPushEnabled && pushPermission === 'granted' ? 'bg-[#3b82f6]' : 'bg-[#1e293b]'
                    } disabled:opacity-40`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        notifPushEnabled && pushPermission === 'granted' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-[#bfdbfe]" />
                <p className="text-[13px] font-semibold">Autopilot Roadmap</p>
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Elite feature set</p>
              <h3 className="mt-2 text-lg font-bold text-[#f8fafc]">Autopilot execution</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                Autopilot will turn Elite into the execution layer: it will read the active strategy stack, respect your risk budget, and only route approved setups when market filters agree.
              </p>
              <div className="mt-4 space-y-3">
                {AUTOPILOT_BENEFITS.map((item) => (
                  <div key={item.title} className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                    <p className="text-[12px] font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-[11px] text-[#94a3b8] leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[#fde68a]" />
                <p className="text-[13px] font-semibold">Market Event Awareness</p>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                Market events can override technical setups. TRAXO treats each market type with a different risk lens so the plan you choose reflects what you trade.
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <div className="flex items-center gap-2">
                    <Landmark size={14} className="text-[#7dd3fc]" />
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Forex</p>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                    Use a calendar-first filter around inflation, jobs, GDP, central bank releases, and session volatility.
                  </p>
                </div>

                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={14} className="text-[#a5b4fc]" />
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Crypto</p>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#94a3b8]">
                    Use a catalyst-first filter for regulation, ETF flows, token unlocks, listings, protocol upgrades, and funding spikes.
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
