import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  Target,
  Bell,
  BookOpenText,
  History,
  User,
  Settings,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/useNotificationStore'

const DESKTOP_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/strategies', label: 'Strategies', icon: Target },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/journal', label: 'Journal', icon: BookOpenText },
  { to: '/backtesting', label: 'Backtest', icon: History },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/strategies', label: 'Strategies', icon: Target },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/journal', label: 'Journal', icon: BookOpenText },
  { to: '/backtesting', label: 'Backtest', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/**
 * Live market data indicator dot.
 */
function LiveDot({ isLive = true }: { isLive?: boolean }) {
  return (
    <span
      className="relative flex h-2 w-2 ml-1 shrink-0"
      role="status"
      aria-label={isLive ? 'Live market data connected' : 'Market data disconnected'}
    >
      {isLive && (
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2 w-2 rounded-full',
          isLive ? 'bg-emerald-400' : 'bg-slate-600'
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
    <nav className="hidden lg:flex items-center gap-1 rounded-full border border-white/[0.08] bg-[#090d14]/90 p-1 backdrop-blur-md">
      <LiveDot />
      <div className="w-px h-3 bg-white/[0.1] mx-1 shrink-0" aria-hidden="true" />

      {DESKTOP_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          title={item.label}
          className={({ isActive }) =>
            cn(
              'relative h-8 rounded-full flex items-center justify-center transition-colors duration-200 focus-visible:outline-none select-none',
              isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            )
          }
        >
          {({ isActive }) => (
            <motion.div
              layout
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className={cn(
                'relative h-8 px-2.5 rounded-full flex items-center gap-2 text-[11px] font-medium whitespace-nowrap',
                isActive && 'bg-white/[0.08] border border-white/[0.12] text-white shadow-sm'
              )}
            >
              {/* Active Indicator Accent Dot */}
              {isActive && (
                <motion.span
                  layoutId="active-desktop-dot"
                  className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] shrink-0"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              <item.icon className={cn('w-3.5 h-3.5 shrink-0 transition-colors', isActive ? 'text-blue-400' : 'text-slate-400')} />

              {/* Show text label ONLY on active state */}
              <AnimatePresence mode="popLayout" initial={false}>
                {isActive && (
                  <motion.span
                    initial={{ opacity: 0, width: 0, x: -4 }}
                    animate={{ opacity: 1, width: 'auto', x: 0 }}
                    exit={{ opacity: 0, width: 0, x: -4 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="overflow-hidden font-semibold tracking-wide text-white pr-0.5"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>

              {item.to === '/notifications' && unreadCount > 0 && (
                <span className="relative ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center">
                  <span className="rounded-full bg-rose-500 px-1 h-3.5 min-w-3.5 flex items-center justify-center text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </span>
              )}
            </motion.div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function MobileFloatingWorkspaceNav() {
  const unreadCount = useNotificationStore(
    (s) => s.notifications.filter((notification) => !notification.read).length
  )

  return (
    <div className="lg:hidden fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-3 select-none">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/[0.12] bg-[#090d14]/95 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {MOBILE_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                'relative h-9 rounded-full flex items-center justify-center transition-colors duration-200 focus-visible:outline-none',
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              )
            }
          >
            {({ isActive }) => (
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className={cn(
                  'relative h-9 px-3 rounded-full flex items-center gap-2 text-[11px] font-medium whitespace-nowrap',
                  isActive && 'bg-white/[0.1] border border-white/[0.15] text-white'
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-mobile-dot"
                    className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] shrink-0"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className={cn('w-4 h-4 shrink-0 transition-colors', isActive ? 'text-blue-400' : 'text-slate-400')} />

                <AnimatePresence mode="popLayout" initial={false}>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0, width: 0, x: -4 }}
                      animate={{ opacity: 1, width: 'auto', x: 0 }}
                      exit={{ opacity: 0, width: 0, x: -4 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="overflow-hidden font-semibold tracking-wide text-white pr-0.5"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {to === '/notifications' && unreadCount > 0 && (
                  <span className="relative ml-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center">
                    <span className="rounded-full bg-rose-500 px-1 h-3.5 min-w-3.5 flex items-center justify-center text-[9px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  </span>
                )}
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}