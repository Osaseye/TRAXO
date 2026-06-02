import { LandingNav } from '@/components/landing/LandingNav'
import { HeroSection } from '@/components/landing/HeroSection'
import { SupportedMarkets } from '@/components/landing/SupportedMarkets'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { CTASection } from '@/components/landing/CTASection'
import { LandingFooter } from '@/components/landing/LandingFooter'

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#070709] text-white overflow-x-hidden">
      <LandingNav />
      <HeroSection />
      <SupportedMarkets />
      <HowItWorks />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
      <LandingFooter />
    </div>
  )
}