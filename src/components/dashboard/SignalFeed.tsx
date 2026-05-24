import { useState } from 'react'
import { SignalCard } from './SignalCard'
import { cn } from '@/lib/utils'
import type { Signal, SignalDirection } from '@/types'

interface SignalFeedProps {
  signals: Signal[]
}

const FILTERS: Array<{ label: string; value: SignalDirection | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Buy', value: 'BUY' },
  { label: 'Sell', value: 'SELL' },
  { label: 'Skip', value: 'NO_TRADE' },
]

export function SignalFeed({ signals }: SignalFeedProps) {
  const [filter, setFilter] = useState<SignalDirection | 'ALL'>('ALL')

  const filtered = filter === 'ALL' ? signals : signals.filter((s) => s.signal === filter)

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border border-[#1e293b] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b] shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[#e5e7eb]">Signal Feed</span>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6] text-[10px] font-bold flex items-center justify-center tabular">
            {signals.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[10px] font-semibold text-[#22c55e] uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1e293b] shrink-0">
        {FILTERS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors duration-100 uppercase tracking-wide',
              filter === opt.value
                ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                : 'text-[#374151] hover:text-[#e5e7eb] hover:bg-white/[0.04]'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Signals */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <p className="text-[13px] text-[#374151]">No signals</p>
            <p className="text-[11px] text-[#1e293b]">Waiting for market conditions...</p>
          </div>
        ) : (
          filtered.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))
        )}
      </div>
    </div>
  )
}
