// Fake dashboard UI mockup rendered in pure CSS/SVG — shown on the landing page hero
import ScrollReveal from '@/components/ui/ScrollReveal'

const SIGNALS = [
  { dir: 'BUY',  sym: 'EURUSD', conf: 82, entry: '1.08432', sl: '1.08190', tp: '1.08916', rr: '2.2R' },
  { dir: 'SELL', sym: 'XAUUSD', conf: 76, entry: '2318.50', sl: '2324.10', tp: '2307.80', rr: '1.9R' },
  { dir: 'BUY',  sym: 'GBPUSD', conf: 69, entry: '1.26750', sl: '1.26410', tp: '1.27400', rr: '1.8R' },
]

const STATS = [
  { label: 'Signals Today', value: '7',     sub: '+2 from avg' },
  { label: 'Win Rate',      value: '71%',   sub: 'This week'   },
  { label: 'Active Trades', value: '3',     sub: 'Open now'    },
  { label: "P&L Today",    value: '+$182', sub: '+1.8%'       },
]

// Simple fake candlestick chart using SVG
function FakeChart() {
  const candles = [
    { o: 60, c: 52, h: 62, l: 49 },
    { o: 52, c: 58, h: 61, l: 50 },
    { o: 58, c: 54, h: 60, l: 52 },
    { o: 54, c: 63, h: 65, l: 53 },
    { o: 63, c: 59, h: 66, l: 58 },
    { o: 59, c: 67, h: 69, l: 57 },
    { o: 67, c: 62, h: 70, l: 60 },
    { o: 62, c: 70, h: 72, l: 61 },
    { o: 70, c: 65, h: 73, l: 64 },
    { o: 65, c: 72, h: 74, l: 63 },
    { o: 72, c: 68, h: 75, l: 67 },
    { o: 68, c: 76, h: 78, l: 67 },
    { o: 76, c: 71, h: 78, l: 70 },
    { o: 71, c: 79, h: 81, l: 70 },
    { o: 79, c: 74, h: 82, l: 73 },
    { o: 74, c: 83, h: 85, l: 73 },
    { o: 83, c: 78, h: 86, l: 77 },
    { o: 78, c: 85, h: 87, l: 77 },
  ]

  const H = 90
  const candleW = 7
  const gap = 3
  const totalW = candles.length * (candleW + gap)

  return (
    <svg viewBox={`0 0 ${totalW} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {/* Grid lines */}
      {[25, 50, 75].map((y) => (
        <line key={y} x1={0} y1={y} x2={totalW} y2={y} stroke="#1e293b" strokeWidth="0.5" />
      ))}
      {/* Candles */}
      {candles.map((c, i) => {
        const x = i * (candleW + gap)
        const isGreen = c.c >= c.o
        const color = isGreen ? '#22c55e' : '#ef4444'
        const top = Math.min(c.o, c.c)
        const bodyH = Math.abs(c.c - c.o) || 1
        const cx = x + candleW / 2
        return (
          <g key={i}>
            {/* Wick */}
            <line x1={cx} y1={H - c.h} x2={cx} y2={H - c.l} stroke={color} strokeWidth="0.8" />
            {/* Body */}
            <rect x={x} y={H - top - bodyH} width={candleW} height={bodyH} fill={color} rx="0.5" />
          </g>
        )
      })}
    </svg>
  )
}

export function ProductPreview() {
  return (
    <ScrollReveal>
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_50px_100px_-20px_rgba(0,0,0,0.9)]">
      {/* Ambient glow behind mockup */}
      <div className="absolute inset-0 -z-10 blur-3xl opacity-30 bg-gradient-to-b from-[#3b82f6]/20 to-transparent pointer-events-none" />

      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 h-9 bg-[#0a0a0f] border-b border-white/[0.06] shrink-0">
        <div className="flex gap-1.5 items-center">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[11px] text-[#444] ml-1.5 font-medium">traxo — Dashboard</span>
      </div>

      {/* App body */}
      <div className="flex bg-[#0b0f17]" style={{ height: 460 }}>
        {/* Sidebar */}
        <div className="w-44 bg-[#0d1117] border-r border-white/[0.05] flex flex-col shrink-0">
          {/* Logo area */}
          <div className="px-3 py-3 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#3b82f6] flex items-center justify-center">
                <span className="text-[8px] font-black text-white">T</span>
              </div>
              <span className="text-[11px] font-bold text-white tracking-wide">TRAXO</span>
            </div>
          </div>
          {/* Nav */}
          <div className="px-2 py-3 flex flex-col gap-0.5">
            {[['Dashboard', true], ['Strategies', false], ['Settings', false]].map(([label, active]) => (
              <div
                key={label as string}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium ${
                  active
                    ? 'bg-[#3b82f6]/10 text-[#3b82f6] border-l-2 border-[#3b82f6] -ml-px pl-[9px]'
                    : 'text-[#4b5563]'
                }`}
              >
                {label as string}
              </div>
            ))}
          </div>
          {/* Mode badge */}
          <div className="mt-auto px-3 pb-3">
            <div className="text-[9px] px-2 py-1 rounded bg-[#3b82f6]/10 text-[#3b82f6] font-semibold tracking-wider text-center border border-[#3b82f6]/20">
              ANALYST MODE
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Stats row */}
          <div className="grid grid-cols-4 border-b border-white/[0.05] shrink-0">
            {STATS.map((s) => (
              <div key={s.label} className="px-3 py-2.5 border-r border-white/[0.04] last:border-r-0">
                <div className="text-[9px] text-[#4b5563] mb-0.5 uppercase tracking-wider">{s.label}</div>
                <div className={`text-base font-bold tabular-nums leading-none ${s.label === "P&L Today" ? 'text-[#22c55e]' : 'text-white'}`}>
                  {s.value}
                </div>
                <div className="text-[9px] text-[#374151] mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart + Signal feed */}
          <div className="flex flex-1 overflow-hidden">
            {/* Chart area */}
            <div className="flex-1 flex flex-col border-r border-white/[0.05] overflow-hidden min-w-0">
              {/* Chart toolbar */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.04] shrink-0">
                <span className="text-[10px] font-semibold text-white">EURUSD</span>
                <span className="text-[9px] text-[#4b5563] ml-1">·</span>
                {['1m','5m','15m','1H','4H','1D'].map((tf) => (
                  <span key={tf} className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${tf === '1H' ? 'bg-[#3b82f6]/15 text-[#3b82f6]' : 'text-[#4b5563]'}`}>
                    {tf}
                  </span>
                ))}
              </div>
              {/* Chart SVG */}
              <div className="flex-1 px-2 py-3 overflow-hidden">
                <FakeChart />
              </div>
            </div>

            {/* Signal feed */}
            <div className="w-52 flex flex-col shrink-0 overflow-hidden">
              {/* Feed header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04] shrink-0">
                <span className="text-[10px] font-semibold text-[#9ca3af]">Live Signals</span>
                <span className="flex items-center gap-1 text-[9px] text-[#4b5563]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" style={{ boxShadow: '0 0 4px #22c55e' }} />
                  Live
                </span>
              </div>
              {/* Signal cards */}
              <div className="flex-1 overflow-hidden px-2 py-2 flex flex-col gap-1.5">
                {SIGNALS.map((s) => (
                  <div
                    key={s.sym}
                    className={`rounded-lg p-2 border ${
                      s.dir === 'BUY'
                        ? 'border-[#22c55e]/20 bg-[#22c55e]/[0.04]'
                        : 'border-[#ef4444]/20 bg-[#ef4444]/[0.04]'
                    }`}
                  >
                    {/* Dir + sym + conf */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          s.dir === 'BUY' ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#ef4444]/15 text-[#ef4444]'
                        }`}>
                          {s.dir}
                        </span>
                        <span className="text-[10px] font-semibold text-white">{s.sym}</span>
                      </div>
                      <span className={`text-[9px] font-medium ${s.conf >= 80 ? 'text-[#22c55e]' : 'text-[#f59e0b]'}`}>
                        {s.conf}%
                      </span>
                    </div>
                    {/* Levels */}
                    <div className="grid grid-cols-4 gap-x-1">
                      {[['Entry', s.entry, 'white'], ['SL', s.sl, '#ef4444'], ['TP', s.tp, '#22c55e'], ['RR', s.rr, 'white']].map(
                        ([lbl, val, col]) => (
                          <div key={lbl as string}>
                            <div className="text-[8px] text-[#374151]">{lbl as string}</div>
                            <div className={`text-[9px] font-medium tabular-nums leading-tight`} style={{ color: col as string }}>
                              {val as string}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ScrollReveal>
  )
}
