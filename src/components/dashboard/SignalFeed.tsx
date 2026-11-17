import { useMemo, useState } from 'react'
import { SignalCard, type DashboardSignalItem } from './SignalCard'
import { cn } from '@/lib/utils'
import type { SignalDirection } from '@/types'

export interface SignalFeedProps {
  signals: DashboardSignalItem[]
  selectedSignalId?: string | null
  riskAmountUsd?: number
  onFocusSignal?: (signal: DashboardSignalItem) => void
  onExecuteSignal?: (signal: DashboardSignalItem, lotSize: number) => Promise<void> | void
  onLogDecision?: (signal: DashboardSignalItem, taken: boolean) => void
  className?: string
}

type DirectionFilter = SignalDirection | 'ALL' | 'LIVE'

function getDirection(item: DashboardSignalItem): SignalDirection {
  return 'signal' in item ? item.signal : item.direction
}

function getStatus(item: DashboardSignalItem): string | undefined {
  return 'status' in item ? item.status : undefined
}

export function SignalFeed({
  signals,
  selectedSignalId = null,
  riskAmountUsd = 50,
  onFocusSignal,
  onExecuteSignal,
  onLogDecision,
  className,
}: SignalFeedProps) {
  const [filter, setFilter] = useState<DirectionFilter>('ALL')

  const hasNoTrade = useMemo(
    () => signals.some((s) => getDirection(s) === 'NO_TRADE'),
    [signals]
  )

  const filterOptions: Array<{ label: string; value: DirectionFilter }> = useMemo(() => {
    const base: Array<{ label: string; value: DirectionFilter }> = [
      { label: 'All', value: 'ALL' },
      { label: 'Live', value: 'LIVE' },
      { label: 'Buy', value: 'BUY' },
      { label: 'Sell', value: 'SELL' },
    ]
    if (hasNoTrade) base.push({ label: 'Skip', value: 'NO_TRADE' })
    return base
  }, [hasNoTrade])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return signals
    if (filter === 'LIVE') return signals.filter((s) => getStatus(s)?.toLowerCase() === 'live')
    return signals.filter((s) => getDirection(s) === filter)
  }, [signals, filter])

  const liveCount = useMemo(
    () => signals.filter((s) => getStatus(s)?.toLowerCase() === 'live').length,
    [signals]
  )

  return (
    <div className={cn('flex flex-col h-full bg-transparent overflow-hidden', className)}>
      {/* Header & Filter Strip */}
      <div className="px-4 pt-3 pb-2.5 border-b border-white/[0.06] space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[#FAFAFA]">Setups</span>
            <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {filtered.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                liveCount > 0 ? 'bg-[#34D399]' : 'bg-[#52525B]'
              )}
            />
            <span className="text-[12px] text-[#A1A1AA] tabular-nums">
              {liveCount > 0 ? (
                <>
                  <span className="font-mono">{liveCount}</span> live
                </>
              ) : (
                'Standby'
              )}
            </span>
          </div>
        </div>

        {/* Clean Pill Filter Strip */}
        <div className="flex items-center gap-1 rounded-full bg-[#161619] p-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={cn(
                'flex-1 py-1 px-2.5 rounded-full text-[12px] font-medium transition-colors',
                filter === opt.value
                  ? 'bg-white/[0.1] text-[#FAFAFA]'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Signal List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <img
              src="/brand/empty-signals.png"
              alt="No active setups"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
              className="w-48 aspect-video object-cover rounded-xl border border-white/[0.06] mb-4 opacity-90"
            />
            <p className="text-[14px] font-medium text-[#FAFAFA]">No setups matched</p>
            <p className="text-[13px] text-[#71717A] mt-1 leading-relaxed max-w-[240px]">
              Run a manual scan or adjust your active strategy engines below.
            </p>
          </div>
        ) : (
          filtered.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              isSelected={selectedSignalId === signal.id}
              riskAmountUsd={riskAmountUsd}
              onFocus={onFocusSignal}
              onExecute={onExecuteSignal}
              onLogDecision={onLogDecision}
            />
          ))
        )}
      </div>
    </div>
  )
}
