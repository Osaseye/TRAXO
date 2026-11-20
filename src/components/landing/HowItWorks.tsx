import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Step {
  id: string
  num: string
  shortLabel: string
  title: string
  tagline: string
  detail: string
  image: string
  telemetry: { label: string; val: string }[]
}

const STEPS: Step[] = [
  {
    id: 'detection',
    num: '01',
    shortLabel: 'Order Flow',
    title: 'Multi-Timeframe Order Flow Mapping',
    tagline: 'Higher timeframe liquidity sweeps and fair value gaps.',
    detail:
      'TRAXO tracks institutional liquidity pools on H4 and H1 before monitoring execution timeframes (M15 / M5). Signals fire only when structural bias, session timing (London / NY Open), and volume expansion align.',
    image: '/brand/strategy-order-block.png',
    telemetry: [
      { label: 'Higher Timeframe Bias', val: 'H4 Bullish Trend' },
      { label: 'Mitigation Level', val: 'M15 Order Block + FVG' },
      { label: 'Confluence Score', val: '9.2 / 10' },
    ],
  },
  {
    id: 'guardrails',
    num: '02',
    shortLabel: 'Risk Gates',
    title: '9-Point Pre-Trade Risk Verification',
    tagline: 'Zero execution without passing quantitative gates.',
    detail:
      'Before any setup touches your terminal, the 9-point risk circuit breaker verifies live spread tolerance, daily drawdown ceiling, news release windows, and automated lot sizing down to sub-pip precision.',
    image: '/brand/strategy-wick-rejection.png',
    telemetry: [
      { label: 'Spread Threshold', val: 'Under 1.2 Pips' },
      { label: 'Drawdown Protection', val: '0.4% / 3.0% Max' },
      { label: 'Risk Sizing', val: '1.0% Fixed per Setup' },
    ],
  },
  {
    id: 'execution',
    num: '03',
    shortLabel: 'MT5 Routing',
    title: 'Direct Exness MT5 Routing & Ledger',
    tagline: 'Sub-40ms execution with automated journal logging.',
    detail:
      'Verified setups execute directly to your MT5 account with bracketed stop-loss and tiered take-profit orders. Every fill, partial take-profit, and journal outcome is recorded in your live analytics ledger.',
    image: '/brand/phase3-execution-mt5.png',
    telemetry: [
      { label: 'Execution Speed', val: '34ms Low Latency' },
      { label: 'Direct Access', val: 'DMA Bridge Protocol' },
      { label: 'Trade Journal', val: 'Synchronized Ledger' },
    ],
  },
]

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0)
  const current = STEPS[activeStep]

  return (
    <section id="how-it-works" className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 overflow-hidden select-none font-sans">
      {/* ── Ambient Background Canvas ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[700px] h-[400px] bg-gradient-to-r from-[#34D399]/10 to-transparent blur-3xl rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-10 sm:space-y-14">
        {/* Section Header: Clean typography, NO badge container! */}
        <div className="space-y-3">
          <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
            Architectural Workflow
          </p>
          <h2 className="text-[28px] sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12]">
            How TRAXO engineers your edge.
          </h2>
          <p className="text-[14.5px] sm:text-[17px] text-[#A1A1AA] max-w-2xl leading-relaxed font-normal">
            From liquidity detection on institutional timeframes to automated sub-second execution on MT5.
          </p>
        </div>

        {/* Phase Selector Stepper Bar - Compact 3-up on mobile, editorial 3-col on md+ */}
        <div className="grid grid-cols-3 gap-2.5 md:gap-6 pt-1 sm:pt-2 border-b border-white/[0.06] pb-5 sm:pb-6">
          {STEPS.map((s, idx) => {
            const isSelected = activeStep === idx
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className="text-left group cursor-pointer focus:outline-none min-h-[44px] py-1"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <span
                    className={cn(
                      'text-[11.5px] md:text-[13px] font-bold transition-colors uppercase tracking-wider shrink-0',
                      isSelected ? 'text-[#FAFAFA]' : 'text-[#52525B] group-hover:text-[#A1A1AA]'
                    )}
                  >
                    <span className="md:hidden">{s.num}</span>
                    <span className="hidden md:inline">Phase {s.num}</span>
                  </span>
                  <div
                    className={cn(
                      'h-[2px] flex-1 rounded-full transition-all duration-300',
                      isSelected ? 'bg-[#FAFAFA]' : 'bg-white/[0.06] group-hover:bg-white/[0.12]'
                    )}
                  />
                </div>
                <div
                  className={cn(
                    'text-[12.5px] md:text-[15px] font-semibold mt-2 md:mt-2.5 transition-colors leading-snug',
                    isSelected ? 'text-[#FAFAFA]' : 'text-[#71717A] group-hover:text-[#A1A1AA]'
                  )}
                >
                  <span className="md:hidden">{s.shortLabel}</span>
                  <span className="hidden md:inline">{s.title}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Active Phase Display - Open Canvas Layout */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid lg:grid-cols-12 gap-7 lg:gap-10 items-center pt-1 sm:pt-2"
          >
            {/* Left Narrative Column */}
            <div className="lg:col-span-5 space-y-5 sm:space-y-6">
              <div className="space-y-2.5 sm:space-y-3">
                <span className="text-[11.5px] sm:text-[12px] text-[#A1A1AA] tracking-wider uppercase font-semibold">
                  Phase {current.num} · <span className="md:hidden">{current.title}</span><span className="hidden md:inline">Protocol</span>
                </span>
                <h3 className="text-[22px] sm:text-3xl font-bold text-[#FAFAFA] tracking-tight leading-snug">
                  {current.tagline}
                </h3>
                <p className="text-[14px] sm:text-[15px] text-[#A1A1AA] leading-relaxed font-normal">
                  {current.detail}
                </p>
              </div>

              {/* Telemetry points: scannable key-value rows on mobile, 3-col grid on sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y divide-white/[0.06] sm:divide-y-0 sm:gap-4 pt-3 sm:pt-4 border-t border-white/[0.06]">
                {current.telemetry.map((t) => (
                  <div key={t.label} className="flex items-center justify-between gap-3 py-2.5 sm:block sm:py-0">
                    <div className="text-[11px] text-[#71717A] uppercase font-medium">{t.label}</div>
                    <div className="text-[13px] font-semibold text-[#FAFAFA] sm:mt-1 text-right sm:text-left">
                      {t.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Schematic Visual - Blends directly into canvas */}
            <div className="lg:col-span-7 relative">
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_32px_90px_rgba(0,0,0,0.8)]">
                <img
                  src={current.image}
                  alt={current.title}
                  className="w-full aspect-[16/10] object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-transparent opacity-60" />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
