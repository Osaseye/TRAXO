import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Clock, DollarSign, Shield, Target, TrendingDown, TrendingUp, Edit2, Check, X, ShieldCheck } from 'lucide-react';
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav';
import { useTradingContextStore, type JournalEntry } from '@/stores/useTradingContextStore';

function pad(num: number) {
  return num < 10 ? `0${num}` : `${num}`;
}

function dateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatCurrency(value: number) {
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatPrice(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
    minimumFractionDigits: 2,
  });
}

function estimatePnl(entry: JournalEntry) {
  if (!entry.taken || entry.outcome === 'skipped' || entry.outcome === 'pending') return null;
  if (entry.outcome === 'loss') return -entry.riskAmount;
  if (entry.outcome === 'breakeven') return 0;

  const riskDistance = Math.abs(entry.entry - entry.sl);
  const rewardDistance = Math.abs(entry.tp - entry.entry);
  const rewardToRisk = riskDistance > 0 ? rewardDistance / riskDistance : 0;
  return entry.riskAmount * rewardToRisk;
}

function outcomeTone(entry: JournalEntry) {
  if (!entry.taken || entry.outcome === 'skipped') return 'border-[#64748b]/35 bg-[#64748b]/10 text-[#cbd5e1]';
  if (entry.outcome === 'win') return 'border-[#22c55e]/35 bg-[#22c55e]/10 text-[#86efac]';
  if (entry.outcome === 'loss') return 'border-[#ef4444]/35 bg-[#ef4444]/10 text-[#fca5a5]';
  if (entry.outcome === 'breakeven') return 'border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#fde68a]';
  return 'border-[#3b82f6]/35 bg-[#3b82f6]/10 text-[#bfdbfe]';
}

function pnlTone(value: number | null) {
  if (value == null) return 'text-[#94a3b8]';
  if (value > 0) return 'text-[#86efac]';
  if (value < 0) return 'text-[#fca5a5]';
  return 'text-[#e5e7eb]';
}

function getRewardToRisk(entry: JournalEntry) {
  const riskDistance = Math.abs(entry.entry - entry.sl);
  const rewardDistance = Math.abs(entry.tp - entry.entry);
  return riskDistance > 0 ? rewardDistance / riskDistance : 0;
}

