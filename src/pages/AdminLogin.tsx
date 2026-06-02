import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Eye, EyeOff, ShieldAlert, Lock } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'
import { getFirebaseErrorMessage } from '@/lib/utils'

const ic = 'w-full h-11 px-4 rounded-xl bg-[#0d1117] border border-white/[0.08] text-[13px] text-white placeholder:text-[#2d3748] focus:outline-none focus:border-[#fca5a5]/40 focus:ring-1 focus:ring-[#fca5a5]/15 transition-colors'

function isAdminEmail(email: string): boolean {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined
  if (!raw) return false
  return raw.split(',').map((e) => e.trim().toLowerCase()).includes(email.trim().toLowerCase())
}

export default function AdminLogin() {
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const signIn = useAuthStore((s) => s.signIn)
  const logout = useAuthStore((s) => s.logout)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isAdminEmail(email)) {
      setError('This email is not authorised for admin access.')
      return
    }

    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/admin', { replace: true })
    } catch (err: unknown) {
      // Sign out silently if Firebase already signed them in before the check failed
      logout().catch(() => undefined)
      setError(getFirebaseErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white flex items-center justify-center px-4">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-[#ef4444]/4 blur-[160px] rounded-full" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ef4444]/20 bg-[#ef4444]/10 mb-4">
            <ShieldAlert size={24} className="text-[#fca5a5]" />
          </div>
          <h1 className="text-[20px] font-bold text-[#f8fafc]">Admin Access</h1>
          <p className="mt-1.5 text-[12px] text-[#64748b]">Restricted area — authorised accounts only</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#64748b] mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="admin@traxo.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={ic}
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#64748b] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${ic} pr-10`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-2.5">
                <p className="text-[12px] text-[#fca5a5]">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full h-11 rounded-xl bg-[#ef4444]/90 hover:bg-[#ef4444] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-bold flex items-center justify-center gap-2 transition-colors mt-2"
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Lock size={14} />
              )}
              {submitting ? 'Verifying…' : 'Enter Admin Panel'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-[#334155]">
          Not an admin?{' '}
          <a href="/login" className="text-[#475569] hover:text-white transition-colors underline underline-offset-2">
            Back to regular login
          </a>
        </p>
      </div>
    </div>
  )
}
