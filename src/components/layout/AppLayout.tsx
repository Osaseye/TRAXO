import { useState } from 'react'
import { Outlet, useLocation, Navigate, NavLink } from 'react-router'
import { LayoutDashboard, Zap, Settings, BookOpenText, UserCircle2 } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useAuthStore } from '@/stores/useAuthStore'
import { cn } from '@/lib/utils'

const pageMeta: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Live signals & market intelligence' },
  '/journal': { title: 'Trading Journal', subtitle: 'Review trade decisions and outcomes' },
  '/profile': { title: 'Profile', subtitle: 'Personal trading profile and account details' },
  '/strategies': { title: 'Strategies', subtitle: 'Configure and monitor your strategies' },
  '/settings': { title: 'Settings', subtitle: 'Account, API keys and risk configuration' },
}

const mobileNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/journal', icon: BookOpenText, label: 'Journal' },
  { to: '/strategies', icon: Zap, label: 'Strategies' },
  { to: '/profile', icon: UserCircle2, label: 'Profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { isAuthenticated, onboardingComplete } = useAuthStore()

  if (isAuthenticated && !onboardingComplete) {
    return <Navigate to="/onboarding" replace />
  }

  const meta = pageMeta[location.pathname] ?? { title: 'TRAXO' }

  return (
    <div className="flex h-screen bg-[#0b0f17] overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar title={meta.title} subtitle={meta.subtitle} />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-[#09090d] border-t border-[#1e293b] flex items-center z-40">
          {mobileNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors',
                  isActive ? 'text-[#3b82f6]' : 'text-[#374151]'
                )
              }
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
