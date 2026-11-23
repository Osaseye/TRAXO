import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { PiArrowRight, PiPlay } from 'react-icons/pi';
import { HeroLiveMockup, type HeroPairId } from './HeroLiveMockup';

export function HeroSection() {
  const [activePair, setActivePair] = useState<HeroPairId>('XAUUSD');

  return (
    <section className="relative pt-28 sm:pt-40 lg:pt-44 pb-20 sm:pb-28 px-4 sm:px-6 overflow-x-clip font-sans">
      {/* Subtle Ambient Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="hidden sm:block absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.02] to-transparent blur-3xl rounded-full" />
      </div>

      {/* Main Open-Canvas Hero Content */}
      <div className="relative z-20 max-w-6xl mx-auto space-y-14 sm:space-y-20">
        {/* Editorial Headline + Primary Actions */}
        <div className="text-center max-w-3xl mx-auto space-y-6 sm:space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4 sm:space-y-5"
          >
            <h1 className="text-[36px] sm:text-5xl md:text-6xl lg:text-[68px] font-bold tracking-tight text-[#FAFAFA] leading-[1.08] sm:leading-[1.05]">
              Real market edge.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FAFAFA] via-[#D4D4D8] to-[#71717A]">
                Zero floating noise.
              </span>
            </h1>
            <p className="text-[15.5px] sm:text-[18px] text-[#A1A1AA] leading-relaxed max-w-2xl mx-auto font-normal">
              Institutional price action delivered directly to your screen with mathematical confluence,
              exact entry, stop-loss, take-profit, and instant Exness MT5 execution.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4"
          >
            <Link
              to="/register"
              className="w-full sm:w-auto h-12 px-7 sm:px-8 rounded-full bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13.5px] font-semibold flex items-center justify-center gap-2.5 transition-all shadow-[0_0_32px_rgba(255,255,255,0.12)] cursor-pointer touch-manipulation"
            >
              <span>Initialize Workspace</span>
              <PiArrowRight size={15} />
            </Link>
            <Link
              to="/dashboard"
              className="w-full sm:w-auto h-12 px-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[#FAFAFA] text-[13.5px] font-medium flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation"
            >
              <PiPlay size={14} className="text-[#FAFAFA]" />
              <span>Explore Live Terminal</span>
            </Link>
          </motion.div>
        </div>

        {/* Floating Live Animated Execution Sequence */}
        <HeroLiveMockup activePair={activePair} onSelectPair={setActivePair} />
      </div>
    </section>
  );
}
