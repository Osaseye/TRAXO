import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PiArrowsClockwise,
  PiArrowUpRight,
  PiCpu,
  PiDatabase,
  PiHardDrives,
  PiPlay,
  PiGauge,
  PiShieldCheck,
  PiSlidersHorizontal,
  PiTerminalWindow,
  PiWifiHigh,
  PiWifiSlash,
} from 'react-icons/pi'
import { apiFetch, getScannerStatus } from '@/lib/api'
import { AccessCodeManagerPanel } from '@/components/admin/AccessCodeManagerPanel'
import { usePaperBroker } from '@/hooks/usePaperBroker'
import { useStrategyOptimizer } from '@/hooks/useStrategyOptimizer'
import { useAuthStore } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/stores/useOnboardingStore'
import { useTradingContextStore } from '@/stores/useTradingContextStore'

const ALG_CONFIG = {
  minScore: { prime: 7, standard: 5, aggressive: 4 },
  minConfidence: { prime: 70, standard: 55, aggressive: 45 },
  slBuffer: { primeForex: '0.75x ATR', standardForex: '1.0x ATR', crypto: '+50% on top of base' },
  defaultSlippage: { forex: '0.005%', crypto: '0.1%' },
  rrFallback: { tp1: '1.5R', tp2: '2.5R' },
  obLookback: '20 candles',
  swingLookback: '3 bars',
  i2eMinR: '0.8R (min distance for structure TP)',
}

interface HealthResponse {
  status: string
  twelvedata?: {
    availableKeys: number
    keys?: Array<{ index?: number; id?: string; usedToday?: number; exhausted?: boolean }>
  }
}

