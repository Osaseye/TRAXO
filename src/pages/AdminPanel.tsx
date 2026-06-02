import { useMemo } from 'react'
import { ShieldAlert, Activity, Cpu, FlaskConical, BarChart2, ExternalLink, CheckCircle2, XCircle, Info, Radio } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useAuthStore } from '@/stores/useAuthStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { Link } from 'react-router'

// ---------------------------------------------------------------------------
// Algorithm configuration values (sourced from wickRejection.ts constants)
// ---------------------------------------------------------------------------
const ALG_CONFIG = {
  minScore: { prime: 7, standard: 5, aggressive: 4 },
  minConfidence: { prime: 70, standard: 55, aggressive: 45 },
  slBuffer: {
    primeForex: '0.75× ATR',
    standardForex: '1.0× ATR',
    crypto: '+50% on top of base',
  },
  defaultSlippage: { forex: '0.005%', crypto: '0.1%' },
  rrFallback: { tp1: '1.5R', tp2: '2.5R' },
  obLookback: '20 candles',
  swingLookback: '3 bars',
  i2eMinR: '0.8R (min distance for structure TP)',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function EnvBadge({ label, envKey }: { label: string; envKey: string }) {
  const value = import.meta.env[envKey] as string | undefined
  const present = Boolean(value)
  return (
    <div className="flex items-center justify-between gap-3 text-[12px] py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[#94a3b8]">{label}</span>
      <div className="flex items-center gap-1.5">
        {present ? (
          <>
            <CheckCircle2 size={12} className="text-[#86efac]" />
            <span className="text-[#86efac] font-semibold">Set</span>
          </>
        ) : (
          <>
            <XCircle size={12} className="text-[#fca5a5]" />
            <span className="text-[#fca5a5] font-semibold">Missing</span>
          </>
        )}
      </div>
    </div>
  )
}

function ConfigRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px] py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[#94a3b8]">{label}</span>
      <div className="text-right">
        <span className="font-semibold text-[#e5e7eb]">{value}</span>
        {note && <p className="text-[10px] text-[#475569] mt-0.5">{note}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminPanel() {
  const email = useAuthStore((s) => s.user?.email)
  const journal = useTradingContextStore((s) => s.journal)

  const journalStats = useMemo(() => {
    const taken = journal.filter((j) => j.taken)
    const settled = taken.filter((j) => j.outcome !== 'pending' && j.outcome !== 'skipped')
    const wins = settled.filter((j) => j.outcome === 'win').length
    const losses = settled.filter((j) => j.outcome === 'loss').length
    const bes = settled.filter((j) => j.outcome === 'breakeven').length
    const winRate = settled.length > 0 ? ((wins / settled.length) * 100).toFixed(1) : '—'
    const breakEvenTriggered = taken.filter((j) => j.breakEvenTriggered).length

    // Max consec losses
    let maxConsec = 0, cur = 0
    for (const e of settled) {
      if (e.outcome === 'loss') { cur++; maxConsec = Math.max(maxConsec, cur) } else cur = 0
    }

    return { total: journal.length, taken: taken.length, settled: settled.length, wins, losses, bes, winRate, maxConsec, breakEvenTriggered }
  }, [journal])

  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <ShieldAlert size={14} className="text-[#fca5a5]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Admin Panel</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Identity */}
        <div className="flex items-center gap-2 rounded-xl border border-[#f59e0b]/20 bg-[#f59e0b]/10 px-4 py-3">
          <Info size={14} className="text-[#fde68a] shrink-0" />
          <p className="text-[12px] text-[#fde68a]">
            Authenticated as <strong>{email}</strong> — this page is only accessible to emails listed in <code className="text-[11px] bg-white/10 px-1 rounded">VITE_ADMIN_EMAILS</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* System Health */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={15} className="text-[#6366f1]" />
              <h2 className="text-[13px] font-semibold text-[#e5e7eb]">System Health</h2>
            </div>
            <div className="space-y-0">
              <EnvBadge label="TwelveData API Key" envKey="VITE_TWELVEDATA_API_KEY" />
              <EnvBadge label="Finnhub API Key (server)" envKey="VITE_FINNHUB_API_KEY" />
              <EnvBadge label="Upstash Redis URL (server)" envKey="VITE_UPSTASH_REDIS_REST_URL" />
              <EnvBadge label="Admin Emails" envKey="VITE_ADMIN_EMAILS" />
            </div>
            <div className="mt-4 pt-4 border-t border-white/[0.05]">
              <p className="text-[11px] text-[#64748b] mb-2">News server</p>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#e5e7eb] font-mono break-all">{serverUrl ?? 'http://localhost:8080'}</span>
                {serverUrl && (
                  <a href={`${serverUrl}/health`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <ExternalLink size={12} className="text-[#6366f1] hover:text-white transition-colors" />
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* Signal Performance (own journal) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-[#6366f1]" />
              <h2 className="text-[13px] font-semibold text-[#e5e7eb]">Signal Performance (this account)</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total logged', value: journalStats.total },
                { label: 'Taken trades', value: journalStats.taken },
                { label: 'Settled', value: journalStats.settled },
                { label: 'Wins', value: journalStats.wins, tone: 'green' },
                { label: 'Losses', value: journalStats.losses, tone: 'red' },
                { label: 'Break-even', value: journalStats.bes, tone: 'yellow' },
              ].map(({ label, value, tone }) => (
                <div key={label} className="rounded-lg border border-white/[0.06] bg-[#0b0f17] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b]">{label}</p>
                  <p className={`mt-1 text-lg font-bold ${tone === 'green' ? 'text-[#86efac]' : tone === 'red' ? 'text-[#fca5a5]' : tone === 'yellow' ? 'text-[#fde68a]' : 'text-[#f8fafc]'}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-0">
              <ConfigRow label="Win rate" value={`${journalStats.winRate}%`} />
              <ConfigRow label="Max consec. losses" value={String(journalStats.maxConsec)} />
              <ConfigRow label="Break-even triggered" value={String(journalStats.breakEvenTriggered)} note="trades moved to entry SL" />
            </div>
          </section>

          {/* Algorithm Config */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={15} className="text-[#6366f1]" />
              <h2 className="text-[13px] font-semibold text-[#e5e7eb]">Algorithm Configuration <span className="text-[11px] text-[#475569] font-normal">(read-only)</span></h2>
            </div>
            <div className="space-y-0">
              <ConfigRow label="Prime threshold" value={`Score ≥ ${ALG_CONFIG.minScore.prime}, Conf ≥ ${ALG_CONFIG.minConfidence.prime}%`} />
              <ConfigRow label="Standard threshold" value={`Score ≥ ${ALG_CONFIG.minScore.standard}, Conf ≥ ${ALG_CONFIG.minConfidence.standard}%`} />
              <ConfigRow label="Aggressive threshold" value={`Score ≥ ${ALG_CONFIG.minScore.aggressive}, Conf ≥ ${ALG_CONFIG.minConfidence.aggressive}%`} />
              <ConfigRow label="SL buffer (prime FOREX)" value={ALG_CONFIG.slBuffer.primeForex} note="anti-stop-hunt" />
              <ConfigRow label="SL buffer (standard FOREX)" value={ALG_CONFIG.slBuffer.standardForex} />
              <ConfigRow label="SL buffer (CRYPTO)" value={ALG_CONFIG.slBuffer.crypto} />
              <ConfigRow label="Default slippage (FOREX)" value={ALG_CONFIG.defaultSlippage.forex} />
              <ConfigRow label="Default slippage (CRYPTO)" value={ALG_CONFIG.defaultSlippage.crypto} />
              <ConfigRow label="TP fallback (R:R)" value={`${ALG_CONFIG.rrFallback.tp1} / ${ALG_CONFIG.rrFallback.tp2}`} />
              <ConfigRow label="I2E min distance" value={ALG_CONFIG.i2eMinR} />
              <ConfigRow label="Order block lookback" value={ALG_CONFIG.obLookback} />
              <ConfigRow label="Swing lookback" value={ALG_CONFIG.swingLookback} />
            </div>
          </section>

          {/* Quick Actions */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical size={15} className="text-[#6366f1]" />
              <h2 className="text-[13px] font-semibold text-[#e5e7eb]">Quick Actions</h2>
            </div>
            <div className="space-y-3">
              <Link
                to="/admin/signals"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#6366f1]/20 bg-[#6366f1]/05 hover:bg-[#6366f1]/10 px-4 py-3 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Radio size={15} className="text-[#818cf8]" />
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">All System Signals</p>
                    <p className="text-[11px] text-[#64748b]">Full signal feed across all charts, strategies and timeframes</p>
                  </div>
                </div>
                <ExternalLink size={13} className="text-[#475569] group-hover:text-[#6366f1] transition-colors shrink-0" />
              </Link>

              <Link
                to="/backtesting"
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0b0f17] hover:bg-white/[0.03] px-4 py-3 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <BarChart2 size={15} className="text-[#6366f1]" />
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Run a Backtest</p>
                    <p className="text-[11px] text-[#64748b]">Walk-forward signal simulation on real historical candles</p>
                  </div>
                </div>
                <ExternalLink size={13} className="text-[#475569] group-hover:text-[#6366f1] transition-colors shrink-0" />
              </Link>

              <Link
                to="/journal"
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0b0f17] hover:bg-white/[0.03] px-4 py-3 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Activity size={15} className="text-[#6366f1]" />
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">View Trade Journal</p>
                    <p className="text-[11px] text-[#64748b]">Review all logged signals and outcomes</p>
                  </div>
                </div>
                <ExternalLink size={13} className="text-[#475569] group-hover:text-[#6366f1] transition-colors shrink-0" />
              </Link>

              <Link
                to="/dashboard"
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0b0f17] hover:bg-white/[0.03] px-4 py-3 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Cpu size={15} className="text-[#6366f1]" />
                  <div>
                    <p className="text-[12px] font-semibold text-[#e5e7eb]">Live Signal Dashboard</p>
                    <p className="text-[11px] text-[#64748b]">Real-time wick rejection signals across markets</p>
                  </div>
                </div>
                <ExternalLink size={13} className="text-[#475569] group-hover:text-[#6366f1] transition-colors shrink-0" />
              </Link>
            </div>
          </section>

        </div>
      </main>
      <MobileFloatingWorkspaceNav />
    </div>
  )
}
