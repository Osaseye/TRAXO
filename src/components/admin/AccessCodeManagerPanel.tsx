import { useCallback, useEffect, useState } from 'react'
import {
  PiArrowsClockwise,
  PiCheck,
  PiCopy,
  PiKey,
  PiPlus,
  PiTrash,
  PiUserCircle,
} from 'react-icons/pi'
import {
  generateAdminAccessCode,
  getAdminAccessCodes,
  revokeAdminAccessCode,
} from '@/lib/api'

interface AccessCodeRecord {
  code: string
  targetEmail: string | null
  status: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED'
  createdBy: string
  createdAt: number
  expiresAt: number
  usedByEmail: string | null
  usedAt: number | null
}

interface AccessCodeRequestRecord {
  id: string
  email: string
  status: 'PENDING' | 'APPROVED' | 'DENIED'
  code: string | null
  requestedAt: number
  resolvedAt: number | null
}

function formatTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function AccessCodeManagerPanel() {
  const [codes, setCodes] = useState<AccessCodeRecord[]>([])
  const [requests, setRequests] = useState<AccessCodeRequestRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [targetEmail, setTargetEmail] = useState('')
  const [latestCode, setLatestCode] = useState<{ code: string; email: string | null } | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = (await getAdminAccessCodes()) as {
        ok?: boolean
        codes?: AccessCodeRecord[]
        requests?: AccessCodeRequestRecord[]
      }
      setCodes(Array.isArray(res?.codes) ? res.codes : [])
      setRequests(Array.isArray(res?.requests) ? res.requests : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access codes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 2000)
  }

  const handleGenerate = async (opts?: { email?: string; requestId?: string }) => {
    setGenerating(true)
    setError(null)
    try {
      const emailToUse = opts?.email !== undefined ? opts.email : targetEmail.trim()
      const res = (await generateAdminAccessCode({
        targetEmail: emailToUse || undefined,
        requestId: opts?.requestId,
      })) as { ok?: boolean; code?: string; record?: AccessCodeRecord }
      if (res?.code) {
        setLatestCode({ code: res.code, email: emailToUse || null })
        if (opts?.email === undefined) setTargetEmail('')
        await loadData()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code')
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (code: string) => {
    setError(null)
    try {
      await revokeAdminAccessCode(code)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke code')
    }
  }

  const pendingRequests = requests.filter((r) => r.status === 'PENDING')

  return (
    <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#34D399]/10 border border-[#34D399]/20 flex items-center justify-center shrink-0">
            <PiKey className="h-5 w-5 text-[#34D399]" />
          </div>
          <div>
            <h2 className="text-[15.5px] font-semibold text-[#FAFAFA]">
              Login Access Codes (5-Digit Gate)
            </h2>
            <p className="text-[12.5px] text-[#A1A1AA] mt-0.5">
              Every non-admin user must enter a single-use 5-digit code from you to sign in.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="h-9 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <PiArrowsClockwise className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="px-3.5 py-2.5 rounded-xl bg-[#F87171]/10 border border-[#F87171]/25 text-[12.5px] text-[#F87171]">
          {error}
        </div>
      )}

      {/* Quick 5-Digit Generator Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <input
          type="email"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="Optional: lock code to specific user email (or leave blank for any user)"
          className="flex-1 h-10 px-3.5 rounded-xl bg-[#161619] border border-white/[0.08] focus:border-[#34D399]/50 text-[13px] text-[#FAFAFA] placeholder:text-[#71717A] focus:outline-none"
        />
        <button
          type="button"
          disabled={generating}
          onClick={() => void handleGenerate()}
          className="h-10 px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] disabled:opacity-50 text-[#09090B] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
        >
          <PiPlus className="h-4 w-4" />
          <span>{generating ? 'Generating...' : 'Generate 5-Digit Code'}</span>
        </button>
      </div>

      {/* Freshly Generated Code Banner */}
      {latestCode && (
        <div className="rounded-xl bg-[#34D399]/10 border border-[#34D399]/30 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-medium uppercase tracking-wider text-[#34D399]">
              New Single-Use Login Code Ready
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-[26px] font-bold tracking-[0.24em] text-[#FAFAFA] tabular-nums">
                {latestCode.code}
              </span>
              <span className="text-[12px] text-[#A1A1AA]">
                {latestCode.email ? `For ${latestCode.email}` : 'Valid for any user'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(latestCode.code)}
            className="h-9 px-3.5 rounded-xl bg-[#34D399] text-[#09090B] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#2EC48D] transition-colors shrink-0"
          >
            {copiedCode === latestCode.code ? <PiCheck size={15} /> : <PiCopy size={15} />}
            <span>{copiedCode === latestCode.code ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#FBBF24]">
              Pending Code Requests ({pendingRequests.length})
            </h3>
          </div>
          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#0D0D10]">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <PiUserCircle className="h-4 w-4 text-[#A1A1AA] shrink-0" />
                  <span className="text-[13px] font-medium text-[#FAFAFA] truncate">
                    {req.email}
                  </span>
                  <span className="text-[11.5px] font-mono text-[#71717A] shrink-0">
                    {formatTime(req.requestedAt)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void handleGenerate({ email: req.email, requestId: req.id })}
                  className="h-8 px-3 rounded-lg bg-[#34D399]/15 hover:bg-[#34D399]/25 border border-[#34D399]/30 text-[#34D399] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
                >
                  <PiKey size={13} />
                  <span>Generate Code</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Codes Table */}
      <div className="space-y-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#71717A]">
          Active &amp; Recent Codes ({codes.length})
        </h3>
        {codes.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#0D0D10] py-6 text-center text-[13px] text-[#71717A]">
            No access codes generated yet. Click &ldquo;Generate 5-Digit Code&rdquo; above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0D0D10]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-[#71717A]">
                <tr>
                  <th className="py-2.5 px-3.5 font-medium">Code</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">User / Target</th>
                  <th className="py-2.5 px-3 font-medium">Created</th>
                  <th className="py-2.5 px-3.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {codes.slice(0, 15).map((item) => (
                  <tr key={item.code} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3.5 font-mono text-[14px] font-bold tracking-[0.18em] text-[#FAFAFA] tabular-nums">
                      {item.code}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          item.status === 'ACTIVE'
                            ? 'bg-[#34D399]/15 text-[#34D399]'
                            : item.status === 'USED'
                              ? 'bg-white/[0.08] text-[#A1A1AA]'
                              : 'bg-[#F87171]/15 text-[#F87171]'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#A1A1AA] truncate max-w-[220px]">
                      {item.usedByEmail || item.targetEmail || 'Any user'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11.5px] text-[#71717A] whitespace-nowrap">
                      {formatTime(item.createdAt)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {item.status === 'ACTIVE' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCopy(item.code)}
                              className="h-7 px-2.5 rounded-lg bg-[#161619] hover:bg-white/[0.08] border border-white/[0.08] text-[11.5px] text-[#FAFAFA] inline-flex items-center gap-1"
                            >
                              {copiedCode === item.code ? (
                                <PiCheck size={13} className="text-[#34D399]" />
                              ) : (
                                <PiCopy size={13} />
                              )}
                              <span>{copiedCode === item.code ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRevoke(item.code)}
                              className="h-7 px-2 rounded-lg bg-[#161619] hover:bg-[#F87171]/15 border border-white/[0.08] text-[#F87171] inline-flex items-center"
                              title="Revoke code"
                            >
                              <PiTrash size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
