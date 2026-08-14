import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ChevronDown,
  Search,
  Zap,
  TrendingUp,
  Coins,
  BarChart3,
  Activity,
  Flame,
  User as UserIcon,
  LogOut,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { DesktopWorkspaceNav } from '@/components/layout/WorkspaceNav'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { cn } from '@/lib/utils'

export type SymbolOption =
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'XAUUSD'
  | 'XAGUSD'
  | 'AUDUSD'
  | 'USDCAD'
  | 'USDCHF'
  | 'NZDUSD'
  | 'EURJPY'
  | 'GBPJPY'
  | 'EURGBP'
  | 'SPX500'
  | 'NAS100'
  | 'US30'
  | 'DE40'
  | 'UK100'
  | 'JP225'
  | 'FRA40'
  | 'AUS200'
  | 'WTI'
  | 'BRENT'
  | 'NATGAS'
  | 'BTCUSDT'
  | 'ETHUSD'
  | 'SOLUSDT'
  | 'XRPUSDT'
  | 'ADAUSDT'
  | 'DOGEUSDT'
  | 'BNBUSDT'
  | 'AAPL'
  | 'MSFT'
  | 'NVDA'
  | 'TSLA'
  | 'AMZN'
  | 'META'
  | 'GOOGL'
  | 'NFLX'
  | 'AMD'
  | 'COIN'
  | 'MSTR'
  | 'SMCI'
  | 'MNQ'

export type MarketCategory = 'forex' | 'metals' | 'indices' | 'energy' | 'crypto' | 'stocks' | 'futures'

