import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import { PiArrowLeft, PiArrowRight, PiCheckCircle, PiShieldCheck, PiLockKey } from 'react-icons/pi'

export default function VerifyOTP() {
  const location = useLocation()
  const rawEmail = (location.state as { email?: string })?.email ?? ''
  const displayEmail = rawEmail
    ? rawEmail.replace(/^(.{2}).*(@.*)$/, '$1••••$2')
    : 'your inbox'

  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [timer, setTimer] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const [verified, setVerified] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const filled = digits.every((d) => d !== '')

  useEffect(() => {
    if (timer <= 0) {
      const t = setTimeout(() => setCanResend(true), 0)
      return () => clearTimeout(t)
    }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000)
    return () => clearTimeout(id)
  }, [timer])

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits]
        next[i] = ''
        setDigits(next)
      } else if (i > 0) {
        inputRefs.current[i - 1]?.focus()
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = Array(6).fill('')
    pasted.split('').forEach((ch, idx) => {
      next[idx] = ch
    })
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    if (!filled) return
    setVerified(true)
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between overflow-x-hidden select-none">
      {/* ── Background Canvas ───────────────────────────────────────────────── */}
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

      {/* ── Center Open Canvas OTP ──────────────────────────────────────────── */}
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
              <PiLockKey className="text-[#34D399]" />
              <span>TOKEN VERIFICATION</span>
            </div>
            <h1 className="text-[26px] sm:text-[30px] font-semibold text-[#FAFAFA] tracking-tight">
              Enter verification code
            </h1>
            <p className="text-[13px] text-[#71717A]">
              We transmitted a 6-digit cryptographic token to{' '}
              <span className="text-[#FAFAFA] font-medium">{displayEmail}</span>
            </p>
          </div>

          {verified ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-8 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-[#34D399]/15 border border-[#34D399]/30 flex items-center justify-center text-[#34D399] mx-auto">
                <PiCheckCircle size={28} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#FAFAFA]">Clearance Verified</h3>
                <p className="text-[12px] text-[#71717A] mt-1">Terminal key has been reset successfully.</p>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#FAFAFA] text-[#09090B] text-[13px] font-semibold hover:bg-[#E4E4E7] transition-colors"
              >
                Sign into station
                <PiArrowRight size={15} />
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              {/* 6-box input */}
              <div className="flex items-center justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-11 sm:w-12 h-13 sm:h-14 text-center text-[20px] font-mono font-bold text-[#FAFAFA] bg-white/[0.03] border border-white/[0.1] rounded-xl focus:border-[#34D399] focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-[#34D399]/30 transition-all"
                  />
                ))}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!filled}
                className="w-full h-11 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(255,255,255,0.08)] cursor-pointer disabled:opacity-40"
              >
                <span>Authorize & Unlock</span>
                <PiArrowRight size={15} />
              </button>

              {/* Resend timer */}
              <div className="text-center">
                {canResend ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTimer(60)
                      setCanResend(false)
                    }}
                    className="text-[12px] font-mono text-[#34D399] hover:underline"
                  >
                    Resend token code
                  </button>
                ) : (
                  <span className="text-[12px] font-mono text-[#52525B]">
                    Resend token available in {timer}s
                  </span>
                )}
              </div>
            </form>
          )}

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
        <span>TIMED ONE-TIME CRYPTOGRAPHIC PROTOCOL</span>
      </footer>
    </div>
  )
}
