import { Logo } from '@/components/shared/Logo'
import { Link } from 'react-router'
import ScrollReveal from '@/components/ui/ScrollReveal'

const LINKS = [
  { heading: 'Product',  items: ['Dashboard', 'Strategies', 'Journal', 'Pricing', 'Changelog'] },
  { heading: 'Platform', items: ['Analyst Mode', 'Risk Tools', 'Signal Engine', 'Autopilot (Phase 2)'] },
  { heading: 'Company',  items: ['About', 'Blog', 'Careers', 'Contact'] },
  { heading: 'Legal',    items: ['Privacy', 'Terms', 'Security'] },
]

export function LandingFooter() {
  return (
    <footer className="relative border-t border-white/[0.05] bg-[#09090d] px-4 sm:px-6 py-16 sm:py-20 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_36%),radial-gradient(circle_at_70%_20%,rgba(59,130,246,0.08),transparent_28%)]" />
      <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto max-w-7xl">
        <ScrollReveal>
        <div className="border-t border-white/[0.08] pt-8 sm:pt-10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10 lg:gap-16">
            <div className="max-w-sm">
              <div className="flex items-center gap-3">
                <Logo variant="icon" size="sm" className="h-10 w-10 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-white/80">TRAXO</p>
                  <p className="text-[12px] text-white/75">The intelligence layer for serious traders.</p>
                </div>
              </div>

              <p className="mt-5 text-[13px] leading-relaxed text-white/70 max-w-md">
                Build conviction from clean signals, structured risk, and context that matters before the market moves.
              </p>

              <Link
                to="/register"
                className="mt-6 inline-flex items-center justify-center rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/[0.08] px-5 py-2.5 text-[13px] font-semibold text-[#dbeafe] transition-colors duration-150 hover:bg-[#3b82f6]/[0.14]"
              >
                Request access
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:gap-10 flex-1">
              {LINKS.map((col) => (
                <div key={col.heading}>
                  <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-white/70 mb-4">
                    {col.heading}
                  </p>
                  <ul className="space-y-2.5">
                    {col.items.map((item) => (
                      <li key={item}>
                        <span className="text-[13px] text-white/78 hover:text-white transition-colors cursor-pointer">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[12px] text-white/70">
            <p>Contact us on: info@traxo.app</p>
            <p>© 2026 TRAXO. All rights reserved.</p>
          </div>
        </div>
        </ScrollReveal>

        <div className="pointer-events-none absolute inset-x-0 -bottom-8 sm:-bottom-10 flex justify-center overflow-hidden">
          <span className="select-none text-[clamp(5rem,20vw,12rem)] font-black leading-none tracking-[-0.08em] text-white/10">
            TRAXO
          </span>
        </div>
      </div>
    </footer>
  )
}
