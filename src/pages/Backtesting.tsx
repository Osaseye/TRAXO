/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  PiCaretDown,
  PiCaretUp,
  PiPlayFill,
  PiWarning,
} from 'react-icons/pi';
import { getCandleData as getCandles } from '@/lib/api';
import {
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
} from '@/stores/useTradingContextStore';
import {
  runBacktest,
  runBreakoutBacktest,
  runOrderBlockBacktest,
  runSDBacktest,
  runTrendFollowingBacktest,
} from '../../server/algorithms/backtesting';
import type {
  BacktestSignalResult,
  BacktestSummary,
} from '../../server/algorithms/backtesting';
import type { WickRejectionAssetType } from '../../server/algorithms/wickRejection';

type BacktestStrategyId =
  | 'wick-rejection'
  | 'breakout'
  | 'order-block'
  | 'supply-demand'
  | 'trend-following';

const STRATEGIES: Array<{ id: BacktestStrategyId; label: string }> = [
  { id: 'wick-rejection', label: 'Wick Rejection' },
  { id: 'breakout', label: 'Breakout' },
  { id: 'order-block', label: 'Order Block' },
  { id: 'supply-demand', label: 'Supply & Demand' },
  { id: 'trend-following', label: 'Trend Following' },
];

const SYMBOLS: ChartSymbol[] = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'XAGUSD', 'AUDUSD',
  'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP',
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META',
  'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI',
];

const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

const LOOKBACKS = [
  { label: '100 bars', value: 100 },
  { label: '250 bars', value: 250 },
  { label: '500 bars', value: 500 },
  { label: '1,000 bars', value: 1000 },
];

const STOCK_SYMBOLS = new Set<ChartSymbol>([
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI',
]);

function getAssetType(symbol: ChartSymbol): WickRejectionAssetType {
  if (STOCK_SYMBOLS.has(symbol)) return 'STOCKS';
  return 'FOREX';
}

