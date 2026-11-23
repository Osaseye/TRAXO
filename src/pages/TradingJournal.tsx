import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PiArrowUpRight,
  PiCalendarBlank,
  PiCaretLeft,
  PiCaretRight,
  PiChartLineUp,
  PiCoins,
  PiDownloadSimple,
  PiFastForward,
  PiMagnifyingGlass,
  PiNotebook,
  PiPlay,
  PiShield,
  PiTrash,
  PiTrophy,
  PiWarningCircle,
} from 'react-icons/pi'
import { useMetaApi, type PaperTradeRecord } from '@/hooks/useMetaApi'
import { getJournalEntries, updateJournalEntry } from '@/lib/api'
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

function formatPrice(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—'
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

function formatCompactUsd(val: number): string {
  const sign = val > 0 ? '+' : val < 0 ? '-' : ''
  const abs = Math.abs(val)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${Math.round(abs)}`
}

function computeEntryMetrics(entry: JournalEntry): TradeMetrics {
  const riskDist = Math.abs(entry.entry - entry.sl)
  const rewardDist = Math.abs(entry.tp - entry.entry)
  const rr = riskDist > 0 ? rewardDist / riskDist : 0

  if (
    typeof entry.pnlUsd === 'number' &&
    Number.isFinite(entry.pnlUsd) &&
    entry.outcome !== 'pending' &&
    entry.outcome !== 'skipped'
  ) {
    const pnlR =
      typeof entry.pnlR === 'number' && Number.isFinite(entry.pnlR)
        ? entry.pnlR
        : entry.outcome === 'win'
          ? rr
          : entry.outcome === 'loss'
            ? -1
            : 0
    return { rr, pnlUsd: entry.pnlUsd, pnlR }
  }

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

function paperTradeToJournalEntry(t: PaperTradeRecord): JournalEntry {
  let outcome: JournalOutcome = 'pending'
  if (['WIN_TP1', 'WIN_TP2', 'WIN_TP1_BE'].includes(t.status)) {
    outcome = 'win'
  } else if (t.status === 'LOSS_SL') {
    outcome = 'loss'
  } else if (t.status === 'CLOSED_MANUAL') {
    outcome = t.realizedPnlUsd > 0 ? 'win' : t.realizedPnlUsd < 0 ? 'loss' : 'breakeven'
  } else if (t.status === 'EXPIRED' || t.status === 'CANCELLED') {
    outcome = 'skipped'
  }

  return {
    id: t.id,
    suggestionKey: t.signalId ? `signal:${t.signalId}` : `trade:${t.id}`,
    symbol: t.symbol,
    timeframe: t.timeframe,
    strategy: t.strategyLabel,
    action: t.direction,
    entry: t.fillPrice ?? t.requestedEntry,
    sl: t.slPrice,
    currentSl: t.currentSl,
    tp: t.tp1Price,
    tp2: t.tp2Price ?? null,
    confidence: t.confidence,
    risk: t.tier === 'PRIME' ? 'Low' : t.tier === 'STANDARD' ? 'Medium' : 'High',
    suggestedPosition: t.initialVolume,
    riskAmount: t.riskAmountUsd,
    taken: true,
    outcome,
    pnlUsd: t.realizedPnlUsd,
    pnlR: t.realizedR,
    exitPrice: t.exitPrice ?? null,
    tradeId: t.id,
    signalId: t.signalId,
    mode: 'paper',
    status: t.status,
    createdAt: t.createdAt > 1e12 ? t.createdAt : t.createdAt * 1000,
    notes: Array.isArray(t.reasons) ? t.reasons.join(' · ') : undefined,
    breakEvenTriggered: t.status === 'WIN_TP1_BE' || (t.tp1HitAt != null && t.currentSl !== t.slPrice),
  }
}

function normalizeRemoteJournalEntry(raw: Record<string, unknown>): JournalEntry | null {
  if (!raw || !raw.id || !raw.symbol) return null
  const rawTs = Number(raw.createdAt) || Date.now()
  return {
    id: String(raw.id),
    suggestionKey: String(raw.suggestionKey || `remote:${raw.id}`),
    symbol: String(raw.symbol),
    timeframe: String(raw.timeframe || '15m'),
    strategy: String(raw.strategy || 'TRAXO Engine'),
    action: raw.action === 'SELL' ? 'SELL' : 'BUY',
    entry: Number(raw.entry) || 0,
    sl: Number(raw.sl) || 0,
    currentSl: raw.currentSl != null ? Number(raw.currentSl) : undefined,
    tp: Number(raw.tp) || 0,
    tp2: raw.tp2 != null ? Number(raw.tp2) : null,
    confidence: Number(raw.confidence) || 80,
    risk: raw.risk === 'High' || raw.risk === 'Medium' ? raw.risk : 'Low',
    suggestedPosition: Number(raw.suggestedPosition ?? raw.volume) || 0.01,
    riskAmount: Number(raw.riskAmount) || 0,
    taken: Boolean(raw.taken ?? true),
    outcome: (raw.outcome || 'pending') as JournalOutcome,
    pnlUsd: raw.pnlUsd != null ? Number(raw.pnlUsd) : undefined,
    pnlR: raw.pnlR != null ? Number(raw.pnlR) : undefined,
    exitPrice: raw.exitPrice != null ? Number(raw.exitPrice) : null,
    tradeId: raw.tradeId ? String(raw.tradeId) : undefined,
    signalId: raw.signalId ? String(raw.signalId) : null,
    mode: raw.mode === 'paper' || raw.mode === 'metaapi' || raw.mode === 'manual' ? raw.mode : undefined,
    status: raw.status ? String(raw.status) : undefined,
    createdAt: rawTs > 1e12 ? rawTs : rawTs * 1000,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    breakEvenTriggered: Boolean(raw.breakEvenTriggered),
  }
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

  const [activeTab, setActiveTab] = useState<'paper' | 'manual'>('paper')
  const [paperStatusFilter, setPaperStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WINS' | 'LOSSES' | 'EXPIRED'>('ALL')
  const [paperSearch, setPaperSearch] = useState('')
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceInput, setBalanceInput] = useState('10000')
  const [clearPaperTrades, setClearPaperTrades] = useState(false)

  const {
    account,
    paperTrades,
    paperSummary,
    replayStatus,
    loading: paperLoading,
    resetPaperBalance,
    stepOfflineReplay,
  } = useMetaApi()

  const filteredPaperTrades = useMemo(() => {
    const q = paperSearch.trim().toLowerCase()
    return paperTrades.filter((t) => {
      if (paperStatusFilter === 'ACTIVE' && !['PENDING', 'OPEN', 'PARTIAL_TP1'].includes(t.status)) return false
      if (paperStatusFilter === 'WINS' && !['WIN_TP1', 'WIN_TP2', 'WIN_TP1_BE'].includes(t.status)) return false
      if (paperStatusFilter === 'LOSSES' && t.status !== 'LOSS_SL') return false
      if (paperStatusFilter === 'EXPIRED' && !['EXPIRED', 'CANCELLED'].includes(t.status)) return false
      if (q) {
        const hay = `${t.symbol} ${t.strategyLabel} ${t.strategyId} ${t.timeframe} ${t.status}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [paperTrades, paperStatusFilter, paperSearch])

  const [scope, setScope] = useState<JournalScope>('taken')
  const [search, setSearch] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | JournalOutcome>('ALL')
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [remoteJournal, setRemoteJournal] = useState<JournalEntry[]>([])

  const [todayKey] = useState(() => toDateKey(Date.now()))
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  useEffect(() => {
    let active = true
    getJournalEntries()
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return
        const parsed = rows
          .map((r) => normalizeRemoteJournalEntry(r))
          .filter((item): item is JournalEntry => item !== null)
        setRemoteJournal(parsed)
      })
      .catch(() => {
        // Offline / backend down — local & paper trades still work
      })
    return () => {
      active = false
    }
  }, [paperTrades.length])

  const paperTradesById = useMemo(() => {
    const map = new Map<string, PaperTradeRecord>()
    for (const t of paperTrades) {
      map.set(t.id, t)
      if (t.signalId) map.set(t.signalId, t)
    }
    return map
  }, [paperTrades])

  const allJournalEntries = useMemo(() => {
    const byKey = new Map<string, JournalEntry>()
    const scoreEntry = (e: JournalEntry) => {
      const resolvedBoost = e.outcome !== 'pending' && e.outcome !== 'skipped' ? 10 : 0
      const pnlBoost = typeof e.pnlUsd === 'number' ? 5 : 0
      const paperBoost = e.mode === 'paper' ? 3 : 0
      return resolvedBoost + pnlBoost + paperBoost
    }
    const upsert = (entry: JournalEntry) => {
      const dedupKey = entry.tradeId || entry.signalId || entry.id
      const existing = byKey.get(dedupKey) || byKey.get(entry.id)
      if (!existing || scoreEntry(entry) >= scoreEntry(existing)) {
        byKey.set(dedupKey, entry)
      }
    }

    for (const e of journal) upsert(e)
    for (const e of remoteJournal) upsert(e)
    for (const t of paperTrades) upsert(paperTradeToJournalEntry(t))

    return Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [journal, remoteJournal, paperTrades])

  const scopedEntries = useMemo(() => {
    return scope === 'taken' ? allJournalEntries.filter((j) => j.taken) : allJournalEntries
  }, [allJournalEntries, scope])

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
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-[12px] font-medium text-[#71717A]">Execution &amp; Paper Ledger</p>
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
                Trading Journal
              </h1>
              <div className="inline-flex items-center rounded-full bg-[#111113] border border-white/[0.08] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('paper')}
                  className={`px-3 py-1 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'paper'
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                  }`}
                >
                  <span>Paper Ledger (Auto-Trader)</span>
                  <span className="font-mono text-[11px] opacity-75">{paperTrades.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`px-3 py-1 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'manual'
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                  }`}
                >
                  <span>Calendar &amp; All Trades</span>
                  <span className="font-mono text-[11px] opacity-75">{scopedEntries.length}</span>
                </button>
              </div>
            </div>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
              {activeTab === 'paper'
                ? 'Deterministic internal paper execution, dynamic TP1/BE/TP2 management, and bar-by-bar candle replay proof.'
                : 'Monthly performance matrix, trade execution history, and outcome attribution.'}
            </p>
          </div>

          {activeTab === 'manual' ? (
            <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 w-full sm:w-auto shrink-0">
              <div className="inline-flex items-center rounded-full bg-[#111113] border border-white/[0.07] p-1">
                <button
                  type="button"
                  onClick={() => setScope('taken')}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] sm:text-[13px] font-medium transition-colors ${
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
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] sm:text-[13px] font-medium transition-colors ${
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
                className="h-9 sm:h-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] disabled:opacity-40 text-[12.5px] sm:text-[13px] font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
              >
                <PiDownloadSimple className="h-4 w-4 text-[#A1A1AA]" />
                <span>Export CSV</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setBalanceInput(String(paperSummary?.account.balance ?? account?.balance ?? 10000))
                  setShowBalanceModal((v) => !v)
                }}
                className="h-9 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.2] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
              >
                <PiCoins className="h-4 w-4 text-[#A1A1AA]" />
                Set Paper Capital
              </button>
              <button
                type="button"
                onClick={() => void stepOfflineReplay(5)}
                disabled={paperLoading}
                className="h-9 px-3.5 rounded-xl bg-[#34D399]/10 border border-[#34D399]/25 hover:bg-[#34D399]/15 text-[12.5px] font-medium text-[#34D399] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <PiFastForward className="h-4 w-4" />
                Step +5 Replay Bars
              </button>
            </div>
          )}
        </div>

        {activeTab === 'paper' && (
          <div className="space-y-6">
            {showBalanceModal && (
              <div className="rounded-2xl bg-[#111113] border border-white/[0.08] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Set / Reset Internal Paper Account Capital</p>
                  <p className="text-[12px] text-[#71717A]">
                    Adjust starting equity for position sizing &amp; drawdown testing without connecting a live broker.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {[10000, 25000, 50000, 100000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBalanceInput(String(v))}
                      className="px-2.5 py-1.5 rounded-lg bg-[#18181B] border border-white/[0.07] text-[12px] font-mono text-[#A1A1AA] hover:text-[#FAFAFA]"
                    >
                      ${(v / 1000).toFixed(0)}k
                    </button>
                  ))}
                  <input
                    type="number"
                    min={100}
                    step={500}
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    className="h-9 w-36 px-3 rounded-lg bg-[#18181B] border border-white/[0.1] text-[13px] font-mono text-[#FAFAFA] focus:outline-none"
                  />
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-[#A1A1AA] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearPaperTrades}
                      onChange={(e) => setClearPaperTrades(e.target.checked)}
                    />
                    Clear ledger
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const bal = Number(balanceInput)
                      if (Number.isFinite(bal) && bal >= 100) {
                        await resetPaperBalance(bal, clearPaperTrades)
                        setShowBalanceModal(false)
                      }
                    }}
                    disabled={paperLoading}
                    className="h-9 px-3.5 rounded-lg bg-[#FAFAFA] text-[#09090B] text-[12.5px] font-semibold hover:bg-[#E4E4E7]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* Paper Account KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-1">
                <span className="text-[11.5px] text-[#71717A]">Virtual Balance</span>
                <div className="text-[20px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                  ${(paperSummary?.account.balance ?? account?.balance ?? 10000).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <span className="text-[11px] font-mono text-[#71717A]">
                  Start ${(paperSummary?.account.startingBalance ?? 10000).toLocaleString()}
                </span>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-1">
                <span className="text-[11.5px] text-[#71717A]">Net Realized P&amp;L</span>
                <div
                  className={`text-[20px] font-mono font-semibold tabular-nums ${
                    (paperSummary?.netRealizedUsd ?? 0) > 0
                      ? 'text-[#34D399]'
                      : (paperSummary?.netRealizedUsd ?? 0) < 0
                        ? 'text-[#F87171]'
                        : 'text-[#FAFAFA]'
                  }`}
                >
                  {formatSignedUsd(paperSummary?.netRealizedUsd ?? 0)}
                </div>
                <span className="text-[11px] font-mono text-[#71717A]">
                  {(paperSummary?.netReturnPct ?? 0) >= 0 ? '+' : ''}
                  {(paperSummary?.netReturnPct ?? 0).toFixed(2)}% return
                </span>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-1">
                <span className="text-[11.5px] text-[#71717A]">Win Rate</span>
                <div className="text-[20px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                  {(paperSummary?.winRate ?? 0).toFixed(1)}%
                </div>
                <span className="text-[11px] font-mono text-[#71717A]">
                  {paperSummary?.winTp2Count ?? 0} TP2 · {paperSummary?.winTp1Count ?? 0} TP1 · {paperSummary?.winTp1BeCount ?? 0} BE
                </span>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-1">
                <span className="text-[11.5px] text-[#71717A]">Profit Factor</span>
                <div className="text-[20px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                  {paperSummary?.profitFactor ?? '0.00'}
                </div>
                <span className="text-[11px] font-mono text-[#71717A]">
                  {paperSummary?.wins ?? 0}W / {paperSummary?.losses ?? 0}L
                </span>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-1">
                <span className="text-[11.5px] text-[#71717A]">Max Drawdown</span>
                <div className="text-[20px] font-mono font-semibold tabular-nums text-[#F87171]">
                  {(paperSummary?.account.maxDrawdownPct ?? 0).toFixed(2)}%
                </div>
                <span className="text-[11px] font-mono text-[#71717A]">
                  Peak ${(paperSummary?.account.peakEquity ?? 10000).toLocaleString()}
                </span>
              </div>

              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-1">
                <span className="text-[11.5px] text-[#71717A]">Active / Replay</span>
                <div className="text-[20px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                  {(paperSummary?.openCount ?? 0) + (paperSummary?.pendingCount ?? 0)}
                </div>
                <span className="text-[11px] font-mono text-[#71717A]">
                  Replay {replayStatus?.state || 'IDLE'} ({replayStatus?.cursorIndex ?? 0}/{replayStatus?.totalBars ?? 0})
                </span>
              </div>
            </div>

            {/* Paper Ledger Table Section */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                      Paper Execution Ledger
                    </h2>
                    <span className="text-[13px] font-mono tabular-nums text-[#71717A]">
                      {filteredPaperTrades.length}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-[#71717A]">
                    Click any trade row to launch the bar-by-bar Visual Trade Replay proof drawer.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 lg:max-w-xl lg:justify-end">
                  <div className="relative flex-1 min-w-0">
                    <PiMagnifyingGlass className="h-4 w-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={paperSearch}
                      onChange={(e) => setPaperSearch(e.target.value)}
                      placeholder="Filter symbol, strategy, or status..."
                      className="w-full h-10 sm:h-auto pl-9 pr-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[13px] text-[#FAFAFA] placeholder:text-[#71717A]"
                    />
                  </div>
                  <select
                    value={paperStatusFilter}
                    onChange={(e) =>
                      setPaperStatusFilter(
                        e.target.value as 'ALL' | 'ACTIVE' | 'WINS' | 'LOSSES' | 'EXPIRED'
                      )
                    }
                    aria-label="Filter paper trade status"
                    className="h-10 sm:h-auto px-3 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:outline-none"
                  >
                    <option value="ALL">All states</option>
                    <option value="ACTIVE">Open / Partial / Pending</option>
                    <option value="WINS">Wins (TP2 / TP1 / BE)</option>
                    <option value="LOSSES">Losses (SL)</option>
                    <option value="EXPIRED">Expired / Cancelled</option>
                  </select>
                </div>
              </div>

              {filteredPaperTrades.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <PiChartLineUp className="h-8 w-8 text-[#71717A] mx-auto" />
                  <p className="text-[15px] font-medium text-[#FAFAFA]">No paper trades in ledger yet</p>
                  <p className="text-[13px] text-[#71717A] max-w-md mx-auto">
                    Use <span className="text-[#FAFAFA]">Step +5 Replay Bars</span> above or keep Auto-Trade ON during live scans to execute strategies onto the SQLite Paper Ledger.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[12px] font-medium text-[#71717A]">
                        <th className="py-3 px-4">Pair</th>
                        <th className="py-3 px-4">Strategy</th>
                        <th className="py-3 px-4">Side &amp; Size</th>
                        <th className="py-3 px-4">Exit Policy</th>
                        <th className="py-3 px-4 text-right">Entry → Exit</th>
                        <th className="py-3 px-4 text-right">MFE / MAE</th>
                        <th className="py-3 px-4 text-right">Net P&amp;L</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Proof</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] text-[13px]">
                      {filteredPaperTrades.map((t) => {
                        const isWin = ['WIN_TP1', 'WIN_TP2', 'WIN_TP1_BE'].includes(t.status)
                        const isLoss = t.status === 'LOSS_SL'
                        return (
                          <tr
                            key={t.id}
                            onClick={() =>
                              navigate(`/replay/${encodeURIComponent(t.id)}`, {
                                state: { trade: t },
                              })
                            }
                            className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                          >
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-semibold text-[#FAFAFA]">
                                {t.symbol}{' '}
                                <span className="text-[11.5px] font-normal text-[#71717A]">{t.timeframe}</span>
                              </div>
                              <div className="text-[11px] font-mono text-[#71717A]">
                                {new Date(t.createdAt * 1000).toISOString().replace('T', ' ').slice(5, 16)}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="text-[#FAFAFA] font-medium truncate max-w-[175px]">
                                {t.strategyLabel}
                              </div>
                              <div className="text-[11px] font-mono text-[#71717A]">{t.tier}</div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                                  t.direction === 'BUY'
                                    ? 'bg-[#34D399]/10 text-[#34D399]'
                                    : 'bg-[#F87171]/10 text-[#F87171]'
                                }`}
                              >
                                {t.direction} {t.initialVolume}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-[11.5px] font-mono text-[#A1A1AA]">
                              {t.exitMode === 'SCALE_50_TP1_BE_TP2' ? '50/50 TP1→BE→TP2' : '100% TP1'}
                              {t.tp1HitAt && (
                                <div className="text-[10.5px] text-[#34D399]">TP1 Banked</div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="text-[#FAFAFA]">
                                {formatPrice(t.fillPrice ?? t.requestedEntry)} → {formatPrice(t.exitPrice)}
                              </div>
                              <div className="text-[11px] text-[#71717A]">
                                SL {formatPrice(t.currentSl)} · TP1 {formatPrice(t.tp1Price)}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-[12px]">
                              <span className="text-[#34D399]">+{t.mfeR.toFixed(1)}R</span>
                              <span className="text-[#71717A]"> / </span>
                              <span className="text-[#F87171]">-{t.maeR.toFixed(1)}R</span>
                            </td>
                            <td
                              className={`py-3.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                t.realizedPnlUsd > 0
                                  ? 'text-[#34D399]'
                                  : t.realizedPnlUsd < 0
                                    ? 'text-[#F87171]'
                                    : 'text-[#A1A1AA]'
                              }`}
                            >
                              {formatSignedUsd(t.realizedPnlUsd)}
                              <div className="text-[11px] font-normal text-[#71717A]">
                                {t.realizedR >= 0 ? '+' : ''}
                                {t.realizedR.toFixed(2)}R
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-medium ${
                                  isWin
                                    ? 'bg-[#34D399]/10 text-[#34D399]'
                                    : isLoss
                                      ? 'bg-[#F87171]/10 text-[#F87171]'
                                      : 'bg-[#18181B] text-[#A1A1AA]'
                                }`}
                              >
                                {t.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/replay/${encodeURIComponent(t.id)}`, {
                                    state: { trade: t },
                                  })
                                }}
                                className="h-8 px-2.5 rounded-lg bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[12px] text-[#FAFAFA] inline-flex items-center gap-1"
                              >
                                <PiPlay size={12} className="text-[#34D399]" />
                                Replay
                              </button>
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
        )}

        {activeTab === 'manual' && (
        <>

        {/* Top 2-Column Calendar + Month Summary / Recent Entries */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-5 sm:gap-6 items-start">
          {/* Left: Calm Calendar Card */}
          <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-3.5 sm:p-6 space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#161619] flex items-center justify-center text-[#A1A1AA] shrink-0">
                  <PiCalendarBlank className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA] truncate">
                    {monthLabel}
                  </h2>
                  <div className="flex items-center gap-2 sm:gap-2.5 text-[11.5px] sm:text-[12px] text-[#71717A] flex-wrap">
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

              <div className="flex items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                  className="h-9 w-10 sm:w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
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
                  className="h-9 flex-1 sm:flex-none px-3.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  className="h-9 w-10 sm:w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                >
                  <PiCaretRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[11px] sm:text-[12px] font-medium text-[#71717A]">
              {[
                { short: 'S', full: 'Sun' },
                { short: 'M', full: 'Mon' },
                { short: 'T', full: 'Tue' },
                { short: 'W', full: 'Wed' },
                { short: 'T', full: 'Thu' },
                { short: 'F', full: 'Fri' },
                { short: 'S', full: 'Sat' },
              ].map((d) => (
                <div key={d.full} className="py-1">
                  <span className="sm:hidden">{d.short}</span>
                  <span className="hidden sm:inline">{d.full}</span>
                </div>
              ))}
            </div>

            {/* Calendar Day Tiles */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarCells.map((cell, idx) => {
                if (!cell.day || !cell.dateKey) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[54px] sm:h-24 rounded-lg sm:rounded-xl bg-[#0D0D10]"
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
                    className={`min-h-[54px] sm:h-24 rounded-lg sm:rounded-xl p-1 sm:p-2.5 flex flex-col justify-between text-left transition-colors min-w-0 ${tileTone} ${
                      cell.isToday ? 'ring-1 ring-[#FAFAFA]/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-0.5">
                      <span
                        className={`text-[11px] sm:text-[12px] font-mono tabular-nums leading-none ${
                          cell.isToday ? 'text-[#FAFAFA] font-semibold' : 'text-[#A1A1AA]'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {cell.count > 0 && (
                        <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-[#71717A]">
                          {cell.count}t
                        </span>
                      )}
                    </div>

                    {cell.count > 0 ? (
                      <div className="space-y-0.5 min-w-0 w-full">
                        <div
                          className={`text-[9.5px] sm:text-[13px] font-mono font-semibold tabular-nums leading-tight truncate ${
                            isWin
                              ? 'text-[#34D399]'
                              : isLoss
                                ? 'text-[#F87171]'
                                : 'text-[#A1A1AA]'
                          }`}
                        >
                          <span className="sm:hidden">
                            {cell.netUsd !== 0
                              ? formatCompactUsd(cell.netUsd)
                              : `${cell.netR >= 0 ? '+' : ''}${cell.netR.toFixed(1)}R`}
                          </span>
                          <span className="hidden sm:inline">
                            {cell.netUsd !== 0
                              ? formatSignedUsd(cell.netUsd)
                              : `${cell.netR >= 0 ? '+' : ''}${cell.netR.toFixed(1)}R`}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#71717A] hidden sm:block">
                          {cell.wins}W/{cell.losses}L
                        </div>
                      </div>
                    ) : cell.isToday ? (
                      <>
                        <span className="sm:hidden w-1.5 h-1.5 rounded-full bg-[#FAFAFA]/70" />
                        <span className="hidden sm:inline text-[11px] font-medium text-[#A1A1AA]">
                          Today
                        </span>
                      </>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Right: Month Summary + Recent Entries */}
          <div className="space-y-5 sm:space-y-6">
            {/* Month Summary Card */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium text-[#FAFAFA]">Month Summary</h2>
                <span className="text-[12px] text-[#71717A]">{monthLabel}</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
                  <PiNotebook className="h-4 w-4 text-[#A1A1AA]" />
                  <div>
                    <div className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                      {monthSummary.logged}
                    </div>
                    <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Logged</div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
                  <PiTrophy className="h-4 w-4 text-[#34D399]" />
                  <div>
                    <div className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                      {monthSummary.wins}
                    </div>
                    <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Wins</div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-1.5 sm:space-y-2 min-w-0">
                  <PiCoins className="h-4 w-4 text-[#A1A1AA]" />
                  <div className="min-w-0">
                    <div
                      className={`text-[19px] sm:text-[22px] font-mono font-semibold tabular-nums truncate ${
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
                    <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Net P&amp;L</div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#161619] p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
                  <PiWarningCircle className="h-4 w-4 text-[#F87171]" />
                  <div>
                    <div className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                      {monthSummary.losses}
                    </div>
                    <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">
                      Losses ·{' '}
                      <span className="font-mono tabular-nums">
                        {monthSummary.winRate.toFixed(0)}%
                      </span>{' '}
                      WR
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[12px] text-[#71717A]">
                <span>All-time expectancy</span>
                <span className="font-mono tabular-nums text-[#A1A1AA]">
                  {kpis.winRate.toFixed(1)}% WR · PF {kpis.profitFactor} ·{' '}
                  {kpis.expectancyR >= 0 ? '+' : ''}
                  {kpis.expectancyR.toFixed(2)}R
                </span>
              </div>
            </section>

            {/* Recent Entries Card */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium text-[#FAFAFA]">Recent Entries</h2>
                <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                  {monthEntries.length} in month
                </span>
              </div>

              {recentEntries.length === 0 ? (
                <div className="rounded-xl bg-[#161619] p-5 sm:p-6 text-center space-y-3">
                  <img
                    src="/brand/empty-journal.png"
                    alt="Empty journal entries"
                    className="w-full max-w-[190px] sm:max-w-[210px] mx-auto rounded-xl object-cover opacity-90"
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
                          <span className="text-[14px] font-medium text-[#FAFAFA] truncate">
                            {entry.symbol}
                          </span>
                          <span className="text-[12px] text-[#71717A] shrink-0">{prettyDate}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[12px] text-[#A1A1AA] truncate min-w-0">
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
                            className={`text-[12px] font-mono tabular-nums font-medium shrink-0 ${
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

        {/* Trade Ledger */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                  Trade Ledger
                </h2>
                <span className="text-[13px] font-mono tabular-nums text-[#71717A]">
                  {filteredTableEntries.length}
                </span>
              </div>
              <p className="text-[12.5px] sm:text-[13px] text-[#71717A]">
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
              <div className="relative flex-1 min-w-0">
                <PiMagnifyingGlass className="h-4 w-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol, strategy, notes, or #tag..."
                  className="w-full h-10 sm:h-auto pl-9 pr-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[13px] text-[#FAFAFA] placeholder:text-[#71717A]"
                />
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value as 'ALL' | 'BUY' | 'SELL')}
                  aria-label="Filter direction"
                  className="h-10 sm:h-auto px-3 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                >
                  <option value="ALL">All sides</option>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>

                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value as 'ALL' | JournalOutcome)}
                  aria-label="Filter outcome"
                  className="h-10 sm:h-auto px-3 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
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
            <div className="p-8 sm:p-12 text-center space-y-3">
              <img
                src="/brand/empty-journal.png"
                alt="Empty trade ledger"
                className="w-full max-w-[210px] sm:max-w-[240px] mx-auto rounded-xl object-cover opacity-90"
              />
              <p className="text-[15px] font-medium text-[#FAFAFA]">
                No journal entries in current scope
              </p>
              <p className="text-[13px] text-[#71717A] max-w-md mx-auto">
                Log trades from the Terminal or switch scope to All to inspect system outcomes.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Responsive Card Rows (< md) */}
              <div className="md:hidden divide-y divide-white/[0.06]">
                {filteredTableEntries.map((entry) => {
                  const dateKey = toDateKey(entry.createdAt)
                  const m = computeEntryMetrics(entry)
                  const tags = extractTagsFromNotes(entry.notes)
                  const effectiveSl = entry.currentSl ?? entry.sl
                  const timeStr = new Date(entry.createdAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })

                  return (
                    <div key={entry.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                                entry.action === 'BUY'
                                  ? 'bg-[#34D399]/10 text-[#34D399]'
                                  : 'bg-[#F87171]/10 text-[#F87171]'
                              }`}
                            >
                              {entry.action}
                            </span>
                            <span className="font-semibold text-[15px] text-[#FAFAFA]">
                              {entry.symbol}
                            </span>
                            <span className="text-[12px] text-[#71717A]">{entry.timeframe}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA] flex-wrap">
                            <span className="truncate max-w-[160px]">{entry.strategy}</span>
                            <span className="text-[#52525B]">·</span>
                            <Link
                              to={`/journal/${dateKey}`}
                              className="font-mono tabular-nums text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-0.5"
                            >
                              {dateKey} {timeStr}
                              <PiArrowUpRight className="h-3 w-3 text-[#71717A]" />
                            </Link>
                          </div>
                        </div>

                        <div
                          className={`text-[14px] font-mono font-semibold tabular-nums shrink-0 ${
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
                        </div>
                      </div>

                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-md bg-[#18181B] text-[11.5px] text-[#71717A]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="rounded-xl bg-[#161619] p-2.5 grid grid-cols-2 gap-2 text-[12px] font-mono tabular-nums">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#71717A] font-sans">Entry</span>
                          <span className="text-[#FAFAFA]">{formatPrice(entry.entry)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#71717A] font-sans">Risk</span>
                          <span className="text-[#A1A1AA]">
                            {entry.riskAmount > 0 ? `$${entry.riskAmount.toFixed(0)}` : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#71717A] font-sans">SL</span>
                          <span className="text-[#F87171]">{formatPrice(effectiveSl)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#71717A] font-sans">TP</span>
                          <span className="text-[#34D399]">{formatPrice(entry.tp)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={entry.outcome}
                          onChange={(e) =>
                            handleOutcomeChange(entry, e.target.value as JournalOutcome)
                          }
                          aria-label="Update trade outcome"
                          className="h-9 flex-1 min-w-0 px-2.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[12.5px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
                        >
                          <option value="pending">Pending</option>
                          <option value="win">Win</option>
                          <option value="loss">Loss</option>
                          <option value="breakeven">Breakeven</option>
                          <option value="skipped">Skipped</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleToggleTaken(entry)}
                          className={`h-9 px-3 rounded-xl text-[12.5px] font-medium transition-colors shrink-0 ${
                            entry.taken
                              ? 'bg-[#FAFAFA] text-[#09090B]'
                              : 'bg-[#18181B] text-[#71717A] hover:text-[#FAFAFA]'
                          }`}
                        >
                          {entry.taken ? 'Taken' : 'System'}
                        </button>

                        {(entry.outcome === 'win' ||
                          entry.outcome === 'loss' ||
                          entry.outcome === 'breakeven') && (
                          <button
                            type="button"
                            onClick={() => {
                              const targetId = entry.tradeId || entry.id
                              const linkedTrade =
                                paperTradesById.get(targetId) ||
                                (entry.signalId ? paperTradesById.get(entry.signalId) : undefined)
                              navigate(`/replay/${encodeURIComponent(targetId)}`, {
                                state: linkedTrade
                                  ? { trade: linkedTrade, journalEntry: entry }
                                  : { journalEntry: entry },
                              })
                            }}
                            title="Open Replay Page"
                            className="h-9 px-3 rounded-xl bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors shrink-0"
                          >
                            <PiPlay className="h-3.5 w-3.5 text-[#34D399]" />
                            <span>Replay</span>
                          </button>
                        )}

                        {entry.outcome === 'pending' && !entry.breakEvenTriggered && (
                          <button
                            type="button"
                            onClick={() => triggerBreakEven(entry.id)}
                            title="Move SL to Break-Even"
                            className="h-9 w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#A1A1AA] hover:text-[#34D399] inline-flex items-center justify-center transition-colors shrink-0"
                          >
                            <PiShield className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => deleteJournalEntry(entry.id)}
                          title="Delete entry"
                          className="h-9 w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#71717A] hover:text-[#F87171] inline-flex items-center justify-center transition-colors shrink-0"
                        >
                          <PiTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
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
                              {(entry.outcome === 'win' ||
                                entry.outcome === 'loss' ||
                                entry.outcome === 'breakeven') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const targetId = entry.tradeId || entry.id
                                    const linkedTrade =
                                      paperTradesById.get(targetId) ||
                                      (entry.signalId ? paperTradesById.get(entry.signalId) : undefined)
                                    navigate(`/replay/${encodeURIComponent(targetId)}`, {
                                      state: linkedTrade
                                        ? { trade: linkedTrade, journalEntry: entry }
                                        : { journalEntry: entry },
                                    })
                                  }}
                                  title="Open Replay Page"
                                  className="h-8 px-2.5 rounded-lg bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[12px] text-[#FAFAFA] inline-flex items-center gap-1 transition-colors"
                                >
                                  <PiPlay size={12} className="text-[#34D399]" />
                                  <span>Replay</span>
                                </button>
                              )}
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
            </>
          )}
        </section>
        </>
        )}
      </div>
    </div>
  )
}
