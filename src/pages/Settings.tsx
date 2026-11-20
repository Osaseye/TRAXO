import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  PiArrowsClockwise,
  PiArrowUpRight,
  PiCheck,
  PiPower,
  PiSlidersHorizontal,
  PiSpeakerHigh,
} from 'react-icons/pi'
import {
  ONBOARDING_STRATEGIES,
  type OnboardingStrategyId,
  useOnboardingStore,
} from '@/stores/useOnboardingStore'
import {
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
} from '@/stores/useTradingContextStore'
import { useMetaApi } from '@/hooks/useMetaApi'
import { getTradingContext, postTradingContext } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

const NOTIF_SYMBOL_GROUPS: Array<{ label: string; symbols: ChartSymbol[] }> = [
  {
    label: 'Forex',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'],
  },
  { label: 'Metals', symbols: ['XAUUSD', 'XAGUSD'] },
  {
    label: 'Stocks',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI'],
  },
]

const NOTIF_TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

const ALLOWED_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'forex', label: 'Forex Pairs' },
  { id: 'metals', label: 'Precious Metals' },
  { id: 'stocks', label: 'US Equities' },
]

const BROKER_STORAGE_KEY = 'traxo-broker-desk-config'

interface BrokerDeskConfig {
  platform: 'exness-mt5' | 'exness-mt4' | 'custom-mt5'
  loginId: string
  serverName: string
  executionMode: 'market' | 'limit'
}

function loadBrokerDeskConfig(): BrokerDeskConfig {
  try {
    const raw = localStorage.getItem(BROKER_STORAGE_KEY)
    if (raw) {
      return {
        platform: 'exness-mt5',
        loginId: '',
        serverName: 'Exness-MT5Real',
        executionMode: 'market',
        ...JSON.parse(raw),
      }
    }
  } catch {
    // ignore storage parse failures
  }
  return {
    platform: 'exness-mt5',
    loginId: '',
    serverName: 'Exness-MT5Real',
    executionMode: 'market',
  }
}

function playTestChime() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.14, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    gain.connect(ctx.destination)
    ;[523.25, 659.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1)
      osc.connect(gain)
      osc.start(ctx.currentTime + idx * 0.1)
      osc.stop(ctx.currentTime + idx * 0.1 + 0.15)
    })
    setTimeout(() => {
      void ctx.close()
    }, 500)
  } catch {
    // AudioContext unavailable
  }
}

function TogglePill({
  enabled,
  onToggle,
  disabled = false,
  label,
}: {
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      aria-label={label}
      className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-end sm:justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          'relative inline-flex h-7 w-12 sm:h-6 sm:w-11 shrink-0 items-center overflow-hidden rounded-full p-1 transition-colors',
          enabled ? 'bg-[#34D399]/25' : 'bg-[#18181B]',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 sm:h-4 sm:w-4 rounded-full transition-transform duration-150',
            enabled ? 'translate-x-5 bg-[#34D399]' : 'translate-x-0 bg-[#71717A]',
          )}
        />
      </span>
    </button>
  )
}

type SettingsSectionTab = 'all' | 'broker' | 'risk' | 'engines' | 'alerts'

const SETTINGS_MOBILE_TABS: Array<{ id: SettingsSectionTab; label: string }> = [
  { id: 'all', label: 'All Settings' },
  { id: 'broker', label: 'Exness MT5' },
  { id: 'risk', label: 'Risk Guardrails' },
  { id: 'engines', label: 'Engines' },
  { id: 'alerts', label: 'Alerts & Audio' },
]

