import { useEffect, useMemo, useState } from 'react';
import {
  PiArrowCounterClockwise,
  PiCaretLeft,
  PiCaretRight,
  PiFastForward,
  PiPause,
  PiPlay,
  PiShieldCheck,
  PiX,
} from 'react-icons/pi';
import type {
  PaperTradeRecord,
  TradeReplayCandle,
  TradeReplaySnapshot,
} from '@/hooks/useMetaApi';

interface TradeReplayDrawerProps {
  tradeId: string | null;
  fallbackTrade?: PaperTradeRecord | null;
  onClose: () => void;
  fetchTradeReplay: (tradeId: string) => Promise<TradeReplaySnapshot | null>;
}

function formatPrice(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  if (val >= 1000) return val.toFixed(2);
  if (val >= 50) return val.toFixed(3);
  return val.toFixed(5);
}

function formatTimeUtc(unixSec: number | null | undefined): string {
  if (!unixSec) return '—';
  const d = new Date(unixSec * 1000);
  return d.toISOString().replace('T', ' ').slice(5, 16) + ' UTC';
}

function findBarIndexAtOrAfter(candles: TradeReplayCandle[], targetSec: number | null | undefined): number {
  if (!candles.length || !targetSec) return -1;
  const idx = candles.findIndex((c) => c.time >= targetSec);
  return idx >= 0 ? idx : candles.length - 1;
}

