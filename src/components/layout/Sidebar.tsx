import { NavLink } from 'react-router'
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
  PiUserCircle,
  PiUserCircleBold,
  PiCaretLeft,
  PiCaretRight,
} from 'react-icons/pi'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/useNotificationStore'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
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

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const unreadCount = useNotificationStore(
    (s) => s.notifications.filter((n) => !n.read).length,
  )

  return (
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
            title={collapsed ? label : undefined}
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
                  {label === 'Signals & Ops' && unreadCount > 0 && (
                    <span
                      className={cn(
                        'flex items-center justify-center rounded-full bg-[#34D399] text-[#09090B] font-mono font-bold',
                        collapsed
                          ? 'absolute top-1.5 right-1.5 w-2 h-2 p-0'
                          : 'ml-auto text-[10px] px-1.5 py-0.2 min-w-4 h-4',
                      )}
                    >
                      {!collapsed && unreadCount}
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
        {UTILITY_NAV.map(({ to, icon: Icon, activeIcon: ActiveIcon, label }) => (
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
  )
}
