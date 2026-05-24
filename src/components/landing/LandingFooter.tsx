import { Logo } from '@/components/shared/Logo'

const LINKS = [
  { heading: 'Product',  items: ['Dashboard', 'Strategies', 'Pricing', 'Changelog'] },
  { heading: 'Platform', items: ['Analyst Mode', 'Risk Tools', 'Signal Engine', 'Autopilot (Phase 2)'] },
  { heading: 'Company',  items: ['About', 'Blog', 'Careers', 'Contact'] },
  { heading: 'Legal',    items: ['Privacy', 'Terms', 'Security'] },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.05] bg-[#070709]">
      {/* Top area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-2 md:grid-cols-5 gap-8 sm:gap-10">
        {/* Brand col */}
        <div className="col-span-2 md:col-span-1">
          <Logo variant="icon" size="sm" className="h-8 mb-4" />
          <p className="text-[11px] text-[#374151] leading-relaxed max-w-[140px]">
            The intelligence layer for serious traders.
          </p>
        </div>

        {/* Link cols */}
        {LINKS.map((col) => (
          <div key={col.heading}>
            <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#374151] mb-3">
              {col.heading}
            </p>
            <ul className="space-y-2">
              {col.items.map((item) => (
                <li key={item}>
                  <span className="text-[12px] text-[#374151] hover:text-[#9ca3af] cursor-pointer transition-colors">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.04] max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center gap-2 sm:justify-between">
        <p className="text-[11px] text-[#1f2937]">© 2026 Traxo. All rights reserved.</p>
        <p className="text-[11px] text-[#1f2937] tracking-widest font-bold uppercase">
          LOOK FIRST. THEN TRADE.
        </p>
      </div>
    </footer>
  )
}
