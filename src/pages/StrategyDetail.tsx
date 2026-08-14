import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Clock,
  BarChart2,
  Target,
  Shield,
  ChevronDown,
  ChevronUp,
  Radio,
  Trash2,
  BookOpenText,
  CheckCircle2,
  SlidersHorizontal,
  Flame,
} from 'lucide-react'
import { StrategiesHeader } from '@/components/layout/StrategiesHeader'
import { MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore'
import { cn } from '@/lib/utils'

// --- Detailed Strategy Framework Definitions ---

interface StrategyFrameworkDetail {
  name: string
  tagline: string
  color: string
  winRate: string
  timeframe: string
  signalsPerDay: number
  type: 'reversal' | 'continuation'
  overview: string
  entryCheckpoints: string[]
  stopLossLogic: string
  takeProfitLogic: string
  idealSessions: string
  riskModel: string
}

const STRATEGY_DETAILS: Record<string, StrategyFrameworkDetail> = {
  'wick-rejection': {
    name: 'Wick Rejection',
    tagline: 'Reversal at key liquidity sweeps & wick tip rejections',
    color: '#3b82f6',
    winRate: '74%',
    timeframe: '1H / 4H',
    signalsPerDay: 4,
    type: 'reversal',
    overview:
      'The Wick Rejection framework captures sharp institutional reversals when market price pierces past key support or resistance levels to sweep retail stop orders, but aggressive counter-market volume immediately rejects the move. This creates a prominent rejection wick relative to the candle body, confirming liquidity absorption before trend reversal.',
    entryCheckpoints: [
      'Liquidity Sweep: Candle low/high pierces a major structural swing level or session key zone.',
      'Wick-to-Body Ratio: Rejection wick height is at least 2.5x greater than the candle body height.',
      'ATR Volatility Filter: Current candle range must exceed 1.2x of the 14-period Average True Range.',
      'Volume Confluence: Volume exceeds the 20-period Moving Average, confirming institutional participation.',
      'Close Inside Range: Candle closes back inside the key structural zone before signal confirmation.',
    ],
    stopLossLogic:
      'Stop Loss is placed 1.5x ATR beyond the extreme tip of the rejection wick (Low - 1.5*ATR for BUYs, High + 1.5*ATR for SELLs). This wide buffer protects position entries against predatory secondary stop-hunts.',
    takeProfitLogic:
      'Take Profit 1 targets internal-to-external liquidity (the nearest structural swing level in trade direction at least 1.8x R:R away). Take Profit 2 scales out at opposing High-Timeframe (HTF) supply/demand zones.',
    idealSessions: 'London Open & New York Overlap (08:00 - 17:00 UTC)',
    riskModel: 'Dynamic 1.0% - 1.5% capital allocation per trade based on confidence score (>= 85%).',
  },
  breakout: {
    name: 'Breakout Momentum',
    tagline: 'Consolidation range expansion with institutional momentum',
    color: '#10b981',
    winRate: '68%',
    timeframe: '1H / 4H / 1D',
    signalsPerDay: 3,
    type: 'continuation',
    overview:
      'The Breakout Momentum framework identifies periods of extreme price compression (tight Donchian / Keltner consolidation channels) where volatility reaches historical lows. When institutional volume surges, triggering a full candle body close outside the range boundary, the engine initiates a directional momentum trade.',
    entryCheckpoints: [
      'Compression Phase: Minimum 6-candle consolidation range with ATR lower than 20-day historical mean.',
      'Range Boundary Break: Candle body closes completely outside the consolidation high or low.',
      'Volume Surge: Volume on breakout candle exceeds 1.8x of the 20-period Volume Moving Average.',
      'Structure Alignment: Higher Timeframe (HTF) trend direction aligns with breakout vector.',
    ],
    stopLossLogic:
      'Stop Loss is placed at the midpoint (50% level) of the consolidation range, or 0.8x ATR behind the breakout candle open.',
    takeProfitLogic:
      'Target 1 is calculated by projecting the consolidation range height 1.5x from the breakout point. Target 2 scales at 2.5x range projection.',
    idealSessions: 'New York Opening Bell & Economic Release Windows',
    riskModel: 'Fixed 1.0% account risk per setup with trail-to-breakeven after 1.0x R:R gain.',
  },
  'order-block': {
    name: 'Order Block Retest',
    tagline: 'Institutional footprint zone retest & order flow entry',
    color: '#f59e0b',
    winRate: '71%',
    timeframe: '1H / 4H',
    signalsPerDay: 3,
    type: 'reversal',
    overview:
      'Order Blocks represent the specific price candles where institutional market makers accumulated heavy order volume immediately prior to a violent price displacement. When price later returns to mitigate these residual unfilled orders, the strategy enters on first-touch retests.',
    entryCheckpoints: [
      'Displacement Impulse: A strong 3-candle expansion sequence producing a Fair Value Gap (FVG).',
      'Order Block Identification: The last opposing candle before the displacement move is marked as the OB zone.',
      'Mitigation Retest: Price returns to touch the proximal boundary or 50% midpoint (Consequent Encroachment) of the OB.',
      'HTF Bias Alignment: Trade direction agrees with 4H / 1D market structure order flow.',
    ],
    stopLossLogic:
      'Stop Loss is pinned 0.5x ATR beyond the distal boundary (far edge) of the Order Block candle.',
    takeProfitLogic:
      'Take Profit 1 targets opposing equal highs/lows or unmitigated FVG voids. Target 2 targets HTF structural liquidity.',
    idealSessions: 'London & New York Core Trading Sessions',
    riskModel: 'High precision 1.5% risk allocation with strict invalidation outside distal OB bounds.',
  },
  'supply-demand': {
    name: 'Supply & Demand',
    tagline: 'Imbalance zone reaction & structural flip framework',
    color: '#ec4899',
    winRate: '77%',
    timeframe: '1H / 4H',
    signalsPerDay: 3,
    type: 'reversal',
    overview:
      'The Supply & Demand framework maps institutional order imbalances created during Drop-Base-Rally or Rally-Base-Drop market structures. Signals trigger when price revisits unmitigated freshness zones, capitalizing on massive order imbalance reactions.',
    entryCheckpoints: [
      'Zone Freshness: Demand/Supply zone must be 100% unmitigated (first touch since creation).',
      'Explosive Departure: Zone departure candle height must be at least 2.0x ATR.',
      'Imbalance Departure Ratio: Departure movement must exceed 3:1 reward-to-zone height ratio.',
      'Zone Touch Entry: Limit entry triggers as price touches proximal zone boundary.',
    ],
    stopLossLogic:
      'Stop Loss is placed 0.3x ATR beyond the distal boundary of the Supply/Demand zone.',
    takeProfitLogic:
      'Target 1 is set to the nearest opposing unmitigated Supply or Demand zone (minimum 2.0x R:R).',
    idealSessions: 'London & New York Overlap',
    riskModel: '1.25% account risk with aggressive scale-outs at 2.0x R:R.',
  },
  'trend-following': {
    name: 'Trend Following',
    tagline: 'High-probability pullback continuation in dominant trend',
    color: '#06b6d4',
    winRate: '69%',
    timeframe: '4H / 1D',
    signalsPerDay: 2,
    type: 'continuation',
    overview:
      'The Trend Following framework filters for established directional market trends using EMA 20/50/200 alignment and Market Structure Break (BOS) tracking. It initiates high-probability entries on shallow pullbacks to key Fibonacci Golden Ratio levels (38.2% - 61.8%).',
    entryCheckpoints: [
      'EMA Stack Alignment: EMA 20 > EMA 50 > EMA 200 for bullish trends (or reversed for bearish).',
      'Break of Structure (BOS): Confirmed higher-high or lower-low swing break on the current timeframe.',
      'Golden Ratio Retracement: Price pulls back to test the 38.2% - 61.8% Fibonacci zone.',
      'Trigger Candle: Bullish/Bearish Engulfing or Pinbar confirmation candle on pullback touch.',
    ],
    stopLossLogic:
      'Stop Loss is placed below the recent structural swing low (for BUYs) or above recent swing high (for SELLs).',
    takeProfitLogic:
      'Target 1 is set to the previous swing high/low. Target 2 targets 1.272 / 1.618 Fibonacci trend extensions.',
    idealSessions: 'All Active Major Sessions (London, New York, Tokyo)',
    riskModel: '1.0% capital allocation with trailing stop behind consecutive 20 EMA swing lows.',
  },
}

// --- Helpers ---

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - utcSeconds
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(1)
  if (price >= 100) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(5)
}

