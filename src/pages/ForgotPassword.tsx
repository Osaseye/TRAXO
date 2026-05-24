import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'

const ic =
  'w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-[13px] text-white placeholder:text-[#2d3748] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-colors'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sent) return
    setSent(true)
    navigate('/verify-otp', { state: { email } })
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white flex">

      {/* Left brand panel (lg+) */}
      <div className="hidden lg:flex w-[440px] shrink-0 flex-col bg-[#09090d] border-r border-white/[0.05] p-10 relative overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[380px] h-[380px] bg-[#3b82f6]/5 blur-[110px] rounded-full pointer-events-none" />

        {/* Wordmark */}
        <div className="flex items-center gap-2.5 relative">
          <img src="/TRAXO-icon.png" className="w-7 h-7 object-contain" alt="" />
          <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white">TRAXO</span>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center gap-8 relative">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#3b82f6] mb-3">
              Account recovery
            </p>
            <h2 className="text-[1.55rem] font-extrabold text-white leading-tight mb-2">
              Happens to<br />everyone.
            </h2>
            <p className="text-[13px] text-[#4b5563] leading-relaxed max-w-xs">
              Enter your email and we will send you a 6-digit code. Your account and all your data stays exactly as you left it.
            </p>
          </div>

          {/* Trust points */}
          <div className="space-y-3.5">
            {[
              'Your account stays fully secure during reset',
              'Reset code expires in 10 minutes',
              'Only works with your verified email',
              'No data is ever deleted during recovery',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                </div>
                <span className="text-[12px] text-[#6b7280] leading-snug">{item}</span>
              </div>
            ))}
          </div>

          {/* Back to login */}
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-[12px] text-[#374151] hover:text-white transition-colors w-fit"
          >
            <ArrowLeft size={13} />
            Back to sign in
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
            Reset password
          </h1>
          <p className="text-[13px] text-[#4b5563] mb-8">
            Enter your email and we will send you a reset code
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">
                Email address
              </label>
              <input
                type="email"
                className={ic}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={sent}
              className="w-full h-11 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 transition-colors"
            >
              Send reset code <ArrowRight size={14} />
            </button>
          </form>

          <div className="mt-8">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#374151] hover:text-white transition-colors"
            >
              <ArrowLeft size={13} /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
