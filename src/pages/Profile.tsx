import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Activity,
  BadgeCheck,
  CalendarClock,
  Crown,
  KeyRound,
  Mail,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  UserRound,
  User,
  Save,
  CheckCircle2,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, useOnboardingStore } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useProfileStore } from '@/stores/useProfileStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { cn } from '@/lib/utils'

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function formatLabel(value: string | null) {
  if (!value) return 'Not set'
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getInitials(fullName: string, displayName: string) {
  const source = fullName.trim() || displayName || 'TRAXO'
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function Profile() {
  const authUser = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const twoFaEnabled = useProfileStore((s) => s.twoFaEnabled)
  const setTwoFaEnabled = useProfileStore((s) => s.setTwoFaEnabled)

  const plan = useOnboardingStore((s) => s.plan)
  const experienceLevel = useOnboardingStore((s) => s.experienceLevel)
  const instruments = useOnboardingStore((s) => s.instruments)
  const selectedStrategyId = useOnboardingStore((s) => s.selectedStrategyId)
  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)

  const accountBalance = useTradingContextStore((s) => s.accountBalance)
  const riskPerTradePct = useTradingContextStore((s) => s.riskPerTradePct)
  const maxDailyLossPct = useTradingContextStore((s) => s.maxDailyLossPct)
  const journal = useTradingContextStore((s) => s.journal)

  const fallbackEmail = authUser?.email ?? 'trader@traxo.app'
  const effectiveEmail = authUser?.email || fallbackEmail
  const displayName = authUser?.displayName || authUser?.fullName || 'TRAXO Trader'
  const dobLabel = authUser?.dob ? new Date(authUser.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not set'

  const [savedSuccess, setSavedSuccess] = useState(false)
  const [form, setForm] = useState({
    fullName: authUser?.fullName ?? '',
    displayName: authUser?.displayName ?? '',
    email: effectiveEmail,
    dob: authUser?.dob ?? '',
    country: authUser?.country ?? '',
    bio: authUser?.bio ?? '',
  })

  useEffect(() => {
    const t = setTimeout(() => {
      setForm({
        fullName: authUser?.fullName ?? '',
        displayName: authUser?.displayName ?? '',
        email: authUser?.email ?? fallbackEmail,
        dob: authUser?.dob ?? '',
        country: authUser?.country ?? '',
        bio: authUser?.bio ?? '',
      })
    }, 0)
    return () => clearTimeout(t)
  }, [authUser, fallbackEmail])

  const activeStrategies = useMemo(() => {
    const ids = plan === 'pro' ? selectedStrategyIds : [selectedStrategyId]
    return ids
      .map((id) => ONBOARDING_STRATEGIES.find((strategy) => strategy.id === id)?.name)
      .filter((name): name is NonNullable<typeof name> => Boolean(name))
  }, [plan, selectedStrategyId, selectedStrategyIds])

  const journalStats = useMemo(() => {
    const settledTaken = journal.filter(
      (entry) => entry.taken && (entry.outcome === 'win' || entry.outcome === 'loss' || entry.outcome === 'breakeven')
    )
    const wins = settledTaken.filter((entry) => entry.outcome === 'win').length
    const losses = settledTaken.filter((entry) => entry.outcome === 'loss').length
    const winRate = settledTaken.length > 0 ? Math.round((wins / settledTaken.length) * 100) : 0
    const latest = [...journal].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null

    return {
      total: journal.length,
      wins,
      losses,
      winRate,
      latest,
    }
  }, [journal])

  const instrumentsText = instruments.length > 0 ? instruments.map(formatLabel).join(', ') : 'Not set'
  const initials = getInitials(authUser?.fullName ?? '', displayName)
  const accountStatus = authUser?.subscriptionStatus ?? 'active'

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function saveProfile() {
    updateProfile(form)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 selection:bg-blue-500/20">
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
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-200 truncate">Trader Profile</span>
            </div>
          </div>
        </div>

        <DesktopWorkspaceNav />
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* UNIFIED CONTIGUOUS TERMINAL WORKSPACE CONTAINER (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top User Identity Banner */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center justify-center text-lg font-black text-blue-400 shrink-0">
                {initials}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">{displayName}</h1>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {accountStatus}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={12} className="text-slate-500" />
                    {effectiveEmail}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={12} className="text-slate-500" />
                    {authUser?.country || 'Country not set'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={12} className="text-slate-500" />
                    {dobLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Account Status Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto lg:min-w-[30rem]">
              <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Plan</span>
                <span className="text-sm font-extrabold text-white capitalize">{plan}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">2FA Security</span>
                <span className={cn("text-sm font-extrabold", twoFaEnabled ? "text-emerald-400" : "text-amber-400")}>
                  {twoFaEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Logged Trades</span>
                <span className="text-sm font-extrabold text-slate-200 tabular-nums">{journalStats.total}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Win Rate</span>
                <span className="text-sm font-extrabold text-emerald-400 tabular-nums">{journalStats.winRate}%</span>
              </div>
            </div>
          </div>

          {/* Account Metrics Strip */}
          <div className="p-5 bg-[#070b12]/80 space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Trading Operating Context</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-[#090d14] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest text-slate-500">
                  <Crown size={12} className="text-amber-400" />
                  <span>Account Balance</span>
                </div>
                <p className="mt-2 text-lg font-extrabold text-white tabular-nums">{formatCurrency(accountBalance)}</p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#090d14] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest text-slate-500">
                  <Target size={12} className="text-blue-400" />
                  <span>Risk Per Trade</span>
                </div>
                <p className="mt-2 text-lg font-extrabold text-blue-400 tabular-nums">{riskPerTradePct.toFixed(1)}%</p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#090d14] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest text-slate-500">
                  <ShieldCheck size={12} className="text-rose-400" />
                  <span>Daily Loss Cap</span>
                </div>
                <p className="mt-2 text-lg font-extrabold text-rose-400 tabular-nums">{maxDailyLossPct.toFixed(1)}%</p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#090d14] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest text-slate-500">
                  <Activity size={12} className="text-emerald-400" />
                  <span>Win Rate</span>
                </div>
                <p className="mt-2 text-lg font-extrabold text-emerald-400 tabular-nums">{journalStats.winRate}%</p>
              </div>
            </div>
          </div>

          {/* Operating Profile & Parameters */}
          <div className="p-5 sm:p-6 space-y-4">
            <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Strategy & Market Profile</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06]">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Active Strategy Stack</span>
                <span className="text-[12px] font-bold text-slate-200 mt-1 block">
                  {activeStrategies.length > 0 ? activeStrategies.join(', ') : 'No strategy selected'}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06]">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Experience Level</span>
                <span className="text-[12px] font-bold text-slate-200 mt-1 block">{formatLabel(experienceLevel)}</span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06]">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Traded Markets</span>
                <span className="text-[12px] font-bold text-slate-200 mt-1 block">{instrumentsText}</span>
              </div>
            </div>
          </div>

          {/* Personal Information Form */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Personal Information & Identity</h3>
              {savedSuccess && (
                <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/30">
                  <CheckCircle2 size={12} />
                  <span>Profile updated successfully!</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-[11px] font-bold text-slate-300">
                Full Name
                <input
                  value={form.fullName}
                  onChange={(event) => updateField('fullName', event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] text-white outline-none focus:border-blue-500/50"
                />
              </label>

              <label className="text-[11px] font-bold text-slate-300">
                Display Name
                <input
                  value={form.displayName}
                  onChange={(event) => updateField('displayName', event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] text-white outline-none focus:border-blue-500/50"
                />
              </label>

              <label className="text-[11px] font-bold text-slate-300">
                Date of Birth
                <input
                  type="date"
                  value={form.dob}
                  onChange={(event) => updateField('dob', event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] text-white outline-none focus:border-blue-500/50"
                />
              </label>

              <label className="text-[11px] font-bold text-slate-300">
                Country
                <input
                  value={form.country}
                  onChange={(event) => updateField('country', event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 text-[12px] text-white outline-none focus:border-blue-500/50"
                />
              </label>

              <label className="text-[11px] font-bold text-slate-300 sm:col-span-2">
                Email Address
                <input
                  type="email"
                  value={form.email}
                  readOnly
                  className="mt-1 h-9 w-full rounded-lg border border-white/[0.08] bg-[#05080f] px-3 text-[12px] text-slate-500 outline-none cursor-not-allowed"
                />
              </label>

              <label className="text-[11px] font-bold text-slate-300 sm:col-span-2">
                Trader Bio & Operating Notes
                <textarea
                  value={form.bio}
                  onChange={(event) => updateField('bio', event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-lg border border-white/[0.1] bg-[#05080f] px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500/50"
                />
              </label>
            </div>

            <div className="pt-2">
              <button
                onClick={saveProfile}
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shadow-lg"
              >
                <Save size={13} />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </div>

          {/* Account Security & 2FA */}
          <div className="p-5 sm:p-6 space-y-4 bg-[#070b12]/50">
            <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Account Security & Two-Factor Auth</h3>
            
            <div className="p-4 rounded-lg bg-[#05080f] border border-white/[0.06] flex items-center justify-between gap-4">
              <div>
                <span className="text-[12px] font-bold text-white block">Two-Factor Authentication (2FA)</span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Requires an authenticator code when signing into TRAXO.</span>
              </div>

              <button
                onClick={() => setTwoFaEnabled(!twoFaEnabled)}
                className={cn(
                  "h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0 border",
                  twoFaEnabled
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-white/[0.06] text-slate-300 border-white/[0.08]"
                )}
              >
                {twoFaEnabled ? 'Enabled' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
