import { useState } from 'react'
import { Link } from 'react-router'
import { PiArrowRight } from 'react-icons/pi'
import { cn } from '@/lib/utils'

interface RuleModule {
  id: string
  label: string
  category: string
  description: string
  weight: string
}

const MODULAR_RULES: RuleModule[] = [
  {
    id: 'wick',
    label: 'Rejection Wick Depth',
    category: 'PRICE ACTION',
    description: 'Require upper or lower shadow to exceed 60% of candle body range.',
    weight: '+3.0 Pts',
  },
  {
    id: 'sweep',
    label: 'Session Liquidity Sweep',
    category: 'MARKET STRUCTURE',
    description: 'Validate penetration beyond previous Asian or London session extremes.',
    weight: '+2.5 Pts',
  },
  {
    id: 'ob',
    label: 'H4 Order Block Mitigation',
    category: 'INSTITUTIONAL FLOW',
    description: 'Enforce higher-timeframe fair value gap and order block alignment.',
    weight: '+2.5 Pts',
  },
  {
    id: 'spread',
    label: 'Dynamic ATR Spread Shield',
    category: 'RISK FILTER',
    description: 'Halt execution if broker spread exceeds 15% of current 14-period ATR.',
    weight: 'PASS/FAIL',
  },
]

export function CustomEngineSection() {
  const [activeModule, setActiveModule] = useState(MODULAR_RULES[0].id)

  return (
    <section id="custom-engine" className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 bg-[#09090B] overflow-x-clip font-sans">
      {/* ── Background Coordinate Grid ──────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="absolute top-1/2 right-1/4 w-[700px] h-[350px] bg-gradient-to-l from-[#34D399]/10 to-transparent blur-3xl rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-10 sm:space-y-14">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 sm:gap-6 pb-1 sm:pb-2">
          <div className="max-w-2xl space-y-3">
            <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Engine Studio
            </p>
            <h2 className="text-[28px] sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12]">
              Create your own custom quantitative engines.
            </h2>
            <p className="text-[14.5px] sm:text-[17px] text-[#A1A1AA] leading-relaxed font-normal">
              Combine structural rules, liquidity filters, and ATR volatility parameters into your own automated execution models.
            </p>
          </div>

          <Link
            to="/strategies"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 sm:h-11 px-6 rounded-full bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13.5px] font-semibold transition-all shadow-[0_0_24px_rgba(255,255,255,0.08)] sm:self-start md:self-auto cursor-pointer shrink-0"
          >
            <span>Launch Engine Studio</span>
            <PiArrowRight size={14} />
          </Link>
        </div>

        {/* Studio Preview Showcase */}
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Modular Rule Palette */}
          <div className="order-2 lg:order-1 lg:col-span-5 space-y-2.5 sm:space-y-3">
            <div className="text-[12px] uppercase text-[#71717A] tracking-wider font-semibold mb-2">
              Confluence Rule Modules
            </div>

            {MODULAR_RULES.map((mod) => {
              const isSelected = activeModule === mod.id
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveModule(mod.id)}
                  className={cn(
                    'w-full p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer text-left min-h-[44px]',
                    isSelected
                      ? 'bg-white/[0.06] border-white/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]'
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.03]'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-[#FAFAFA]">{mod.label}</span>
                    <span className="text-[11px] font-mono text-[#34D399] font-medium shrink-0">{mod.weight}</span>
                  </div>
                  <p className="text-[12.5px] text-[#A1A1AA] mt-1 leading-relaxed">
                    {mod.description}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Visual Interface - Anchors the section first on mobile */}
          <div className="order-1 lg:order-2 lg:col-span-7 relative">
            <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_32px_100px_rgba(0,0,0,0.85)]">
              <img
                src="/brand/custom-engine-builder.png"
                alt="TRAXO Custom Algorithmic Engine Studio"
                loading="lazy"
                decoding="async"
                className="w-full aspect-[16/10] object-cover opacity-90"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-transparent opacity-60" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
