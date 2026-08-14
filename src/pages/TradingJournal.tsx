import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Trophy,
  BookOpenCheck,
  TrendingUp,
  TrendingDown,
  ChevronRight as ArrowRightIcon,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useTradingContextStore, type JournalEntry } from '@/stores/useTradingContextStore'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function pad(num: number) {
  return num < 10 ? `0${num}` : `${num}`
}

function dateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatMonth(year: number, month: number) {
  return new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })
}

function formatDayLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function getEntryTone(entries: JournalEntry[]) {
  if (entries.some((entry) => entry.outcome === 'win')) return 'border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-400'
  if (entries.some((entry) => entry.outcome === 'loss')) return 'border-rose-500/40 bg-rose-500/[0.06] text-rose-400'
  if (entries.some((entry) => entry.outcome === 'pending')) return 'border-blue-500/40 bg-blue-500/[0.06] text-blue-400'
  return 'border-amber-500/40 bg-amber-500/[0.06] text-amber-400'
}

export default function TradingJournal() {
  const navigate = useNavigate()
  const journal = useTradingContextStore((s) => s.journal)

  const [current, setCurrent] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const today = new Date()
  const todayDateStr = dateKeyFromTimestamp(today.getTime())
  const daysInMonth = getDaysInMonth(current.year, current.month)
  const firstDay = new Date(current.year, current.month, 1).getDay()

  const entriesByDate = useMemo(() => {
    return journal.reduce<Map<string, JournalEntry[]>>((map, entry) => {
      const dateKey = dateKeyFromTimestamp(entry.createdAt)
      const entries = map.get(dateKey) ?? []
      entries.push(entry)
      map.set(dateKey, entries)
      return map
    }, new Map())
  }, [journal])

  const calendarCells = useMemo(() => {
    const cells: Array<{ day: number | null; dateStr: string | null; entries: JournalEntry[] }> = []

    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, dateStr: null, entries: [] })
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${current.year}-${pad(current.month + 1)}-${pad(day)}`
      cells.push({ day, dateStr, entries: entriesByDate.get(dateStr) ?? [] })
    }

    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dateStr: null, entries: [] })
    }

    return cells
  }, [current.month, current.year, daysInMonth, entriesByDate, firstDay])

  const monthEntries = useMemo(() => {
    const prefix = `${current.year}-${pad(current.month + 1)}-`
    return journal.filter((entry) => dateKeyFromTimestamp(entry.createdAt).startsWith(prefix))
  }, [current.month, current.year, journal])

  const recentEntries = useMemo(
    () => [...monthEntries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    [monthEntries]
  )

  const stats = useMemo(() => {
    const takenEntries = monthEntries.filter((entry) => entry.taken)
    const systemEntries = monthEntries.filter((entry) => !entry.taken)

    const wins = takenEntries.filter((entry) => entry.outcome === 'win').length
    const losses = takenEntries.filter((entry) => entry.outcome === 'loss').length
    const risk = takenEntries.reduce((sum, entry) => sum + entry.riskAmount, 0)

    const sysWins = systemEntries.filter((entry) => entry.outcome === 'win').length
    const sysLosses = systemEntries.filter((entry) => entry.outcome === 'loss').length

    return { total: takenEntries.length, wins, losses, risk, sysWins, sysLosses, sysTotal: systemEntries.length }
  }, [monthEntries])

  function prevMonth() {
    setCurrent((c) => {
      const month = c.month - 1
      if (month < 0) return { year: c.year - 1, month: 11 }
      return { year: c.year, month }
    })
  }

  function nextMonth() {
    setCurrent((c) => {
      const month = c.month + 1
      if (month > 11) return { year: c.year + 1, month: 0 }
      return { year: c.year, month }
    })
  }

  function goToToday() {
    setCurrent({ year: today.getFullYear(), month: today.getMonth() })
  }

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
              <span className="text-[11px] font-semibold text-slate-200 truncate">Trading Journal</span>
            </div>
          </div>
        </div>

        <DesktopWorkspaceNav />
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* UNIFIED CONTIGUOUS TERMINAL WORKSPACE CONTAINER (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top Banner & Monthly Stats Strip */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Performance Logbook
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Execution Journal & Monthly Performance
              </h1>
              <p className="text-[12px] sm:text-[13px] text-slate-400 leading-relaxed">
                Click any calendar date to review executed signals, risk management metrics, position sizes, and profit/loss outcomes.
              </p>
            </div>

            {/* Metrics Strip */}
            <div className="flex flex-col gap-3 w-full xl:w-auto xl:min-w-[34rem]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-lg bg-[#070b12] border border-blue-500/20 text-center sm:text-left">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">System Accuracy</p>
                  <div className="flex items-end gap-1 mt-1">
                    <p className="text-lg font-bold text-white tabular-nums">{stats.sysTotal > 0 ? Math.round((stats.sysWins / stats.sysTotal) * 100) : 0}%</p>
                    <span className="text-[10px] text-slate-400 mb-1">({stats.sysTotal} signals)</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#070b12] border border-emerald-500/10 text-center sm:text-left">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-emerald-500/70">System Wins</p>
                  <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums">{stats.sysWins}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-[#070b12] border border-rose-500/10 text-center sm:text-left">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-rose-500/70">System Losses</p>
                  <p className="mt-1 text-lg font-bold text-rose-400 tabular-nums">{stats.sysLosses}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center sm:text-left">
                  <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Total Risked</p>
                  <p className="mt-1 text-lg font-bold text-amber-400 tabular-nums">${Math.round(stats.risk).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Toolbar inside container */}
          <div className="p-4 bg-[#070b12]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#090d14] border border-white/[0.1] flex items-center justify-center text-blue-400">
                <CalendarDays size={16} />
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Selected Month</span>
                <h2 className="text-base font-bold text-white leading-tight">{formatMonth(current.year, current.month)}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-lg border border-white/[0.08] bg-[#090d14] text-slate-400 hover:text-white hover:border-white/[0.18] inline-flex items-center justify-center transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToToday}
                className="h-8 px-3 rounded-lg border border-white/[0.08] bg-[#090d14] text-[11px] font-bold text-slate-300 hover:text-white hover:border-white/[0.18] transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-lg border border-white/[0.08] bg-[#090d14] text-slate-400 hover:text-white hover:border-white/[0.18] inline-flex items-center justify-center transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Performance Calendar Grid (Contiguous, High Density) */}
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-7 gap-1.5 mb-2 text-center">
              {WEEKDAYS.map((day) => (
                <div key={day} className="h-7 flex items-center justify-center text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                const hasEntries = cell.entries.length > 0
                const isToday = cell.dateStr === todayDateStr

                return (
                  <button
                    key={`${cell.dateStr ?? 'empty'}-${idx}`}
                    onClick={() => cell.dateStr && navigate(`/journal/${cell.dateStr}`)}
                    disabled={!cell.dateStr}
                    className={cn(
                      "min-h-[5.5rem] rounded-lg border p-2 text-left transition-all flex flex-col justify-between group",
                      cell.dateStr
                        ? "bg-[#05080f] border-white/[0.06] hover:border-blue-500/40 hover:bg-[#070b12]"
                        : "border-transparent bg-transparent cursor-default",
                      hasEntries ? getEntryTone(cell.entries) : "",
                      isToday ? "ring-1 ring-blue-500 border-blue-500/50" : ""
                    )}
                  >
                    {cell.day && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className={cn("text-[12px] font-extrabold", hasEntries ? "text-current" : "text-slate-300")}>
                            {cell.day}
                          </span>
                          {isToday && (
                            <span className="text-[8px] font-extrabold uppercase tracking-wider px-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              Today
                            </span>
                          )}
                        </div>

                        {hasEntries ? (
                          <div className="space-y-1">
                            <span className="block text-[10px] font-bold">
                              {cell.entries.length} {cell.entries.length === 1 ? 'trade' : 'trades'}
                            </span>
                            <div className="flex gap-1">
                              {cell.entries.slice(0, 4).map((entry) => (
                                <span
                                  key={entry.id}
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    entry.outcome === 'win'
                                      ? 'bg-emerald-400'
                                      : entry.outcome === 'loss'
                                      ? 'bg-rose-400'
                                      : entry.outcome === 'pending'
                                      ? 'bg-blue-400'
                                      : 'bg-amber-400'
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            View Date
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bottom Recent Entries Stream */}
          <div className="p-4 sm:p-5 bg-[#05080f]/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-white">Recent Journal Entries</h3>
              <span className="text-[10px] font-bold text-slate-500">{monthEntries.length} logged this month</span>
            </div>

            {recentEntries.length > 0 ? (
              <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-[#070b12] overflow-hidden">
                {recentEntries.map((entry) => {
                  const dateStr = dateKeyFromTimestamp(entry.createdAt)
                  const isBuy = entry.action === 'BUY'

                  return (
                    <button
                      key={entry.id}
                      onClick={() => navigate(`/journal/${dateStr}`)}
                      className="w-full p-3 text-left hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-black uppercase border shrink-0",
                            isBuy
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          )}
                        >
                          {entry.action}
                        </span>
                        <span className="text-[12px] font-bold text-white">{entry.symbol}</span>
                        <span className="text-[10px] text-slate-400 font-medium">{entry.timeframe}</span>
                        <span className="text-[10px] text-slate-500">· {formatDayLabel(dateStr)}</span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase border",
                            entry.outcome === 'win'
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                              : entry.outcome === 'loss'
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                              : "bg-white/[0.04] text-slate-400 border-white/[0.08]"
                          )}
                        >
                          {entry.outcome}
                        </span>
                        <ArrowRightIcon size={12} className="text-slate-500 group-hover:text-white transition-colors" />
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 p-4 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                No trades logged in {formatMonth(current.year, current.month)} yet. Signals taken from the chart will automatically log here.
              </p>
            )}
          </div>
        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
