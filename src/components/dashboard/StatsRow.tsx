import {
  PiLightning,
  PiChartLineUp,
  PiTrendDown,
  PiTrendUp,
} from 'react-icons/pi'
import { cn } from '@/lib/utils'
import type { DashboardStats } from '@/types'

export interface StatsRowProps {
  stats: DashboardStats
  compact?: boolean
  executionMode?: 'paper' | 'metaapi'
  className?: string
}

export function StatsRow({
  stats,
  compact = false,
  executionMode = 'paper',
  className,
}: StatsRowProps) {
  const pnlPositive = stats.pnlToday >= 0
  const hasWinRate = stats.weeklyWinRate > 0
  const winRateGood = stats.weeklyWinRate >= 0.55

  const metrics = [
    {
      label: 'Signals today',
      value: String(stats.signalsToday),
      sub: 'Active scan cycle',
      valueTone: 'text-[#FAFAFA]',
      icon: <PiLightning size={15} className="text-[#71717A]" />,
    },
    {
      label: 'Win rate',
      value: hasWinRate ? `${Math.round(stats.weeklyWinRate * 100)}%` : '—',
      sub: hasWinRate ? (winRateGood ? 'Above 55% baseline' : 'Below 55% baseline') : 'No settled trades',
      valueTone: hasWinRate ? (winRateGood ? 'text-[#34D399]' : 'text-[#F87171]') : 'text-[#FAFAFA]',
      icon: (
        <PiTrendUp
          size={15}
          className={hasWinRate && winRateGood ? 'text-[#34D399]' : 'text-[#71717A]'}
        />
      ),
    },
    {
      label: 'Active trades',
      value: String(stats.activeTrades),
      sub: executionMode === 'metaapi' ? 'Open MT5 & pending' : 'Open paper & pending',
      valueTone: 'text-[#FAFAFA]',
      icon: <PiChartLineUp size={15} className="text-[#71717A]" />,
    },
    {
      label: 'Floating P&L',
      value: `${pnlPositive ? '+' : '-'}$${Math.abs(stats.pnlToday).toFixed(2)}`,
      sub: stats.pnlToday === 0 ? 'Flat exposure' : pnlPositive ? 'Net positive' : 'Net drawdown',
      valueTone:
        stats.pnlToday === 0 ? 'text-[#FAFAFA]' : pnlPositive ? 'text-[#34D399]' : 'text-[#F87171]',
      icon: pnlPositive ? (
        <PiTrendUp
          size={15}
          className={stats.pnlToday > 0 ? 'text-[#34D399]' : 'text-[#71717A]'}
        />
      ) : (
        <PiTrendDown size={15} className="text-[#F87171]" />
      ),
    },
  ]

  if (compact) {
    return (
      <div
        className={cn(
          'grid grid-cols-2 gap-x-5 gap-y-4 pb-4 border-b border-white/[0.06]',
          className
        )}
      >
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-[#71717A] truncate">
                {metric.label}
              </span>
              {metric.icon}
            </div>
            <p
              className={cn(
                'text-[18px] font-mono font-semibold tabular-nums tracking-[-0.02em] mt-1 leading-tight',
                metric.valueTone
              )}
            >
              {metric.value}
            </p>
            <p className="text-[12px] text-[#71717A] mt-0.5 truncate">{metric.sub}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('px-4 sm:px-6 pt-4 shrink-0', className)}>
      <div className="rounded-2xl bg-[#111113] border border-white/[0.07] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06] overflow-hidden">
        {metrics.map((metric) => (
          <div key={metric.label} className="p-5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-[#71717A] truncate">
                {metric.label}
              </span>
              {metric.icon}
            </div>
            <p
              className={cn(
                'text-[22px] font-mono font-semibold tabular-nums tracking-[-0.02em] mt-1.5 leading-tight',
                metric.valueTone
              )}
            >
              {metric.value}
            </p>
            <p className="text-[12px] text-[#71717A] mt-1 truncate">{metric.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
