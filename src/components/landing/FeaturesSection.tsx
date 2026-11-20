import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PiCheck } from 'react-icons/pi'
import { cn } from '@/lib/utils'

interface StrategyEngine {
  id: string
  name: string
  shortName: string
  image: string
  session: string
  rrTarget: string
  winRate: string
  rules: string[]
}

const ENGINES: StrategyEngine[] = [
  {
    id: 'wick-rejection',
    name: 'Wick Rejection',
    shortName: 'Wick Rejection',
    image: '/brand/strategy-wick-rejection.png',
    session: 'London · NY Open',
    rrTarget: '1 : 2.8',
    winRate: '73%',
    rules: [
      'Liquidity sweep beyond prior session high or low',
      'Rejection wick >= 62% of total candle range',
      'Immediate displacement close back inside key support/resistance structure',
    ],
  },
  {
    id: 'breakout',
    name: 'Breakout Retest',
    shortName: 'Breakout Retest',
    image: '/brand/strategy-breakout.png',
    session: 'London / NY Breakout',
    rrTarget: '1 : 3.0',
    winRate: '68%',
    rules: [
      'Compression range >= 6 consecutive candles below boundary level',
      'High-momentum impulse candle close outside consolidation boundary',
      'Clean limit order retest of broken structure with tight SL invalidation',
    ],
  },
  {
    id: 'order-block',
    name: 'Order Block & FVG',
    shortName: 'Order Block',
    image: '/brand/strategy-order-block.png',
    session: 'London & NY Sessions',
    rrTarget: '1 : 3.2',
    winRate: '71%',
    rules: [
      'Unmitigated last opposing candle before displacement break of structure',
      'Fair value gap imbalance confirming institutional sponsorship',
      'M15 zone mitigation aligned with dominant H4 structural trend',
    ],
  },
  {
    id: 'supply-demand',
    name: 'Supply & Demand',
    shortName: 'Supply & Demand',
    image: '/brand/strategy-supply-demand.png',
    session: 'All Trading Sessions',
    rrTarget: '1 : 2.6',
    winRate: '69%',
    rules: [
      'Fresh rally-base-drop or drop-base-rally origin zone',
      'Aggressive departure leaving unfulfilled institutional resting orders',
      'First return limit tap with strict R:R buffer calculation',
    ],
  },
  {
    id: 'trend-following',
    name: 'Trend Following',
    shortName: 'Trend Following',
    image: '/brand/strategy-trend-following.png',
    session: 'Trending Sessions',
    rrTarget: '1 : 3.5',
    winRate: '64%',
    rules: [
      'EMA 20/50 dynamic ribbon alignment with clear directional slope',
      'Pullback to value zone accompanied by momentum deceleration',
      'Continuation trigger firing only in direction of dominant daily bias',
    ],
  },
]

