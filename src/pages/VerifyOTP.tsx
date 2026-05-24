import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'

export default function VerifyOTP() {
  const location = useLocation()
  const rawEmail = (location.state as { email?: string })?.email ?? ''
  const displayEmail = rawEmail
    ? rawEmail.replace(/^(.{2}).*(@.*)$/, '$1\u2022\u2022\u2022\u2022$2')
    : 'your inbox'

  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [timer, setTimer] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const filled = digits.every((d) => d !== '')

  useEffect(() => {
    if (timer <= 0) { setCanResend(true); return }
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
    pasted.split('').forEach((ch, idx) => { next[idx] = ch })
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleResend = () => {
    setTimer(60)
    setCanResend(false)
    setDigits(Array(6).fill(''))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // OTP verification — connect to backend
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white flex">

      {/* Left brand panel (lg+) */}
      <div className="hidden lg:flex w-[440px] shrink-0 flex-col bg-[#09090d] border-r border-white/[0.05] p-10 relative overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[380px] h-[380px] bg-[#22c55e]/5 blur-[110px] rounded-full pointer-events-none" />

        {/* Wordmark */}
        <div className="flex items-center gap-2.5 relative">
          <img src="/TRAXO-icon.png" className="w-7 h-7 object-contain" alt="" />
          <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white">TRAXO</span>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center gap-8 relative">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#22c55e] mb-3">
              Almost there
            </p>
            <h2 className="text-[1.55rem] font-extrabold text-white leading-tight mb-2">
              Code sent.<br />Check your inbox.
            </h2>
            <p className="text-[13px] text-[#4b5563] leading-relaxed max-w-xs">
              We sent a 6-digit code to{' '}
              <span className="text-white font-medium">{displayEmail}</span>.
              Enter it on the right to continue.
            </p>
          </div>

          {/* Code mock */}
          <div className="flex gap-2">
            {['—', '—', '—', '—', '—', '—'].map((_, i) => (
              <div
                key={i}
                className="flex-1 h-10 rounded-lg border border-white/[0.06] bg-[#0d1117] flex items-center justify-center"
              >
                <span className="text-[16px] font-bold text-[#1e293b]">—</span>
              </div>
            ))}
          </div>

          {/* Info points */}
          <div className="space-y-3.5">
            {[
              'Code valid for 10 minutes',
              'Check spam if you do not see it',
              'One code per request — resend after 60s',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                </div>
                <span className="text-[12px] text-[#6b7280] leading-snug">{item}</span>
              </div>
            ))}
          </div>

          <Link
            to="/forgot-password"
            className="inline-flex items-center gap-2 text-[12px] text-[#374151] hover:text-white transition-colors w-fit"
          >
            <ArrowLeft size={13} />
            Wrong email? Go back
          </Link>
        </div>

        <p className="text-[9px] tracking-[0.25em] uppercase text-[#1e293b] font-bold relative">
          LOOK FIRST. THEN TRADE.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col p-7 sm:p-10 lg:p-14">
        {/* Mobile wordmark */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <img src="/TRAXO-icon.png" className="w-6 h-6 object-contain" alt="" />
          <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white">TRAXO</span>
        </div>

        <div className="my-auto w-full max-w-sm">
          <h1 className="text-[1.75rem] font-extrabold text-white tracking-tight mb-1">
            Enter your code
          </h1>
          <p className="text-[13px] text-[#4b5563] mb-8">
            Sent to{' '}
            <span className="text-white font-medium">{displayEmail}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* OTP boxes */}
            <div className="flex gap-2.5" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="flex-1 h-13 min-w-0 rounded-xl border text-center text-[20px] font-bold tabular-nums bg-[#0d1117] text-white focus:outline-none transition-colors"
                  style={{
                    borderColor: d ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)',
                    boxShadow: d ? '0 0 0 1px rgba(59,130,246,0.15)' : 'none',
                  }}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={!filled}
              className="w-full h-11 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 transition-colors"
            >
              Verify code <ArrowRight size={14} />
            </button>
          </form>

          {/* Resend */}
          <div className="mt-6 text-center">
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                className="text-[12px] text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
              >
                Resend code
              </button>
            ) : (
              <p className="text-[12px] text-[#374151]">
                Resend in{' '}
                <span className="text-white tabular-nums font-medium">{timer}s</span>
              </p>
            )}
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#374151] hover:text-white transition-colors"
            >
              <ArrowLeft size={13} /> Wrong email? Go back
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
