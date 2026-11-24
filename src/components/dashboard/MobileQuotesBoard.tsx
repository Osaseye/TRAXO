import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PiArrowsClockwise,
  PiChartLineUp,
  PiCheck,
  PiLightning,
  PiPlusCircle,
  PiPower,
  PiSpinnerGap,
} from 'react-icons/pi'
import type { MarketQuoteItem } from '@/hooks/usePaperBroker'
import { calculateLots, cn } from '@/lib/utils'
import type { StoredSignal } from '@/stores/useAnalysisSignalStore'
import type { ChartSymbol } from '@/stores/useTradingContextStore'

type QuoteFilter = 'ALL' | 'FOREX' | 'METAL' | 'FUTURES' | 'SIGNALS'
type TickDirection = 'up' | 'down' | 'flat'

interface Mt5PriceParts {
  prefix: string
  mainPips: string
  pipette: string
}

export interface MobileQuoteSignalMeta {
  topSignal: StoredSignal
  liveCount: number
}

export interface MobileQuotesBoardProps {
  quotes: MarketQuoteItem[]
  loading: boolean
  lastUpdatedAt: number | null
  equity: number
  balance: number
  autoTradeEnabled: boolean
  fixedRiskAmount: number
  activeRiskUsd: number
  activeSymbol: ChartSymbol
  signalsBySymbol: Record<string, MobileQuoteSignalMeta>
  openCountBySymbol: Record<string, number>
  executingSignalIds?: Set<string>
  executedSignalIds?: Set<string>
  onRefresh: () => Promise<void> | void
  onToggleAutoTrade?: () => Promise<void> | void
  onOpenChart: (symbol: ChartSymbol) => void
  onOpenOrder: (symbol: ChartSymbol) => void
  onOpenSetups: (symbol: ChartSymbol) => void
  onQuickExecuteSignal?: (signal: StoredSignal, lotSize: number) => Promise<void> | void
}

function splitMt5Price(price: number | null | undefined, digits: number): Mt5PriceParts {
  if (price == null || !Number.isFinite(price)) {
    return { prefix: '—', mainPips: '', pipette: '' }
  }
  const safeDigits = Math.max(0, Math.min(6, Math.round(digits)))
  const formatted = price.toFixed(safeDigits)

  if (safeDigits === 5 || safeDigits === 3) {
    return {
      prefix: formatted.slice(0, -3),
      mainPips: formatted.slice(-3, -1),
      pipette: formatted.slice(-1),
    }
  }
  if (safeDigits === 2) {
    return {
      prefix: formatted.slice(0, -2),
      mainPips: formatted.slice(-2),
      pipette: '',
    }
  }
  if (safeDigits >= 4) {
    return {
      prefix: formatted.slice(0, -3),
      mainPips: formatted.slice(-3, -1),
      pipette: formatted.slice(-1),
    }
  }
  return { prefix: formatted, mainPips: '', pipette: '' }
}

function formatQuoteClock(timestamp: string | number | null | undefined): string {
  if (timestamp == null) return '--:--:--'
  let date: Date
  if (typeof timestamp === 'number') {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '--:--:--'
    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000
    date = new Date(ms)
  } else {
    const trimmed = timestamp.trim()
    if (!trimmed) return '--:--:--'
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric > 0) {
      const ms = numeric > 1e12 ? numeric : numeric * 1000
      date = new Date(ms)
    } else {
      date = new Date(trimmed)
    }
  }
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatRangePrice(price: number | null | undefined, digits: number): string {
  if (price == null || !Number.isFinite(price)) return '—'
  const safeDigits = Math.max(0, Math.min(6, Math.round(digits)))
  return price.toFixed(safeDigits)
}

