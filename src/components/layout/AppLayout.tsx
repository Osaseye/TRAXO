import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

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

export function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

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
    <div className="obsidian-shell flex h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] overflow-hidden font-sans">
      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggle}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[#09090B]">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setMobileNavOpen(true)}
        />

        <main
          className="flex-1 min-h-0 overflow-auto bg-[#09090B]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
