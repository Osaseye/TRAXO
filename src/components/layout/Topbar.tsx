import { Bell, User } from 'lucide-react'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="h-[60px] flex items-center justify-between px-4 sm:px-6 border-b border-[#1e293b] bg-[#09090d] shrink-0">
      <div>
        <h1 className="text-[14px] font-semibold text-[#e5e7eb] leading-tight">{title}</h1>
        {subtitle && <p className="text-[11px] text-[#374151] leading-tight mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Live analyst mode */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#22c55e]/[0.07] border border-[#22c55e]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[10px] font-semibold text-[#22c55e] uppercase tracking-wider">Analyst Mode</span>
        </div>

        {/* Notifications */}
        <button className="relative w-8 h-8 flex items-center justify-center rounded-lg text-[#4b5563] hover:text-[#e5e7eb] hover:bg-white/[0.04] transition-colors">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
        </button>

        {/* User avatar */}
        <button className="w-8 h-8 rounded-lg bg-[#1e293b] flex items-center justify-center text-[#6b7280] hover:text-[#e5e7eb] transition-colors">
          <User size={14} />
        </button>
      </div>
    </header>
  )
}
