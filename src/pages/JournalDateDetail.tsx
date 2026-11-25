import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  PiArrowLeft,
  PiCaretLeft,
  PiCaretRight,
  PiFloppyDisk,
  PiHash,
  PiPlay,
  PiPlus,
  PiShield,
  PiTag,
  PiTrash,
  PiX,
} from 'react-icons/pi'
import { useMetaApi, type PaperTradeRecord } from '@/hooks/useMetaApi'
import { getJournalEntries, updateJournalEntry } from '@/lib/api'
import webSocketService from '@/lib/websocket'
import { useAuthStore } from '@/stores/useAuthStore'
import { isTimestampVisibleForUser } from '@/lib/userSignalScope'
import {
  canonicalSignalKey,
  normalizeSignalStatus,
  useAnalysisSignalStore,
  type StoredSignal,
} from '@/stores/useAnalysisSignalStore'
import {
  useTradingContextStore,
  type JournalEntry,
  type JournalOutcome,
} from '@/stores/useTradingContextStore'

const PRESET_TAGS = ['#A+', '#London', '#NewYork', '#TrendAligned', '#News', '#EarlyExit', '#RuleBreak']

function normalizeTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? raw : raw * 1000
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed) {
      const asNum = Number(trimmed)
      if (Number.isFinite(asNum) && asNum > 0) {
        return asNum > 1e12 ? asNum : asNum * 1000
      }
      const parsed = Date.parse(trimmed)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { seconds?: unknown; _seconds?: unknown }
    const secs =
      typeof obj.seconds === 'number'
        ? obj.seconds
        : typeof obj._seconds === 'number'
          ? obj._seconds
          : null
    if (secs !== null && Number.isFinite(secs) && secs > 0) {
      return secs > 1e12 ? secs : secs * 1000
    }
  }
  return Date.now()
}

function getEntryOriginBadge(entry: JournalEntry): { label: string; className: string } {
  if (entry.mode === 'paper') {
    return { label: 'Auto / Paper', className: 'bg-[#38BDF8]/10 text-[#38BDF8]' }
  }
  if (entry.mode === 'metaapi') {
    return { label: 'MT5', className: 'bg-[#34D399]/10 text-[#34D399]' }
  }
  if (entry.mode === 'signal' || !entry.taken) {
    return { label: 'Signal', className: 'bg-[#FBBF24]/10 text-[#FBBF24]' }
  }
  return { label: 'Manual', className: 'bg-white/[0.08] text-[#FAFAFA]' }
}

function toDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return dateKey
  const d = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays)
  return toDateKey(d.getTime())
}

function formatHumanDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return dateKey
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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

function computePnl(entry: JournalEntry, defaultRiskUsd: number): { rr: number; pnlUsd: number; pnlR: number } {
  const effectiveRisk = entry.riskAmount > 0 ? entry.riskAmount : defaultRiskUsd
  const riskDist = Math.abs(entry.entry - entry.sl)
  const rewardDist = Math.abs(entry.tp - entry.entry)
  const explicitRr = (entry as JournalEntry & { rr?: number }).rr
  const rr =
    typeof explicitRr === 'number' && Number.isFinite(explicitRr) && explicitRr > 0
      ? explicitRr
      : riskDist > 0
        ? rewardDist / riskDist
        : 0

  if (
    entry.status === 'PARTIAL_TP1' &&
    typeof entry.pnlUsd === 'number' &&
    Number.isFinite(entry.pnlUsd)
  ) {
    const pnlR =
      typeof entry.pnlR === 'number' && Number.isFinite(entry.pnlR)
        ? entry.pnlR
        : effectiveRisk > 0
          ? entry.pnlUsd / effectiveRisk
          : 0
    return { rr, pnlUsd: entry.pnlUsd, pnlR }
  }

  if (entry.outcome === 'pending' || entry.outcome === 'skipped') {
    return { rr, pnlUsd: 0, pnlR: 0 }
  }

  if (
    entry.mode === 'signal' &&
    (entry.pnlUsd === undefined || !Number.isFinite(entry.pnlUsd) || entry.pnlUsd === 0)
  ) {
    if (entry.outcome === 'win') {
      return { rr, pnlUsd: effectiveRisk * rr, pnlR: rr }
    }
    if (entry.outcome === 'loss') {
      return { rr, pnlUsd: -effectiveRisk, pnlR: -1 }
    }
    return { rr, pnlUsd: 0, pnlR: 0 }
  }

  if (typeof entry.pnlUsd === 'number' && Number.isFinite(entry.pnlUsd)) {
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
    return { rr, pnlUsd: effectiveRisk * rr, pnlR: rr }
  }
  if (entry.outcome === 'loss') {
    return { rr, pnlUsd: -effectiveRisk, pnlR: -1 }
  }
  return { rr, pnlUsd: 0, pnlR: 0 }
}