export default function Settings() {
  const selectedStrategyId = useOnboardingStore((s) => s.selectedStrategyId)
  const selectedStrategyIds = useOnboardingStore((s) => s.selectedStrategyIds)
  const setSelectedStrategies = useOnboardingStore((s) => s.setSelectedStrategies)
  const toggleSelectedStrategy = useOnboardingStore((s) => s.toggleSelectedStrategy)

  const accountBalance = useTradingContextStore((s) => s.accountBalance)
  const setAccountBalance = useTradingContextStore((s) => s.setAccountBalance)
  const riskMode = useTradingContextStore((s) => s.riskMode)
  const setRiskMode = useTradingContextStore((s) => s.setRiskMode)
  const fixedRiskAmount = useTradingContextStore((s) => s.fixedRiskAmount)
  const setFixedRiskAmount = useTradingContextStore((s) => s.setFixedRiskAmount)
  const autoSyncBrokerBalance = useTradingContextStore((s) => s.autoSyncBrokerBalance)
  const setAutoSyncBrokerBalance = useTradingContextStore((s) => s.setAutoSyncBrokerBalance)
  const riskPerTradePct = useTradingContextStore((s) => s.riskPerTradePct)
  const setRiskPerTradePct = useTradingContextStore((s) => s.setRiskPerTradePct)
  const maxDailyLossPct = useTradingContextStore((s) => s.maxDailyLossPct)
  const setMaxDailyLossPct = useTradingContextStore((s) => s.setMaxDailyLossPct)

  const autoTradeMinConfidence = useTradingContextStore((s) => s.autoTradeMinConfidence)
  const setAutoTradeMinConfidence = useTradingContextStore((s) => s.setAutoTradeMinConfidence)
  const autoTradeMaxPositions = useTradingContextStore((s) => s.autoTradeMaxPositions)
  const setAutoTradeMaxPositions = useTradingContextStore((s) => s.setAutoTradeMaxPositions)
  const autoTradeMinRR = useTradingContextStore((s) => s.autoTradeMinRR)
  const setAutoTradeMinRR = useTradingContextStore((s) => s.setAutoTradeMinRR)
  const autoTradeSessionFilter = useTradingContextStore((s) => s.autoTradeSessionFilter)
  const setAutoTradeSessionFilter = useTradingContextStore((s) => s.setAutoTradeSessionFilter)
  const autoTradeAllowedCategories = useTradingContextStore((s) => s.autoTradeAllowedCategories)
  const toggleAutoTradeAllowedCategory = useTradingContextStore((s) => s.toggleAutoTradeAllowedCategory)
  const autoTradeCooldownOnLoss = useTradingContextStore((s) => s.autoTradeCooldownOnLoss)
  const setAutoTradeCooldownOnLoss = useTradingContextStore((s) => s.setAutoTradeCooldownOnLoss)
  const autoTradeCorrelationShield = useTradingContextStore((s) => s.autoTradeCorrelationShield)
  const setAutoTradeCorrelationShield = useTradingContextStore((s) => s.setAutoTradeCorrelationShield)
  const autoTradeNewsFilter = useTradingContextStore((s) => s.autoTradeNewsFilter)
  const setAutoTradeNewsFilter = useTradingContextStore((s) => s.setAutoTradeNewsFilter)
  const autoTradeSpreadCapPips = useTradingContextStore((s) => s.autoTradeSpreadCapPips)
  const setAutoTradeSpreadCapPips = useTradingContextStore((s) => s.setAutoTradeSpreadCapPips)

  const notifToastEnabled = useTradingContextStore((s) => s.notifToastEnabled)
  const setNotifToastEnabled = useTradingContextStore((s) => s.setNotifToastEnabled)
  const notifSoundEnabled = useTradingContextStore((s) => s.notifSoundEnabled)
  const setNotifSoundEnabled = useTradingContextStore((s) => s.setNotifSoundEnabled)
  const notifPushEnabled = useTradingContextStore((s) => s.notifPushEnabled)
  const setNotifPushEnabled = useTradingContextStore((s) => s.setNotifPushEnabled)
  const notifMinConfidencePct = useTradingContextStore((s) => s.notifMinConfidencePct)
  const setNotifMinConfidencePct = useTradingContextStore((s) => s.setNotifMinConfidencePct)
  const notifSymbolFilters = useTradingContextStore((s) => s.notifSymbolFilters)
  const setNotifSymbolFilters = useTradingContextStore((s) => s.setNotifSymbolFilters)
  const toggleNotifSymbolFilter = useTradingContextStore((s) => s.toggleNotifSymbolFilter)
  const notifTimeframeFilters = useTradingContextStore((s) => s.notifTimeframeFilters)
  const setNotifTimeframeFilters = useTradingContextStore((s) => s.setNotifTimeframeFilters)
  const toggleNotifTimeframeFilter = useTradingContextStore((s) => s.toggleNotifTimeframeFilter)
  const notifStrategyFilters = useTradingContextStore((s) => s.notifStrategyFilters)
  const setNotifStrategyFilters = useTradingContextStore((s) => s.setNotifStrategyFilters)
  const toggleNotifStrategyFilter = useTradingContextStore((s) => s.toggleNotifStrategyFilter)

  const {
    account: metaAccount,
    positions: metaPositions,
    autoTradeEnabled,
    loading: metaLoading,
    toggleAutoTrade,
    refreshAccount,
    refreshPositions,
  } = useMetaApi()

  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [maxConsecutiveLossCap, setMaxConsecutiveLossCap] = useState<number>(3)
  const [brokerConfig, setBrokerConfig] = useState<BrokerDeskConfig>(loadBrokerDeskConfig)
  const [brokerSavedToast, setBrokerSavedToast] = useState(false)
  const [mobileTab, setMobileTab] = useState<SettingsSectionTab>('all')

  useEffect(() => {
    if ('Notification' in window) {
      const t = setTimeout(() => setPushPermission(Notification.permission), 0)
      return () => clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    getTradingContext()
      .then((ctx) => {
        if (ctx && typeof ctx.maxConsecutiveLossCap === 'number' && ctx.maxConsecutiveLossCap > 0) {
          setMaxConsecutiveLossCap(ctx.maxConsecutiveLossCap)
        }
      })
      .catch(() => {
        // non-fatal when backend offline
      })
  }, [])

  function updateBrokerField<K extends keyof BrokerDeskConfig>(key: K, value: BrokerDeskConfig[K]) {
    setBrokerConfig((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(BROKER_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage failures
      }
      return next
    })
    setBrokerSavedToast(true)
    setTimeout(() => setBrokerSavedToast(false), 1800)
  }

  function handleConsecLossChange(val: number) {
    const safe = Math.max(1, Math.min(10, Math.round(val) || 3))
    setMaxConsecutiveLossCap(safe)
    postTradingContext({ maxConsecutiveLossCap: safe }).catch(() => {})
  }

  const riskBudget =
    riskMode === 'fixedAmount' ? fixedRiskAmount : (accountBalance * riskPerTradePct) / 100
  const dailyLossBudget = (accountBalance * maxDailyLossPct) / 100
  const activeIds =
    selectedStrategyIds && selectedStrategyIds.length > 0 ? selectedStrategyIds : [selectedStrategyId]

  const showSection = (section: Exclude<SettingsSectionTab, 'all'>) =>
    mobileTab === 'all' || mobileTab === section

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-[#71717A]">Workspace Preferences</p>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
              Settings
            </h1>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
              Configure Exness MT5 connectivity, execution guardrails, active engines, and alert routing.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
            <Link
              to="/notifications?tab=telemetry"
              className="min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl border border-white/[0.07] bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <PiSlidersHorizontal className="h-4 w-4 text-[#A1A1AA] shrink-0" />
              <span className="truncate">Engine Health</span>
            </Link>
            <Link
              to="/dashboard"
              className="min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Terminal</span>
              <PiArrowUpRight className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>

        {/* Mobile Horizontally Scrollable Section Pill Tabs */}
        <div className="md:hidden -mx-4 px-4 overflow-x-auto pb-1">
          <div
            role="tablist"
            aria-label="Settings sections"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#111113] border border-white/[0.07] p-1"
          >
            {SETTINGS_MOBILE_TABS.map((tab) => {
              const active = mobileTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    'min-h-[44px] px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 1. Exness MT5 Connection */}
        <section className={cn('space-y-3', !showSection('broker') && 'hidden md:block')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                Exness MT5 Connection
              </h2>
              <p className="text-[13px] text-[#71717A]">
                RPC terminal execution bridge, auto-trade master switch, and broker telemetry.
              </p>
            </div>
            {brokerSavedToast && (
              <span className="text-[12px] font-medium text-[#34D399] shrink-0">Saved locally</span>
            )}
          </div>

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            {/* Bridge Master Row */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2.5 sm:space-y-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[14px] font-medium text-[#FAFAFA]">
                    MetaApi Execution Bridge
                  </span>
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[12px] font-medium',
                      metaAccount?.connected
                        ? 'bg-[#34D399]/10 text-[#34D399]'
                        : 'bg-[#F87171]/10 text-[#F87171]',
                    )}
                  >
                    {metaAccount?.connected ? 'Connected' : metaAccount?.state || 'Disconnected'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-x-2 text-[12.5px] sm:text-[13px] text-[#71717A]">
                  <div className="rounded-lg bg-[#161619] px-2.5 py-1.5 sm:bg-transparent sm:p-0">
                    <span className="block sm:inline text-[11px] sm:text-[13px] text-[#71717A]">Balance </span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] sm:text-[#A1A1AA]">
                      {formatCurrency(metaAccount?.balance ?? 0)}
                    </span>
                  </div>
                  <span className="hidden sm:inline">·</span>
                  <div className="rounded-lg bg-[#161619] px-2.5 py-1.5 sm:bg-transparent sm:p-0">
                    <span className="block sm:inline text-[11px] sm:text-[13px] text-[#71717A]">Equity </span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] sm:text-[#A1A1AA]">
                      {formatCurrency(metaAccount?.equity ?? 0)}
                    </span>
                  </div>
                  <span className="hidden sm:inline">·</span>
                  <div className="rounded-lg bg-[#161619] px-2.5 py-1.5 sm:bg-transparent sm:p-0">
                    <span className="block sm:inline text-[11px] sm:text-[13px] text-[#71717A]">Open </span>
                    <span className="font-mono tabular-nums text-[#FAFAFA] sm:text-[#A1A1AA]">
                      {metaPositions.length}/{autoTradeMaxPositions}
                    </span>
                  </div>
                  {metaAccount?.leverage ? (
                    <>
                      <span className="hidden sm:inline">·</span>
                      <div className="rounded-lg bg-[#161619] px-2.5 py-1.5 sm:bg-transparent sm:p-0">
                        <span className="block sm:inline text-[11px] sm:text-[13px] text-[#71717A] sm:hidden">Leverage </span>
                        <span className="font-mono tabular-nums text-[#FAFAFA] sm:text-[#A1A1AA]">
                          1:{metaAccount.leverage}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    void refreshAccount()
                    void refreshPositions()
                  }}
                  disabled={metaLoading}
                  className="min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <PiArrowsClockwise className={cn('h-4 w-4 text-[#A1A1AA]', metaLoading && 'animate-spin')} />
                  <span>Sync</span>
                </button>

                <button
                  type="button"
                  onClick={() => void toggleAutoTrade(!autoTradeEnabled)}
                  disabled={metaLoading}
                  className={cn(
                    'min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50',
                    autoTradeEnabled
                      ? 'bg-[#34D399]/15 text-[#34D399] hover:bg-[#34D399]/20'
                      : 'bg-[#F87171]/15 text-[#F87171] hover:bg-[#F87171]/20',
                  )}
                >
                  <PiPower className="h-4 w-4 shrink-0" />
                  <span className="truncate">{autoTradeEnabled ? 'Auto-Trade On' : 'Auto-Trade Off'}</span>
                </button>
              </div>
            </div>

            {/* Platform */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Broker Platform</div>
                <div className="text-[13px] text-[#71717A]">
                  Select your Exness or custom MetaTrader routing terminal.
                </div>
              </div>
              <select
                value={brokerConfig.platform}
                onChange={(e) =>
                  updateBrokerField('platform', e.target.value as BrokerDeskConfig['platform'])
                }
                aria-label="Broker Platform"
                className="w-full sm:w-56 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] outline-none focus:border-white/[0.2]"
              >
                <option value="exness-mt5">Exness MT5</option>
                <option value="exness-mt4">Exness MT4</option>
                <option value="custom-mt5">Custom MT5 Server</option>
              </select>
            </div>

            {/* Login ID */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Account Login ID</div>
                <div className="text-[13px] text-[#71717A]">
                  MetaTrader account identifier saved locally for terminal reference.
                </div>
              </div>
              <input
                type="text"
                value={brokerConfig.loginId}
                onChange={(e) => updateBrokerField('loginId', e.target.value)}
                placeholder="MT5 Login ID"
                className="w-full sm:w-56 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/[0.2]"
              />
            </div>

            {/* Broker Server */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Broker Server</div>
                <div className="text-[13px] text-[#71717A]">
                  Target Exness server cluster hostname.
                </div>
              </div>
              <input
                type="text"
                value={brokerConfig.serverName}
                onChange={(e) => updateBrokerField('serverName', e.target.value)}
                placeholder="e.g. Exness-MT5Real14"
                className="w-full sm:w-56 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-white/[0.2]"
              />
            </div>

            {/* Auto-Sync Balance */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-row items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Auto-Sync Balance</div>
                <div className="text-[13px] text-[#71717A]">
                  Continuously match sizing baseline to live Exness equity.
                </div>
              </div>
              <TogglePill
                enabled={autoSyncBrokerBalance}
                onToggle={() => setAutoSyncBrokerBalance(!autoSyncBrokerBalance)}
                label="Toggle Auto-Sync Balance"
              />
            </div>
          </div>
        </section>

        {/* 2. Risk & Execution Guardrails */}
        <section className={cn('space-y-3', !showSection('risk') && 'hidden md:block')}>
          <div>
            <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              Risk &amp; Execution Guardrails
            </h2>
            <p className="text-[13px] text-[#71717A]">
              Synced with your trading context and enforced atomically before MetaApi order routing.
            </p>
          </div>

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            {/* Position Sizing Mode */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Position Sizing Mode</div>
                <div className="text-[13px] text-[#71717A]">
                  Calculate lot sizes from a fixed dollar risk or percentage of equity.
                </div>
              </div>
              <div className="grid grid-cols-2 sm:inline-flex items-center rounded-xl bg-[#18181B] p-1 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setRiskMode('fixedAmount')}
                  className={cn(
                    'min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-lg text-[13px] font-medium transition-colors',
                    riskMode === 'fixedAmount'
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  Fixed Risk ($)
                </button>
                <button
                  type="button"
                  onClick={() => setRiskMode('percentage')}
                  className={cn(
                    'min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-lg text-[13px] font-medium transition-colors',
                    riskMode === 'percentage'
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  Percentage (%)
                </button>
              </div>
            </div>

            {/* Account Baseline */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Account Baseline ($)</div>
                <div className="text-[13px] text-[#71717A]">
                  Active sizing equity baseline (
                  <span className="font-mono tabular-nums text-[#A1A1AA]">
                    {formatCurrency(accountBalance)}
                  </span>
                  ).
                  {metaAccount?.connected && typeof metaAccount.balance === 'number' && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => setAccountBalance(Number(metaAccount.balance?.toFixed(2)))}
                        className="text-[#34D399] hover:underline font-medium"
                      >
                        Sync {formatCurrency(metaAccount.balance)}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <input
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(Number(e.target.value))}
                className="w-full sm:w-44 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
              />
            </div>

            {/* Per-Trade Risk */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  {riskMode === 'fixedAmount' ? 'Fixed Risk Per Trade ($)' : 'Risk Per Trade (%)'}
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Maximum capital risked per signal (budget:{' '}
                  <span className="font-mono tabular-nums text-[#34D399]">
                    {formatCurrency(riskBudget)}
                  </span>
                  ).
                </div>
              </div>
              {riskMode === 'fixedAmount' ? (
                <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, accountBalance)}
                    step={5}
                    value={fixedRiskAmount || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value)
                      setFixedRiskAmount(Number.isNaN(val) ? 0 : val)
                    }}
                    className="w-full sm:w-44 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                  />
                  <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5">
                    {[10, 25, 50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setFixedRiskAmount(amt)}
                        className={cn(
                          'min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                          fixedRiskAmount === amt
                            ? 'bg-[#FAFAFA] text-[#09090B] font-medium'
                            : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                        )}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={riskPerTradePct}
                  onChange={(e) => setRiskPerTradePct(Number(e.target.value))}
                  className="w-full sm:w-44 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                />
              )}
            </div>

            {/* Rule D.1 Daily Loss Cap */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Daily Loss Cap (Rule D.1)</div>
                <div className="text-[13px] text-[#71717A]">
                  Hard daily drawdown circuit breaker at{' '}
                  <span className="font-mono tabular-nums text-[#F87171]">
                    {formatCurrency(dailyLossBudget)}
                  </span>
                  .
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={maxDailyLossPct}
                  onChange={(e) => setMaxDailyLossPct(Number(e.target.value))}
                  className="flex-1 sm:flex-none sm:w-28 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                />
                <span className="text-[13px] font-mono text-[#71717A] shrink-0">%</span>
              </div>
            </div>

            {/* Rule A.1 Min Confidence */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Minimum Confidence (Rule A.1)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Reject signals below this conviction score before MT5 order dispatch.
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    min={50}
                    max={95}
                    value={autoTradeMinConfidence}
                    onChange={(e) => setAutoTradeMinConfidence(Number(e.target.value))}
                    className="flex-1 sm:flex-none sm:w-24 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                  />
                  <span className="text-[13px] font-mono text-[#71717A] shrink-0">%</span>
                </div>
                <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-1.5">
                  {[55, 65, 75, 80, 85].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAutoTradeMinConfidence(v)}
                      className={cn(
                        'min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                        autoTradeMinConfidence === v
                          ? 'bg-[#FAFAFA] text-[#09090B] font-medium'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rule A.2 Min R:R */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Minimum Risk:Reward (Rule A.2)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Enforce asymmetric payoff floor and reject sub-threshold R:R setups.
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    min={1.0}
                    max={4.0}
                    step={0.1}
                    value={autoTradeMinRR}
                    onChange={(e) => setAutoTradeMinRR(Number(e.target.value))}
                    className="flex-1 sm:flex-none sm:w-24 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                  />
                  <span className="text-[13px] font-mono text-[#71717A] shrink-0">R</span>
                </div>
                <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-1.5">
                  {[1.5, 1.8, 2.0, 2.5, 3.0].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAutoTradeMinRR(v)}
                      className={cn(
                        'min-h-[38px] sm:min-h-0 px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                        Math.abs(autoTradeMinRR - v) < 0.05
                          ? 'bg-[#FAFAFA] text-[#09090B] font-medium'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {v.toFixed(1)}R
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rule B.4 Max Open Positions */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Max Open Positions (Rule B.4)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Hard cap on simultaneous open Exness MT5 positions across all pairs.
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={autoTradeMaxPositions}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!Number.isNaN(val) && val >= 1) setAutoTradeMaxPositions(val)
                  }}
                  className="w-full sm:w-24 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                />
                <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-1.5">
                  {[1, 3, 5, 10, 15].map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setAutoTradeMaxPositions(pos)}
                      className={cn(
                        'min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                        autoTradeMaxPositions === pos
                          ? 'bg-[#FAFAFA] text-[#09090B] font-medium'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rule C.9 Max Spread Cap */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Max Spread Cap (Rule C.9)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Abort entry if live broker bid/ask spread exceeds this pip ceiling.
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    min={0.5}
                    max={15}
                    step={0.5}
                    value={autoTradeSpreadCapPips}
                    onChange={(e) => setAutoTradeSpreadCapPips(Number(e.target.value))}
                    className="flex-1 sm:flex-none sm:w-24 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] font-mono tabular-nums text-[#FAFAFA] text-right outline-none focus:border-white/[0.2]"
                  />
                  <span className="text-[13px] text-[#71717A] shrink-0">pips</span>
                </div>
                <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1.5">
                  {[1.5, 2.5, 3.5, 5.0].map((pips) => (
                    <button
                      key={pips}
                      type="button"
                      onClick={() => setAutoTradeSpreadCapPips(pips)}
                      className={cn(
                        'min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded-lg text-[12px] font-mono tabular-nums transition-colors',
                        autoTradeSpreadCapPips === pips
                          ? 'bg-[#FAFAFA] text-[#09090B] font-medium'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {pips}p
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rule C.10 Session Window */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Session Window (Rule C.10)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Restrict automated execution to peak institutional liquidity windows (UTC).
                </div>
              </div>
              <select
                value={autoTradeSessionFilter}
                onChange={(e) =>
                  setAutoTradeSessionFilter(e.target.value as 'all' | 'london_ny' | 'ny_only')
                }
                aria-label="Session Window"
                className="w-full sm:w-56 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] text-[13px] text-[#FAFAFA] outline-none focus:border-white/[0.2]"
              >
                <option value="all">24/7 All Sessions</option>
                <option value="london_ny">London + NY (07–20 UTC)</option>
                <option value="ny_only">New York Only (12–21 UTC)</option>
              </select>
            </div>

            {/* Rule D.2 Loss Streak Cooldown */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Loss Streak Cooldown (Rule D.2)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Pause automated trading after consecutive resolved losses reach the ceiling.
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-1.5">
                  {[2, 3, 4, 5].map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => handleConsecLossChange(cap)}
                      className={cn(
                        'w-10 h-10 sm:w-8 sm:h-8 rounded-xl text-[12px] font-mono tabular-nums transition-colors',
                        maxConsecutiveLossCap === cap
                          ? 'bg-[#FAFAFA] text-[#09090B] font-medium'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {cap}
                    </button>
                  ))}
                </div>
                <TogglePill
                  enabled={autoTradeCooldownOnLoss}
                  onToggle={() => setAutoTradeCooldownOnLoss(!autoTradeCooldownOnLoss)}
                  label="Toggle Loss Streak Cooldown"
                />
              </div>
            </div>

            {/* Rule B.7 USD Correlation Shield */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-row items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  USD Correlation Shield (Rule B.7)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Prevents stacking 2+ directional positions carrying identical net USD exposure.
                </div>
              </div>
              <TogglePill
                enabled={autoTradeCorrelationShield}
                onToggle={() => setAutoTradeCorrelationShield(!autoTradeCorrelationShield)}
                label="Toggle USD Correlation Shield"
              />
            </div>

            {/* Rule D.3 Tier-1 News Freeze */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-row items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Tier-1 News Freeze (Rule D.3)
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Blocks entries ahead of scheduled high-impact CPI, NFP, and FOMC releases.
                </div>
              </div>
              <TogglePill
                enabled={autoTradeNewsFilter}
                onToggle={() => setAutoTradeNewsFilter(!autoTradeNewsFilter)}
                label="Toggle Tier-1 News Freeze"
              />
            </div>

            {/* Execution Asset Universe */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">
                  Execution Asset Universe
                </div>
                <div className="text-[13px] text-[#71717A]">
                  Restrict automated execution to selected market classes.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ALLOWED_CATEGORIES.map((cat) => {
                  const active = autoTradeAllowedCategories.includes(cat.id)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleAutoTradeAllowedCategory(cat.id)}
                      className={cn(
                        'min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-xl text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-[#FAFAFA] text-[#09090B]'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {cat.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Active Strategy Engines */}
        <section className={cn('space-y-3', !showSection('engines') && 'hidden md:block')}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                Active Strategy Engines
              </h2>
              <p className="text-[13px] text-[#71717A]">
                All 5 quantitative engines are unlocked for concurrent monitoring and execution.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSelectedStrategies(ONBOARDING_STRATEGIES.map((s) => s.id as OnboardingStrategyId))
              }
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] text-center transition-colors"
            >
              Enable All 5 Engines
            </button>
          </div>

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            {ONBOARDING_STRATEGIES.map((strategy) => {
              const isSelected = activeIds.includes(strategy.id)
              return (
                <div
                  key={strategy.id}
                  className="p-4 sm:p-5 sm:px-6 flex flex-row items-center justify-between gap-4"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#FAFAFA] truncate">
                        {strategy.name}
                      </span>
                      {isSelected && <PiCheck className="h-4 w-4 text-[#34D399] shrink-0" />}
                    </div>
                    <p className="text-[12.5px] sm:text-[13px] text-[#71717A]">
                      Historical target{' '}
                      <span className="font-mono tabular-nums text-[#A1A1AA]">
                        {strategy.winRate}
                      </span>{' '}
                      win rate · ~
                      <span className="font-mono tabular-nums text-[#A1A1AA]">
                        {strategy.signalsPerDay}
                      </span>{' '}
                      setups/day
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                    <span
                      className={cn(
                        'hidden sm:inline text-[12px] font-medium',
                        isSelected ? 'text-[#34D399]' : 'text-[#71717A]',
                      )}
                    >
                      {isSelected ? 'Active' : 'Standby'}
                    </span>
                    <TogglePill
                      enabled={isSelected}
                      onToggle={() => toggleSelectedStrategy(strategy.id)}
                      label={`Toggle ${strategy.name}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 4. Alerts & Audio */}
        <section className={cn('space-y-3', !showSection('alerts') && 'hidden md:block')}>
          <div>
            <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              Alerts &amp; Audio
            </h2>
            <p className="text-[13px] text-[#71717A]">
              Control in-terminal signal toasts, Web Audio chime synthesis, OS push alerts, and routing filters.
            </p>
          </div>

          <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
            {/* In-App Toasts */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-row items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-[14px] font-medium text-[#FAFAFA]">In-App Signal Toasts</div>
                <div className="text-[13px] text-[#71717A]">
                  Non-blocking setup cards inside the trading workspace.
                </div>
              </div>
              <TogglePill
                enabled={notifToastEnabled}
                onToggle={() => setNotifToastEnabled(!notifToastEnabled)}
                label="Toggle In-App Signal Toasts"
              />
            </div>

            {/* Audio Chime */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Audio Chime</div>
                <div className="text-[13px] text-[#71717A]">
                  Directional Web Audio tone when a live signal triggers.
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={playTestChime}
                  className="min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#18181B] hover:bg-[#222227] text-[12px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
                >
                  <PiSpeakerHigh className="h-3.5 w-3.5" />
                  <span>Test Chime</span>
                </button>
                <TogglePill
                  enabled={notifSoundEnabled}
                  onToggle={() => setNotifSoundEnabled(!notifSoundEnabled)}
                  label="Toggle Audio Chime"
                />
              </div>
            </div>

            {/* OS Push Notifications */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-row items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-[14px] font-medium text-[#FAFAFA]">OS Push Notifications</div>
                <div className="text-[13px] text-[#71717A]">
                  System notifications when TRAXO is backgrounded.
                  {pushPermission === 'denied' && (
                    <span className="block text-[#F87171] mt-0.5">
                      Browser notification permission is currently blocked.
                    </span>
                  )}
                </div>
              </div>
              <TogglePill
                enabled={notifPushEnabled && pushPermission === 'granted'}
                disabled={pushPermission === 'denied'}
                label="Toggle OS Push Notifications"
                onToggle={() => {
                  const next = !notifPushEnabled
                  setNotifPushEnabled(next)
                  if (next && pushPermission === 'default' && 'Notification' in window) {
                    void Notification.requestPermission().then((result) => {
                      setPushPermission(result)
                      if (result !== 'granted') setNotifPushEnabled(false)
                    })
                  }
                }}
              />
            </div>

            {/* Confidence Floor */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Alert Confidence Floor</div>
                <div className="text-[13px] text-[#71717A]">
                  Minimum conviction score required to fire alert notifications.
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-64 min-h-[44px] sm:min-h-0">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={notifMinConfidencePct}
                  onChange={(e) => setNotifMinConfidencePct(Number(e.target.value))}
                  aria-label="Alert confidence floor"
                  className="flex-1 accent-[#FAFAFA] h-2 sm:h-1.5 bg-[#18181B] rounded-full appearance-none outline-none cursor-pointer"
                />
                <span className="w-12 text-right text-[13px] font-mono font-medium tabular-nums text-[#FAFAFA]">
                  {notifMinConfidencePct}%
                </span>
              </div>
            </div>

            {/* Timeframe Filters */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Timeframe Filters</div>
                <div className="text-[13px] text-[#71717A]">
                  Leave unselected to receive alerts on all chart timeframes.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setNotifTimeframeFilters([])}
                  className={cn(
                    'min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors',
                    notifTimeframeFilters.length === 0
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  All
                </button>
                {NOTIF_TIMEFRAMES.map((tf) => {
                  const active = notifTimeframeFilters.includes(tf)
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => toggleNotifTimeframeFilter(tf)}
                      className={cn(
                        'min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors',
                        active
                          ? 'bg-[#FAFAFA] text-[#09090B]'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {tf}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Strategy Filters */}
            <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <div className="text-[14px] font-medium text-[#FAFAFA]">Strategy Filters</div>
                <div className="text-[13px] text-[#71717A]">
                  Filter incoming alerts to specific strategy engines.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:max-w-md sm:justify-end">
                <button
                  type="button"
                  onClick={() => setNotifStrategyFilters([])}
                  className={cn(
                    'min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors',
                    notifStrategyFilters.length === 0
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  All Engines
                </button>
                {ONBOARDING_STRATEGIES.map((st) => {
                  const active = notifStrategyFilters.includes(st.id)
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => toggleNotifStrategyFilter(st.id)}
                      className={cn(
                        'min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors',
                        active
                          ? 'bg-[#FAFAFA] text-[#09090B]'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                      )}
                    >
                      {st.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Instrument Filters */}
            <div className="p-4 sm:p-5 sm:px-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-[14px] font-medium text-[#FAFAFA]">Instrument Filters</div>
                  <div className="text-[13px] text-[#71717A]">
                    Select specific pairs to monitor or keep all markets active.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifSymbolFilters([])}
                  className={cn(
                    'w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl text-[12px] font-medium transition-colors',
                    notifSymbolFilters.length === 0
                      ? 'bg-[#FAFAFA] text-[#09090B]'
                      : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                  )}
                >
                  All Markets
                </button>
              </div>

              <div className="space-y-3">
                {NOTIF_SYMBOL_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1.5">
                    <span className="text-[12px] font-medium text-[#71717A] block">
                      {group.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {group.symbols.map((symbol) => {
                        const active = notifSymbolFilters.includes(symbol)
                        return (
                          <button
                            key={symbol}
                            type="button"
                            onClick={() => toggleNotifSymbolFilter(symbol)}
                            className={cn(
                              'min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded-lg text-[12px] font-medium transition-colors',
                              active
                                ? 'bg-[#FAFAFA] text-[#09090B]'
                                : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]',
                            )}
                          >
                            {symbol}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