function Mt5PriceCell({
  price,
  digits,
  toneClass,
}: {
  price: number | null | undefined
  digits: number
  toneClass: string
}) {
  const parts = splitMt5Price(price, digits)
  return (
    <div
      className={cn(
        'font-mono tabular-nums text-right leading-none whitespace-nowrap transition-colors duration-200',
        toneClass
      )}
    >
      <span className="text-[12px] font-medium opacity-80">{parts.prefix}</span>
      {parts.mainPips && (
        <span className="text-[19px] font-bold tracking-[-0.02em]">{parts.mainPips}</span>
      )}
      {parts.pipette && (
        <sup className="text-[11px] font-semibold ml-[0.5px] -top-1.5 relative">
          {parts.pipette}
        </sup>
      )}
    </div>
  )
}

export function MobileQuotesBoard({
  quotes,
  loading,
  lastUpdatedAt,
  equity,
  balance,
  autoTradeEnabled,
  fixedRiskAmount,
  activeRiskUsd,
  activeSymbol,
  signalsBySymbol,
  openCountBySymbol,
  executingSignalIds,
  executedSignalIds,
  onRefresh,
  onToggleAutoTrade,
  onOpenChart,
  onOpenOrder,
  onOpenSetups,
  onQuickExecuteSignal,
}: MobileQuotesBoardProps) {
  const [filter, setFilter] = useState<QuoteFilter>('ALL')
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Track previous bid per symbol inside effect only (React 19 react-hooks/refs safe)
  const prevBidsRef = useRef<Record<string, number>>({})
  const [tickMap, setTickMap] = useState<Record<string, TickDirection>>({})

  useEffect(() => {
    if (quotes.length === 0) return

    const nextTicks: Record<string, TickDirection> = {}
    let hasDirectionChange = false

    for (const quote of quotes) {
      if (typeof quote.bid !== 'number' || !Number.isFinite(quote.bid)) continue
      const prevBid = prevBidsRef.current[quote.symbol]
      if (prevBid !== undefined) {
        if (quote.bid > prevBid) {
          nextTicks[quote.symbol] = 'up'
          hasDirectionChange = true
        } else if (quote.bid < prevBid) {
          nextTicks[quote.symbol] = 'down'
          hasDirectionChange = true
        }
      }
      prevBidsRef.current[quote.symbol] = quote.bid
    }

    if (!hasDirectionChange) return

    const applyTimer = setTimeout(() => {
      setTickMap((prev) => ({ ...prev, ...nextTicks }))
    }, 0)

    const decayTimer = setTimeout(() => {
      setTickMap((prev) => {
        const next = { ...prev }
        for (const sym of Object.keys(nextTicks)) {
          next[sym] = 'flat'
        }
        return next
      })
    }, 1100)

    return () => {
      clearTimeout(applyTimer)
      clearTimeout(decayTimer)
    }
  }, [quotes])

  const counts = useMemo(() => {
    let forex = 0
    let metal = 0
    let futures = 0
    let withSignals = 0
    for (const q of quotes) {
      if (q.assetType === 'FOREX') forex += 1
      else if (q.assetType === 'METAL') metal += 1
      else if (q.assetType === 'FUTURES') futures += 1
      if ((signalsBySymbol[q.symbol]?.liveCount ?? 0) > 0) withSignals += 1
    }
    return {
      ALL: quotes.length,
      FOREX: forex,
      METAL: metal,
      FUTURES: futures,
      SIGNALS: withSignals,
    }
  }, [quotes, signalsBySymbol])

  const filteredQuotes = useMemo(() => {
    if (filter === 'ALL') return quotes
    if (filter === 'SIGNALS') {
      return quotes.filter((q) => (signalsBySymbol[q.symbol]?.liveCount ?? 0) > 0)
    }
    return quotes.filter((q) => q.assetType === filter)
  }, [filter, quotes, signalsBySymbol])

  const handleManualRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const quickRiskDisplay = Math.round(fixedRiskAmount > 0 ? fixedRiskAmount : activeRiskUsd || 50)
  const isInitialLoading = loading && quotes.length === 0

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] flex flex-col pb-4">
      {/* Sticky Top Compact Status Header + Filter Chips + Column Strip */}
      <div className="sticky top-0 z-10 bg-[#09090B]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="px-3.5 pt-2.5 pb-2 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="text-[16px] font-semibold tracking-tight text-[#FAFAFA]">Quotes</h1>
            <span
              className={cn(
                'text-[13px] font-mono font-semibold tabular-nums truncate',
                equity < balance ? 'text-[#F87171]' : 'text-[#34D399]'
              )}
            >
              ${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void onToggleAutoTrade?.()}
              disabled={!onToggleAutoTrade}
              className={cn(
                'h-7 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-70',
                autoTradeEnabled
                  ? 'bg-[#34D399]/12 border-[#34D399]/30 text-[#34D399]'
                  : 'bg-[#F87171]/12 border-[#F87171]/30 text-[#F87171]'
              )}
              title="Toggle automated paper execution"
            >
              <PiPower size={12} />
              <span>Auto {autoTradeEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              className="w-7 h-7 rounded-full bg-[#111113] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] active:text-[#FAFAFA] transition-colors"
              aria-label="Refresh quotes"
              title="Refresh live quotes"
            >
              <PiArrowsClockwise
                size={14}
                className={cn((refreshing || loading) && 'animate-spin text-[#FAFAFA]')}
              />
            </button>
          </div>
        </div>

        {/* Horizontal Filter Chips */}
        <div className="px-3.5 pb-2.5 flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: 'ALL', label: 'All', count: counts.ALL },
              { id: 'FOREX', label: 'Forex', count: counts.FOREX },
              { id: 'METAL', label: 'Gold', count: counts.METAL },
              { id: 'FUTURES', label: 'Futures', count: counts.FUTURES },
              { id: 'SIGNALS', label: 'Signals', count: counts.SIGNALS },
            ] as const
          ).map((chip) => {
            const active = filter === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={cn(
                  'h-7 px-2.5 rounded-full border text-[11.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors',
                  active
                    ? 'bg-white/[0.12] border-white/[0.2] text-[#FAFAFA]'
                    : 'bg-[#111113] border-white/[0.06] text-[#71717A] active:text-[#FAFAFA]'
                )}
              >
                <span>{chip.label}</span>
                <span
                  className={cn(
                    'font-mono tabular-nums text-[10.5px]',
                    chip.id === 'SIGNALS' && chip.count > 0
                      ? 'text-[#34D399]'
                      : active
                        ? 'text-[#FAFAFA]/80'
                        : 'text-[#52525B]'
                  )}
                >
                  {chip.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* MT5 Column Header Strip */}
        <div className="px-3.5 py-1.5 bg-[#0D0D10] border-t border-white/[0.05] flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider font-medium text-[#71717A]">
          <span>Symbol / Range</span>
          <div className="grid grid-cols-2 gap-2 w-[184px] sm:w-[208px] shrink-0">
            <span className="text-right">Bid</span>
            <span className="text-right">Ask</span>
          </div>
        </div>
      </div>

      {/* Initial Skeleton Loading State */}
      {isInitialLoading ? (
        <div className="divide-y divide-white/[0.06]">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className="px-3.5 py-3 flex items-center justify-between gap-3 animate-pulse">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-24 rounded bg-white/[0.07]" />
                <div className="h-3 w-36 rounded bg-white/[0.05]" />
                <div className="h-3 w-32 rounded bg-white/[0.04]" />
              </div>
              <div className="grid grid-cols-2 gap-2 w-[184px] sm:w-[208px] shrink-0">
                <div className="h-6 w-20 ml-auto rounded bg-white/[0.07]" />
                <div className="h-6 w-20 ml-auto rounded bg-white/[0.07]" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-14 text-center space-y-3">
          <p className="text-[14px] font-medium text-[#FAFAFA]">
            {filter === 'SIGNALS' ? 'No symbols with active live signals' : 'No quotes available'}
          </p>
          <p className="text-[12.5px] text-[#71717A] max-w-[260px]">
            {filter === 'SIGNALS'
              ? 'Switch back to All to inspect live bid/ask pricing across every instrument.'
              : 'Tap refresh to reconnect to the TRAXO quote stream.'}
          </p>
          <div className="flex items-center gap-2 pt-1">
            {filter !== 'ALL' ? (
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className="h-9 px-4 rounded-full bg-[#161619] border border-white/[0.1] text-[12.5px] font-medium text-[#FAFAFA]"
              >
                Show All Quotes
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleManualRefresh()}
                className="h-9 px-4 rounded-full bg-[#161619] border border-white/[0.1] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5"
              >
                <PiArrowsClockwise size={14} className={cn(refreshing && 'animate-spin')} />
                <span>Refresh Feed</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {filteredQuotes.map((quote) => {
            const sym = quote.symbol as ChartSymbol
            const isExpanded = expandedSymbol === quote.symbol
            const isSelected = quote.symbol === activeSymbol
            const tick = tickMap[quote.symbol] ?? 'flat'
            const sigMeta = signalsBySymbol[quote.symbol]
            const topSignal = sigMeta?.topSignal ?? null
            const liveCount = sigMeta?.liveCount ?? 0
            const openCount = openCountBySymbol[quote.symbol] ?? 0

            const priceTone =
              tick === 'up'
                ? 'text-[#34D399]'
                : tick === 'down'
                  ? 'text-[#F87171]'
                  : 'text-[#FAFAFA]'

            const changePct =
              typeof quote.changePct === 'number' && Number.isFinite(quote.changePct)
                ? quote.changePct
                : null
            const changeTone =
              changePct == null
                ? 'text-[#71717A]'
                : changePct > 0
                  ? 'text-[#34D399]'
                  : changePct < 0
                    ? 'text-[#F87171]'
                    : 'text-[#71717A]'
            const changeText =
              changePct != null
                ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`
                : '0.00%'

            const topConfPct = topSignal
              ? topSignal.confidence <= 1
                ? Math.round(topSignal.confidence * 100)
                : Math.round(topSignal.confidence)
              : 0

            const quickLots = topSignal
              ? calculateLots(
                  topSignal.symbol,
                  topSignal.entry,
                  topSignal.sl,
                  Math.max(1, activeRiskUsd)
                )
              : 0.01
            const isExecutingQuick = Boolean(topSignal && executingSignalIds?.has(topSignal.id))
            const isExecutedQuick = Boolean(topSignal && executedSignalIds?.has(topSignal.id))

            return (
              <div
                key={quote.symbol}
                className={cn(
                  'transition-colors',
                  isExpanded
                    ? 'bg-[#111113]'
                    : isSelected
                      ? 'bg-white/[0.025]'
                      : 'bg-transparent'
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedSymbol((prev) => (prev === quote.symbol ? null : quote.symbol))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setExpandedSymbol((prev) => (prev === quote.symbol ? null : quote.symbol))
                    }
                  }}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 active:bg-white/[0.04] cursor-pointer select-none"
                >
                  {/* Left: Symbol, Signal Pill, Open Badge, Telemetry, Day Low/High */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#FAFAFA] leading-tight">
                        {quote.symbol}
                      </span>

                      {openCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#38BDF8]/15 text-[#38BDF8] text-[10px] font-mono font-semibold tabular-nums leading-none"
                          title={`${openCount} open position${openCount > 1 ? 's' : ''}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
                          {openCount}
                        </span>
                      )}

                      {topSignal && (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums leading-none whitespace-nowrap',
                            topSignal.direction === 'BUY'
                              ? 'bg-[#34D399]/15 text-[#34D399]'
                              : 'bg-[#F87171]/15 text-[#F87171]'
                          )}
                        >
                          {topSignal.direction} {topConfPct}%
                          {liveCount > 1 ? ` +${liveCount - 1}` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#71717A] leading-tight">
                      <span>{formatQuoteClock(quote.timestamp ?? lastUpdatedAt)}</span>
                      <span className="text-[#52525B]">·</span>
                      <span>
                        Spd{' '}
                        {typeof quote.spreadPips === 'number' && Number.isFinite(quote.spreadPips)
                          ? quote.spreadPips.toFixed(1)
                          : '—'}
                      </span>
                      <span className="text-[#52525B]">·</span>
                      <span className={changeTone}>{changeText}</span>
                    </div>

                    <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-[#71717A] leading-tight">
                      <span>L: {formatRangePrice(quote.dayLow, quote.digits)}</span>
                      <span>H: {formatRangePrice(quote.dayHigh, quote.digits)}</span>
                    </div>
                  </div>

                  {/* Right: Side-by-Side MT5 Bid / Ask Blocks */}
                  <div className="grid grid-cols-2 gap-2 w-[184px] sm:w-[208px] shrink-0 items-center">
                    <Mt5PriceCell price={quote.bid} digits={quote.digits} toneClass={priceTone} />
                    <Mt5PriceCell price={quote.ask} digits={quote.digits} toneClass={priceTone} />
                  </div>
                </div>

                {/* Inline Expanded MT5 Action Bar */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 pt-2 border-t border-white/[0.05] bg-[#111113] space-y-2">
                    {topSignal && (
                      <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#A1A1AA]">
                        <span className="truncate font-medium">
                          {topSignal.strategyLabel} · {topSignal.timeframe}
                        </span>
                        <span className="font-mono tabular-nums text-[#FAFAFA] shrink-0">
                          {topSignal.rr.toFixed(2)}R
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenOrder(sym)}
                        className="h-9 px-2 rounded-lg bg-[#161619] active:bg-white/[0.1] border border-white/[0.08] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PiPlusCircle size={14} className="text-[#38BDF8] shrink-0" />
                        <span className="truncate">New Order</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenChart(sym)}
                        className="h-9 px-2 rounded-lg bg-[#161619] active:bg-white/[0.1] border border-white/[0.08] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PiChartLineUp size={14} className="text-[#A1A1AA] shrink-0" />
                        <span className="truncate">Chart</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenSetups(sym)}
                        className="h-9 px-2 rounded-lg bg-[#161619] active:bg-white/[0.1] border border-white/[0.08] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PiLightning
                          size={14}
                          className={cn(liveCount > 0 ? 'text-[#34D399]' : 'text-[#71717A]', 'shrink-0')}
                        />
                        <span className="truncate">Setups ({liveCount})</span>
                      </button>
                    </div>

                    {topSignal && onQuickExecuteSignal && (
                      <button
                        type="button"
                        disabled={isExecutingQuick || isExecutedQuick}
                        onClick={() => void onQuickExecuteSignal(topSignal, quickLots)}
                        className={cn(
                          'w-full h-9 px-3 rounded-lg border text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-65',
                          isExecutedQuick
                            ? 'bg-[#161619] border-[#34D399]/30 text-[#34D399]'
                            : 'bg-[#34D399]/15 border-[#34D399]/35 text-[#34D399] active:bg-[#34D399]/25'
                        )}
                      >
                        {isExecutedQuick ? (
                          <PiCheck size={15} />
                        ) : isExecutingQuick ? (
                          <PiSpinnerGap size={15} className="animate-spin" />
                        ) : (
                          <PiLightning size={15} />
                        )}
                        <span>
                          {isExecutedQuick
                            ? 'Executed in Paper'
                            : isExecutingQuick
                              ? 'Placing Order...'
                              : `Execute $${quickRiskDisplay}`}
                        </span>
                        {!isExecutedQuick && !isExecutingQuick && (
                          <span className="font-mono tabular-nums text-[11px] opacity-85">
                            · {topSignal.direction} {quickLots.toFixed(2)}L
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