function signalToDetailEntry(s: StoredSignal, defaultRiskUsd: number): JournalEntry {
  const canonical = normalizeSignalStatus(s.status)
  let outcome: JournalOutcome = 'pending'
  if (canonical === 'WIN') outcome = 'win'
  else if (canonical === 'LOSS') outcome = 'loss'
  else if (canonical === 'EXPIRED') outcome = 'skipped'

  const riskDist = Math.abs(s.entry - s.sl)
  const rewardDist = Math.abs(s.tp - s.entry)
  const rr =
    typeof s.rr === 'number' && Number.isFinite(s.rr) && s.rr > 0
      ? s.rr
      : riskDist > 0
        ? rewardDist / riskDist
        : 0

  return {
    id: s.id,
    suggestionKey: canonicalSignalKey({
      id: s.id,
      strategyId: s.strategyId,
      symbol: s.symbol,
      timeframe: s.timeframe,
      direction: s.direction,
      time: s.time,
    }),
    symbol: s.symbol,
    timeframe: s.timeframe,
    strategy: s.strategyLabel || s.strategyId || 'TRAXO Engine',
    action: s.direction === 'SELL' ? 'SELL' : 'BUY',
    entry: s.entry,
    sl: s.sl,
    tp: s.tp,
    tp2: s.tp2 ?? null,
    confidence: s.confidence ?? 0,
    risk: s.risk || 'Medium',
    suggestedPosition: 0,
    riskAmount: defaultRiskUsd,
    taken: false,
    outcome,
    pnlR: outcome === 'win' ? rr : outcome === 'loss' ? -1 : 0,
    signalId: s.id,
    mode: 'signal',
    status: canonical,
    createdAt: normalizeTimestampMs(s.time),
    notes: Array.isArray(s.reason) && s.reason.length > 0 ? s.reason.join(' · ') : undefined,
  }
}

function paperTradeToDetailEntry(t: PaperTradeRecord): JournalEntry {
  let outcome: JournalOutcome = 'pending'
  if (['WIN_TP1', 'WIN_TP2', 'WIN_TP1_BE'].includes(t.status)) outcome = 'win'
  else if (t.status === 'LOSS_SL') outcome = 'loss'
  else if (t.status === 'CLOSED_MANUAL') {
    outcome = t.realizedPnlUsd > 0 ? 'win' : t.realizedPnlUsd < 0 ? 'loss' : 'breakeven'
  } else if (t.status === 'EXPIRED' || t.status === 'CANCELLED') outcome = 'skipped'

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
    createdAt: normalizeTimestampMs(t.createdAt),
    notes: Array.isArray(t.reasons) ? t.reasons.join(' · ') : undefined,
    breakEvenTriggered: t.status === 'WIN_TP1_BE' || (t.tp1HitAt != null && t.currentSl !== t.slPrice),
  }
}

function normalizeRemoteDetailEntry(raw: Record<string, unknown>): JournalEntry | null {
  if (!raw || !raw.id || !raw.symbol) return null
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
    mode:
      raw.mode === 'paper' || raw.mode === 'metaapi' || raw.mode === 'manual' || raw.mode === 'signal'
        ? raw.mode
        : undefined,
    status: raw.status ? String(raw.status) : undefined,
    createdAt: normalizeTimestampMs(raw.createdAt),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    breakEvenTriggered: Boolean(raw.breakEvenTriggered),
  }
}