export const FX_SYMBOLS: SymbolOption[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP']
export const METAL_SYMBOLS: SymbolOption[] = ['XAUUSD', 'XAGUSD']
export const INDEX_SYMBOLS: SymbolOption[] = ['SPX500', 'NAS100', 'US30', 'DE40', 'UK100', 'JP225', 'FRA40', 'AUS200']
export const ENERGY_SYMBOLS: SymbolOption[] = ['WTI', 'BRENT', 'NATGAS']
export const CRYPTO_SYMBOLS: SymbolOption[] = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
export const STOCK_SYMBOLS: SymbolOption[] = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
export const FUTURES_SYMBOLS: SymbolOption[] = ['MNQ']

export const MARKET_CATEGORIES: Array<{ id: MarketCategory; label: string; icon: any; symbols: SymbolOption[] }> = [
  { id: 'forex', label: 'Forex', icon: Coins, symbols: FX_SYMBOLS },
  { id: 'metals', label: 'Metals', icon: Flame, symbols: METAL_SYMBOLS },
  { id: 'indices', label: 'Indices', icon: TrendingUp, symbols: INDEX_SYMBOLS },
  { id: 'energy', label: 'Energy', icon: Zap, symbols: ENERGY_SYMBOLS },
  { id: 'crypto', label: 'Crypto', icon: Coins, symbols: CRYPTO_SYMBOLS },
  { id: 'stocks', label: 'Stocks', icon: BarChart3, symbols: STOCK_SYMBOLS },
  { id: 'futures', label: 'Futures', icon: Activity, symbols: FUTURES_SYMBOLS },
]

export const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

interface DashboardHeaderProps {
  symbol: SymbolOption
  timeframe: ChartTimeframe
  onSymbolChange: (symbol: SymbolOption) => void
  onTimeframeChange: (timeframe: ChartTimeframe) => void
  accountBalance: number
  riskPerTradePct: number
  maxDailyLossPct: number
  todayLoss: number
  consecutiveLosses: number
  todayTakenCount: number
  strategyLabel: string
  displayName: string
}

export function DashboardHeader({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  accountBalance,
  riskPerTradePct,
  maxDailyLossPct,
  todayLoss,
  consecutiveLosses,
  strategyLabel,
  displayName,
}: DashboardHeaderProps) {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  // Dropdown & Popover states
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<MarketCategory>(() => {
    if (FX_SYMBOLS.includes(symbol)) return 'forex'
    if (METAL_SYMBOLS.includes(symbol)) return 'metals'
    if (INDEX_SYMBOLS.includes(symbol)) return 'indices'
    if (ENERGY_SYMBOLS.includes(symbol)) return 'energy'
    if (CRYPTO_SYMBOLS.includes(symbol)) return 'crypto'
    if (FUTURES_SYMBOLS.includes(symbol)) return 'futures'
    return 'stocks'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [riskShieldOpen, setRiskShieldOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const assetPickerRef = useRef<HTMLDivElement>(null)
  const riskShieldRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Sync activeCategory when symbol changes externally
  useEffect(() => {
    if (FX_SYMBOLS.includes(symbol)) setActiveCategory('forex')
    else if (METAL_SYMBOLS.includes(symbol)) setActiveCategory('metals')
    else if (INDEX_SYMBOLS.includes(symbol)) setActiveCategory('indices')
    else if (ENERGY_SYMBOLS.includes(symbol)) setActiveCategory('energy')
    else if (CRYPTO_SYMBOLS.includes(symbol)) setActiveCategory('crypto')
    else if (FUTURES_SYMBOLS.includes(symbol)) setActiveCategory('futures')
    else setActiveCategory('stocks')
  }, [symbol])

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (assetPickerRef.current && !assetPickerRef.current.contains(e.target as Node)) {
        setAssetPickerOpen(false)
      }
      if (riskShieldRef.current && !riskShieldRef.current.contains(e.target as Node)) {
        setRiskShieldOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Calculations for Risk Shield
  const safeBalance = Math.max(accountBalance, 0)
  const dailyLossCap = safeBalance * (Math.max(maxDailyLossPct, 0) / 100)
  const remainingDailyLoss = Math.max(0, dailyLossCap - todayLoss)
  const riskBudgetPerTrade = safeBalance * (Math.max(riskPerTradePct, 0) / 100)
  
  let capitalRisk: 'Low' | 'Medium' | 'High' = 'Low'
  if (remainingDailyLoss <= 0) capitalRisk = 'High'
  else if (remainingDailyLoss < dailyLossCap * 0.4) capitalRisk = 'Medium'

  const fmtUSD = (n: number) =>
    `$${n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })}`

  // Filtered symbols for Asset Picker
  const currentCategoryObj = MARKET_CATEGORIES.find((c) => c.id === activeCategory) ?? MARKET_CATEGORIES[0]
  const displayedSymbols = searchQuery.trim()
    ? MARKET_CATEGORIES.flatMap((c) => c.symbols).filter((s) => s.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : currentCategoryObj.symbols

  return (
    <header className="h-14 bg-[#070709]/90 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-5 flex items-center justify-between gap-3 shrink-0 relative z-30 select-none">
      {/* LEFT SECTION: Brand, Asset Selector & Timeframe Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand Logo & Live status */}
        <Link to="/dashboard" className="flex items-center gap-2 shrink-0 group">
          <div className="relative flex items-center justify-center">
            <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain group-hover:scale-105 transition-transform" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[12px] font-black tracking-[0.2em] uppercase text-white hidden xl:inline">TRAXO</span>
        </Link>

        <div className="h-4 w-px bg-white/[0.1] hidden sm:block shrink-0" />

        {/* CUSTOM ASSET PICKER DROPDOWN */}
        <div className="relative" ref={assetPickerRef}>
          <button
            onClick={() => setAssetPickerOpen((v) => !v)}
            className={cn(
              'h-9 px-3 rounded-xl border bg-[#0d1117] flex items-center gap-2 text-white font-semibold transition-all duration-200',
              'hover:bg-[#131924] hover:border-white/[0.2]',
              assetPickerOpen ? 'border-blue-500/60 ring-2 ring-blue-500/20' : 'border-white/[0.1]'
            )}
          >
            <span className="flex items-center gap-1.5 text-[12px]">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
                {activeCategory}
              </span>
              <span className="font-extrabold tracking-wide text-white">{symbol}</span>
            </span>
            <ChevronDown size={14} className={cn('text-gray-400 transition-transform duration-200', assetPickerOpen && 'rotate-180 text-blue-400')} />
          </button>

          {/* Asset Picker Popover */}
          {assetPickerOpen && (
            <div className="absolute top-11 left-0 w-[340px] sm:w-[380px] bg-[#0d1117] border border-white/[0.12] rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Search Bar */}
              <div className="relative mb-2.5">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search assets (e.g. BTC, XAU, NVDA)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 bg-[#070709] border border-white/[0.1] rounded-lg text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/60"
                  autoFocus
                />
              </div>

              {/* Category Tabs (shown if not actively filtering across all) */}
              {!searchQuery.trim() && (
                <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-2 scrollbar-none border-b border-white/[0.06]">
                  {MARKET_CATEGORIES.map((cat) => {
                    const Icon = cat.icon
                    const isSelected = activeCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={cn(
                          'h-6 px-2 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap flex items-center gap-1 transition-all',
                          isSelected
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        )}
                      >
                        <Icon size={11} />
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Symbol Grid */}
              <div className="max-h-[220px] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
                {displayedSymbols.map((s) => {
                  const isCurrent = s === symbol
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        onSymbolChange(s)
                        setAssetPickerOpen(false)
                        setSearchQuery('')
                      }}
                      className={cn(
                        'h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-between transition-all border',
                        isCurrent
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                          : 'bg-[#131924]/60 border-white/[0.06] text-gray-300 hover:border-white/[0.15] hover:text-white hover:bg-[#18202e]'
                      )}
                    >
                      <span>{s}</span>
                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER SECTION: Account & Risk Shield Widget & Strategy Badge */}
      <div className="hidden lg:flex items-center gap-3">
        {/* RISK SHIELD & BALANCE POPOVER */}
        <div className="relative" ref={riskShieldRef}>
          <button
            onClick={() => setRiskShieldOpen((v) => !v)}
            className={cn(
              'h-9 px-3 rounded-full border bg-[#0d1117] flex items-center gap-2 transition-all duration-200',
              'hover:bg-[#131924] hover:border-white/[0.2]',
              capitalRisk === 'High'
                ? 'border-red-500/40 text-red-400'
                : capitalRisk === 'Medium'
                ? 'border-amber-500/40 text-amber-300'
                : 'border-emerald-500/30 text-emerald-400'
            )}
          >
            {capitalRisk === 'High' ? (
              <ShieldAlert size={14} className="animate-pulse text-red-400" />
            ) : (
              <ShieldCheck size={14} className="text-emerald-400" />
            )}
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
              <span className="text-gray-400 font-medium">Balance</span>
              <span className="tracking-tight">{fmtUSD(accountBalance)}</span>
            </div>
            <ChevronDown size={12} className={cn('text-gray-400 transition-transform duration-200', riskShieldOpen && 'rotate-180')} />
          </button>

          {/* Risk Shield Popover Details */}
          {riskShieldOpen && (
            <div className="absolute top-11 left-1/2 -translate-x-1/2 w-[280px] bg-[#0d1117] border border-white/[0.12] rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider">Risk Shield</span>
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border',
                    capitalRisk === 'High'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : capitalRisk === 'Medium'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  )}
                >
                  {capitalRisk} Risk
                </span>
              </div>

              <div className="space-y-2.5 text-[11px]">
                <div className="flex justify-between items-center text-gray-300">
                  <span className="text-gray-400">Account Balance</span>
                  <span className="font-bold text-white">{fmtUSD(accountBalance)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-300">
                  <span className="text-gray-400">Daily Loss Cap ({maxDailyLossPct}%)</span>
                  <span className="font-semibold text-gray-200">{fmtUSD(dailyLossCap)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-300">
                  <span className="text-gray-400">Today's Total Loss</span>
                  <span className="font-semibold text-red-400">-${todayLoss.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/[0.06]">
                  <span className="text-gray-300 font-medium">Remaining Daily Cap</span>
                  <span className="font-extrabold text-emerald-400">{fmtUSD(remainingDailyLoss)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-300">
                  <span className="text-gray-400">Risk Budget / Trade</span>
                  <span className="font-semibold text-blue-400">{fmtUSD(riskBudgetPerTrade)}</span>
                </div>
                {consecutiveLosses > 0 && (
                  <div className="flex justify-between items-center text-amber-400 text-[10px] pt-1">
                    <span>Consecutive Losses</span>
                    <span className="font-bold">{consecutiveLosses} streak</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ACTIVE STRATEGY INDICATOR */}
        <div className="flex items-center h-8 px-3 rounded-lg border border-white/[0.08] bg-[#0d1117] gap-2 text-[11px] select-none">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Strategy</span>
          <span className="w-1 h-1 rounded-full bg-slate-600" />
          <span className="font-semibold tracking-wide text-slate-200">{strategyLabel}</span>
        </div>
      </div>

      {/* RIGHT SECTION: Workspace Navigation & User Profile Menu */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <DesktopWorkspaceNav />

        {/* USER PROFILE MENU DROPDOWN */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 h-9 px-2.5 rounded-xl bg-[#0d1117] border border-white/[0.1] text-gray-200 hover:text-white hover:border-white/[0.2] transition-all"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center text-[11px] font-bold shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] font-bold hidden sm:inline max-w-[7rem] truncate">{displayName}</span>
            <ChevronDown size={12} className={cn('text-gray-400 transition-transform duration-200', userMenuOpen && 'rotate-180')} />
          </button>

          {/* User Menu Popover */}
          {userMenuOpen && (
            <div className="absolute top-11 right-0 w-[220px] bg-[#0d1117] border border-white/[0.12] rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-2 border-b border-white/[0.08] mb-1">
                <p className="text-[12px] font-bold text-white truncate">{displayName}</p>
                <p className="text-[10px] text-gray-400 truncate">{user?.email || 'trader@traxo.io'}</p>
                <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {user?.plan === 'pro' ? 'PRO TRADER' : 'FREE PLAN'}
                </div>
              </div>

              <div className="space-y-0.5 text-[11px]">
                <button
                  onClick={() => {
                    navigate('/profile')
                    setUserMenuOpen(false)
                  }}
                  className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <UserIcon size={14} />
                  <span>Profile Account</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/settings')
                    setUserMenuOpen(false)
                  }}
                  className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <SettingsIcon size={14} />
                  <span>Settings & API Keys</span>
                </button>

                <button
                  onClick={() => {
                    void logout()
                    setUserMenuOpen(false)
                    navigate('/login')
                  }}
                  className="w-full h-8 px-2.5 rounded-lg flex items-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors mt-1"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
