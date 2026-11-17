import { useState, useId } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { PiArrowLeft, PiArrowRight, PiEnvelopeSimple, PiKey, PiShieldCheck } from 'react-icons/pi'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const emailId = useId()
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sent) return
    setSent(true)
    navigate('/verify-otp', { state: { email } })
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between overflow-x-hidden select-none">
      {/* ── Ambient Background Canvas ───────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.03] to-transparent blur-3xl rounded-full" />
      </div>

      {/* ── Top Wordmark ────────────────────────────────────────────────────── */}
      <header className="relative z-10 pt-8 sm:pt-12 px-6 flex justify-center">
        <Link to="/" className="inline-flex items-center gap-2.5 group focus:outline-none">
          <img src="/brand/traxo-mark.png" className="w-6 h-6 object-contain" alt="TRAXO" />
          <span className="text-[12px] font-bold tracking-[0.24em] uppercase text-[#FAFAFA]">
            TRAXO
          </span>
        </Link>
      </header>

      {/* ── Center Open Canvas Recovery ─────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-10 w-full max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full space-y-7"
        >
          {/* Header Typography */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider">
              <PiKey className="text-[#34D399]" />
              <span>STATION RECOVERY</span>
            </div>
            <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#FAFAFA] tracking-tight">
              Reset clearance key
            </h1>
            <p className="text-[13px] text-[#71717A]">
              Enter your registered terminal email to dispatch a secure 6-digit recovery code
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 font-sans">
            <div className="space-y-1.5">
              <label htmlFor={emailId} className="text-[12px] font-medium text-[#A1A1AA] flex items-center justify-between">
                <span>Terminal Email</span>
                <span className="text-[10px] text-white/40">Required</span>
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
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-[#34D399]/60 focus:bg-white/[0.05] text-[13px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#34D399]/20 transition-all font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 mt-2 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(255,255,255,0.08)] cursor-pointer"
            >
              <span>Transmit Recovery Code</span>
              <PiArrowRight size={15} />
            </button>
          </form>

          <div className="text-center pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              <PiArrowLeft size={14} />
              Return to terminal sign in
            </Link>
          </div>
        </motion.div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 pb-6 px-6 flex items-center justify-center gap-2 text-[11px] font-mono text-[#52525B]">
        <PiShieldCheck className="text-[#34D399]" size={14} />
        <span>RECOVERY TOKENS EXPIRE AFTER 10 MINUTES</span>
      </footer>
    </div>
  )
}
