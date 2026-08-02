/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react'
import { BarChart2, ChevronDown, Play, TrendingUp, Clock, Zap, Award, AlertTriangle } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { getCandleData as getCandles } from '@/lib/api'
import { runBacktest, runOrderBlockBacktest, runTrendFollowingBacktest, runBreakoutBacktest, runSDBacktest } from '../../server/algorithms/backtesting'
import type { BacktestSummary, BacktestSignalResult } from '../../server/algorithms/backtesting'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'
import type { WickRejectionAssetType } from '../../server/algorithms/wickRejection'

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
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'yellow' | 'blue' | 'default' }) {
  const valueColor = tone === 'green' ? 'text-[#86efac]' : tone === 'red' ? 'text-[#fca5a5]' : tone === 'yellow' ? 'text-[#fde68a]' : tone === 'blue' ? 'text-[#93c5fd]' : 'text-[#f8fafc]'
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d1117] p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#64748b]">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[#475569]">{sub}</p>}
    </div>
  )
}

function SignalRow({ sig, idx }: { sig: BacktestSignalResult; idx: number }) {
  const [open, setOpen] = useState(false)
  const outcomeColor = sig.outcome === 'win' ? 'text-[#86efac] border-[#22c55e]/30 bg-[#22c55e]/10'
    : sig.outcome === 'loss' ? 'text-[#fca5a5] border-[#ef4444]/30 bg-[#ef4444]/10'
    : 'text-[#93c5fd] border-[#3b82f6]/30 bg-[#3b82f6]/10'
  const dirColor = sig.direction === 'BUY' ? 'text-[#86efac]' : 'text-[#fca5a5]'
  const tierColor = sig.tier === 'prime' ? 'text-[#fde68a]' : sig.tier === 'standard' ? 'text-[#93c5fd]' : 'text-[#94a3b8]'

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 grid grid-cols-[2rem_6rem_4.5rem_4rem_4.5rem_4.5rem_4.5rem_4rem_auto] gap-3 items-center text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[11px] text-[#475569]">#{idx + 1}</span>
        <span className="text-[12px] text-[#cbd5e1]">{formatDate(sig.time)}</span>
        <span className={`text-[12px] font-semibold ${dirColor}`}>{sig.direction}</span>
        <span className={`text-[11px] font-semibold ${tierColor}`}>{sig.tier}</span>
        <span className="text-[12px] text-[#e5e7eb]">{formatPrice(sig.entry)}</span>
        <span className="text-[12px] text-[#fca5a5]">{formatPrice(sig.sl)}</span>
        <span className="text-[12px] text-[#86efac]">{formatPrice(sig.tp1)}</span>
        <span className={`text-[11px] font-bold rounded border px-2 py-0.5 ${outcomeColor}`}>{sig.outcome}</span>
        <ChevronDown size={14} className={`text-[#475569] transition-transform ml-auto ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-white/[0.04] pt-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
            <div><span className="text-[#64748b]">Score:</span> <span className="text-[#e5e7eb] font-semibold">{sig.score}</span></div>
            <div><span className="text-[#64748b]">Confidence:</span> <span className="text-[#e5e7eb] font-semibold">{sig.confidence}%</span></div>
            <div><span className="text-[#64748b]">RR achieved:</span> <span className={sig.achievedRR != null && sig.achievedRR > 0 ? 'text-[#86efac] font-semibold' : 'text-[#fca5a5] font-semibold'}>{sig.achievedRR != null ? sig.achievedRR.toFixed(2) : 'n/a'}</span></div>
            <div><span className="text-[#64748b]">Bars to resolve:</span> <span className="text-[#e5e7eb] font-semibold">{sig.barsToResolution ?? 'n/a'}</span></div>
            <div><span className="text-[#64748b]">TP source:</span> <span className={sig.tp1_source === 'structure' ? 'text-[#fde68a] font-semibold' : 'text-[#94a3b8] font-semibold'}>{sig.tp1_source}</span></div>
            <div><span className="text-[#64748b]">OB confluence:</span> <span className={sig.order_block_confluence ? 'text-[#86efac] font-semibold' : 'text-[#475569]'}>{sig.order_block_confluence ? 'Yes' : 'No'}</span></div>
            <div><span className="text-[#64748b]">Liquidity sweep:</span> <span className={sig.liquidity_sweep ? 'text-[#86efac] font-semibold' : 'text-[#475569]'}>{sig.liquidity_sweep ? 'Yes' : 'No'}</span></div>
          </div>
          <div className="rounded-lg bg-[#0b0f17] border border-white/[0.05] p-3 space-y-1">
            {sig.reason.map((r: string, i: number) => (
              <p key={i} className="text-[11px] text-[#64748b]">• {r}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
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
        throw new Error('Not enough candle data returned. Check your API key in .env.')
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
        strategy === 'order-block'      ? runOrderBlockBacktest(mapped, opts) :
        strategy === 'trend-following'  ? runTrendFollowingBacktest(mapped, opts) :
        strategy === 'breakout'         ? runBreakoutBacktest(mapped, opts) :
        strategy === 'supply-demand'    ? runSDBacktest(mapped, opts) :
        runBacktest(mapped, opts)
      setResult(summary)
      setStatus('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [symbol, timeframe, lookback, strategy])

  const filtered = result
    ? filter === 'all' ? result.signals : result.signals.filter((s: any) => s.outcome === filter)
    : []

  const expectancyColor = result && result.expectancy > 0 ? 'green' : result && result.expectancy < 0 ? 'red' : 'default'

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/TRAXO-icon.png" alt="TRAXO" className="w-6 h-6 object-contain shrink-0" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white hidden sm:inline">TRAXO</span>
          <span className="hidden sm:block h-4 w-px bg-white/[0.1]" />
          <h1 className="text-[14px] font-semibold text-[#e5e7eb] truncate">Backtesting</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Config card */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-[#6366f1]" />
            <h2 className="text-[13px] font-semibold text-[#e5e7eb]">Backtest Configuration</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#64748b] mb-1.5">Strategy</label>
              <div className="relative">
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as 'wick-rejection' | 'order-block' | 'trend-following' | 'breakout' | 'supply-demand')}
                  className="w-full h-9 rounded-lg border border-white/[0.1] bg-[#0b0f17] text-[12px] text-[#e5e7eb] px-3 pr-8 appearance-none focus:outline-none focus:border-[#6366f1]/60"
                >
                  <option value="wick-rejection">Wick Rejection</option>
                  <option value="order-block">Order Block</option>
                  <option value="trend-following">Trend Following</option>
                  <option value="breakout">Breakout</option>
                  <option value="supply-demand">Supply &amp; Demand</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#64748b] mb-1.5">Symbol</label>
              <div className="relative">
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value as ChartSymbol)}
                  className="w-full h-9 rounded-lg border border-white/[0.1] bg-[#0b0f17] text-[12px] text-[#e5e7eb] px-3 pr-8 appearance-none focus:outline-none focus:border-[#6366f1]/60"
                >
                  {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#64748b] mb-1.5">Timeframe</label>
              <div className="relative">
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as ChartTimeframe)}
                  className="w-full h-9 rounded-lg border border-white/[0.1] bg-[#0b0f17] text-[12px] text-[#e5e7eb] px-3 pr-8 appearance-none focus:outline-none focus:border-[#6366f1]/60"
                >
                  {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#64748b] mb-1.5">Lookback</label>
              <div className="relative">
                <select
                  value={lookback}
                  onChange={(e) => setLookback(Number(e.target.value))}
                  className="w-full h-9 rounded-lg border border-white/[0.1] bg-[#0b0f17] text-[12px] text-[#e5e7eb] px-3 pr-8 appearance-none focus:outline-none focus:border-[#6366f1]/60"
                >
                  {LOOKBACKS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleRun}
                disabled={status === 'loading'}
                className="w-full h-9 rounded-lg bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[12px] font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {status === 'loading' ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                {status === 'loading' ? 'Running…' : 'Run Backtest'}
              </button>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[#475569]">
            Fetches real historical candles, then walks forward applying the selected strategy — no look-ahead bias.
            Simulates each trade forward up to 50 bars to determine if TP1 or SL was hit first.
            Order Block uses a rolling 50-candle window to detect BOS + zone setups.
          </p>
        </section>

        {/* Error */}
        {status === 'error' && (
          <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-[#fca5a5] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#fca5a5]">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && status === 'done' && (
          <>
            {/* Summary stats */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[13px] font-semibold text-[#e5e7eb]">
                  {result.symbol} · {result.timeframe} · {result.totalCandles} candles
                </h2>
                <span className="text-[11px] text-[#475569]">{result.totalSignals} signals found</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <StatCard label="Win Rate" value={pct(result.winRate)} tone={result.winRate >= 0.5 ? 'green' : 'red'} />
                <StatCard label="Wins" value={String(result.wins)} tone="green" />
                <StatCard label="Losses" value={String(result.losses)} tone="red" />
                <StatCard label="Pending" value={String(result.pending)} tone="blue" />
                <StatCard label="Avg Win RR" value={`${result.avgWinRR}R`} tone="green" sub="TP1 only" />
                <StatCard label="Avg Loss RR" value={`${result.avgLossRR}R`} tone="red" />
                <StatCard label="Expectancy" value={`${result.expectancy > 0 ? '+' : ''}${result.expectancy.toFixed(3)}R`} tone={expectancyColor as 'green' | 'red'} sub="per trade" />
                <StatCard label="Max Drawdown" value={`${result.maxDrawdownPct}%`} tone={result.maxDrawdownPct > 20 ? 'red' : result.maxDrawdownPct > 10 ? 'yellow' : 'green'} sub="simulated" />
              </div>
            </section>

            {/* Quality breakdown */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <h3 className="text-[12px] font-semibold text-[#e5e7eb] mb-4">Signal Quality Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
                {(['prime', 'standard', 'aggressive'] as const).map((tier) => {
                  const tierSigs = result.signals.filter((s: any) => s.tier === tier)
                  const tierWins = tierSigs.filter((s: any) => s.outcome === 'win').length
                  const tierSettled = tierSigs.filter((s: any) => s.outcome !== 'pending').length
                  const tierWR = tierSettled > 0 ? (tierWins / tierSettled * 100).toFixed(0) : '—'
                  return (
                    <div key={tier} className="rounded-lg border border-white/[0.06] bg-[#0b0f17] p-3">
                      <p className={`text-[11px] font-semibold uppercase ${tier === 'prime' ? 'text-[#fde68a]' : tier === 'standard' ? 'text-[#93c5fd]' : 'text-[#94a3b8]'}`}>{tier}</p>
                      <p className="mt-1 text-lg font-bold text-[#f8fafc]">{tierSigs.length}</p>
                      <p className="mt-0.5 text-[10px] text-[#64748b]">{tierWR}% win rate</p>
                    </div>
                  )
                })}
                <div className="rounded-lg border border-white/[0.06] bg-[#0b0f17] p-3">
                  <p className="text-[11px] font-semibold uppercase text-[#a78bfa]">OB Confluence</p>
                  <p className="mt-1 text-lg font-bold text-[#f8fafc]">{result.signals.filter((s: any) => s.order_block_confluence).length}</p>
                  <p className="mt-0.5 text-[10px] text-[#64748b]">with order block</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-[12px]">
                <div className="flex items-center gap-2"><TrendingUp size={13} className="text-[#86efac]" /><span className="text-[#64748b]">Structure TPs:</span><span className="font-semibold text-[#e5e7eb]">{result.signals.filter((s: any) => s.tp1_source === 'structure').length}</span></div>
                <div className="flex items-center gap-2"><Zap size={13} className="text-[#fde68a]" /><span className="text-[#64748b]">Liquidity sweeps:</span><span className="font-semibold text-[#e5e7eb]">{result.signals.filter((s: any) => s.liquidity_sweep).length}</span></div>
                <div className="flex items-center gap-2"><Clock size={13} className="text-[#93c5fd]" /><span className="text-[#64748b]">Max consec. losses:</span><span className="font-semibold text-[#fca5a5]">{result.maxConsecLosses}</span></div>
              </div>
            </section>

            {/* Signal log */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-[13px] font-semibold text-[#e5e7eb]">Signal Log</h3>
                <div className="flex items-center gap-1.5">
                  {(['all', 'win', 'loss', 'pending'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`h-7 px-3 rounded-md text-[11px] font-semibold transition-colors ${
                        filter === f
                          ? 'bg-[#6366f1] text-white'
                          : 'border border-white/[0.08] bg-[#0b0f17] text-[#94a3b8] hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Header row */}
              <div className="px-4 py-2 grid grid-cols-[2rem_6rem_4.5rem_4rem_4.5rem_4.5rem_4.5rem_4rem_auto] gap-3 text-[10px] uppercase tracking-wider text-[#475569]">
                <span>#</span>
                <span>Date</span>
                <span>Dir</span>
                <span>Tier</span>
                <span>Entry</span>
                <span>SL</span>
                <span>TP1</span>
                <span>Result</span>
              </div>

              <div className="space-y-1.5">
                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-[#475569]">No {filter !== 'all' ? filter : ''} signals to show.</p>
                ) : (
                  filtered.map((sig: any, i: number) => <SignalRow key={sig.id} sig={sig} idx={i} />)
                )}
              </div>
            </section>
          </>
        )}

        {status === 'idle' && (
          <div className="rounded-2xl border border-white/[0.05] bg-[#0d1117] p-12 text-center">
            <Award size={36} className="mx-auto text-[#6366f1] opacity-40" />
            <p className="mt-4 text-[14px] font-semibold text-[#475569]">Configure and run a backtest above</p>
            <p className="mt-2 text-[12px] text-[#374151]">The algorithm will walk through real historical data and report win rate, expectancy, and per-signal analysis.</p>
          </div>
        )}

      </main>
      <MobileFloatingWorkspaceNav />
    </div>
  )
}
