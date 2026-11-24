import { useState } from 'react'
import { Link } from 'react-router'
import {
  PiArrowsClockwise,
  PiArrowsDownUp,
  PiChartLineUp,
  PiLightning,
  PiPlay,
  PiPower,
  PiShieldCheck,
  PiSpinnerGap,
  PiXCircle,
} from 'react-icons/pi'
import type { PaperAccountInfo, PaperOrder, PaperPosition } from '@/hooks/usePaperBroker'
import { cn, formatPrice } from '@/lib/utils'

export interface MobileTradeBookProps {
  account: PaperAccountInfo | null
  balance: number
  equity: number
  floatingPnl: number
  realizedPnl: number
  margin: number
  freeMargin: number
  positions: PaperPosition[]
  orders: PaperOrder[]
  activeRiskUsd: number
  autoTradeEnabled: boolean
  guardrailsEnabled: boolean
  loading: boolean
  closingPosId: string | null
  cancelingOrderId: string | null
  onToggleAutoTrade: () => Promise<void> | void
  onToggleGuardrails?: () => void
  onRefresh: () => Promise<void> | void
  onFocusPosition: (posId: string, posSymbol: string, posTime?: string) => void
  onClosePosition: (posId: string, posSymbol: string) => Promise<void> | void
  onCancelOrder: (orderId: string) => Promise<void> | void
  onOpenQuotes: () => void
  onOpenSetups: () => void
}

