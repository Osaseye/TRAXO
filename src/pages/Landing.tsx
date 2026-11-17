import { Link } from 'react-router'
import { PiArrowRight } from 'react-icons/pi'
import { LandingNav } from '@/components/landing/LandingNav'
import { HeroSection } from '@/components/landing/HeroSection'
import { SupportedMarkets } from '@/components/landing/SupportedMarkets'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { CustomEngineSection } from '@/components/landing/CustomEngineSection'
import { ProductPreview } from '@/components/landing/ProductPreview'
import { PricingSection } from '@/components/landing/PricingSection'
import { StatsBar } from '@/components/landing/StatsBar'
import { CTASection } from '@/components/landing/CTASection'
import { LandingFooter } from '@/components/landing/LandingFooter'

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden selection:bg-white/20 selection:text-[#FAFAFA]">
      <LandingNav />
      <main className="pb-16 md:pb-0">
        <HeroSection />
        <SupportedMarkets />
        <HowItWorks />
        <FeaturesSection />
        <CustomEngineSection />
        <ProductPreview />
        <PricingSection />
        <StatsBar />
        <CTASection />
      </main>
      <LandingFooter />

      {/* ── Mobile Floating Glassmorphism Pill (NO BOX ON ICON) ─────────────── */}
      <div className="md:hidden fixed bottom-5 inset-x-0 z-50 px-4 pointer-events-none flex justify-center font-sans">
        <nav
          aria-label="Mobile quick actions"
          className="pointer-events-auto h-12 px-4 rounded-full bg-[#09090B]/85 backdrop-blur-2xl border border-white/[0.12] shadow-[0_16px_48px_rgba(0,0,0,0.8)] flex items-center justify-between gap-4 w-full max-w-[340px]"
        >
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/traxo-mark.png" alt="TRAXO" className="w-5 h-5 object-contain" />
            <span className="text-[11.5px] font-bold tracking-wider uppercase text-[#FAFAFA]">TRAXO</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] px-2.5 py-1"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#FAFAFA] text-[#09090B] text-[12px] font-semibold hover:bg-[#E4E4E7] transition-colors"
            >
              <span>Launch</span>
              <PiArrowRight size={12} />
            </Link>
          </div>
        </nav>
      </div>
    </div>
  )
}
