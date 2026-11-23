import { motion } from 'framer-motion'
import {
  PiCheck,
  PiCpu,
  PiFlask,
  PiShieldCheck,
  PiArrowsLeftRight,
} from 'react-icons/pi'

interface CapabilityItem {
  id: string
  code: string
  title: string
  description: string
  bullets: string[]
  icon: typeof PiCpu
}

const CAPABILITIES: CapabilityItem[] = [
  {
    id: 'engines',
    code: 'STACK · 01',
    title: '5 Algorithmic Engines',
    description:
      'Unrestricted live execution of Wick Rejection, Breakout Retest, Order Block, Supply & Demand, and Trend Following models.',
    bullets: [
      'No tier paywalls or gated strategy access',
      'Independent session timing and parameter calibration per instrument',
      'Instant mathematical confluence breakdown on every fired setup',
    ],
    icon: PiCpu,
  },
  {
    id: 'shield',
    code: 'STACK · 02',
    title: '9-Point Pre-Trade Risk Shield',
    description:
      'Pre-trade risk enforcement verifying spread thresholds, volatility gates, and max drawdown limits before broker dispatch.',
    bullets: [
      'Real-time spread tolerance and ATR volatility circuit breaker',
      'Daily drawdown hard cap protecting personal and prop firm equity',
      'Automated dynamic lot sizing calculated to sub-pip precision',
    ],
    icon: PiShieldCheck,
  },
  {
    id: 'bridge',
    code: 'STACK · 03',
    title: 'Bi-Directional Exness MT5 Bridge',
    description:
      'Direct, low-latency execution link between your TRAXO analytical station and personal MetaTrader 5 account.',
    bullets: [
      'Sub-40ms execution latency with bracketed stop-loss and tiered take-profits',
      'Real-time position tracking and automated break-even movement',
      'Zero third-party data broker intercept',
    ],
    icon: PiArrowsLeftRight,
  },
  {
    id: 'lab',
    code: 'STACK · 04',
    title: 'Walk-Forward Quantitative Lab',
    description:
      'Stress-test every strategy parameter against historical tick data before risking operational capital in live market conditions.',
    bullets: [
      'Out-of-sample walk-forward equity curves and max drawdown analysis',
      'Expectancy, win-rate, and Sharpe ratio reporting',
      'Adaptive tuning feedback integrated into the live execution feed',
    ],
    icon: PiFlask,
  },
]

export function PricingSection() {
  return (
    <section id="stack" className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 bg-[#09090B] overflow-x-clip font-sans">
      {/* ── Background Coordinate Grid ──────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-10 sm:space-y-14">
        {/* Header: Clean Plus Jakarta Sans, NO CONTAINER BADGE! */}
        <div className="space-y-3 max-w-2xl">
          <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
            Full Stack Capability
          </p>
          <h2 className="text-[28px] sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12]">
            All systems online. Zero tiered paywalls.
          </h2>
          <p className="text-[14.5px] sm:text-[17px] text-[#A1A1AA] leading-relaxed font-normal">
            TRAXO is engineered as a complete personal quantitative desk. Every engine, risk guardrail, and MT5 bridge feature ships ready on day one.
          </p>
        </div>

        {/* Open Architecture Grid: No Boxed Cards! */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 sm:gap-y-10 border-t border-white/[0.06] pt-8 sm:pt-10">
          {CAPABILITIES.map((cap, idx) => {
            const Icon = cap.icon
            return (
              <motion.div
                key={cap.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.05 }}
                transition={{ duration: 0.45, delay: idx * 0.08 }}
                className="space-y-3.5 sm:space-y-4 pb-7 sm:pb-8 border-b border-white/[0.06] last:border-b-0 last:pb-0 md:last:border-b md:last:pb-8"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium tracking-wider text-[#71717A] uppercase">
                    {cap.code}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FAFAFA]">
                    <Icon size={16} />
                  </div>
                </div>

                <div>
                  <h3 className="text-[19px] sm:text-xl font-bold text-[#FAFAFA] tracking-tight">{cap.title}</h3>
                  <p className="text-[13.5px] sm:text-[14px] text-[#71717A] mt-1.5 leading-relaxed font-normal">{cap.description}</p>
                </div>

                <div className="space-y-2 pt-1 sm:pt-2">
                  {cap.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-2.5 text-[13px] text-[#A1A1AA] leading-relaxed">
                      <PiCheck size={14} className="text-[#34D399] shrink-0 mt-0.5" />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
