import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { PiBell, PiList } from 'react-icons/pi'
import { useAuthStore } from '@/stores/useAuthStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'
import { useNotificationStore } from '@/stores/useNotificationStore'
import webSocketService from '@/lib/websocket'
import { cn } from '@/lib/utils'

interface TopbarProps {
  title: string
  subtitle?: string
  onMenuClick?: () => void
}

function subscribeWs(callback: () => void) {
  const socket = webSocketService.getClient()
  if (!socket) return () => {}
  socket.on('connect', callback)
  socket.on('disconnect', callback)
  socket.on('connect_error', callback)
  return () => {
    socket.off('connect', callback)
    socket.off('disconnect', callback)
    socket.off('connect_error', callback)
  }
}

function getWsSnapshot(): boolean {
  return Boolean(webSocketService.getClient()?.connected)
}

export function Topbar({ title, subtitle, onMenuClick }: TopbarProps) {
  const displayName = useAuthStore(
    (s) => s.user?.displayName || s.user?.fullName || s.user?.email || 'Operator',
  )
  const chartSymbol = useTradingContextStore((s) => s.chartSymbol)
  const chartTimeframe = useTradingContextStore((s) => s.chartTimeframe)
  const unreadCount = useNotificationStore(
    (s) => s.notifications.filter((n) => !n.read).length,
  )

  const wsConnected = useSyncExternalStore(subscribeWs, getWsSnapshot, () => false)
  const [mt5Connected, setMt5Connected] = useState<boolean>(false)

  useEffect(() => {
    let active = true

    async function checkMt5Status() {
      try {
        const res = await fetch('/api/metaapi/account')
        if (!active) return
        if (res.ok) {
          const data = (await res.json()) as { connected?: boolean }
          setMt5Connected(Boolean(data?.connected))
        } else {
          setMt5Connected(false)
        }
      } catch {
        if (active) setMt5Connected(false)
      }
    }

    void checkMt5Status()
    const timer = setInterval(() => {
      void checkMt5Status()
    }, 15_000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return (
    <header
      className="min-h-[56px] md:min-h-[52px] flex items-center justify-between gap-2 px-3 sm:px-6 border-b border-white/[0.06] bg-[#09090B]/95 backdrop-blur-sm shrink-0 select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Left: Mobile Drawer Trigger + Workspace Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={unreadCount > 0 ? `Open navigation menu (${unreadCount} unread alerts)` : 'Open navigation menu'}
            className="md:hidden relative w-11 h-11 -ml-1.5 rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors shrink-0"
          >
            <PiList size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#34D399]"
                aria-hidden="true"
              />
            )}
          </button>
        )}
        <h1 className="text-[15px] md:text-[14px] font-semibold tracking-[-0.01em] text-[#FAFAFA] truncate">
          {title}
        </h1>
        {subtitle && (
          <span className="hidden lg:inline-flex items-center gap-2 text-[13px] text-[#71717A] truncate">
            <span className="text-white/15">·</span>
            <span className="truncate">{subtitle}</span>
          </span>
        )}
      </div>

      {/* Right: Calm Inline Telemetry, Status Dots & Desktop Links */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* Active Symbol & Timeframe Summary (desktop/tablet) */}
        <Link
          to="/dashboard"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/[0.04] transition-colors"
          title="Open active chart in Terminal"
        >
          <span className="text-[12.5px] font-mono font-medium text-[#FAFAFA] tabular-nums">
            {chartSymbol}
          </span>
          <span className="text-[#52525B]">·</span>
          <span className="text-[12.5px] font-mono text-[#71717A] tabular-nums">
            {chartTimeframe}
          </span>
        </Link>

        <span className="hidden md:block w-px h-3.5 bg-white/[0.08]" aria-hidden="true" />

        {/* MT5 & WebSocket Connection Status Dots */}
        <div className="flex items-center gap-2.5 sm:gap-3 px-1">
          <span
            className="flex items-center gap-1.5"
            title={mt5Connected ? 'MT5 Bridge Connected' : 'MT5 Bridge Standby'}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                mt5Connected ? 'bg-[#34D399]' : 'bg-[#52525B]',
              )}
            />
            <span className="text-[11.5px] sm:text-[12px] font-medium text-[#A1A1AA]">
              MT5
            </span>
          </span>

          <span
            className="flex items-center gap-1.5"
            title={wsConnected ? 'WebSocket Stream Live' : 'WebSocket Disconnected'}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                wsConnected ? 'bg-[#34D399]' : 'bg-[#F87171]',
              )}
            />
            <span className="text-[11.5px] sm:text-[12px] font-medium text-[#A1A1AA]">
              WS
            </span>
          </span>
        </div>

        <span className="hidden md:block w-px h-3.5 bg-white/[0.08]" aria-hidden="true" />

        {/* Alert Indicator (desktop; mobile uses drawer Signals & Ops) */}
        <Link
          to="/notifications"
          className="hidden md:flex relative h-8 px-2 rounded-lg hover:bg-white/[0.05] items-center gap-1.5 text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          title="Signals & Ops Alerts"
          aria-label={unreadCount > 0 ? `${unreadCount} unread alerts` : 'Signals & Ops Alerts'}
        >
          <PiBell size={16} />
          {unreadCount > 0 && (
            <span className="text-[11px] font-mono font-medium tabular-nums text-[#FAFAFA] bg-white/[0.08] rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Operator Profile (desktop; mobile uses drawer Profile) */}
        <Link
          to="/profile"
          className="hidden md:flex h-8 px-2 rounded-lg hover:bg-white/[0.05] items-center gap-2 text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          title="Operator Profile"
        >
          <span className="w-5 h-5 rounded-full bg-white/[0.08] text-[#FAFAFA] flex items-center justify-center text-[11px] font-medium shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="text-[13px] font-medium max-w-[7rem] truncate text-[#E4E4E7]">
            {displayName}
          </span>
        </Link>
      </div>
    </header>
  )
}
