import { LandingNav } from '@/components/landing/LandingNav'
import { LandingBackgroundAnimation } from '@/components/landing/LandingBackgroundAnimation'
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
    <div className="relative min-h-screen bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden selection:bg-white/20 selection:text-[#FAFAFA]">
      {/* ── Minimalist Full-Page Kinetic Market Background Canvas ──────────── */}
      <LandingBackgroundAnimation />

      <LandingNav />
      <main className="relative z-10">
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
    </div>
  )
}
