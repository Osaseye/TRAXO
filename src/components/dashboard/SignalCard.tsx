import { useState } from 'react'
import {
  PiCaretDown,
  PiCaretUp,
  PiCheck,
  PiCopy,
  PiCrosshair,
  PiLightning,
  PiSpinnerGap,
} from 'react-icons/pi'
import { calculateLots, cn, formatMT4OrderClipboardPayload, formatPrice } from '@/lib/utils'
import { showToast } from '@/stores/useToastStore'
import type { Signal, SignalDirection } from '@/types'
import type { StoredSignal } from '@/stores/useAnalysisSignalStore'

export type DashboardSignalItem = Signal | StoredSignal

export interface SignalCardProps {
  signal: DashboardSignalItem
  isSelected?: boolean
  riskAmountUsd?: number
  onFocus?: (signal: DashboardSignalItem) => void
  onExecute?: (signal: DashboardSignalItem, lotSize: number) => Promise<void> | void
  onLogDecision?: (signal: DashboardSignalItem, taken: boolean) => void
}

const STRATEGY_NAMES: Record<string, string> = {
  wick_rejection: 'Wick Rejection',
  'wick-rejection': 'Wick Rejection',
  breakout: 'Breakout',
  order_block: 'Order Block',
  'order-block': 'Order Block',
  trend_following: 'Trend Following',
  'trend-following': 'Trend Following',
  supply_demand: 'Supply & Demand',
  'supply-demand': 'Supply & Demand',
  scalping: 'Scalping',
}

interface NormalizedSignal {
  id: string
  symbol: string
  timeframe: string
  direction: SignalDirection
  strategyLabel: string
  confidencePct: number
  entry: number
  sl: number
  tp: number
  rr: number
  reason: string[]
  status?: string
  timeMs: number
}

function normalizeSignal(raw: DashboardSignalItem): NormalizedSignal {
  if ('signal' in raw) {
    return {
      id: raw.id,
      symbol: raw.symbol,
      timeframe: raw.timeframe,
      direction: raw.signal,
      strategyLabel: STRATEGY_NAMES[raw.strategy_id] ?? raw.strategy_id.replace(/[_-]/g, ' '),
      confidencePct: raw.confidence <= 1 ? Math.round(raw.confidence * 100) : Math.round(raw.confidence),
      entry: raw.entry,
      sl: raw.sl,
      tp: raw.tp,
      rr: raw.rr_ratio,
      reason: raw.reason ?? [],
      status: undefined,
      timeMs: new Date(raw.timestamp).getTime(),
    }
  }

  return {
    id: raw.id,
    symbol: raw.symbol,
    timeframe: raw.timeframe,
    direction: raw.direction,
    strategyLabel: raw.strategyLabel || STRATEGY_NAMES[raw.strategyId] || raw.strategyId.replace(/[_-]/g, ' '),
    confidencePct: raw.confidence <= 1 ? Math.round(raw.confidence * 100) : Math.round(raw.confidence),
    entry: raw.entry,
    sl: raw.sl,
    tp: raw.tp,
    rr: raw.rr,
    reason: raw.reason ?? [],
    status: raw.status,
    timeMs: raw.time > 1e12 ? raw.time : raw.time * 1000,
  }
}

function timeAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const diffMs = Math.max(0, Date.now() - ms)
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  return `${Math.floor(diffHours / 24)}d`
}

function statusBadgeMeta(status?: string): { label: string; className: string } | null {
  if (!status) return null
  const lower = status.toLowerCase()
  if (lower === 'live') {
    return { label: 'Live', className: 'text-[#34D399] bg-[#34D399]/10' }
  }
  if (lower === 'win' || lower === 'tp_hit' || lower === 'tp') {
    return { label: 'Win', className: 'text-[#34D399] bg-[#34D399]/10' }
  }
  if (lower === 'loss' || lower === 'sl_hit' || lower === 'sl') {
    return { label: 'Loss', className: 'text-[#F87171] bg-[#F87171]/10' }
  }
  if (lower === 'expired') {
    return { label: 'Expired', className: 'text-[#71717A] bg-white/[0.05]' }
  }
  return {
    label: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
    className: 'text-[#A1A1AA] bg-white/[0.05]',
  }
}

