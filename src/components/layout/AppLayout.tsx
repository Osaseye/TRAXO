import { useState } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router'
import { motion } from 'framer-motion'
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
} from 'react-icons/pi'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'traxo-sidebar-collapsed'

const STRATEGY_NAMES: Record<string, string> = {
  'wick-rejection': 'Wick Rejection',
  'breakout': 'Breakout',
  'order-block': 'Order Block',
  'supply-demand': 'Supply & Demand',
  'trend-following': 'Trend Following',
}

function resolvePageMeta(pathname: string): { title: string; subtitle?: string } {
  if (pathname === '/dashboard') {
    return { title: 'Terminal', subtitle: 'Live chart, signals & execution' }
  }
  if (pathname === '/strategies') {
    return { title: 'Strategies', subtitle: 'Algorithmic engines & adaptive tuning' }
  }
  if (pathname.startsWith('/strategies/')) {
    const id = pathname.slice('/strategies/'.length)
    return {
      title: STRATEGY_NAMES[id] ?? 'Strategy specification',
      subtitle: 'Rules, scoring & optimizer telemetry',
    }
  }
  if (pathname === '/backtesting') {
    return { title: 'Backtest lab', subtitle: 'Walk-forward quantitative replay' }
  }
  if (pathname === '/journal') {
    return { title: 'Journal', subtitle: 'Execution ledger & performance' }
  }
  if (pathname.startsWith('/journal/')) {
    const date = pathname.slice('/journal/'.length)
    return { title: `Journal · ${date}`, subtitle: 'Daily session drilldown' }
  }
  if (pathname === '/notifications') {
    return { title: 'Signals & ops', subtitle: 'Alerts, rejections & system telemetry' }
  }
  if (pathname === '/settings') {
    return { title: 'Settings', subtitle: 'MT5 bridge & risk guardrails' }
  }
  if (pathname === '/profile') {
    return { title: 'Profile', subtitle: 'Operator identity & preferences' }
  }
  if (pathname === '/admin') {
    return { title: 'Admin ops', subtitle: 'System health & diagnostics' }
  }
  if (pathname === '/admin/signals') {
    return { title: 'Signal diagnostics', subtitle: 'Signal ledger & scan rejects' }
  }
  return { title: 'Traxo' }
}

const MOBILE_NAV = [
  { to: '/dashboard', icon: PiChartLineUp, activeIcon: PiChartLineUpBold, label: 'Terminal' },
  { to: '/strategies', icon: PiStack, activeIcon: PiStackBold, label: 'Strategies' },
  { to: '/backtesting', icon: PiClockCounterClockwise, activeIcon: PiClockCounterClockwiseBold, label: 'Backtest' },
  { to: '/journal', icon: PiBookOpen, activeIcon: PiBookOpenBold, label: 'Journal' },
  { to: '/notifications', icon: PiBroadcast, activeIcon: PiBroadcastBold, label: 'Ops' },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const location = useLocation()

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  const meta = resolvePageMeta(location.pathname)

  return (
    <div className="obsidian-shell flex h-screen bg-[#09090B] text-[#FAFAFA] overflow-hidden font-sans">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[#09090B]">
        <Topbar title={meta.title} subtitle={meta.subtitle} />

        <main className="flex-1 min-h-0 overflow-auto pb-24 md:pb-0 bg-[#09090B]">
          <Outlet />
        </main>

        {/* Mobile floating glassmorphic pill nav */}
        <nav
          className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-[400px] h-14 px-2 rounded-full bg-[#111113]/75 backdrop-blur-2xl border border-white/[0.12] shadow-[0_12px_40px_rgba(0,0,0,0.65)] flex items-center justify-around z-50"
          aria-label="Mobile workspace navigation"
        >
          {MOBILE_NAV.map(({ to, icon: Icon, activeIcon: ActiveIcon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex-1 flex flex-col items-center justify-center gap-0.5 h-10 rounded-full transition-colors duration-150',
                  isActive ? 'text-[#FAFAFA]' : 'text-[#71717A] hover:text-[#A1A1AA]',
                )
              }
            >
              {({ isActive }) => {
                const RouteIcon = isActive ? ActiveIcon : Icon
                return (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="mobile-nav-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        className="absolute inset-0 bg-white/[0.1] border border-white/[0.08] rounded-full"
                      />
                    )}
                    <RouteIcon size={18} className="relative z-10" />
                    <span className="relative z-10 text-[10px] font-medium leading-none">{label}</span>
                  </>
                )
              }}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
