import { useState, useId } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  PiEye,
  PiEyeSlash,
  PiArrowRight,
  PiGoogleLogo,
  PiLockKey,
  PiEnvelopeSimple,
  PiShieldCheck,
} from 'react-icons/pi'
import { useAuthStore } from '@/stores/useAuthStore'
import { getFirebaseErrorMessage } from '@/lib/utils'

export default function Login() {
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const emailId = useId()
  const passwordId = useId()
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const isLoading = useAuthStore((s) => s.isLoading)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    signIn(email, password)
      .then(() => {
        navigate('/dashboard')
      })
      .catch((err: unknown) => {
        setError(getFirebaseErrorMessage(err))
      })
  }

  const handleGoogleSignIn = () => {
    setError(null)
    signInWithGoogle()
      .then(() => {
        navigate('/dashboard')
      })
      .catch((err: unknown) => {
        setError(getFirebaseErrorMessage(err))
      })
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between overflow-x-hidden select-none">
      {/* ── Ambient Background Canvas: Candlestick Wicks & Market Grid ──────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Subtle coordinate dot grid */}
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Ambient glow pulses */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.03] to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-white/[0.02] blur-3xl rounded-full" />

        {/* Animated background candlestick wicks & price trajectories */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle horizontal session bias lines */}
          <line x1="0" y1="28%" x2="100%" y2="28%" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(52,211,153,0.12)" strokeDasharray="3 8" />
          <line x1="0" y1="72%" x2="100%" y2="72%" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />

          {/* Floating candlestick wicks */}
          <g className="animate-pulse" style={{ animationDuration: '6s' }}>
            {/* Candle 1 */}
            <line x1="12%" y1="22%" x2="12%" y2="44%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(12% - 3px)" y="27%" width="6" height="11%" fill="#34D399" rx="1" opacity="0.6" />
            {/* Candle 2 */}
            <line x1="24%" y1="40%" x2="24%" y2="62%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect x="calc(24% - 3px)" y="46%" width="6" height="8%" fill="#27272A" rx="1" />
            {/* Candle 3 (Displacement wick) */}
            <line x1="78%" y1="18%" x2="78%" y2="52%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(78% - 3px)" y="25%" width="6" height="18%" fill="#34D399" rx="1" opacity="0.4" />
            {/* Candle 4 */}
            <line x1="88%" y1="54%" x2="88%" y2="78%" stroke="#F87171" strokeWidth="1" opacity="0.5" />
            <rect x="calc(88% - 3px)" y="58%" width="6" height="12%" fill="#F87171" rx="1" opacity="0.3" />
          </g>

          {/* Vector trajectory curve */}
          <path
            d="M 50 320 Q 250 290 480 340 T 900 260 T 1400 210"
            fill="none"
            stroke="url(#chartGrad)"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
          <defs>
            <linearGradient id="chartGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="#34D399" stopOpacity="0.3" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>

        {/* Ambient floating ticker telemetry badges */}
        <div className="absolute top-8 left-8 hidden md:flex items-center gap-4 text-[11px] font-mono text-[#71717A]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-ping" />
            SYS.ONLINE · 14ms
          </span>
          <span className="text-white/10">/</span>
          <span>EURUSD 1.0842 ▲</span>
          <span className="text-white/10">/</span>
          <span>XAUUSD 2742.80 ▼</span>
        </div>

        <div className="absolute top-8 right-8 hidden md:flex items-center gap-3 text-[11px] font-mono text-[#71717A]">
          <span>ORCHESTRATOR v4.2</span>
          <span className="w-1 h-1 rounded-full bg-white/30" />
          <span className="text-[#34D399]">QUANT ENGINE ACTIVE</span>
        </div>
      </div>

      {/* ── Top Floating Wordmark ───────────────────────────────────────────── */}
      <header className="relative z-10 pt-8 sm:pt-12 px-6 flex justify-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 group focus:outline-none"
        >
          <div className="relative w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.1] flex items-center justify-center group-hover:border-white/25 transition-colors">
            <img src="/brand/traxo-mark.png" className="w-5 h-5 object-contain" alt="TRAXO" />
          </div>
          <span className="text-[12px] font-mono font-bold tracking-[0.24em] uppercase text-[#FAFAFA]">
            TRAXO
          </span>
        </Link>
      </header>

      {/* ── Center Open-Canvas Terminal: No Boxed Cards ─────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-10 w-full max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full space-y-7"
        >
          {/* Header Typography: Directly on canvas */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wider text-[#A1A1AA] uppercase">
              <span>TERMINAL CLEARANCE</span>
            </div>
            <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#FAFAFA] tracking-tight">
              Sign in to your station
            </h1>
            <p className="text-[13px] text-[#71717A]">
              Connect to institutional signals and direct MT5 trade execution
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

          {/* Open-Canvas Form: borderless fields sitting on the dark canvas */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email input field */}
            <div className="space-y-1.5">
              <label htmlFor={emailId} className="text-[11px] font-mono uppercase tracking-wider text-[#71717A] flex items-center justify-between">
                <span>Operator Identifier / Email</span>
                <span className="text-[10px] text-white/30">REQ</span>
              </label>
              <div className="relative flex items-center group">
                <PiEnvelopeSimple className="absolute left-3.5 text-[#71717A] group-focus-within:text-[#34D399] transition-colors" size={17} />
                <input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@hedgefund.com"
                  required
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-mono"
                />
              </div>
            </div>

            {/* Password input field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={passwordId} className="text-[11px] font-mono uppercase tracking-wider text-[#71717A]">
                  Clearance Key / Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] font-mono text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                >
                  Forgot key?
                </Link>
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
                  autoComplete="current-password"
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
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-2 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(255,255,255,0.08)] cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2 font-mono text-[12px]">
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  AUTHENTICATING...
                </span>
              ) : (
                <>
                  <span>Initialize Terminal</span>
                  <PiArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <span className="relative px-3 bg-[#09090B] text-[10px] font-mono text-[#52525B] uppercase tracking-wider">
              or connect via identity
            </span>
          </div>

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full h-11 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 text-[#FAFAFA] text-[13px] font-medium flex items-center justify-center gap-2.5 transition-all cursor-pointer"
          >
            <PiGoogleLogo size={17} />
            <span>Continue with Google</span>
          </button>

          {/* Secondary Links directly on canvas */}
          <div className="text-center pt-2">
            <p className="text-[12px] text-[#71717A]">
              New operator?{' '}
              <Link
                to="/register"
                className="text-[#FAFAFA] hover:underline font-medium ml-1"
              >
                Provision terminal access
              </Link>
            </p>
          </div>
        </motion.div>
      </main>

      {/* ── Footer Telemetry ────────────────────────────────────────────────── */}
      <footer className="relative z-10 pb-6 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-[#52525B] max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <PiShieldCheck className="text-[#34D399]" size={14} />
          <span>END-TO-END ENCRYPTED PROTOCOL</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/admin/login" className="hover:text-[#A1A1AA] transition-colors">
            Admin Station
          </Link>
          <span>·</span>
          <span>© 2026 TRAXO INTELLIGENCE</span>
        </div>
      </footer>
    </div>
  )
}
