import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import ScrollReveal from '@/components/ui/ScrollReveal'

export function HeroSection() {
  return (
    <section className="pt-28 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 max-w-6xl mx-auto overflow-hidden">
      <ScrollReveal>
      {/* Eyebrow */}
      <div className="flex items-center gap-2 mb-6 sm:mb-8">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3b82f6]" />
        </span>
        <span className="text-[12px] sm:text-[13px] text-[#3b82f6] font-medium tracking-tight">
          Phase 1 — Analyst Mode is Live
        </span>
        <ArrowRight size={12} className="text-[#3b82f6]/50 shrink-0" />
      </div>

      {/* Headline */}
      <h1
        className="font-extrabold leading-[1.03] tracking-[-0.03em] text-white mb-5 sm:mb-6"
        style={{ fontSize: 'clamp(2.2rem, 6.5vw, 5rem)' }}
      >
        The intelligence layer
        <br />
        for serious traders.
      </h1>

      {/* Subtext */}
      <p className="text-[0.95rem] sm:text-[1.05rem] text-[#6b7280] max-w-lg mb-8 sm:mb-10 leading-relaxed">
        Five battle-tested strategies running 24/7. Precise entry, stop-loss, and take-profit
        levels delivered in real time — so you always know what to do next.
      </p>

      {/* CTAs */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <Link
          to="/register"
          className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-semibold rounded-lg transition-colors duration-100"
        >
          Get started free
          <ArrowRight size={15} />
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 px-2 py-3 text-[#4b5563] hover:text-white text-sm font-medium transition-colors duration-100"
        >
          Sign in
          <ArrowRight size={13} className="opacity-50" />
        </Link>
      </div>

      <p className="text-[11px] text-[#374151] mt-3">
        Free plan available · No credit card required
      </p>

      {/* Chart */}
      <div className="mt-14 sm:mt-20 relative">
        <div
          className="absolute inset-x-0 -top-10 h-40 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(59,130,246,0.1) 0%, transparent 100%)',
          }}
        />
        <img 
          src="/hero.png" 
          alt="TRAXO Analyst Mode Interface" 
          className="w-full h-auto rounded-xl border border-gray-800 shadow-[0_0_40px_rgba(59,130,246,0.15)] relative z-10"
        />
      </div>
      </ScrollReveal>
    </section>
  )
}
