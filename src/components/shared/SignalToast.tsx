import { useEffect } from 'react'
import { X } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { useToastStore, type SignalToastItem } from '@/stores/useToastStore'
import { cn } from '@/lib/utils'

const AUTO_DISMISS_MS = 6000

export function SignalToast({ toast }: { toast: SignalToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast)

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, removeToast])

  const isBuy = toast.direction === 'BUY'
  const accentColor = isBuy ? '#22c55e' : '#ef4444'
  const confidencePct = Math.round(toast.confidence)

  return (
    <div
      className={cn(
        'relative w-[300px] bg-[#0d1117] rounded-xl overflow-hidden shadow-2xl',
        'animate-in slide-in-from-right-4 duration-200',
      )}
      style={{ border: `1px solid ${accentColor}33` }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: accentColor }}
      />

      <div className="pl-4 pr-3 pt-3 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ background: accentColor + '20', color: accentColor }}
            >
              {toast.direction}
            </span>
            <span className="text-[14px] font-bold text-[#e5e7eb]">{toast.symbol}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-[#374151] font-medium">
              {toast.timeframe}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#374151]">{toast.strategyLabel}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#374151] hover:text-[#e5e7eb] transition-colors"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        {/* Entry / SL / TP / R:R */}
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {[
            { l: 'Entry', v: formatPrice(toast.entry), c: '#e5e7eb' },
            { l: 'SL',    v: formatPrice(toast.sl),    c: '#ef4444' },
            { l: 'TP',    v: formatPrice(toast.tp),    c: '#22c55e' },
            { l: 'R:R',   v: `${toast.rr.toFixed(1)}x`, c: '#3b82f6' },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-[#0b0f17] rounded-lg px-1.5 py-1.5 text-center">
              <p className="text-[8px] text-[#374151] uppercase tracking-wider mb-0.5">{l}</p>
              <p className="text-[10px] font-bold tabular" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Confidence bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-[3px] bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${confidencePct}%`, background: accentColor }}
            />
          </div>
          <span className="text-[10px] font-bold tabular shrink-0" style={{ color: accentColor }}>
            {confidencePct}%
          </span>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div
        className="h-[2px] bg-[#1e293b]"
        style={{
          background: `linear-gradient(to right, ${accentColor}66, transparent)`,
          animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards`,
        }}
      />

      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); transform-origin: left; }
          to   { transform: scaleX(0); transform-origin: left; }
        }
      `}</style>
    </div>
  )
}
