import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import type { Signal } from '@/types'

const STRATEGY_NAMES: Record<string, string> = {
  wick_rejection: 'Wick Rejection',
  breakout: 'Breakout',
  trend_following: 'Trend Following',
  supply_demand: 'Supply & Demand',
  scalping: 'Scalping',
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

export function SignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false)

  const isBuy = signal.signal === 'BUY'
  const isSell = signal.signal === 'SELL'
  const confidencePct = Math.round(signal.confidence * 100)
  const strategyName = STRATEGY_NAMES[signal.strategy_id] ?? signal.strategy_id.replace(/_/g, ' ')
  const accentColor = isBuy ? '#22c55e' : isSell ? '#ef4444' : '#6b7280'

  return (
    <div
      className="relative bg-[#0d1117] rounded-xl overflow-hidden transition-colors duration-100"
      style={{ border: `1px solid ${accentColor}22` }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: accentColor }}
      />

      {/* Main content */}
      <div
        className="pl-4 pr-3 pt-3 pb-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Top row: direction + symbol + time */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ background: accentColor + '20', color: accentColor }}
            >
              {signal.signal}
            </span>
            <span className="text-[15px] font-bold text-[#e5e7eb]">{signal.symbol}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-[#374151] font-medium">
              {signal.timeframe}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-[#374151]">{timeAgo(signal.timestamp)}</span>
            <span className="text-[#374151]">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </div>
        </div>

        {/* Strategy + confidence bar */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[10px] text-[#374151] font-medium shrink-0">{strategyName}</span>
          <div className="flex-1 h-[3px] bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${confidencePct}%`, background: accentColor }}
            />
          </div>
          <span
            className="text-[11px] font-bold shrink-0 tabular"
            style={{ color: accentColor }}
          >
            {confidencePct}%
          </span>
        </div>

        {/* Entry / SL / TP / R:R */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { l: 'Entry', v: formatPrice(signal.entry), c: '#e5e7eb' },
            { l: 'SL',    v: formatPrice(signal.sl),    c: '#ef4444' },
            { l: 'TP',    v: formatPrice(signal.tp),    c: '#22c55e' },
            { l: 'R:R',   v: `${signal.rr_ratio.toFixed(1)}x`, c: '#3b82f6' },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-[#0b0f17] rounded-lg px-2 py-1.5 text-center">
              <p className="text-[8px] text-[#374151] uppercase tracking-wider mb-0.5">{l}</p>
              <p className="text-[10px] font-bold tabular" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded: reasoning */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-3 bg-[#0b0f17]">
          <p className="text-[9px] font-semibold text-[#374151] uppercase tracking-widest mb-2.5">
            Why this signal
          </p>
          <div className="space-y-2">
            {signal.reason.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                  style={{ background: accentColor }}
                />
                <p className="text-[11px] text-[#6b7280] leading-snug">{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
