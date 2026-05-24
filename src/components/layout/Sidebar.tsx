import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  BookOpenText,
  Zap,
  UserCircle2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Crown,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/journal', icon: BookOpenText, label: 'Trading Journal' },
  { to: '/strategies', icon: Zap, label: 'Strategies' },
  { to: '/profile', icon: UserCircle2, label: 'Profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-full bg-[#09090d] border-r border-[#1e293b] transition-all duration-200 shrink-0',
        collapsed ? 'w-[68px]' : 'w-[220px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-[60px] border-b border-[#1e293b] shrink-0 px-4">
        {collapsed ? (
          <img src="/TRAXO-icon.png" className="w-7 h-7 object-contain mx-auto" alt="" />
        ) : (
          <div className="flex items-center gap-2.5">
            <img src="/TRAXO-icon.png" className="w-7 h-7 object-contain" alt="" />
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-white">TRAXO</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-2.5')}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg text-[13px] font-medium transition-colors duration-100 select-none',
                    collapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-3 py-2.5',
                    isActive
                      ? 'bg-[#3b82f6]/10 text-[#3b82f6]'
                      : 'text-[#4b5563] hover:text-[#e5e7eb] hover:bg-white/[0.04]'
                  )
                }
                title={collapsed ? label : undefined}
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Analyst Mode badge */}
        {!collapsed && (
          <div className="px-2.5 mt-5">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#22c55e]/[0.05] border border-[#22c55e]/15">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-[#22c55e] leading-tight uppercase tracking-wider">Analyst Mode</p>
                <p className="text-[9px] text-[#374151] leading-tight mt-0.5">Phase 1 · Live</p>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Bottom: plan + collapse */}
      <div className="border-t border-[#1e293b] p-3 space-y-2 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f59e0b]/[0.06] border border-[#f59e0b]/20">
            <Crown size={11} className="text-[#f59e0b] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-[#f59e0b] leading-tight uppercase tracking-wider">Free Plan</p>
              <p className="text-[9px] text-[#4b5563] leading-tight mt-0.5 truncate">Upgrade for more signals</p>
            </div>
            <TrendingUp size={10} className="text-[#f59e0b] shrink-0 ml-auto" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-[#4b5563] hover:text-[#e5e7eb] hover:bg-white/[0.04] transition-colors mx-auto"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  )
}
