import { NavLink } from 'react-router'
import { BarChart2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/useNotificationStore'
import {
  NavDashboardIcon,
  NavBellIcon,
  NavJournalIcon,
  NavProfileIcon,
  NavSettingsIcon,
  NavStrategyIcon,
} from '@/components/layout/NavIcons'

const BacktestIcon = ({ className }: { className?: string }) => (
  <BarChart2 className={className} size={14} />
)

const DESKTOP_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: NavDashboardIcon },
  { to: '/strategies', label: 'Strategies', icon: NavStrategyIcon },
  { to: '/notifications', label: 'Alerts', icon: NavBellIcon },
  { to: '/journal', label: 'Journal', icon: NavJournalIcon },
  { to: '/backtesting', label: 'Backtest', icon: BacktestIcon },
  { to: '/profile', label: 'Profile', icon: NavProfileIcon },
  { to: '/settings', label: 'Settings', icon: NavSettingsIcon },
]

const MOBILE_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: NavDashboardIcon },
  { to: '/strategies', label: 'Strategies', icon: NavStrategyIcon },
  { to: '/notifications', label: 'Alerts', icon: NavBellIcon },
  { to: '/journal', label: 'Journal', icon: NavJournalIcon },
  { to: '/backtesting', label: 'Backtest', icon: BacktestIcon },
  { to: '/settings', label: 'Settings', icon: NavSettingsIcon },
]

/**
 * Tiny live-data indicator. Wire `isLive` to your actual WebSocket
 * connection state (e.g. from useSignalSocket()) — hardcoded true here
 * as a placeholder for the visual.
 */
function LiveDot({ isLive = true }: { isLive?: boolean }) {
  return (
    <span
      className="relative flex h-2 w-2 mr-1"
      role="status"
      aria-label={isLive ? 'Live market data connected' : 'Market data disconnected'}
    >
      {isLive && (
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2 w-2 rounded-full',
          isLive ? 'bg-emerald-400' : 'bg-[#475569]'
        )}
      />
    </span>
  )
}

export function DesktopWorkspaceNav() {
  const unreadCount = useNotificationStore(
    (s) => s.notifications.filter((notification) => !notification.read).length
  )

  return (
    <nav className="hidden lg:flex items-center gap-1 rounded-xl border border-white/[0.12] bg-[#0d1117] p-1 pl-2.5">
      <LiveDot />
      <div className="w-px h-4 bg-white/[0.1] mx-1" aria-hidden="true" />

      {DESKTOP_ITEMS.map((item) => {
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative h-8 px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5',
                'transition-colors duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117]',
                isActive ? 'text-white' : 'text-[#94a3b8] hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="desktop-nav-active-pill"
                    className="absolute inset-0 rounded-lg bg-white/[0.09]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                  {item.to === '/notifications' && unreadCount > 0 && (
                    <span className="relative ml-1 inline-flex h-4 min-w-4 items-center justify-center">
                      <AnimatePresence>
                        <motion.span
                          key={unreadCount}
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="motion-safe:animate-[pulse_1.4s_ease-in-out_1] rounded-full bg-[#ef4444] px-1 h-4 min-w-4 flex items-center justify-center text-[9px] font-bold text-white"
                        >
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  )}
                </span>
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

export function MobileFloatingWorkspaceNav() {
  return (
    <div className="lg:hidden fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/[0.14] bg-[#0d1117]/96 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.45)] w-[calc(100vw-1rem)] max-w-[34rem]">
        {MOBILE_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'relative h-8 min-w-0 flex-1 rounded-full text-[11px] inline-flex items-center justify-center gap-1',
                'transition-colors duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] px-2 whitespace-nowrap',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
                isActive ? 'text-white' : 'text-[#cbd5e1]'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-active-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.1]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative inline-flex items-center justify-center gap-1">
                  <Icon className="w-[13px] h-[13px] shrink-0" />
                  <span className="max-[420px]:hidden">{label}</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}