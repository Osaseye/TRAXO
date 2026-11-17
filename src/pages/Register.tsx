import { useState, useId } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  PiEye,
  PiEyeSlash,
  PiArrowRight,
  PiLockKey,
  PiEnvelopeSimple,
  PiUser,
  PiShieldCheck,
} from 'react-icons/pi'
import { useAuthStore } from '@/stores/useAuthStore'
import { getFirebaseErrorMessage } from '@/lib/utils'

function calcStrength(pw: string): number {
  if (pw.length < 6) return pw.length > 0 ? 1 : 0
  let score = 1
  if (pw.length >= 10) score++
  if (/[^a-zA-Z0-9]/.test(pw) || /[0-9]/.test(pw)) score++
  return Math.min(score, 3)
}

function strengthColor(s: number) {
  return ['', '#F87171', '#FBBF24', '#34D399'][s] || '#27272A'
}

function strengthLabel(s: number) {
  return ['', 'Basic', 'Moderate', 'Strong'][s] || ''
}

export default function Register() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const emailId = useId()
  const passwordId = useId()
  const termsId = useId()
  const signUp = useAuthStore((s) => s.signUp)
  const isLoading = useAuthStore((s) => s.isLoading)

  const strength = calcStrength(password)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) {
      setError('You must accept the terms to deploy terminal access.')
      return
    }
    setError(null)
    signUp(name, email, password)
      .then(() => {
        navigate('/onboarding')
      })
      .catch((err) => setError(getFirebaseErrorMessage(err)))
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between overflow-x-hidden select-none">
      {/* ── Ambient Background Canvas: Candlestick Wicks & Market Grid ──────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.03] to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-white/[0.02] blur-3xl rounded-full" />

        {/* Floating wicks */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="30%" x2="100%" y2="30%" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />
          <line x1="0" y1="65%" x2="100%" y2="65%" stroke="rgba(52,211,153,0.12)" strokeDasharray="3 8" />
          <g className="animate-pulse" style={{ animationDuration: '7s' }}>
            <line x1="15%" y1="18%" x2="15%" y2="48%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(15% - 3px)" y="24%" width="6" height="14%" fill="#34D399" rx="1" opacity="0.5" />
            <line x1="82%" y1="35%" x2="82%" y2="68%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(82% - 3px)" y="42%" width="6" height="15%" fill="#34D399" rx="1" opacity="0.4" />
          </g>
        </svg>

        {/* Ambient telemetry badge */}
        <div className="absolute top-8 left-8 hidden md:flex items-center gap-4 text-[11px] font-mono text-[#71717A]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-ping" />
            STATION PROVISIONING
          </span>
          <span className="text-white/10">/</span>
          <span>5/5 ENGINES READY</span>
        </div>
      </div>

      {/* ── Top Wordmark ────────────────────────────────────────────────────── */}
      <header className="relative z-10 pt-8 sm:pt-10 px-6 flex justify-center">
        <Link to="/" className="inline-flex items-center gap-2.5 group focus:outline-none">
          <div className="relative w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.1] flex items-center justify-center group-hover:border-white/25 transition-colors">
            <img src="/brand/traxo-mark.png" className="w-5 h-5 object-contain" alt="TRAXO" />
          </div>
          <span className="text-[12px] font-mono font-bold tracking-[0.24em] uppercase text-[#FAFAFA]">
            TRAXO
          </span>
        </Link>
      </header>

      {/* ── Center Open-Canvas Terminal Registration ────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-8 w-full max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full space-y-6"
        >
          {/* Header Typography */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wider text-[#A1A1AA] uppercase">
              <span>NEW OPERATOR ONBOARDING</span>
            </div>
            <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#FAFAFA] tracking-tight">
              Provision terminal seat
            </h1>
            <p className="text-[13px] text-[#71717A]">
              Unlock all 5 institutional algorithmic strategies and automated journal
            </p>
          </div>

          {/* Error notice */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-3.5 py-2.5 rounded-lg bg-[#F87171]/10 border border-[#F87171]/20 text-[12px] text-[#F87171] text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Open-Canvas Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Operator Name */}
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="text-[11px] font-mono uppercase tracking-wider text-[#71717A] flex items-center justify-between">
                <span>Operator Name / Handle</span>
                <span className="text-[10px] text-white/30">REQ</span>
              </label>
              <div className="relative flex items-center group">
                <PiUser className="absolute left-3.5 text-[#71717A] group-focus-within:text-[#34D399] transition-colors" size={17} />
                <input
                  id={nameId}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Vance"
                  required
                  autoComplete="name"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor={emailId} className="text-[11px] font-mono uppercase tracking-wider text-[#71717A] flex items-center justify-between">
                <span>Direct Terminal Email</span>
                <span className="text-[10px] text-white/30">REQ</span>
              </label>
              <div className="relative flex items-center group">
                <PiEnvelopeSimple className="absolute left-3.5 text-[#71717A] group-focus-within:text-[#34D399] transition-colors" size={17} />
                <input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@traxo.io"
                  required
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={passwordId} className="text-[11px] font-mono uppercase tracking-wider text-[#71717A]">
                  Clearance Key (Password)
                </label>
                {strength > 0 && (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider font-semibold"
                    style={{ color: strengthColor(strength) }}
                  >
                    {strengthLabel(strength)}
                  </span>
                )}
              </div>
              <div className="relative flex items-center group">
                <PiLockKey className="absolute left-3.5 text-[#71717A] group-focus-within:text-[#34D399] transition-colors" size={17} />
                <input
                  id={passwordId}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="new-password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 text-[#71717A] hover:text-[#FAFAFA] transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <PiEyeSlash size={16} /> : <PiEye size={16} />}
                </button>
              </div>

              {/* Password strength indicator bars */}
              {password.length > 0 && (
                <div className="grid grid-cols-3 gap-1 pt-1">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className="h-1 rounded-full transition-all duration-200"
                      style={{
                        backgroundColor:
                          step <= strength ? strengthColor(strength) : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Terms Checkbox */}
            <div className="pt-1">
              <label htmlFor={termsId} className="flex items-start gap-2.5 cursor-pointer text-[12px] text-[#71717A] leading-relaxed">
                <input
                  id={termsId}
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-white/5 text-[#34D399] focus:ring-[#34D399]/30 focus:ring-offset-0 cursor-pointer"
                />
                <span>
                  I understand algorithmic trading involves risk and agree to the operational protocol and terms of access.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !agreed}
              className="w-full h-11 mt-2 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(255,255,255,0.08)] cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2 font-mono text-[12px]">
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  INITIALIZING WORKSPACE...
                </span>
              ) : (
                <>
                  <span>Deploy Trading Workspace</span>
                  <PiArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="text-center pt-2">
            <p className="text-[12px] text-[#71717A]">
              Already hold clearance?{' '}
              <Link to="/login" className="text-[#FAFAFA] hover:underline font-medium ml-1">
                Access terminal station
              </Link>
            </p>
          </div>
        </motion.div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 pb-6 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-[#52525B] max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <PiShieldCheck className="text-[#34D399]" size={14} />
          <span>ZERO DATA BROKERING PROTOCOL</span>
        </div>
        <span>© 2026 TRAXO INTELLIGENCE</span>
      </footer>
    </div>
  )
}
