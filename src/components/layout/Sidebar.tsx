import { useEffect, useMemo } from 'react'
import { NavLink } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PiChartLineUp,
  PiChartLineUpBold,
  PiStack,
  PiStackBold,
  PiClockCounterClockwise,
  PiClockCounterClockwiseBold,
  PiBookOpen,
  PiBookOpenBold,
  PiBroadcast,
  PiBroadcastBold,
  PiGearSix,
  PiGearSixBold,
  PiShieldCheck,
  PiShieldCheckBold,
  PiUserCircle,
  PiUserCircleBold,
  PiCaretLeft,
  PiCaretRight,
  PiX,
} from 'react-icons/pi'
import { cn } from '@/lib/utils'
import {
  canonicalSignalKey,
  normalizeSignalStatus,
  useAnalysisSignalStore,
} from '@/stores/useAnalysisSignalStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { isAdminUser, isTimestampVisibleForUser } from '@/lib/userSignalScope'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const PRIMARY_NAV = [
  { to: '/dashboard', icon: PiChartLineUp, activeIcon: PiChartLineUpBold, label: 'Terminal' },
  { to: '/strategies', icon: PiStack, activeIcon: PiStackBold, label: 'Strategies' },
  { to: '/backtesting', icon: PiClockCounterClockwise, activeIcon: PiClockCounterClockwiseBold, label: 'Backtest' },
  { to: '/journal', icon: PiBookOpen, activeIcon: PiBookOpenBold, label: 'Journal' },
  { to: '/notifications', icon: PiBroadcast, activeIcon: PiBroadcastBold, label: 'Signals & Ops' },
]

