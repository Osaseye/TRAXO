// Icons removed — not used in this component
import entryAnalysisImg from '../../assets/entry.png'
import riskPlanImg from '../../assets/choose-strategy.png'
import strategiesLibraryImg from '../../assets/risk-plan.png'
import signalChartImg from '../../assets/explanation.png'
import NewsImg from '../../assets/NEWs.png'
import journalDayImg from '../../assets/journal-day.png'
import ScrollReveal from '@/components/ui/ScrollReveal'

// Mini visual previews used inside feature cards

function SignalPreview() {
  return (
    <div className="w-full h-full rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <img src={entryAnalysisImg} alt="Signal and Entry Analysis" className="w-full h-full object-cover" />
    </div>
  )
}

function RiskPreview() {
  return (
    <div className="w-full h-full rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <img src={riskPlanImg} alt="Risk management profile" className="w-full h-full object-cover" />
    </div>
  )
}

function StrategyPreview() {
  return (
    <div className="w-full h-full rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <img src={strategiesLibraryImg} alt="Strategy control library" className="w-full h-full object-cover" />
    </div>
  )
}

function ReasoningPreview() {
  return (
    <div className="w-full h-full rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <img src={signalChartImg} alt="Reasoning and signal chart" className="w-full h-full object-cover" />
    </div>
  )
}

function MarketAwarenessPreview() {
  return (
    <div className="w-full h-full rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <img src={NewsImg} alt="Market awareness" className="w-full h-full object-cover" />
    </div>
  )
}

function JournalPreview() {
  return (
    <div className="w-full h-full rounded-lg border border-white/[0.07] bg-[#0b0f17] overflow-hidden">
      <img src={journalDayImg} alt="Trading journal" className="w-full h-full object-cover" />
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
  {
    tag: 'Market Awareness',
    title: 'Context-aware\ntrading decisions.',
    body: 'TRAXO integrates live news, economic events, and market sentiment data into your decision-making process. Know what\'s moving the market and how it impacts your signals—trading with full market awareness, not blind assumptions.',
    visual: <MarketAwarenessPreview />,
  },
  {
    tag: 'Trading Journal',
    title: 'Log trades.\nLearn faster.',
    body: 'Capture trade entries, outcomes, and reasoning in one place so you can measure edge, iterate on setups, and improve with evidence.',
    visual: <JournalPreview />,
  },
]

export function FeaturesSection() {
  return (
    <section className="py-16 sm:py-32 px-4 sm:px-6 max-w-6xl mx-auto">
      <ScrollReveal>
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

            {/* Visual side - Bolder, Bigger - FILLS CONTAINER */}
            <div className={`bg-[#0b0f17] p-0 flex items-stretch ${i % 2 === 1 ? 'md:[direction:ltr]' : ''}`}>
              <div className="w-full h-full">
                {f.visual}
              </div>
            </div>
          </div>
        ))}
      </div>

      </ScrollReveal>

    </section>
  )
}
