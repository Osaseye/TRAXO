import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'
import { getFirebaseErrorMessage } from '@/lib/utils'

const ic = 'w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-[13px] text-white placeholder:text-[#2d3748] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/20 transition-colors'

export default function Login() {
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const isLoading = useAuthStore((s) => s.isLoading)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    signIn(email, password).then(() => {
      navigate('/dashboard')
    }).catch((err) => {
      setError(getFirebaseErrorMessage(err))
    })
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white flex">

      {/* ── Left brand panel (lg+) ── */}
      <div className="hidden lg:flex w-[440px] shrink-0 flex-col bg-[#09090d] border-r border-white/[0.05] p-10 relative overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[380px] h-[380px] bg-[#3b82f6]/6 blur-[110px] rounded-full pointer-events-none" />

        {/* Wordmark */}
        <div className="flex items-center gap-2.5 relative">
          <img src="/TRAXO-icon.png" className="w-7 h-7 object-contain" alt="" />
          <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white">TRAXO</span>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center gap-8 relative">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#3b82f6] mb-3">Live signals</p>
            <h2 className="text-[1.55rem] font-extrabold text-white leading-tight mb-2">
              Real edge.<br />No noise.
            </h2>
            <p className="text-[13px] text-[#4b5563] leading-relaxed max-w-xs">
              Every signal arrives with entry, stop-loss, take-profit, and the exact reasoning behind it.
            </p>
          </div>

          {/* Live signal card */}
          <div className="rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/[0.03] overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-[#22c55e]/10">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e] uppercase tracking-wider">BUY</span>
                <span className="text-[13px] font-bold text-white">EURUSD</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#4b5563]">4H</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[12px] font-bold text-[#22c55e]">82%</span>
                <span className="text-[8px] text-[#374151]">conf</span>
              </div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-white/[0.04]">
              {([['Entry','1.08432','#e5e7eb'],['SL','1.08190','#ef4444'],['TP','1.08916','#22c55e'],['R:R','2.2R','#e5e7eb']] as const).map(([l,v,c]) => (
                <div key={l} className="px-2 py-2.5 bg-[#0b0f17] text-center">
                  <div className="text-[8px] text-[#374151]">{l}</div>
                  <div className="text-[9px] font-bold tabular-nums mt-0.5" style={{ color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.05]">
            {([['7,200+','Signals sent'],['71%','Win rate'],['5','Strategies']] as const).map(([v,l]) => (
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

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col p-7 sm:p-10 lg:p-14">
        {/* Mobile wordmark */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <img src="/TRAXO-icon.png" className="w-6 h-6 object-contain" alt="" />
          <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white">TRAXO</span>
        </div>

        <div className="my-auto w-full max-w-sm">
          <h1 className="text-[1.75rem] font-extrabold text-white tracking-tight mb-1">Welcome back</h1>
          <p className="text-[13px] text-[#4b5563] mb-8">Sign in to your TRAXO account</p>

          <form onSubmit={handleSubmit} className="space-y-5">
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
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider">Password</label>
                <Link to="/forgot-password" className="text-[11px] text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} className={ic + ' pr-11'}
                  placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password"
                />
                <button
                  type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#374151] hover:text-[#6b7280] transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 transition-colors mt-1"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in…' : 'Sign in'} <ArrowRight size={14} />
            </button>
          </form>

          {error && (
            <div className="text-sm text-red-400 mt-3">{error}</div>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[11px] text-[#2d3748]">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <button
            type="button"
            className="w-full h-11 rounded-xl border border-white/[0.08] bg-transparent hover:bg-white/[0.03] text-[13px] text-[#6b7280] hover:text-white flex items-center justify-center gap-2.5 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-[12px] text-[#374151] mt-7 text-center">
            No account?{' '}
            <Link to="/register" className="text-white hover:text-[#3b82f6] font-semibold transition-colors">
              Sign up free →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
