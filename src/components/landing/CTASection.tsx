import { Link } from 'react-router'
import { ArrowRight, TrendingUp, BarChart3, Zap } from 'lucide-react'
import ScrollReveal from '@/components/ui/ScrollReveal'

export function CTASection() {
  return (
    <section className="relative border-t border-white/[0.05] bg-[#09090d] px-4 sm:px-6 py-20 sm:py-32 overflow-hidden">
      <ScrollReveal>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_30%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-0 border-y border-white/[0.08]">
          <div className="py-10 sm:py-14 lg:py-16 pr-0 md:pr-10 border-b md:border-b-0 md:border-r border-white/[0.08] flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 w-fit px-3.5 py-1.5 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/[0.08] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#3b82f6]">
                Live in 60 seconds
              </span>
            </div>

            <h2 className="text-[clamp(2.2rem,5vw,4.4rem)] font-black text-white tracking-tight leading-[0.95] max-w-xl">
              Stop guessing.
              <br />
              Start reading markets.
            </h2>

            <p className="mt-5 text-[14px] sm:text-[15px] text-[#94a3b8] leading-relaxed max-w-lg">
              TRAXO scans every pair, every timeframe, every second. Get precise, actionable signals backed by quantitative analysis, risk controls, and plain-language reasoning.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#09090d] text-[14px] font-semibold rounded-full transition-transform duration-150 hover:-translate-y-0.5"
              >
                Get started free
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center px-7 py-3.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[14px] text-[#cbd5e1] hover:text-white transition-colors duration-150"
              >
                 Already have an account
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2 text-[11px] text-[#94a3b8]">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">Free plan</span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">Pro from ₦8,000/mo</span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">Cancel anytime</span>
            </div>
          </div>

          <div className="relative min-h-[320px] py-10 sm:py-14 lg:py-16 pl-0 md:pl-10 flex items-center justify-center">
            <div className="absolute top-6 right-6 h-24 w-24 rounded-full bg-[#3b82f6]/[0.12] blur-3xl" />
            <div className="absolute bottom-6 left-6 h-28 w-28 rounded-full bg-[#3b82f6]/[0.08] blur-3xl" />

            <div className="relative z-10 w-full max-w-md border border-white/[0.08] bg-[#070b12] p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#64748b]">Signal preview</p>
                  <p className="text-sm font-semibold text-white mt-1">EUR/USD breakout confirmation</p>
                </div>
                <div className="inline-flex items-center gap-1.5 border border-[#10b981]/25 bg-[#10b981]/[0.08] px-3 py-1 text-[11px] font-semibold text-[#34d399]">
                  <Zap size={12} />
                  Active
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 border border-white/[0.06] bg-[#090d14] p-3">
                  <TrendingUp size={16} className="text-[#10b981] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-[#64748b]">Bias</p>
                    <p className="text-[13px] font-medium text-white">Bullish continuation</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 border border-white/[0.06] bg-[#090d14] p-3">
                  <BarChart3 size={16} className="text-[#3b82f6] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-[#64748b]">Confidence</p>
                    <p className="text-[13px] font-medium text-white">84% with 3 confluences</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="border border-white/[0.06] bg-[#090d14] p-3">
                    <p className="text-[10px] text-[#64748b] uppercase tracking-[0.14em]">Entry</p>
                    <p className="mt-2 text-[13px] font-semibold text-white">1.0924</p>
                  </div>
                  <div className="border border-white/[0.06] bg-[#090d14] p-3">
                    <p className="text-[10px] text-[#64748b] uppercase tracking-[0.14em]">Stop</p>
                    <p className="mt-2 text-[13px] font-semibold text-white">1.0898</p>
                  </div>
                  <div className="border border-white/[0.06] bg-[#090d14] p-3">
                    <p className="text-[10px] text-[#64748b] uppercase tracking-[0.14em]">Target</p>
                    <p className="mt-2 text-[13px] font-semibold text-white">1.0980</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </ScrollReveal>
    </section>
  )
}
