import { useState } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PiArrowRight,
  PiCrosshair,
  PiPlay,
} from 'react-icons/pi'
import { cn } from '@/lib/utils'

type PairId = 'EURUSD' | 'XAUUSD' | 'NAS100'

interface PairSetup {
  id: PairId
  label: string
  shortLabel: string
  direction: 'Buy Limit' | 'Sell Limit'
  engine: string
  session: string
  entry: string
  stopLoss: string
  takeProfit: string
  rr: string
  lots: string
  confidence: string
  spread: string
  reason: string
}

const PAIR_SETUPS: Record<PairId, PairSetup> = {
  EURUSD: {
    id: 'EURUSD',
    label: 'EUR/USD',
    shortLabel: 'EUR/USD',
    direction: 'Buy Limit',
    engine: 'Order Block & Liquidity Sweep',
    session: 'London Session',
    entry: '1.08420',
    stopLoss: '1.08280',
    takeProfit: '1.08840',
    rr: '1 : 3.0',
    lots: '0.71',
    confidence: '92%',
    spread: '0.1 pips',
    reason: 'H4 Bullish Order Block mitigation following Asian range low liquidity sweep. Confluence score 9.2/10.',
  },
  XAUUSD: {
    id: 'XAUUSD',
    label: 'XAU/USD Gold',
    shortLabel: 'XAU/USD',
    direction: 'Buy Limit',
    engine: 'Wick Rejection Reversal',
    session: 'NY Open',
    entry: '2,648.50',
    stopLoss: '2,641.00',
    takeProfit: '2,671.00',
    rr: '1 : 3.0',
    lots: '0.13',
    confidence: '89%',
    spread: '0.8 pips',
    reason: '68% lower rejection wick through previous session high-volume node. Instant displacement confirmation.',
  },
  NAS100: {
    id: 'NAS100',
    label: 'NAS100 Index',
    shortLabel: 'NAS100',
    direction: 'Sell Limit',
    engine: 'Breakout Retest Engine',
    session: 'NY Session',
    entry: '20,418.2',
    stopLoss: '20,468.2',
    takeProfit: '20,278.2',
    rr: '1 : 2.8',
    lots: '0.20',
    confidence: '91%',
    spread: '1.0 pts',
    reason: 'Clean consolidation breakdown below 20,420 support with volume expansion. Limit retest executed.',
  },
}

const PAIRS: PairId[] = ['EURUSD', 'XAUUSD', 'NAS100']

