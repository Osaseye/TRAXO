import { Link } from 'react-router'
import { ArrowRight, Check, Globe2, Rocket, ShieldCheck, Signal, Wallet } from 'lucide-react'
import ScrollReveal from '@/components/ui/ScrollReveal'

const PLANS = [
  {
    name: 'Free',
    price: '₦0',
    period: 'forever',
    description: 'Learn the system with no risk and track the core Analyst Mode flow.',
    highlight: false,
    badge: null,
    features: [
      'Analyst Mode access',
      '1 pre-built strategy',
      'Signals with 5-minute delay',
      'Basic dashboard',
      'Forex + crypto market coverage',
    ],
    cta: 'Start for free',
    to: '/register',
  },
  {
    name: 'Pro',
    price: '₦8,000',
    period: 'per month',
    description: 'Full access for active traders who want more signal depth and faster context.',
    highlight: true,
    badge: 'Most Popular',
    features: [
      'Real-time signals',
      'All 5 pre-built strategies',
      'All timeframes (1m–1D)',
      'Full risk management tools',
      'Complete signal history',
      'API key connection',
      'Market filter for forex, gold, BTC, ETH, and majors',
    ],
    cta: 'Start 7-day trial',
    to: '/register',
  },
  {
    name: 'Elite',
    price: '₦20,000',
    period: 'per month',
    description: 'Everything in Pro plus the automation and portfolio intelligence layer.',
    highlight: false,
    badge: null,
    features: [
      'Everything in Pro',
      'Autopilot Mode',
      'Paper Trading',
      'Backtesting engine',
      'Advanced analytics',
      'Priority support',
      'Execution guardrails and compliance logs',
    ],
    cta: 'Go Elite',
    to: '/register',
  },
]

const MARKET_TAGS = ['Forex majors', 'Gold (XAU)', 'Bitcoin', 'Ethereum', 'BNB', 'Indices', 'Commodities']

const AUTOPILOT_POINTS = [
  {
    icon: <Rocket size={14} />,
    title: 'Guided execution',
    body: 'Autopilot only routes setups that meet your active risk and strategy rules.',
  },
  {
    icon: <ShieldCheck size={14} />,
    title: 'Guardrails first',
    body: 'Daily loss caps, trade caps, and market-event filters stay enforced at every step.',
  },
  {
    icon: <Wallet size={14} />,
    title: 'Wallet aware',
    body: 'Position sizing adapts to balance, risk per trade, and the market you are trading.',
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-16 sm:py-32 px-4 sm:px-6 border-t border-white/[0.05]">
      <ScrollReveal>
      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <div className="mb-10 sm:mb-16 max-w-xl">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#3b82f6] mb-3">
            Pricing
          </p>
          <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold text-white tracking-tight leading-tight">
            One platform.
            <br />
            Choose your pace.
          </h2>
          <p className="mt-4 text-[13px] text-[#94a3b8] leading-relaxed">
            Free covers the learning loop. Pro adds live signal coverage and broader market context. Elite layers in Autopilot, paper trading, and the execution controls we will expand next.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl p-6 border ${
                plan.highlight
                  ? 'border-[#3b82f6]/40 bg-[#0d1626]'
                  : 'border-white/[0.07] bg-[#09090d]'
              }`}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-[#3b82f6] text-white tracking-wide">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan name */}
              <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#4b5563] mb-3">
                {plan.name}
              </p>

              {/* Price */}
              <div className="flex items-end gap-1.5 mb-1">
                <span className="text-3xl font-extrabold text-white tracking-tight">{plan.price}</span>
                <span className="text-[12px] text-[#374151] mb-1">{plan.period}</span>
              </div>

              <p className="text-[12px] text-[#4b5563] mb-6 leading-relaxed">{plan.description}</p>

              {/* CTA */}
              <Link
                to={plan.to}
                className={`inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-colors duration-100 mb-6 w-full ${
                  plan.highlight
                    ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]'
                }`}
              >
                {plan.cta}
                <ArrowRight size={14} />
              </Link>

              {/* Features - Compact */}
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      size={12}
                      className={`mt-0.5 shrink-0 ${plan.highlight ? 'text-[#3b82f6]' : 'text-[#374151]'}`}
                    />
                    <span className="text-[11px] text-[#6b7280] leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              {/* Market coverage badge - Compact */}
              {plan.name === 'Pro' && (
                <div className="mt-5 pt-5 border-t border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#93c5fd] mb-2">
                    <Globe2 size={12} />
                    Market coverage
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {MARKET_TAGS.slice(0, 5).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-[#0b0f17] border border-white/[0.08] text-[10px] text-[#cbd5e1]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Autopilot preview - Compact */}
              {plan.name === 'Elite' && (
                <div className="mt-5 pt-5 border-t border-white/[0.05] space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fca5a5]">
                    <Signal size={12} />
                    Autopilot
                  </div>
                  <div className="space-y-1.5">
                    {AUTOPILOT_POINTS.map((item) => (
                      <div key={item.title} className="flex items-start gap-2">
                        <span className="mt-0.5 text-[#93c5fd]">{item.icon}</span>
                        <div>
                          <p className="text-[11px] font-semibold text-white">{item.title}</p>
                          <p className="text-[10px] text-[#94a3b8] leading-snug">{item.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/[0.06] bg-[#0b0f17] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Rocket size={16} className="text-[#93c5fd]" />
            <p className="text-[13px] font-semibold text-white">Autopilot roadmap</p>
          </div>
          <p className="mt-2 text-[12px] text-[#94a3b8] max-w-3xl leading-relaxed">
            Autopilot will be the execution layer for Elite: it will read the active strategy stack, respect your risk budget, watch the market type, and only route approved setups when the conditions and session filters line up.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {AUTOPILOT_POINTS.map((item) => (
              <div key={item.title} className="rounded-xl border border-white/[0.08] bg-[#09090d] p-4">
                <div className="flex items-center gap-2 text-[#93c5fd]">
                  {item.icon}
                  <p className="text-[12px] font-semibold text-white">{item.title}</p>
                </div>
                <p className="mt-2 text-[11px] text-[#94a3b8] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-[#374151] mt-8">
          Prices in Nigerian Naira (₦). Pro and Elite include a 7-day free trial. Cancel any time.
        </p>
      </div>
      </ScrollReveal>
    </section>
  )
}
