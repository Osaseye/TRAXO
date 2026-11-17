import React, { useId } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PiArrowRight,
  PiArrowLeft,
  PiCheck,
  PiChartLineUp,
  PiStack,
  PiLightning,
  PiShieldCheck,
} from 'react-icons/pi'
import { useOnboardingStore, ONBOARDING_STRATEGIES } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { ExperienceLevel, Instrument, OnboardingStrategyId } from '@/stores/useOnboardingStore'
import { cn } from '@/lib/utils'

// ─── Minimalist Stepper Header ──────────────────────────────────────────────
function StepperHeader({ current, total }: { current: number; total: number }) {
  const steps = [
    'Welcome',
    'Trading Profile',
    'Operator Identity',
    'Engine Matrix',
    'Risk Guardrails',
    'Station Ready',
  ]

  return (
    <div className="w-full max-w-2xl mx-auto flex items-center justify-between pb-6 mb-8 border-b border-white/[0.06]">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center">
          <img src="/brand/traxo-mark.png" className="w-4 h-4 object-contain" alt="TRAXO" />
        </div>
        <div>
          <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-[#FAFAFA]">
            TRAXO SETUP
          </span>
          <span className="hidden sm:inline-block text-[11px] font-mono text-[#71717A] ml-2">
            · {steps[current] ?? 'Configuration'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i === current
                  ? 'w-6 bg-[#34D399]'
                  : i < current
                  ? 'w-2 bg-white/40'
                  : 'w-2 bg-white/10'
              )}
            />
          ))}
        </div>
        <span className="text-[11px] font-mono text-[#71717A] ml-2 tabular-nums">
          0{current + 1} / 0{total}
        </span>
      </div>
    </div>
  )
}

