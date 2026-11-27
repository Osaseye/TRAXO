import { useCallback, useEffect, useState } from 'react'
import {
  PiArrowsClockwise,
  PiCheckCircle,
  PiCloudArrowUp,
  PiFloppyDisk,
  PiLink,
  PiPaperPlaneTilt,
  PiShieldCheck,
  PiTrash,
  PiWarningCircle,
} from 'react-icons/pi'
import {
  deleteWebhookBroker,
  getBrokerConnections,
  saveWebhookBroker,
  testWebhookBroker,
} from '@/lib/api'
import { showToast } from '@/stores/useToastStore'
import { cn } from '@/lib/utils'

type WebhookPreset = 'generic' | 'traderspost' | 'pickmytrade' | 'pineconnector'
type WebhookTriggerMode = 'auto' | 'manual' | 'both'

interface PublicWebhookConfig {
  enabled: boolean
  url: string
  preset: WebhookPreset
  triggerMode: WebhookTriggerMode
  hasSecret: boolean
  secretHint: string | null
  updatedAt: number | null
}

interface WebhookDeliveryLog {
  id: string
  url: string
  preset: WebhookPreset
  symbol: string
  action: string
  triggerSource: 'auto' | 'manual' | 'test'
  ok: boolean
  httpStatus: number | null
  latencyMs: number
  responsePreview: string | null
  error: string | null
  createdAt: number
}

interface BrokerVenueSummary {
  id: 'paper' | 'webhook' | 'ctrader' | 'tradovate'
  name: string
  status: 'active' | 'configured' | 'available' | 'coming_soon'
  summary: string
}

const PRESET_OPTIONS: Array<{ id: WebhookPreset; label: string; hint: string }> = [
  { id: 'generic', label: 'Generic JSON', hint: 'Standard TRAXO institutional JSON payload + HMAC signature' },
  { id: 'traderspost', label: 'TradersPost', hint: 'Formatted for TradersPost (Tradovate, TradeStation, Alpaca, etc.)' },
  { id: 'pickmytrade', label: 'PickMyTrade', hint: 'Formatted for PickMyTrade futures & prop-firm routing (MNQ)' },
  { id: 'pineconnector', label: 'PineConnector', hint: 'Formatted for PineConnector license-based MT5 routing' },
]

