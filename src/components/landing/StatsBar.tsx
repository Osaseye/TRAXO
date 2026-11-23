import { motion } from 'framer-motion'

const TELEMETRY_STATS = [
  {
    value: '05',
    label: 'Algorithmic Engines',
    detail: 'Wick, Breakout, Order Block, S&D, Trend',
  },
  {
    value: '09',
    label: 'Pre-Trade Gates',
    detail: 'Automated spread, volatility & drawdown circuit breakers',
  },
  {
    value: '1 : 2.8',
    label: 'Minimum Expectancy',
    detail: 'Asymmetric R:R structural invalidation targets',
  },
  {
    value: '< 40ms',
    label: 'Execution Latency',
    detail: 'Direct DMA MetaTrader 5 bridge protocol',
  },
]

export function StatsBar() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 border-y border-white/[0.06] bg-[#09090B] font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-7 sm:gap-12">
        {TELEMETRY_STATS.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05 }}
            transition={{
              duration: 0.45,
              delay: idx * 0.08,
            }}
            className="space-y-1 sm:space-y-1.5"
          >
            <div className="font-mono text-[26px] sm:text-4xl font-bold tracking-tight text-[#FAFAFA] tabular-nums">
              {stat.value}
            </div>
            <div className="text-[13.5px] sm:text-[14px] font-semibold text-[#FAFAFA]">{stat.label}</div>
            <div className="text-[12px] text-[#71717A] leading-relaxed">{stat.detail}</div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
