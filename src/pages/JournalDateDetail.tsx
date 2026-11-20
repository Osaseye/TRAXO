import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  PiArrowLeft,
  PiCaretLeft,
  PiCaretRight,
  PiFloppyDisk,
  PiHash,
  PiPlus,
  PiShield,
  PiTag,
  PiTrash,
  PiX,
} from 'react-icons/pi'
import { updateJournalEntry } from '@/lib/api'
import {
  useTradingContextStore,
  type JournalEntry,
  type JournalOutcome,
} from '@/stores/useTradingContextStore'

const PRESET_TAGS = ['#A+', '#London', '#NewYork', '#TrendAligned', '#News', '#EarlyExit', '#RuleBreak']

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

function computePnl(entry: JournalEntry): { rr: number; pnlUsd: number; pnlR: number } {
  const riskDist = Math.abs(entry.entry - entry.sl)
  const rewardDist = Math.abs(entry.tp - entry.entry)
  const rr = riskDist > 0 ? rewardDist / riskDist : 0
  if (entry.outcome === 'win') {
    return { rr, pnlUsd: entry.riskAmount > 0 ? entry.riskAmount * rr : 0, pnlR: rr }
  }
  if (entry.outcome === 'loss') {
    return { rr, pnlUsd: entry.riskAmount > 0 ? -entry.riskAmount : 0, pnlR: -1 }
  }
  return { rr, pnlUsd: 0, pnlR: 0 }
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
  onEdit: (id: string, updates: Partial<JournalEntry>) => void
  onDelete: (id: string) => void
  onBreakEven: (id: string) => void
}

function JournalTradeCard({ entry, onEdit, onDelete, onBreakEven }: EntryCardProps) {
  const { rr, pnlUsd, pnlR } = computePnl(entry)
  const initialTags = useMemo(() => extractTags(entry.notes), [entry.notes])
  const initialBody = useMemo(() => stripTagsFromNotes(entry.notes), [entry.notes])

  const [notesDraft, setNotesDraft] = useState(initialBody)
  const [tagsDraft, setTagsDraft] = useState<string[]>(initialTags)
  const [customTag, setCustomTag] = useState('')
  const [riskDraft, setRiskDraft] = useState(String(entry.riskAmount || 0))
  const [savedNotice, setSavedNotice] = useState(false)

  const handleSaveNotesAndRisk = () => {
    const combinedNotes = serializeNotesAndTags(notesDraft, tagsDraft)
    const parsedRisk = Math.max(0, Number(riskDraft) || 0)
    const updatedEntry: JournalEntry = {
      ...entry,
      notes: combinedNotes,
      riskAmount: parsedRisk,
    }
    const nextPnl = computePnl(updatedEntry)
    onEdit(entry.id, { notes: combinedNotes, riskAmount: parsedRisk })
    updateJournalEntry(entry.id, {
      notes: combinedNotes,
      outcome: entry.outcome,
      pnlUsd: nextPnl.pnlUsd,
    }).catch(() => {})
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
    updateJournalEntry(entry.id, { notes: combinedNotes }).catch(() => {})
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
      updateJournalEntry(entry.id, { notes: combinedNotes }).catch(() => {})
    }
    setCustomTag('')
  }

  const handleOutcomeSelect = (nextOutcome: JournalOutcome) => {
    const nextPnl = computePnl({ ...entry, outcome: nextOutcome })
    onEdit(entry.id, { outcome: nextOutcome })
    updateJournalEntry(entry.id, {
      outcome: nextOutcome,
      pnlUsd: nextPnl.pnlUsd,
    }).catch(() => {})
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
              entry.outcome === 'win'
                ? 'text-[#34D399]'
                : entry.outcome === 'loss'
                  ? 'text-[#F87171]'
                  : 'text-[#A1A1AA]'
            }`}
          >
            {entry.outcome === 'pending' || entry.outcome === 'skipped'
              ? entry.outcome === 'pending'
                ? 'Pending'
                : 'Skipped'
              : entry.riskAmount > 0
                ? formatSignedUsd(pnlUsd)
                : `${pnlR >= 0 ? '+' : ''}${pnlR.toFixed(2)}R`}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <span
            className={`hidden lg:inline text-[15px] font-mono font-semibold tabular-nums mr-1 ${
              entry.outcome === 'win'
                ? 'text-[#34D399]'
                : entry.outcome === 'loss'
                  ? 'text-[#F87171]'
                  : 'text-[#A1A1AA]'
            }`}
          >
            {entry.outcome === 'pending' || entry.outcome === 'skipped'
              ? entry.outcome === 'pending'
                ? 'Pending'
                : 'Skipped'
              : entry.riskAmount > 0
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

  const journal = useTradingContextStore((s) => s.journal)
  const editJournalEntry = useTradingContextStore((s) => s.editJournalEntry)
  const deleteJournalEntry = useTradingContextStore((s) => s.deleteJournalEntry)
  const triggerBreakEven = useTradingContextStore((s) => s.triggerBreakEven)

  const dayEntries = useMemo(() => {
    return journal
      .filter((entry) => toDateKey(entry.createdAt) === activeDateKey)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [journal, activeDateKey])

  const takenEntries = useMemo(() => dayEntries.filter((e) => e.taken), [dayEntries])
  const systemEntries = useMemo(() => dayEntries.filter((e) => !e.taken), [dayEntries])

  const dayStats = useMemo(() => {
    const baseList = takenEntries.length > 0 ? takenEntries : dayEntries
    let wins = 0
    let losses = 0
    let netUsd = 0
    let netR = 0
    for (const e of baseList) {
      const m = computePnl(e)
      if (e.outcome === 'win') {
        wins += 1
        netUsd += m.pnlUsd
        netR += m.pnlR
      } else if (e.outcome === 'loss') {
        losses += 1
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
  }, [takenEntries, dayEntries])

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
                      onEdit={editJournalEntry}
                      onDelete={deleteJournalEntry}
                      onBreakEven={triggerBreakEven}
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
                      onEdit={editJournalEntry}
                      onDelete={deleteJournalEntry}
                      onBreakEven={triggerBreakEven}
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
