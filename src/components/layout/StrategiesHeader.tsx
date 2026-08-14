import { Link } from 'react-router'
import {
  Layers3,
} from 'lucide-react'
import { DesktopWorkspaceNav } from '@/components/layout/WorkspaceNav'


interface StrategiesHeaderProps {
  title?: string
  subtitle?: string
}

export function StrategiesHeader({ title = 'Strategies', subtitle }: StrategiesHeaderProps) {
  return (
    <header className="h-14 border-b border-white/[0.08] bg-[#070709]/95 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-40">
      {/* Brand & Page Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/dashboard" className="flex items-center gap-2 shrink-0 group">
          <div className="w-7 h-7 bg-[#0d1117] flex items-center justify-center group-hover:border-white/[0.25] transition-colors">
            <img src="/TRAXO-icon.png" alt="TRAXO" className="w-4 h-4 object-contain" />
          </div>
          <span className="text-[11px] font-black tracking-[0.22em] uppercase text-white hidden sm:inline">
            TRAXO
          </span>
        </Link>

        <span className="h-4 w-px bg-white/[0.1] hidden sm:block shrink-0" />

        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1117] border border-white/[0.08]">
            <Layers3 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-semibold text-slate-200 truncate">{title}</span>
          </div>

          {subtitle && (
            <span className="text-[10px] text-slate-500 font-medium hidden md:inline truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Center Desktop Navigation */}
      <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl">
        <DesktopWorkspaceNav />
      </div>

      {/* Right User Profile Dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Connection Pulse */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0d1117] border border-white/[0.08]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Engine Online</span>
        </div>

      </div>
    </header>
  )
}
