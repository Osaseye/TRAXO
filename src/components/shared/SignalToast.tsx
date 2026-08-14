import React, { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { X, ArrowUpRight, ArrowDownRight, ExternalLink, Copy, Check } from 'lucide-react'
import { formatPrice, formatMT4OrderClipboardPayload } from '@/lib/utils'
import { useToastStore, type SignalToastItem } from '@/stores/useToastStore'
import { useTradingContextStore, type ChartSymbol, type ChartTimeframe } from '@/stores/useTradingContextStore'
import { cn } from '@/lib/utils'

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
        'group relative w-[320px] bg-[#090d14]/95 border rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.6)] backdrop-blur-xl p-3.5 select-none transition-all duration-200 cursor-pointer',
        'hover:border-white/[0.25] hover:scale-[1.02] active:scale-[0.99]',
        isBuy ? 'border-emerald-500/30' : 'border-rose-500/30'
      )}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-5 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 border',
              isBuy
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            )}
          >
            {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {toast.direction}
          </span>
          <span className="text-[13px] font-extrabold text-white tracking-wide">{toast.symbol}</span>
          <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.06]">
            {toast.timeframe}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyOrder}
            className="p-1 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-white/[0.1] transition-colors flex items-center gap-1 text-[10px] font-semibold"
            title="Copy order parameters"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          <span className="text-[10px] font-semibold text-blue-400 opacity-80 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ml-1">
            View <ExternalLink size={10} />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeToast(toast.id)
            }}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
            title="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-[#06090e] border border-white/[0.06] mb-2 text-center">
        <div className="min-w-0">
          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Entry</span>
          <span className="text-[11px] font-bold text-slate-200 tabular-nums truncate block">{formatPrice(toast.entry, undefined, toast.symbol)}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">SL</span>
          <span className="text-[11px] font-bold text-rose-400 tabular-nums truncate block">{formatPrice(toast.sl, undefined, toast.symbol)}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">TP</span>
          <span className="text-[11px] font-bold text-emerald-400 tabular-nums truncate block">{formatPrice(toast.tp, undefined, toast.symbol)}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">R:R</span>
          <span className="text-[11px] font-bold text-blue-400 tabular-nums truncate block">{rrValue.toFixed(1)}x</span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-400 font-medium truncate max-w-[170px]">{toast.strategyLabel}</span>
        <span className="text-slate-300 font-bold tracking-tight">
          Confidence <span className={cn('ml-0.5', isBuy ? 'text-emerald-400' : 'text-rose-400')}>{confidencePct}%</span>
        </span>
      </div>
    </div>
  )
}
