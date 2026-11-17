interface MarketTicker {
  symbol: string
  assetClass: 'FX' | 'COMMODITY' | 'INDEX' | 'CRYPTO'
  price: string
  spread: string
  delta: string
  positive: boolean
  sparkline: string
}

const MARKETS: MarketTicker[] = [
  {
    symbol: 'EUR/USD',
    assetClass: 'FX',
    price: '1.08420',
    spread: '0.1 pip',
    delta: '+0.42%',
    positive: true,
    sparkline: 'M0,18 L12,14 L24,19 L36,9 L48,12 L60,4 L72,7 L84,2',
  },
  {
    symbol: 'XAU/USD',
    assetClass: 'COMMODITY',
    price: '2,648.50',
    spread: '0.8 pip',
    delta: '+1.18%',
    positive: true,
    sparkline: 'M0,16 L14,17 L28,10 L42,14 L56,6 L70,8 L84,1',
  },
  {
    symbol: 'NAS100',
    assetClass: 'INDEX',
    price: '20,418.2',
    spread: '0.9 pt',
    delta: '-0.34%',
    positive: false,
    sparkline: 'M0,3 L14,5 L28,12 L42,8 L56,16 L70,14 L84,19',
  },
  {
    symbol: 'BTC/USD',
    assetClass: 'CRYPTO',
    price: '91,420.50',
    spread: '1.2 pt',
    delta: '+2.45%',
    positive: true,
    sparkline: 'M0,17 L12,12 L24,15 L36,7 L48,10 L60,3 L72,6 L84,1',
  },
  {
    symbol: 'GBP/USD',
    assetClass: 'FX',
    price: '1.29640',
    spread: '0.2 pip',
    delta: '+0.29%',
    positive: true,
    sparkline: 'M0,15 L14,13 L28,16 L42,9 L56,11 L70,5 L84,3',
  },
  {
    symbol: 'USD/JPY',
    assetClass: 'FX',
    price: '153.840',
    spread: '0.2 pip',
    delta: '-0.51%',
    positive: false,
    sparkline: 'M0,2 L14,4 L28,11 L42,7 L56,15 L70,13 L84,18',
  },
  {
    symbol: 'US30',
    assetClass: 'INDEX',
    price: '43,890.5',
    spread: '1.5 pt',
    delta: '+0.64%',
    positive: true,
    sparkline: 'M0,14 L14,16 L28,9 L42,12 L56,5 L70,8 L84,2',
  },
  {
    symbol: 'ETH/USD',
    assetClass: 'CRYPTO',
    price: '3,412.80',
    spread: '0.8 pt',
    delta: '+3.12%',
    positive: true,
    sparkline: 'M0,19 L14,15 L28,17 L42,8 L56,10 L70,3 L84,1',
  },
]

export function SupportedMarkets() {
  return (
    <section
      aria-label="Live Market Liquidity Feed"
      className="relative border-y border-white/[0.06] bg-[#09090B] py-3.5 overflow-hidden select-none"
    >
      {/* Edge gradient fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 sm:w-32 z-10 bg-gradient-to-r from-[#09090B] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 sm:w-32 z-10 bg-gradient-to-l from-[#09090B] to-transparent" />

      {/* Infinite ticker stream */}
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        <div className="flex items-center gap-8 sm:gap-12 pr-8 sm:pr-12">
          {MARKETS.concat(MARKETS).map((item, idx) => (
            <div
              key={`${item.symbol}-${idx}`}
              className="flex items-center gap-3 text-[12px] font-mono group cursor-default"
            >
              <span className="text-[10px] text-[#71717A] uppercase">{item.assetClass}</span>
              <span className="font-semibold text-[#FAFAFA]">{item.symbol}</span>
              <span className="text-[#A1A1AA] tabular-nums">{item.price}</span>

              {/* Live SVG sparkline micro-animation */}
              <svg width="60" height="16" className="overflow-visible opacity-70 group-hover:opacity-100 transition-opacity">
                <path
                  d={item.sparkline}
                  fill="none"
                  stroke={item.positive ? '#34D399' : '#F87171'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <span
                className={`tabular-nums font-semibold ${
                  item.positive ? 'text-[#34D399]' : 'text-[#F87171]'
                }`}
              >
                {item.delta}
              </span>

              <span className="text-[10px] text-white/20">|</span>
              <span className="text-[10.5px] text-[#52525B]">{item.spread}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