export function FeaturesSection() {
  const [activeEngineId, setActiveEngineId] = useState('wick-rejection')
  const [equity, setEquity] = useState(25000)
  const [riskPct, setRiskPct] = useState(1.0)
  const [stopPips, setStopPips] = useState(15)

  const activeEngine = ENGINES.find((e) => e.id === activeEngineId) ?? ENGINES[0]

  // Lot sizing computation: ($risk / (stopPips * $10 per lot))
  const riskAmount = (equity * riskPct) / 100
  const computedLots = Math.max(0.01, Number((riskAmount / (stopPips * 10)).toFixed(2)))
  const equityPct = ((equity - 5000) / 95000) * 100
  const riskSliderPct = ((riskPct - 0.25) / 2.75) * 100
  const stopPipsPct = ((stopPips - 5) / 45) * 100

  return (
    <section id="engines" className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 overflow-hidden select-none font-sans">
      {/* ── Background Grid & Vignette ──────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="absolute top-1/3 right-1/4 w-[650px] h-[380px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.02] to-transparent blur-3xl rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-10 sm:space-y-14">
        {/* Section Header: NO BADGE CONTAINER! Pure Plus Jakarta Sans typography */}
        <div className="space-y-3">
          <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
            Algorithmic Execution Models
          </p>
          <h2 className="text-[28px] sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12]">
            Five execution models. Zero guesswork.
          </h2>
          <p className="text-[14.5px] sm:text-[17px] text-[#A1A1AA] max-w-2xl leading-relaxed font-normal">
            Every engine is mathematically formulated with structural rules, automated lot sizing, and multi-session telemetry.
          </p>
        </div>

        {/* Engine Switcher Tabs directly on canvas */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-2.5 border-b border-white/[0.06] no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {ENGINES.map((engine) => {
            const isSelected = activeEngineId === engine.id
            return (
              <button
                key={engine.id}
                type="button"
                onClick={() => setActiveEngineId(engine.id)}
                className={cn(
                  'relative min-h-[44px] sm:min-h-0 px-4 sm:px-5 py-2.5 rounded-full text-[13px] font-medium transition-all shrink-0 cursor-pointer',
                  isSelected
                    ? 'text-[#09090B]'
                    : 'text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/[0.04]'
                )}
              >
                {isSelected && (
                  <motion.span
                    layoutId="engine-pill-active"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 bg-[#FAFAFA] rounded-full"
                  />
                )}
                <span className="relative z-10">{engine.shortName}</span>
              </button>
            )
          })}
        </div>

        {/* Engine Showcase & Interactive Playground */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left Column: Active Engine Schematic & Rules */}
          <div className="lg:col-span-7 space-y-6">
            <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_32px_90px_rgba(0,0,0,0.85)] bg-[#09090B]">
              <div className="relative">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={activeEngine.id}
                    src={activeEngine.image}
                    alt={activeEngine.name}
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full aspect-[16/10] sm:aspect-[16/9] object-cover"
                  />
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-transparent opacity-80" />
              </div>

              {/* Metadata bar: stacked cleanly below image on mobile, overlaid on sm+ */}
              <div className="relative sm:absolute sm:bottom-4 sm:inset-x-6 p-4 sm:p-0 border-t border-white/[0.06] sm:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
                <div>
                  <h3 className="text-[17px] sm:text-[18px] font-semibold text-[#FAFAFA]">{activeEngine.name}</h3>
                  <p className="text-[12px] text-[#A1A1AA] mt-0.5">{activeEngine.session}</p>
                </div>
                <div className="flex items-center gap-4 text-[12.5px] sm:text-[13px] font-medium">
                  <span className="text-[#34D399]">
                    {activeEngine.winRate} Win Rate
                  </span>
                  <span className="text-[#FAFAFA]">
                    {activeEngine.rrTarget} Target
                  </span>
                </div>
              </div>
            </div>

            {/* Rule Verification List */}
            <div className="space-y-3 pt-1 sm:pt-2">
              <div className="text-[12px] uppercase text-[#71717A] tracking-wider font-semibold">
                Execution Prerequisite Rules
              </div>
              <div className="space-y-2.5">
                {activeEngine.rules.map((rule, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-[13.5px] text-[#A1A1AA] leading-relaxed">
                    <div className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[#FAFAFA] shrink-0 mt-0.5">
                      <PiCheck size={12} />
                    </div>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Risk Guard Simulator (Clean Plus Jakarta Sans Typography) */}
          <div className="lg:col-span-5 space-y-5 sm:space-y-6 pt-2 border-t border-white/[0.06] lg:border-t-0 lg:pt-2">
            <div className="pt-4 lg:pt-0">
              <p className="text-[12px] uppercase text-[#A1A1AA] tracking-wider font-semibold">
                Risk Guard Simulator
              </p>
              <h3 className="text-[22px] sm:text-2xl font-bold text-[#FAFAFA] tracking-tight mt-1.5">
                Exact sizing before execution.
              </h3>
              <p className="text-[13.5px] text-[#71717A] mt-1 leading-relaxed font-normal">
                MetaTrader 5 orders calculate exact lot sizing dynamically from your balance and stop distance.
              </p>
            </div>

            {/* Clean Sliders with 44px touch targets */}
            <div className="space-y-4 sm:space-y-5 pt-1 sm:pt-3">
              {/* Account Equity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-[#A1A1AA]">Account Equity</span>
                  <span className="font-bold text-[#FAFAFA] tabular-nums shrink-0">
                    ${equity.toLocaleString()}
                  </span>
                </div>
                <div className="relative h-11 flex items-center">
                  <div className="w-full h-1.5 rounded-full bg-[#18181B] relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-[#FAFAFA]"
                      style={{ width: `${equityPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label="Account Equity"
                    min={5000}
                    max={100000}
                    step={2500}
                    value={equity}
                    onChange={(e) => setEquity(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#FAFAFA] border-2 border-white shadow-md pointer-events-none"
                    style={{ left: `calc(${equityPct}% - ${(equityPct / 100) * 16}px)` }}
                  />
                </div>
              </div>

              {/* Risk Percentage Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-[#A1A1AA]">Risk Tolerance</span>
                  <span className="font-bold text-[#FAFAFA] tabular-nums shrink-0">
                    {riskPct.toFixed(2)}% (${riskAmount.toFixed(0)})
                  </span>
                </div>
                <div className="relative h-11 flex items-center">
                  <div className="w-full h-1.5 rounded-full bg-[#18181B] relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-[#34D399]"
                      style={{ width: `${riskSliderPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label="Risk Tolerance"
                    min={0.25}
                    max={3.0}
                    step={0.25}
                    value={riskPct}
                    onChange={(e) => setRiskPct(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#FAFAFA] border-2 border-[#34D399] shadow-md pointer-events-none"
                    style={{ left: `calc(${riskSliderPct}% - ${(riskSliderPct / 100) * 16}px)` }}
                  />
                </div>
              </div>

              {/* Stop Distance Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-[#A1A1AA]">Structural Invalidation Distance</span>
                  <span className="font-bold text-[#FAFAFA] tabular-nums shrink-0">
                    {stopPips} pips
                  </span>
                </div>
                <div className="relative h-11 flex items-center">
                  <div className="w-full h-1.5 rounded-full bg-[#18181B] relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-[#A1A1AA]"
                      style={{ width: `${stopPipsPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label="Structural Invalidation Distance"
                    min={5}
                    max={50}
                    step={1}
                    value={stopPips}
                    onChange={(e) => setStopPips(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#FAFAFA] border-2 border-[#A1A1AA] shadow-md pointer-events-none"
                    style={{ left: `calc(${stopPipsPct}% - ${(stopPipsPct / 100) * 16}px)` }}
                  />
                </div>
              </div>
            </div>

            {/* Sizing Output Display */}
            <div className="p-4 sm:p-5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase text-[#71717A] font-medium">Position Sizing</div>
                <div className="text-2xl font-bold text-[#FAFAFA] tabular-nums mt-0.5">
                  {computedLots} <span className="text-[14px] text-[#A1A1AA] font-normal">Lots</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase text-[#71717A] font-medium">Max Loss Cap</div>
                <div className="text-lg font-semibold text-[#FAFAFA] tabular-nums mt-0.5">
                  ${riskAmount.toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