export function TradeReplayDrawer({
  tradeId,
  fallbackTrade,
  onClose,
  fetchTradeReplay,
}: TradeReplayDrawerProps) {
  const [snapshot, setSnapshot] = useState<TradeReplaySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5>(1);

  useEffect(() => {
    if (!tradeId) {
      setSnapshot(null);
      setPlaying(false);
      return;
    }
    let active = true;
    setLoading(true);
    setPlaying(false);

    fetchTradeReplay(tradeId)
      .then((res) => {
        if (!active) return;
        setSnapshot(res);
        if (res && res.candles.length > 0) {
          setPlaybackIdx(res.candles.length - 1);
        } else {
          setPlaybackIdx(0);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tradeId, fetchTradeReplay]);

  const candles = snapshot?.candles || [];
  const trade = snapshot?.trade || fallbackTrade || null;

  useEffect(() => {
    if (!playing || candles.length === 0) return;
    const intervalMs = speed === 5 ? 160 : speed === 2 ? 380 : 720;
    const timer = setInterval(() => {
      setPlaybackIdx((prev) => {
        if (prev >= candles.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [playing, speed, candles.length]);

  const entryIdx = useMemo(
    () => findBarIndexAtOrAfter(candles, trade?.filledAt ?? trade?.createdAt),
    [candles, trade?.filledAt, trade?.createdAt]
  );
  const tp1Idx = useMemo(
    () => findBarIndexAtOrAfter(candles, trade?.tp1HitAt),
    [candles, trade?.tp1HitAt]
  );
  const exitIdx = useMemo(
    () => findBarIndexAtOrAfter(candles, trade?.closedAt),
    [candles, trade?.closedAt]
  );

  const visibleCandles = useMemo(() => {
    if (!candles.length) return [];
    const safeIdx = Math.max(0, Math.min(playbackIdx, candles.length - 1));
    return candles.slice(0, safeIdx + 1);
  }, [candles, playbackIdx]);

  const chartGeometry = useMemo(() => {
    if (!candles.length || !trade) return null;

    const width = 920;
    const height = 370;
    const padL = 16;
    const padR = 78;
    const padT = 24;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const levels: number[] = [trade.requestedEntry, trade.slPrice, trade.tp1Price];
    if (trade.fillPrice) levels.push(trade.fillPrice);
    if (trade.currentSl) levels.push(trade.currentSl);
    if (trade.tp2Price) levels.push(trade.tp2Price);

    let minP = Math.min(...levels);
    let maxP = Math.max(...levels);
    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }

    const span = Math.max(1e-6, maxP - minP);
    minP -= span * 0.1;
    maxP += span * 0.1;
    const fullSpan = maxP - minP;

    const toY = (price: number) => padT + ((maxP - price) / fullSpan) * plotH;
    const count = Math.max(candles.length, 20);
    const barStep = plotW / count;
    const candleW = Math.max(3, Math.min(11, barStep * 0.62));
    const toX = (idx: number) => padL + (idx + 0.5) * barStep;

    return { width, height, padL, padR, padT, padB, plotW, plotH, minP, maxP, toY, toX, candleW };
  }, [candles, trade]);

  if (!tradeId) return null;

  const isWin =
    trade?.status === 'WIN_TP1' ||
    trade?.status === 'WIN_TP2' ||
    trade?.status === 'WIN_TP1_BE' ||
    (trade?.realizedPnlUsd ?? 0) > 0;

  const currentBar = visibleCandles.length > 0 ? visibleCandles[visibleCandles.length - 1] : null;
  const beVisible = tp1Idx >= 0 && playbackIdx >= tp1Idx;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5">
      <div className="w-full max-w-[1260px] max-h-[94vh] rounded-2xl bg-[#09090B] border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Drawer Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3 bg-[#111113]">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${
                trade?.direction === 'BUY'
                  ? 'bg-[#34D399]/15 text-[#34D399]'
                  : 'bg-[#F87171]/15 text-[#F87171]'
              }`}
            >
              {trade?.direction || '—'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                  {trade?.symbol || snapshot?.symbol} · {trade?.timeframe || snapshot?.timeframe} Visual Trade Proof
                </h2>
                {trade && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-medium ${
                      isWin
                        ? 'bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/25'
                        : trade.status === 'LOSS_SL'
                        ? 'bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/25'
                        : 'bg-[#18181B] text-[#A1A1AA] border border-white/[0.08]'
                    }`}
                  >
                    {trade.status}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[#71717A] truncate">
                {trade?.strategyLabel} ({trade?.tier}) · Exit Mode:{' '}
                <span className="text-[#A1A1AA]">
                  {trade?.exitMode === 'SCALE_50_TP1_BE_TP2'
                    ? '50% Scale @ TP1 -> BE -> TP2'
                    : '100% Exit @ TP1'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close replay drawer"
            className="h-9 w-9 rounded-xl bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] flex items-center justify-center transition-colors"
          >
            <PiX size={16} />
          </button>
        </div>

        {/* Main Body: Chart Left + Forensics Sidebar Right */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07]">
          {/* Left Panel: SVG Candlestick Replay & Playback Controls */}
          <div className="p-4 sm:p-5 space-y-4 flex flex-col justify-between bg-[#09090B]">
            {loading ? (
              <div className="h-[370px] rounded-xl bg-[#111113] border border-white/[0.06] flex items-center justify-center text-[13px] text-[#71717A]">
                Loading frozen replay candle snapshot...
              </div>
            ) : !chartGeometry || !trade || candles.length === 0 ? (
              <div className="h-[370px] rounded-xl bg-[#111113] border border-white/[0.06] flex items-center justify-center text-center px-6 text-[13px] text-[#71717A]">
                No archived replay candles recorded for this trade yet. Step offline replay or run a scan to build candle history.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Active Cursor OHLC Readout */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono tabular-nums text-[#A1A1AA] px-1">
                  <span>
                    Bar {Math.min(playbackIdx + 1, candles.length)} / {candles.length}
                    {currentBar ? ` · ${formatTimeUtc(currentBar.time)}` : ''}
                  </span>
                  {currentBar && (
                    <span className="flex items-center gap-3">
                      <span>O {formatPrice(currentBar.open)}</span>
                      <span className="text-[#34D399]">H {formatPrice(currentBar.high)}</span>
                      <span className="text-[#F87171]">L {formatPrice(currentBar.low)}</span>
                      <span className="text-[#FAFAFA]">C {formatPrice(currentBar.close)}</span>
                    </span>
                  )}
                </div>

                {/* Candlestick Chart SVG */}
                <div className="rounded-xl bg-[#0D0D10] border border-white/[0.07] p-2 overflow-hidden">
                  <svg
                    viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                    className="w-full h-auto block select-none"
                  >
                    {/* Horizontal gridlines */}
                    {[0.2, 0.4, 0.6, 0.8].map((frac) => {
                      const y = chartGeometry.padT + frac * chartGeometry.plotH;
                      const pVal = chartGeometry.maxP - frac * (chartGeometry.maxP - chartGeometry.minP);
                      return (
                        <g key={frac}>
                          <line
                            x1={chartGeometry.padL}
                            x2={chartGeometry.width - chartGeometry.padR}
                            y1={y}
                            y2={y}
                            stroke="rgba(255,255,255,0.04)"
                            strokeWidth="1"
                          />
                          <text
                            x={chartGeometry.width - chartGeometry.padR + 6}
                            y={y + 3}
                            fill="#52525B"
                            fontSize="9.5"
                            fontFamily="monospace"
                          >
                            {formatPrice(pVal)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Shaded Risk / Reward Zones */}
                    {entryIdx >= 0 && playbackIdx >= entryIdx && (() => {
                      const anchorPrice = trade.fillPrice ?? trade.requestedEntry;
                      const x1 = chartGeometry.toX(entryIdx);
                      const endIdx = exitIdx >= 0 ? Math.min(playbackIdx, exitIdx) : playbackIdx;
                      const x2 = Math.max(x1 + chartGeometry.candleW, chartGeometry.toX(endIdx));

                      const yEntry = chartGeometry.toY(anchorPrice);
                      const ySl = chartGeometry.toY(trade.slPrice);
                      const yTp1 = chartGeometry.toY(trade.tp1Price);
                      const yTp2 = trade.tp2Price ? chartGeometry.toY(trade.tp2Price) : null;

                      return (
                        <g>
                          <rect
                            x={x1}
                            y={Math.min(yEntry, ySl)}
                            width={x2 - x1}
                            height={Math.max(2, Math.abs(ySl - yEntry))}
                            fill="#F87171"
                            fillOpacity="0.09"
                          />
                          <rect
                            x={x1}
                            y={Math.min(yEntry, yTp1)}
                            width={x2 - x1}
                            height={Math.max(2, Math.abs(yTp1 - yEntry))}
                            fill="#34D399"
                            fillOpacity="0.09"
                          />
                          {trade.exitMode === 'SCALE_50_TP1_BE_TP2' && yTp2 !== null && (
                            <rect
                              x={x1}
                              y={Math.min(yTp1, yTp2)}
                              width={x2 - x1}
                              height={Math.max(2, Math.abs(yTp2 - yTp1))}
                              fill="#10B981"
                              fillOpacity="0.06"
                            />
                          )}
                        </g>
                      );
                    })()}

                    {/* Key Price Level Lines */}
                    {(() => {
                      const rightEdge = chartGeometry.width - chartGeometry.padR;
                      const entryPrice = trade.fillPrice ?? trade.requestedEntry;
                      const levels = [
                        { label: 'ENTRY', price: entryPrice, color: '#60A5FA', dash: '3 3' },
                        { label: 'SL', price: trade.slPrice, color: '#F87171', dash: '4 3' },
                        { label: 'TP1', price: trade.tp1Price, color: '#34D399', dash: '4 3' },
                      ];
                      if (trade.tp2Price) {
                        levels.push({ label: 'TP2', price: trade.tp2Price, color: '#10B981', dash: '2 3' });
                      }
                      if (beVisible && Math.abs(trade.currentSl - trade.slPrice) > 1e-8) {
                        levels.push({ label: 'BE SL', price: trade.currentSl, color: '#FBBF24', dash: '5 2' });
                      }

                      return levels.map((lvl) => {
                        const y = chartGeometry.toY(lvl.price);
                        return (
                          <g key={lvl.label}>
                            <line
                              x1={chartGeometry.padL}
                              x2={rightEdge}
                              y1={y}
                              y2={y}
                              stroke={lvl.color}
                              strokeOpacity="0.65"
                              strokeWidth="1"
                              strokeDasharray={lvl.dash}
                            />
                            <rect
                              x={rightEdge + 2}
                              y={y - 8}
                              width={72}
                              height={16}
                              rx={3}
                              fill="#18181B"
                              stroke={lvl.color}
                              strokeOpacity="0.45"
                              strokeWidth="0.75"
                            />
                            <text
                              x={rightEdge + 6}
                              y={y + 3}
                              fill={lvl.color}
                              fontSize="8.5"
                              fontFamily="monospace"
                              fontWeight="600"
                            >
                              {lvl.label} {formatPrice(lvl.price)}
                            </text>
                          </g>
                        );
                      });
                    })()}

                    {/* Candlesticks up to playbackIdx */}
                    {visibleCandles.map((c, idx) => {
                      const x = chartGeometry.toX(idx);
                      const yOpen = chartGeometry.toY(c.open);
                      const yClose = chartGeometry.toY(c.close);
                      const yHigh = chartGeometry.toY(c.high);
                      const yLow = chartGeometry.toY(c.low);
                      const bullish = c.close >= c.open;
                      const color = bullish ? '#34D399' : '#F87171';
                      const bodyTop = Math.min(yOpen, yClose);
                      const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));

                      return (
                        <g key={c.time}>
                          <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.2" />
                          <rect
                            x={x - chartGeometry.candleW / 2}
                            y={bodyTop}
                            width={chartGeometry.candleW}
                            height={bodyH}
                            rx="1"
                            fill={color}
                          />
                        </g>
                      );
                    })}

                    {/* Milestone Badges on Exact Trigger Bars */}
                    {snapshot?.markers.map((m, i) => {
                      const barIdx = findBarIndexAtOrAfter(candles, m.time);
                      if (barIdx < 0 || barIdx > playbackIdx) return null;
                      const x = chartGeometry.toX(barIdx);
                      const y = chartGeometry.toY(m.price);
                      const offsetY = i % 2 === 0 ? -16 : 18;
                      const tagY = Math.max(14, Math.min(chartGeometry.height - 14, y + offsetY));

                      return (
                        <g key={`${m.kind}-${i}`}>
                          <circle cx={x} cy={y} r="4.5" fill={m.color} stroke="#09090B" strokeWidth="1.5" />
                          <line x1={x} x2={x} y1={y} y2={tagY} stroke={m.color} strokeOpacity="0.6" strokeWidth="1" />
                          <rect
                            x={Math.max(chartGeometry.padL, x - 34)}
                            y={tagY - 9}
                            width="68"
                            height="16"
                            rx="4"
                            fill="#111113"
                            stroke={m.color}
                            strokeWidth="0.9"
                          />
                          <text
                            x={Math.max(chartGeometry.padL + 34, x)}
                            y={tagY + 2}
                            textAnchor="middle"
                            fill={m.color}
                            fontSize="8.5"
                            fontFamily="monospace"
                            fontWeight="600"
                          >
                            {m.kind}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Bar-by-Bar Playback Controls */}
                <div className="rounded-xl bg-[#111113] border border-white/[0.07] p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (playbackIdx >= candles.length - 1) setPlaybackIdx(0);
                          setPlaying((p) => !p);
                        }}
                        className="h-8 px-3 rounded-lg bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        {playing ? <PiPause size={14} /> : <PiPlay size={14} />}
                        {playing ? 'Pause' : playbackIdx >= candles.length - 1 ? 'Replay' : 'Play'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPlaying(false);
                          setPlaybackIdx((i) => Math.max(0, i - 1));
                        }}
                        className="h-8 px-2.5 rounded-lg bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] text-[12px] inline-flex items-center gap-1"
                      >
                        <PiCaretLeft size={14} />
                        -1 Bar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPlaying(false);
                          setPlaybackIdx((i) => Math.min(candles.length - 1, i + 1));
                        }}
                        className="h-8 px-2.5 rounded-lg bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] text-[12px] inline-flex items-center gap-1"
                      >
                        +1 Bar
                        <PiCaretRight size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPlaying(false);
                          setPlaybackIdx(Math.max(0, entryIdx > 3 ? entryIdx - 3 : 0));
                        }}
                        title="Reset playback to pre-entry setup"
                        className="h-8 w-8 rounded-lg bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center justify-center"
                      >
                        <PiArrowCounterClockwise size={14} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {entryIdx >= 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlaying(false);
                            setPlaybackIdx(entryIdx);
                          }}
                          className="h-7 px-2 rounded-md bg-[#18181B] hover:bg-[#222227] text-[11px] font-medium text-[#60A5FA]"
                        >
                          Jump Entry
                        </button>
                      )}
                      {tp1Idx >= 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlaying(false);
                            setPlaybackIdx(tp1Idx);
                          }}
                          className="h-7 px-2 rounded-md bg-[#18181B] hover:bg-[#222227] text-[11px] font-medium text-[#34D399]"
                        >
                          Jump TP1
                        </button>
                      )}
                      {exitIdx >= 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlaying(false);
                            setPlaybackIdx(exitIdx);
                          }}
                          className="h-7 px-2 rounded-md bg-[#18181B] hover:bg-[#222227] text-[11px] font-medium text-[#FAFAFA]"
                        >
                          Jump Exit
                        </button>
                      )}

                      <div className="ml-1 inline-flex items-center rounded-md bg-[#18181B] border border-white/[0.07] p-0.5">
                        {([1, 2, 5] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSpeed(s)}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              speed === s
                                ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                                : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                            }`}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, candles.length - 1)}
                    value={playbackIdx}
                    onChange={(e) => {
                      setPlaying(false);
                      setPlaybackIdx(Number(e.target.value));
                    }}
                    aria-label="Replay bar scrubber"
                    className="w-full accent-[#34D399] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Execution Forensics & Event Log */}
          <div className="p-4 sm:p-5 space-y-5 bg-[#111113]/60">
            {trade && (
              <>
                {/* P&L & Wallet Card */}
                <div className="rounded-xl bg-[#161619] border border-white/[0.06] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#71717A]">Net Realized Outcome</span>
                    <span className="text-[11px] font-mono text-[#A1A1AA]">
                      {trade.resolutionMethod || 'candle_ohlc'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-[24px] font-mono font-semibold tabular-nums ${
                        trade.realizedPnlUsd > 0
                          ? 'text-[#34D399]'
                          : trade.realizedPnlUsd < 0
                          ? 'text-[#F87171]'
                          : 'text-[#FAFAFA]'
                      }`}
                    >
                      {trade.realizedPnlUsd >= 0 ? '+' : '-'}${Math.abs(trade.realizedPnlUsd).toFixed(2)}
                    </span>
                    <span className="text-[14px] font-mono tabular-nums text-[#A1A1AA]">
                      {trade.realizedR >= 0 ? '+' : ''}
                      {trade.realizedR.toFixed(2)}R
                    </span>
                  </div>
                  {trade.tp1PnlUsd > 0 && (
                    <div className="text-[12px] text-[#34D399] flex items-center justify-between pt-1 border-t border-white/[0.05]">
                      <span>TP1 50% Banked</span>
                      <span className="font-mono">+${trade.tp1PnlUsd.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="text-[12px] text-[#71717A] flex items-center justify-between pt-1 border-t border-white/[0.05]">
                    <span>Paper Wallet</span>
                    <span className="font-mono text-[#FAFAFA]">
                      ${(trade.balanceBefore ?? 0).toLocaleString()} → ${(trade.balanceAfter ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Price Coordinates & Excursion */}
                <div className="rounded-xl bg-[#161619] border border-white/[0.06] p-4 space-y-2.5 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Entry Fill ({trade.entryType})</span>
                    <span className="font-mono text-[#FAFAFA]">
                      {formatPrice(trade.fillPrice ?? trade.requestedEntry)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Initial SL → Active SL</span>
                    <span className="font-mono text-[#F87171]">
                      {formatPrice(trade.slPrice)} → {formatPrice(trade.currentSl)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">TP1 / TP2</span>
                    <span className="font-mono text-[#34D399]">
                      {formatPrice(trade.tp1Price)}
                      {trade.tp2Price ? ` / ${formatPrice(trade.tp2Price)}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Final Exit</span>
                    <span className="font-mono text-[#FAFAFA]">{formatPrice(trade.exitPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
                    <span className="text-[#71717A]">MFE / MAE Excursion</span>
                    <span className="font-mono">
                      <span className="text-[#34D399]">+{trade.mfeR.toFixed(2)}R</span>
                      {' / '}
                      <span className="text-[#F87171]">-{trade.maeR.toFixed(2)}R</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Volume &amp; Bars Held</span>
                    <span className="font-mono text-[#A1A1AA]">
                      {trade.initialVolume} ({trade.barsHeld} bars)
                    </span>
                  </div>
                </div>

                {/* 9-Point Confluence Snapshot */}
                {trade.confluence && (
                  <div className="rounded-xl bg-[#161619] border border-white/[0.06] p-4 space-y-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-[#FAFAFA] inline-flex items-center gap-1.5">
                        <PiShieldCheck size={14} className="text-[#34D399]" />
                        9-Point Confluence
                      </span>
                      <span className="font-mono text-[#34D399]">
                        {trade.confluence.score ?? '—'}/9 ({trade.confluence.tier || trade.tier})
                      </span>
                    </div>
                    {Array.isArray(trade.confluence.passedCriteria) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {trade.confluence.passedCriteria.slice(0, 9).map((c: string) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 rounded bg-[#18181B] border border-white/[0.06] text-[10.5px] text-[#A1A1AA]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Execution Timeline */}
                <div className="rounded-xl bg-[#161619] border border-white/[0.06] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[#FAFAFA]">Audit Event Log</span>
                    <PiFastForward size={13} className="text-[#71717A]" />
                  </div>
                  <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                    {trade.events.map((evt, idx) => (
                      <div
                        key={idx}
                        className="text-[11.5px] rounded-lg bg-[#111113] px-3 py-2 border border-white/[0.05] space-y-0.5"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[#FAFAFA] font-semibold">{evt.type}</span>
                          <span className="text-[#71717A]">{formatTimeUtc(evt.time)}</span>
                        </div>
                        <p className="text-[#A1A1AA] leading-snug">{evt.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