function formatPrice(value: number, symbol: ChartSymbol): string {
  const digits = symbol.includes('JPY')
    ? 3
    : symbol === 'XAUUSD' || symbol === 'XAGUSD' || STOCK_SYMBOLS.has(symbol)
    ? 2
    : 5;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatShortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function formatCurrency(val: number): string {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `-$${abs}` : `$${abs}`;
}

interface EquityPoint {
  step: number;
  time: number;
  label: string;
  equity: number;
  drawdownPct: number;
  drawdownDollar: number;
  tradePnl: number;
  outcome: 'start' | 'win' | 'loss';
}

interface SimulationMetrics {
  equitySeries: EquityPoint[];
  finalEquity: number;
  netProfitDollar: number;
  netProfitPct: number;
  winRatePct: number | null;
  profitFactor: number | null;
  profitFactorInfinite: boolean;
  maxDrawdownPct: number;
  maxDrawdownDollar: number;
  resolvedCount: number;
  pnlBySignalId: Record<string, number>;
}

function computeSimulationMetrics(
  signals: BacktestSignalResult[],
  startingCapital: number,
  riskPct: number
): SimulationMetrics {
  const safeCapital = Math.max(1, startingCapital);
  const safeRisk = Math.max(0.05, Math.min(25, riskPct));

  const ordered = [...signals].sort((a, b) => a.signalIdx - b.signalIdx);
  let equity = safeCapital;
  let peak = safeCapital;
  let grossProfit = 0;
  let grossLoss = 0;
  let maxDdPct = 0;
  let maxDdDollar = 0;
  let wins = 0;
  let losses = 0;

  const pnlBySignalId: Record<string, number> = {};
  const series: EquityPoint[] = [
    {
      step: 0,
      time: ordered[0]?.time ?? Math.floor(Date.now() / 1000),
      label: 'Start',
      equity: safeCapital,
      drawdownPct: 0,
      drawdownDollar: 0,
      tradePnl: 0,
      outcome: 'start',
    },
  ];

  let stepIdx = 0;
  for (const sig of ordered) {
    if (sig.outcome !== 'win' && sig.outcome !== 'loss') continue;

    stepIdx += 1;
    const riskDollars = equity * (safeRisk / 100);
    let pnl: number;

    if (sig.outcome === 'win') {
      wins += 1;
      const rr = sig.achievedRR != null && sig.achievedRR > 0 ? sig.achievedRR : 1.5;
      pnl = riskDollars * rr;
      grossProfit += pnl;
    } else {
      losses += 1;
      const lossR = sig.achievedRR != null && sig.achievedRR < 0 ? Math.abs(sig.achievedRR) : 1;
      pnl = -(riskDollars * lossR);
      grossLoss += Math.abs(pnl);
    }

    equity = Math.max(0, equity + pnl);
    if (equity > peak) peak = equity;

    const ddDollar = Math.max(0, peak - equity);
    const ddPct = peak > 0 ? (ddDollar / peak) * 100 : 0;

    if (ddPct > maxDdPct) maxDdPct = ddPct;
    if (ddDollar > maxDdDollar) maxDdDollar = ddDollar;

    pnlBySignalId[sig.id] = pnl;

    series.push({
      step: stepIdx,
      time: sig.time,
      label: formatShortDate(sig.time),
      equity,
      drawdownPct: -ddPct,
      drawdownDollar: ddDollar,
      tradePnl: pnl,
      outcome: sig.outcome,
    });
  }

  const resolvedCount = wins + losses;
  const netProfitDollar = equity - safeCapital;
  const netProfitPct = (netProfitDollar / safeCapital) * 100;
  const winRatePct = resolvedCount > 0 ? (wins / resolvedCount) * 100 : null;
  const profitFactorInfinite = grossLoss === 0 && grossProfit > 0;
  const profitFactor =
    resolvedCount === 0
      ? null
      : grossLoss > 0
      ? grossProfit / grossLoss
      : profitFactorInfinite
      ? Infinity
      : 0;

  return {
    equitySeries: series,
    finalEquity: equity,
    netProfitDollar,
    netProfitPct,
    winRatePct,
    profitFactor,
    profitFactorInfinite,
    maxDrawdownPct: maxDdPct,
    maxDrawdownDollar: maxDdDollar,
    resolvedCount,
    pnlBySignalId,
  };
}

function MonochromeCharts({
  series,
  startingCapital,
}: {
  series: EquityPoint[];
  startingCapital: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 640;
  const eqHeight = 220;
  const ddHeight = 175;
  const pad = { top: 16, right: 16, bottom: 26, left: 60 };

  const plotW = width - pad.left - pad.right;
  const eqPlotH = eqHeight - pad.top - pad.bottom;
  const ddPlotH = ddHeight - pad.top - pad.bottom;

  const hasTrades = series.length > 1;
  const minEq = Math.min(...series.map((p) => p.equity), startingCapital * 0.98);
  const maxEq = Math.max(...series.map((p) => p.equity), startingCapital * 1.02);
  const eqSpan = Math.max(1, maxEq - minEq);

  const minDd = Math.min(...series.map((p) => p.drawdownPct), -1);
  const ddSpan = Math.max(1, Math.abs(minDd));

  const xForIdx = (i: number) =>
    series.length <= 1 ? pad.left : pad.left + (i / (series.length - 1)) * plotW;

  const yForEq = (val: number) =>
    pad.top + eqPlotH - ((val - minEq) / eqSpan) * eqPlotH;

  const yForDd = (val: number) =>
    pad.top + ((0 - val) / ddSpan) * ddPlotH;

  const eqLinePoints = series
    .map((p, i) => `${xForIdx(i).toFixed(1)},${yForEq(p.equity).toFixed(1)}`)
    .join(' ');

  const eqAreaPoints =
    series.length > 1
      ? `${xForIdx(0).toFixed(1)},${(pad.top + eqPlotH).toFixed(1)} ${eqLinePoints} ${xForIdx(
          series.length - 1
        ).toFixed(1)},${(pad.top + eqPlotH).toFixed(1)}`
      : '';

  const ddLinePoints = series
    .map((p, i) => `${xForIdx(i).toFixed(1)},${yForDd(p.drawdownPct).toFixed(1)}`)
    .join(' ');

  const ddAreaPoints =
    series.length > 1
      ? `${xForIdx(0).toFixed(1)},${pad.top.toFixed(1)} ${ddLinePoints} ${xForIdx(
          series.length - 1
        ).toFixed(1)},${pad.top.toFixed(1)}`
      : '';

  const lastEquity = series[series.length - 1]?.equity ?? startingCapital;
  const eqStroke = lastEquity >= startingCapital ? '#34D399' : '#F87171';
  const activePoint =
    hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[series.length - 1];
  const baseLineY = yForEq(startingCapital);

  return (
    <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-white/[0.06]">
      {/* Equity Curve */}
      <div className="xl:col-span-7 flex flex-col justify-between">
        <div className="p-6 pb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
              Simulated equity curve
            </h2>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              {activePoint.step === 0
                ? 'Initial capital'
                : `Trade #${activePoint.step} (${activePoint.label})`}
              :{' '}
              <span className="font-mono tabular-nums font-semibold text-[#FAFAFA]">
                {formatCurrency(activePoint.equity)}
              </span>
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[12px] font-mono tabular-nums ${
              lastEquity >= startingCapital
                ? 'bg-[#34D399]/10 text-[#34D399]'
                : 'bg-[#F87171]/10 text-[#F87171]'
            }`}
          >
            {lastEquity >= startingCapital ? '+' : ''}
            {(((lastEquity - startingCapital) / Math.max(1, startingCapital)) * 100).toFixed(2)}%
          </span>
        </div>

        <div className="px-6 pb-6">
          {!hasTrades ? (
            <div className="h-[220px] rounded-xl bg-[#09090B] flex items-center justify-center text-[13px] text-[#71717A]">
              No resolved trades in replay window to plot equity progression.
            </div>
          ) : (
            <div className="rounded-xl bg-[#09090B] p-3">
              <svg viewBox={`0 0 ${width} ${eqHeight}`} className="w-full h-auto select-none">
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = pad.top + eqPlotH * t;
                  const val = maxEq - eqSpan * t;
                  return (
                    <g key={t}>
                      <line
                        x1={pad.left}
                        y1={y}
                        x2={width - pad.right}
                        y2={y}
                        stroke="rgba(255,255,255,0.04)"
                        strokeWidth="1"
                      />
                      <text
                        x={pad.left - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#71717A"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        ${Math.round(val).toLocaleString('en-US')}
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={pad.left}
                  y1={baseLineY}
                  x2={width - pad.right}
                  y2={baseLineY}
                  stroke="#3F3F46"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />

                {eqAreaPoints && (
                  <polygon points={eqAreaPoints} fill={eqStroke} fillOpacity={0.08} />
                )}

                <polyline
                  points={eqLinePoints}
                  fill="none"
                  stroke={eqStroke}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {series.map((p, i) => (
                  <circle
                    key={p.step}
                    cx={xForIdx(i)}
                    cy={yForEq(p.equity)}
                    r={hoverIdx === i ? 4.5 : 2.5}
                    fill={
                      hoverIdx === i
                        ? '#FAFAFA'
                        : p.outcome === 'loss'
                        ? '#F87171'
                        : p.outcome === 'win'
                        ? '#34D399'
                        : '#A1A1AA'
                    }
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                  />
                ))}

                <text x={pad.left} y={eqHeight - 6} fill="#71717A" fontSize="10" fontFamily="monospace">
                  Start
                </text>
                <text
                  x={width - pad.right}
                  y={eqHeight - 6}
                  textAnchor="end"
                  fill="#71717A"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  T{series.length - 1}
                </text>
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Drawdown Chart */}
      <div className="xl:col-span-5 flex flex-col justify-between">
        <div className="p-6 pb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
              Peak-to-valley drawdown
            </h2>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              Underwater depth:{' '}
              <span className="font-mono tabular-nums font-semibold text-[#F87171]">
                {activePoint.drawdownPct.toFixed(2)}% ({formatCurrency(-activePoint.drawdownDollar)})
              </span>
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#F87171]/10 text-[#F87171] text-[12px] font-mono tabular-nums">
            Max {minDd.toFixed(2)}%
          </span>
        </div>

        <div className="px-6 pb-6">
          {!hasTrades ? (
            <div className="h-[220px] rounded-xl bg-[#09090B] flex items-center justify-center text-[13px] text-[#71717A]">
              Zero underwater drawdown recorded.
            </div>
          ) : (
            <div className="rounded-xl bg-[#09090B] p-3">
              <svg viewBox={`0 0 ${width} ${ddHeight}`} className="w-full h-auto select-none">
                {[0, 0.33, 0.66, 1].map((t) => {
                  const y = pad.top + ddPlotH * t;
                  const val = -(ddSpan * t);
                  return (
                    <g key={t}>
                      <line
                        x1={pad.left}
                        y1={y}
                        x2={width - pad.right}
                        y2={y}
                        stroke="rgba(255,255,255,0.04)"
                        strokeWidth="1"
                      />
                      <text
                        x={pad.left - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#71717A"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {val.toFixed(1)}%
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={pad.left}
                  y1={pad.top}
                  x2={width - pad.right}
                  y2={pad.top}
                  stroke="#3F3F46"
                  strokeWidth="1"
                />

                {ddAreaPoints && (
                  <polygon points={ddAreaPoints} fill="#F87171" fillOpacity={0.12} />
                )}

                <polyline
                  points={ddLinePoints}
                  fill="none"
                  stroke="#F87171"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                <text x={pad.left} y={ddHeight - 6} fill="#71717A" fontSize="10" fontFamily="monospace">
                  0% Peak
                </text>
                <text
                  x={width - pad.right}
                  y={ddHeight - 6}
                  textAnchor="end"
                  fill="#71717A"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  T{series.length - 1}
                </text>
              </svg>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TradeLedgerRow({
  sig,
  idx,
  symbol,
  pnlDollar,
}: {
  sig: BacktestSignalResult;
  idx: number;
  symbol: ChartSymbol;
  pnlDollar: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const isWin = sig.outcome === 'win';
  const isLoss = sig.outcome === 'loss';

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-3.5 grid grid-cols-[2.5rem_5.5rem_4rem_5rem_6rem_6rem_6rem_4.5rem_6rem_5rem_1.5rem] gap-2 items-center text-left hover:bg-white/[0.02] transition-colors text-[13.5px]"
      >
        <span className="font-mono text-[12px] tabular-nums text-[#71717A]">
          #{idx + 1}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-[#A1A1AA] truncate">
          {formatShortDate(sig.time)}
        </span>
        <span
          className={`px-2 py-0.5 rounded-md text-[12px] font-medium text-center ${
            sig.direction === 'BUY'
              ? 'bg-[#34D399]/10 text-[#34D399]'
              : 'bg-[#F87171]/10 text-[#F87171]'
          }`}
        >
          {sig.direction}
        </span>
        <span className="text-[12.5px] text-[#A1A1AA] truncate capitalize">
          {sig.tier}
        </span>
        <span className="font-mono tabular-nums text-[#FAFAFA] text-right">
          {formatPrice(sig.entry, symbol)}
        </span>
        <span className="font-mono tabular-nums text-[#F87171] text-right">
          {formatPrice(sig.sl, symbol)}
        </span>
        <span className="font-mono tabular-nums text-[#34D399] text-right">
          {formatPrice(sig.tp1, symbol)}
        </span>
        <span
          className={`font-mono tabular-nums text-right ${
            sig.achievedRR == null
              ? 'text-[#71717A]'
              : sig.achievedRR >= 0
              ? 'text-[#34D399]'
              : 'text-[#F87171]'
          }`}
        >
          {sig.achievedRR != null ? `${sig.achievedRR.toFixed(2)}R` : '—'}
        </span>
        <span
          className={`font-mono tabular-nums text-right font-semibold ${
            pnlDollar == null
              ? 'text-[#71717A]'
              : pnlDollar >= 0
              ? 'text-[#34D399]'
              : 'text-[#F87171]'
          }`}
        >
          {pnlDollar == null ? '—' : `${pnlDollar >= 0 ? '+' : ''}${formatCurrency(pnlDollar)}`}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[12px] font-medium text-center capitalize ${
            isWin
              ? 'bg-[#34D399]/10 text-[#34D399]'
              : isLoss
              ? 'bg-[#F87171]/10 text-[#F87171]'
              : 'bg-[#18181B] text-[#A1A1AA]'
          }`}
        >
          {sig.outcome}
        </span>
        <span className="flex justify-end text-[#71717A]">
          {open ? <PiCaretUp size={16} /> : <PiCaretDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="px-6 py-4 bg-[#161619] border-t border-white/[0.06] space-y-3 text-[13px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12.5px] text-[#A1A1AA]">
            <div>
              Score:{' '}
              <strong className="font-mono tabular-nums text-[#FAFAFA]">{sig.score}</strong>
            </div>
            <div>
              Confidence:{' '}
              <strong className="font-mono tabular-nums text-[#FAFAFA]">
                {sig.confidence}%
              </strong>
            </div>
            <div>
              Bars to exit:{' '}
              <strong className="font-mono tabular-nums text-[#FAFAFA]">
                {sig.barsToResolution ?? 'Open'}
              </strong>
            </div>
            <div>
              TP2 target:{' '}
              <strong className="font-mono tabular-nums text-[#34D399]">
                {formatPrice(sig.tp2, symbol)}
              </strong>
            </div>
          </div>

          {sig.reason.length > 0 && (
            <div className="pt-3 border-t border-white/[0.06] space-y-1 text-[13px] text-[#A1A1AA] max-w-[65ch]">
              {sig.reason.map((r, i) => (
                <p key={i}>• {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Backtesting() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAccountBalance = useTradingContextStore((s) => s.accountBalance);
  const initialRiskPct = useTradingContextStore((s) => s.riskPerTradePct);

  const strategyParam = searchParams.get('strategy');
  const validParamStrategy = STRATEGIES.some((s) => s.id === strategyParam)
    ? (strategyParam as BacktestStrategyId)
    : null;

  const [localStrategy, setLocalStrategy] = useState<BacktestStrategyId>(
    validParamStrategy ?? 'wick-rejection'
  );
  const strategy = validParamStrategy ?? localStrategy;

  const handleStrategyChange = (next: BacktestStrategyId) => {
    setLocalStrategy(next);
    if (strategyParam !== null) {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          updated.set('strategy', next);
          return updated;
        },
        { replace: true }
      );
    }
  };

  const [symbol, setSymbol] = useState<ChartSymbol>('EURUSD');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('4H');
  const [lookback, setLookback] = useState<number>(500);
  const [capital, setCapital] = useState<number>(initialAccountBalance || 10000);
  const [riskPct, setRiskPct] = useState<number>(initialRiskPct || 1.0);

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestSummary | null>(null);
  const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'pending'>('all');

  const handleRun = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const candles = await getCandles(symbol, timeframe, lookback);
      if (!candles || candles.length < 30) {
        throw new Error('Insufficient historical candle series returned for selected range.');
      }

      const mapped = candles.map((c: any) => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume ?? 0),
      }));

      const opts = { symbol, timeframe, assetType: getAssetType(symbol) };
      const summary =
        strategy === 'order-block'
          ? runOrderBlockBacktest(mapped, opts)
          : strategy === 'trend-following'
          ? runTrendFollowingBacktest(mapped, opts)
          : strategy === 'breakout'
          ? runBreakoutBacktest(mapped, opts)
          : strategy === 'supply-demand'
          ? runSDBacktest(mapped, opts)
          : runBacktest(mapped, opts);

      setResult(summary);
      setStatus('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Backtest simulation failed.');
      setStatus('error');
    }
  }, [symbol, timeframe, lookback, strategy]);

  const simMetrics = useMemo(() => {
    if (!result) return null;
    return computeSimulationMetrics(result.signals, capital, riskPct);
  }, [result, capital, riskPct]);

  const filteredSignals = useMemo(() => {
    if (!result) return [];
    if (filter === 'all') return result.signals;
    return result.signals.filter((s) => s.outcome === filter);
  }, [result, filter]);

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Workbench Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-[#71717A]">
              Walk-forward historical simulator
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] leading-[1.15] text-[#FAFAFA]">
              Backtesting Workbench
            </h1>
          </div>

          {result && (
            <div className="px-3.5 py-2 rounded-full bg-[#111113] border border-white/[0.07] text-[12.5px] font-mono tabular-nums text-[#A1A1AA]">
              {result.symbol} · {result.timeframe} · {result.totalCandles} candles scanned
            </div>
          )}
        </header>

        {/* Parameter Control Bar */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#71717A]">
                Algorithm
              </label>
              <select
                value={strategy}
                onChange={(e) => handleStrategyChange(e.target.value as BacktestStrategyId)}
                className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13px] text-[#FAFAFA] transition-colors"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#18181B]">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#71717A]">
                Symbol
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value as ChartSymbol)}
                className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13px] font-medium text-[#FAFAFA] transition-colors"
              >
                {SYMBOLS.map((sym) => (
                  <option key={sym} value={sym} className="bg-[#18181B]">
                    {sym}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#71717A]">
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as ChartTimeframe)}
                className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf} className="bg-[#18181B]">
                    {tf}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#71717A]">
                Candle range
              </label>
              <select
                value={lookback}
                onChange={(e) => setLookback(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
              >
                {LOOKBACKS.map((l) => (
                  <option key={l.value} value={l.value} className="bg-[#18181B]">
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#71717A]">
                Capital ($)
              </label>
              <input
                type="number"
                min={100}
                step={500}
                value={capital}
                onChange={(e) => setCapital(Math.max(1, parseFloat(e.target.value) || 0))}
                className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[#71717A]">
                Risk / trade (%)
              </label>
              <input
                type="number"
                min={0.1}
                max={25}
                step={0.25}
                value={riskPct}
                onChange={(e) => setRiskPct(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
              />
            </div>

            <div className="col-span-2 md:col-span-4 xl:col-span-1">
              <button
                type="button"
                onClick={() => void handleRun()}
                disabled={status === 'loading'}
                className="w-full h-10 px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <PiPlayFill size={14} />
                {status === 'loading' ? 'Simulating...' : 'Run replay'}
              </button>
            </div>
          </div>
        </section>

        {/* Error State */}
        {status === 'error' && error && (
          <div className="p-4 rounded-2xl bg-[#F87171]/10 border border-[#F87171]/25 flex items-center gap-3 text-[13.5px] text-[#F87171]">
            <PiWarning size={17} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Calm Pre-Run Empty State */}
        {status === 'idle' && (
          <div className="py-14 px-6 rounded-2xl bg-[#111113] border border-white/[0.07] text-center space-y-5">
            <img
              src="/brand/empty-journal.png"
              alt="Historical replay canvas"
              className="w-full max-w-[340px] mx-auto rounded-xl opacity-90"
            />
            <div className="space-y-2">
              <p className="text-[16px] font-medium text-[#FAFAFA]">
                Configure parameters above to run a walk-forward replay
              </p>
              <p className="text-[14px] text-[#A1A1AA] max-w-[54ch] mx-auto leading-relaxed">
                Evaluates signal triggers candle by candle without look-ahead bias, computing compounded equity, drawdown depth, profit factor, and trade execution telemetry.
              </p>
            </div>
          </div>
        )}

        {/* Simulation Results */}
        {result && simMetrics && (
          <div className="space-y-8">
            {/* Unified 5-Metric KPI Bar */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 lg:gap-0 lg:divide-x lg:divide-white/[0.06]">
              <div className="lg:pr-6">
                <p className="text-[12px] font-medium text-[#71717A]">Net profit</p>
                <p
                  className={`text-[24px] leading-tight font-mono font-semibold tabular-nums mt-1.5 ${
                    simMetrics.netProfitDollar >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                  }`}
                >
                  {simMetrics.netProfitDollar >= 0 ? '+' : ''}
                  {formatCurrency(simMetrics.netProfitDollar)}
                </p>
                <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-1">
                  {simMetrics.netProfitPct >= 0 ? '+' : ''}
                  {simMetrics.netProfitPct.toFixed(2)}% on {formatCurrency(capital)}
                </p>
              </div>

              <div className="lg:px-6">
                <p className="text-[12px] font-medium text-[#71717A]">Win rate</p>
                <p
                  className={`text-[24px] leading-tight font-mono font-semibold tabular-nums mt-1.5 ${
                    simMetrics.winRatePct === null
                      ? 'text-[#71717A]'
                      : simMetrics.winRatePct >= 50
                      ? 'text-[#34D399]'
                      : 'text-[#F87171]'
                  }`}
                >
                  {simMetrics.winRatePct !== null ? `${simMetrics.winRatePct.toFixed(1)}%` : '—'}
                </p>
                <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-1">
                  Expectancy {result.expectancy >= 0 ? '+' : ''}
                  {result.expectancy.toFixed(2)}R
                </p>
              </div>

              <div className="lg:px-6">
                <p className="text-[12px] font-medium text-[#71717A]">Profit factor</p>
                <p
                  className={`text-[24px] leading-tight font-mono font-semibold tabular-nums mt-1.5 ${
                    simMetrics.profitFactor === null
                      ? 'text-[#71717A]'
                      : simMetrics.profitFactorInfinite || simMetrics.profitFactor >= 1.2
                      ? 'text-[#34D399]'
                      : simMetrics.profitFactor < 1
                      ? 'text-[#F87171]'
                      : 'text-[#FAFAFA]'
                  }`}
                >
                  {simMetrics.profitFactor === null
                    ? '—'
                    : simMetrics.profitFactorInfinite
                    ? 'INF'
                    : simMetrics.profitFactor.toFixed(2)}
                </p>
                <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-1">
                  Avg win {result.avgWinRR.toFixed(2)}R
                </p>
              </div>

              <div className="lg:px-6">
                <p className="text-[12px] font-medium text-[#71717A]">Max drawdown</p>
                <p
                  className={`text-[24px] leading-tight font-mono font-semibold tabular-nums mt-1.5 ${
                    simMetrics.maxDrawdownPct > 0 ? 'text-[#F87171]' : 'text-[#FAFAFA]'
                  }`}
                >
                  {simMetrics.maxDrawdownPct > 0
                    ? `-${simMetrics.maxDrawdownPct.toFixed(2)}%`
                    : '0.00%'}
                </p>
                <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-1">
                  Max streak loss: {result.maxConsecLosses}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1 lg:pl-6">
                <p className="text-[12px] font-medium text-[#71717A]">Total trades</p>
                <p className="text-[24px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1.5">
                  {result.totalSignals}
                </p>
                <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-1">
                  <span className="text-[#34D399]">{result.wins}W</span>
                  {' / '}
                  <span className="text-[#F87171]">{result.losses}L</span>
                  {result.pending > 0 ? ` · ${result.pending} open` : ''}
                </p>
              </div>
            </section>

            {/* Monochrome Equity Curve & Drawdown Charts */}
            <MonochromeCharts
              series={simMetrics.equitySeries}
              startingCapital={capital}
            />

            {/* Clean Scrollable Trade Ledger */}
            <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
              <div className="p-6 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                    Simulated trade ledger
                  </h2>
                  <p className="text-[13px] text-[#71717A] mt-0.5">
                    Select any execution row to inspect algorithmic triggers and score metadata
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#18181B]">
                  {(
                    [
                      { key: 'all', label: `All (${result.signals.length})` },
                      { key: 'win', label: `Wins (${result.wins})` },
                      { key: 'loss', label: `Losses (${result.losses})` },
                      { key: 'pending', label: `Pending (${result.pending})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilter(tab.key)}
                      className={`px-3 py-1 rounded-full text-[12.5px] font-medium transition-colors ${
                        filter === tab.key
                          ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                          : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredSignals.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] text-[#71717A]">
                  No simulated trades match the selected filter.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <div className="min-w-[820px]">
                    <div className="sticky top-0 z-10 px-6 py-3 bg-[#161619] border-b border-white/[0.06] grid grid-cols-[2.5rem_5.5rem_4rem_5rem_6rem_6rem_6rem_4.5rem_6rem_5rem_1.5rem] gap-2 text-[12px] font-medium text-[#71717A]">
                      <span>#</span>
                      <span>Date</span>
                      <span className="text-center">Side</span>
                      <span>Tier</span>
                      <span className="text-right">Entry</span>
                      <span className="text-right">SL</span>
                      <span className="text-right">TP1</span>
                      <span className="text-right">R:R</span>
                      <span className="text-right">P&amp;L ($)</span>
                      <span className="text-center">Result</span>
                      <span />
                    </div>

                    <div className="divide-y divide-white/[0.05]">
                      {filteredSignals.map((sig, idx) => (
                        <TradeLedgerRow
                          key={sig.id}
                          sig={sig}
                          idx={idx}
                          symbol={symbol}
                          pnlDollar={simMetrics.pnlBySignalId[sig.id]}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
