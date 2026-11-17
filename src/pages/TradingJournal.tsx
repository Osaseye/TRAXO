import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PiArrowUpRight,
  PiCalendarBlank,
  PiCaretLeft,
  PiCaretRight,
  PiCoins,
  PiDownloadSimple,
  PiMagnifyingGlass,
  PiNotebook,
  PiShield,
  PiTrash,
  PiTrophy,
  PiWarningCircle,
} from 'react-icons/pi'
import { updateJournalEntry } from '@/lib/api'
import {
  useTradingContextStore,
  type JournalEntry,
  type JournalOutcome,
} from '@/stores/useTradingContextStore'

type JournalScope = 'taken' | 'all'

interface TradeMetrics {
  rr: number
  pnlUsd: number
  pnlR: number
}

function toDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatPrice(val: number): string {
  if (!Number.isFinite(val)) return '—'
  if (val >= 100) return val.toFixed(2)
  if (val >= 10) return val.toFixed(3)
  return val.toFixed(5)
}

function formatSignedUsd(val: number): string {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (val > 0) return `+$${abs}`
  if (val < 0) return `-$${abs}`
  return `$${abs}`
}

function computeEntryMetrics(entry: JournalEntry): TradeMetrics {
  const riskDist = Math.abs(entry.entry - entry.sl)
  const rewardDist = Math.abs(entry.tp - entry.entry)
  const rr = riskDist > 0 ? rewardDist / riskDist : 0

  if (entry.outcome === 'win') {
    const pnlUsd = entry.riskAmount > 0 ? entry.riskAmount * rr : 0
    return { rr, pnlUsd, pnlR: rr }
  }
  if (entry.outcome === 'loss') {
    const pnlUsd = entry.riskAmount > 0 ? -entry.riskAmount : 0
    return { rr, pnlUsd, pnlR: -1 }
  }
  return { rr, pnlUsd: 0, pnlR: 0 }
}