export default function AdminPanel() {
  const user = useAuthStore((s) => s.user)
  const journal = useTradingContextStore((s) => s.journal)
  const activeStrategies = useOnboardingStore((s) => s.selectedStrategyIds)

  const { account: mt5Account, positions: mt5Positions, refreshAccount } = usePaperBroker()
  const { status: optimizerStatus, refreshStatus: refreshOptimizer } = useStrategyOptimizer()

  const [scannerStatus, setScannerStatus] = useState<{
    status: string
    message: string
    redis?: string
    scanState?: Record<string, unknown>
  } | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [triggerBusy, setTriggerBusy] = useState(false)
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null)

  const fetchSystemDiagnostics = useCallback(async () => {
    setLoading(true)
    try {
      const [scanRes, healthRes] = await Promise.allSettled([
        getScannerStatus(),
        apiFetch('/health').then((r) => (r.ok ? r.json() : null)),
      ])
      if (scanRes.status === 'fulfilled') {
        setScannerStatus(
          scanRes.value as {
            status: string
            message: string
            redis?: string
            scanState?: Record<string, unknown>
          }
        )
      }
      if (healthRes.status === 'fulfilled' && healthRes.value) {
        setHealth(healthRes.value as HealthResponse)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) void fetchSystemDiagnostics()
    })
    return () => {
      cancelled = true
    }
  }, [fetchSystemDiagnostics])

  const handleManualScan = async () => {
    setTriggerBusy(true)
    setTriggerMessage(null)
    try {
      const res = await apiFetch('/api/scanner/trigger', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json().catch(() => ({}))
      setTriggerMessage(data?.message || 'Manual scan cycle initiated.')
      setTimeout(() => {
        void fetchSystemDiagnostics()
      }, 800)
    } catch (err) {
      setTriggerMessage(
        `Trigger unavailable (${err instanceof Error ? err.message : 'offline'}).`
      )
    } finally {
      setTriggerBusy(false)
    }
  }

  const journalStats = useMemo(() => {
    let wins = 0
    let losses = 0
    let breakeven = 0
    let pending = 0
    let taken = 0
    let netUsd = 0

    for (const j of journal) {
      if (j.taken) taken += 1
      if (j.outcome === 'win') {
        wins += 1
        if (j.taken && j.riskAmount > 0) {
          const riskDist = Math.abs(j.entry - j.sl)
          const rewardDist = Math.abs(j.tp - j.entry)
          const rr = riskDist > 0 ? rewardDist / riskDist : 0
          netUsd += j.riskAmount * rr
        }
      } else if (j.outcome === 'loss') {
        losses += 1
        if (j.taken && j.riskAmount > 0) netUsd -= j.riskAmount
      } else if (j.outcome === 'breakeven') {
        breakeven += 1
      } else if (j.outcome === 'pending') {
        pending += 1
      }
    }
    return { total: journal.length, wins, losses, breakeven, pending, taken, netUsd }
  }, [journal])

  const envChecks = useMemo(() => {
    return [
      { label: 'Firebase Auth Session', ok: Boolean(user?.id), detail: user?.email || 'Not signed in' },
      { label: 'Firebase API Key Configured', ok: Boolean(import.meta.env.VITE_FIREBASE_API_KEY), detail: import.meta.env.VITE_FIREBASE_API_KEY ? 'Present' : 'Missing' },
      { label: 'Express Health Endpoint', ok: health?.status === 'ok', detail: health?.status || 'Offline' },
      { label: 'Redis Signal Cache', ok: scannerStatus?.redis === 'connected' || scannerStatus?.status === 'ok', detail: scannerStatus?.redis || scannerStatus?.status || 'Unknown' },
      {
        label: 'TRAXO Paper Engine',
        ok: Boolean(mt5Account?.connected),
        detail: mt5Account?.connected
          ? `Paper Active (${mt5Positions.length} open)`
          : 'Disconnected',
      },
    ]
  }, [user, health, scannerStatus, mt5Account, mt5Positions])

  const scanState = scannerStatus?.scanState as
    | { running?: boolean; currentSymbol?: string; current?: string; done?: number; total?: number }
    | undefined

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-[#71717A]">System Diagnostics</p>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] text-[#FAFAFA] leading-tight">
              Operator Admin Desk
            </h1>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA]">
              Live runtime telemetry, engine thresholds, and unified console shortcuts.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleManualScan}
              disabled={triggerBusy}
              className="col-span-2 sm:col-span-1 sm:order-2 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] disabled:opacity-50 text-[13px] font-medium transition-colors"
            >
              <PiPlay className="h-4 w-4 shrink-0" />
              <span>{triggerBusy ? 'Triggering...' : 'Manual Scan'}</span>
            </button>
            <Link
              to="/notifications?tab=telemetry"
              className="sm:order-1 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
            >
              <PiCpu className="h-4 w-4 text-[#A1A1AA] shrink-0" />
              <span className="truncate">Signals &amp; Ops</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                void fetchSystemDiagnostics()
                void refreshAccount()
                void refreshOptimizer()
              }}
              disabled={loading}
              className="sm:order-3 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 sm:py-2 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[13px] font-medium text-[#FAFAFA] transition-colors"
            >
              <PiArrowsClockwise className={`h-4 w-4 text-[#A1A1AA] shrink-0 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {triggerMessage && (
          <div className="px-4 py-3 rounded-2xl bg-[#111113] border border-white/[0.07] text-[13px] text-[#A1A1AA]">
            {triggerMessage}
          </div>
        )}

        {/* Operator Identity Strip */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-[#161619] flex items-center justify-center shrink-0">
              <PiShieldCheck className="h-5 w-5 text-[#34D399]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-[#71717A]">Authorized Operator Session</div>
              <div className="text-[15px] font-medium text-[#FAFAFA] mt-0.5 truncate">
                {user?.displayName || 'Traxo Operator'}
              </div>
              <div className="text-[12.5px] font-normal text-[#71717A] break-all sm:break-normal mt-0.5">
                {user?.email || 'No email'} ·{' '}
                <span className="font-mono tabular-nums">{user?.id?.slice(0, 10) || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2.5 text-[13px] text-[#A1A1AA] pt-3 sm:pt-0 border-t sm:border-t-0 border-white/[0.06] shrink-0">
            <span>Active Strategies</span>
            <span className="px-3 py-1 rounded-full bg-[#161619] text-[#FAFAFA] font-mono tabular-nums font-medium">
              {activeStrategies.length}
            </span>
          </div>
        </section>

        {/* Admin 5-Digit Login Access Code Gate */}
        <AccessCodeManagerPanel />

        {/* Unboxed 5-Metric Summary Strip */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] grid grid-cols-2 lg:grid-cols-5">
          <div className="p-4 sm:p-5 space-y-1 border-r border-b lg:border-b-0 border-white/[0.06]">
            <div className="text-[12px] text-[#71717A]">Journal Entries</div>
            <div className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
              {journalStats.total}
            </div>
            <div className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {journalStats.taken} taken · {journalStats.pending} pending
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
            <div className="text-[12px] text-[#71717A]">Win / Loss</div>
            <div className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums">
              <span className="text-[#34D399]">{journalStats.wins}W</span>
              <span className="text-[#71717A] mx-1">/</span>
              <span className="text-[#F87171]">{journalStats.losses}L</span>
            </div>
            <div className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {journalStats.breakeven} breakeven
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1 border-r border-b lg:border-b-0 border-white/[0.06]">
            <div className="text-[12px] text-[#71717A]">Taken Net P&amp;L</div>
            <div
              className={`text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums ${
                journalStats.netUsd > 0
                  ? 'text-[#34D399]'
                  : journalStats.netUsd < 0
                    ? 'text-[#F87171]'
                    : 'text-[#FAFAFA]'
              }`}
            >
              {journalStats.netUsd >= 0 ? '+' : '-'}${Math.abs(journalStats.netUsd).toFixed(2)}
            </div>
            <div className="text-[12px] text-[#71717A]">Recorded risk P&amp;L</div>
          </div>

          <div className="p-4 sm:p-5 space-y-1 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
            <div className="text-[12px] text-[#71717A]">TwelveData Keys</div>
            <div className="text-[20px] sm:text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
              {health?.twelvedata?.availableKeys ?? '—'}
            </div>
            <div className="text-[12px] text-[#71717A]">Active key pool</div>
          </div>

          <div className="col-span-2 lg:col-span-1 p-4 sm:p-5 space-y-1">
            <div className="text-[12px] text-[#71717A]">Feedback Engine</div>
            <div
              className={`text-[18px] font-semibold mt-0.5 ${
                optimizerStatus?.isFeedbackEngineEnabled ? 'text-[#34D399]' : 'text-[#A1A1AA]'
              }`}
            >
              {optimizerStatus
                ? optimizerStatus.isFeedbackEngineEnabled
                  ? 'Active'
                  : 'Paused'
                : '—'}
            </div>
            <div className="text-[12px] font-mono tabular-nums text-[#71717A]">
              {optimizerStatus?.totalLossesAnalyzed ?? 0} losses analyzed
            </div>
          </div>
        </section>

        {/* Runtime Matrix + Algorithm Constants */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
          <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-2.5">
                <PiHardDrives className="h-5 w-5 text-[#FAFAFA] shrink-0" />
                <h2 className="text-[15px] font-medium text-[#FAFAFA]">
                  System &amp; Environment Matrix
                </h2>
              </div>
              <span className="text-[12px] text-[#71717A]">
                {scanState?.running
                  ? `Scanning: ${scanState.currentSymbol || scanState.current || 'Active'}`
                  : 'Scanner Ready'}
              </span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {envChecks.map((chk) => (
                <div
                  key={chk.label}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3.5 text-[14px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {chk.ok ? (
                      <PiWifiHigh className="h-4 w-4 text-[#34D399] shrink-0" />
                    ) : (
                      <PiWifiSlash className="h-4 w-4 text-[#F87171] shrink-0" />
                    )}
                    <span className="text-[#FAFAFA]">{chk.label}</span>
                  </div>
                  <span
                    className={`text-[13px] pl-6 sm:pl-0 break-all sm:break-normal ${
                      chk.ok ? 'text-[#34D399]' : 'text-[#A1A1AA]'
                    }`}
                  >
                    {chk.detail}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-[12px] text-[#71717A] pt-1">
              Scanner status: {scannerStatus?.message || '—'}
            </div>
          </section>

          <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <PiSlidersHorizontal className="h-5 w-5 text-[#FAFAFA] shrink-0" />
                <h2 className="text-[15px] font-medium text-[#FAFAFA]">
                  Algorithm Constants
                </h2>
              </div>
              <span className="text-[12px] text-[#71717A] shrink-0">Read-only baseline</span>
            </div>

            <div className="divide-y divide-white/[0.06] text-[13px] sm:text-[13.5px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">Min Score (Prime / Std / Aggr)</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {ALG_CONFIG.minScore.prime} / {ALG_CONFIG.minScore.standard} /{' '}
                  {ALG_CONFIG.minScore.aggressive}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">Min Confidence (Prime / Std / Aggr)</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {ALG_CONFIG.minConfidence.prime}% / {ALG_CONFIG.minConfidence.standard}% /{' '}
                  {ALG_CONFIG.minConfidence.aggressive}%
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">SL Buffer (FX / Crypto)</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {ALG_CONFIG.slBuffer.primeForex} / {ALG_CONFIG.slBuffer.crypto}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">Default Slippage (FX / Crypto)</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {ALG_CONFIG.defaultSlippage.forex} / {ALG_CONFIG.defaultSlippage.crypto}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">Fallback R:R Targets</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {ALG_CONFIG.rrFallback.tp1} / {ALG_CONFIG.rrFallback.tp2}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">OB / Swing Lookback</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">
                  {ALG_CONFIG.obLookback} · {ALG_CONFIG.swingLookback}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 py-3">
                <span className="text-[#71717A]">Impulse-to-Entry Min R</span>
                <span className="font-mono tabular-nums text-[#FAFAFA]">{ALG_CONFIG.i2eMinR}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Quick Route Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {[
            {
              to: '/admin/signals',
              title: 'Signals & Rejects Archive',
              desc: 'Direct table view of live/historical setups & Redis rejections.',
              icon: PiGauge,
            },
            {
              to: '/notifications?tab=rejections',
              title: 'Scanner Rejections Tab',
              desc: 'Guardrail rejections sorted by symbol, rule, and spread.',
              icon: PiDatabase,
            },
            {
              to: '/dashboard',
              title: 'Live Trading Terminal',
              desc: 'Return to real-time execution desk and price action chart.',
              icon: PiTerminalWindow,
            },
            {
              to: '/settings',
              title: 'Risk & MT5 Guardrails',
              desc: 'Configure risk %, daily loss cap, session filter & MetaApi.',
              icon: PiSlidersHorizontal,
            },
          ].map((card) => {
            const Icon = card.icon
            return (
              <Link
                key={card.to}
                to={card.to}
                className="group rounded-2xl bg-[#111113] border border-white/[0.07] hover:border-white/[0.16] p-4 sm:p-5 space-y-2 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-[#A1A1AA] group-hover:text-[#FAFAFA]" />
                  <PiArrowUpRight className="h-4 w-4 text-[#71717A] group-hover:text-[#FAFAFA]" />
                </div>
                <div className="text-[14px] font-medium text-[#FAFAFA]">{card.title}</div>
                <p className="text-[13px] text-[#71717A]">{card.desc}</p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
