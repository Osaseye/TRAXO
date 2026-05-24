import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react'
import type { DashboardStats } from '@/types'

interface StatsRowProps {
  stats: DashboardStats
}

export function StatsRow({ stats }: StatsRowProps) {
  const pnlPositive = stats.pnlToday >= 0
  const winRateGood = stats.weeklyWinRate >= 0.6

  const cards = [
    {
      label: 'Signals Today',
      value: String(stats.signalsToday),
      sub: '+3 vs yesterday',
      subColor: '#22c55e',
      valueColor: '#e5e7eb',
      icon: <Zap size={13} />,
      iconColor: '#3b82f6',
    },
    {
      label: 'Win Rate',
      value: `${Math.round(stats.weeklyWinRate * 100)}%`,
      sub: winRateGood ? 'Above target' : 'Below target',
      subColor: winRateGood ? '#22c55e' : '#ef4444',
      valueColor: winRateGood ? '#22c55e' : '#ef4444',
      icon: <TrendingUp size={13} />,
      iconColor: winRateGood ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Active Trades',
      value: String(stats.activeTrades),
      sub: 'Analyst mode · manual',
      subColor: '#374151',
      valueColor: '#e5e7eb',
      icon: <Activity size={13} />,
      iconColor: '#6b7280',
    },
    {
      label: 'P&L Today',
      value: `${pnlPositive ? '+' : ''}$${stats.pnlToday.toFixed(2)}`,
      sub: pnlPositive ? 'In profit' : 'In drawdown',
      subColor: pnlPositive ? '#22c55e' : '#ef4444',
      valueColor: pnlPositive ? '#22c55e' : '#ef4444',
      icon: pnlPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />,
      iconColor: pnlPositive ? '#22c55e' : '#ef4444',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-6 pt-4 shrink-0">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-[#374151] uppercase tracking-wider mb-1.5">
                {card.label}
              </p>
              <p
                className="text-[1.4rem] font-bold tabular leading-none"
                style={{ color: card.valueColor }}
              >
                {card.value}
              </p>
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: card.subColor }}>
                {card.sub}
              </p>
            </div>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: card.iconColor + '20', color: card.iconColor }}
            >
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