function extractTags(notes?: string): string[] {
  if (!notes) return []
  const matches = notes.match(/#[a-zA-Z0-9_-]+/g)
  return matches ? Array.from(new Set(matches)) : []
}

function stripTagsFromNotes(notes?: string): string {
  if (!notes) return ''
  return notes
    .replace(/#[a-zA-Z0-9_-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function serializeNotesAndTags(bodyText: string, tags: string[]): string {
  const cleanBody = bodyText.trim()
  const uniqueTags = Array.from(
    new Set(tags.map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`)).filter((t) => t.length > 1))
  )
  if (uniqueTags.length === 0) return cleanBody
  if (!cleanBody) return uniqueTags.join(' ')
  return `${cleanBody}\n\n${uniqueTags.join(' ')}`
}

interface EntryCardProps {
  entry: JournalEntry
  defaultRiskUsd: number
  linkedTrade?: PaperTradeRecord
  onEdit: (id: string, updates: Partial<JournalEntry>) => void
  onDelete: (id: string) => void
  onBreakEven: (id: string) => void
}

function JournalTradeCard({ entry, defaultRiskUsd, linkedTrade, onEdit, onDelete, onBreakEven }: EntryCardProps) {
  const { rr, pnlUsd, pnlR } = computePnl(entry, defaultRiskUsd)
  const origin = getEntryOriginBadge(entry)
  const initialTags = useMemo(() => extractTags(entry.notes), [entry.notes])
  const initialBody = useMemo(() => stripTagsFromNotes(entry.notes), [entry.notes])

  const [notesDraft, setNotesDraft] = useState(initialBody)
  const [tagsDraft, setTagsDraft] = useState<string[]>(initialTags)
  const [customTag, setCustomTag] = useState('')
  const [riskDraft, setRiskDraft] = useState(String(entry.riskAmount > 0 ? entry.riskAmount : defaultRiskUsd))
  const [savedNotice, setSavedNotice] = useState(false)

  const handleSaveNotesAndRisk = () => {
    const combinedNotes = serializeNotesAndTags(notesDraft, tagsDraft)
    const parsedRisk = Math.max(0, Number(riskDraft) || 0)
    const updatedEntry: JournalEntry = {
      ...entry,
      notes: combinedNotes,
      riskAmount: parsedRisk,
    }
    const nextPnl = computePnl(updatedEntry, defaultRiskUsd)
    onEdit(entry.id, { notes: combinedNotes, riskAmount: parsedRisk })
    if (entry.mode !== 'signal') {
      updateJournalEntry(entry.id, {
        notes: combinedNotes,
        outcome: entry.outcome,
        pnlUsd: nextPnl.pnlUsd,
      }).catch(() => {})
    }
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 1800)
  }

  const toggleTag = (tag: string) => {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`
    const nextTags = tagsDraft.includes(normalized)
      ? tagsDraft.filter((t) => t !== normalized)
      : [...tagsDraft, normalized]
    setTagsDraft(nextTags)
    const combinedNotes = serializeNotesAndTags(notesDraft, nextTags)
    onEdit(entry.id, { notes: combinedNotes })
    if (entry.mode !== 'signal') {
      updateJournalEntry(entry.id, { notes: combinedNotes }).catch(() => {})
    }
  }

  const handleAddCustomTag = () => {
    const clean = customTag.trim().replace(/^#+/, '').replace(/\s+/g, '')
    if (!clean) return
    const formatted = `#${clean}`
    if (!tagsDraft.includes(formatted)) {
      const nextTags = [...tagsDraft, formatted]
      setTagsDraft(nextTags)
      const combinedNotes = serializeNotesAndTags(notesDraft, nextTags)
      onEdit(entry.id, { notes: combinedNotes })
      if (entry.mode !== 'signal') {
        updateJournalEntry(entry.id, { notes: combinedNotes }).catch(() => {})
      }
    }
    setCustomTag('')
  }

  const handleOutcomeSelect = (nextOutcome: JournalOutcome) => {
    const nextPnl = computePnl({ ...entry, outcome: nextOutcome }, defaultRiskUsd)
    onEdit(entry.id, { outcome: nextOutcome, pnlUsd: nextPnl.pnlUsd, pnlR: nextPnl.pnlR })
    if (entry.mode !== 'signal') {
      updateJournalEntry(entry.id, {
        outcome: nextOutcome,
        pnlUsd: nextPnl.pnlUsd,
      }).catch(() => {})
    }
  }

  const effectiveSl = entry.currentSl ?? entry.sl

  return (
    <article className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-5 sm:space-y-6">
      {/* Top Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4 pb-4 sm:pb-5 border-b border-white/[0.06]">
        <div className="flex items-start sm:items-center justify-between gap-2 lg:justify-start">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11.5px] sm:text-[12px] font-medium ${
                entry.action === 'BUY'
                  ? 'bg-[#34D399]/10 text-[#34D399]'
                  : 'bg-[#F87171]/10 text-[#F87171]'
              }`}
            >
              {entry.action}
            </span>
            <span className="text-[15.5px] sm:text-[16px] font-semibold text-[#FAFAFA]">
              {entry.symbol}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-[#161619] text-[11.5px] sm:text-[12px] text-[#A1A1AA]">
              {entry.timeframe}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${origin.className}`}>
              {origin.label}
            </span>
            <span className="text-[13px] sm:text-[14px] text-[#A1A1AA]">{entry.strategy}</span>
            <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {new Date(entry.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </span>
          </div>

          <span
            className={`lg:hidden text-[14px] font-mono font-semibold tabular-nums shrink-0 ${
              entry.outcome === 'win' || pnlUsd > 0
                ? 'text-[#34D399]'
                : entry.outcome === 'loss' || pnlUsd < 0
                  ? 'text-[#F87171]'
                  : 'text-[#A1A1AA]'
            }`}
          >
            {entry.status === 'PARTIAL_TP1' && pnlUsd !== 0
              ? `${formatSignedUsd(pnlUsd)} (open)`
              : entry.outcome === 'pending' || entry.outcome === 'skipped'
                ? entry.outcome === 'pending'
                  ? 'Pending'
                  : 'Skipped'
                : pnlUsd !== 0 || entry.riskAmount > 0
                  ? formatSignedUsd(pnlUsd)
                  : `${pnlR >= 0 ? '+' : ''}${pnlR.toFixed(2)}R`}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <span
            className={`hidden lg:inline text-[15px] font-mono font-semibold tabular-nums mr-1 ${
              entry.outcome === 'win' || pnlUsd > 0
                ? 'text-[#34D399]'
                : entry.outcome === 'loss' || pnlUsd < 0
                  ? 'text-[#F87171]'
                  : 'text-[#A1A1AA]'
            }`}
          >
            {entry.status === 'PARTIAL_TP1' && pnlUsd !== 0
              ? `${formatSignedUsd(pnlUsd)} (open)`
              : entry.outcome === 'pending' || entry.outcome === 'skipped'
                ? entry.outcome === 'pending'
                  ? 'Pending'
                  : 'Skipped'
                : pnlUsd !== 0 || entry.riskAmount > 0
                  ? `${formatSignedUsd(pnlUsd)} (${pnlR >= 0 ? '+' : ''}${pnlR.toFixed(2)}R)`
                  : `${pnlR >= 0 ? '+' : ''}${pnlR.toFixed(2)}R`}
          </span>

          <select
            value={entry.outcome}
            onChange={(e) => handleOutcomeSelect(e.target.value as JournalOutcome)}
            aria-label="Trade outcome"
            className="h-9 flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] focus:border-white/[0.2] focus:outline-none"
          >
            <option value="pending">Pending</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
            <option value="skipped">Skipped</option>
          </select>

          {(entry.outcome === 'win' ||
            entry.outcome === 'loss' ||
            entry.outcome === 'breakeven') && (
            <Link
              to={`/replay/${encodeURIComponent(entry.tradeId || entry.id)}`}
              state={linkedTrade ? { trade: linkedTrade, journalEntry: entry } : { journalEntry: entry }}
              className="h-9 px-3 py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[13px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <PiPlay className="h-3.5 w-3.5 text-[#34D399]" />
              <span>Replay</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => onEdit(entry.id, { taken: !entry.taken })}
            className={`h-9 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
              entry.taken
                ? 'bg-[#FAFAFA] text-[#09090B]'
                : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]'
            }`}
          >
            {entry.taken ? 'Taken' : 'Mark Taken'}
          </button>

          {entry.outcome === 'pending' && !entry.breakEvenTriggered && (
            <button
              type="button"
              onClick={() => onBreakEven(entry.id)}
              title="Move Stop Loss to Break-Even"
              className="h-9 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[12.5px] sm:text-[13px] font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
            >
              <PiShield className="h-4 w-4 text-[#34D399]" />
              <span className="sm:hidden">SL to BE</span>
              <span className="hidden sm:inline">Move SL to BE</span>
            </button>
          )}

          {entry.breakEvenTriggered && (
            <span className="h-9 inline-flex items-center px-2.5 rounded-xl bg-[#161619] text-[12px] font-medium text-[#34D399]">
              BE Locked
            </span>
          )}

          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            title="Delete trade entry"
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#71717A] hover:text-[#F87171] transition-colors shrink-0"
          >
            <PiTrash className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Borderless Price Levels & Risk Sizing Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1">
          <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Entry</div>
          <div className="text-[14.5px] sm:text-[15px] font-mono font-medium tabular-nums text-[#FAFAFA]">
            {formatPrice(entry.entry)}
          </div>
        </div>
        <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1">
          <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">
            {entry.breakEvenTriggered ? 'Active SL (BE)' : 'Stop Loss'}
          </div>
          <div className="text-[14.5px] sm:text-[15px] font-mono font-medium tabular-nums text-[#F87171]">
            {formatPrice(effectiveSl)}
          </div>
        </div>
        <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1">
          <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Take Profit</div>
          <div className="text-[14.5px] sm:text-[15px] font-mono font-medium tabular-nums text-[#34D399]">
            {formatPrice(entry.tp)}
          </div>
        </div>
        <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1">
          <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Planned R:R</div>
          <div className="text-[14.5px] sm:text-[15px] font-mono font-medium tabular-nums text-[#FAFAFA]">
            {rr.toFixed(2)}R
          </div>
        </div>
        <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1">
          <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Confidence</div>
          <div className="text-[14.5px] sm:text-[15px] font-mono font-medium tabular-nums text-[#FAFAFA]">
            {entry.confidence}%
          </div>
        </div>
        <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1">
          <label className="block text-[11.5px] sm:text-[12px] text-[#71717A]">Risk ($)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={riskDraft}
            onChange={(e) => setRiskDraft(e.target.value)}
            className="w-full bg-transparent text-[14.5px] sm:text-[15px] font-mono font-medium tabular-nums text-[#FAFAFA] focus:outline-none border-b border-white/[0.12] sm:border-transparent focus:border-white/[0.25]"
          />
        </div>
      </div>

      {/* Interactive Tags & Trade Reflection Notes */}
      <div className="space-y-4">
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[#A1A1AA]">
              <PiTag className="h-4 w-4 text-[#71717A]" />
              Setup &amp; Mistake Tags
            </span>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <PiHash className="h-3.5 w-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustomTag()
                    }
                  }}
                  placeholder="Custom tag"
                  className="h-9 sm:h-auto pl-8 pr-3 py-1.5 rounded-xl bg-[#18181B] border border-white/[0.07] text-[12.5px] sm:text-[12px] text-[#FAFAFA] placeholder:text-[#71717A] focus:border-white/[0.2] focus:outline-none w-full sm:w-32"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="h-9 w-9 sm:h-auto sm:w-auto p-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[#FAFAFA] transition-colors inline-flex items-center justify-center shrink-0"
                aria-label="Add tag"
              >
                <PiPlus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {Array.from(new Set([...PRESET_TAGS, ...tagsDraft])).map((tag) => {
              const active = tagsDraft.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-full text-[12px] font-medium transition-colors ${
                    active
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'bg-[#161619] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1D1D22]'
                  }`}
                >
                  <span>{tag}</span>
                  {active && <PiX className="h-3 w-3" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2.5 sm:space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
            <label className="text-[13px] font-medium text-[#A1A1AA]">
              Execution Notes &amp; Post-Trade Review
            </label>
            <div className="flex items-center justify-between sm:justify-end gap-3">
              {savedNotice && (
                <span className="text-[12px] font-medium text-[#34D399]">Saved</span>
              )}
              <button
                type="button"
                onClick={handleSaveNotesAndRisk}
                className="h-9 sm:h-auto w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-medium transition-colors"
              >
                <PiFloppyDisk className="h-4 w-4" />
                <span>Save Notes &amp; Risk</span>
              </button>
            </div>
          </div>
          <textarea
            rows={3}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Record entry reasoning, market structure context, emotional discipline, or execution slippage..."
            className="w-full px-3.5 sm:px-4 py-3 rounded-xl bg-[#18181B] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none text-[14px] text-[#FAFAFA] placeholder:text-[#71717A] resize-y"
          />
        </div>
      </div>
    </article>
  )
}

export default function JournalDateDetail() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const [fallbackDateKey] = useState(() => toDateKey(Date.now()))
  const activeDateKey = date || fallbackDateKey

  const user = useAuthStore((s) => s.user)
  const activeUid = user?.id ?? null
  const storeSignals = useAnalysisSignalStore((s) => s.signals)
  const journal = useTradingContextStore((s) => s.journal)
  const fixedRiskAmount = useTradingContextStore((s) => s.fixedRiskAmount)
  const logSuggestionDecision = useTradingContextStore((s) => s.logSuggestionDecision)
  const editJournalEntry = useTradingContextStore((s) => s.editJournalEntry)
  const deleteJournalEntry = useTradingContextStore((s) => s.deleteJournalEntry)
  const triggerBreakEven = useTradingContextStore((s) => s.triggerBreakEven)
  const { paperTrades } = useMetaApi()
  const [remoteEntries, setRemoteEntries] = useState<JournalEntry[]>([])

  const defaultRiskUsd = fixedRiskAmount > 0 ? fixedRiskAmount : 50

  const refreshRemoteEntries = useCallback(() => {
    let active = true
    getJournalEntries()
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return
        const mapped = rows
          .map((r) => normalizeRemoteDetailEntry(r))
          .filter((item): item is JournalEntry => item !== null)
        setRemoteEntries(mapped)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return refreshRemoteEntries()
  }, [refreshRemoteEntries, activeUid, paperTrades.length])

  useEffect(() => {
    const onUpdate = () => {
      refreshRemoteEntries()
    }
    const unsub1 = webSocketService.subscribe('paper-trade-updated', onUpdate)
    const unsub2 = webSocketService.subscribe('signal-updated', onUpdate)
    return () => {
      unsub1()
      unsub2()
    }
  }, [refreshRemoteEntries])

  const paperTradesById = useMemo(() => {
    const map = new Map<string, PaperTradeRecord>()
    for (const t of paperTrades) {
      map.set(t.id, t)
      if (t.signalId) map.set(t.signalId, t)
    }
    return map
  }, [paperTrades])

  const mergedEntries = useMemo(() => {
    const records = new Map<string, JournalEntry>()
    const aliasToPrimary = new Map<string, string>()

    const score = (e: JournalEntry): number => {
      let s = 0
      if (e.taken) s += 100
      if (e.tradeId) s += 40
      if (e.mode === 'paper' || e.mode === 'metaapi') s += 30
      else if (e.mode === 'manual') s += 20
      else if (e.mode === 'signal') s += 0
      else s += 10
      if (e.outcome !== 'pending' && e.outcome !== 'skipped') s += 10
      if (typeof e.pnlUsd === 'number' && e.pnlUsd !== 0) s += 5
      return s
    }

    const collectAliases = (e: JournalEntry): string[] => {
      const aliases: string[] = []
      if (e.id) aliases.push(`id:${e.id}`)
      if (e.tradeId) aliases.push(`trade:${e.tradeId}`)
      if (e.signalId) aliases.push(`sig:${e.signalId}`)
      if (e.suggestionKey) {
        if (e.suggestionKey.startsWith('signal:')) {
          aliases.push(`sig:${e.suggestionKey.slice(7)}`)
        } else if (
          !e.suggestionKey.startsWith('remote:') &&
          !e.suggestionKey.startsWith('trade:')
        ) {
          aliases.push(`sugg:${e.suggestionKey}`)
          if (!e.suggestionKey.startsWith('auto:')) {
            aliases.push(`sig:${e.suggestionKey}`)
          }
        }
      }
      const canon = canonicalSignalKey({
        id: e.signalId || e.id,
        strategy: e.strategy,
        symbol: e.symbol,
        timeframe: e.timeframe,
        action: e.action,
        createdAt: e.createdAt,
      })
      if (canon) aliases.push(`canon:${canon}`)
      return aliases
    }

    const upsert = (incoming: JournalEntry) => {
      const aliases = collectAliases(incoming)
      let primaryKey: string | undefined
      for (const alias of aliases) {
        const hit = aliasToPrimary.get(alias)
        if (hit && records.has(hit)) {
          primaryKey = hit
          break
        }
      }

      if (!primaryKey) {
        primaryKey = aliases[0] || `id:${incoming.id}`
        records.set(primaryKey, incoming)
        for (const alias of aliases) {
          aliasToPrimary.set(alias, primaryKey)
        }
        return
      }

      const existing = records.get(primaryKey)!
      const incomingWins = score(incoming) >= score(existing)
      const winner = incomingWins ? incoming : existing
      const loser = incomingWins ? existing : incoming

      const existingHasUserNotes = Boolean(
        existing.notes && existing.notes.trim() && existing.mode !== 'signal'
      )
      const mergedNotes =
        incomingWins && incoming.mode === 'paper' && existingHasUserNotes
          ? existing.notes
          : winner.notes || loser.notes

      records.set(primaryKey, {
        ...winner,
        notes: mergedNotes,
      })

      for (const alias of aliases) {
        aliasToPrimary.set(alias, primaryKey)
      }
    }

    for (const s of storeSignals) {
      if (!isTimestampVisibleForUser(s.time, user)) continue
      upsert(signalToDetailEntry(s, defaultRiskUsd))
    }
    for (const e of journal) upsert(e)
    for (const e of remoteEntries) upsert(e)
    for (const t of paperTrades) upsert(paperTradeToDetailEntry(t))

    return Array.from(records.values())
  }, [storeSignals, defaultRiskUsd, journal, remoteEntries, paperTrades, user])

  const dayEntries = useMemo(() => {
    return mergedEntries
      .filter((entry) => toDateKey(entry.createdAt) === activeDateKey)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [mergedEntries, activeDateKey])

  const takenEntries = useMemo(() => dayEntries.filter((e) => e.taken), [dayEntries])
  const systemEntries = useMemo(() => dayEntries.filter((e) => !e.taken), [dayEntries])

  const dayStats = useMemo(() => {
    const baseList = takenEntries.length > 0 ? takenEntries : dayEntries
    let wins = 0
    let losses = 0
    let netUsd = 0
    let netR = 0
    for (const e of baseList) {
      const m = computePnl(e, defaultRiskUsd)
      if (e.outcome === 'win') {
        wins += 1
        netUsd += m.pnlUsd
        netR += m.pnlR
      } else if (e.outcome === 'loss') {
        losses += 1
        netUsd += m.pnlUsd
        netR += m.pnlR
      } else if (
        (e.outcome === 'breakeven' || e.status === 'PARTIAL_TP1') &&
        m.pnlUsd !== 0
      ) {
        netUsd += m.pnlUsd
        netR += m.pnlR
      }
    }
    const decided = wins + losses
    return {
      wins,
      losses,
      winRate: decided > 0 ? (wins / decided) * 100 : 0,
      netUsd,
      netR,
      totalCount: dayEntries.length,
    }
  }, [takenEntries, dayEntries, defaultRiskUsd])

  const handleEditEntry = (id: string, updates: Partial<JournalEntry>) => {
    if (journal.some((j) => j.id === id)) {
      editJournalEntry(id, updates)
      return
    }
    const target = dayEntries.find((e) => e.id === id)
    if (target) {
      logSuggestionDecision({
        ...target,
        ...updates,
        mode: target.mode === 'signal' && updates.taken ? 'manual' : target.mode,
      })
    }
  }

  const handleBreakEven = (id: string) => {
    if (journal.some((j) => j.id === id)) {
      triggerBreakEven(id)
      return
    }
    const target = dayEntries.find((e) => e.id === id)
    if (target) {
      logSuggestionDecision({
        ...target,
        breakEvenTriggered: true,
        currentSl: target.entry,
      })
    }
  }

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <Link
              to="/journal"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              <PiArrowLeft className="h-4 w-4" />
              <span>Back to calendar</span>
            </Link>
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
                {formatHumanDate(activeDateKey)}
              </h1>
              <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#161619] text-[12px] sm:text-[13px] font-mono tabular-nums text-[#A1A1AA]">
                {activeDateKey}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => navigate(`/journal/${shiftDateKey(activeDateKey, -1)}`)}
              className="h-10 sm:h-auto inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[12.5px] sm:text-[13px] font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
            >
              <PiCaretLeft className="h-4 w-4 text-[#A1A1AA] shrink-0" />
              <span>Previous Day</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/journal/${shiftDateKey(activeDateKey, 1)}`)}
              className="h-10 sm:h-auto inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[12.5px] sm:text-[13px] font-medium text-[#FAFAFA] transition-colors whitespace-nowrap"
            >
              <span>Next Day</span>
              <PiCaretRight className="h-4 w-4 text-[#A1A1AA] shrink-0" />
            </button>
          </div>
        </div>

        {/* Daily Review Card */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1">
            <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              Daily Review
            </h2>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
              Price levels, risk sizing, execution notes, and realized outcome for this date.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 lg:min-w-[540px]">
            <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1 min-w-0">
              <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Net P&amp;L</div>
              <div
                className={`text-[16px] sm:text-[18px] font-mono font-semibold tabular-nums truncate ${
                  dayStats.netUsd > 0 || (dayStats.netUsd === 0 && dayStats.netR > 0)
                    ? 'text-[#34D399]'
                    : dayStats.netUsd < 0 || (dayStats.netUsd === 0 && dayStats.netR < 0)
                      ? 'text-[#F87171]'
                      : 'text-[#FAFAFA]'
                }`}
              >
                {dayStats.netUsd !== 0
                  ? formatSignedUsd(dayStats.netUsd)
                  : `${dayStats.netR >= 0 ? '+' : ''}${dayStats.netR.toFixed(2)}R`}
              </div>
            </div>

            <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1 min-w-0">
              <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">R Multiple</div>
              <div
                className={`text-[16px] sm:text-[18px] font-mono font-semibold tabular-nums ${
                  dayStats.netR > 0
                    ? 'text-[#34D399]'
                    : dayStats.netR < 0
                      ? 'text-[#F87171]'
                      : 'text-[#FAFAFA]'
                }`}
              >
                {dayStats.netR >= 0 ? '+' : ''}
                {dayStats.netR.toFixed(2)}R
              </div>
            </div>

            <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1 min-w-0">
              <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Win Rate</div>
              <div className="text-[16px] sm:text-[18px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                {dayStats.winRate.toFixed(0)}%
              </div>
              <div className="text-[11.5px] sm:text-[12px] font-mono tabular-nums text-[#71717A]">
                <span className="text-[#34D399]">{dayStats.wins}W</span> /{' '}
                <span className="text-[#F87171]">{dayStats.losses}L</span>
              </div>
            </div>

            <div className="rounded-xl bg-[#161619] p-3 sm:p-4 space-y-1 min-w-0">
              <div className="text-[11.5px] sm:text-[12px] text-[#71717A]">Entries</div>
              <div className="text-[16px] sm:text-[18px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                {dayStats.totalCount}
              </div>
              <div className="text-[11.5px] sm:text-[12px] font-mono tabular-nums text-[#71717A]">
                {takenEntries.length} taken · {systemEntries.length} sys
              </div>
            </div>
          </div>
        </section>

        {dayEntries.length === 0 ? (
          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 sm:p-12 text-center space-y-4">
            <img
              src="/brand/empty-journal.png"
              alt="No journal entries for this date"
              className="w-full max-w-[220px] sm:max-w-[260px] mx-auto rounded-xl object-cover opacity-90"
            />
            <div className="space-y-1.5">
              <p className="text-[15px] font-medium text-[#FAFAFA]">
                No trades or signals logged for {activeDateKey}
              </p>
              <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
                Navigate to another trading day or return to the monthly P&amp;L calendar.
              </p>
            </div>
            <div>
              <Link
                to="/journal"
                className="inline-flex h-10 sm:h-auto items-center gap-2 px-4 py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
              >
                <PiArrowLeft className="h-4 w-4" />
                <span>Return to Calendar</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {takenEntries.length > 0 && (
              <section className="space-y-3.5 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                    Taken Executions{' '}
                    <span className="text-[14px] font-mono tabular-nums font-normal text-[#71717A]">
                      ({takenEntries.length})
                    </span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {takenEntries.map((entry) => (
                    <JournalTradeCard
                      key={entry.id}
                      entry={entry}
                      defaultRiskUsd={defaultRiskUsd}
                      linkedTrade={
                        (entry.tradeId ? paperTradesById.get(entry.tradeId) : undefined) ||
                        (entry.signalId ? paperTradesById.get(entry.signalId) : undefined) ||
                        paperTradesById.get(entry.id)
                      }
                      onEdit={handleEditEntry}
                      onDelete={deleteJournalEntry}
                      onBreakEven={handleBreakEven}
                    />
                  ))}
                </div>
              </section>
            )}

            {systemEntries.length > 0 && (
              <section className="space-y-3.5 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#A1A1AA]">
                    System Detected Signals{' '}
                    <span className="text-[14px] font-mono tabular-nums font-normal text-[#71717A]">
                      ({systemEntries.length})
                    </span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {systemEntries.map((entry) => (
                    <JournalTradeCard
                      key={entry.id}
                      entry={entry}
                      defaultRiskUsd={defaultRiskUsd}
                      linkedTrade={
                        (entry.tradeId ? paperTradesById.get(entry.tradeId) : undefined) ||
                        (entry.signalId ? paperTradesById.get(entry.signalId) : undefined) ||
                        paperTradesById.get(entry.id)
                      }
                      onEdit={handleEditEntry}
                      onDelete={deleteJournalEntry}
                      onBreakEven={handleBreakEven}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
