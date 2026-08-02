import React from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, ArrowLeft, Check, TrendingUp, BarChart2, Layers, Zap, ShieldCheck } from 'lucide-react'
import { useOnboardingStore, ONBOARDING_STRATEGIES } from '@/stores/useOnboardingStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { ExperienceLevel, Instrument, OnboardingStrategyId } from '@/stores/useOnboardingStore'

// ─── Step dot indicator ───────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="transition-all duration-300"
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            borderRadius: 9999,
            background:
              i < current
                ? '#3b82f6'
                : i === current
                ? '#ffffff'
                : '#1e293b',
          }}
        />
      ))}
    </div>
  )
}

// ─── Shared nav buttons ───────────────────────────────────────────────────────
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
    <div className="flex items-center justify-between pt-6 mt-2 border-t border-white/[0.05]">
      <div className="flex items-center gap-3">
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] text-[#6b7280] hover:text-white rounded-xl hover:bg-white/[0.05] transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-[12px] text-[#4b5563] hover:text-[#6b7280] transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-xl transition-colors"
      >
        {nextLabel}
        <ArrowRight size={14} />
      </button>
    </div>
  )
}

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-[#3b82f6]/20 blur-xl" />
          <img src="/TRAXO-icon.png" className="relative w-14 h-14 object-contain" alt="" />
        </div>
        <span className="text-[11px] font-black tracking-[0.22em] uppercase text-white">TRAXO</span>
      </div>

      {/* Headline */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] text-[10px] font-semibold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
          Phase 1 — Analyst Mode is Live
        </div>
        <h1 className="text-[2rem] font-extrabold text-white tracking-tight leading-tight">
          Welcome to TRAXO.
        </h1>
        <p className="text-[14px] text-[#4b5563] leading-relaxed max-w-sm mx-auto">
          Institutional-grade trading signals, live 24/7. Every alert includes entry, stop-loss, take-profit, and the exact reasoning behind the call.
        </p>
      </div>

      {/* Feature pills */}
      <div className="grid grid-cols-1 gap-3">
        {[
          { icon: <Layers size={15} />, label: '5 proven strategies', sub: 'Running simultaneously, around the clock' },
          { icon: <TrendingUp size={15} />, label: 'Entry · SL · TP on every signal', sub: 'Precision levels, not vague calls' },
          { icon: <Zap size={15} />, label: 'Full signal reasoning', sub: 'Know exactly why each signal fired' },
        ].map(({ icon, label, sub }) => (
          <div
            key={label}
            className="flex items-start gap-4 px-4 py-3.5 rounded-xl bg-[#0d1117] border border-white/[0.06]"
          >
            <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6] shrink-0">
              {icon}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white">{label}</div>
              <div className="text-[11px] text-[#4b5563] mt-0.5">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full h-12 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
      >
        Let's get started
        <ArrowRight size={15} />
      </button>
    </div>
  )
}

// ─── Step 1: Trading Profile ──────────────────────────────────────────────────
const LEVELS: { id: ExperienceLevel; label: string; sub: string }[] = [
  { id: 'beginner',     label: 'Beginner',     sub: 'Still learning how markets work' },
  { id: 'intermediate', label: 'Intermediate', sub: 'Trading for 1–3 years, building consistency' },
  { id: 'pro',          label: 'Pro',          sub: '3+ years, full-time or semi-professional' },
]

const INSTRUMENTS: { id: Instrument; label: string }[] = [
  { id: 'forex',       label: 'Forex'       },
  { id: 'crypto',      label: 'Crypto'      },
  { id: 'stocks',      label: 'Stocks'      },
  { id: 'commodities', label: 'Commodities' },
]

function StepProfile({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { experienceLevel, instruments, setExperienceLevel, toggleInstrument, nextStep } = useOnboardingStore()

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-[1.4rem] font-extrabold text-white tracking-tight">Your trading profile</h2>
        <p className="text-[13px] text-[#4b5563] mt-1">Help us tailor your experience.</p>
      </div>

      {/* Experience level */}
      <div className="space-y-3">
        <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider">
          Experience level
        </label>
        <div className="space-y-2">
          {LEVELS.map(({ id, label, sub }) => {
            const active = experienceLevel === id
            return (
              <button
                key={id}
                onClick={() => setExperienceLevel(id)}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left"
                style={{
                  background: active ? 'rgba(59,130,246,0.07)' : '#0d1117',
                  borderColor: active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                  style={{ borderColor: active ? '#3b82f6' : '#374151' }}
                >
                  {active && <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-white">{label}</div>
                  <div className="text-[11px] text-[#4b5563]">{sub}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Instruments */}
      <div className="space-y-3">
        <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider">
          What do you trade? <span className="normal-case font-normal">(select all)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENTS.map(({ id, label }) => {
            const active = instruments.includes(id)
            return (
              <button
                key={id}
                onClick={() => toggleInstrument(id)}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold border transition-all"
                style={{
                  background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                  borderColor: active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
                  color: active ? '#93c5fd' : '#4b5563',
                }}
              >
                {label}
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

// ─── Step 2: Activate Strategies ─────────────────────────────────────────────
function StepStrategies({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { selectedStrategyId, setSelectedStrategy, nextStep } = useOnboardingStore()
  const selectedStrategy = ONBOARDING_STRATEGIES.find((s) => s.id === selectedStrategyId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[1.4rem] font-extrabold text-white tracking-tight">Choose your strategy</h2>
        <p className="text-[13px] text-[#4b5563] mt-1">You can run one strategy at a time in Analyst Mode.</p>
      </div>

      <div className="space-y-2">
        {ONBOARDING_STRATEGIES.map((s) => {
          const active = selectedStrategyId === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSelectedStrategy(s.id as OnboardingStrategyId)}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left"
              style={{
                background: active ? 'rgba(34,197,94,0.04)' : '#0d1117',
                borderColor: active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                style={{ borderColor: active ? '#22c55e' : '#374151' }}
              >
                {active && <div className="w-2 h-2 rounded-full bg-[#22c55e]" />}
              </div>

              {/* Name */}
              <span
                className="flex-1 text-[13px] font-semibold transition-colors"
                style={{ color: active ? '#e5e7eb' : '#374151' }}
              >
                {s.name}
              </span>

              {/* Win rate */}
              <span
                className="text-[12px] font-bold tabular-nums font-mono transition-colors"
                style={{ color: active ? '#22c55e' : '#374151' }}
              >
                {s.winRate}
              </span>

              <span
                className="text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0"
                style={{
                  color: active ? '#22c55e' : '#4b5563',
                  borderColor: active ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)',
                  background: active ? 'rgba(34,197,94,0.08)' : 'transparent',
                }}
              >
                {active ? 'Selected' : 'Pick'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Footer summary */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0b0f17] border border-white/[0.05]">
        <span className="text-[12px] text-[#4b5563]">
          Strategy locked in:
        </span>
        <span className="text-[12px] text-white font-semibold">
          {selectedStrategy?.name ?? 'Wick Rejection'}
        </span>
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={nextStep}
      />
    </div>
  )
}

// ─── Step 2: Personal info ───────────────────────────────────────────────────
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
      setError('Please enter your full name, date of birth, and country before continuing.')
      return
    }
    if (!validateAge(dob)) {
      setError('You must be at least 18 years old to continue.')
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
      setError('We could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[1.4rem] font-extrabold text-white tracking-tight">Tell us about you</h2>
        <p className="text-[13px] text-[#4b5563] mt-1">This helps personalize your TRAXO workspace.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-white" />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-white" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-white" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">Country</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-white" />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">Bio (optional)</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0d1117] border border-white/[0.08] text-white" rows={3} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#ef4444]/25 bg-[#450a0a]/40 px-4 py-3 text-[12px] text-[#fecaca]">
          {error}
        </div>
      )}

      <NavRow onBack={onBack} onNext={handleNext} nextDisabled={saving || !isValid} nextLabel={saving ? 'Saving…' : 'Continue'} />
    </div>
  )
}

// ─── Step 3: Risk Parameters ──────────────────────────────────────────────────
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
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#6b7280]">{label}</span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
          {display}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[#1e293b]">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 shadow-md pointer-events-none transition-all"
          style={{ left: `calc(${pct}% - 8px)`, borderColor: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[#2d3748]">
        <span>{min}{label.includes('trades') ? '' : '%'}</span>
        <span>{max}{label.includes('trades') ? '' : '%'}</span>
      </div>
    </div>
  )
}

function StepRisk({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const {
    riskPerTrade, maxDailyLoss, maxOpenTrades,
    setRiskPerTrade, setMaxDailyLoss, setMaxOpenTrades,
    nextStep,
  } = useOnboardingStore()

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-[1.4rem] font-extrabold text-white tracking-tight">Risk parameters</h2>
        <p className="text-[13px] text-[#4b5563] mt-1">Used to calculate position sizes in signal briefings.</p>
      </div>

      <div className="space-y-6 p-5 rounded-2xl bg-[#0d1117] border border-white/[0.06]">
        <RiskSlider
          label="Risk per trade"
          value={riskPerTrade}
          min={0.5} max={3} step={0.1}
          display={`${riskPerTrade.toFixed(1)}%`}
          onChange={setRiskPerTrade}
          color="#3b82f6"
        />
        <RiskSlider
          label="Max daily loss"
          value={maxDailyLoss}
          min={1} max={5} step={0.1}
          display={`${maxDailyLoss.toFixed(1)}%`}
          onChange={setMaxDailyLoss}
          color="#f59e0b"
        />
        <RiskSlider
          label="Max open trades"
          value={maxOpenTrades}
          min={1} max={10} step={1}
          display={`${maxOpenTrades}`}
          onChange={setMaxOpenTrades}
          color="#3b82f6"
        />
      </div>

      {/* Educational note */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-[#3b82f6]/[0.05] border border-[#3b82f6]/15">
        <ShieldCheck size={14} className="text-[#3b82f6] shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#4b5563] leading-relaxed">
          These are reference values for signal briefings only. In Phase 1, TRAXO does not execute trades — you remain in full control.
        </p>
      </div>

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={nextStep}
      />
    </div>
  )
}

// ─── Step 4: Complete ─────────────────────────────────────────────────────────
function StepComplete() {
  const navigate = useNavigate()
  const { selectedStrategyId, riskPerTrade, experienceLevel } = useOnboardingStore()
  const { setOnboardingComplete } = useAuthStore()

  function handleGo() {
    setOnboardingComplete(true)
    navigate('/dashboard')
  }

  const levelLabel = experienceLevel
    ? { beginner: 'Beginner', intermediate: 'Intermediate', pro: 'Pro' }[experienceLevel]
    : 'Not set'

  const strategyLabel = ONBOARDING_STRATEGIES.find((s) => s.id === selectedStrategyId)?.name ?? 'Wick Rejection'

  return (
    <div className="space-y-8 text-center">
      {/* Checkmark */}
      <div className="flex justify-center pt-4">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-[#22c55e]/15 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="relative w-20 h-20 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/30 flex items-center justify-center">
            <Check size={32} className="text-[#22c55e]" strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="space-y-2">
        <h2 className="text-[1.75rem] font-extrabold text-white tracking-tight">You're all set.</h2>
        <p className="text-[14px] text-[#4b5563]">Your TRAXO workspace is ready.</p>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl bg-[#0d1117] border border-white/[0.06] overflow-hidden text-left">
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-wider">Setup summary</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {[
            { icon: <BarChart2 size={13} />, label: 'Selected strategy', value: strategyLabel },
            { icon: <ShieldCheck size={13} />, label: 'Risk per trade', value: `${riskPerTrade.toFixed(1)}%` },
            { icon: <TrendingUp size={13} />, label: 'Experience level', value: levelLabel },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2.5 text-[#4b5563]">
                {icon}
                <span className="text-[12px]">{label}</span>
              </div>
              <span className="text-[13px] font-semibold text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <p className="text-[11px] text-[#2d3748]">
        You can update all settings anytime from the Settings page.
      </p>

      {/* CTA */}
      <button
        onClick={handleGo}
        className="w-full h-12 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[14px] font-bold flex items-center justify-center gap-2 transition-colors"
      >
        Go to dashboard
        <ArrowRight size={15} />
      </button>
    </div>
  )
}

// ─── Main Onboarding page ─────────────────────────────────────────────────────
const TOTAL_STEPS = 6

export default function Onboarding() {
  const { step, nextStep, prevStep } = useOnboardingStore()

  return (
    <div className="min-h-screen bg-[#070709] flex flex-col items-center px-4 py-10 sm:py-16">
      {/* Step indicator */}
      <div className="w-full max-w-lg flex items-center justify-between mb-10">
        <div className="flex items-center gap-2">
          <img src="/TRAXO-icon.png" className="w-6 h-6 object-contain" alt="" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-[#374151]">TRAXO</span>
        </div>
        <StepDots current={step} total={TOTAL_STEPS} />
        <span className="text-[11px] text-[#2d3748] tabular-nums w-16 text-right">
          {step < TOTAL_STEPS - 1 ? `${step + 1} of ${TOTAL_STEPS - 1}` : ''}
        </span>
      </div>

      {/* Step card */}
      <div className="w-full max-w-lg bg-[#09090d] border border-white/[0.06] rounded-2xl p-6 sm:p-8">
        {step === 0 && <StepWelcome onNext={nextStep} />}
        {step === 1 && <StepProfile onNext={nextStep} onBack={prevStep} />}
        {step === 2 && <StepPersonal onNext={nextStep} onBack={prevStep} />}
        {step === 3 && <StepStrategies onNext={nextStep} onBack={prevStep} />}
        {step === 4 && <StepRisk onNext={nextStep} onBack={prevStep} />}
        {step === 5 && <StepComplete />}
      </div>
    </div>
  )
}
