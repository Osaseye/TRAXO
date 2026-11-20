import { Link } from 'react-router'

interface FooterLink {
  label: string
  href?: string
  to?: string
}

const FOOTER_COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Architecture',
    links: [
      { label: 'Execution Pipeline', href: '#how-it-works' },
      { label: '5 Strategy Engines', href: '#engines' },
      { label: 'Workspace Preview', href: '#terminal' },
      { label: 'Capabilities', href: '#stack' },
    ],
  },
  {
    heading: 'Workspace',
    links: [
      { label: 'Launch Terminal', to: '/register' },
      { label: 'Sign In', to: '/login' },
      { label: 'Reset Access', to: '/forgot-password' },
    ],
  },
]

export function LandingFooter() {
  return (
    <footer className="relative border-t border-white/[0.08] bg-[#09090B] px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-28 overflow-hidden font-sans">
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-9 sm:gap-10">
          <div className="max-w-sm">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img
                src="/brand/traxo-mark.png"
                alt="TRAXO"
                className="w-6 h-6 object-contain"
              />
              <span className="text-[14px] font-bold tracking-[0.14em] uppercase text-[#FAFAFA]">
                TRAXO
              </span>
            </Link>
            <p className="mt-3.5 sm:mt-4 text-sm text-[#71717A] leading-relaxed">
              Personal algorithmic trading desk. Institutional structure detection, 9-point risk
              guardrails, and direct MT5 execution.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-16">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[#71717A]">
                  {col.heading}
                </p>
                <ul className="mt-3 sm:mt-4 space-y-1 sm:space-y-2.5">
                  {col.links.map((item) => (
                    <li key={item.label}>
                      {item.to ? (
                        <Link
                          to={item.to}
                          className="inline-flex items-center min-h-[36px] sm:min-h-0 text-sm text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <a
                          href={item.href}
                          className="inline-flex items-center min-h-[36px] sm:min-h-0 text-sm text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                        >
                          {item.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 sm:mt-12 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-xs text-[#71717A]">
          <p>Contact: info@traxo.app</p>
          <p>© {new Date().getFullYear()} TRAXO. Personal Execution Desk.</p>
        </div>
      </div>

      {/* Subtle oversized monochrome watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute inset-x-0 -bottom-4 sm:-bottom-10 flex justify-center overflow-hidden"
      >
        <span className="text-[clamp(4rem,20vw,11rem)] font-black leading-none tracking-[-0.07em] text-white/[0.04]">
          TRAXO
        </span>
      </div>
    </footer>
  )
}
