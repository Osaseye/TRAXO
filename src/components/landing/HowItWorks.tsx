import { KeyRound, Layers, Zap } from 'lucide-react'

// ─── Step 1 Visual: broker connect + risk sliders ────────────────────────────
function ConnectVisual() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b0f17] p-4 space-y-4">
      {/* Broker tabs */}
      <div>
        <div className="text-[9px] font-semibold text-[#4b5563] uppercase tracking-wider mb-2">Broker</div>
        <div className="flex gap-2">
          {['OANDA', 'IG', 'MT5'].map((b, i) => (
            <div
              key={b}
              className={`flex-1 py-1.5 rounded-lg border text-[10px] font-semibold text-center transition-colors ${
                i === 0
                  ? 'border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#3b82f6]'
                  : 'border-white/[0.06] text-[#374151] bg-transparent'
              }`}
            >
              {b}
            </div>
          ))}
        </div>
      </div>

      {/* API Key masked */}
      <div>
        <div className="text-[9px] font-semibold text-[#4b5563] uppercase tracking-wider mb-2">API Key</div>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-[#09090d]">
          <KeyRound size={12} className="text-[#374151] shrink-0" />
          <div className="flex-1 text-[10px] text-[#374151] font-mono tracking-widest">••••••••••••••••••••</div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            <span className="text-[8px] text-[#22c55e] font-semibold">Live</span>
          </div>
        </div>
      </div>

      {/* Risk sliders */}
      <div className="space-y-3">
        <div className="text-[9px] font-semibold text-[#4b5563] uppercase tracking-wider">Risk Parameters</div>
        {[
          { label: 'Risk per trade', val: '1.0%', pct: 20, color: '#3b82f6' },
          { label: 'Max daily loss',  val: '2.0%', pct: 40, color: '#f59e0b' },
          { label: 'Max open trades', val: '5',    pct: 50, color: '#3b82f6' },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-[9px] mb-1.5">
              <span className="text-[#4b5563]">{item.label}</span>
              <span className="text-[#6b7280] font-mono tabular-nums">{item.val}</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-[#1e293b]">
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ width: `${item.pct}%`, background: item.color }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 shadow-sm"
                style={{ left: `calc(${item.pct}% - 6px)`, borderColor: item.color }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <span className="text-[9px] text-[#374151]">Keys encrypted with Google KMS</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[9px] text-[#22c55e] font-semibold">Secured</span>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2 Visual: strategy picker ──────────────────────────────────────────
function StrategyVisual() {
  const strategies = [
    { name: 'Wick Rejection',  wr: '74%', signals: 142, active: true  },
    { name: 'Breakout',        wr: '68%', signals: 98,  active: true  },
    { name: 'Order Block',     wr: '71%', signals: 87,  active: false },
    { name: 'Supply & Demand', wr: '77%', signals: 115, active: true  },
    { name: 'Trend Following', wr: '69%', signals: 103, active: false },
  ]
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#6b7280]">Strategies</span>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          <span className="text-[9px] text-[#22c55e]">3 active</span>
        </div>
      </div>
      <div className="p-2 space-y-1">
        {strategies.map((s) => (
          <div
            key={s.name}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              s.active ? 'bg-[#0d1117] border border-white/[0.06]' : 'border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.active ? 'bg-[#22c55e]' : 'bg-[#374151]'}`} />
            <span className={`flex-1 text-[10px] font-medium ${s.active ? 'text-[#d1d5db]' : 'text-[#374151]'}`}>
              {s.name}
            </span>
            <span className={`text-[9px] tabular-nums font-mono ${s.active ? 'text-[#22c55e]' : 'text-[#374151]'}`}>
              {s.wr}
            </span>
            {/* Toggle pill */}
            <div
              className={`w-7 h-3.5 rounded-full flex items-center px-0.5 transition-colors ${
                s.active ? 'bg-[#22c55e]/25' : 'bg-[#1e293b]'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  s.active ? 'translate-x-3.5 bg-[#22c55e]' : 'bg-[#374151]'
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 3 Visual: signal with reasoning ─────────────────────────────────────
function SignalVisual() {
  return (
    <div className="rounded-xl border border-[#22c55e]/25 bg-[#22c55e]/[0.03] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#22c55e]/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e] uppercase tracking-wider">
            BUY
          </span>
          <span className="text-[13px] font-bold text-white">EURUSD</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#4b5563]">4H</span>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-extrabold text-[#22c55e]">82%</div>
          <div className="text-[8px] text-[#374151]">confidence</div>
        </div>
      </div>

      {/* Levels grid */}
      <div className="grid grid-cols-4 divide-x divide-white/[0.04] border-b border-white/[0.04]">
        {[
          { l: 'Entry', v: '1.08432', c: '#e5e7eb' },
          { l: 'SL',    v: '1.08190', c: '#ef4444' },
          { l: 'TP',    v: '1.08916', c: '#22c55e' },
          { l: 'R:R',   v: '2.2R',    c: '#e5e7eb' },
        ].map(({ l, v, c }) => (
          <div key={l} className="px-2 py-2.5 text-center bg-[#0b0f17]">
            <div className="text-[8px] text-[#374151] mb-0.5">{l}</div>
            <div className="text-[10px] font-bold tabular-nums" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Reasoning */}
      <div className="p-4 space-y-2">
        <div className="text-[9px] font-semibold text-[#374151] uppercase tracking-widest mb-3">
          Why this signal
        </div>
        {[
          { ok: true,  text: 'Wick rejection confirmed on 4H candle close' },
          { ok: true,  text: 'RSI at 28.4 — deep oversold, bounce zone' },
          { ok: true,  text: 'Price at key demand zone: 1.0840–1.0845' },
          { ok: false, text: '3 / 3 confluence conditions met — high confidence' },
        ].map((r, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className={`mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                r.ok ? 'bg-[#22c55e]/15' : 'bg-[#3b82f6]/15'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-[#22c55e]' : 'bg-[#3b82f6]'}`} />
            </div>
            <span className="text-[10px] text-[#6b7280] leading-snug">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

const STEPS = [
  {
    number: '01',
    Icon: KeyRound,
    title: 'Connect your account',
    description:
      'Add your broker API key and set your risk parameters — daily loss limit, risk per trade, max positions. TRAXO never touches your funds.',
    Visual: ConnectVisual,
  },
  {
    number: '02',
    Icon: Layers,
    title: 'Activate a strategy',
    description:
      'Choose from 5 pre-built, proven strategies. Each one has defined entry conditions, confidence thresholds, and auto-calculated SL/TP levels.',
    Visual: StrategyVisual,
  },
  {
    number: '03',
    Icon: Zap,
    title: 'Receive signals with reasoning',
    description:
      'The moment a setup is confirmed, you get a full signal — entry, stop-loss, take-profit, R:R ratio, and the exact logic that triggered it.',
    Visual: SignalVisual,
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-32 px-4 sm:px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <div className="mb-12 sm:mb-20 max-w-xl">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#3b82f6] mb-3">
            How it works
          </p>
          <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold text-white tracking-tight leading-tight">
            From setup to signal
            <br />
            in three steps.
          </h2>
          <p className="mt-4 text-[15px] text-[#6b7280] leading-relaxed max-w-md">
            No complexity. No guesswork. TRAXO handles the scanning — you handle the decision.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map(({ number, Icon, title, description, Visual }) => (
            <div
              key={number}
              className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#09090d] overflow-hidden hover:border-white/[0.12] transition-colors duration-200"
            >
              {/* Card header */}
              <div className="p-6 pb-5">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6]">
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  <span className="text-[11px] font-bold tracking-[0.14em] text-[#1e293b] font-mono">
                    {number}
                  </span>
                </div>
                <h3 className="text-[15px] font-bold text-white mb-2.5 leading-snug">{title}</h3>
                <p className="text-[12px] text-[#4b5563] leading-relaxed">{description}</p>
              </div>

              {/* Visual mockup */}
              <div className="px-4 pb-5 mt-auto">
                <Visual />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
