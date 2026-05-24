import { Pencil, TestTube2 } from 'lucide-react'

// Mini visual previews used inside feature cards

function SignalPreview() {
  return (
    <div className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/[0.04] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e]">BUY</span>
          <span className="text-[11px] font-semibold text-white">EURUSD</span>
        </div>
        <span className="text-[10px] text-[#22c55e] font-medium">82% conf</span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-[9px]">
        {[['Entry','1.08432','white'],['SL','1.08190','#ef4444'],['TP','1.08916','#22c55e'],['RR','2.2R','white']].map(
          ([l,v,c]) => (
            <div key={l as string}>
              <div className="text-[#374151]">{l as string}</div>
              <div className="font-medium tabular-nums" style={{ color: c as string }}>{v as string}</div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function RiskPreview() {
  return (
    <div className="space-y-2.5 p-3 rounded-lg bg-[#0d1117] border border-white/[0.06]">
      {[
        { label: 'Daily loss limit', pct: 38, color: '#22c55e', val: '0.76% / 2%' },
        { label: 'Trades today',     pct: 60, color: '#f59e0b', val: '3 / 5'     },
      ].map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-[#4b5563]">{item.label}</span>
            <span className="text-[#6b7280] tabular-nums">{item.val}</span>
          </div>
          <div className="h-1 rounded-full bg-[#1e293b] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${item.pct}%`, background: item.color }}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-between items-center pt-0.5">
        <span className="text-[9px] text-[#4b5563]">Status</span>
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#22c55e]/10 text-[#22c55e] tracking-wider">SAFE</span>
      </div>
    </div>
  )
}

function StrategyPreview() {
  const strategies = [
    { name: 'Wick Rejection', wr: '74%', active: true  },
    { name: 'Breakout',       wr: '68%', active: true  },
    { name: 'Trend Following',wr: '71%', active: false },
    { name: 'Supply & Demand',wr: '77%', active: true  },
  ]
  return (
    <div className="space-y-1.5 p-3 rounded-lg bg-[#0d1117] border border-white/[0.06]">
      {strategies.map((s) => (
        <div key={s.name} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.active ? 'bg-[#22c55e]' : 'bg-[#374151]'}`} />
            <span className={`text-[10px] font-medium ${s.active ? 'text-[#d1d5db]' : 'text-[#374151]'}`}>{s.name}</span>
          </div>
          <span className={`text-[9px] tabular-nums ${s.active ? 'text-[#6b7280]' : 'text-[#1f2937]'}`}>{s.wr}</span>
        </div>
      ))}
    </div>
  )
}

function ReasoningPreview() {
  const conditions = [
    { met: true,  label: 'Wick rejection on 4H close' },
    { met: true,  label: 'RSI oversold — bounce zone' },
    { met: true,  label: 'Key demand zone hit (S&D)' },
    { met: false, label: '3/3 confluence — high conf.' },
  ]
  return (
    <div className="rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      {/* Signal header */}
      <div className="px-3 py-2.5 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e] uppercase tracking-wider">
            BUY
          </span>
          <span className="text-[11px] font-semibold text-white">EURUSD</span>
        </div>
        <span className="text-[10px] font-bold text-[#22c55e]">82% conf</span>
      </div>
      {/* Confidence bar */}
      <div className="px-3 py-2.5 border-b border-white/[0.05]">
        <div className="flex justify-between text-[8px] mb-1.5 text-[#4b5563]">
          <span>Confidence</span><span>82 / 100</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#1e293b] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#22c55e]/70 to-[#22c55e]" style={{ width: '82%' }} />
        </div>
      </div>
      {/* Conditions checklist */}
      <div className="p-3 space-y-2">
        <div className="text-[8px] font-semibold text-[#374151] uppercase tracking-widest mb-2">
          Why this signal
        </div>
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${
                c.met ? 'bg-[#22c55e]/15' : 'bg-[#3b82f6]/15'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${c.met ? 'bg-[#22c55e]' : 'bg-[#3b82f6]'}`} />
            </div>
            <span className="text-[9px] text-[#6b7280]">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    tag: 'Signal Engine',
    title: 'Every setup.\nEvery timeframe.',
    body: 'Five strategies run simultaneously across all major pairs. When conditions align, you get a signal with entry, stop-loss, take-profit, and reasoning — before the move happens.',
    visual: <SignalPreview />,
  },
  {
    tag: 'Risk Management',
    title: 'Your risk,\nalways in check.',
    body: 'Set your daily loss limit, per-trade risk cap, and max trade count. Traxo tracks every exposure in real time and warns you before you cross a line.',
    visual: <RiskPreview />,
  },
  {
    tag: 'Strategy Control',
    title: 'Trade only what\nyou trust.',
    body: 'Enable or disable each strategy with one click. Track win rates, average RR, and total signals per strategy so you know exactly which edge is performing.',
    visual: <StrategyPreview />,
  },
  {
    tag: 'Signal Intelligence',
    title: 'TRAXO tells you\nexactly why.',
    body: 'Every signal comes with a plain-language breakdown — which pattern fired, what confluence conditions were met, and why the confidence score sits where it does.',
    visual: <ReasoningPreview />,
  },
]

export function FeaturesSection() {
  return (
    <section className="py-16 sm:py-32 px-4 sm:px-6 max-w-6xl mx-auto">
      {/* Section label */}
      <div className="mb-10 sm:mb-16">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#3b82f6] mb-3">
          Why Traxo
        </p>
        <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold text-white tracking-tight leading-tight max-w-lg">
          Built for traders who
          <br />
          know what they want.
        </h2>
      </div>

      {/* Feature rows — alternating layout */}
      <div className="space-y-6">
        {FEATURES.map((f, i) => (
          <div
            key={f.tag}
            className={`grid md:grid-cols-2 gap-px rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03] ${
              i % 2 === 1 ? 'md:[direction:rtl]' : ''
            }`}
          >
            {/* Text side */}
            <div className={`bg-[#09090d] p-8 flex flex-col justify-center ${i % 2 === 1 ? 'md:[direction:ltr]' : ''}`}>
              <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#3b82f6] mb-3">
                {f.tag}
              </p>
              <h3 className="text-[1.4rem] font-extrabold text-white tracking-tight leading-tight mb-4 whitespace-pre-line">
                {f.title}
              </h3>
              <p className="text-[13px] text-[#4b5563] leading-relaxed max-w-sm">
                {f.body}
              </p>
            </div>

            {/* Visual side */}
            <div className={`bg-[#0b0f17] p-8 flex items-center justify-center ${i % 2 === 1 ? 'md:[direction:ltr]' : ''}`}>
              <div className="w-full max-w-xs">
                {f.visual}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pilot (Phase 2) ── */}
      <div className="mt-16 sm:mt-24 pt-16 sm:pt-24 border-t border-white/[0.05]">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            <span className="text-[10px] font-semibold text-[#f59e0b] tracking-[0.12em] uppercase">Coming — Phase 2</span>
          </div>
          <h3 className="text-[clamp(1.4rem,3vw,2rem)] font-extrabold text-white tracking-tight leading-tight">
            Where TRAXO executes.
          </h3>
          <p className="mt-3 text-[14px] text-[#4b5563] max-w-lg leading-relaxed">
            Phase 1 reads the market for you. Phase 2 acts on it — automatically, inside your rules.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-4 items-stretch">
          {/* Pilot hero card */}
          <div className="md:col-span-3 rounded-2xl border border-[#3b82f6]/20 bg-gradient-to-br from-[#0d1117] to-[#08090f] overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.07),transparent_55%)] pointer-events-none" />
            <div className="relative p-7">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#3b82f6]/15 border border-[#3b82f6]/30 flex items-center justify-center">
                    <span className="text-[8px] font-black text-[#3b82f6] tracking-widest">TX</span>
                  </div>
                  <span className="text-[13px] font-black tracking-[0.18em] text-white uppercase">PILOT</span>
                </div>
                <span className="text-[8px] font-bold px-2 py-1 rounded bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 uppercase tracking-wider">
                  Phase 2
                </span>
              </div>

              <h4 className="text-[1.25rem] font-extrabold text-white leading-tight mb-2">
                TRAXO executes.<br />
                You stay in control.
              </h4>
              <p className="text-[13px] text-[#4b5563] leading-relaxed mb-7 max-w-sm">
                Set your risk rules once. When a signal fires, Pilot places the trade, manages the position,
                and closes it — while you review every decision in real time.
              </p>

              {/* Mock Pilot UI */}
              <div className="rounded-xl border border-[#3b82f6]/12 bg-[#060810] p-4 space-y-3">
                {/* Mode toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-white">Pilot Mode</div>
                    <div className="text-[9px] text-[#374151] mt-0.5">Auto-execute on signal confirmation</div>
                  </div>
                  <div className="w-10 h-5 rounded-full bg-[#3b82f6]/25 border border-[#3b82f6]/35 flex items-center px-0.5">
                    <div className="w-4 h-4 rounded-full bg-[#3b82f6] translate-x-5 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  </div>
                </div>

                {/* Paper trading notice */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f59e0b]/[0.07] border border-[#f59e0b]/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse shrink-0" />
                  <span className="text-[9px] font-medium text-[#f59e0b]">Paper Trading — simulation active, no real funds</span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Executed', value: '24',    color: '#e5e7eb' },
                    { label: 'Win Rate', value: '71%',   color: '#22c55e' },
                    { label: 'Avg R',    value: '+2.1R', color: '#22c55e' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-lg bg-[#0d1117] border border-white/[0.05] px-2 py-2.5 text-center">
                      <div className="text-[10px] font-bold tabular-nums" style={{ color }}>{value}</div>
                      <div className="text-[8px] text-[#374151] mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Supporting cards */}
          <div className="md:col-span-2 flex flex-col gap-4">
            {[
              {
                Icon: Pencil,
                name: 'Custom Strategies',
                description: 'Build your own entry logic from scratch. Combine indicators, candle patterns, and market structure into a fully custom strategy with defined confidence rules.',
                color: '#8b5cf6',
              },
              {
                Icon: TestTube2,
                name: 'Backtesting Engine',
                description: 'Run any strategy against years of historical data. See win rate, max drawdown, average R, and equity curve before trusting it with real capital.',
                color: '#f59e0b',
              },
            ].map(({ Icon, name, description, color }) => (
              <div
                key={name}
                className="flex-1 p-6 rounded-2xl border border-white/[0.06] bg-[#09090d] flex flex-col gap-4 hover:border-white/[0.1] transition-colors duration-200"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="w-9 h-9 rounded-xl border flex items-center justify-center"
                    style={{ background: `${color}15`, borderColor: `${color}28`, color }}
                  >
                    <Icon size={15} strokeWidth={1.8} />
                  </div>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 uppercase tracking-wider">
                    Phase 2
                  </span>
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-white mb-1.5">{name}</h4>
                  <p className="text-[12px] text-[#4b5563] leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
