import { TrendingUp, Target, Settings } from 'lucide-react'
import riskPlanImg from '../../assets/risk-plan.png'
import chooseStrategyImg from '../../assets/choose-strategy.png'
import signalChartImg from '../../assets/signal-chart.png'
import ScrollReveal from '@/components/ui/ScrollReveal'

// ─── Step 1 Visual ────────────────────────────────────────────────────────
function ConnectVisual() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b0f17] p-1 overflow-hidden">
      <img src={riskPlanImg} alt="Risk Management Setup" className="w-full h-auto rounded-lg" />
    </div>
  )
}

// ─── Step 2 Visual ────────────────────────────────────────────────────────
function StrategyVisual() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b0f17] p-1 overflow-hidden">
      <img src={chooseStrategyImg} alt="Choose your strategy" className="w-full h-auto rounded-lg" />
    </div>
  )
}

// ─── Step 3 Visual ────────────────────────────────────────────────────────
function SignalVisual() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0b0f17] p-1 overflow-hidden">
      <img src={signalChartImg} alt="Signal reasoning and chart" className="w-full h-auto rounded-lg" />
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

const STEPS = [
  {
    number: '01',
    Icon: Settings,
    title: 'Configure Risk Parameters',
    description:
      'Define your risk tolerance, maximum daily loss, and position sizing rules. Keep complete control over your trading parameters.',
    Visual: StrategyVisual,
    position: 'top'
  },
  {
    number: '02',
    Icon: Target,
    title: 'Choose Your Strategy',
    description:
      'Select from multiple algorithmic models with proven track records. Each strategy comes with detailed backtesting metrics and risk profiles.',
    Visual: ConnectVisual,
    position: 'top'
  },
  {
    number: '03',
    Icon: TrendingUp,
    title: 'Live Signal Analysis',
    description:
      'Monitor real-time trading signals with detailed technical analysis, risk ratios, and live chart context. Execute with confidence backed by deep market intelligence.',
    Visual: SignalVisual,
    position: 'bottom'
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-40 px-4 sm:px-6 border-t border-white/[0.05]">
      <ScrollReveal>
      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <div className="mb-16 sm:mb-24 max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#3b82f6] mb-3">
            Analyst Mode
          </p>
          <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold text-white tracking-tight leading-tight">
            How TRAXO works.
          </h2>
          <p className="mt-4 text-[15px] text-[#6b7280] leading-relaxed max-w-2xl">
            No complexity. No guesswork. Our quantitative engine handles the scanning — you handle the execution.
          </p>
        </div>

        {/* Top Row - Two Items */}
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 mb-8 lg:mb-12">
          {STEPS.filter(s => s.position === 'top').map(({ number, Icon, title, description, Visual }) => (
            <div key={number} className="flex flex-col">
              {/* Content Block */}
              <div className="mb-6 sm:mb-8">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6]">
                    <Icon size={20} strokeWidth={1.8} />
                  </div>
                  <span className="text-sm font-bold tracking-[0.14em] text-[#1e293b] font-mono">
                    {number}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-3 leading-snug">{title}</h3>
                <p className="text-[13px] sm:text-sm text-[#6b7280] leading-relaxed">{description}</p>
              </div>

              {/* Image Block - No Card Styling */}
              <div className="flex-1 w-full rounded-xl overflow-hidden">
                <div className="w-full h-full min-h-[240px] sm:min-h-[280px] flex items-center justify-center">
                  <Visual />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Row - Full Width Item */}
        <div className="flex flex-col">
          {STEPS.filter(s => s.position === 'bottom').map(({ number, Icon, title, description, Visual }) => (
            <div key={number}>
              {/* Content Block */}
              <div className="mb-6 sm:mb-8 max-w-2xl">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6]">
                    <Icon size={20} strokeWidth={1.8} />
                  </div>
                  <span className="text-sm font-bold tracking-[0.14em] text-[#1e293b] font-mono">
                    {number}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-3 leading-snug">{title}</h3>
                <p className="text-[13px] sm:text-sm text-[#6b7280] leading-relaxed">{description}</p>
              </div>

              {/* Image Block - Larger, Full Width, No Card */}
              <div className="w-full rounded-xl overflow-hidden">
                <div className="w-full min-h-[320px] sm:min-h-[420px] lg:min-h-[480px] flex items-center justify-center">
                  <Visual />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </ScrollReveal>
    </section>
  )
}
