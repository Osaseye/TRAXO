import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, CandlestickSeries } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import type { Timeframe } from '@/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ChartPanelProps {
  symbol: string
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

function generateCandleData(count = 120) {
  const now = Math.floor(Date.now() / 1000)
  const bars = []
  let price = 1.08200
  for (let i = count; i >= 0; i--) {
    const open = price + (Math.random() - 0.5) * 0.0008
    const close = open + (Math.random() - 0.5) * 0.0012
    const high = Math.max(open, close) + Math.random() * 0.0006
    const low = Math.min(open, close) - Math.random() * 0.0006
    bars.push({
      time: (now - i * 3600) as UTCTimestamp,
      open: parseFloat(open.toFixed(5)),
      high: parseFloat(high.toFixed(5)),
      low: parseFloat(low.toFixed(5)),
      close: parseFloat(close.toFixed(5)),
    })
    price = close
  }
  return bars
}

export function ChartPanel({ symbol, timeframe, onTimeframeChange }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#6B7280',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1E293B' },
        horzLines: { color: '#1E293B' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3B82F6', labelBackgroundColor: '#3B82F6' },
        horzLine: { color: '#3B82F6', labelBackgroundColor: '#3B82F6' },
      },
      rightPriceScale: {
        borderColor: '#1E293B',
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    })

    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    })

    candleSeries.setData(generateCandleData(120))
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [symbol, timeframe])

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-lg overflow-hidden">
      {/* Chart header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-primary">{symbol}</span>
          <span className="text-xs text-text-muted">Forex</span>
        </div>
        <Tabs value={timeframe} onValueChange={(v) => onTimeframeChange(v as Timeframe)}>
          <TabsList className="h-7 gap-0.5 p-0.5">
            {TIMEFRAMES.map((tf) => (
              <TabsTrigger key={tf} value={tf} className="h-6 px-2 text-[11px]">
                {tf}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  )
}
