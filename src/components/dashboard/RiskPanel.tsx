import { ShieldCheck } from 'lucide-react'

interface RiskPanelProps {
  maxDailyLoss?: number
  currentLoss?: number
  riskPerTrade?: number
  maxTrades?: number
  tradesUsed?: number
}

export function RiskPanel({
  maxDailyLoss = 2.0,
  currentLoss = 0.42,
  riskPerTrade = 1.0,
  maxTrades = 5,
  tradesUsed = 3,
}: RiskPanelProps) {
  const lossPercent = Math.min((currentLoss / maxDailyLoss) * 100, 100)
  const tradePercent = Math.min((tradesUsed / maxTrades) * 100, 100)

  const status = lossPercent >= 80 ? 'danger' : lossPercent >= 50 ? 'caution' : 'safe'
  const statusColor = status === 'danger' ? '#ef4444' : status === 'caution' ? '#f59e0b' : '#22c55e'
  const lossBarColor = status === 'danger' ? '#ef4444' : status === 'caution' ? '#f59e0b' : '#22c55e'

  return (
    <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} style={{ color: statusColor }} />
          <span className="text-[13px] font-semibold text-[#e5e7eb]">Risk Control</span>
        </div>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
          style={{ background: statusColor + '1a', color: statusColor }}
        >
          {status === 'danger' ? 'High Risk' : status === 'caution' ? 'Caution' : 'Safe'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Daily Loss */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[#374151]">Daily Loss Limit</span>
            <span className="text-[11px] tabular">
              <span
                className="font-semibold"
                style={{ color: lossBarColor }}
              >
                {currentLoss.toFixed(2)}%
              </span>
              <span className="text-[#374151]"> / {maxDailyLoss}%</span>
            </span>
          </div>
          <div className="h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${lossPercent}%`, background: lossBarColor }}
            />
          </div>
        </div>

        {/* Trades today */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[#374151]">Trades Today</span>
            <span className="text-[11px] tabular font-semibold text-[#e5e7eb]">
              {tradesUsed}
              <span className="text-[#374151] font-normal"> / {maxTrades}</span>
            </span>
          </div>
          <div className="h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-[#3b82f6]"
              style={{ width: `${tradePercent}%` }}
            />
          </div>
        </div>

        {/* Risk per trade */}
        <div className="flex items-center justify-between pt-1 border-t border-[#1e293b]">
          <span className="text-[11px] text-[#374151]">Risk per trade</span>
          <span className="text-[12px] font-bold text-[#e5e7eb] tabular">{riskPerTrade}%</span>
        </div>
      </div>
    </div>
  )
}