const UTILITY_NAV = [
  { to: '/settings', icon: PiGearSix, activeIcon: PiGearSixBold, label: 'Settings' },
  { to: '/profile', icon: PiUserCircle, activeIcon: PiUserCircleBold, label: 'Profile' },
]

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const user = useAuthStore((s) => s.user)
  const signals = useAnalysisSignalStore((s) => s.signals)
  const showAdminDesk = isAdminUser(user)

  const liveSignalCount = useMemo(() => {
    const keys = new Set<string>()
    for (const s of signals) {
      if (normalizeSignalStatus(s.status) !== 'LIVE') continue
      if (!isTimestampVisibleForUser(s.time, user)) continue
      keys.add(canonicalSignalKey(s) || s.id)
    }
    return keys.size
  }, [signals, user])

  const utilityNavItems = useMemo(
    () =>
      showAdminDesk
        ? [
            { to: '/admin', icon: PiShieldCheck, activeIcon: PiShieldCheckBold, label: 'Admin Desk' },
            ...UTILITY_NAV,
          ]
        : UTILITY_NAV,
    [showAdminDesk],
  )

  useEffect(() => {
    if (!mobileOpen || !onMobileClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen, onMobileClose])

  return (
    <>
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-full bg-[#09090B] border-r border-white/[0.06] transition-[width] duration-150 shrink-0 select-none',
          collapsed ? 'w-[64px]' : 'w-[220px]',
        )}
      >
      {/* Top 52px Brand Header aligned with Topbar */}
      <div
        className={cn(
          'flex items-center h-[52px] border-b border-white/[0.06] shrink-0',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <NavLink
          to="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden group focus:outline-none"
        >
          <div className="relative w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 group-hover:border-white/20 transition-colors">
            <img
              src="/brand/traxo-mark.png"
              alt="TRAXO"
              className="w-5 h-5 object-contain"
            />
          </div>
          {!collapsed && (
            <span className="text-[13px] font-bold tracking-[0.16em] uppercase text-[#FAFAFA] font-mono truncate">
              TRAXO
            </span>
          )}
        </NavLink>

        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="w-6 h-6 rounded flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors"
          >
            <PiCaretLeft size={14} />
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {PRIMARY_NAV.map(({ to, icon: Icon, activeIcon: ActiveIcon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={
              label === 'Signals & Ops'
                ? `${liveSignalCount} live signals`
                : collapsed
                  ? label
                  : undefined
            }
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors relative group',
                isActive
                  ? 'bg-white/[0.08] text-[#FAFAFA]'
                  : 'text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.03]',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => {
              const CurrentIcon = isActive ? ActiveIcon : Icon
              return (
                <>
                  <CurrentIcon
                    size={18}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive ? 'text-[#FAFAFA]' : 'text-[#71717A] group-hover:text-[#FAFAFA]',
                    )}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                  {label === 'Signals & Ops' && liveSignalCount > 0 && (
                    <span
                      title={`${liveSignalCount} live signals`}
                      className={cn(
                        'flex items-center justify-center rounded-full bg-[#34D399] text-[#09090B] font-mono font-bold',
                        collapsed
                          ? 'absolute top-1.5 right-1.5 w-2 h-2 p-0'
                          : 'ml-auto text-[10px] px-1.5 py-0.2 min-w-4 h-4',
                      )}
                    >
                      {!collapsed && (liveSignalCount > 99 ? '99+' : liveSignalCount)}
                    </span>
                  )}
                </>
              )
            }}
          </NavLink>
        ))}
      </div>

      {/* Bottom Utility Navigation */}
      <div className="p-2 border-t border-white/[0.06] space-y-1 shrink-0">
        {utilityNavItems.map(({ to, icon: Icon, activeIcon: ActiveIcon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors group',
                isActive
                  ? 'bg-white/[0.08] text-[#FAFAFA]'
                  : 'text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.03]',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => {
              const CurrentIcon = isActive ? ActiveIcon : Icon
              return (
                <>
                  <CurrentIcon
                    size={18}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive ? 'text-[#FAFAFA]' : 'text-[#71717A] group-hover:text-[#FAFAFA]',
                    )}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                </>
              )
            }}
          </NavLink>
        ))}

        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="w-full flex items-center justify-center py-2 text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.06] rounded transition-colors"
          >
            <PiCaretRight size={14} />
          </button>
        )}
      </div>
    </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={onMobileClose}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Drawer Panel */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="relative z-10 flex flex-col w-[280px] max-w-[85vw] h-full bg-[#09090B] border-r border-white/[0.08] shadow-[16px_0_48px_rgba(0,0,0,0.75)] select-none"
              style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between h-[56px] px-4 border-b border-white/[0.06] shrink-0">
                <NavLink
                  to="/dashboard"
                  onClick={onMobileClose}
                  className="flex items-center gap-2.5 focus:outline-none min-h-[44px]"
                >
                  <div className="relative w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                    <img
                      src="/brand/traxo-mark.png"
                      onError={(e) => {
                        e.currentTarget.src = '/TRAXO.png'
                      }}
                      alt="TRAXO"
                      className="w-5 h-5 object-contain"
                    />
                  </div>
                  <span className="text-[13px] font-bold tracking-[0.16em] uppercase text-[#FAFAFA] font-mono">
                    TRAXO
                  </span>
                </NavLink>

                <button
                  type="button"
                  onClick={onMobileClose}
                  aria-label="Close navigation menu"
                  className="w-11 h-11 -mr-1.5 rounded-xl flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors"
                >
                  <PiX size={20} />
                </button>
              </div>

              {/* Primary Workspace Links */}
              <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto" aria-label="Workspace">
                {PRIMARY_NAV.map(({ to, icon: Icon, activeIcon: ActiveIcon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onMobileClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium transition-colors',
                        isActive
                          ? 'bg-white/[0.09] text-[#FAFAFA]'
                          : 'text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/[0.04]',
                      )
                    }
                  >
                    {({ isActive }) => {
                      const CurrentIcon = isActive ? ActiveIcon : Icon
                      return (
                        <>
                          <CurrentIcon
                            size={19}
                            className={cn(
                              'shrink-0',
                              isActive ? 'text-[#FAFAFA]' : 'text-[#71717A]',
                            )}
                          />
                          <span className="truncate">{label}</span>
                          {label === 'Signals & Ops' && liveSignalCount > 0 && (
                            <span
                              title={`${liveSignalCount} live signals`}
                              className="ml-auto flex items-center justify-center rounded-full bg-[#34D399] text-[#09090B] font-mono font-bold text-[11px] px-2 min-w-5 h-5"
                            >
                              {liveSignalCount > 99 ? '99+' : liveSignalCount}
                            </span>
                          )}
                        </>
                      )
                    }}
                  </NavLink>
                ))}
              </nav>

              {/* Utility Links */}
              <div className="p-3 border-t border-white/[0.06] space-y-1 shrink-0">
                {utilityNavItems.map(({ to, icon: Icon, activeIcon: ActiveIcon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onMobileClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium transition-colors',
                        isActive
                          ? 'bg-white/[0.09] text-[#FAFAFA]'
                          : 'text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/[0.04]',
                      )
                    }
                  >
                    {({ isActive }) => {
                      const CurrentIcon = isActive ? ActiveIcon : Icon
                      return (
                        <>
                          <CurrentIcon
                            size={19}
                            className={cn(
                              'shrink-0',
                              isActive ? 'text-[#FAFAFA]' : 'text-[#71717A]',
                            )}
                          />
                          <span className="truncate">{label}</span>
                        </>
                      )
                    }}
                  </NavLink>
                ))}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