const TRIGGER_OPTIONS: Array<{ id: WebhookTriggerMode; label: string }> = [
  { id: 'both', label: 'Auto + Manual' },
  { id: 'auto', label: 'Auto-Trade Only' },
  { id: 'manual', label: 'Manual Tap Only' },
]

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function BrokerIntegrationsSection({ visible }: { visible: boolean }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [venues, setVenues] = useState<BrokerVenueSummary[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[]>([])

  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [preset, setPreset] = useState<WebhookPreset>('generic')
  const [triggerMode, setTriggerMode] = useState<WebhookTriggerMode>('both')
  const [secretInput, setSecretInput] = useState('')
  const [secretHint, setSecretHint] = useState<string | null>(null)
  const [hasSecret, setHasSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = (await getBrokerConnections()) as {
        ok?: boolean
        webhook?: PublicWebhookConfig
        deliveries?: WebhookDeliveryLog[]
        venues?: BrokerVenueSummary[]
      }
      if (res?.webhook) {
        setEnabled(Boolean(res.webhook.enabled))
        setUrl(res.webhook.url || '')
        setPreset(res.webhook.preset || 'generic')
        setTriggerMode(res.webhook.triggerMode || 'both')
        setHasSecret(Boolean(res.webhook.hasSecret))
        setSecretHint(res.webhook.secretHint || null)
      }
      if (Array.isArray(res?.deliveries)) setDeliveries(res.deliveries)
      if (Array.isArray(res?.venues)) setVenues(res.venues)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load broker integrations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) void loadConnections()
    })
    return () => {
      cancelled = true
    }
  }, [loadConnections])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = (await saveWebhookBroker({
        enabled,
        url: url.trim(),
        preset,
        triggerMode,
        secret: secretInput.trim() || undefined,
      })) as { ok?: boolean; webhook?: PublicWebhookConfig }
      if (res?.webhook) {
        setEnabled(res.webhook.enabled)
        setUrl(res.webhook.url)
        setHasSecret(res.webhook.hasSecret)
        setSecretHint(res.webhook.secretHint)
        setSecretInput('')
      }
      showToast('Webhook Saved', 'External broker webhook settings updated', 'success')
      await loadConnections()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save webhook'
      setError(msg)
      showToast('Webhook Error', msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setError(null)
    try {
      const res = (await testWebhookBroker()) as {
        ok?: boolean
        delivery?: WebhookDeliveryLog
      }
      if (res?.ok) {
        showToast(
          'Test Signal Delivered',
          `HTTP ${res.delivery?.httpStatus ?? 200} in ${res.delivery?.latencyMs ?? 0}ms`,
          'success',
        )
      } else {
        showToast(
          'Webhook Test Failed',
          res?.delivery?.error || 'Endpoint rejected the test payload',
          'error',
        )
      }
      await loadConnections()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test webhook failed'
      setError(msg)
      showToast('Webhook Test Error', msg, 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    setError(null)
    try {
      await deleteWebhookBroker()
      setEnabled(false)
      setUrl('')
      setSecretInput('')
      setHasSecret(false)
      setSecretHint(null)
      showToast('Webhook Removed', 'External webhook bridge disconnected', 'info')
      await loadConnections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove webhook')
    } finally {
      setSaving(false)
    }
  }

  const upcomingVenues = venues.filter((v) => v.id === 'ctrader' || v.id === 'tradovate')

  return (
    <section className={cn('space-y-3', !visible && 'hidden md:block')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
            External Broker Bridges
          </h2>
          <p className="text-[13px] text-[#71717A]">
            Route your TRAXO executions to external brokers via encrypted webhooks or upcoming 1-click cloud OAuth.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadConnections()}
          disabled={loading}
          className="h-9 px-3 rounded-xl bg-[#18181B] border border-white/[0.07] hover:bg-[#222227] text-[12px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors shrink-0"
        >
          <PiArrowsClockwise className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Phase 1: Outbound Webhook Bridge */}
      <div className="rounded-2xl bg-[#111113] border border-white/[0.07] divide-y divide-white/[0.06]">
        <div className="p-4 sm:p-5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#161619] border border-white/[0.07] flex items-center justify-center shrink-0">
              <PiLink className="h-5 w-5 text-[#34D399]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-semibold text-[#FAFAFA]">
                  Outbound Webhook Bridge
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    enabled && url
                      ? 'bg-[#34D399]/15 text-[#34D399]'
                      : 'bg-white/[0.06] text-[#A1A1AA]',
                  )}
                >
                  {enabled && url ? 'Active' : 'Standby'}
                </span>
              </div>
              <p className="text-[12.5px] text-[#71717A] mt-0.5">
                Works with TradersPost, PickMyTrade, PineConnector, or any custom HTTPS trade listener.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className="inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <span className="text-[12px] text-[#A1A1AA]">{enabled ? 'Enabled' : 'Disabled'}</span>
            <span
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition-colors',
                enabled ? 'bg-[#34D399]/25' : 'bg-[#18181B]',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full transition-transform duration-150',
                  enabled ? 'translate-x-5 bg-[#34D399]' : 'translate-x-0 bg-[#71717A]',
                )}
              />
            </span>
          </button>
        </div>

        <div className="p-4 sm:p-5 sm:px-6 space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#F87171]/10 border border-[#F87171]/25 text-[12.5px] text-[#F87171]">
              {error}
            </div>
          )}

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#A1A1AA]">
              Destination Webhook URL (HTTPS)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://webhooks.traderspost.io/trading/webhook/..."
              className="w-full h-10 px-3.5 rounded-xl bg-[#161619] border border-white/[0.08] focus:border-[#34D399]/50 text-[13px] font-mono text-[#FAFAFA] placeholder:text-[#52525B] placeholder:font-sans focus:outline-none"
            />
          </div>

          {/* Preset + Trigger Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#A1A1AA]">Payload Preset</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPreset(opt.id)}
                    className={cn(
                      'h-9 px-2.5 rounded-xl border text-[12px] font-medium transition-colors text-left truncate',
                      preset === opt.id
                        ? 'bg-white/[0.1] border-white/[0.2] text-[#FAFAFA]'
                        : 'bg-[#161619] border-white/[0.06] text-[#A1A1AA] hover:text-[#FAFAFA]',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-[#71717A]">
                {PRESET_OPTIONS.find((p) => p.id === preset)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#A1A1AA]">Forward When</label>
              <div className="grid grid-cols-3 gap-1.5">
                {TRIGGER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTriggerMode(opt.id)}
                    className={cn(
                      'h-9 px-2 rounded-xl border text-[11.5px] font-medium transition-colors truncate',
                      triggerMode === opt.id
                        ? 'bg-white/[0.1] border-white/[0.2] text-[#FAFAFA]'
                        : 'bg-[#161619] border-white/[0.06] text-[#A1A1AA] hover:text-[#FAFAFA]',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-1.5 space-y-1">
                <label className="text-[12px] font-medium text-[#A1A1AA] flex items-center justify-between">
                  <span>Signing Secret / License Token (Optional)</span>
                  {hasSecret && secretHint && (
                    <span className="font-mono text-[11px] text-[#34D399]">
                      Stored ({secretHint})
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  placeholder={hasSecret ? 'Leave blank to keep existing secret' : 'Encrypted with AES-256-GCM'}
                  className="w-full h-9 px-3 rounded-xl bg-[#161619] border border-white/[0.08] focus:border-[#34D399]/50 text-[12.5px] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="h-9 px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] disabled:opacity-50 text-[#09090B] text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <PiFloppyDisk size={15} />
              <span>{saving ? 'Saving...' : 'Save Webhook'}</span>
            </button>

            <button
              type="button"
              disabled={testing || !url.trim()}
              onClick={() => void handleTest()}
              className="h-9 px-3.5 rounded-xl bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] disabled:opacity-40 text-[#FAFAFA] text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <PiPaperPlaneTilt size={14} className="text-[#34D399]" />
              <span>{testing ? 'Sending...' : 'Send Test Signal'}</span>
            </button>

            {url.trim() && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDelete()}
                className="h-9 px-3 rounded-xl bg-[#18181B] hover:bg-[#F87171]/15 border border-white/[0.08] text-[#F87171] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors ml-auto"
              >
                <PiTrash size={14} />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>

        {/* Recent Webhook Deliveries */}
        {deliveries.length > 0 && (
          <div className="p-4 sm:p-5 sm:px-6 space-y-2.5">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#71717A]">
              Recent Webhook Deliveries
            </div>
            <div className="space-y-1.5">
              {deliveries.slice(0, 6).map((d) => (
                <div
                  key={d.id}
                  className="px-3 py-2 rounded-xl bg-[#0D0D10] border border-white/[0.05] flex flex-wrap items-center justify-between gap-2 text-[12px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {d.ok ? (
                      <PiCheckCircle size={15} className="text-[#34D399] shrink-0" />
                    ) : (
                      <PiWarningCircle size={15} className="text-[#F87171] shrink-0" />
                    )}
                    <span className="font-semibold text-[#FAFAFA]">{d.symbol}</span>
                    <span className="text-[#A1A1AA]">{d.action}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[10.5px] uppercase text-[#71717A]">
                      {d.triggerSource}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11.5px] tabular-nums">
                    <span className={d.ok ? 'text-[#34D399]' : 'text-[#F87171]'}>
                      {d.ok ? `HTTP ${d.httpStatus ?? 200}` : d.error || 'Failed'}
                    </span>
                    <span className="text-[#71717A]">{d.latencyMs}ms</span>
                    <span className="text-[#71717A]">{formatTime(d.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upcoming 1-Click Cloud OAuth Venues (Phase 3 & 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(upcomingVenues.length > 0
          ? upcomingVenues
          : [
              {
                id: 'ctrader' as const,
                name: 'cTrader Open API (1-Click OAuth)',
                status: 'coming_soon' as const,
                summary:
                  '1-click cloud OAuth for 50+ Forex, Gold & Prop-Firm brokers (FTMO, FundedNext, Pepperstone, IC Markets).',
              },
              {
                id: 'tradovate' as const,
                name: 'Tradovate Futures (MNQ)',
                status: 'coming_soon' as const,
                summary:
                  'Direct cloud futures routing for MNQ & futures prop firms (Apex, Topstep, TakeProfitTrader).',
              },
            ]
        ).map((venue) => (
          <div
            key={venue.id}
            className="rounded-2xl bg-[#111113] border border-white/[0.07] p-4 space-y-2.5 flex flex-col justify-between"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {venue.id === 'ctrader' ? (
                    <PiShieldCheck size={16} className="text-[#38BDF8] shrink-0" />
                  ) : (
                    <PiCloudArrowUp size={16} className="text-[#FBBF24] shrink-0" />
                  )}
                  <span className="text-[13.5px] font-semibold text-[#FAFAFA] truncate">
                    {venue.name}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[10.5px] font-medium text-[#A1A1AA] shrink-0">
                  {venue.status === 'available' ? 'OAuth Ready' : 'Next Phase'}
                </span>
              </div>
              <p className="text-[12px] text-[#71717A] leading-relaxed">{venue.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
