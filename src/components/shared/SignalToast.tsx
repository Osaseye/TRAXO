import React, { useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  PiX,
  PiArrowUpRight,
  PiArrowDownRight,
  PiArrowSquareOut,
  PiCopy,
  PiCheck,
} from 'react-icons/pi'
import { formatPrice, formatMT4OrderClipboardPayload, cn } from '@/lib/utils'
import { useToastStore, type SignalToastItem } from '@/stores/useToastStore'
import { useTradingContextStore, type ChartSymbol, type ChartTimeframe } from '@/stores/useTradingContextStore'

const AUTO_DISMISS_MS = 7000

export function SignalToast({ toast }: { toast: SignalToastItem }) {
  const navigate = useNavigate()
  const removeToast = useToastStore((s) => s.removeToast)
  const setChartSymbol = useTradingContextStore((s) => s.setChartSymbol)
  const setChartTimeframe = useTradingContextStore((s) => s.setChartTimeframe)
  const [copied, setCopied] = React.useState(false)

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, removeToast])

  const isBuy = toast.direction === 'BUY'
  const confidencePct = Math.round(Number(toast.confidence) || 0)
  const rrValue = Number(toast.rr) || 0

  const handleCopyOrder = (e: React.MouseEvent) => {
    e.stopPropagation()
    const payload = formatMT4OrderClipboardPayload({
      symbol: toast.symbol,
      direction: toast.direction,
      entry: toast.entry,
      sl: toast.sl,
      tp: toast.tp,
    })
    navigator.clipboard.writeText(payload)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToastClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setChartSymbol(toast.symbol as ChartSymbol)
    setChartTimeframe(toast.timeframe as ChartTimeframe)
    navigate(`/dashboard?symbol=${toast.symbol}&timeframe=${toast.timeframe}`)
    removeToast(toast.id)
  }

  return (
    <div
      onClick={handleToastClick}
      className={cn(
        'obsidian-toast group relative w-[336px] bg-[#111113] border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-4 select-none transition-colors duration-100 cursor-pointer',
      )}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'h-5 px-2 rounded-md text-[11px] font-medium flex items-center gap-1 shrink-0',
              isBuy
                ? 'bg-[#34D399]/12 text-[#34D399]'
                : 'bg-[#F87171]/12 text-[#F87171]',
            )}
          >
            {isBuy ? <PiArrowUpRight size={13} /> : <PiArrowDownRight size={13} />}
            {toast.direction}
          </span>
          <span className="text-[13.5px] font-semibold text-[#FAFAFA] tracking-[-0.01em] truncate">
            {toast.symbol}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-[#A1A1AA] px-1.5 py-0.5 rounded-md bg-[#18181B] shrink-0">
            {toast.timeframe}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopyOrder}
            className="p-1.5 rounded-lg text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors flex items-center"
            title="Copy order parameters"
          >
            {copied ? <PiCheck size={13} className="text-[#34D399]" /> : <PiCopy size={13} />}
          </button>
          <span className="text-[11px] font-medium text-[#71717A] group-hover:text-[#FAFAFA] transition-colors flex items-center gap-1 ml-0.5">
            View <PiArrowSquareOut size={12} />
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeToast(toast.id)
            }}
            className="p-1.5 rounded-lg text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors"
            title="Dismiss notification"
          >
            <PiX size={14} />
          </button>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 rounded-xl bg-[#18181B] px-3 py-2.5 mb-2.5 text-center">
        <div className="min-w-0">
          <span className="block text-[11px] font-medium text-[#71717A] mb-0.5">
            Entry
          </span>
          <span className="text-[12px] font-mono font-medium text-[#FAFAFA] tabular-nums truncate block">
            {formatPrice(toast.entry, undefined, toast.symbol)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] font-medium text-[#71717A] mb-0.5">
            SL
          </span>
          <span className="text-[12px] font-mono font-medium text-[#F87171] tabular-nums truncate block">
            {formatPrice(toast.sl, undefined, toast.symbol)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] font-medium text-[#71717A] mb-0.5">
            TP
          </span>
          <span className="text-[12px] font-mono font-medium text-[#34D399] tabular-nums truncate block">
            {formatPrice(toast.tp, undefined, toast.symbol)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] font-medium text-[#71717A] mb-0.5">
            R:R
          </span>
          <span className="text-[12px] font-mono font-medium text-[#FAFAFA] tabular-nums truncate block">
            {rrValue.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[#A1A1AA] font-medium truncate max-w-[185px]">
          {toast.strategyLabel}
        </span>
        <span className="text-[#71717A]">
          Confidence <span className="text-[#FAFAFA] font-mono font-medium tabular-nums ml-1">{confidencePct}%</span>
        </span>
      </div>
    </div>
  )
}
