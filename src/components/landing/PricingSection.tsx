import { Link } from 'react-router'
import { ArrowRight, Check } from 'lucide-react'

const PLANS = [
  {
    name: 'Free',
    price: '₦0',
    period: 'forever',
    description: 'Learn the system with no risk.',
    highlight: false,
    badge: null,
    features: [
      'Analyst Mode access',
      '1 pre-built strategy',
      'Signals with 5-minute delay',
      'Basic dashboard',
    ],
    cta: 'Start for free',
    to: '/register',
  },
  {
    name: 'Pro',
    price: '₦8,000',
    period: 'per month',
    description: 'Full access for active traders.',
    highlight: true,
    badge: 'Most Popular',
    features: [
      'Real-time signals',
      'All 5 pre-built strategies',
      'All timeframes (1m–1D)',
      'Full risk management tools',
      'Complete signal history',
      'API key connection',
    ],
    cta: 'Start 7-day trial',
    to: '/register',
  },
  {
    name: 'Elite',
    price: '₦20,000',
    period: 'per month',
    description: 'Everything in Pro plus the full power suite.',
    highlight: false,
    badge: null,
    features: [
      'Everything in Pro',
      'Autopilot Mode',
      'Paper Trading',
      'Backtesting engine',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Go Elite',
    to: '/register',
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-16 sm:py-32 px-4 sm:px-6 border-t border-white/[0.05]">
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
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl p-7 border ${
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
              <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#4b5563] mb-4">
                {plan.name}
              </p>

              {/* Price */}
              <div className="flex items-end gap-1.5 mb-1">
                <span className="text-4xl font-extrabold text-white tracking-tight">{plan.price}</span>
                <span className="text-[12px] text-[#374151] mb-1.5">{plan.period}</span>
              </div>

              <p className="text-[12px] text-[#4b5563] mb-7 leading-relaxed">{plan.description}</p>

              {/* CTA */}
              <Link
                to={plan.to}
                className={`inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-100 mb-8 ${
                  plan.highlight
                    ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]'
                }`}
              >
                {plan.cta}
                <ArrowRight size={14} />
              </Link>

              {/* Features */}
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      size={13}
                      className={`mt-0.5 shrink-0 ${plan.highlight ? 'text-[#3b82f6]' : 'text-[#374151]'}`}
                    />
                    <span className="text-[12px] text-[#6b7280] leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-[#374151] mt-8">
          Prices in Nigerian Naira (₦). Pro and Elite include a 7-day free trial. Cancel any time.
        </p>
      </div>
    </section>
  )
}
