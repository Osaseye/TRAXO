import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { ONBOARDING_STRATEGIES, useOnboardingStore } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useProfileStore } from '@/stores/useProfileStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'

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
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Profile</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-2xl border border-[#3b82f6]/25 bg-[#3b82f6]/10 flex items-center justify-center text-xl font-black text-[#bfdbfe] shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Trader Profile</p>
                <h2 className="mt-1 text-2xl font-bold text-[#f8fafc] truncate">{displayName}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#94a3b8]">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={13} />
                    {effectiveEmail}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={13} />
                    {authUser?.country || 'Country not set'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={13} />
                    {dobLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[27rem]">
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Plan</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc] capitalize">{plan}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Status</p>
                <p className="mt-1 text-[14px] font-bold text-[#86efac] capitalize">{accountStatus}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Security</p>
                <p className="mt-1 text-[14px] font-bold text-[#f8fafc]">
                  {twoFaEnabled ? '2FA enabled' : '2FA off'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-5">
          <div className="space-y-5">
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#64748b]">
                  <Crown size={14} className="text-[#fde68a]" />
                  Account Balance
                </div>
                <p className="mt-3 text-2xl font-bold text-[#f8fafc]">{formatCurrency(accountBalance)}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#64748b]">
                  <Target size={14} className="text-[#93c5fd]" />
                  Risk Per Trade
                </div>
                <p className="mt-3 text-2xl font-bold text-[#f8fafc]">{riskPerTradePct.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#64748b]">
                  <ShieldCheck size={14} className="text-[#fca5a5]" />
                  Daily Loss Cap
                </div>
                <p className="mt-3 text-2xl font-bold text-[#f8fafc]">{maxDailyLossPct.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#64748b]">
                  <Activity size={14} className="text-[#86efac]" />
                  Win Rate
                </div>
                <p className="mt-3 text-2xl font-bold text-[#f8fafc]">{journalStats.winRate}%</p>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Trading Snapshot</p>
                  <h2 className="mt-2 text-xl font-bold text-[#f8fafc]">Current operating profile</h2>
                </div>
                <span className="h-8 px-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[11px] font-semibold text-[#cbd5e1] inline-flex items-center justify-center w-fit">
                  {plan === 'pro' ? `${activeStrategies.length} active strategies` : '1 active strategy'}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Strategy Stack</p>
                  <p className="mt-2 text-[14px] font-semibold text-[#e5e7eb]">
                    {activeStrategies.length > 0 ? activeStrategies.join(', ') : 'No strategy selected'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Experience</p>
                  <p className="mt-2 text-[14px] font-semibold text-[#e5e7eb]">{formatLabel(experienceLevel)}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Markets</p>
                  <p className="mt-2 text-[14px] font-semibold text-[#e5e7eb]">{instrumentsText}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Display name</p>
                  <p className="mt-2 text-[14px] font-semibold text-[#e5e7eb]">{authUser?.displayName || 'Not set'}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Latest Journal Event</p>
                  <p className="mt-2 text-[14px] font-semibold text-[#e5e7eb]">
                    {journalStats.latest
                      ? `${journalStats.latest.symbol} - ${journalStats.latest.outcome}`
                      : 'No trades logged'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Identity</p>
                <h2 className="mt-2 text-xl font-bold text-[#f8fafc]">Personal information</h2>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-[12px] text-[#94a3b8] sm:col-span-2">
                  Full name
                  <input
                    value={form.fullName}
                    onChange={(event) => updateField('fullName', event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
                <label className="text-[12px] text-[#94a3b8] sm:col-span-2">
                  Display name
                  <input
                    value={form.displayName}
                    onChange={(event) => updateField('displayName', event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
                <label className="text-[12px] text-[#94a3b8]">
                  Date of birth
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(event) => updateField('dob', event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
                <label className="text-[12px] text-[#94a3b8]">
                  Country
                  <input
                    value={form.country}
                    onChange={(event) => updateField('country', event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
                <label className="text-[12px] text-[#94a3b8] sm:col-span-2">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    readOnly
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-[#94a3b8] outline-none cursor-not-allowed"
                  />
                  <span className="mt-1 block text-[10px] text-[#64748b]">Managed by sign-in email</span>
                </label>
                <label className="text-[12px] text-[#94a3b8] sm:col-span-2">
                  Bio
                  <textarea
                    value={form.bio}
                    onChange={(event) => updateField('bio', event.target.value)}
                    className="mt-1.5 min-h-24 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 py-2 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
              </div>

              <button
                onClick={saveProfile}
                className="mt-5 h-10 px-4 rounded-lg bg-white text-[#111827] text-[12px] font-semibold hover:bg-[#e5e7eb] transition-colors"
              >
                Save profile changes
              </button>
              <p className="mt-3 text-[11px] text-[#64748b] leading-relaxed">
                This information is synced with Firestore and reused across onboarding, dashboard identity, and the backend profile endpoint.
              </p>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#93c5fd]" />
                <p className="text-[13px] font-semibold">Performance Context</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Logged</p>
                  <p className="mt-2 text-2xl font-bold">{journalStats.total}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Wins</p>
                  <p className="mt-2 text-2xl font-bold text-[#86efac]">{journalStats.wins}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Losses</p>
                  <p className="mt-2 text-2xl font-bold text-[#fca5a5]">{journalStats.losses}</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Win Rate</p>
                  <p className="mt-2 text-2xl font-bold">{journalStats.winRate}%</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-[#93c5fd]" />
                <p className="text-[13px] font-semibold">Account Security</p>
              </div>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                Keep account access protected before broker execution features arrive.
              </p>

              <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <BadgeCheck size={16} className={twoFaEnabled ? 'text-[#86efac]' : 'text-[#64748b]'} />
                    <div>
                      <p className="text-[12px] font-semibold">Two-factor authentication</p>
                      <p className="mt-1 text-[11px] text-[#94a3b8]">Authenticator app verification on login.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTwoFaEnabled(!twoFaEnabled)}
                    className={`h-8 px-3 rounded-lg text-[11px] font-semibold transition-colors ${
                      twoFaEnabled ? 'bg-[#14532d] text-[#bbf7d0]' : 'bg-[#1e293b] text-[#cbd5e1]'
                    }`}
                  >
                    {twoFaEnabled ? 'Enabled' : 'Enable'}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-[#cbd5e1]" />
                <p className="text-[13px] font-semibold">Change Password</p>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-[12px] text-[#94a3b8]">
                  Current password
                  <input
                    type="password"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
                <label className="block text-[12px] text-[#94a3b8]">
                  New password
                  <input
                    type="password"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
                <label className="block text-[12px] text-[#94a3b8]">
                  Confirm new password
                  <input
                    type="password"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px] text-white outline-none focus:border-[#3b82f6]/50"
                  />
                </label>
              </div>

              <button className="mt-4 h-10 px-4 rounded-lg border border-white/[0.18] text-[12px] font-semibold text-[#e2e8f0] hover:bg-white/[0.05] transition-colors">
                Update password
              </button>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <div className="flex items-center gap-2">
                <UserRound size={15} className="text-[#cbd5e1]" />
                <p className="text-[13px] font-semibold">Contact Summary</p>
              </div>
              <div className="mt-4 space-y-3 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8] inline-flex items-center gap-2">
                    <Mail size={13} />
                    Email
                  </span>
                  <span className="text-[#e5e7eb] text-right">{effectiveEmail}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8] inline-flex items-center gap-2">
                    <MapPin size={13} />
                    Country
                  </span>
                  <span className="text-[#e5e7eb] text-right">{authUser?.country || 'Not set'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8] inline-flex items-center gap-2">
                    <CalendarClock size={13} />
                    Joined
                  </span>
                  <span className="text-[#e5e7eb] text-right">Pilot phase</span>
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
