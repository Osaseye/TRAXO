import { NavLink } from 'react-router'
import { BarChart2 } from 'lucide-react'
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
const BacktestIcon = ({ className }: { className?: string }) => <BarChart2 className={className} size={14} />

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

export function DesktopWorkspaceNav() {
  const unreadCount = useNotificationStore((s) => s.notifications.filter((notification) => !notification.read).length)

  return (
    <nav className="hidden lg:flex items-center gap-1 rounded-xl border border-white/[0.12] bg-[#0d1117] p-1">
      {DESKTOP_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'h-8 px-3 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5',
              isActive ? 'bg-white/[0.09] text-white' : 'text-[#94a3b8] hover:text-white hover:bg-white/[0.05]'
            )
          }
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
          {item.to === '/notifications' && unreadCount > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </NavLink>
      ))}
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
                'h-8 min-w-0 flex-1 rounded-full text-[11px] inline-flex items-center justify-center gap-1 transition-colors px-2 whitespace-nowrap',
                isActive ? 'bg-white/[0.1] text-white' : 'text-[#cbd5e1] hover:bg-white/[0.05]'
              )
            }
          >
            <Icon className="w-[13px] h-[13px] shrink-0" />
            <span className="max-[420px]:hidden">{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
