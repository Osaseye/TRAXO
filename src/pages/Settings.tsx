import { useMemo, useState, useEffect } from 'react'
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

const NOTIF_SYMBOL_GROUPS = [
  { label: 'Forex', symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'] },
  { label: 'Indices', symbols: ['SPX500', 'NAS100', 'US30', 'DE40', 'UK100', 'JP225', 'FRA40', 'AUS200'] },
  { label: 'Metals & Energy', symbols: ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'NATGAS'] },
  { label: 'Crypto', symbols: ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT'] },
  { label: 'Stocks & Futures', symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI', 'MNQ'] },
] as const

const NOTIF_TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'] as const

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
  const notifMinConfidencePct = useTradingContextStore((s) => s.notifMinConfidencePct)
  const setNotifMinConfidencePct = useTradingContextStore((s) => s.setNotifMinConfidencePct)
  const notifSymbolFilters = useTradingContextStore((s) => s.notifSymbolFilters)
  const setNotifSymbolFilters = useTradingContextStore((s) => s.setNotifSymbolFilters)
  const toggleNotifSymbolFilter = useTradingContextStore((s) => s.toggleNotifSymbolFilter)
  const notifTimeframeFilters = useTradingContextStore((s) => s.notifTimeframeFilters)
  const setNotifTimeframeFilters = useTradingContextStore((s) => s.setNotifTimeframeFilters)
  const toggleNotifTimeframeFilter = useTradingContextStore((s) => s.toggleNotifTimeframeFilter)
  const notifStrategyFilters = useTradingContextStore((s) => s.notifStrategyFilters)
  const setNotifStrategyFilters = useTradingContextStore((s) => s.setNotifStrategyFilters)
  const toggleNotifStrategyFilter = useTradingContextStore((s) => s.toggleNotifStrategyFilter)

  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission)
    }
  }, [])

  const riskBudget = (accountBalance * riskPerTradePct) / 100
  const dailyLossBudget = (accountBalance * maxDailyLossPct) / 100

    const activeStrategies = useMemo(() => {
  const ids = plan === 'free' ? [selectedStrategyId] : selectedStrategyIds
  return ONBOARDING_STRATEGIES
    .filter((s) => ids?.includes(s.id as OnboardingStrategyId))
    .map((s) => s.name)
}, [plan, selectedStrategyId, selectedStrategyIds])

  return (
    <div className="flex h-full w-full flex-col font-sans">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#070709] px-4 md:px-6">
        <h1 className="text-[14px] font-semibold text-[#f8fafc]">Settings</h1>
        <div className="flex items-center gap-4">
          <DesktopWorkspaceNav />
          <SignOutButton />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-[#030303] p-4 sm:p-6 lg:p-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          
          <div className="lg:col-span-2 space-y-6">

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Crown size={16} className="text-[#bfdbfe]" />
                <p className="text-[13px] font-semibold text-white">Subscription Plan</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLAN_CARDS.map((p) => {
                  const isSelected = p.id === plan
                  const isElite = p.id === 'elite'
                  return (
                    <div key={p.id} className={`rounded-xl border p-4 flex flex-col ${isSelected ? 'border-[#3b82f6]/50 bg-[#3b82f6]/10' : 'border-white/[0.08] bg-[#0b0f17]'} ${isElite ? 'opacity-60 grayscale' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[14px] font-bold text-white">{p.name}</p>
                          <p className="text-[11px] text-[#94a3b8]">{p.badge}</p>
                        </div>
                        {isSelected && <Check size={16} className="text-[#3b82f6]" />}
                      </div>
                      <p className="text-[20px] font-bold text-[#f8fafc] mt-2">{p.price} <span className="text-[11px] text-[#64748b] font-normal">{p.period}</span></p>
                      <p className="text-[12px] text-[#94a3b8] mt-3 flex-1">{p.description}</p>
                      <ul className="mt-4 space-y-2 mb-5">
                        {p.features.map(f => (
                          <li key={f} className="text-[11px] text-[#cbd5e1] flex items-start gap-1.5 whitespace-normal">
                            <span className="text-[#64748b] mt-0.5">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                         type="button"
                         disabled={isElite || isSelected}
                         onClick={() => {
                            if (!isElite && !isSelected) {
                               setPlan(p.id)
                            }
                         }}
                         className={`w-full py-2 rounded-lg text-[12px] font-semibold transition-colors mt-auto ${isSelected ? 'bg-[#3b82f6] text-white cursor-default' : isElite ? 'bg-white/[0.04] text-[#64748b] cursor-not-allowed' : 'bg-white/[0.08] text-white hover:bg-white/[0.12]'}`}
                      >
                        {isSelected ? 'Active Plan' : p.cta}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6 space-y-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-[#a5b4fc]" />
                  <p className="text-[13px] font-semibold text-white">Active Strategies</p>
                </div>
                {plan === 'free' && <span className="text-[10px] uppercase font-bold text-[#f59e0b] tracking-wider px-2 py-1 rounded bg-[#f59e0b]/10 border border-[#f59e0b]/20">Pro to unlock all</span>}
              </div>
              <p className="text-[12px] text-[#94a3b8]">Select the setups you want to monitor concurrently. Your plan allows up to {plan === 'free' ? '1' : '5'} strategies.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ONBOARDING_STRATEGIES.map((strategy) => {
                  const isSelected = plan === 'free' ? selectedStrategyId === strategy.id : selectedStrategyIds?.includes(strategy.id)
                  return (
                    <button
                      key={strategy.id}
                      type="button"
                      onClick={() => {
                         if (plan === 'free') setSelectedStrategy(strategy.id)
                         else toggleSelectedStrategy(strategy.id)
                      }}
                      className={`flex flex-col text-left p-4 rounded-xl border transition-colors ${isSelected ? 'border-[#3b82f6]/50 bg-[#3b82f6]/10 cursor-default' : 'border-white/[0.08] bg-[#0b0f17] hover:border-white/[0.2]'}`}
                    >
                       <div className="flex justify-between items-start w-full">
                         <p className="text-[13px] font-semibold text-white">{strategy.name}</p>
                         {isSelected && <Check size={14} className="text-[#3b82f6]" />}
                       </div>
                       <div className="flex gap-3 text-[11px] text-[#94a3b8] mt-2">
                         <span title="Historical Win Rate">WR: {strategy.winRate}</span>
                         <span title="Est. signals per day">Signals: ~{strategy.signalsPerDay}/d</span>
                       </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#86efac]" />
                <p className="text-[13px] font-semibold text-white">System Configuration</p>
              </div>
              <p className="text-[12px] text-[#94a3b8]">
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
                Control how TRAXO notifies you and which markets are allowed to send alerts.
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

                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17] px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[12px] font-semibold text-[#e5e7eb]">Minimum confidence</p>
                      <p className="text-[11px] text-[#64748b] mt-0.5">Only notify on signals at or above this confidence score</p>
                    </div>
                    <div className="w-24 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={notifMinConfidencePct}
                        onChange={(event) => setNotifMinConfidencePct(Number(event.target.value))}
                        className="h-9 w-full rounded-lg border border-white/[0.12] bg-[#070709] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={notifMinConfidencePct}
                    onChange={(event) => setNotifMinConfidencePct(Number(event.target.value))}
                    className="w-full accent-[#3b82f6]"
                  />
                  <div className="flex items-center justify-between text-[11px] text-[#64748b]">
                    <span>0%</span>
                    <span className="font-semibold text-[#93c5fd]">{notifMinConfidencePct}% and above</span>
                    <span>100%</span>
                  </div>
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
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Browser alerts</p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">Uses the browser notification permission so your device gets a system alert too</p>
                    {pushPermission === 'denied' && <p className="text-[10px] text-[#ef4444] mt-1">Permission blocked — enable in browser site settings</p>}
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
                    {pushPermission === 'granted' && <p className="text-[10px] text-[#22c55e] mt-1">Permission granted</p>}
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
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${notifPushEnabled && pushPermission === 'granted' ? 'bg-[#3b82f6]' : 'bg-[#1e293b]'} disabled:opacity-40`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notifPushEnabled && pushPermission === 'granted' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0f17] p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers3 size={16} className="text-[#c4b5fd]" />
                    <p className="text-[13px] font-semibold">Notification Scope</p>
                  </div>
                  <p className="mt-2 text-[12px] text-[#94a3b8]">Leave a category empty to receive all charts in that category. The alerts page still keeps full inbox history.</p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wider text-[#64748b]">Timeframes</p>
                    <button type="button" onClick={() => setNotifTimeframeFilters([])} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${notifTimeframeFilters.length === 0 ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>All</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {NOTIF_TIMEFRAMES.map((tf) => {
                      const active = notifTimeframeFilters.includes(tf)
                      return (
                        <button key={tf} type="button" onClick={() => toggleNotifTimeframeFilter(tf)} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${active ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>
                          {tf}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-[#64748b]">Strategies</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setNotifStrategyFilters([])} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${notifStrategyFilters.length === 0 ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>All</button>
                    {ONBOARDING_STRATEGIES.map((strategyItem) => {
                      const active = notifStrategyFilters.includes(strategyItem.id)
                      return (
                        <button key={strategyItem.id} type="button" onClick={() => toggleNotifStrategyFilter(strategyItem.id)} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${active ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>
                          {strategyItem.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-[#64748b]">Charts</p>
                  <button type="button" onClick={() => setNotifSymbolFilters([])} className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${notifSymbolFilters.length === 0 ? 'border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#93c5fd]' : 'border-white/[0.08] bg-[#070709] text-[#94a3b8]'}`}>All charts</button>
                  <div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-1">
                    {NOTIF_SYMBOL_GROUPS.map((group) => (
                      <div key={group.label} className="rounded-xl border border-white/[0.06] bg-[#070709] p-3">
                        <p className="text-[11px] uppercase tracking-wider text-[#64748b]">{group.label}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {group.symbols.map((symbol) => {
                            const active = notifSymbolFilters.includes(symbol)
                            return (
                              <button key={symbol} type="button" onClick={() => toggleNotifSymbolFilter(symbol)} className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${active ? 'bg-[#3b82f6]/15 border-[#3b82f6]/30 text-[#93c5fd]' : 'border-white/[0.08] text-[#94a3b8]'}`}>
                                {symbol}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
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
       </div>
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