export function SignalCard({
  signal,
  isSelected = false,
  riskAmountUsd = 50,
  onFocus,
  onExecute,
  onLogDecision,
}: SignalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [copied, setCopied] = useState(false)

  const item = normalizeSignal(signal)
  const isBuy = item.direction === 'BUY'
  const isSell = item.direction === 'SELL'
  const isTradeable = isBuy || isSell
  const lots = isTradeable ? calculateLots(item.symbol, item.entry, item.sl, Math.max(1, riskAmountUsd)) : 0.01
  const statusMeta = statusBadgeMeta(item.status)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const payload = formatMT4OrderClipboardPayload({
      symbol: item.symbol,
      direction: item.direction,
      entry: item.entry,
      sl: item.sl,
      tp: item.tp,
      riskAmount: riskAmountUsd,
    })
    void navigator.clipboard.writeText(payload)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleExecute = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isTradeable || executing) return
    try {
      setExecuting(true)
      if (onExecute) {
        await onExecute(signal, lots)
        return
      }
      const res = await fetch('/api/metaapi/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: item.symbol,
          action: item.direction,
          volume: lots,
          sl: item.sl,
          tp: item.tp,
          entryType: 'market',
        }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('MT5 Order Sent', `${item.direction} ${lots}L ${item.symbol} placed on Exness`, 'success')
      } else {
        showToast('MT5 Notice', data.error || 'Execution declined by broker bridge', 'info')
      }
    } catch {
      showToast('Server Error', 'Unable to reach MT5 execution bridge', 'error')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-[#111113] border p-4 space-y-3 transition-colors',
        isSelected
          ? 'border-white/[0.24] bg-[#161619]'
          : 'border-white/[0.06] hover:border-white/[0.14]'
      )}
    >
      {/* Top Row: Direction + Symbol + Timeframe + Status + Age */}
      <div
        className="flex items-center justify-between gap-2 cursor-pointer select-none"
        onClick={() => (onFocus ? onFocus(signal) : setExpanded((prev) => !prev))}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'text-[12px] font-semibold px-2 py-0.5 rounded-md shrink-0',
              isBuy
                ? 'bg-[#34D399]/15 text-[#34D399]'
                : isSell
                ? 'bg-[#F87171]/15 text-[#F87171]'
                : 'bg-white/[0.06] text-[#71717A]'
            )}
          >
            {item.direction === 'NO_TRADE' ? 'Skip' : item.direction}
          </span>
          <span className="text-[14px] font-semibold text-[#FAFAFA] truncate">{item.symbol}</span>
          <span className="text-[12px] text-[#71717A] shrink-0">{item.timeframe}</span>
          {statusMeta && (
            <span
              className={cn(
                'text-[12px] font-medium px-2 py-0.5 rounded-full shrink-0',
                statusMeta.className
              )}
            >
              {statusMeta.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] font-mono tabular-nums text-[#71717A]">{timeAgo(item.timeMs)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((prev) => !prev)
            }}
            className="p-0.5 text-[#71717A] hover:text-[#FAFAFA] transition-colors"
            aria-label={expanded ? 'Collapse setup details' : 'Expand setup details'}
          >
            {expanded ? <PiCaretUp size={16} /> : <PiCaretDown size={16} />}
          </button>
        </div>
      </div>

      {/* Strategy & Confidence Bar */}
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] text-[#A1A1AA] truncate">{item.strategyLabel}</span>
        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full',
              isBuy ? 'bg-[#34D399]' : isSell ? 'bg-[#F87171]' : 'bg-[#71717A]'
            )}
            style={{ width: `${Math.min(100, Math.max(0, item.confidencePct))}%` }}
          />
        </div>
        <span className="text-[13px] font-mono tabular-nums font-medium text-[#FAFAFA] shrink-0">
          {item.confidencePct}%
        </span>
      </div>

      {/* Entry / SL / TP / R:R Strip */}
      <div className="grid grid-cols-4 gap-2 bg-[#161619] rounded-xl px-3 py-2.5">
        <div className="min-w-0">
          <span className="block text-[12px] text-[#71717A]">Entry</span>
          <span className="block text-[12px] font-mono tabular-nums font-medium text-[#FAFAFA] truncate mt-0.5">
            {formatPrice(item.entry, undefined, item.symbol)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[12px] text-[#71717A]">SL</span>
          <span className="block text-[12px] font-mono tabular-nums font-medium text-[#F87171] truncate mt-0.5">
            {formatPrice(item.sl, undefined, item.symbol)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[12px] text-[#71717A]">TP</span>
          <span className="block text-[12px] font-mono tabular-nums font-medium text-[#34D399] truncate mt-0.5">
            {formatPrice(item.tp, undefined, item.symbol)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[12px] text-[#71717A]">R:R</span>
          <span className="block text-[12px] font-mono tabular-nums font-medium text-[#FAFAFA] truncate mt-0.5">
            {item.rr.toFixed(2)}R
          </span>
        </div>
      </div>

      {/* Action Row: Chart Focus, MT5 Execute & Copy */}
      <div className="flex items-center gap-2">
        {onFocus && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFocus(signal)
            }}
            className={cn(
              'h-8 px-3 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors shrink-0',
              isSelected
                ? 'bg-[#FAFAFA] text-[#09090B]'
                : 'bg-[#161619] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/[0.08]'
            )}
            title="Focus and lock this setup on chart"
          >
            <PiCrosshair size={15} />
            <span>{isSelected ? 'Focused' : 'Focus'}</span>
          </button>
        )}

        {isTradeable && (
          <button
            type="button"
            disabled={executing}
            onClick={handleExecute}
            className="flex-1 h-8 px-3 rounded-lg bg-[#161619] hover:bg-white/[0.08] border border-white/[0.08] text-[#FAFAFA] text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            title={`Execute ${item.direction} ${lots} lots on Exness MT5`}
          >
            {executing ? (
              <PiSpinnerGap size={15} className="animate-spin text-[#A1A1AA]" />
            ) : (
              <PiLightning size={15} className={isBuy ? 'text-[#34D399]' : 'text-[#F87171]'} />
            )}
            <span>{executing ? 'Sending...' : 'Execute MT5'}</span>
            <span className="text-[12px] font-mono tabular-nums text-[#71717A]">({lots}L)</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleCopy}
          className="h-8 w-8 rounded-lg bg-[#161619] hover:bg-white/[0.08] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] flex items-center justify-center transition-colors shrink-0"
          title="Copy order details"
        >
          {copied ? <PiCheck size={15} className="text-[#34D399]" /> : <PiCopy size={15} />}
        </button>
      </div>

      {/* Expanded Checkpoints & Decision Log */}
      {expanded && (
        <div className="pt-3 border-t border-white/[0.06] space-y-3">
          {item.reason.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-[#71717A]">Confluence reasons</p>
              <ul className="space-y-1">
                {item.reason.map((r, idx) => (
                  <li key={idx} className="text-[13px] text-[#A1A1AA] leading-relaxed flex items-start gap-2">
                    <span className="text-[#71717A] mt-[2px]">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onLogDecision && isTradeable && (
            <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06]">
              <span className="text-[12px] text-[#71717A]">Log decision</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLogDecision(signal, true)
                  }}
                  className="h-7 px-3 rounded-lg bg-[#161619] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#34D399]/50 text-[12px] font-medium text-[#FAFAFA] transition-colors"
                >
                  Took it
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLogDecision(signal, false)
                  }}
                  className="h-7 px-3 rounded-lg bg-[#161619] hover:bg-white/[0.08] border border-white/[0.08] text-[12px] font-medium text-[#71717A] hover:text-[#FAFAFA] transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
