import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, CandlestickSeries } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'

function generateCandles(count = 90) {
  const now = Math.floor(Date.now() / 1000)
  let price = 1.08200
  // Bias slightly upward for a nice-looking chart
  return Array.from({ length: count }, (_, i) => {
    const drift = 0.000015
    const open = price + drift + (Math.random() - 0.48) * 0.0009
    const close = open + drift + (Math.random() - 0.48) * 0.0013
    const high = Math.max(open, close) + Math.random() * 0.0006
    const low  = Math.min(open, close) - Math.random() * 0.0006
    price = close
    return {
      time:  (now - (count - i) * 3600) as UTCTimestamp,
      open:  +open.toFixed(5),
      high:  +high.toFixed(5),
      low:   +low.toFixed(5),
      close: +close.toFixed(5),
    }
  })
}

export function HeroChart() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f17' },
        textColor: '#374151',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3b82f6', labelBackgroundColor: '#3b82f6' },
        horzLine: { color: '#3b82f6', labelBackgroundColor: '#3b82f6' },
      },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#22C55E',
      downColor:      '#EF4444',
      borderUpColor:  '#22C55E',
      borderDownColor:'#EF4444',
      wickUpColor:    '#22C55E',
      wickDownColor:  '#EF4444',
    })

    series.setData(generateCandles())
    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [])

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_40px_80px_-15px_rgba(0,0,0,0.9)]">
      {/* Ambient glow behind */}
      <div className="absolute -inset-px -z-10 bg-gradient-to-b from-[#3b82f6]/12 to-transparent blur-3xl pointer-events-none" />

      {/* Window chrome */}
      <div className="flex items-center justify-between px-4 h-9 bg-[#070a0f] border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] text-[#3d4a5c] font-medium ml-1">EURUSD · 4H</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[9px] text-[#22c55e] font-semibold">Live</span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 uppercase tracking-wider">
            BUY · 82%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full" style={{ height: 340 }} />

      {/* Signal overlay — top-left */}
      <div className="absolute top-14 left-3 hidden sm:block bg-[#0b0f17]/90 backdrop-blur-sm border border-white/[0.08] rounded-xl p-3">
        <div className="text-[8px] font-semibold text-[#374151] uppercase tracking-widest mb-2.5">
          Active signal
        </div>
        <div className="space-y-1.5">
          {([
            ['Entry', '1.08432', '#e5e7eb'],
            ['SL',    '1.08190', '#ef4444'],
            ['TP',    '1.08916', '#22c55e'],
            ['R:R',   '2.2R',    '#e5e7eb'],
          ] as const).map(([l, v, c]) => (
            <div key={l} className="flex items-center justify-between gap-5">
              <span className="text-[9px] text-[#374151]">{l}</span>
              <span className="text-[9px] font-bold tabular-nums font-mono" style={{ color: c }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy badge — top-right */}
      <div className="absolute top-14 right-3 hidden sm:block bg-[#0b0f17]/90 backdrop-blur-sm border border-white/[0.08] rounded-xl px-3 py-2 text-center">
        <div className="text-[8px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
          Strategy
        </div>
        <div className="text-[10px] font-bold text-white">Wick Rejection</div>
        <div className="text-[9px] text-[#22c55e] font-semibold mt-0.5">74% win rate</div>
      </div>
    </div>
  )
}
