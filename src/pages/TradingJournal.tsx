import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Activity, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Trophy } from 'lucide-react';
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav';
import { useTradingContextStore, type JournalEntry } from '@/stores/useTradingContextStore';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function pad(num: number) {
  return num < 10 ? `0${num}` : `${num}`;
}

function dateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMonth(year: number, month: number) {
  return new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function formatDayLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getEntryTone(entries: JournalEntry[]) {
  if (entries.some((entry) => entry.outcome === 'win')) return 'border-[#22c55e]/60 bg-[#22c55e]/10 text-[#bbf7d0]';
  if (entries.some((entry) => entry.outcome === 'loss')) return 'border-[#ef4444]/55 bg-[#ef4444]/10 text-[#fecaca]';
  if (entries.some((entry) => entry.outcome === 'pending')) return 'border-[#3b82f6]/60 bg-[#3b82f6]/10 text-[#bfdbfe]';
  return 'border-[#f59e0b]/55 bg-[#f59e0b]/10 text-[#fde68a]';
}

export default function TradingJournal() {
  const navigate = useNavigate();
  const journal = useTradingContextStore((s) => s.journal);

  const [current, setCurrent] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const today = new Date();
  const todayDateStr = dateKeyFromTimestamp(today.getTime());
  const daysInMonth = getDaysInMonth(current.year, current.month);
  const firstDay = new Date(current.year, current.month, 1).getDay();

  const entriesByDate = useMemo(() => {
    return journal.reduce<Map<string, JournalEntry[]>>((map, entry) => {
      const dateKey = dateKeyFromTimestamp(entry.createdAt);
      const entries = map.get(dateKey) ?? [];
      entries.push(entry);
      map.set(dateKey, entries);
      return map;
    }, new Map());
  }, [journal]);

  const calendarCells = useMemo(() => {
    const cells: Array<{ day: number | null; dateStr: string | null; entries: JournalEntry[] }> = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, dateStr: null, entries: [] });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${current.year}-${pad(current.month + 1)}-${pad(day)}`;
      cells.push({ day, dateStr, entries: entriesByDate.get(dateStr) ?? [] });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dateStr: null, entries: [] });
    }

    return cells;
  }, [current.month, current.year, daysInMonth, entriesByDate, firstDay]);

  const monthEntries = useMemo(() => {
    const prefix = `${current.year}-${pad(current.month + 1)}-`;
    return journal.filter((entry) => dateKeyFromTimestamp(entry.createdAt).startsWith(prefix));
  }, [current.month, current.year, journal]);

  const recentEntries = useMemo(
    () => [...monthEntries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4),
    [monthEntries]
  );

  const stats = useMemo(() => {
    const taken = monthEntries.filter((entry) => entry.taken).length;
    const wins = monthEntries.filter((entry) => entry.outcome === 'win').length;
    const losses = monthEntries.filter((entry) => entry.outcome === 'loss').length;
    const risk = monthEntries.reduce((sum, entry) => sum + entry.riskAmount, 0);

    return { total: monthEntries.length, taken, wins, losses, risk };
  }, [monthEntries]);

  function prevMonth() {
    setCurrent((c) => {
      const month = c.month - 1;
      if (month < 0) return { year: c.year - 1, month: 11 };
      return { year: c.year, month };
    });
  }

  function nextMonth() {
    setCurrent((c) => {
      const month = c.month + 1;
      if (month > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month };
    });
  }

  function goToToday() {
    setCurrent({ year: today.getFullYear(), month: today.getMonth() });
  }

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb]">Trading Journal</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_21rem] gap-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#93c5fd]">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Calendar</p>
                  <h2 className="text-xl font-bold text-[#f8fafc]">{formatMonth(current.year, current.month)}</h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  className="w-9 h-9 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[#94a3b8] hover:text-white hover:border-white/[0.18] inline-flex items-center justify-center transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={goToToday}
                  className="h-9 px-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[12px] font-semibold text-[#cbd5e1] hover:text-white hover:border-white/[0.18] transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={nextMonth}
                  className="w-9 h-9 rounded-lg border border-white/[0.08] bg-[#0b0f17] text-[#94a3b8] hover:text-white hover:border-white/[0.18] inline-flex items-center justify-center transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="p-3 sm:p-5">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="h-8 flex items-center justify-center text-[11px] font-semibold text-[#64748b]">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell, idx) => {
                  const hasEntries = cell.entries.length > 0;
                  const isToday = cell.dateStr === todayDateStr;

                  return (
                    <button
                      key={`${cell.dateStr ?? 'empty'}-${idx}`}
                      onClick={() => cell.dateStr && navigate(`/journal/${cell.dateStr}`)}
                      disabled={!cell.dateStr}
                      className={`min-h-[5.25rem] rounded-lg border p-2 text-left transition-all flex flex-col justify-between
                        ${cell.dateStr ? 'bg-[#0b0f17] border-white/[0.08] hover:border-[#3b82f6]/45 hover:bg-[#111827]' : 'border-transparent bg-transparent cursor-default'}
                        ${hasEntries ? getEntryTone(cell.entries) : ''}
                        ${isToday ? 'ring-1 ring-[#3b82f6] border-[#3b82f6]/45' : ''}
                      `}
                    >
                      {cell.day && (
                        <>
                          <span className={`text-[13px] font-bold ${hasEntries ? 'text-current' : 'text-[#cbd5e1]'}`}>
                            {cell.day}
                          </span>
                          <span className="flex items-center justify-between gap-1">
                            {hasEntries ? (
                              <>
                                <span className="text-[10px] font-semibold">{cell.entries.length} trade{cell.entries.length > 1 ? 's' : ''}</span>
                                <span className="flex gap-1">
                                  {cell.entries.slice(0, 3).map((entry) => (
                                    <span
                                      key={entry.id}
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        entry.outcome === 'win'
                                          ? 'bg-[#22c55e]'
                                          : entry.outcome === 'loss'
                                            ? 'bg-[#ef4444]'
                                            : entry.outcome === 'pending'
                                              ? 'bg-[#3b82f6]'
                                              : 'bg-[#f59e0b]'
                                      }`}
                                    />
                                  ))}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] text-[#475569]">{isToday ? 'Today' : ''}</span>
                            )}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Month Summary</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <Activity size={15} className="text-[#93c5fd]" />
                  <p className="mt-3 text-2xl font-bold">{stats.total}</p>
                  <p className="text-[11px] text-[#64748b]">Logged</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <Trophy size={15} className="text-[#86efac]" />
                  <p className="mt-3 text-2xl font-bold">{stats.wins}</p>
                  <p className="text-[11px] text-[#64748b]">Wins</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <CircleDollarSign size={15} className="text-[#fde68a]" />
                  <p className="mt-3 text-2xl font-bold">${Math.round(stats.risk).toLocaleString()}</p>
                  <p className="text-[11px] text-[#64748b]">Risked</p>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
                  <Activity size={15} className="text-[#fca5a5]" />
                  <p className="mt-3 text-2xl font-bold">{stats.losses}</p>
                  <p className="text-[11px] text-[#64748b]">Losses</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Recent Entries</p>
              <div className="mt-4 space-y-2">
                {recentEntries.length > 0 ? (
                  recentEntries.map((entry) => {
                    const dateStr = dateKeyFromTimestamp(entry.createdAt);
                    return (
                      <button
                        key={entry.id}
                        onClick={() => navigate(`/journal/${dateStr}`)}
                        className="w-full rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-left hover:border-white/[0.18] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-semibold text-[#e5e7eb]">{entry.symbol}</span>
                          <span className="text-[10px] text-[#64748b]">{formatDayLabel(dateStr)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#94a3b8]">
                          {entry.action} {entry.timeframe} - {entry.outcome}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4 text-[12px] text-[#64748b]">
                    No entries in {formatMonth(current.year, current.month)}.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  );
}
