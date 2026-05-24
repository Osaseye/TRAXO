import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Strategy } from '@/types'

interface StrategyPanelProps {
  strategies: Strategy[]
  onToggle: (id: Strategy['id']) => void
}

export function StrategyPanel({ strategies, onToggle }: StrategyPanelProps) {
  const activeCount = strategies.filter((s) => s.active).length

  return (
    <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-[#3b82f6]" />
          <span className="text-[13px] font-semibold text-[#e5e7eb]">Active Strategies</span>
        </div>
        <span className="text-[10px] text-[#374151] font-medium">
          {activeCount}/{strategies.length} active
        </span>
      </div>

      <ul className="divide-y divide-[#1e293b]">
        {strategies.map((strategy) => (
          <li
            key={strategy.id}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                  strategy.active ? 'bg-[#22c55e]' : 'bg-[#1e293b]'
                )}
              />
              <span
                className={cn(
                  'text-[12px] font-medium truncate',
                  strategy.active ? 'text-[#e5e7eb]' : 'text-[#374151]'
                )}
              >
                {strategy.name}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] text-[#374151] tabular hidden sm:block">
                {Math.round(strategy.winRate * 100)}% WR
              </span>
              {/* Custom toggle */}
              <button
                onClick={() => onToggle(strategy.id)}
                className={cn(
                  'w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0',
                  strategy.active ? 'bg-[#22c55e]' : 'bg-[#1e293b]'
                )}
                title={strategy.active ? 'Disable strategy' : 'Enable strategy'}
              >
                <span
                  className={cn(
                    'absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200',
                    strategy.active ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  )}
                />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