export function HeroSection() {
  const [activePair, setActivePair] = useState<PairId>('EURUSD')
  const setup = PAIR_SETUPS[activePair]
  const isBuy = setup.direction === 'Buy Limit'

  return (
    <section className="relative min-h-[82vh] sm:min-h-[88vh] pt-24 sm:pt-36 lg:pt-40 pb-14 sm:pb-20 px-4 sm:px-6 overflow-hidden select-none font-sans">
      {/* ── Ambient Background Canvas: Subtle Candlesticks & Vignette ──────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] bg-gradient-to-tr from-[#34D399]/10 via-white/[0.02] to-transparent blur-3xl rounded-full" />
        <div className="absolute top-2/3 right-10 w-[500px] h-[350px] bg-white/[0.02] blur-3xl rounded-full" />

        {/* Ambient Candlestick trajectory wicks */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="26%" x2="100%" y2="26%" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 8" />
          <line x1="0" y1="55%" x2="100%" y2="55%" stroke="rgba(52,211,153,0.1)" strokeDasharray="3 10" />

          <g>
            <line x1="12%" y1="18%" x2="12%" y2="44%" stroke="#34D399" strokeWidth="1" />
            <rect x="calc(12% - 3px)" y="25%" width="6" height="11%" fill="#34D399" rx="1" opacity="0.4" />
            <line x1="24%" y1="36%" x2="24%" y2="62%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect x="calc(24% - 3px)" y="43%" width="6" height="9%" fill="#27272A" rx="1" />
            <line x1="76%" y1="16%" x2="76%" y2="54%" stroke="#34D399" strokeWidth="1.5" />
            <rect x="calc(76% - 3.5px)" y="24%" width="7" height="19%" fill="#34D399" rx="1" opacity="0.35" />
          </g>

          <path
            d="M 40 380 Q 280 340 520 400 T 960 310 T 1500 240"
            fill="none"
            stroke="url(#heroGrad)"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
          <defs>
            <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="#34D399" stopOpacity="0.25" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ── Main Open-Canvas Hero Content ───────────────────────────────────── */}
      <div className="relative max-w-7xl mx-auto space-y-10 sm:space-y-14">
        {/* Editorial Headline directly on canvas */}
        <div className="text-center max-w-3xl mx-auto space-y-5 sm:space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-3.5 sm:space-y-4"
          >
            <h1 className="text-[34px] sm:text-5xl md:text-6xl lg:text-[68px] font-bold tracking-tight text-[#FAFAFA] leading-[1.08] sm:leading-[1.05]">
              Real market edge.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FAFAFA] via-[#D4D4D8] to-[#71717A]">
                Zero floating noise.
              </span>
            </h1>
            <p className="text-[15px] sm:text-[18px] text-[#A1A1AA] leading-relaxed max-w-2xl mx-auto font-normal">
              Institutional price action delivered directly to your screen with mathematical confluence,
              exact entry, stop-loss, take-profit, and instant Exness MT5 execution.
            </p>
          </motion.div>

          {/* Action buttons (Clean typography, NO wire React icon!) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-1 sm:pt-2"
          >
            <Link
              to="/register"
              className="w-full sm:w-auto h-12 px-7 sm:px-8 rounded-full bg-[#FAFAFA] hover:bg-[#E4E4E7] active:scale-[0.99] text-[#09090B] text-[13.5px] font-semibold flex items-center justify-center gap-2.5 transition-all shadow-[0_0_32px_rgba(255,255,255,0.12)] cursor-pointer"
            >
              <span>Initialize Workspace</span>
              <PiArrowRight size={15} />
            </Link>
            <Link
              to="/dashboard"
              className="w-full sm:w-auto h-12 px-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[#FAFAFA] text-[13.5px] font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <PiPlay size={14} className="text-[#FAFAFA]" />
              <span>Explore Live Terminal</span>
            </Link>
          </motion.div>
        </div>

        {/* ── Open-Canvas Live Market Telemetry ───────────────────────────────── */}
        <div className="relative pt-2 sm:pt-4">
          {/* Asset Selector Tabs directly on canvas */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-white/[0.06]">
            <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center gap-1 bg-white/[0.03] p-1 rounded-full border border-white/[0.08]">
              {PAIRS.map((pair) => {
                const isSelected = activePair === pair
                return (
                  <button
                    key={pair}
                    type="button"
                    onClick={() => setActivePair(pair)}
                    className={cn(
                      'relative min-h-[40px] sm:min-h-0 px-2 sm:px-4 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors cursor-pointer truncate',
                      isSelected ? 'text-[#09090B]' : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                    )}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="hero-active-pair"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                        className="absolute inset-0 bg-[#FAFAFA] rounded-full"
                      />
                    )}
                    <span className="relative z-10 sm:hidden">{PAIR_SETUPS[pair].shortLabel}</span>
                    <span className="relative z-10 hidden sm:inline">{PAIR_SETUPS[pair].label}</span>
                  </button>
                )
              })}
            </div>

            {/* Session Info in Plus Jakarta Sans */}
            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[12px] text-[#71717A]">
              <span>Active Session: <span className="text-[#FAFAFA] font-medium">{setup.session}</span></span>
              <span>·</span>
              <span>Spread: <span className="text-[#FAFAFA] font-medium">{setup.spread}</span></span>
            </div>
          </div>

          {/* Telemetry Row: NO GENERIC GREEN CONTAINERS! Clean Plus Jakarta Sans Typography */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activePair}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="py-5 sm:py-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-5 sm:gap-6 text-left"
            >
              <div>
                <div className="text-[11px] sm:text-[11.5px] uppercase text-[#71717A] tracking-wider font-medium">Engine</div>
                <div className="text-[13.5px] sm:text-[14px] font-semibold text-[#FAFAFA] mt-1 leading-snug">{setup.engine}</div>
              </div>

              <div>
                <div className="text-[11px] sm:text-[11.5px] uppercase text-[#71717A] tracking-wider font-medium">Order Setup</div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-1">
                  <span
                    className={cn(
                      'text-[13.5px] sm:text-[14px] font-bold tracking-tight',
                      isBuy ? 'text-[#34D399]' : 'text-[#F87171]'
                    )}
                  >
                    {setup.direction}
                  </span>
                  <span className="text-[13.5px] sm:text-[14px] font-semibold text-[#FAFAFA] tabular-nums">{setup.entry}</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] sm:text-[11.5px] uppercase text-[#71717A] tracking-wider font-medium">Stop Loss</div>
                <div className="text-[13.5px] sm:text-[14px] font-semibold text-[#F87171] tabular-nums mt-1">{setup.stopLoss}</div>
              </div>

              <div>
                <div className="text-[11px] sm:text-[11.5px] uppercase text-[#71717A] tracking-wider font-medium">Take Profit</div>
                <div className="text-[13.5px] sm:text-[14px] font-semibold text-[#34D399] tabular-nums mt-1">{setup.takeProfit}</div>
              </div>

              <div>
                <div className="text-[11px] sm:text-[11.5px] uppercase text-[#71717A] tracking-wider font-medium">Risk / Reward</div>
                <div className="text-[13.5px] sm:text-[14px] font-semibold text-[#FAFAFA] tabular-nums mt-1">{setup.rr}</div>
              </div>

              <div>
                <div className="text-[11px] sm:text-[11.5px] uppercase text-[#71717A] tracking-wider font-medium">Calculated Sizing</div>
                <div className="text-[13.5px] sm:text-[14px] font-semibold text-[#FAFAFA] tabular-nums mt-1">{setup.lots} Lots</div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Rationale Row */}
          <div className="py-3 px-3.5 sm:px-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-start gap-2.5 sm:gap-3">
            <PiCrosshair className="text-[#34D399] shrink-0 mt-0.5" size={16} />
            <p className="text-[12.5px] sm:text-[13px] text-[#A1A1AA] leading-relaxed">
              <span className="text-[#FAFAFA] font-medium">Structural Confluence:</span> {setup.reason}
            </p>
          </div>

          {/* Terminal Visual sitting cleanly on canvas */}
          <div className="relative mt-6 sm:mt-8 rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_32px_100px_rgba(0,0,0,0.85)] bg-[#09090B]">
            <div className="relative">
              <img
                src="/brand/landing-terminal.png"
                alt="TRAXO Quantitative Execution Desk"
                className="w-full aspect-[16/10] sm:aspect-auto object-cover object-top opacity-85"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-transparent opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#09090B]/60 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Clean status bar: docked cleanly below image on mobile, floating glass on sm+ */}
            <div className="relative sm:absolute sm:bottom-4 sm:inset-x-6 lg:inset-x-8 flex items-center justify-between gap-3 py-3 sm:py-2.5 px-3.5 sm:px-4 border-t border-white/[0.08] sm:border sm:rounded-xl bg-[#09090B]/95 sm:bg-[#09090B]/80 sm:backdrop-blur-xl text-[12px] sm:text-[12.5px] text-[#A1A1AA]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[#FAFAFA] font-medium truncate">MetaTrader 5 Direct Bridge</span>
                <span className="hidden sm:inline text-white/20">|</span>
                <span className="hidden sm:inline text-[12px] text-[#71717A]">DMA Execution Link</span>
              </div>
              <Link
                to="/register"
                className="shrink-0 inline-flex items-center justify-center min-h-[36px] sm:min-h-0 px-3.5 py-1.5 sm:py-1 rounded-lg bg-[#FAFAFA] text-[#09090B] font-semibold text-xs hover:bg-[#E4E4E7] transition-colors"
              >
                Deploy Engine
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
