import { PiShieldCheck, PiWarning } from 'react-icons/pi'
import { cn } from '@/lib/utils'

export interface RiskPanelProps {
  maxDailyLoss?: number
  currentLoss?: number
  riskPerTrade?: number
  maxTrades?: number
  tradesUsed?: number
  accountBalance?: number
  equity?: number
  marginUsed?: number
  freeMargin?: number
  openPositionsCount?: number
  maxPositions?: number
  consecutiveLosses?: number
  spreadPips?: number | null
  maxSpreadPips?: number
  sessionFilter?: string
  marketRiskTitle?: string
  marketRiskLevel?: 'Low' | 'Medium' | 'High'
  marketRiskSummary?: string
  riskMode?: 'fixedAmount' | 'percentage'
  fixedRiskAmount?: number
}

function fmtUsd(val?: number): string {
  if (val == null || Number.isNaN(val)) return '—'
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatSessionLabel(session?: string): string {
  if (!session || session === 'all') return '24h all'
  if (session === 'london_ny') return 'London + NY'
  if (session === 'ny_only') return 'NY only'
  return session
}

export function RiskPanel({
  maxDailyLoss = 6.0,
  currentLoss = 0,
  riskPerTrade = 2.5,
  maxTrades = 5,
  tradesUsed = 0,
  accountBalance,
  equity,
  marginUsed,
  freeMargin,
  openPositionsCount,
  maxPositions,
  consecutiveLosses = 0,
  spreadPips = null,
  maxSpreadPips,
  sessionFilter,
  marketRiskTitle,
  marketRiskLevel,
  marketRiskSummary,
  riskMode,
  fixedRiskAmount,
}: RiskPanelProps) {
  const safeMaxLoss = Math.max(0.1, maxDailyLoss)
  const lossPercent = Math.min((currentLoss / safeMaxLoss) * 100, 100)
  const safeMaxTrades = Math.max(1, maxTrades)
  const tradePercent = Math.min((tradesUsed / safeMaxTrades) * 100, 100)

  const status = lossPercent >= 80 ? 'danger' : lossPercent >= 50 ? 'caution' : 'safe'
  const spreadBreached = spreadPips != null && maxSpreadPips != null && spreadPips > maxSpreadPips

  return (
    <div className="divide-y divide-white/[0.06]">
      {/* Header & Meters */}
      <div className="pb-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {status === 'danger' ? (
              <PiWarning size={16} className="text-[#F87171]" />
            ) : (
              <PiShieldCheck
                size={16}
                className={status === 'safe' ? 'text-[#34D399]' : 'text-[#FAFAFA]'}
              />
            )}
            <span className="text-[14px] font-semibold text-[#FAFAFA]">Risk & guardrails</span>
          </div>

          <span
            className={cn(
              'text-[12px] font-medium px-2.5 py-0.5 rounded-full',
              status === 'danger'
                ? 'bg-[#F87171]/15 text-[#F87171]'
                : status === 'caution'
                ? 'bg-white/[0.08] text-[#FAFAFA]'
                : 'bg-[#34D399]/15 text-[#34D399]'
            )}
          >
            {status === 'danger' ? 'Cap alert' : status === 'caution' ? 'Caution' : 'Clear'}
          </span>
        </div>

        {/* Daily Loss Cap Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#A1A1AA]">Daily loss cap</span>
            <span className="font-mono tabular-nums">
              <span
                className={cn(
                  'font-medium',
                  status === 'danger' ? 'text-[#F87171]' : 'text-[#FAFAFA]'
                )}
              >
                {currentLoss.toFixed(2)}%
              </span>
              <span className="text-[#71717A]"> / {maxDailyLoss.toFixed(1)}%</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                status === 'danger'
                  ? 'bg-[#F87171]'
                  : status === 'safe'
                  ? 'bg-[#34D399]'
                  : 'bg-[#FAFAFA]'
              )}
              style={{ width: `${lossPercent}%` }}
            />
          </div>
        </div>

        {/* Trades Today Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#A1A1AA]">Trades logged today</span>
            <span className="font-mono tabular-nums text-[#FAFAFA]">
              {tradesUsed}
              <span className="text-[#71717A]"> / {maxTrades}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#FAFAFA]/80 transition-all duration-300"
              style={{ width: `${tradePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Whitespace-separated Account & Risk Summary */}
      <div className="py-4 grid grid-cols-2 gap-x-5 gap-y-3.5">
        <div>
          <span className="block text-[12px] text-[#71717A]">Risk budget</span>
          <span className="block text-[14px] font-mono tabular-nums font-medium text-[#FAFAFA] mt-0.5">
            {riskMode === 'fixedAmount' && fixedRiskAmount
              ? fmtUsd(fixedRiskAmount)
              : `${riskPerTrade.toFixed(1)}%`}
          </span>
        </div>

        <div>
          <span className="block text-[12px] text-[#71717A]">Open positions</span>
          <span className="block text-[14px] font-mono tabular-nums font-medium text-[#FAFAFA] mt-0.5">
            {openPositionsCount ?? 0}
            <span className="text-[#71717A]"> / {maxPositions ?? '—'}</span>
          </span>
        </div>

        {accountBalance !== undefined && (
          <div>
            <span className="block text-[12px] text-[#71717A]">Account equity</span>
            <span
              className={cn(
                'block text-[14px] font-mono tabular-nums font-medium mt-0.5 truncate',
                equity != null && equity < accountBalance ? 'text-[#F87171]' : 'text-[#34D399]'
              )}
            >
              {fmtUsd(equity ?? accountBalance)}
            </span>
          </div>
        )}

        {freeMargin !== undefined && (
          <div>
            <span className="block text-[12px] text-[#71717A]">Free margin</span>
            <span className="block text-[14px] font-mono tabular-nums font-medium text-[#FAFAFA] mt-0.5 truncate">
              {fmtUsd(freeMargin)}
            </span>
          </div>
        )}
      </div>

      {/* Execution Guardrails List */}
      <div className="py-3 divide-y divide-white/[0.05] text-[13px]">
        {marginUsed !== undefined && (
          <div className="flex items-center justify-between py-2">
            <span className="text-[#71717A]">Margin used</span>
            <span className="font-mono tabular-nums text-[#A1A1AA]">{fmtUsd(marginUsed)}</span>
          </div>
        )}

        <div className="flex items-center justify-between py-2">
          <span className="text-[#71717A]">Spread / cap</span>
          <span
            className={cn(
              'font-mono tabular-nums',
              spreadBreached ? 'text-[#F87171]' : 'text-[#A1A1AA]'
            )}
          >
            {spreadPips != null ? `${spreadPips.toFixed(1)}p` : '—'}
            {maxSpreadPips != null ? ` / ${maxSpreadPips.toFixed(1)}p` : ''}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-[#71717A]">Session window</span>
          <span className="text-[#A1A1AA]">{formatSessionLabel(sessionFilter)}</span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-[#71717A]">Consecutive losses</span>
          <span
            className={cn(
              'font-mono tabular-nums',
              consecutiveLosses >= 3 ? 'text-[#F87171]' : 'text-[#A1A1AA]'
            )}
          >
            {consecutiveLosses}
          </span>
        </div>
      </div>

      {/* Market Event Context */}
      {marketRiskTitle && (
        <div className="pt-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[#FAFAFA]">{marketRiskTitle}</span>
            <span
              className={cn(
                'text-[12px] font-medium px-2 py-0.5 rounded-full',
                marketRiskLevel === 'High'
                  ? 'bg-[#F87171]/15 text-[#F87171]'
                  : 'bg-white/[0.06] text-[#A1A1AA]'
              )}
            >
              {marketRiskLevel ?? 'Low'}
            </span>
          </div>
          {marketRiskSummary && (
            <p className="text-[13px] text-[#71717A] leading-relaxed">{marketRiskSummary}</p>
          )}
        </div>
      )}
    </div>
  )
}
