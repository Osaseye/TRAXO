import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { sendPasswordResetEmail } from 'firebase/auth'
import {
  PiCalendarBlank,
  PiCheck,
  PiCheckCircle,
  PiCopy,
  PiEnvelopeSimple,
  PiFloppyDisk,
  PiKey,
  PiMapPin,
  PiGauge,
  PiSignOut,
  PiWarningCircle,
} from 'react-icons/pi'
import { auth } from '@/lib/firebase'
import {
  ONBOARDING_STRATEGIES,
  useOnboardingStore,
  type ExperienceLevel,
  type Instrument,
} from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useProfileStore } from '@/stores/useProfileStore'
import {
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
} from '@/stores/useTradingContextStore'
import { cn } from '@/lib/utils'

const SYMBOL_GROUPS: Array<{ label: string; symbols: ChartSymbol[] }> = [
  {
    label: 'Forex',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'],
  },
  {
    label: 'Metals',
    symbols: ['XAUUSD', 'XAGUSD'],
  },
  {
    label: 'Stocks',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI'],
  },
]

const TIMEFRAME_OPTIONS: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

const EXPERIENCE_LEVELS: Array<{ id: ExperienceLevel; label: string }> = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'pro', label: 'Advanced' },
]

const MARKET_INSTRUMENTS: Array<{ id: Instrument; label: string }> = [
  { id: 'forex', label: 'Forex' },
  { id: 'commodities', label: 'Metals & Commodities' },
  { id: 'stocks', label: 'US Equities' },
]

type ProfileSectionTab = 'all' | 'identity' | 'terminal' | 'security'

