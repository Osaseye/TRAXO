import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Step {
  id: string
  num: string
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
    <section id="how-it-works" className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden select-none font-sans">
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

      <div className="relative max-w-7xl mx-auto space-y-14">
        {/* Section Header: Clean typography, NO badge container! */}
        <div className="space-y-3">
          <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
            Architectural Workflow
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#FAFAFA]">
            How TRAXO engineers your edge.
          </h2>
          <p className="text-[15px] sm:text-[17px] text-[#A1A1AA] max-w-2xl leading-relaxed font-normal">
            From liquidity detection on institutional timeframes to automated sub-second execution on MT5.
          </p>
        </div>

        {/* Phase Selector Stepper Bar - Open Wire directly on canvas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-b border-white/[0.06] pb-6">
          {STEPS.map((s, idx) => {
            const isSelected = activeStep === idx
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className="text-left group cursor-pointer focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'text-[13px] font-bold transition-colors uppercase tracking-wider',
                      isSelected ? 'text-[#FAFAFA]' : 'text-[#52525B] group-hover:text-[#A1A1AA]'
                    )}
                  >
                    Phase {s.num}
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
                    'text-[15px] font-semibold mt-2.5 transition-colors',
                    isSelected ? 'text-[#FAFAFA]' : 'text-[#71717A] group-hover:text-[#A1A1AA]'
                  )}
                >
                  {s.title}
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
            className="grid lg:grid-cols-12 gap-10 items-center pt-2"
          >
            {/* Left Narrative Column */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-3">
                <span className="text-[12px] text-[#A1A1AA] tracking-wider uppercase font-semibold">
                  Phase {current.num} Protocol
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-[#FAFAFA] tracking-tight leading-snug">
                  {current.tagline}
                </h3>
                <p className="text-[14px] sm:text-[15px] text-[#A1A1AA] leading-relaxed font-normal">
                  {current.detail}
                </p>
              </div>

              {/* Telemetry points in clean, subtle neutral typography (NO generic green boxes!) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
                {current.telemetry.map((t) => (
                  <div key={t.label}>
                    <div className="text-[11px] text-[#71717A] uppercase font-medium">{t.label}</div>
                    <div className="text-[13px] font-semibold text-[#FAFAFA] mt-1">
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
