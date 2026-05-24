import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'

export function CTASection() {
  return (
    <section className="py-16 sm:py-32 px-4 sm:px-6 border-t border-white/[0.05]">
      <div className="max-w-4xl mx-auto text-center relative">
        {/* Background glow */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#3b82f6]/[0.06] rounded-full blur-[80px]" />
        </div>

        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#3b82f6]/20 bg-[#3b82f6]/[0.07] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#3b82f6]">
            Live — start in 60 seconds
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold text-white tracking-tight leading-[1.1] mb-6">
          Stop guessing.
          <br />
          <span className="text-[#6b7280]">Start reading the market.</span>
        </h2>

        <p className="text-[16px] text-[#6b7280] leading-relaxed max-w-lg mx-auto mb-10">
          TRAXO scans every pair, every timeframe, every second — and tells you exactly when a setup is confirmed.
          Free plan. No credit card required.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[14px] font-bold rounded-xl transition-colors duration-150 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)]"
          >
            Get started free
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center px-7 py-3.5 text-[14px] text-[#6b7280] font-medium hover:text-white transition-colors duration-150"
          >
            Already have an account →
          </Link>
        </div>

        {/* Trust line */}
        <p className="mt-8 text-[11px] text-[#374151] tracking-wide">
          Free plan available · Pro from ₦8,000/mo · Cancel any time
        </p>
      </div>
    </section>
  )
}
