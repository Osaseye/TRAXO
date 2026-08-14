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
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, type OnboardingStrategyId, useOnboardingStore } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useNavigate, Link } from 'react-router'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { cn } from '@/lib/utils'

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
    if (!window.confirm('Sign out of TRAXO?')) return
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Sign out failed', err)
      navigate('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-[11px] font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-500/20 transition-colors ml-2"
    >
      <LogOut size={14} />
      <span className="hidden sm:inline">Sign out</span>
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
      const t = setTimeout(() => setPushPermission(Notification.permission), 0)
      return () => clearTimeout(t)
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
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 selection:bg-blue-500/20 font-sans">
      
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
              <SettingsIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-200 truncate uppercase tracking-wider">Settings & Configuration</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DesktopWorkspaceNav />
          <SignOutButton />
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Subscription Plan & Billing */}
          <section className="p-5 sm:p-6 bg-[#05080f]/50">
            <div className="flex items-center gap-2 mb-4">
              <Crown size={16} className="text-amber-400" />
              <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Subscription Plan</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLAN_CARDS.map((p) => {
                const isSelected = p.id === plan
                const isElite = p.id === 'elite'
                return (
                  <div key={p.id} className={cn("rounded-xl border p-5 flex flex-col transition-all", isSelected ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'border-white/[0.06] bg-[#090d14]', isElite && 'opacity-50 grayscale')}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-[15px] font-black text-white uppercase tracking-wider">{p.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">{p.badge}</p>
                      </div>
                      {isSelected && <Check size={18} className="text-blue-400" />}
                    </div>
                    <p className="text-[24px] font-black text-white mt-2 tabular-nums">
                      {p.price} <span className="text-[11px] font-bold text-slate-500 tracking-wider">{p.period}</span>
                    </p>
                    <p className="text-[12px] font-medium text-slate-400 mt-3 flex-1">{p.description}</p>
                    <ul className="mt-5 space-y-2.5 mb-6">
                      {p.features.map(f => (
                        <li key={f} className="text-[11px] font-semibold text-slate-300 flex items-start gap-2">
                          <span className="text-blue-500/50 mt-0.5">•</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={isElite || isSelected}
                      onClick={() => {
                        if (!isElite && !isSelected) setPlan(p.id)
                      }}
                      className={cn(
                        "w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors mt-auto",
                        isSelected ? 'bg-blue-600 text-white cursor-default shadow-lg' : isElite ? 'bg-white/[0.04] text-slate-500 cursor-not-allowed border border-white/[0.06]' : 'bg-[#0d1117] text-white hover:bg-white/[0.1] border border-white/[0.1]'
                      )}
                    >
                      {isSelected ? 'Active Plan' : p.cta}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Risk Management & Configuration */}
          <section className="p-5 sm:p-6 bg-[#070b12]/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Risk Management & Metrics</h3>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-5 max-w-2xl">
              These values drive dashboard position sizing, capital protection guidance, and live risk-to-reward ratio calculations.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <label className="rounded-lg border border-white/[0.06] bg-[#090d14] p-4 text-[12px] text-slate-300">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[10px] text-slate-500 mb-3">
                  <Wallet size={12} className="text-blue-400" />
                  Account Balance
                </span>
                <input
                  type="number"
                  value={accountBalance}
                  onChange={(event) => setAccountBalance(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[14px] font-black tabular-nums text-white outline-none focus:border-blue-500/50"
                />
                <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-blue-400">
                  {formatCurrency(accountBalance)} Baseline
                </span>
              </label>

              <label className="rounded-lg border border-white/[0.06] bg-[#090d14] p-4 text-[12px] text-slate-300">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[10px] text-slate-500 mb-3">
                  <Target size={12} className="text-amber-400" />
                  Risk Per Trade (%)
                </span>
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={riskPerTradePct}
                  onChange={(event) => setRiskPerTradePct(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[14px] font-black tabular-nums text-white outline-none focus:border-blue-500/50"
                />
                <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  {formatCurrency(riskBudget)} Risk Budget
                </span>
              </label>

              <label className="rounded-lg border border-white/[0.06] bg-[#090d14] p-4 text-[12px] text-slate-300">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[10px] text-slate-500 mb-3">
                  <AlertTriangle size={12} className="text-rose-400" />
                  Max Daily Loss (%)
                </span>
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.1}
                  value={maxDailyLossPct}
                  onChange={(event) => setMaxDailyLossPct(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[14px] font-black tabular-nums text-white outline-none focus:border-blue-500/50"
                />
                <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-rose-400">
                  {formatCurrency(dailyLossBudget)} Daily Stop
                </span>
              </label>
            </div>
          </section>

          {/* Active Strategy Stack */}
          <section className="p-5 sm:p-6 bg-[#05080f]/50">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-purple-400" />
                <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Active Strategy Stack</h3>
              </div>
              {plan === 'free' && <span className="text-[9px] uppercase font-black text-amber-400 tracking-widest px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10">Pro to unlock all</span>}
            </div>
            <p className="text-[11px] text-slate-400 mb-5">
              Select the quantitative setups you want to monitor concurrently. Your plan allows up to {plan === 'free' ? '1' : '5'} strategies.
            </p>
            
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
                    className={cn(
                      "flex flex-col text-left p-4 rounded-xl border transition-all relative overflow-hidden group",
                      isSelected ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/[0.06] bg-[#090d14] hover:border-white/[0.15]'
                    )}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />}
                    <div className="flex justify-between items-start w-full">
                      <p className="text-[13px] font-bold text-white">{strategy.name}</p>
                      {isSelected && <Check size={14} className="text-purple-400" />}
                    </div>
                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-3">
                      <span>WR: <span className="text-emerald-400 tabular-nums">{strategy.winRate}</span></span>
                      <span>Signals: <span className="text-blue-400 tabular-nums">~{strategy.signalsPerDay}/d</span></span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Alerts & Notifications */}
          <section className="p-5 sm:p-6 bg-[#070b12]/50">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} className="text-blue-400" />
              <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Alerts & Notifications</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-5">
              Control how TRAXO notifies you and which markets/timeframes are allowed to trigger alerts.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Delivery Methods</h4>
                
                {/* In-app toasts */}
                <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-[#090d14] p-3">
                  <div>
                    <p className="text-[12px] font-bold text-white">In-app Toasts</p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">Pop-up cards inside the dashboard</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifToastEnabled(!notifToastEnabled)}
                    className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", notifToastEnabled ? 'bg-blue-500' : 'bg-slate-700')}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", notifToastEnabled ? 'translate-x-5' : 'translate-x-1')} />
                  </button>
                </div>

                {/* Sound alerts */}
                <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-[#090d14] p-3">
                  <div>
                    <p className="text-[12px] font-bold text-white">Sound Alerts</p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">Brief chime when a signal fires</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifSoundEnabled(!notifSoundEnabled)}
                    className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", notifSoundEnabled ? 'bg-blue-500' : 'bg-slate-700')}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", notifSoundEnabled ? 'translate-x-5' : 'translate-x-1')} />
                  </button>
                </div>

                {/* Browser pushes */}
                <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-[#090d14] p-3">
                  <div>
                    <p className="text-[12px] font-bold text-white">System Push Notifications</p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">OS-level alerts when TRAXO is minimized</p>
                    {pushPermission === 'denied' && <p className="text-[9px] font-bold text-rose-500 mt-1 uppercase tracking-wider">Permission blocked in browser</p>}
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
                    className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", (notifPushEnabled && pushPermission === 'granted') ? 'bg-blue-500' : 'bg-slate-700', pushPermission === 'denied' && 'opacity-40')}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", (notifPushEnabled && pushPermission === 'granted') ? 'translate-x-5' : 'translate-x-1')} />
                  </button>
                </div>

                {/* Min Confidence */}
                <div className="rounded-lg border border-white/[0.06] bg-[#090d14] p-4 mt-3">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <p className="text-[12px] font-bold text-white">Minimum Confidence Threshold</p>
                    <span className="text-[14px] font-black text-blue-400 tabular-nums">{notifMinConfidencePct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={notifMinConfidencePct}
                    onChange={(event) => setNotifMinConfidencePct(Number(event.target.value))}
                    className="w-full accent-blue-500 h-1 bg-white/[0.1] rounded-full appearance-none outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Filters</h4>
                
                {/* Timeframes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-300">Timeframes</span>
                    <button type="button" onClick={() => setNotifTimeframeFilters([])} className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", notifTimeframeFilters.length === 0 ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.06] text-slate-400")}>All</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {NOTIF_TIMEFRAMES.map((tf) => {
                      const active = notifTimeframeFilters.includes(tf)
                      return (
                        <button key={tf} type="button" onClick={() => toggleNotifTimeframeFilter(tf)} className={cn("px-2.5 py-1 text-[10px] font-bold rounded-md border", active ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[#090d14] border-white/[0.08] text-slate-400 hover:bg-white/[0.05]')}>
                          {tf}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Symbols */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-300">Instruments</span>
                    <button type="button" onClick={() => setNotifSymbolFilters([])} className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", notifSymbolFilters.length === 0 ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.06] text-slate-400")}>All Markets</button>
                  </div>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {NOTIF_SYMBOL_GROUPS.map((group) => (
                      <div key={group.label} className="space-y-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.symbols.map((symbol) => {
                            const active = notifSymbolFilters.includes(symbol)
                            return (
                              <button key={symbol} type="button" onClick={() => toggleNotifSymbolFilter(symbol)} className={cn("px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-md border", active ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[#090d14] border-white/[0.08] text-slate-400 hover:bg-white/[0.05]')}>
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
            </div>
          </section>

          {/* Broker Integration (Exness / FxPro) */}
          <section className="p-5 sm:p-6 bg-[#070b12]/50 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-emerald-400" />
                <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Broker Integration (Exness / FxPro)</h3>
              </div>
              <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-widest px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10">Connected</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-5">
              Connect your MT4 or MT5 broker account to enable 1-Click execution directly from TRAXO signal alerts.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/[0.08] bg-[#090d14] p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Broker Platform</span>
                <select className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] font-bold text-white outline-none focus:border-emerald-500/50">
                  <option value="exness">Exness Technologies</option>
                  <option value="fxpro">FxPro Financial Services</option>
                  <option value="icmarkets">IC Markets</option>
                  <option value="custom">Custom MT4 / MT5 Server</option>
                </select>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#090d14] p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Account Login ID</span>
                <input
                  type="text"
                  placeholder="e.g. 50493821"
                  defaultValue="50493821"
                  className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] font-bold text-white outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#090d14] p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Server Name</span>
                <input
                  type="text"
                  placeholder="e.g. Exness-Real14"
                  defaultValue="Exness-Real14"
                  className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] font-bold text-white outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
          </section>

          {/* Educational / Roadmap Footer Sections */}
          <section className="p-5 sm:p-6 bg-[#05080f]/30 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-emerald-400" />
                <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Autopilot Roadmap <span className="ml-2 text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">ELITE</span></h3>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Autopilot will turn Elite into an execution layer: reading the active strategy stack, respecting risk budgets, and routing setups automatically when filters agree.
              </p>
              <div className="space-y-2">
                {AUTOPILOT_BENEFITS.map((item) => (
                  <div key={item.title} className="rounded-lg border border-white/[0.04] bg-[#090d14] p-3">
                    <p className="text-[11px] font-bold text-slate-200">{item.title}</p>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Market Event Awareness</h3>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Market events can override technical setups. TRAXO treats each market type with a different risk lens.
              </p>
              <div className="space-y-2">
                <div className="rounded-lg border border-white/[0.04] bg-[#090d14] p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Landmark size={12} className="text-blue-400" />
                    <p className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Forex</p>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Uses a calendar-first filter around inflation, jobs, GDP, central bank releases, and session volatility.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.04] bg-[#090d14] p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <BarChart3 size={12} className="text-purple-400" />
                    <p className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Crypto</p>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Uses a catalyst-first filter for regulation, ETF flows, token unlocks, listings, protocol upgrades, and funding spikes.
                  </p>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
