import { Link } from 'react-router'
import { PiArrowRight } from 'react-icons/pi'

export function CTASection() {
  return (
    <section className="relative py-20 sm:py-32 lg:py-40 px-4 sm:px-6 bg-[#09090B] overflow-x-clip text-center font-sans">
      {/* ── Bespoke Atmospheric Depth Background ────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src="/brand/cta-ambient-depth.png"
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover opacity-40 select-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/50 to-[#09090B]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090B] via-transparent to-[#09090B]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto space-y-6 sm:space-y-8">
        <div className="space-y-3.5 sm:space-y-4">
          <h2 className="text-[30px] sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#FAFAFA] leading-[1.12] sm:leading-[1.08]">
            Built for conviction.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FAFAFA] via-[#D4D4D8] to-[#71717A]">
              Standing by for the next session.
            </span>
          </h2>
          <p className="text-[14.5px] sm:text-[18px] text-[#A1A1AA] max-w-xl mx-auto leading-relaxed font-normal">
            Configure your risk parameters, connect your Exness MT5 bridge, and execute with institutional precision.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2 sm:pt-4">
          <Link
            to="/register"
            className="w-full sm:w-auto h-12 px-7 sm:px-8 rounded-full bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13.5px] font-semibold flex items-center justify-center gap-2.5 transition-all shadow-[0_0_32px_rgba(255,255,255,0.12)] cursor-pointer"
          >
            <span>Initialize Terminal Access</span>
            <PiArrowRight size={15} />
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto h-12 px-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[#FAFAFA] text-[13.5px] font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>Operator Sign In</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
