import { useState, useId } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { PiEye, PiEyeSlash, PiWarning, PiLock, PiArrowLeft, PiShieldCheck, PiEnvelopeSimple, PiLockKey } from 'react-icons/pi'
import { useAuthStore } from '@/stores/useAuthStore'
import { getFirebaseErrorMessage } from '@/lib/utils'

function isAdminEmail(email: string): boolean {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined
  if (!raw) return false
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .includes(email.trim().toLowerCase())
}

export default function AdminLogin() {
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const emailId = useId()
  const passwordId = useId()
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const logout = useAuthStore((s) => s.logout)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isAdminEmail(email)) {
      setError('This identity is not authorised for root diagnostic clearance.')
      return
    }

    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/admin', { replace: true })
    } catch (err: unknown) {
      logout().catch(() => undefined)
      setError(getFirebaseErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between overflow-x-hidden select-none">
      {/* ── Background Canvas: Crimson Security Grid ──────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(248,113,113,0.3) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#F87171]/10 via-white/[0.02] to-transparent blur-3xl rounded-full" />
      </div>

      {/* ── Top Wordmark ────────────────────────────────────────────────────── */}
      <header className="relative z-10 pt-8 sm:pt-12 px-6 flex justify-center">
        <Link to="/" className="inline-flex items-center gap-2.5 group focus:outline-none">
          <img src="/brand/traxo-mark.png" className="w-6 h-6 object-contain" alt="TRAXO" />
          <span className="text-[12px] font-bold tracking-[0.24em] uppercase text-[#FAFAFA]">
            TRAXO ROOT
          </span>
        </Link>
      </header>

      {/* ── Center Open Canvas Admin Login ──────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-10 w-full max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full space-y-7"
        >
          {/* Header Typography */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#F87171] uppercase tracking-wider">
              <PiLock />
              <span>RESTRICTED PERIMETER</span>
            </div>
            <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#FAFAFA] tracking-tight">
              Root diagnostic station
            </h1>
            <p className="text-[13px] text-[#71717A]">
              Infrastructure diagnostics, signal auditing & engine parameter overrides
            </p>
          </div>

          {/* Error notice */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-3.5 py-2.5 rounded-lg bg-[#F87171]/15 border border-[#F87171]/30 text-[12px] text-[#F87171] text-center flex items-center justify-center gap-2"
            >
              <PiWarning size={15} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 font-sans">
            <div className="space-y-1.5">
              <label htmlFor={emailId} className="text-[12px] font-medium text-[#A1A1AA] flex items-center justify-between">
                <span>Authorized Admin Identity</span>
                <span className="text-[10px] text-[#F87171]">Root</span>
              </label>
              <div className="relative flex items-center group">
                <PiEnvelopeSimple className="absolute left-3.5 text-[#71717A] group-focus-within:text-[#F87171] transition-colors" size={17} />
                <input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@traxo.io"
                  required
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#F87171]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#F87171]/20 transition-all font-sans"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={passwordId} className="text-[12px] font-medium text-[#A1A1AA]">
                Cryptographic Key
              </label>
              <div className="relative flex items-center group">
                <PiLockKey className="absolute left-3.5 text-[#71717A] group-focus-within:text-[#F87171] transition-colors" size={17} />
                <input
                  id={passwordId}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#F87171]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#F87171]/20 transition-all font-sans"
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

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-2 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(255,255,255,0.08)] cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2 text-[12px] font-medium">
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  AUTHENTICATING ROOT...
                </span>
              ) : (
                <span>Access Diagnostic Station</span>
              )}
            </button>
          </form>

          <div className="text-center pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              <PiArrowLeft size={14} />
              Return to standard operator login
            </Link>
          </div>
        </motion.div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 pb-6 px-6 flex items-center justify-center gap-2 text-[11px] font-mono text-[#52525B]">
        <PiShieldCheck className="text-[#F87171]" size={14} />
        <span>ALL DIAGNOSTIC ACCESS ATTEMPTS ARE CRYPTOGRAPHICALLY LOGGED</span>
      </footer>
    </div>
  )
}