export default function JournalDateDetail() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const journal = useTradingContextStore((s) => s.journal);
  const editJournalEntry = useTradingContextStore((s) => s.editJournalEntry);
  const triggerBreakEven = useTradingContextStore((s) => s.triggerBreakEven);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const entries = useMemo(
    () =>
      journal
        .filter((entry) => date && dateKeyFromTimestamp(entry.createdAt) === date)
        .sort((a, b) => b.createdAt - a.createdAt),
    [date, journal]
  );

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        const pnl = estimatePnl(entry);
        return {
          trades: acc.trades + 1,
          wins: acc.wins + (entry.outcome === 'win' ? 1 : 0),
          losses: acc.losses + (entry.outcome === 'loss' ? 1 : 0),
          pending: acc.pending + (entry.outcome === 'pending' ? 1 : 0),
          pnl: acc.pnl + (pnl ?? 0),
        };
      },
      { trades: 0, wins: 0, losses: 0, pending: 0, pnl: 0 }
    );
  }, [entries]);

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Journal for {date}</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <button
          onClick={() => navigate('/journal')}
          className="h-9 px-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[12px] font-semibold text-[#cbd5e1] hover:text-white hover:border-white/[0.18] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to calendar
        </button>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Daily Review</p>
              <h2 className="mt-2 text-2xl font-bold text-[#f8fafc]">{date}</h2>
              <p className="mt-2 text-[13px] text-[#94a3b8]">
                Price, risk, and estimated gain/loss for every trade logged on this date.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0 lg:min-w-[34rem]">
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Trades</p>
                <p className="mt-1 text-xl font-bold">{summary.trades}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Wins</p>
                <p className="mt-1 text-xl font-bold text-[#86efac]">{summary.wins}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Losses</p>
                <p className="mt-1 text-xl font-bold text-[#fca5a5]">{summary.losses}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Est. P/L</p>
                <p className={`mt-1 text-xl font-bold ${pnlTone(summary.pnl)}`}>{formatCurrency(summary.pnl)}</p>
              </div>
            </div>
          </div>
        </section>

        {entries.length > 0 ? (
          <section className="space-y-3">
            {entries.map((entry, index) => {
              const pnl = estimatePnl(entry);
              const rr = getRewardToRisk(entry);
              const settledLabel = pnl == null ? 'Not settled' : formatCurrency(pnl);

              return (
                <article key={entry.id} className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-4 sm:p-5">
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(15rem,1fr)_minmax(20rem,1.35fr)_minmax(16rem,0.9fr)] gap-5">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Trade {index + 1}</p>
                          <h3 className="mt-1 text-lg font-bold text-[#f8fafc]">
                            {entry.symbol} {entry.timeframe}
                          </h3>
                        </div>
                        <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase ${outcomeTone(entry)}`}>
                          {entry.outcome}
                        </span>
                      </div>

                      <div className="space-y-2 text-[12px] text-[#94a3b8]">
                        <div className="flex items-center justify-between gap-3">
                          <span>Strategy</span>
                          <span className="font-semibold text-[#e5e7eb] text-right">{entry.strategy}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Direction</span>
                          <span className={entry.action === 'BUY' ? 'font-semibold text-[#86efac]' : 'font-semibold text-[#fca5a5]'}>
                            {entry.action}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Logged</span>
                          <span className="font-semibold text-[#e5e7eb] text-right">
                            {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Price Levels</p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                          <div className="flex items-center gap-2 text-[#93c5fd]">
                            <DollarSign size={14} />
                            <p className="text-[10px] uppercase tracking-wider">Traded Price</p>
                          </div>
                          <p className="mt-2 text-xl font-bold text-[#f8fafc]">{formatPrice(entry.entry)}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-[#fca5a5]">
                              <Shield size={14} />
                              <p className="text-[10px] uppercase tracking-wider">Stop Loss</p>
                            </div>
                            {entry.breakEvenTriggered && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-[#86efac] border border-[#22c55e]/30 bg-[#22c55e]/10 rounded px-1.5 py-0.5">
                                <ShieldCheck size={10} />
                                BE
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xl font-bold text-[#fca5a5]">{formatPrice(entry.currentSl ?? entry.sl)}</p>
                          {entry.breakEvenTriggered && (
                            <p className="mt-1 text-[10px] text-[#475569]">Moved to entry</p>
                          )}
                        </div>
                        <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                          <div className="flex items-center gap-2 text-[#86efac]">
                            <Target size={14} />
                            <p className="text-[10px] uppercase tracking-wider">Take Profit</p>
                          </div>
                          <p className="mt-2 text-xl font-bold text-[#86efac]">{formatPrice(entry.tp)}</p>
                        </div>
                      </div>

                      {entry.notes && (
                        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                          <p className="text-[10px] uppercase tracking-wider text-[#64748b]">Notes</p>
                          <p className="mt-2 text-sm text-[#cbd5e1]">{entry.notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/[0.08] bg-[#0b0f17] p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Result</p>
                      <div className="mt-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] text-[#94a3b8]">Estimated gain/loss</p>
                          <p className={`mt-1 text-2xl font-bold ${pnlTone(pnl)}`}>{settledLabel}</p>
                        </div>
                        {pnl != null && pnl >= 0 ? (
                          <TrendingUp size={20} className={pnl > 0 ? 'text-[#86efac]' : 'text-[#94a3b8]'} />
                        ) : (
                          <TrendingDown size={20} className="text-[#fca5a5]" />
                        )}
                      </div>

                      <div className="mt-5 space-y-3 text-[12px]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#94a3b8] flex items-center gap-1.5 cursor-help" title="The total dollar size of your position">
                            Position size
                          </span>
                          {editingId === entry.id ? (
                            <div className="flex items-center gap-1">
                              <input 
                                type="number" 
                                className="h-6 w-24 bg-[#070709] border border-blue-500/50 rounded px-1.5 text-right text-[#e5e7eb] text-[12px] focus:outline-none"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = Number(editValue);
                                    if (!isNaN(val) && val > 0) {
                                      const riskPct = Math.abs(entry.entry - entry.sl) / entry.entry;
                                      editJournalEntry(entry.id, { 
                                        suggestedPosition: val, 
                                        riskAmount: val * riskPct 
                                      });
                                    }
                                    setEditingId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingId(null);
                                  }
                                }}
                              />
                              <button 
                                onClick={() => {
                                  const val = Number(editValue);
                                  if (!isNaN(val) && val > 0) {
                                    // recalculate riskAmount based on the new position size
                                    const riskPct = Math.abs(entry.entry - entry.sl) / entry.entry;
                                    editJournalEntry(entry.id, { 
                                      suggestedPosition: val, 
                                      riskAmount: val * riskPct 
                                    });
                                  }
                                  setEditingId(null);
                                }}
                                className="p-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                              >
                                <Check size={12} />
                              </button>
                              <button 
                                onClick={() => setEditingId(null)}
                                className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <span 
                              className="font-semibold text-[#e5e7eb] flex items-center gap-1.5 group cursor-pointer hover:text-white"
                              onClick={() => {
                                setEditValue(entry.suggestedPosition.toFixed(2));
                                setEditingId(entry.id);
                              }}
                            >
                              {formatCurrency(entry.suggestedPosition)}
                              <Edit2 size={10} className="text-[#64748b] group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#94a3b8] cursor-help" title="How much you lose if Stop Loss is hit">Risk at SL</span>
                          <span className="font-semibold text-[#fca5a5]">{formatCurrency(entry.riskAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#94a3b8]">Reward-to-risk</span>
                          <span className="font-semibold text-[#e5e7eb]">{rr.toFixed(2)}R</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#94a3b8]">Confidence</span>
                          <span className="font-semibold text-[#e5e7eb]">{entry.confidence}%</span>
                        </div>
                      </div>

                      {/* Break-even CTA — only for active pending trades */}
                      {entry.taken && entry.outcome === 'pending' && (
                        <div className="mt-4 pt-4 border-t border-white/[0.05]">
                          {entry.breakEvenTriggered ? (
                            <div className="flex items-center gap-2 text-[12px] text-[#86efac]">
                              <ShieldCheck size={14} />
                              <span className="font-semibold">Break-even active</span>
                              <span className="text-[#475569]">— SL moved to entry price</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => triggerBreakEven(entry.id)}
                              className="w-full h-8 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#86efac] text-[11px] font-semibold hover:bg-[#22c55e]/20 transition-colors flex items-center justify-center gap-2"
                              title="Move stop loss to entry price — risk-free from here"
                            >
                              <ShieldCheck size={13} />
                              Set Break-Even
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-8 text-center">
            <Clock size={22} className="mx-auto text-[#64748b]" />
            <h2 className="mt-3 text-lg font-bold text-[#f8fafc]">No trades logged for this date</h2>
            <p className="mt-2 text-sm text-[#94a3b8]">Trades logged from the dashboard will appear here with price and P/L details.</p>
          </section>
        )}
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  );
}
