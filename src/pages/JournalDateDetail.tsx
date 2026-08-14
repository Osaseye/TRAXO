import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router'
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Edit2,
  Check,
  X,
  ShieldCheck,
  BookOpenCheck,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useTradingContextStore, type JournalEntry } from '@/stores/useTradingContextStore'
import { cn } from '@/lib/utils'

function pad(num: number) {
  return num < 10 ? `0${num}` : `${num}`
}

function dateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatCurrency(value: number) {
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function formatPrice(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
    minimumFractionDigits: 2,
  })
}

function estimatePnl(entry: JournalEntry) {
  if (!entry.taken || entry.outcome === 'skipped' || entry.outcome === 'pending') return null
  if (entry.outcome === 'loss') return -entry.riskAmount
  if (entry.outcome === 'breakeven') return 0

  const riskDistance = Math.abs(entry.entry - entry.sl)
  const rewardDistance = Math.abs(entry.tp - entry.entry)
  const rewardToRisk = riskDistance > 0 ? rewardDistance / riskDistance : 0
  return entry.riskAmount * rewardToRisk
}

function outcomeTone(entry: JournalEntry) {
  if (!entry.taken || entry.outcome === 'skipped') return 'border-slate-500/30 bg-slate-500/10 text-slate-300'
  if (entry.outcome === 'win') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  if (entry.outcome === 'loss') return 'border-rose-500/30 bg-rose-500/10 text-rose-400'
  if (entry.outcome === 'breakeven') return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
  return 'border-blue-500/30 bg-blue-500/10 text-blue-400'
}

function pnlTone(value: number | null) {
  if (value == null) return 'text-slate-400'
  if (value > 0) return 'text-emerald-400'
  if (value < 0) return 'text-rose-400'
  return 'text-white'
}

function getRewardToRisk(entry: JournalEntry) {
  const riskDistance = Math.abs(entry.entry - entry.sl)
  const rewardDistance = Math.abs(entry.tp - entry.entry)
  return riskDistance > 0 ? rewardDistance / riskDistance : 0
}

