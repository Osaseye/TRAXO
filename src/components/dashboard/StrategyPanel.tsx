import { PiCpu } from 'react-icons/pi'
import { cn } from '@/lib/utils'
import type { Strategy } from '@/types'

export interface StrategyPanelProps {
  strategies: Strategy[]
  onToggle: (id: Strategy['id']) => void
  signalCounts?: Record<string, number>
  compact?: boolean
}

export function StrategyPanel({
  strategies,
  onToggle,
  signalCounts,
  compact = false,
}: StrategyPanelProps) {
  const activeCount = strategies.filter((s) => s.active).length

  return (
    <div
      className={cn(
        compact
          ? 'border-t border-white/[0.06] bg-transparent'
          : 'rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between',
          compact ? 'px-4 pt-3 pb-2' : 'px-5 py-3.5 border-b border-white/[0.06]'
        )}
      >
        <div className="flex items-center gap-2">
          <PiCpu size={15} className="text-[#71717A]" />
          <span className="text-[13px] font-semibold text-[#FAFAFA] tracking-tight">Engines</span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-[#71717A]">
          {activeCount}/{strategies.length} active
        </span>
      </div>

      <ul className="divide-y divide-white/[0.04]">
        {strategies.map((strategy) => {
          const count = signalCounts?.[strategy.id] ?? strategy.totalSignals
          const hasWr = strategy.winRate > 0 && count > 0

          return (
            <li
              key={strategy.id}
              className={cn(
                'flex items-center justify-between gap-3 transition-colors hover:bg-white/[0.02]',
                compact ? 'px-4 py-2.5' : 'px-5 py-3'
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                    strategy.active ? 'bg-[#34D399] shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-[#52525B]'
                  )}
                />
                <span
                  className={cn(
                    'text-[12.5px] font-medium truncate transition-colors',
                    strategy.active ? 'text-[#FAFAFA]' : 'text-[#71717A]'
                  )}
                >
                  {strategy.name}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[11px] font-mono tabular-nums text-[#71717A]">
                  {hasWr ? `${Math.round(strategy.winRate * 100)}% WR` : `${count} sig`}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={strategy.active}
                  onClick={() => onToggle(strategy.id)}
                  className={cn(
                    'relative inline-flex items-center shrink-0 w-8 h-[18px] p-[2px] rounded-full transition-colors duration-200 focus:outline-none cursor-pointer',
                    strategy.active
                      ? 'bg-[#064E3B] border border-[#34D399]/40'
                      : 'bg-[#18181B] border border-white/10'
                  )}
                  title={strategy.active ? `Disable ${strategy.name}` : `Enable ${strategy.name}`}
                >
                  <span
                    className={cn(
                      'w-3.5 h-3.5 rounded-full transition-transform duration-200 pointer-events-none block shadow-sm',
                      strategy.active
                        ? 'translate-x-[12px] bg-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                        : 'translate-x-0 bg-[#71717A]'
                    )}
                  />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
