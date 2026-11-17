import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { PiArrowRight, PiList, PiX } from 'react-icons/pi'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Architecture', href: '#how-it-works' },
  { label: 'Engines', href: '#engines' },
  { label: 'Custom Engine', href: '#custom-engine' },
  { label: 'Terminal', href: '#terminal' },
  { label: 'Capabilities', href: '#stack' },
]

export function LandingNav() {
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('')

  // Scrollspy to detect currently active section
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 140
      for (let i = NAV_LINKS.length - 1; i >= 0; i--) {
        const sectionId = NAV_LINKS[i].href.slice(1)
        const el = document.getElementById(sectionId)
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(NAV_LINKS[i].href)
          return
        }
      }
      if (window.scrollY < 200) setActiveSection('')
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className="fixed top-4 inset-x-0 z-50 px-4 sm:px-6 pointer-events-none">
      <div className="max-w-6xl mx-auto pointer-events-auto">
        <nav
          aria-label="Primary navigation"
          className="h-14 px-4 sm:px-6 rounded-full backdrop-blur-2xl bg-[#09090B]/80 border border-white/[0.08] shadow-[0_16px_40px_rgba(0,0,0,0.6)] flex items-center justify-between gap-4 font-sans"
        >
          {/* Brand mark - NO BOX CONTAINER! */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group focus:outline-none">
            <img
              src="/brand/traxo-mark.png"
              alt="TRAXO"
              className="w-6 h-6 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <span className="text-[13.5px] font-bold tracking-[0.16em] uppercase text-[#FAFAFA]">
              TRAXO
            </span>
          </Link>

          {/* Desktop links with active pill indicator */}
          <div className="hidden md:flex items-center gap-1 relative">
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.href
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 rounded-full',
                    isActive ? 'text-[#FAFAFA]' : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 bg-white/[0.08] border border-white/[0.06] rounded-full pointer-events-none"
                    />
                  )}
                  <span className="relative z-10">{link.label}</span>
                </a>
              )
            })}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            <Link
              to="/login"
              className="px-3 py-1.5 text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] text-[13px] font-semibold transition-all shadow-[0_0_20px_rgba(255,255,255,0.08)] active:scale-[0.98]"
            >
              <span>Launch Terminal</span>
              <PiArrowRight size={13} />
            </Link>
          </div>

          {/* Mobile actions */}
          <div className="flex md:hidden items-center gap-2 shrink-0">
            <Link
              to="/register"
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-[#FAFAFA] text-[#09090B] text-[12px] font-semibold"
            >
              <span>Launch</span>
              <PiArrowRight size={12} />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              {open ? <PiX size={16} /> : <PiList size={16} />}
            </button>
          </div>
        </nav>

        {/* Mobile popover drawer */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="md:hidden mt-2 rounded-2xl backdrop-blur-2xl bg-[#09090B]/95 border border-white/[0.08] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.8)] font-sans"
            >
              <div className="space-y-1">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm font-medium text-[#A1A1AA] hover:text-[#FAFAFA] rounded-xl hover:bg-white/[0.04] transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="pt-2 mt-2 border-t border-white/[0.06] flex items-center justify-between">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-sm font-medium text-[#A1A1AA] hover:text-[#FAFAFA]"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FAFAFA] text-[#09090B] text-xs font-semibold"
                >
                  <span>Launch Terminal</span>
                  <PiArrowRight size={13} />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
