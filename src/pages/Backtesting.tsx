/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react'
import { Link } from 'react-router'
import {
  BarChart2,
  ChevronDown,
  Play,
  TrendingUp,
  Clock,
  Zap,
  Award,
  AlertTriangle,
  SlidersHorizontal,
  ChevronUp,
} from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { getCandleData as getCandles } from '@/lib/api'
import {
  runBacktest,
  runOrderBlockBacktest,
  runTrendFollowingBacktest,
  runBreakoutBacktest,
  runSDBacktest,
} from '../../server/algorithms/backtesting'
import type { BacktestSummary, BacktestSignalResult } from '../../server/algorithms/backtesting'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'
import type { WickRejectionAssetType } from '../../server/algorithms/wickRejection'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYMBOLS: ChartSymbol[] = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'EURGBP', 'BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT',
  'SPX500', 'NAS100', 'US30', 'AAPL', 'MSFT', 'NVDA', 'TSLA',
]

const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

const LOOKBACKS = [
  { label: '100 candles', value: 100 },
  { label: '250 candles', value: 250 },
  { label: '500 candles', value: 500 },
  { label: '1000 candles', value: 1000 },
]

function getAssetType(symbol: ChartSymbol): WickRejectionAssetType {
  const crypto = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const stocks = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (crypto.includes(symbol)) return 'CRYPTO'
  if (stocks.includes(symbol)) return 'STOCKS'
  return 'FOREX'
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function formatPrice(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 5, minimumFractionDigits: 2 })
}

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SignalRow({ sig, idx }: { sig: BacktestSignalResult; idx: number }) {
  const [open, setOpen] = useState(false)
  const isWin = sig.outcome === 'win'
  const isLoss = sig.outcome === 'loss'

  return (
    <div className="bg-[#05080f] overflow-hidden transition-colors hover:bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 grid grid-cols-[2rem_5.5rem_4rem_4.5rem_4.5rem_4.5rem_4.5rem_4.5rem_auto] gap-2 items-center text-left"
      >
        <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
        <span className="text-[11px] text-slate-300 font-medium">{formatDate(sig.time)}</span>
        <span
          className={cn(
            "text-[10px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 w-fit",
            sig.direction === 'BUY'
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
          )}
        >
          {sig.direction}
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{sig.tier}</span>
        <span className="text-[11px] font-bold text-slate-200 tabular-nums">{formatPrice(sig.entry)}</span>
        <span className="text-[11px] font-bold text-rose-400 tabular-nums">{formatPrice(sig.sl)}</span>
        <span className="text-[11px] font-bold text-emerald-400 tabular-nums">{formatPrice(sig.tp1)}</span>
        <span
          className={cn(
            "text-[9px] font-black uppercase px-2 py-0.5 rounded border text-center",
            isWin
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : isLoss
              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
              : "bg-blue-500/15 text-blue-400 border-blue-500/30"
          )}
        >
          {sig.outcome}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400 ml-auto" /> : <ChevronDown size={14} className="text-slate-400 ml-auto" />}
      </button>

      {open && (
        <div className="px-4 pb-3 pt-2 border-t border-white/[0.04] bg-[#070b12] space-y-2 text-[10px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-400">
            <div>Score: <strong className="text-white">{sig.score}</strong></div>
            <div>Confidence: <strong className="text-blue-400">{sig.confidence}%</strong></div>
            <div>Achieved R:R: <strong className={sig.achievedRR != null && sig.achievedRR > 0 ? "text-emerald-400" : "text-rose-400"}>{sig.achievedRR != null ? `${sig.achievedRR.toFixed(2)}x` : 'N/A'}</strong></div>
            <div>Bars to Resolve: <strong className="text-slate-200">{sig.barsToResolution ?? 'N/A'}</strong></div>
          </div>
          {sig.reason.length > 0 && (
            <div className="p-2 rounded bg-[#090d14] border border-white/[0.06] space-y-1 text-slate-300">
              {sig.reason.map((r: string, i: number) => (
                <p key={i}>• {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Backtesting Page Component
// ---------------------------------------------------------------------------

export default function Backtesting() {
  const [symbol, setSymbol] = useState<ChartSymbol>('EURUSD')
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('4H')
  const [lookback, setLookback] = useState(500)
  const [strategy, setStrategy] = useState<'wick-rejection' | 'order-block' | 'trend-following' | 'breakout' | 'supply-demand'>('wick-rejection')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestSummary | null>(null)
  const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'pending'>('all')

  const handleRun = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setResult(null)
    try {
      const candles = await getCandles(symbol, timeframe, lookback)
      if (!candles || candles.length < 30) {
        throw new Error('Not enough candle data returned. Check your connection.')
      }
      const mapped = candles.map((c: any) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      }))
      const opts = { symbol, timeframe, assetType: getAssetType(symbol) }
      const summary =
        strategy === 'order-block'
          ? runOrderBlockBacktest(mapped, opts)
          : strategy === 'trend-following'
          ? runTrendFollowingBacktest(mapped, opts)
          : strategy === 'breakout'
          ? runBreakoutBacktest(mapped, opts)
          : strategy === 'supply-demand'
          ? runSDBacktest(mapped, opts)
          : runBacktest(mapped, opts)
      setResult(summary)
      setStatus('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [symbol, timeframe, lookback, strategy])

  const filtered = result
    ? filter === 'all'
      ? result.signals
      : result.signals.filter((s: any) => s.outcome === filter)
    : []

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8 selection:bg-blue-500/20">
      {/* Header Bar */}
      <header className="h-14 border-b border-white/[0.08] bg-[#070709]/95 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-[#0d1117] border border-white/[0.12] flex items-center justify-center group-hover:border-white/[0.25] transition-colors">
              <img src="/TRAXO-icon.png" alt="TRAXO" className="w-4 h-4 object-contain" />
            </div>
            <span className="text-[11px] font-black tracking-[0.22em] uppercase text-white hidden sm:inline">
              TRAXO
            </span>
          </Link>

          <span className="h-4 w-px bg-white/[0.1] hidden sm:block shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1117] border border-white/[0.08]">
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-200 truncate">Backtesting Engine</span>
            </div>
          </div>
        </div>

        <DesktopWorkspaceNav />
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* UNIFIED CONTIGUOUS WORKSPACE CONTAINER (NO FLOATING CARDS) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl backdrop-blur-xl overflow-hidden divide-y divide-white/[0.08]">
          
          {/* Top Overview Banner & Configuration Bar */}
          <div className="p-5 sm:p-6 bg-[#05080f]/50 space-y-5">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Quantitative Walk-Forward Engine
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Strategy Backtesting & Expectancy Lab
                </h1>
                <p className="text-[12px] sm:text-[13px] text-slate-400 leading-relaxed">
                  Run forward walk-through simulations across historical candle data without look-ahead bias to derive true win rate, expectancy, and max drawdown.
                </p>
              </div>

              {result && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto xl:min-w-[30rem]">
                  <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Win Rate</span>
                    <span className="text-base font-extrabold text-emerald-400 tabular-nums">{pct(result.winRate)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Expectancy</span>
                    <span className={cn("text-base font-extrabold tabular-nums", result.expectancy > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {result.expectancy > 0 ? '+' : ''}{result.expectancy.toFixed(2)}R
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Max Drawdown</span>
                    <span className="text-base font-extrabold text-rose-400 tabular-nums">{result.maxDrawdownPct}%</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070b12] border border-white/[0.06] text-center">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total Signals</span>
                    <span className="text-base font-extrabold text-slate-200 tabular-nums">{result.totalSignals}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Config Control Inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-white/[0.06]">
              <div>
                <label className="block text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1">Strategy</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as any)}
                  className="w-full h-8 rounded-lg border border-white/[0.1] bg-[#090d14] text-[11px] font-bold text-white px-2.5 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="wick-rejection">Wick Rejection</option>
                  <option value="order-block">Order Block</option>
                  <option value="trend-following">Trend Following</option>
                  <option value="breakout">Breakout Momentum</option>
                  <option value="supply-demand">Supply & Demand</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1">Symbol</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value as ChartSymbol)}
                  className="w-full h-8 rounded-lg border border-white/[0.1] bg-[#090d14] text-[11px] font-bold text-white px-2.5 focus:outline-none focus:border-blue-500/50"
                >
                  {SYMBOLS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as ChartTimeframe)}
                  className="w-full h-8 rounded-lg border border-white/[0.1] bg-[#090d14] text-[11px] font-bold text-white px-2.5 focus:outline-none focus:border-blue-500/50"
                >
                  {TIMEFRAMES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-1">Lookback</label>
                <select
                  value={lookback}
                  onChange={(e) => setLookback(Number(e.target.value))}
                  className="w-full h-8 rounded-lg border border-white/[0.1] bg-[#090d14] text-[11px] font-bold text-white px-2.5 focus:outline-none focus:border-blue-500/50"
                >
                  {LOOKBACKS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleRun}
                  disabled={status === 'loading'}
                  className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg"
                >
                  {status === 'loading' ? (
                    <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                  <span>{status === 'loading' ? 'Executing...' : 'Run Simulation'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Error Callout */}
          {status === 'error' && (
            <div className="p-4 bg-rose-500/10 border-l-2 border-rose-500 text-rose-400 text-[11px] font-semibold flex items-center gap-2">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Results Summary & Signal Stream Table */}
          {result && status === 'done' && (
            <>
              {/* Detailed Metrics Panel */}
              <div className="p-5 sm:p-6 bg-[#070b12]/80 space-y-4">
                <h3 className="text-[12px] font-bold text-white uppercase tracking-wider">Simulation Quality Metrics</h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-[#090d14] border border-white/[0.06]">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase">Winning Trades</span>
                    <span className="text-base font-extrabold text-emerald-400">{result.wins}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#090d14] border border-white/[0.06]">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase">Losing Trades</span>
                    <span className="text-base font-extrabold text-rose-400">{result.losses}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#090d14] border border-white/[0.06]">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase">Avg Win R:R</span>
                    <span className="text-base font-extrabold text-blue-400">{result.avgWinRR}x</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#090d14] border border-white/[0.06]">
                    <span className="block text-[8px] font-bold text-slate-500 uppercase">Max Consec Losses</span>
                    <span className="text-base font-extrabold text-amber-400">{result.maxConsecLosses}</span>
                  </div>
                </div>
              </div>

              {/* Signals Log Table */}
              <div className="space-y-0">
                <div className="p-3 bg-[#070b12] flex items-center justify-between gap-3 border-b border-white/[0.06]">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                    Backtested Signals ({filtered.length})
                  </h3>

                  <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-lg border border-white/[0.06]">
                    {(['all', 'win', 'loss', 'pending'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          "h-6 px-2.5 rounded text-[9px] font-extrabold uppercase transition-all",
                          filter === f
                            ? "bg-white/[0.1] text-white border border-white/[0.15]"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table Header */}
                <div className="px-4 py-2 bg-[#05080f] grid grid-cols-[2rem_5.5rem_4rem_4.5rem_4.5rem_4.5rem_4.5rem_4.5rem_auto] gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-white/[0.06]">
                  <span>#</span>
                  <span>Date</span>
                  <span>Dir</span>
                  <span>Tier</span>
                  <span>Entry</span>
                  <span>SL</span>
                  <span>TP1</span>
                  <span>Result</span>
                  <span></span>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {filtered.length === 0 ? (
                    <p className="py-8 text-center text-[11px] text-slate-500">No {filter !== 'all' ? filter : ''} signals found.</p>
                  ) : (
                    filtered.map((sig: any, i: number) => <SignalRow key={sig.id} sig={sig} idx={i} />)
                  )}
                </div>
              </div>
            </>
          )}

          {status === 'idle' && (
            <div className="p-16 text-center space-y-3">
              <Award size={32} className="mx-auto text-blue-400/40" />
              <h3 className="text-sm font-bold text-white">Configure and Run Strategy Simulation</h3>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                Select your desired strategy framework, symbol, timeframe, and lookback depth above, then click Run Simulation.
              </p>
            </div>
          )}
        </div>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