function extractTagsFromNotes(notes?: string): string[] {
  if (!notes) return []
  const matches = notes.match(/#[a-zA-Z0-9_-]+/g)
  return matches ? Array.from(new Set(matches)) : []
}

export default function TradingJournal() {
  const navigate = useNavigate()
  const journal = useTradingContextStore((s) => s.journal)
  const editJournalEntry = useTradingContextStore((s) => s.editJournalEntry)
  const deleteJournalEntry = useTradingContextStore((s) => s.deleteJournalEntry)
  const triggerBreakEven = useTradingContextStore((s) => s.triggerBreakEven)

  const [scope, setScope] = useState<JournalScope>('taken')
  const [search, setSearch] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | JournalOutcome>('ALL')
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')

  const [todayKey] = useState(() => toDateKey(Date.now()))
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  const scopedEntries = useMemo(() => {
    return scope === 'taken' ? journal.filter((j) => j.taken) : journal
  }, [journal, scope])

  // Global KPI metrics across scoped entries
  const kpis = useMemo(() => {
    let wins = 0
    let losses = 0
    let breakeven = 0
    let pending = 0
    let grossWinUsd = 0
    let grossLossUsd = 0
    let netUsd = 0
    let grossWinR = 0
    let grossLossR = 0
    let netR = 0

    for (const entry of scopedEntries) {
      if (entry.outcome === 'pending') {
        pending += 1
        continue
      }
      if (entry.outcome === 'skipped') continue

      const m = computeEntryMetrics(entry)
      if (entry.outcome === 'win') {
        wins += 1
        grossWinUsd += m.pnlUsd
        netUsd += m.pnlUsd
        grossWinR += m.pnlR
        netR += m.pnlR
      } else if (entry.outcome === 'loss') {
        losses += 1
        grossLossUsd += Math.abs(m.pnlUsd)
        netUsd += m.pnlUsd
        grossLossR += Math.abs(m.pnlR)
        netR += m.pnlR
      } else if (entry.outcome === 'breakeven') {
        breakeven += 1
      }
    }

    const decided = wins + losses
    const settled = wins + losses + breakeven
    const winRate = decided > 0 ? (wins / decided) * 100 : 0

    const useUsdPf = grossWinUsd > 0 || grossLossUsd > 0
    const profitFactor = useUsdPf
      ? grossLossUsd > 0
        ? (grossWinUsd / grossLossUsd).toFixed(2)
        : grossWinUsd > 0
          ? 'INF'
          : '0.00'
      : grossLossR > 0
        ? (grossWinR / grossLossR).toFixed(2)
        : grossWinR > 0
          ? 'INF'
          : '0.00'

    const expectancyUsd = settled > 0 ? netUsd / settled : 0
    const expectancyR = settled > 0 ? netR / settled : 0

    return {
      wins,
      losses,
      breakeven,
      pending,
      settled,
      winRate,
      netUsd,
      netR,
      profitFactor,
      expectancyUsd,
      expectancyR,
    }
  }, [scopedEntries])

  // Calendar aggregation keyed by YYYY-MM-DD
  const dayBuckets = useMemo(() => {
    const map = new Map<
      string,
      { netUsd: number; netR: number; wins: number; losses: number; count: number; entries: JournalEntry[] }
    >()
    for (const entry of scopedEntries) {
      const key = toDateKey(entry.createdAt)
      const bucket = map.get(key) || {
        netUsd: 0,
        netR: 0,
        wins: 0,
        losses: 0,
        count: 0,
        entries: [],
      }
      bucket.count += 1
      bucket.entries.push(entry)
      const m = computeEntryMetrics(entry)
      bucket.netUsd += m.pnlUsd
      bucket.netR += m.pnlR
      if (entry.outcome === 'win') bucket.wins += 1
      if (entry.outcome === 'loss') bucket.losses += 1
      map.set(key, bucket)
    }
    return map
  }, [scopedEntries])

  // Build calendar cells for current month (Sun-Sat grid matching journal-empty benchmark)
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const startOffset = firstDay.getDay()

    const cells: Array<{
      day: number | null
      dateKey: string | null
      isToday: boolean
      netUsd: number
      netR: number
      wins: number
      losses: number
      count: number
    }> = []

    for (let i = 0; i < startOffset; i += 1) {
      cells.push({
        day: null,
        dateKey: null,
        isToday: false,
        netUsd: 0,
        netR: 0,
        wins: 0,
        losses: 0,
        count: 0,
      })
    }

    for (let d = 1; d <= daysInMonth; d += 1) {
      const mStr = String(viewMonth + 1).padStart(2, '0')
      const dStr = String(d).padStart(2, '0')
      const dateKey = `${viewYear}-${mStr}-${dStr}`
      const bucket = dayBuckets.get(dateKey)
      cells.push({
        day: d,
        dateKey,
        isToday: dateKey === todayKey,
        netUsd: bucket?.netUsd ?? 0,
        netR: bucket?.netR ?? 0,
        wins: bucket?.wins ?? 0,
        losses: bucket?.losses ?? 0,
        count: bucket?.count ?? 0,
      })
    }

    return cells
  }, [viewYear, viewMonth, dayBuckets, todayKey])

  // Month-scoped summary metrics & recent entries for the visible month
  const monthEntries = useMemo(() => {
    return scopedEntries
      .filter((entry) => {
        const d = new Date(entry.createdAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [scopedEntries, viewYear, viewMonth])

  const monthSummary = useMemo(() => {
    let wins = 0
    let losses = 0
    let netUsd = 0
    let netR = 0
    let winDays = 0
    let lossDays = 0

    for (const entry of monthEntries) {
      const m = computeEntryMetrics(entry)
      netUsd += m.pnlUsd
      netR += m.pnlR
      if (entry.outcome === 'win') wins += 1
      else if (entry.outcome === 'loss') losses += 1
    }

    for (const c of calendarCells) {
      if (!c.dateKey || c.count === 0) continue
      if (c.netUsd > 0 || (c.netUsd === 0 && c.netR > 0)) winDays += 1
      else if (c.netUsd < 0 || (c.netUsd === 0 && c.netR < 0)) lossDays += 1
    }

    const decided = wins + losses
    const winRate = decided > 0 ? (wins / decided) * 100 : 0

    return {
      logged: monthEntries.length,
      wins,
      losses,
      winRate,
      netUsd,
      netR,
      winDays,
      lossDays,
    }
  }, [monthEntries, calendarCells])

  const recentEntries = useMemo(() => {
    return monthEntries.slice(0, 4)
  }, [monthEntries])

  const filteredTableEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scopedEntries
      .filter((entry) => {
        if (outcomeFilter !== 'ALL' && entry.outcome !== outcomeFilter) return false
        if (directionFilter !== 'ALL' && entry.action !== directionFilter) return false
        if (q) {
          const hay = `${entry.symbol} ${entry.strategy} ${entry.timeframe} ${entry.notes || ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [scopedEntries, outcomeFilter, directionFilter, search])

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const handleOutcomeChange = (entry: JournalEntry, outcome: JournalOutcome) => {
    const updated: JournalEntry = { ...entry, outcome }
    const m = computeEntryMetrics(updated)
    editJournalEntry(entry.id, { outcome })
    updateJournalEntry(entry.id, { outcome, pnlUsd: m.pnlUsd }).catch(() => {})
  }

  const handleToggleTaken = (entry: JournalEntry) => {
    editJournalEntry(entry.id, { taken: !entry.taken })
  }

  const handleExportCsv = () => {
    const header = [
      'Date',
      'Symbol',
      'Timeframe',
      'Strategy',
      'Side',
      'Entry',
      'SL',
      'TP',
      'RiskUSD',
      'Outcome',
      'NetUSD',
      'NetR',
      'Taken',
      'Notes',
    ]
    const rows = filteredTableEntries.map((e) => {
      const m = computeEntryMetrics(e)
      return [
        new Date(e.createdAt).toISOString(),
        e.symbol,
        e.timeframe,
        `"${e.strategy.replace(/"/g, '""')}"`,
        e.action,
        formatPrice(e.entry),
        formatPrice(e.currentSl ?? e.sl),
        formatPrice(e.tp),
        e.riskAmount.toFixed(2),
        e.outcome,
        m.pnlUsd.toFixed(2),
        m.pnlR.toFixed(2),
        e.taken ? 'YES' : 'NO',
        `"${(e.notes || '').replace(/"/g, '""')}"`,
      ]
    })
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `traxo-journal-${toDateKey(Date.now())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const netPnlPositive =
    monthSummary.netUsd > 0 || (monthSummary.netUsd === 0 && monthSummary.netR > 0)
  const netPnlNegative =
    monthSummary.netUsd < 0 || (monthSummary.netUsd === 0 && monthSummary.netR < 0)

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-[#71717A]">Execution Journal</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
                Trading Journal
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#18181B] text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                {scopedEntries.length}
              </span>
            </div>
            <p className="text-[14px] text-[#A1A1AA]">
              Monthly performance matrix, trade execution history, and outcome attribution.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center rounded-full bg-[#111113] border border-white/[0.07] p-1">
              <button
                type="button"
                onClick={() => setScope('taken')}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  scope === 'taken'
                    ? 'bg-[#FAFAFA] text-[#09090B]'
                    : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                }`}
              >
                Taken
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  scope === 'all'
                    ? 'bg-[#FAFAFA] text-[#09090B]'
                    : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                }`}
              >
                All
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredTableEntries.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] disabled:opacity-40 text-[13px] font-medium text-[#FAFAFA] transition-colors"
            >
              <PiDownloadSimple className="h-4 w-4 text-[#A1A1AA]" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Top 2-Column Calendar + Month Summary / Recent Entries */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-6 items-start">
          {/* Left: Calm Calendar Card */}
          <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#161619] flex items-center justify-center text-[#A1A1AA] shrink-0">
                  <PiCalendarBlank className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                    {monthLabel}
                  </h2>
                  <div className="flex items-center gap-2.5 text-[12px] text-[#71717A]">
                    <span
                      className={`font-mono tabular-nums font-medium ${
                        netPnlPositive
                          ? 'text-[#34D399]'
                          : netPnlNegative
                            ? 'text-[#F87171]'
                            : 'text-[#A1A1AA]'
                      }`}
                    >
                      {monthSummary.netUsd !== 0
                        ? formatSignedUsd(monthSummary.netUsd)
                        : `${monthSummary.netR >= 0 ? '+' : ''}${monthSummary.netR.toFixed(2)}R`}
                    </span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">
                      <span className="text-[#34D399]">{monthSummary.winDays}G</span>
                      {' / '}
                      <span className="text-[#F87171]">{monthSummary.lossDays}R</span> days
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                  className="h-9 w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                >
                  <PiCaretLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = new Date()
                    setViewYear(t.getFullYear())
                    setViewMonth(t.getMonth())
                  }}
                  className="h-9 px-3.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  className="h-9 w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                >
                  <PiCaretRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-2 text-center text-[12px] font-medium text-[#71717A]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Day Tiles */}
            <div className="grid grid-cols-7 gap-2">
              {calendarCells.map((cell, idx) => {
                if (!cell.day || !cell.dateKey) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="h-20 sm:h-24 rounded-xl bg-[#0D0D10]"
                    />
                  )
                }

                const isWin = cell.netUsd > 0 || (cell.netUsd === 0 && cell.netR > 0)
                const isLoss = cell.netUsd < 0 || (cell.netUsd === 0 && cell.netR < 0)
                const tileTone = isWin
                  ? 'bg-[#34D399]/[0.09] hover:bg-[#34D399]/[0.14]'
                  : isLoss
                    ? 'bg-[#F87171]/[0.09] hover:bg-[#F87171]/[0.14]'
                    : 'bg-[#161619] hover:bg-[#1D1D22]'

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => navigate(`/journal/${cell.dateKey}`)}
                    className={`h-20 sm:h-24 rounded-xl p-2.5 flex flex-col justify-between text-left transition-colors ${tileTone} ${
                      cell.isToday ? 'ring-1 ring-[#FAFAFA]/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-[12px] font-mono tabular-nums ${
                          cell.isToday ? 'text-[#FAFAFA] font-semibold' : 'text-[#A1A1AA]'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {cell.count > 0 && (
                        <span className="text-[11px] font-mono tabular-nums text-[#71717A]">
                          {cell.count}t
                        </span>
                      )}
                    </div>

                    {cell.count > 0 ? (
                      <div className="space-y-0.5">
                        <div
                          className={`text-[12px] sm:text-[13px] font-mono font-semibold tabular-nums truncate ${
                            isWin
                              ? 'text-[#34D399]'
                              : isLoss
                                ? 'text-[#F87171]'
                                : 'text-[#A1A1AA]'
                          }`}
                        >
                          {cell.netUsd !== 0
                            ? formatSignedUsd(cell.netUsd)
                            : `${cell.netR >= 0 ? '+' : ''}${cell.netR.toFixed(1)}R`}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#71717A] hidden sm:block">
                          {cell.wins}W/{cell.losses}L
                        </div>
                      </div>
                    ) : cell.isToday ? (
                      <span className="text-[11px] font-medium text-[#A1A1AA]">Today</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Right: Month Summary + Recent Entries */}
          <div className="space-y-6">
            {/* Month Summary Card */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-medium text-[#FAFAFA]">Month Summary</h2>
                <span className="text-[12px] text-[#71717A]">{monthLabel}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#161619] p-4 space-y-2">
                  <PiNotebook className="h-4 w-4 text-[#A1A1AA]" />
                  <div>
                    <div className="text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                      {monthSummary.logged}
                    </div>
                    <div className="text-[12px] text-[#71717A]">Logged</div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#161619] p-4 space-y-2">
                  <PiTrophy className="h-4 w-4 text-[#34D399]" />
                  <div>
                    <div className="text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                      {monthSummary.wins}
                    </div>
                    <div className="text-[12px] text-[#71717A]">Wins</div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#161619] p-4 space-y-2">
                  <PiCoins className="h-4 w-4 text-[#A1A1AA]" />
                  <div>
                    <div
                      className={`text-[22px] font-mono font-semibold tabular-nums truncate ${
                        netPnlPositive
                          ? 'text-[#34D399]'
                          : netPnlNegative
                            ? 'text-[#F87171]'
                            : 'text-[#FAFAFA]'
                      }`}
                    >
                      {monthSummary.netUsd !== 0
                        ? formatSignedUsd(monthSummary.netUsd)
                        : `${monthSummary.netR >= 0 ? '+' : ''}${monthSummary.netR.toFixed(1)}R`}
                    </div>
                    <div className="text-[12px] text-[#71717A]">Net P&amp;L</div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#161619] p-4 space-y-2">
                  <PiWarningCircle className="h-4 w-4 text-[#F87171]" />
                  <div>
                    <div className="text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                      {monthSummary.losses}
                    </div>
                    <div className="text-[12px] text-[#71717A]">
                      Losses ·{' '}
                      <span className="font-mono tabular-nums">
                        {monthSummary.winRate.toFixed(0)}%
                      </span>{' '}
                      WR
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between text-[12px] text-[#71717A]">
                <span>All-time expectancy</span>
                <span className="font-mono tabular-nums text-[#A1A1AA]">
                  {kpis.winRate.toFixed(1)}% WR · PF {kpis.profitFactor} ·{' '}
                  {kpis.expectancyR >= 0 ? '+' : ''}
                  {kpis.expectancyR.toFixed(2)}R
                </span>
              </div>
            </section>

            {/* Recent Entries Card */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-medium text-[#FAFAFA]">Recent Entries</h2>
                <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                  {monthEntries.length} in month
                </span>
              </div>

              {recentEntries.length === 0 ? (
                <div className="rounded-xl bg-[#161619] p-6 text-center space-y-3">
                  <img
                    src="/brand/empty-journal.png"
                    alt="Empty journal entries"
                    className="w-full max-w-[210px] mx-auto rounded-xl object-cover opacity-90"
                  />
                  <div className="space-y-1">
                    <p className="text-[14px] font-medium text-[#FAFAFA]">
                      No entries in {monthLabel}
                    </p>
                    <p className="text-[12px] text-[#71717A]">
                      Log trades from Terminal or toggle scope to All to inspect system setups.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentEntries.map((entry) => {
                    const dateKey = toDateKey(entry.createdAt)
                    const m = computeEntryMetrics(entry)
                    const prettyDate = new Date(entry.createdAt).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                    return (
                      <Link
                        key={entry.id}
                        to={`/journal/${dateKey}`}
                        className="block rounded-xl bg-[#161619] hover:bg-[#1D1D22] p-3.5 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-medium text-[#FAFAFA]">
                            {entry.symbol}
                          </span>
                          <span className="text-[12px] text-[#71717A]">{prettyDate}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[12px] text-[#A1A1AA]">
                            <span
                              className={
                                entry.action === 'BUY' ? 'text-[#34D399]' : 'text-[#F87171]'
                              }
                            >
                              {entry.action}
                            </span>{' '}
                            {entry.timeframe} · {entry.strategy}
                          </span>
                          <span
                            className={`text-[12px] font-mono tabular-nums font-medium ${
                              entry.outcome === 'win'
                                ? 'text-[#34D399]'
                                : entry.outcome === 'loss'
                                  ? 'text-[#F87171]'
                                  : 'text-[#71717A]'
                            }`}
                          >
                            {entry.outcome === 'pending' || entry.outcome === 'skipped'
                              ? entry.outcome
                              : entry.riskAmount > 0
                                ? formatSignedUsd(m.pnlUsd)
                                : `${m.pnlR >= 0 ? '+' : ''}${m.pnlR.toFixed(1)}R`}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Trade Ledger Table */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
          <div className="p-6 border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                  Trade Ledger
                </h2>
                <span className="text-[13px] font-mono tabular-nums text-[#71717A]">
                  {filteredTableEntries.length}
                </span>
              </div>
              <p className="text-[13px] text-[#71717A]">
                All-time net:{' '}
                <span
                  className={`font-mono tabular-nums font-medium ${
                    kpis.netUsd > 0 || (kpis.netUsd === 0 && kpis.netR > 0)
                      ? 'text-[#34D399]'
                      : kpis.netUsd < 0 || (kpis.netUsd === 0 && kpis.netR < 0)
                        ? 'text-[#F87171]'
                        : 'text-[#A1A1AA]'
                  }`}
                >
                  {kpis.netUsd !== 0
                    ? formatSignedUsd(kpis.netUsd)
                    : `${kpis.netR >= 0 ? '+' : ''}${kpis.netR.toFixed(2)}R`}
                </span>
                {' · '}
                <span className="font-mono tabular-nums text-[#A1A1AA]">
                  {kpis.settled} settled, {kpis.pending} open
                </span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 lg:max-w-xl lg:justify-end">
              <div className="relative flex-1 min-w-[200px]">
                <PiMagnifyingGlass className="h-4 w-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol, strategy, notes, or #tag..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[13px] text-[#FAFAFA] placeholder:text-[#71717A]"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value as 'ALL' | 'BUY' | 'SELL')}
                  aria-label="Filter direction"
                  className="px-3 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                >
                  <option value="ALL">All sides</option>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>

                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value as 'ALL' | JournalOutcome)}
                  aria-label="Filter outcome"
                  className="px-3 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                >
                  <option value="ALL">All outcomes</option>
                  <option value="pending">Pending</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="breakeven">Breakeven</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
            </div>
          </div>

          {filteredTableEntries.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <img
                src="/brand/empty-journal.png"
                alt="Empty trade ledger"
                className="w-full max-w-[240px] mx-auto rounded-xl object-cover opacity-90"
              />
              <p className="text-[15px] font-medium text-[#FAFAFA]">
                No journal entries in current scope
              </p>
              <p className="text-[13px] text-[#71717A] max-w-md mx-auto">
                Log trades from the Terminal or switch scope to All to inspect system outcomes.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[12px] font-medium text-[#71717A]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Pair</th>
                    <th className="py-3 px-4">Strategy</th>
                    <th className="py-3 px-4">Side</th>
                    <th className="py-3 px-4 text-right">Entry / SL / TP</th>
                    <th className="py-3 px-4 text-right">Risk</th>
                    <th className="py-3 px-4 text-right">Net P&amp;L</th>
                    <th className="py-3 px-4">Outcome</th>
                    <th className="py-3 px-4">Scope</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-[13.5px]">
                  {filteredTableEntries.map((entry) => {
                    const dateKey = toDateKey(entry.createdAt)
                    const m = computeEntryMetrics(entry)
                    const tags = extractTagsFromNotes(entry.notes)
                    const effectiveSl = entry.currentSl ?? entry.sl

                    return (
                      <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <Link
                            to={`/journal/${dateKey}`}
                            className="font-mono tabular-nums text-[#FAFAFA] hover:underline inline-flex items-center gap-1"
                          >
                            {dateKey}
                            <PiArrowUpRight className="h-3.5 w-3.5 text-[#71717A]" />
                          </Link>
                          <div className="text-[12px] font-mono tabular-nums text-[#71717A]">
                            {new Date(entry.createdAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-medium text-[#FAFAFA]">{entry.symbol}</span>{' '}
                          <span className="text-[12px] text-[#71717A]">{entry.timeframe}</span>
                        </td>

                        <td className="py-3.5 px-4 text-[#A1A1AA]">
                          <div className="max-w-[180px] truncate">{entry.strategy}</div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="px-2 py-0.5 rounded-md bg-[#18181B] text-[12px] text-[#71717A]"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
                              entry.action === 'BUY'
                                ? 'bg-[#34D399]/10 text-[#34D399]'
                                : 'bg-[#F87171]/10 text-[#F87171]'
                            }`}
                          >
                            {entry.action}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="text-[#FAFAFA]">{formatPrice(entry.entry)}</span>
                          <span className="text-[#71717A]"> / </span>
                          <span className="text-[#F87171]">{formatPrice(effectiveSl)}</span>
                          <span className="text-[#71717A]"> / </span>
                          <span className="text-[#34D399]">{formatPrice(entry.tp)}</span>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#A1A1AA] whitespace-nowrap">
                          {entry.riskAmount > 0 ? `$${entry.riskAmount.toFixed(0)}` : '—'}
                        </td>

                        <td
                          className={`py-3.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            entry.outcome === 'win'
                              ? 'text-[#34D399]'
                              : entry.outcome === 'loss'
                                ? 'text-[#F87171]'
                                : 'text-[#71717A]'
                          }`}
                        >
                          {entry.outcome === 'pending' || entry.outcome === 'skipped'
                            ? '—'
                            : entry.riskAmount > 0
                              ? formatSignedUsd(m.pnlUsd)
                              : `${m.pnlR >= 0 ? '+' : ''}${m.pnlR.toFixed(2)}R`}
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={entry.outcome}
                            onChange={(e) =>
                              handleOutcomeChange(entry, e.target.value as JournalOutcome)
                            }
                            aria-label="Update trade outcome"
                            className="px-2.5 py-1.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[12px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                          >
                            <option value="pending">Pending</option>
                            <option value="win">Win</option>
                            <option value="loss">Loss</option>
                            <option value="breakeven">Breakeven</option>
                            <option value="skipped">Skipped</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleTaken(entry)}
                            className={`px-2.5 py-1 rounded-xl text-[12px] font-medium transition-colors ${
                              entry.taken
                                ? 'bg-[#FAFAFA] text-[#09090B]'
                                : 'bg-[#18181B] text-[#71717A] hover:text-[#FAFAFA]'
                            }`}
                          >
                            {entry.taken ? 'Taken' : 'System'}
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {entry.outcome === 'pending' && !entry.breakEvenTriggered && (
                              <button
                                type="button"
                                onClick={() => triggerBreakEven(entry.id)}
                                title="Move SL to Break-Even"
                                className="p-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#A1A1AA] hover:text-[#34D399] transition-colors"
                              >
                                <PiShield className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteJournalEntry(entry.id)}
                              title="Delete entry"
                              className="p-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#71717A] hover:text-[#F87171] transition-colors"
                            >
                              <PiTrash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
