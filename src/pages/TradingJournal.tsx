import { useMemo } from 'react'
import { CalendarDays, CircleDollarSign, TrendingDown, TrendingUp } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useTradingContextStore } from '@/stores/useTradingContextStore'

export default function TradingJournal() {
  const journal = useTradingContextStore((s) => s.journal)

  const stats = useMemo(() => {
    const total = journal.length
    const wins = journal.filter((j) => j.outcome === 'win').length
    const losses = journal.filter((j) => j.outcome === 'loss').length
    const taken = journal.filter((j) => j.taken).length
    const winRate = taken > 0 ? Math.round((wins / taken) * 100) : 0
    return { total, wins, losses, taken, winRate }
  }, [journal])

  const latest = journal.slice(0, 8)

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <h1 className="text-[14px] font-semibold text-[#e5e7eb]">Trading Journal</h1>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Performance Review</p>
          <h2 className="text-[clamp(1.35rem,3vw,2rem)] font-extrabold tracking-tight mt-2">Behavior before results.</h2>
          <p className="text-[13px] text-[#94a3b8] mt-2 max-w-2xl">
            TRAXO records decision quality, not only outcomes. Use this page to spot repeated mistakes and protect your edge.
          </p>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Logged Trades', value: stats.total, icon: CalendarDays, color: 'text-[#e2e8f0]' },
            { label: 'Taken Trades', value: stats.taken, icon: CircleDollarSign, color: 'text-[#cbd5e1]' },
            { label: 'Wins', value: stats.wins, icon: TrendingUp, color: 'text-[#86efac]' },
            { label: 'Losses', value: stats.losses, icon: TrendingDown, color: 'text-[#fca5a5]' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/[0.08] bg-[#0d1117] p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#64748b]">
                <item.icon size={13} /> {item.label}
              </div>
              <p className={`text-[1.4rem] font-bold mt-2 tabular-nums ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold">Recent Sessions</p>
              <span className="text-[11px] text-[#64748b]">Win Rate {stats.winRate}%</span>
            </div>
            <div className="mt-4 space-y-3">
              {latest.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/[0.12] p-5 text-[12px] text-[#94a3b8]">
                  No journal events yet. Review opportunities from the Dashboard and log outcomes to build your timeline.
                </div>
              )}
              {latest.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/[0.08] bg-[#0b0f17] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold">{entry.symbol} · {entry.action}</p>
                    <span className="text-[11px] text-[#94a3b8]">{new Date(entry.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[11px] text-[#64748b] mt-1">{entry.strategy} · {entry.timeframe}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg border border-white/[0.08] p-2">
                      <p className="text-[#64748b]">Entry</p>
                      <p className="text-[#e2e8f0] font-semibold">{entry.entry.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] p-2">
                      <p className="text-[#64748b]">SL</p>
                      <p className="text-[#fca5a5] font-semibold">{entry.sl.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] p-2">
                      <p className="text-[#64748b]">TP</p>
                      <p className="text-[#86efac] font-semibold">{entry.tp.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold">Execution Breakdown</p>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Marked as taken', value: stats.taken, pct: stats.total ? (stats.taken / stats.total) * 100 : 0 },
                { label: 'Marked as skipped', value: stats.total - stats.taken, pct: stats.total ? ((stats.total - stats.taken) / stats.total) * 100 : 0 },
                { label: 'Win conversion', value: stats.wins, pct: stats.taken ? (stats.wins / stats.taken) * 100 : 0 },
                { label: 'Loss conversion', value: stats.losses, pct: stats.taken ? (stats.losses / stats.taken) * 100 : 0 },
              ].map((row) => (
                <div key={row.label} className="rounded-lg border border-white/[0.08] p-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#cbd5e1]">{row.label}</span>
                    <span className="text-[#94a3b8]">{row.value} · {Math.round(row.pct)}%</span>
                  </div>
                  <div className="h-1.5 mt-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-[#94a3b8]" style={{ width: `${Math.min(100, row.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