// ─── Shared Open-Canvas Nav Row ──────────────────────────────────────────────
function NavRow({
  onBack,
  onNext,
  onSkip,
  nextLabel = 'Continue',
  nextDisabled = false,
  showBack = true,
}: {
  onBack?: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  showBack?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-8 mt-8 border-t border-white/[0.06]">
      <div className="flex items-center gap-3">
        {showBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 h-10 px-4 text-[12.5px] font-mono text-[#A1A1AA] hover:text-[#FAFAFA] rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <PiArrowLeft size={14} />
            BACK
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="h-10 px-3 text-[11px] font-mono text-[#71717A] hover:text-[#A1A1AA] transition-colors cursor-pointer"
          >
            SKIP SETUP
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center justify-center gap-2 h-11 px-6 bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-[#09090B] text-[13px] font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.08)] cursor-pointer"
      >
        <span>{nextLabel}</span>
        <PiArrowRight size={15} />
      </button>
    </div>
  )
}

// ─── Step 0: Welcome ────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-9 text-center max-w-xl mx-auto">
      {/* Floating Mark with Ambient Ring */}
      <div className="relative inline-block mx-auto pt-4">
        <div className="absolute inset-0 rounded-full bg-[#34D399]/20 blur-2xl animate-pulse" />
        <div className="relative w-20 h-20 rounded-2xl bg-white/[0.04] border border-white/[0.1] flex items-center justify-center mx-auto shadow-2xl">
          <img src="/brand/traxo-mark.png" className="w-12 h-12 object-contain" alt="TRAXO" />
        </div>
      </div>

      {/* Typography directly on canvas */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-[#A1A1AA]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
          <span>INSTITUTIONAL QUANT SUITE</span>
        </div>
        <h1 className="text-[32px] sm:text-[38px] font-bold text-[#FAFAFA] tracking-tight leading-tight">
          Welcome to the Terminal.
        </h1>
        <p className="text-[14px] text-[#A1A1AA] leading-relaxed max-w-md mx-auto">
          Every alert is computed with mathematically proven confluence, exact entry, stop-loss, take-profit, and structural institutional reasoning.
        </p>
      </div>

      {/* Feature telemetry rows - open architecture, not boxed cards */}
      <div className="grid grid-cols-1 divide-y divide-white/[0.06] text-left pt-2 border-y border-white/[0.06]">
        {[
          {
            icon: <PiStack size={18} className="text-[#34D399]" />,
            label: '5 Concurrency Engines Unlocked',
            sub: 'Wick Rejection, Breakout, Order Block, Supply & Demand, and Trend Following running 24/7.',
          },
          {
            icon: <PiChartLineUp size={18} className="text-[#34D399]" />,
            label: 'Precision Entry · SL · TP Geometry',
            sub: 'Sub-pip limit orders and strict risk-reward framing calculated per setup.',
          },
          {
            icon: <PiLightning size={18} className="text-[#34D399]" />,
            label: 'Full Structural Invalidation Rationale',
            sub: 'Instant audit trail detailing liquidity sweeps, order blocks, and session timing.',
          },
        ].map(({ icon, label, sub }, idx) => (
          <div key={idx} className="flex items-start gap-4 py-4 group">
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div>
              <div className="text-[13.5px] font-semibold text-[#FAFAFA]">{label}</div>
              <div className="text-[12.5px] text-[#71717A] mt-0.5 leading-relaxed">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full h-12 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13.5px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(255,255,255,0.1)] cursor-pointer"
      >
        <span>Configure Station Parameters</span>
        <PiArrowRight size={16} />
      </button>
    </div>
  )
}

// ─── Step 1: Trading Profile ────────────────────────────────────────────────
const LEVELS: { id: ExperienceLevel; label: string; sub: string }[] = [
  { id: 'beginner', label: 'Developing Operator', sub: 'Building foundational market mechanics and disciplined execution' },
  { id: 'intermediate', label: 'Prop / Consistent Trader', sub: '1–3 years active, executing structural setups across sessions' },
  { id: 'pro', label: 'Institutional / Quantitative', sub: '3+ years full-time, executing multi-asset order flow & liquidity sweeps' },
]

const INSTRUMENTS: { id: Instrument; label: string; tick: string }[] = [
  { id: 'forex', label: 'Forex Majors & Crosses', tick: 'EUR/USD · GBP/USD · USD/JPY' },
  { id: 'commodities', label: 'Precious Metals & Oil', tick: 'XAU/USD Gold · XAG/USD · WTI' },
  { id: 'crypto', label: 'Crypto Assets', tick: 'BTC/USD · ETH/USD · SOL/USD' },
  { id: 'stocks', label: 'Indices & Equities', tick: 'NAS100 · US30 · SPX500' },
]

function StepProfile({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { experienceLevel, instruments, setExperienceLevel, toggleInstrument, nextStep } = useOnboardingStore()

  return (
    <div className="space-y-8 max-w-xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.04] text-[10.5px] font-mono text-[#34D399] mb-2">
          <span>STAGE 01</span>
        </div>
        <h2 className="text-[24px] sm:text-[28px] font-semibold text-[#FAFAFA] tracking-tight">
          Select your trading perimeter
        </h2>
        <p className="text-[13px] text-[#71717A] mt-1">
          Signals and adaptive risk scoring calibrate directly to your operational experience.
        </p>
      </div>

      {/* Experience Level Selector - unboxed open rows */}
      <div className="space-y-3">
        <label className="text-[11px] font-mono text-[#A1A1AA] uppercase tracking-wider block">
          Operational Tier
        </label>
        <div className="space-y-2">
          {LEVELS.map(({ id, label, sub }) => {
            const active = experienceLevel === id
            return (
              <button
                type="button"
                key={id}
                onClick={() => setExperienceLevel(id)}
                className={cn(
                  'w-full flex items-start gap-3.5 p-3.5 rounded-xl border transition-all text-left cursor-pointer',
                  active
                    ? 'bg-white/[0.06] border-[#34D399]/50 shadow-[0_0_15px_rgba(52,211,153,0.08)]'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    active ? 'border-[#34D399] bg-[#34D399]/20' : 'border-[#52525B]'
                  )}
                >
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#FAFAFA]">{label}</div>
                  <div className="text-[12px] text-[#71717A] mt-0.5 leading-relaxed">{sub}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Market Instruments Selector */}
      <div className="space-y-3">
        <label className="text-[11px] font-mono text-[#A1A1AA] uppercase tracking-wider block">
          Active Asset Watchlists <span className="text-[#71717A] normal-case">(multi-select)</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {INSTRUMENTS.map(({ id, label, tick }) => {
            const active = instruments.includes(id)
            return (
              <button
                type="button"
                key={id}
                onClick={() => toggleInstrument(id)}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all cursor-pointer',
                  active
                    ? 'bg-white/[0.08] border-[#34D399]/60 text-[#FAFAFA]'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.14] text-[#A1A1AA]'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">{label}</span>
                  <div
                    className={cn(
                      'w-3.5 h-3.5 rounded-full border flex items-center justify-center',
                      active ? 'border-[#34D399] bg-[#34D399]' : 'border-white/20'
                    )}
                  >
                    {active && <PiCheck size={10} className="text-[#09090B]" />}
                  </div>
                </div>
                <div className="text-[10.5px] font-mono text-[#71717A] mt-1">{tick}</div>
              </button>
            )
          })}
        </div>
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={nextStep}
        nextDisabled={!experienceLevel || instruments.length === 0}
      />
    </div>
  )
}

// ─── Step 2: Operator Identity ──────────────────────────────────────────────
function StepPersonal({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const auth = useAuthStore()
  const current = auth.user
  const [fullName, setFullName] = React.useState(current?.fullName ?? '')
  const [displayName, setDisplayName] = React.useState(current?.displayName ?? '')
  const [dob, setDob] = React.useState(current?.dob ?? '')
  const [country, setCountry] = React.useState(current?.country ?? '')
  const [bio, setBio] = React.useState(current?.bio ?? '')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fullNameId = useId()
  const displayNameId = useId()
  const dobId = useId()
  const countryId = useId()
  const bioId = useId()

  const trimmedFullName = fullName.trim()
  const trimmedDisplayName = displayName.trim()
  const trimmedCountry = country.trim()
  const trimmedBio = bio.trim()
  const isValid = trimmedFullName.length >= 2 && trimmedCountry.length >= 2 && dob.length > 0

  function validateAge(value: string) {
    if (!value) return false
    const birthDate = new Date(value)
    if (Number.isNaN(birthDate.getTime())) return false
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age >= 18
  }

  async function handleNext() {
    if (!isValid) {
      setError('Please provide full name, date of birth, and country of operation.')
      return
    }
    if (!validateAge(dob)) {
      setError('You must be at least 18 years old to operate this terminal.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await auth.updateProfile({
        fullName: trimmedFullName,
        displayName: trimmedDisplayName || trimmedFullName,
        dob,
        country: trimmedCountry,
        bio: trimmedBio,
      })
      onNext()
    } catch (err) {
      console.error(err)
      setError('Failed to record operator details. Please re-verify fields.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-7 max-w-xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.04] text-[10.5px] font-mono text-[#34D399] mb-2">
          <span>STAGE 02</span>
        </div>
        <h2 className="text-[24px] sm:text-[28px] font-semibold text-[#FAFAFA] tracking-tight">
          Operator credentials
        </h2>
        <p className="text-[13px] text-[#71717A] mt-1">
          Identity used on journal sign-offs, trade ledgers, and MT5 terminal reports.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={fullNameId} className="text-[11px] font-mono text-[#71717A] uppercase tracking-wider block">
              Full Legal Name
            </label>
            <input
              id={fullNameId}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alex Vance"
              className="w-full h-11 px-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={displayNameId} className="text-[11px] font-mono text-[#71717A] uppercase tracking-wider block">
              Callsign / Display Handle
            </label>
            <input
              id={displayNameId}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Vance_FX"
              className="w-full h-11 px-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={dobId} className="text-[11px] font-mono text-[#71717A] uppercase tracking-wider block">
              Date of Birth
            </label>
            <input
              id={dobId}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 text-[13px] text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={countryId} className="text-[11px] font-mono text-[#71717A] uppercase tracking-wider block">
              Base Country / Jurisdiction
            </label>
            <input
              id={countryId}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="United Kingdom"
              className="w-full h-11 px-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={bioId} className="text-[11px] font-mono text-[#71717A] uppercase tracking-wider block">
            Session Focus Notes <span className="normal-case text-white/30">(optional)</span>
          </label>
          <textarea
            id={bioId}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Focusing on London open liquidity sweeps and New York continuation setups."
            rows={2}
            className="w-full p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#F87171]/25 bg-[#F87171]/10 px-4 py-2.5 text-[12px] text-[#F87171] font-mono">
          {error}
        </div>
      )}

      <NavRow
        onBack={onBack}
        onNext={handleNext}
        nextDisabled={saving || !isValid}
        nextLabel={saving ? 'RECORDING...' : 'CONTINUE'}
      />
    </div>
  )
}

// ─── Step 3: Engine Matrix (All 5 Active) ───────────────────────────────────
function StepStrategies({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { selectedStrategyIds, toggleSelectedStrategy, nextStep } = useOnboardingStore()

  return (
    <div className="space-y-7 max-w-xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.04] text-[10.5px] font-mono text-[#34D399] mb-2">
          <span>STAGE 03</span>
        </div>
        <h2 className="text-[24px] sm:text-[28px] font-semibold text-[#FAFAFA] tracking-tight">
          Activate algorithmic engines
        </h2>
        <p className="text-[13px] text-[#71717A] mt-1">
          All 5 quantitative models are fully calibrated. Toggle engines live for your terminal feed.
        </p>
      </div>

      {/* Engines List - open architecture rows */}
      <div className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
        {ONBOARDING_STRATEGIES.map((s) => {
          const active = selectedStrategyIds.includes(s.id as OnboardingStrategyId)
          return (
            <div
              key={s.id}
              className="flex items-center justify-between py-3.5 px-2 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0 transition-colors',
                    active ? 'bg-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-[#52525B]'
                  )}
                />
                <div>
                  <div className="text-[13.5px] font-semibold text-[#FAFAFA]">{s.name}</div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] font-mono text-[#71717A]">
                    <span className="text-[#34D399] font-medium">{s.winRate} Win Rate</span>
                    <span>·</span>
                    <span>~{s.signalsPerDay} setups/session</span>
                  </div>
                </div>
              </div>

              {/* Robust, non-clipped switch toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => toggleSelectedStrategy(s.id as OnboardingStrategyId)}
                className={cn(
                  'relative inline-flex items-center shrink-0 w-8 h-[18px] p-[2px] rounded-full transition-colors duration-200 focus:outline-none cursor-pointer',
                  active
                    ? 'bg-[#064E3B] border border-[#34D399]/40'
                    : 'bg-[#18181B] border border-white/10'
                )}
                title={active ? `Disable ${s.name}` : `Enable ${s.name}`}
              >
                <span
                  className={cn(
                    'w-3.5 h-3.5 rounded-full transition-transform duration-200 pointer-events-none block shadow-sm',
                    active
                      ? 'translate-x-[12px] bg-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                      : 'translate-x-0 bg-[#71717A]'
                  )}
                />
              </button>
            </div>
          )
        })}
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={nextStep}
        nextDisabled={selectedStrategyIds.length === 0}
        nextLabel="CONFIRM ENGINES"
      />
    </div>
  )
}

// ─── Step 4: Risk Guardrails (Fixed Slider Thumb Positioning) ────────────────
function RiskSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  color,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
  color: string
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[#A1A1AA] font-medium">{label}</span>
        <span className="font-mono font-bold tabular-nums text-[13px]" style={{ color }}>
          {display}
        </span>
      </div>

      {/* Bounded track wrapper: thumb cannot escape or clip */}
      <div className="relative h-6 flex items-center">
        <div className="w-full h-1.5 rounded-full bg-[#18181B] relative overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-75"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>

        {/* Real range input for native touch/keyboard accessibility */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
        />

        {/* Visual thumb bounded within 0%..100% */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#FAFAFA] border-2 shadow-md pointer-events-none transition-all duration-75"
          style={{
            left: `calc(${pct}% * (1 - 16px / 100%) + 0px)`,
            borderColor: color,
            boxShadow: `0 0 10px ${color}40`,
          }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-mono text-[#52525B]">
        <span>{min}{label.includes('trades') ? '' : '%'}</span>
        <span>{max}{label.includes('trades') ? '' : '%'}</span>
      </div>
    </div>
  )
}

function StepRisk({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const {
    riskPerTrade,
    maxDailyLoss,
    maxOpenTrades,
    setRiskPerTrade,
    setMaxDailyLoss,
    setMaxOpenTrades,
    nextStep,
  } = useOnboardingStore()

  return (
    <div className="space-y-7 max-w-xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.04] text-[10.5px] font-mono text-[#34D399] mb-2">
          <span>STAGE 04</span>
        </div>
        <h2 className="text-[24px] sm:text-[28px] font-semibold text-[#FAFAFA] tracking-tight">
          Risk & capital guardrails
        </h2>
        <p className="text-[13px] text-[#71717A] mt-1">
          Hard circuit breakers prevent catastrophic drawdowns and enforce prop firm guidelines.
        </p>
      </div>

      {/* Sliders Container sitting directly on canvas */}
      <div className="space-y-6 pt-2">
        <RiskSlider
          label="Risk per Trade"
          value={riskPerTrade}
          min={0.25}
          max={3}
          step={0.25}
          display={`${riskPerTrade}%`}
          onChange={setRiskPerTrade}
          color="#34D399"
        />

        <RiskSlider
          label="Daily Drawdown Circuit Breaker"
          value={maxDailyLoss}
          min={1}
          max={10}
          step={0.5}
          display={`${maxDailyLoss}%`}
          onChange={setMaxDailyLoss}
          color="#F87171"
        />

        <RiskSlider
          label="Max Concurrent Open Setups"
          value={maxOpenTrades}
          min={1}
          max={10}
          step={1}
          display={`${maxOpenTrades} positions`}
          onChange={setMaxOpenTrades}
          color="#FAFAFA"
        />
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={nextStep}
        nextLabel="DEPLOY GUARDRAILS"
      />
    </div>
  )
}

// ─── Step 5: Station Ready ──────────────────────────────────────────────────
function StepComplete() {
  const navigate = useNavigate()
  const { experienceLevel, selectedStrategyIds, riskPerTrade, maxDailyLoss } = useOnboardingStore()
  const setOnboardingComplete = useAuthStore((s) => s.setOnboardingComplete)

  const handleEnter = () => {
    setOnboardingComplete(true)
    navigate('/dashboard')
  }

  return (
    <div className="space-y-8 max-w-xl mx-auto text-center">
      {/* Ready Icon with Glowing Pulse */}
      <div className="relative inline-block mx-auto pt-3">
        <div className="absolute inset-0 rounded-full bg-[#34D399]/20 blur-xl animate-pulse" />
        <div className="relative w-16 h-16 rounded-full bg-[#34D399]/15 border border-[#34D399]/40 flex items-center justify-center text-[#34D399] mx-auto shadow-xl">
          <PiShieldCheck size={32} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wider text-[#34D399] uppercase">
          <span>STATION ONLINE · ALL SYSTEMS GO</span>
        </div>
        <h2 className="text-[28px] sm:text-[32px] font-semibold text-[#FAFAFA] tracking-tight">
          Terminal ready for live feed.
        </h2>
        <p className="text-[13px] text-[#71717A] max-w-md mx-auto">
          Your parameter matrix has been locked. Real-time candlestick tracking and MT5 bridge are standing by.
        </p>
      </div>

      {/* Summary telemetry list - open layout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-y border-white/[0.06] text-left">
        <div>
          <div className="text-[10px] font-mono uppercase text-[#71717A]">Experience</div>
          <div className="text-[13px] font-semibold text-[#FAFAFA] capitalize mt-0.5">
            {experienceLevel || 'Standard'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[#71717A]">Engines Active</div>
          <div className="text-[13px] font-mono font-semibold text-[#34D399] mt-0.5">
            {selectedStrategyIds.length} / 5 Running
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[#71717A]">Risk / Setup</div>
          <div className="text-[13px] font-mono font-semibold text-[#FAFAFA] mt-0.5">
            {riskPerTrade}%
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-[#71717A]">Max Drawdown</div>
          <div className="text-[13px] font-mono font-semibold text-[#F87171] mt-0.5">
            {maxDailyLoss}%
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleEnter}
        className="w-full h-12 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[14px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_28px_rgba(255,255,255,0.12)] cursor-pointer"
      >
        <span>Initialize Live Terminal</span>
        <PiArrowRight size={16} />
      </button>
    </div>
  )
}

// ─── Main Onboarding Root Component ─────────────────────────────────────────
const TOTAL_STEPS = 6

export default function Onboarding() {
  const { step, nextStep, prevStep } = useOnboardingStore()

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between p-5 sm:p-10 overflow-x-hidden select-none">
      {/* ── Ambient Background Canvas: Candlesticks & Micro-Ticks ───────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.02] to-transparent blur-3xl rounded-full" />

        {/* Ambient Candlestick vectors */}
        <svg
          className="absolute inset-0 w-full h-full opacity-15"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="35%" x2="100%" y2="35%" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />
          <line x1="0" y1="65%" x2="100%" y2="65%" stroke="rgba(52,211,153,0.12)" strokeDasharray="3 8" />
          <g className="animate-pulse" style={{ animationDuration: '6s' }}>
            <line x1="8%" y1="20%" x2="8%" y2="50%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(8% - 3px)" y="25%" width="6" height="15%" fill="#34D399" rx="1" opacity="0.4" />
            <line x1="92%" y1="40%" x2="92%" y2="70%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(92% - 3px)" y="48%" width="6" height="12%" fill="#34D399" rx="1" opacity="0.4" />
          </g>
        </svg>
      </div>

      {/* ── Top Stepper Navigation ──────────────────────────────────────────── */}
      <header className="relative z-10 w-full">
        <StepperHeader current={step} total={TOTAL_STEPS} />
      </header>

      {/* ── Center Open Canvas: Elements sit directly on screen (No Boxed Card) ─ */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center w-full py-4">
        <div className="w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {step === 0 && <StepWelcome onNext={nextStep} />}
              {step === 1 && <StepProfile onNext={nextStep} onBack={prevStep} />}
              {step === 2 && <StepPersonal onNext={nextStep} onBack={prevStep} />}
              {step === 3 && <StepStrategies onNext={nextStep} onBack={prevStep} />}
              {step === 4 && <StepRisk onNext={nextStep} onBack={prevStep} />}
              {step === 5 && <StepComplete />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Minimalist Bottom Telemetry ─────────────────────────────────────── */}
      <footer className="relative z-10 pt-6 text-center text-[11px] font-mono text-[#52525B]">
        <span>TRAXO ORCHESTRATOR v4.2 · ZERO-SLIPPAGE MT5 INTEGRATION PROTOCOL</span>
      </footer>
    </div>
  )
}
