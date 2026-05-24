import { useState } from 'react'
import { Link } from 'react-router'
import { Menu, X, ArrowRight } from 'lucide-react'

const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features',     href: '#features'    },
  { label: 'Pricing',      href: '#pricing'     },
]

export function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-[#070709]/80 backdrop-blur-2xl">
      {/* Accent line */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-lg bg-[#3b82f6]/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <img src="/TRAXO-icon.png" alt="TRAXO" className="relative w-8 h-8 object-contain" />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-white">TRAXO</span>
        </Link>

        {/* Center nav links — desktop */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="px-4 py-2 text-[13px] text-[#888] font-medium hover:text-white transition-colors duration-150 rounded-md hover:bg-white/[0.05]"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right actions — desktop */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <Link
            to="/login"
            className="inline-flex items-center px-4 py-2 text-[13px] text-[#888] font-medium hover:text-white transition-colors duration-150"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[13px] font-semibold rounded-lg transition-colors duration-150"
          >
            Get started
            <ArrowRight size={12} className="opacity-80" />
          </Link>
        </div>

        {/* Mobile right: CTA + hamburger */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <Link
            to="/register"
            className="inline-flex items-center gap-1 px-3.5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[12px] font-semibold rounded-lg transition-colors"
          >
            Get started
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#070709]/95 backdrop-blur-2xl px-4 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex items-center px-3 py-3 text-[14px] text-[#6b7280] font-medium hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"
            >
              {link.label}
            </a>
          ))}
          <div className="pt-2 border-t border-white/[0.05]">
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="flex items-center px-3 py-3 text-[14px] text-[#6b7280] font-medium hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