function formatUsd(val: number): string {
  const safe = Number.isFinite(val) ? val : 0
  return `$${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatSignedUsd(val: number): string {
  const safe = Number.isFinite(val) ? val : 0
  if (Math.abs(safe) < 0.005) return '$0.00'
  const sign = safe > 0 ? '+' : '-'
  return `${sign}$${Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function pnlToneClass(val: number): string {
  if (!Number.isFinite(val) || Math.abs(val) < 0.005) return 'text-[#FAFAFA]'
  return val > 0 ? 'text-[#34D399]' : 'text-[#F87171]'
}

function formatOrderTypeLabel(rawType: string): string {
  return rawType.replace(/^ORDER_TYPE_/i, '').replace(/_/g, ' ').trim().toUpperCase()
}

export function MobileTradeBook({
  account,
  balance,
  equity,
  floatingPnl,
  realizedPnl,
  margin,
  freeMargin,
  positions,
  orders,
  activeRiskUsd,
  autoTradeEnabled,
  guardrailsEnabled,
  loading,
  closingPosId,
  cancelingOrderId,
  onToggleAutoTrade,
  onToggleGuardrails,
  onRefresh,
  onFocusPosition,
  onClosePosition,
  onCancelOrder,
  onOpenQuotes,
  onOpenSetups,
}: MobileTradeBookProps) {
  const [expandedPosId, setExpandedPosId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const handleManualRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const isRawMode = !guardrailsEnabled
  const resolvedMargin = Number.isFinite(account?.margin) ? Number(account?.margin) : margin
  const resolvedFreeMargin = Number.isFinite(account?.freeMargin)
    ? Number(account?.freeMargin)
    : freeMargin
  const resolvedRealized = Number.isFinite(account?.realizedPnl)
    ? Number(account?.realizedPnl)
    : realizedPnl

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] flex flex-col">
      {/* Top Sticky Floating P&L Summary Banner */}
      <div className="sticky top-0 z-10 bg-[#09090B]/95 backdrop-blur-md border-b border-white/[0.06] px-3.5 py-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wider font-medium text-[#71717A]">
              Trade · Floating P&amp;L
            </span>
            <p
              className={cn(
                'text-[24px] font-mono font-bold tabular-nums tracking-[-0.02em] leading-tight mt-0.5',
                pnlToneClass(floatingPnl)
              )}
            >
              {formatSignedUsd(floatingPnl)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="w-8 h-8 rounded-full bg-[#111113] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] active:text-[#FAFAFA] transition-colors shrink-0"
            aria-label="Refresh trade book"
            title="Refresh positions and account"
          >
            <PiArrowsClockwise
              size={15}
              className={cn((refreshing || loading) && 'animate-spin text-[#FAFAFA]')}
            />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void onToggleAutoTrade()}
            className={cn(
              'h-7 px-2.5 rounded-full border text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors',
              autoTradeEnabled
                ? 'bg-[#34D399]/12 border-[#34D399]/30 text-[#34D399]'
                : 'bg-[#F87171]/12 border-[#F87171]/30 text-[#F87171]'
            )}
          >
            <PiPower size={13} />
            <span>Auto-Trade {autoTradeEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleGuardrails?.()}
            disabled={!onToggleGuardrails}
            className={cn(
              'h-7 px-2.5 rounded-full border text-[11.5px] font-medium inline-flex items-center gap-1 transition-colors disabled:cursor-default',
              isRawMode
                ? 'bg-[#FBBF24]/12 border-[#FBBF24]/30 text-[#FBBF24]'
                : 'bg-[#111113] border-white/[0.08] text-[#A1A1AA]'
            )}
          >
            <PiShieldCheck size={13} className={isRawMode ? 'text-[#FBBF24]' : 'text-[#34D399]'} />
            <span>{isRawMode ? 'Raw Mode' : 'Guarded'}</span>
          </button>
        </div>
      </div>

      {/* MT5 Line-by-Line Account Ledger */}
      <div className="bg-[#09090B] divide-y divide-white/[0.05] px-3.5 text-[13px]">
        <div className="py-2 flex items-center justify-between gap-2">
          <span className="text-[#A1A1AA]">Balance:</span>
          <span className="font-mono tabular-nums font-medium text-[#FAFAFA]">
            {formatUsd(balance)}
          </span>
        </div>

        <div className="py-2 flex items-center justify-between gap-2">
          <span className="text-[#A1A1AA]">Equity:</span>
          <span
            className={cn(
              'font-mono tabular-nums font-semibold',
              equity < balance ? 'text-[#F87171]' : 'text-[#FAFAFA]'
            )}
          >
            {formatUsd(equity)}
          </span>
        </div>

        <div className="py-2 flex items-center justify-between gap-2">
          <span className="text-[#A1A1AA]">Margin:</span>
          <span className="font-mono tabular-nums text-[#FAFAFA]">
            {formatUsd(resolvedMargin)}
          </span>
        </div>

        <div className="py-2 flex items-center justify-between gap-2">
          <span className="text-[#A1A1AA]">Free margin:</span>
          <span className="font-mono tabular-nums text-[#FAFAFA]">
            {formatUsd(resolvedFreeMargin)}
          </span>
        </div>

        <div className="py-2 flex items-center justify-between gap-2">
          <span className="text-[#A1A1AA]">Realized P&amp;L:</span>
          <span className={cn('font-mono tabular-nums font-semibold', pnlToneClass(resolvedRealized))}>
            {formatSignedUsd(resolvedRealized)}
          </span>
        </div>

        <div className="py-2 flex items-center justify-between gap-2">
          <span className="text-[#A1A1AA]">Risk / Trade:</span>
          <span className="font-mono tabular-nums text-[#FAFAFA] flex items-center gap-1.5">
            <span>{formatUsd(activeRiskUsd)}</span>
            <span
              className={cn(
                'text-[10.5px] font-sans font-medium px-1.5 py-0.5 rounded',
                isRawMode
                  ? 'bg-[#FBBF24]/12 text-[#FBBF24]'
                  : 'bg-white/[0.06] text-[#A1A1AA]'
              )}
            >
              {isRawMode ? 'Raw Mode' : 'Guarded'}
            </span>
          </span>
        </div>
      </div>

      {/* Empty State when no Positions & no Orders */}
      {positions.length === 0 && orders.length === 0 ? (
        <div className="flex-1 border-t border-white/[0.06] flex flex-col items-center justify-center px-6 py-12 text-center space-y-3">
          <p className="text-[14px] font-medium text-[#FAFAFA]">
            No open positions or pending orders
          </p>
          <p className="text-[12.5px] text-[#71717A] max-w-[260px]">
            Tap a live quote to place an order or inspect active strategy setups.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenQuotes}
              className="h-9 px-4 rounded-full bg-[#161619] border border-white/[0.1] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5"
            >
              <PiArrowsDownUp size={14} className="text-[#38BDF8]" />
              <span>Quotes</span>
            </button>
            <button
              type="button"
              onClick={onOpenSetups}
              className="h-9 px-4 rounded-full bg-[#161619] border border-white/[0.1] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5"
            >
              <PiLightning size={14} className="text-[#34D399]" />
              <span>Setups</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Open Positions Section */}
          <div className="px-3.5 py-2 bg-[#0D0D10] border-y border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] uppercase tracking-wider font-semibold text-[#A1A1AA]">
                Positions
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/[0.08] font-mono tabular-nums text-[10.5px] text-[#FAFAFA] leading-none">
                {positions.length}
              </span>
            </div>
            {positions.length > 0 && (
              <span className={cn('text-[12px] font-mono font-semibold tabular-nums', pnlToneClass(floatingPnl))}>
                {formatSignedUsd(floatingPnl)}
              </span>
            )}
          </div>

          {positions.length === 0 ? (
            <div className="px-3.5 py-6 text-center text-[12.5px] text-[#71717A]">
              No open positions
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {positions.map((pos) => {
                const isBuy = (pos.direction ?? pos.type).toUpperCase().includes('BUY')
                const isExpanded = expandedPosId === pos.id
                const isClosing = closingPosId === pos.id
                const tp1 = pos.tp1 ?? pos.tp

                return (
                  <div
                    key={pos.id}
                    className={cn(isExpanded ? 'bg-[#111113]' : 'bg-transparent')}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExpandedPosId((prev) => (prev === pos.id ? null : pos.id))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedPosId((prev) => (prev === pos.id ? null : pos.id))
                        }
                      }}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-2 active:bg-white/[0.04] cursor-pointer select-none"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[14.5px] font-semibold text-[#FAFAFA] truncate">
                            {pos.symbol}
                          </span>
                          <span
                            className={cn(
                              'text-[12.5px] font-mono font-semibold tabular-nums',
                              isBuy ? 'text-[#34D399]' : 'text-[#F87171]'
                            )}
                          >
                            {isBuy ? 'buy' : 'sell'} {pos.volume.toFixed(2)}
                          </span>
                          {pos.status === 'PARTIAL_TP1' && (
                            <span className="px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] text-[9.5px] font-mono font-semibold leading-none">
                              TP1·BE
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                          {formatPrice(pos.openPrice, undefined, pos.symbol)} →{' '}
                          {formatPrice(pos.currentPrice, undefined, pos.symbol)}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'text-[16px] font-mono font-bold tabular-nums shrink-0',
                          pnlToneClass(pos.profit)
                        )}
                      >
                        {formatSignedUsd(pos.profit)}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="px-3.5 pb-3 pt-2 border-t border-white/[0.05] bg-[#111113] space-y-2.5">
                        <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                          <div>
                            <span className="block text-[10.5px] text-[#71717A]">SL</span>
                            <span className="font-mono tabular-nums text-[#F87171]">
                              {pos.sl ? formatPrice(pos.sl, undefined, pos.symbol) : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10.5px] text-[#71717A]">TP1</span>
                            <span className="font-mono tabular-nums text-[#34D399]">
                              {tp1 ? formatPrice(tp1, undefined, pos.symbol) : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10.5px] text-[#71717A]">TP2</span>
                            <span className="font-mono tabular-nums text-[#34D399]">
                              {pos.tp2 ? formatPrice(pos.tp2, undefined, pos.symbol) : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11.5px] text-[#71717A]">
                          <span>Strategy</span>
                          <span className="text-[#A1A1AA] font-medium truncate max-w-[70%]">
                            {pos.strategyLabel || pos.comment || 'TRAXO Execution'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => onFocusPosition(pos.id, pos.symbol, pos.time)}
                            className="h-9 px-2 rounded-lg bg-[#161619] active:bg-white/[0.1] border border-white/[0.08] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <PiChartLineUp size={14} className="text-[#38BDF8]" />
                            <span>Chart</span>
                          </button>

                          <Link
                            to={`/replay/${encodeURIComponent(pos.id)}`}
                            className="h-9 px-2 rounded-lg bg-[#161619] active:bg-white/[0.1] border border-white/[0.08] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <PiPlay size={13} className="text-[#34D399]" />
                            <span>Replay</span>
                          </Link>

                          <button
                            type="button"
                            disabled={isClosing}
                            onClick={() => void onClosePosition(pos.id, pos.symbol)}
                            className="h-9 px-2 rounded-lg bg-[#F87171]/12 active:bg-[#F87171]/25 border border-[#F87171]/35 text-[12px] font-semibold text-[#F87171] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            {isClosing ? (
                              <PiSpinnerGap size={14} className="animate-spin" />
                            ) : (
                              <PiXCircle size={14} />
                            )}
                            <span>Close</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pending Orders Section */}
          {orders.length > 0 && (
            <>
              <div className="px-3.5 py-2 bg-[#0D0D10] border-y border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] uppercase tracking-wider font-semibold text-[#A1A1AA]">
                    Orders
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-white/[0.08] font-mono tabular-nums text-[10.5px] text-[#FAFAFA] leading-none">
                    {orders.length}
                  </span>
                </div>
                <span className="text-[11px] text-[#71717A]">Pending</span>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {orders.map((order) => {
                  const isBuy = order.type.toUpperCase().includes('BUY')
                  const isExpanded = expandedOrderId === order.id
                  const isCanceling = cancelingOrderId === order.id
                  const orderLabel = formatOrderTypeLabel(order.type)

                  return (
                    <div
                      key={order.id}
                      className={cn(isExpanded ? 'bg-[#111113]' : 'bg-transparent')}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedOrderId((prev) => (prev === order.id ? null : order.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpandedOrderId((prev) => (prev === order.id ? null : order.id))
                          }
                        }}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 active:bg-white/[0.04] cursor-pointer select-none"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[14.5px] font-semibold text-[#FAFAFA]">
                              {order.symbol}
                            </span>
                            <span
                              className={cn(
                                'text-[11.5px] font-mono font-semibold tabular-nums',
                                isBuy ? 'text-[#34D399]' : 'text-[#F87171]'
                              )}
                            >
                              {orderLabel} {order.volume.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                            @ {formatPrice(order.openPrice, undefined, order.symbol)}
                            {order.sl || order.tp
                              ? ` · SL ${order.sl ? formatPrice(order.sl, undefined, order.symbol) : '—'} / TP ${order.tp ? formatPrice(order.tp, undefined, order.symbol) : '—'}`
                              : ''}
                          </p>
                        </div>

                        <span className="text-[11.5px] font-mono text-[#71717A] shrink-0">
                          {order.state ?? 'Placed'}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="px-3.5 pb-3 pt-2 border-t border-white/[0.05] bg-[#111113] space-y-2.5">
                          <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                            <div>
                              <span className="block text-[10.5px] text-[#71717A]">Target</span>
                              <span className="font-mono tabular-nums text-[#FAFAFA]">
                                {formatPrice(order.openPrice, undefined, order.symbol)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10.5px] text-[#71717A]">SL</span>
                              <span className="font-mono tabular-nums text-[#F87171]">
                                {order.sl ? formatPrice(order.sl, undefined, order.symbol) : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10.5px] text-[#71717A]">TP</span>
                              <span className="font-mono tabular-nums text-[#34D399]">
                                {order.tp ? formatPrice(order.tp, undefined, order.symbol) : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => onFocusPosition(order.id, order.symbol, order.time)}
                              className="h-9 px-2 rounded-lg bg-[#161619] active:bg-white/[0.1] border border-white/[0.08] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <PiChartLineUp size={14} className="text-[#38BDF8]" />
                              <span>Chart</span>
                            </button>

                            <button
                              type="button"
                              disabled={isCanceling}
                              onClick={() => void onCancelOrder(order.id)}
                              className="h-9 px-2 rounded-lg bg-[#F87171]/12 active:bg-[#F87171]/25 border border-[#F87171]/35 text-[12px] font-semibold text-[#F87171] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {isCanceling ? (
                                <PiSpinnerGap size={14} className="animate-spin" />
                              ) : (
                                <PiXCircle size={14} />
                              )}
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
