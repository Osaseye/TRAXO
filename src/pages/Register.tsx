import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'

const ic = 'w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-[13px] text-white placeholder:text-[#2d3748] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-colors'

const FREE_FEATURES = [
  '5 live signals per day',
  'All 5 built-in strategies',
  'Full signal reasoning',
  'Risk calculator',
  'Upgrade to Pro for \u20a68,000/mo anytime',
]

function strengthLabel(s: number) {
  return ['', 'Weak', 'Good', 'Strong'][s]
}
function strengthColor(s: number) {
  return ['', '#ef4444', '#f59e0b', '#22c55e'][s]
}
function calcStrength(pw: string): number {
  if (pw.length < 6) return pw.length > 0 ? 1 : 0
  let score = 1
  if (pw.length >= 10) score++
  if (/[^a-zA-Z0-9]/.test(pw) || /[0-9]/.test(pw)) score++
  return Math.min(score, 3)
}

export default function Register() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)

  const strength = calcStrength(password)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Wire to auth in Phase 1 backend — navigate to onboarding on success
    navigate('/onboarding')
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
              Free to start
            </p>
            <h2 className="text-[1.55rem] font-extrabold text-white leading-tight mb-2">
              Start free.<br />Upgrade when ready.
            </h2>
            <p className="text-[13px] text-[#4b5563] leading-relaxed max-w-xs">
              Get live trading signals with full reasoning on every alert. No credit card required.
            </p>
          </div>

          {/* Free plan features */}
          <div className="rounded-xl border border-white/[0.07] bg-[#0b0f17] p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">Free plan</span>
              <span className="text-[10px] font-bold text-[#22c55e]">No card needed</span>
            </div>
            {FREE_FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-2.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="7" cy="7" r="7" fill="#22c55e" fillOpacity="0.12" />
                  <path d="M4.5 7l1.8 1.8L9.5 5.5" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[12px] text-[#6b7280] leading-snug">{f}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.05]">
            {([['7,200+', 'Signals sent'], ['71%', 'Win rate'], ['Free', 'To get started']] as const).map(([v, l]) => (
              <div key={l}>
                <div className="text-[1.1rem] font-extrabold text-white tabular-nums">{v}</div>
                <div className="text-[9px] text-[#374151] mt-0.5">{l}</div>
              </div>
            ))}
          </div>
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
          <h1 className="text-[1.75rem] font-extrabold text-white tracking-tight mb-1">Create account</h1>
          <p className="text-[13px] text-[#4b5563] mb-8">Free forever. Upgrade anytime.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">
                Full name
              </label>
              <input
                type="text" className={ic} placeholder="Your name"
                value={name} onChange={(e) => setName(e.target.value)}
                required autoComplete="name"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">
                Email
              </label>
              <input
                type="email" className={ic} placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider block mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} className={ic + ' pr-11'}
                  placeholder="Create a password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="new-password"
                />
                <button
                  type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#374151] hover:text-[#6b7280] transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Strength meter */}
              {password.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="flex-1 h-1 rounded-full transition-all duration-300"
                        style={{
                          background: strength >= n ? strengthColor(strength) : '#1e293b',
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold" style={{ color: strengthColor(strength) }}>
                    {strengthLabel(strength)}
                  </p>
                </div>
              )}
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded border transition-colors"
                  style={{
                    background: agreed ? '#3b82f6' : 'transparent',
                    borderColor: agreed ? '#3b82f6' : '#374151',
                  }}
                >
                  {agreed && (
                    <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-[12px] text-[#4b5563] leading-relaxed group-hover:text-[#6b7280] transition-colors">
                I agree to the{' '}
                <Link to="/terms" className="text-white hover:text-[#3b82f6] transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-white hover:text-[#3b82f6] transition-colors">
                  Privacy Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={!agreed}
              className="w-full h-11 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 transition-colors mt-1"
            >
              Create account <ArrowRight size={14} />
            </button>
          </form>

          <p className="text-[12px] text-[#374151] mt-7 text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-white hover:text-[#3b82f6] font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