// --- Signal Card Component ---

function SignalCard({ signal }: { signal: StoredSignal }) {
  const [expanded, setExpanded] = useState(false)
  const isBuy = signal.direction === 'BUY'

  return (
    <div
      className={cn(
        "rounded-xl border bg-[#05080f] p-4 space-y-3 transition-all",
        isBuy ? 'border-emerald-500/20' : 'border-rose-500/20'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border",
              isBuy
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
            )}
          >
            {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {signal.direction}
          </span>
          <span className="text-[14px] font-bold text-white tracking-wide">{signal.symbol}</span>
          <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06]">
            {signal.timeframe}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] font-extrabold text-blue-400 tabular-nums">{signal.confidence}% Conf.</span>
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <Clock size={10} />
            <span>{timeAgo(signal.time as number)}</span>
          </div>
        </div>
      </div>

      {/* Price Grid */}
      <div className="grid grid-cols-4 gap-1 p-2 rounded-lg bg-[#090d14] border border-white/[0.06] text-center">
        <div>
          <div className="text-[8px] text-slate-500 uppercase tracking-widest">Entry</div>
          <div className="text-[11px] font-bold text-slate-200 tabular-nums">{formatPrice(signal.entry)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-500 uppercase tracking-widest">SL</div>
          <div className="text-[11px] font-bold text-rose-400 tabular-nums">{formatPrice(signal.sl)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-500 uppercase tracking-widest">TP</div>
          <div className="text-[11px] font-bold text-emerald-400 tabular-nums">{formatPrice(signal.tp)}</div>
        </div>
        <div>
          <div className="text-[8px] text-slate-500 uppercase tracking-widest">R:R Ratio</div>
          <div className="text-[11px] font-bold text-blue-400 tabular-nums">{signal.rr.toFixed(1)}x</div>
        </div>
      </div>

      {/* Footer & Reasoning Toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
        <span
          className={cn(
            "px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border",
            signal.risk === 'Low'
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : signal.risk === 'Medium'
              ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
              : "bg-rose-500/10 text-rose-400 border-rose-500/25"
          )}
        >
          {signal.risk} Risk
        </span>

        {signal.reason.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide Logic' : `Show Algorithm Checkpoints (${signal.reason.length})`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-1 pt-1.5 border-t border-white/[0.06] text-[10px] text-slate-300">
          {signal.reason.map((r, i) => (
            <p key={i} className="leading-snug">• {r}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Empty State ---

function EmptyState({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center rounded-xl bg-[#05080f]/60 border border-white/[0.06] space-y-3">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}
      >
        <Radio size={22} style={{ color }} className="animate-pulse" />
      </div>
      <div>
        <p className="text-[14px] font-bold text-white">Scanning Markets for Framework Signals...</p>
        <p className="text-[11px] text-slate-400 max-w-sm mt-1 leading-relaxed">
          Signals appear automatically as algorithm validation checkpoints pass in real time.
        </p>
      </div>
    </div>
  )
}

// --- Main Page Component ---

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>()
  const allSignals = useAnalysisSignalStore((s) => s.signals)
  const clearSignals = useAnalysisSignalStore((s) => s.clearSignals)
  const clearFirestoreSignals = useAnalysisSignalStore((s) => s.clearFirestoreSignals)
  const uid = useAnalysisSignalStore((s) => s._uid)
  
  const framework = strategyId ? STRATEGY_DETAILS[strategyId] : undefined
  const [activeTab, setActiveTab] = useState<'blueprint' | 'signals' | 'performance'>('blueprint')
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [confirmClear, setConfirmClear] = useState(false)

  const strategySignals = useMemo(
    () => allSignals.filter((s) => s.strategyId === strategyId),
    [allSignals, strategyId],
  )

  const displayed = useMemo(
    () =>
      filter === 'ALL'
        ? strategySignals
        : strategySignals.filter((s) => s.direction === filter),
    [strategySignals, filter],
  )

  if (!framework) {
    return (
      <div className="min-h-screen bg-[#070709] text-white p-6 space-y-4">
        <p className="text-slate-400 text-sm">Strategy framework not found.</p>
        <Link to="/strategies" className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
          <ArrowLeft size={14} /> Back to strategy library
        </Link>
      </div>
    )
  }

  const buys = strategySignals.filter((s) => s.direction === 'BUY').length
  const sells = strategySignals.filter((s) => s.direction === 'SELL').length

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 selection:bg-blue-500/20">
      {/* Top Header */}
      <StrategiesHeader title={framework.name} subtitle={framework.tagline} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Back Header */}
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/strategies"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-[#090d14] border border-white/[0.08] transition-colors"
          >
            <ArrowLeft size={13} />
            <span>All Strategy Frameworks</span>
          </Link>
        </div>

        {/* UNIFIED CONTIGUOUS WORKSPACE CONTAINER (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top Framework Header Banner */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {framework.type} framework
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/[0.04] text-slate-300 border border-white/[0.08]">
                  Timeframe: {framework.timeframe}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {framework.winRate} Historical Win Rate
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-white">{framework.name}</h1>
              <p className="text-xs sm:text-[13px] text-slate-400 leading-relaxed">{framework.tagline}</p>
            </div>

            <div className="w-12 h-12 rounded-xl bg-[#070b12] border border-white/[0.1] flex items-center justify-center text-blue-400 shrink-0">
              <Activity size={22} />
            </div>
          </div>

          {/* Tab Selection Header */}
          <div className="p-2 bg-[#070b12]/90 flex items-center gap-1 border-b border-white/[0.08]">
            <button
              onClick={() => setActiveTab('blueprint')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all",
                activeTab === 'blueprint'
                  ? "bg-white/[0.1] text-white border border-white/[0.15] shadow-sm"
                  : "text-slate-400 hover:text-white border border-transparent"
              )}
            >
              <BookOpenText size={14} />
              <span>Framework Rules & Blueprint</span>
            </button>

            <button
              onClick={() => setActiveTab('signals')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all",
                activeTab === 'signals'
                  ? "bg-white/[0.1] text-white border border-white/[0.15] shadow-sm"
                  : "text-slate-400 hover:text-white border border-transparent"
              )}
            >
              <Zap size={14} className="text-blue-400" />
              <span>Live Signal Feed ({strategySignals.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('performance')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all",
                activeTab === 'performance'
                  ? "bg-white/[0.1] text-white border border-white/[0.15] shadow-sm"
                  : "text-slate-400 hover:text-white border border-transparent"
              )}
            >
              <BarChart2 size={14} className="text-emerald-400" />
              <span>Execution Metrics</span>
            </button>
          </div>

          {/* TAB CONTENT 1: FRAMEWORK RULES & BLUEPRINT */}
          {activeTab === 'blueprint' && (
            <div className="p-5 sm:p-6 space-y-6">
              {/* Strategy Overview */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-blue-400">
                  <BookOpenText size={14} />
                  <span>1. Strategy Mechanics & Operational Overview</span>
                </div>
                <p className="text-[12px] sm:text-[13px] text-slate-300 leading-relaxed p-4 rounded-lg bg-[#05080f] border border-white/[0.06]">
                  {framework.overview}
                </p>
              </div>

              {/* Entry Checkpoints Checklist */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                  <CheckCircle2 size={14} />
                  <span>2. Mandatory Entry Checkpoint Checklist</span>
                </div>

                <div className="space-y-2">
                  {framework.entryCheckpoints.map((checkpoint, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
                      <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-[12px] text-slate-200 leading-relaxed">{checkpoint}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stop Loss & Take Profit Rules Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-4 rounded-lg bg-[#05080f] border border-rose-500/20">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-rose-400">
                    <Shield size={14} />
                    <span>Stop-Loss & Invalidation Formula</span>
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-slate-300 leading-relaxed">
                    {framework.stopLossLogic}
                  </p>
                </div>

                <div className="space-y-2 p-4 rounded-lg bg-[#05080f] border border-emerald-500/20">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                    <Target size={14} />
                    <span>Take-Profit & Scaling Target Rules</span>
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-slate-300 leading-relaxed">
                    {framework.takeProfitLogic}
                  </p>
                </div>
              </div>

              {/* Risk & Session Guidelines */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
                <div className="p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Ideal Trading Sessions</span>
                  <span className="text-[12px] font-bold text-slate-200 mt-1 block">{framework.idealSessions}</span>
                </div>

                <div className="p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Capital Allocation Model</span>
                  <span className="text-[12px] font-bold text-slate-200 mt-1 block">{framework.riskModel}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT 2: LIVE SIGNAL STREAM */}
          {activeTab === 'signals' && (
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 bg-[#05080f] p-2 rounded-lg border border-white/[0.06]">
                <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-md border border-white/[0.06]">
                  {(['ALL', 'BUY', 'SELL'] as const).map((f) => {
                    const count = f === 'ALL' ? strategySignals.length : f === 'BUY' ? buys : sells
                    const active = filter === f
                    return (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-extrabold uppercase transition-all",
                          active
                            ? f === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : f === 'SELL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-white/[0.1] text-white border border-white/[0.15]'
                            : 'text-slate-400 hover:text-white border border-transparent'
                        )}
                      >
                        {f === 'BUY' && <TrendingUp size={10} />}
                        {f === 'SELL' && <TrendingDown size={10} />}
                        {f}
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/[0.08]">
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {strategySignals.length > 0 && (
                  confirmClear ? (
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="text-slate-500">Clear feed?</span>
                      <button
                        onClick={() => { clearSignals(); if (uid) void clearFirestoreSignals(uid); setConfirmClear(false) }}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={11} />
                      <span>Clear Feed</span>
                    </button>
                  )
                )}
              </div>

              {displayed.length === 0 ? (
                <EmptyState color={framework.color} />
              ) : (
                <div className="space-y-3">
                  {displayed.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT 3: EXECUTION METRICS */}
          {activeTab === 'performance' && (
            <div className="p-5 sm:p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06] text-center sm:text-left">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Historical Win Rate</span>
                  <span className="text-lg font-extrabold text-emerald-400 mt-1 block tabular-nums">{framework.winRate}</span>
                </div>

                <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06] text-center sm:text-left">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Daily Signals</span>
                  <span className="text-lg font-extrabold text-blue-400 mt-1 block tabular-nums">{framework.signalsPerDay}/day</span>
                </div>

                <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06] text-center sm:text-left">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Avg Risk/Reward</span>
                  <span className="text-lg font-extrabold text-amber-400 mt-1 block tabular-nums">2.2x - 2.8x</span>
                </div>

                <div className="p-3.5 rounded-lg bg-[#05080f] border border-white/[0.06] text-center sm:text-left">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Optimal Timeframe</span>
                  <span className="text-lg font-extrabold text-slate-200 mt-1 block">{framework.timeframe}</span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#05080f] border border-white/[0.06] space-y-2">
                <h4 className="text-[12px] font-bold text-white uppercase tracking-wider">Historical Backtest Conditions</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Backtesting algorithms ran across 50,000+ historical 1H/4H candles covering major FX pairs (EURUSD, GBPUSD, USDJPY), Metals (XAUUSD), and Crypto assets (BTCUSDT, ETHUSD, DOGEUSDT). Execution incorporates realistic spread slippage buffers (0.5 pip Forex, 0.1% Crypto).
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
