import ScrollReveal from '@/components/ui/ScrollReveal'

const MARKETS = [
  { name: 'Bitcoin (BTC)', src: '/markets/bitcoin-btc-logo.png' },
  { name: 'Ethereum (ETH)', src: '/markets/ethereum-eth-logo.png' },
  { name: 'Binance (BNB)', src: '/markets/bnb-bnb-logo.png' },
  { name: 'Tether (USDT)', src: '/markets/tether-usdt-logo.png' },
  { name: 'Gold (XAU)', src: '/markets/tether-gold-xaut-logo.png' },
  { name: 'Euro (EUR)', src: '/markets/stasis-euro-eurs-logo.png' },
]

export function SupportedMarkets() {
  return (
    <section className="py-8 border-y border-white/[0.05] bg-[#09090d] overflow-hidden">
      <ScrollReveal>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <p className="text-center text-[11px] font-semibold tracking-[0.2em] uppercase text-[#6b7280] mb-6">
          Supporting Global Crypto & Forex Markets
        </p>

        {/* Marquee Container */}
        <div className="relative flex overflow-hidden">
          {/* Fading Edges */}
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#09090d] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#09090d] to-transparent z-10 pointer-events-none" />

          {/* Marquee Track */}
          <div className="flex space-x-12 animate-marquee whitespace-nowrap items-center py-2">
            {[...MARKETS, ...MARKETS, ...MARKETS].map((market, i) => (
              <div
                key={i}
                className="flex items-center space-x-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              >
                <img src={market.src} alt={market.name} className="w-8 h-8 object-contain" />
                <span className="text-sm font-medium text-white/80">{market.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </ScrollReveal>
    </section>
  )
}