const PROFILE_MOBILE_TABS: Array<{ id: ProfileSectionTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'identity', label: 'Identity' },
  { id: 'terminal', label: 'Terminal Defaults' },
  { id: 'security', label: 'Security' },
]

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function getInitials(fullName: string, displayName: string) {
  const source = fullName.trim() || displayName || 'TX'
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function Profile() {
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const logout = useAuthStore((s) => s.logout)
  const authLoading = useAuthStore((s) => s.isLoading)

  const twoFaEnabled = useProfileStore((s) => s.twoFaEnabled)
  const setTwoFaEnabled = useProfileStore((s) => s.setTwoFaEnabled)

  const experienceLevel = useOnboardingStore((s) => s.experienceLevel)
  const setExperienceLevel = useOnboardingStore((s) => s.setExperienceLevel)
  const instruments = useOnboardingStore((s) => s.instruments)
  const toggleInstrument = useOnboardingStore((s) => s.toggleInstrument)
  const selectedStrategyId = useOnboardingStore((s) => s.selectedStrategyId)
  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)

  const accountBalance = useTradingContextStore((s) => s.accountBalance)
  const riskMode = useTradingContextStore((s) => s.riskMode)
  const fixedRiskAmount = useTradingContextStore((s) => s.fixedRiskAmount)
  const riskPerTradePct = useTradingContextStore((s) => s.riskPerTradePct)
  const maxDailyLossPct = useTradingContextStore((s) => s.maxDailyLossPct)
  const chartSymbol = useTradingContextStore((s) => s.chartSymbol)
  const setChartSymbol = useTradingContextStore((s) => s.setChartSymbol)
  const chartTimeframe = useTradingContextStore((s) => s.chartTimeframe)
  const setChartTimeframe = useTradingContextStore((s) => s.setChartTimeframe)
  const journal = useTradingContextStore((s) => s.journal)

  const fallbackEmail = authUser?.email ?? 'operator@traxo.local'
  const effectiveEmail = authUser?.email || fallbackEmail
  const operatorUid = authUser?.id || 'local-session'
  const displayName = authUser?.displayName || authUser?.fullName || 'TRAXO Operator'
  const dobLabel = authUser?.dob
    ? new Date(authUser.dob).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'DOB not set'

  const [savedSuccess, setSavedSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copiedUid, setCopiedUid] = useState(false)
  const [mobileTab, setMobileTab] = useState<ProfileSectionTab>('all')
  const [resetState, setResetState] = useState<{
    status: 'idle' | 'sending' | 'sent' | 'error'
    message?: string
  }>({
    status: 'idle',
  })

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
    const ids =
      selectedStrategyIds && selectedStrategyIds.length > 0
        ? selectedStrategyIds
        : [selectedStrategyId]
    return ids
      .map((id) => ONBOARDING_STRATEGIES.find((strategy) => strategy.id === id)?.name)
      .filter((name): name is NonNullable<typeof name> => Boolean(name))
  }, [selectedStrategyId, selectedStrategyIds])

  const journalStats = useMemo(() => {
    const settled = journal.filter(
      (entry) =>
        entry.outcome === 'win' || entry.outcome === 'loss' || entry.outcome === 'breakeven',
    )
    const wins = settled.filter((entry) => entry.outcome === 'win').length
    const losses = settled.filter((entry) => entry.outcome === 'loss').length
    const winRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0

    return {
      total: journal.length,
      wins,
      losses,
      winRate,
    }
  }, [journal])

  const initials = getInitials(authUser?.fullName ?? '', displayName)

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function saveProfile() {
    setSaveError(null)
    try {
      await updateProfile({
        fullName: form.fullName,
        displayName: form.displayName,
        dob: form.dob,
        country: form.country,
        bio: form.bio,
      })
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save profile changes.')
    }
  }

  async function handleCopyUid() {
    try {
      await navigator.clipboard.writeText(operatorUid)
      setCopiedUid(true)
      setTimeout(() => setCopiedUid(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }

  async function handlePasswordReset() {
    if (!authUser?.email) {
      setResetState({ status: 'error', message: 'No verified email attached to current session.' })
      return
    }
    setResetState({ status: 'sending' })
    try {
      await sendPasswordResetEmail(auth, authUser.email)
      setResetState({
        status: 'sent',
        message: `Password reset link sent to ${authUser.email}.`,
      })
    } catch (err) {
      setResetState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to send password reset email.',
      })
    }
  }

  async function handleLogout() {
    try {
      await logout()
      navigate('/login')
    } catch {
      navigate('/')
    }
  }

  const showSection = (section: Exclude<ProfileSectionTab, 'all'>) =>
    mobileTab === 'all' || mobileTab === section

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-[#71717A]">Operator Profile</p>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight break-words">
            {displayName}
          </h1>
          <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
            Personal operator identity, default chart configuration, and session security controls.
          </p>
        </div>

        {/* Operator Identity & Telemetry Card */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-5">
            <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#161619] flex items-center justify-center text-[16px] sm:text-[17px] font-semibold text-[#FAFAFA] shrink-0 font-mono">
                {initials}
              </div>

              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] sm:text-[16px] font-semibold text-[#FAFAFA] truncate">
                    {displayName}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#34D399]/10 text-[#34D399] text-[12px] font-medium shrink-0">
                    Session Active
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] sm:text-[13px] text-[#A1A1AA]">
                  <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                    <PiEnvelopeSimple className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                    <span className="truncate">{effectiveEmail}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <PiMapPin className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                    <span>{authUser?.country || 'Location unset'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <PiCalendarBlank className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                    <span>{dobLabel}</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="text-[12px] text-[#71717A]">UID</span>
                  <code className="px-2.5 py-1 sm:py-0.5 rounded-lg bg-[#161619] text-[12px] font-mono text-[#A1A1AA] truncate max-w-[165px] sm:max-w-[240px]">
                    {operatorUid}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyUid()}
                    className="inline-flex items-center gap-1 min-h-[34px] sm:min-h-0 px-2.5 py-1 sm:py-0.5 rounded-lg bg-[#18181B] hover:bg-[#222227] text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                    title="Copy UID"
                  >
                    {copiedUid ? (
                      <PiCheck className="h-3.5 w-3.5 text-[#34D399]" />
                    ) : (
                      <PiCopy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedUid ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => void handlePasswordReset()}
                disabled={resetState.status === 'sending'}
                className="min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <PiKey className="h-4 w-4 text-[#A1A1AA] shrink-0" />
                <span className="truncate">
                  {resetState.status === 'sending' ? 'Sending...' : 'Reset Password'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={authLoading}
                className="min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#F87171]/10 hover:bg-[#F87171]/15 text-[13px] font-medium text-[#F87171] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <PiSignOut className="h-4 w-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {resetState.status !== 'idle' && resetState.message && (
            <div
              className={cn(
                'px-4 sm:px-6 py-3 border-b border-white/[0.06] flex items-center gap-2 text-[13px]',
                resetState.status === 'sent'
                  ? 'bg-[#34D399]/[0.06] text-[#34D399]'
                  : 'bg-[#F87171]/[0.06] text-[#F87171]',
              )}
            >
              {resetState.status === 'sent' ? (
                <PiCheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <PiWarningCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{resetState.message}</span>
            </div>
          )}

          {/* Unboxed 4-Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <div className="p-4 sm:p-5 space-y-1 border-r border-b sm:border-b-0 border-white/[0.06]">
              <span className="text-[12px] text-[#71717A] block">Account Baseline</span>
              <span className="text-[17px] sm:text-[18px] font-semibold font-mono tabular-nums text-[#FAFAFA] block truncate">
                {formatCurrency(accountBalance)}
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-1 border-b sm:border-b-0 sm:border-r border-white/[0.06]">
              <span className="text-[12px] text-[#71717A] block">Risk Sizing</span>
              <span className="text-[17px] sm:text-[18px] font-semibold font-mono tabular-nums text-[#FAFAFA] block truncate">
                {riskMode === 'fixedAmount'
                  ? `${formatCurrency(fixedRiskAmount)}`
                  : `${riskPerTradePct.toFixed(1)}%`}
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-1 border-r border-white/[0.06]">
              <span className="text-[12px] text-[#71717A] block">Daily Loss Cap</span>
              <span className="text-[17px] sm:text-[18px] font-semibold font-mono tabular-nums text-[#F87171] block">
                {maxDailyLossPct.toFixed(1)}%
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-1">
              <span className="text-[12px] text-[#71717A] block">Journal Record</span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className={cn(
                    'text-[17px] sm:text-[18px] font-semibold font-mono tabular-nums',
                    journalStats.winRate >= 50 ? 'text-[#34D399]' : 'text-[#FAFAFA]',
                  )}
                >
                  {journalStats.winRate}%
                </span>
                <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                  {journalStats.wins}W/{journalStats.losses}L
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Horizontally Scrollable Section Pill Tabs */}
        <div className="md:hidden -mx-4 px-4 overflow-x-auto pb-1">
          <div
            role="tablist"
            aria-label="Profile sections"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#111113] border border-white/[0.07] p-1"
          >
            {PROFILE_MOBILE_TABS.map((tab) => {
              const active = mobileTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    'min-h-[44px] px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 1. Operator Identity (Linear Preference List) */}
        <section className={cn('space-y-3', !showSection('identity') && 'hidden md:block')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                Operator Identity
              </h2>
              <p className="text-[13px] text-[#71717A]">
                Personal profile metadata synchronized to Firestore operator records.
              </p>
            </div>
            {savedSuccess && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#34D399] shrink-0">
                <PiCheckCircle className="h-4 w-4" />
                <span>Saved</span>
              </span>
            )}
          </div>

          {saveError && (
            <div className="p-4 rounded-2xl border border-[#F87171]/30 bg-[#111113] text-[13px] text-[#F87171] flex items-center gap-2">
              <PiWarningCircle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Full Name</div>
                <div className="text-[13px] text-[#71717A]">
                  Your legal or primary desk operator name.
                </div>
              </div>
              <input
                value={form.fullName}
                onChange={(event) => updateField('fullName', event.target.value)}
                placeholder="Operator full name"
                className="w-full sm:w-64 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/[0.2]"
              />
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Display Handle</div>
                <div className="text-[13px] text-[#71717A]">
                  Short handle displayed across the header and admin sessions.
                </div>
              </div>
              <input
                value={form.displayName}
                onChange={(event) => updateField('displayName', event.target.value)}
                placeholder="Console handle"
                className="w-full sm:w-64 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/[0.2]"
              />
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Date of Birth</div>
                <div className="text-[13px] text-[#71717A]">
                  Optional account verification date.
                </div>
              </div>
              <input
                type="date"
                value={form.dob}
                onChange={(event) => updateField('dob', event.target.value)}
                className="w-full sm:w-64 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] outline-none focus:border-white/[0.2]"
              />
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Country / Desk TZ</div>
                <div className="text-[13px] text-[#71717A]">
                  Primary operating region for session alignment.
                </div>
              </div>
              <input
                value={form.country}
                onChange={(event) => updateField('country', event.target.value)}
                placeholder="e.g. Nigeria"
                className="w-full sm:w-64 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/[0.2]"
              />
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Email Address</div>
                <div className="text-[13px] text-[#71717A]">
                  Verified Firebase identity email (read-only).
                </div>
              </div>
              <input
                type="email"
                value={form.email}
                readOnly
                className="w-full sm:w-64 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#161619] border border-white/[0.05] text-[13px] text-[#71717A] outline-none cursor-not-allowed"
              />
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5 sm:max-w-xs">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Operating Desk Notes</div>
                <div className="text-[13px] text-[#71717A]">
                  Session focus, personal execution rules, or checklist reminders.
                </div>
              </div>
              <textarea
                rows={3}
                value={form.bio}
                onChange={(event) => updateField('bio', event.target.value)}
                placeholder="Session focus, execution rules, or desk notes..."
                className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/[0.2]"
              />
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <span className="text-[13px] text-[#71717A]">
                All 5 quantitative engines active in personal mode.
              </span>
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={authLoading}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <PiFloppyDisk className="h-4 w-4" />
                <span>Save Identity</span>
              </button>
            </div>
          </div>
        </section>

        {/* 2. Terminal Defaults */}
        <section className={cn('space-y-3', !showSection('terminal') && 'hidden md:block')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                Terminal Defaults
              </h2>
              <p className="text-[13px] text-[#71717A]">
                Startup symbol, chart timeframe, and watched asset classes.
              </p>
            </div>
            <Link
              to="/settings"
              className="text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors shrink-0"
            >
              Risk Deck →
            </Link>
          </div>

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            {/* Default Symbol */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Default Terminal Symbol</div>
                <div className="text-[13px] text-[#71717A]">
                  Initial instrument loaded when opening Terminal.
                </div>
              </div>
              <select
                value={chartSymbol}
                onChange={(e) => setChartSymbol(e.target.value as ChartSymbol)}
                aria-label="Default Terminal Symbol"
                className="w-full sm:w-56 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-medium text-[#FAFAFA] outline-none focus:border-white/[0.2]"
              >
                {SYMBOL_GROUPS.map((grp) => (
                  <optgroup key={grp.label} label={grp.label}>
                    {grp.symbols.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Default Timeframe */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Default Chart Timeframe</div>
                <div className="text-[13px] text-[#71717A]">
                  Primary candlestick interval for structure evaluation.
                </div>
              </div>
              <div className="grid grid-cols-6 sm:inline-flex items-center rounded-xl bg-[#18181B] p-1 w-full sm:w-auto">
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setChartTimeframe(tf)}
                    className={cn(
                      'min-h-[40px] sm:min-h-0 px-2 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                      chartTimeframe === tf
                        ? 'bg-[#FAFAFA] text-[#09090B]'
                        : 'text-[#A1A1AA] hover:text-[#FAFAFA]',
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Execution Tier */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Experience Profile</div>
                <div className="text-[13px] text-[#71717A]">
                  Tailors setup commentary density in strategy panels.
                </div>
              </div>
              <div className="grid grid-cols-3 sm:inline-flex items-center rounded-xl bg-[#18181B] p-1 w-full sm:w-auto">
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setExperienceLevel(lvl.id)}
                    className={cn(
                      'min-h-[40px] sm:min-h-0 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                      experienceLevel === lvl.id
                        ? 'bg-[#FAFAFA] text-[#09090B]'
                        : 'text-[#A1A1AA] hover:text-[#FAFAFA]',
                    )}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Watched Asset Classes */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Watched Asset Classes</div>
                <div className="text-[13px] text-[#71717A]">
                  Markets prioritized during workspace scans.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {MARKET_INSTRUMENTS.map((inst) => {
                  const active = instruments.includes(inst.id)
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => toggleInstrument(inst.id)}
                      className={cn(
                        'min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-xl text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-[#FAFAFA] text-[#09090B]'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {inst.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Active Strategy Engines Summary */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Active Engines ({activeStrategies.length})
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Strategies enabled for live signal scanning.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeStrategies.map((name) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 rounded-lg bg-[#161619] text-[12px] text-[#FAFAFA]"
                  >
                    {name}
                  </span>
                ))}
                <Link
                  to="/strategies"
                  className="text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] ml-1"
                >
                  Manage →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Security & Session */}
        <section className={cn('space-y-3', !showSection('security') && 'hidden md:block')}>
          <div>
            <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              Security &amp; Session
            </h2>
            <p className="text-[13px] text-[#71717A]">
              Session verification and authentication provider settings.
            </p>
          </div>

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Two-Factor Authentication (2FA)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Require verification challenge on new terminal sessions.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTwoFaEnabled(!twoFaEnabled)}
                className={cn(
                  'w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3.5 sm:py-1.5 rounded-xl text-[13px] font-medium shrink-0 transition-colors',
                  twoFaEnabled
                    ? 'bg-[#34D399]/15 text-[#34D399]'
                    : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                )}
              >
                {twoFaEnabled ? 'Enabled' : 'Enable 2FA'}
              </button>
            </div>

            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
              <div className="flex items-center gap-2.5 text-[14px] font-medium text-[#FAFAFA]">
                <PiGauge className="h-4 w-4 text-[#71717A]" />
                <span>Authentication Provider</span>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 text-[13px] text-[#71717A]">
                <span>Firebase Identity</span>
                <Link
                  to="/notifications?tab=telemetry"
                  className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                >
                  Engine Health →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
