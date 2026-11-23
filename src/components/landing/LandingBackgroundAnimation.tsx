import { motion } from 'framer-motion'

export function LandingBackgroundAnimation() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
    >
      {/* ── 1. Coordinate Dot Grid & Subtle Crosses ───────────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── 2. Deep Obsidian Gradient Wells (Disabled blurs on mobile iOS GPU) ── */}
      <div
        className="md:hidden absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(52, 211, 153, 0.08), transparent 55%)',
        }}
      />
      <div className="hidden md:block">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-[#34D399]/[0.06] via-[#141417]/[0.2] to-transparent rounded-full blur-[140px]" />
        <div className="absolute top-[35%] -left-32 w-[600px] h-[500px] bg-white/[0.02] rounded-full blur-[120px]" />
        <div className="absolute top-[65%] -right-32 w-[650px] h-[500px] bg-[#34D399]/[0.03] rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 w-[700px] h-[400px] bg-white/[0.015] rounded-full blur-[130px]" />
      </div>

      {/* ── 3. Kinetic Candlestick Wicks & Liquidity Order Depth SVG (Desktop) ─ */}
      <svg
        className="hidden md:block absolute inset-0 w-full h-full opacity-[0.18]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="landingGridLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="70%" stopColor="rgba(52,211,153,0.15)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="orderCurve" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="50%" stopColor="rgba(52,211,153,0.1)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Ambient Horizontal Liquidity Grids */}
        <line
          x1="0"
          y1="18%"
          x2="100%"
          y2="18%"
          stroke="url(#landingGridLine)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <line
          x1="0"
          y1="42%"
          x2="100%"
          y2="42%"
          stroke="url(#landingGridLine)"
          strokeWidth="1"
          strokeDasharray="6 12"
        />
        <line
          x1="0"
          y1="68%"
          x2="100%"
          y2="68%"
          stroke="url(#landingGridLine)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <line
          x1="0"
          y1="88%"
          x2="100%"
          y2="88%"
          stroke="url(#landingGridLine)"
          strokeWidth="1"
          strokeDasharray="3 9"
        />

        {/* Flowing Orderbook Depth Wave 1 */}
        <motion.path
          d="M -100 280 C 300 240, 600 360, 1100 290 S 1800 230, 2200 320"
          fill="none"
          stroke="url(#orderCurve)"
          strokeWidth="1.2"
          animate={{
            d: [
              'M -100 280 C 300 240, 600 360, 1100 290 S 1800 230, 2200 320',
              'M -100 300 C 300 270, 600 330, 1100 310 S 1800 250, 2200 290',
              'M -100 280 C 300 240, 600 360, 1100 290 S 1800 230, 2200 320',
            ],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Flowing Orderbook Depth Wave 2 */}
        <motion.path
          d="M -100 640 C 350 700, 750 610, 1250 670 S 1750 620, 2200 660"
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
          strokeDasharray="8 6"
          animate={{
            d: [
              'M -100 640 C 350 700, 750 610, 1250 670 S 1750 620, 2200 660',
              'M -100 620 C 350 660, 750 640, 1250 630 S 1750 650, 2200 630',
              'M -100 640 C 350 700, 750 610, 1250 670 S 1750 620, 2200 660',
            ],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Group of subtle animated background candlesticks */}
        <g className="opacity-70">
          {/* Candle Set Left */}
          <motion.g
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          >
            <line x1="8%" y1="120" x2="8%" y2="240" stroke="#34D399" strokeWidth="1" />
            <rect x="8%" y="150" width="6" height="50" fill="#34D399" rx="1" opacity="0.6" />

            <line x1="10%" y1="180" x2="10%" y2="290" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <rect x="10%" y="210" width="6" height="40" fill="#27272A" rx="1" />
          </motion.g>

          {/* Candle Set Center-Right (Displacement Wick) */}
          <motion.g
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          >
            <line x1="88%" y1="260" x2="88%" y2="420" stroke="#34D399" strokeWidth="1" />
            <rect x="88%" y="300" width="6" height="70" fill="#34D399" rx="1" opacity="0.5" />

            <line x1="91%" y1="360" x2="91%" y2="480" stroke="#F87171" strokeWidth="1" opacity="0.6" />
            <rect x="91%" y="390" width="6" height="45" fill="#F87171" rx="1" opacity="0.3" />
          </motion.g>

          {/* Candle Set Mid-Lower Left */}
          <motion.g
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          >
            <line x1="6%" y1="620" x2="6%" y2="760" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <rect x="6%" y="660" width="6" height="60" fill="#27272A" rx="1" />

            <line x1="8%" y1="580" x2="8%" y2="700" stroke="#34D399" strokeWidth="1" />
            <rect x="8%" y="610" width="6" height="50" fill="#34D399" rx="1" opacity="0.5" />
          </motion.g>
        </g>
      </svg>

      {/* ── 4. Ambient Floating Quantitative Ticks ───────────────────────────── */}
      <div className="absolute inset-0">
        {/* Floating Tick: Left Top */}
        <motion.div
          animate={{ y: [0, -12, 0], opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[22%] left-[4%] hidden lg:flex flex-col text-[10.5px] font-mono text-[#71717A]"
        >
          <span className="text-[#34D399]/80 font-medium">XAU/USD · LND/NY</span>
          <span className="tabular-nums">2,894.20 +1.4%</span>
        </motion.div>

        {/* Floating Tick: Right Mid */}
        <motion.div
          animate={{ y: [0, 14, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute top-[48%] right-[4%] hidden lg:flex flex-col text-[10.5px] font-mono text-[#71717A] text-right"
        >
          <span className="text-[#FAFAFA]/70 font-medium">MNQ CME RTH</span>
          <span className="tabular-nums">21,418.50 +0.82%</span>
        </motion.div>

        {/* Floating Tick: Left Lower */}
        <motion.div
          animate={{ y: [0, -8, 0], opacity: [0.25, 0.5, 0.25] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-[75%] left-[5%] hidden lg:flex flex-col text-[10.5px] font-mono text-[#71717A]"
        >
          <span className="text-white/50">ORDER_FLOW_DEPTH</span>
          <span className="tabular-nums">SPREAD 0.12 · 14ms</span>
        </motion.div>
      </div>
    </div>
  )
}

export default LandingBackgroundAnimation