export default function JournalDateDetail() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const journal = useTradingContextStore((s) => s.journal)
  const editJournalEntry = useTradingContextStore((s) => s.editJournalEntry)
  const triggerBreakEven = useTradingContextStore((s) => s.triggerBreakEven)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const entries = useMemo(
    () =>
      journal
        .filter((entry) => date && dateKeyFromTimestamp(entry.createdAt) === date)
        .sort((a, b) => b.createdAt - a.createdAt),
    [date, journal]
  )

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        const pnl = estimatePnl(entry)
        return {
          trades: acc.trades + 1,
          wins: acc.wins + (entry.outcome === 'win' ? 1 : 0),
          losses: acc.losses + (entry.outcome === 'loss' ? 1 : 0),
          pending: acc.pending + (entry.outcome === 'pending' ? 1 : 0),
          pnl: acc.pnl + (pnl ?? 0),
        }
      },
      { trades: 0, wins: 0, losses: 0, pending: 0, pnl: 0 }
    )
  }, [entries])

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 selection:bg-blue-500/20">
      {/* Header Bar */}
      <header className="h-14 border-b border-white/[0.08] bg-[#070709]/95 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-[#0d1117] border border-white/[0.12] flex items-center justify-center group-hover:border-white/[0.25] transition-colors">
              <img src="/TRAXO-icon.png" alt="TRAXO" className="w-4 h-4 object-contain" />
            </div>
            <span className="text-[11px] font-black tracking-[0.22em] uppercase text-white hidden sm:inline">
              TRAXO
            </span>
          </div>

          <span className="h-4 w-px bg-white/[0.1] hidden sm:block shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1117] border border-white/[0.08]">
              <BookOpenCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-200 truncate">Date Breakdown: {date}</span>
            </div>
          </div>
        </div>

        <DesktopWorkspaceNav />
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <button
          onClick={() => navigate('/journal')}
          className="h-8 px-3 rounded-lg border border-white/[0.08] bg-[#090d14] text-[11px] font-bold text-slate-400 hover:text-white hover:border-white/[0.18] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={13} />
          <span>Back to Performance Calendar</span>
        </button>

        {/* UNIFIED CONTIGUOUS WORKSPACE CONTAINER (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top Banner & Date Metrics Strip */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-1">
              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Daily Execution Log
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">Trading Log for {date}</h1>
              <p className="text-xs text-slate-400">Review price levels, position sizes, risk parameters, and estimated P/L for trades on this date.</p>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto xl:min-w-[34rem]">
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Total Trades</p>
                <p className="mt-1 text-lg font-bold text-white tabular-nums">{summary.trades}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Wins</p>
                <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums">{summary.wins}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Losses</p>
                <p className="mt-1 text-lg font-bold text-rose-400 tabular-nums">{summary.losses}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Est. P/L</p>
                <p className={cn("mt-1 text-lg font-bold tabular-nums", pnlTone(summary.pnl))}>{formatCurrency(summary.pnl)}</p>
              </div>
            </div>
          </div>

          {/* Trade Rows Stream (Contiguous, Zero Floating Cards) */}
          <div className="divide-y divide-white/[0.06]">
            
            {/* 1. PERSONAL TRADES SECTION */}
            {entries.filter(e => e.taken).length > 0 && (
              <div className="p-3 sm:p-4 bg-white/[0.02] border-b border-white/[0.06]">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Target size={16} className="text-blue-400" />
                  Trades Taken
                </h2>
              </div>
            )}
            
            {entries.filter(e => e.taken).map((entry, index) => {
              const pnl = estimatePnl(entry)
              const rr = getRewardToRisk(entry)
              const settledLabel = pnl == null ? 'Not settled' : formatCurrency(pnl)

              return (
                <article key={entry.id} className="p-5 bg-[#090d14]/60 space-y-4 hover:bg-white/[0.01] transition-colors">
                  <div className="grid grid-cols-1 xl:grid-cols-[16rem_1fr_18rem] gap-5 items-start">
                    
                    {/* Column 1: Trade Identity */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Manual Trade</span>
                        <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase border", outcomeTone(entry))}>
                          {entry.outcome}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">{entry.symbol}</h3>
                          <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
                            {entry.timeframe}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{entry.strategy}</p>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-400">
                        <div className="flex justify-between">
                          <span>Direction:</span>
                          <span className={entry.action === 'BUY' ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
                            {entry.action}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Time Logged:</span>
                          <span className="font-medium text-slate-200">
                            {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Price Levels Grid */}
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Price Execution Levels</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-lg bg-[#05080f] border border-white/[0.06]">
                          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Entry Price</span>
                          <span className="text-[13px] font-bold text-slate-200 tabular-nums mt-0.5 block">{formatPrice(entry.entry)}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[#05080f] border border-white/[0.06]">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Stop Loss</span>
                            {entry.breakEvenTriggered && (
                              <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1 rounded">
                                BE
                              </span>
                            )}
                          </div>
                          <span className="text-[13px] font-bold text-rose-400 tabular-nums mt-0.5 block">{formatPrice(entry.currentSl ?? entry.sl)}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[#05080f] border border-white/[0.06]">
                          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Take Profit</span>
                          <span className="text-[13px] font-bold text-emerald-400 tabular-nums mt-0.5 block">{formatPrice(entry.tp)}</span>
                        </div>
                      </div>

                      {entry.notes && (
                        <div className="p-2.5 rounded-lg bg-[#05080f] border border-white/[0.06] text-[11px] text-slate-300">
                          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Trader Notes</span>
                          {entry.notes}
                        </div>
                      )}
                    </div>

                    {/* Column 3: PnL Result & Position Editor */}
                    <div className="p-4 rounded-lg bg-[#05080f] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">P/L Outcome</span>
                        {pnl != null && pnl >= 0 ? (
                          <TrendingUp size={16} className={pnl > 0 ? 'text-emerald-400' : 'text-slate-400'} />
                        ) : (
                          <TrendingDown size={16} className="text-rose-400" />
                        )}
                      </div>

                      <div>
                        <span className={cn("text-xl font-bold tabular-nums block", pnlTone(pnl))}>{settledLabel}</span>
                      </div>

                      <div className="space-y-1.5 text-[11px] text-slate-400 pt-2 border-t border-white/[0.06]">
                        <div className="flex items-center justify-between">
                          <span>Position Size:</span>
                          {editingId === entry.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                className="h-6 w-20 bg-[#090d14] border border-blue-500/50 rounded px-1 text-right text-white text-[11px] focus:outline-none"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                              />
                              <button
                                onClick={() => {
                                  const val = Number(editValue)
                                  if (!isNaN(val) && val > 0) {
                                    const riskPct = Math.abs(entry.entry - entry.sl) / entry.entry
                                    editJournalEntry(entry.id, {
                                      suggestedPosition: val,
                                      riskAmount: val * riskPct,
                                    })
                                  }
                                  setEditingId(null)
                                }}
                                className="p-1 rounded bg-blue-500/20 text-blue-400"
                              >
                                <Check size={10} />
                              </button>
                            </div>
                          ) : (
                            <span
                              className="font-bold text-slate-200 flex items-center gap-1 cursor-pointer hover:text-white"
                              onClick={() => {
                                setEditValue(entry.suggestedPosition.toFixed(2))
                                setEditingId(entry.id)
                              }}
                            >
                              {formatCurrency(entry.suggestedPosition)}
                              <Edit2 size={10} className="text-slate-500" />
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span>Risk Amount:</span>
                          <span className="font-bold text-rose-400">{formatCurrency(entry.riskAmount)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span>Risk-to-Reward:</span>
                          <span className="font-bold text-blue-400">{rr.toFixed(1)}x</span>
                        </div>
                      </div>

                      {/* Break-Even CTA */}
                      {entry.taken && entry.outcome === 'pending' && (
                        <div className="pt-2 border-t border-white/[0.06]">
                          {entry.breakEvenTriggered ? (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                              <ShieldCheck size={13} />
                              <span>Break-Even Active</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => triggerBreakEven(entry.id)}
                              className="w-full h-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <ShieldCheck size={12} />
                              <span>Set Break-Even SL</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </article>
              )
            })}

            {/* 2. SYSTEM WINS SECTION */}
            {entries.filter(e => !e.taken && e.outcome === 'win').length > 0 && (
              <div className="p-3 sm:p-4 bg-emerald-500/[0.02] border-y border-white/[0.06]">
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp size={16} />
                  System Wins
                </h2>
              </div>
            )}
            
            {entries.filter(e => !e.taken && e.outcome === 'win').map((entry) => (
              <article key={entry.id} className="p-4 sm:p-5 bg-[#090d14]/40 hover:bg-white/[0.01] transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="px-2 py-1 rounded text-[10px] font-black uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shrink-0">
                    {entry.action} WIN
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{entry.symbol}</h3>
                      <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
                        {entry.timeframe}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{entry.strategy}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 md:gap-6 shrink-0 w-full md:w-auto">
                  <div className="text-center md:text-right">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Confidence</span>
                    <span className="text-xs font-bold text-blue-400 tabular-nums">{entry.confidence}%</span>
                  </div>
                  <div className="text-center md:text-right">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">R:R Ratio</span>
                    <span className="text-xs font-bold text-slate-200 tabular-nums">{getRewardToRisk(entry).toFixed(1)}x</span>
                  </div>
                  <div className="text-center md:text-right">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Time Logged</span>
                    <span className="text-xs font-bold text-slate-400">
                      {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </article>
            ))}

            {/* 3. SYSTEM LOSSES SECTION */}
            {entries.filter(e => !e.taken && e.outcome === 'loss').length > 0 && (
              <div className="p-3 sm:p-4 bg-rose-500/[0.02] border-y border-white/[0.06]">
                <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <TrendingDown size={16} />
                  System Losses
                </h2>
              </div>
            )}
            
            {entries.filter(e => !e.taken && e.outcome === 'loss').map((entry) => (
              <article key={entry.id} className="p-4 sm:p-5 bg-[#090d14]/40 hover:bg-white/[0.01] transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="px-2 py-1 rounded text-[10px] font-black uppercase border bg-rose-500/10 text-rose-400 border-rose-500/30 shrink-0">
                    {entry.action} LOSS
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{entry.symbol}</h3>
                      <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
                        {entry.timeframe}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{entry.strategy}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 md:gap-6 shrink-0 w-full md:w-auto">
                  <div className="text-center md:text-right">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Confidence</span>
                    <span className="text-xs font-bold text-blue-400 tabular-nums">{entry.confidence}%</span>
                  </div>
                  <div className="text-center md:text-right">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">R:R Ratio</span>
                    <span className="text-xs font-bold text-slate-200 tabular-nums">{getRewardToRisk(entry).toFixed(1)}x</span>
                  </div>
                  <div className="text-center md:text-right">
                    <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Time Logged</span>
                    <span className="text-xs font-bold text-slate-400">
                      {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </article>
            ))}

            {entries.length === 0 && (
              <div className="p-12 text-center space-y-2">
                <Clock size={20} className="mx-auto text-slate-500" />
                <h3 className="text-sm font-bold text-white">No trades logged for this date</h3>
                <p className="text-[11px] text-slate-400">Trades taken on the chart automatically log to this calendar date.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
