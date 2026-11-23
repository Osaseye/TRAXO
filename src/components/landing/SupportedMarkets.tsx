const TRAXO_MARKETS = [
  { symbol: 'EUR/USD', category: 'Forex' },
  { symbol: 'GBP/USD', category: 'Forex' },
  { symbol: 'USD/JPY', category: 'Forex' },
  { symbol: 'AUD/USD', category: 'Forex' },
  { symbol: 'USD/CAD', category: 'Forex' },
  { symbol: 'XAU/USD', category: 'Gold', accent: true },
  { symbol: 'MNQ', category: 'Futures' },
];

export function SupportedMarkets() {
  return (
    <section
      aria-label="Available Markets on TRAXO"
      className="relative border-y border-white/[0.06] bg-[#09090B] py-10 sm:py-14 px-4 sm:px-6 font-sans"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-[12px] font-medium text-[#71717A]">
          Available Markets
        </div>

        <div className="flex items-center md:justify-between gap-8 sm:gap-10 overflow-x-auto no-scrollbar">
          {TRAXO_MARKETS.map((m) => (
            <div key={m.symbol} className="shrink-0 whitespace-nowrap space-y-1">
              <div
                className={
                  m.accent
                    ? 'text-[16px] sm:text-[18px] font-semibold text-[#34D399]'
                    : 'text-[16px] sm:text-[18px] font-semibold text-[#FAFAFA]'
                }
              >
                {m.symbol}
              </div>
              <div className="text-[12px] text-[#71717A]">{m.category}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
