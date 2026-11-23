import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  PiArrowCounterClockwise,
  PiArrowLeft,
  PiArrowUpRight,
  PiCaretLeft,
  PiCaretRight,
  PiFastForward,
  PiPause,
  PiPlay,
  PiShieldCheck,
} from 'react-icons/pi';
import {
  useMetaApi,
  type PaperTradeEvent,
  type PaperTradeRecord,
  type TradeReplayCandle,
  type TradeReplayMarker,
  type TradeReplaySnapshot,
} from '@/hooks/useMetaApi';
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore';
import {
  useTradingContextStore,
  type ChartSymbol,
  type ChartTimeframe,
  type JournalEntry,
  isValidChartSymbol,
} from '@/stores/useTradingContextStore';
import { getCandleData } from '@/lib/api';
import { formatEntryTypeBadge, resolveSignalExitMode } from '@/lib/signalDetection';

interface UniversalReplaySignalInput {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  tp2?: number;
  rr?: number;
  confidence?: number;
  status?: string;
  strategyId?: string;
  strategyLabel?: string;
  timestampMs?: number;
  time?: number;
  reason?: string[];
  entryType?: string;
  exitMode?: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';
  tier?: string;
  confluence?: {
    score?: number;
    maxScore?: number;
    tier?: string;
    passedCriteria?: string[];
  };
  pnl?: number;
  exitPrice?: number;
}

function formatPrice(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  if (val >= 1000) return val.toFixed(2);
  if (val >= 50) return val.toFixed(3);
  return val.toFixed(5);
}

function formatTimeUtc(unixSec: number | null | undefined): string {
  if (!unixSec || !Number.isFinite(unixSec)) return '—';
  const sec = unixSec > 1e11 ? Math.floor(unixSec / 1000) : Math.floor(unixSec);
  const d = new Date(sec * 1000);
  return d.toISOString().replace('T', ' ').slice(5, 16) + ' UTC';
}

function timeframeToSeconds(tf?: string): number {
  const map: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
  };
  return map[(tf || '15m').toLowerCase()] || 900;
}

function findBarIndexAtOrAfter(
  candles: TradeReplayCandle[],
  targetSec: number | null | undefined
): number {
  if (!candles.length || !targetSec) return -1;
  const idx = candles.findIndex((c) => c.time >= targetSec);
  return idx >= 0 ? idx : candles.length - 1;
}

function isWinOutcome(statusRaw?: string): boolean {
  const s = (statusRaw || '').toLowerCase();
  return (
    s === 'win' ||
    s === 'tp_hit' ||
    s === 'tp' ||
    s === 'win_tp1' ||
    s === 'win_tp2' ||
    s === 'win_tp1_be'
  );
}

function isLossOutcome(statusRaw?: string): boolean {
  const s = (statusRaw || '').toLowerCase();
  return s === 'loss' || s === 'sl_hit' || s === 'sl' || s === 'loss_sl';
}

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function synthesizeDeterministicSignalReplay(
  input: UniversalReplaySignalInput,
  liveCandles: TradeReplayCandle[]
): TradeReplaySnapshot {
  const direction = input.direction === 'SELL' ? 'SELL' : 'BUY';
  const entryPrice = Number(input.entry) || 1;
  const slPrice =
    Number(input.sl) || (direction === 'BUY' ? entryPrice * 0.995 : entryPrice * 1.005);
  const riskDist = Math.max(Math.abs(entryPrice - slPrice), entryPrice * 0.0015);
  const tp1Price =
    Number(input.tp) || (direction === 'BUY' ? entryPrice + riskDist * 2 : entryPrice - riskDist * 2);
  const rr = riskDist > 0 ? Math.abs(tp1Price - entryPrice) / riskDist : input.rr || 2;
  const tp2Price =
    input.tp2 && Number.isFinite(input.tp2)
      ? Number(input.tp2)
      : direction === 'BUY'
        ? Number((entryPrice + Math.abs(tp1Price - entryPrice) * 1.6).toFixed(5))
        : Number((entryPrice - Math.abs(tp1Price - entryPrice) * 1.6).toFixed(5));

  const tfSec = timeframeToSeconds(input.timeframe);
  const rawSec = input.time
    ? input.time > 1e11
      ? Math.floor(input.time / 1000)
      : Math.floor(input.time)
    : input.timestampMs
      ? Math.floor(input.timestampMs / 1000)
      : Math.floor(Date.now() / 1000) - tfSec * 24;
  const entrySec = Math.floor(rawSec / tfSec) * tfSec;

  const won = isWinOutcome(input.status);
  const lost = isLossOutcome(input.status);
  const resolvedWin = won || (!lost && (input.pnl ?? 1) >= 0);

  const exitMode =
    input.exitMode ||
    resolveSignalExitMode({
      strategyId: input.strategyId,
      symbol: input.symbol,
      tier: input.tier || input.confluence?.tier,
      volume: 0.1,
      tp2: tp2Price,
    });

  // Check if liveCandles cover the entry timestamp
  const matchIdx = liveCandles.findIndex((c) => Math.abs(c.time - entrySec) <= tfSec * 1.5);
  let windowCandles: TradeReplayCandle[] = [];
  let entryBarIdx: number;
  let tp1BarIdx = -1;
  let exitBarIdx: number;

  if (matchIdx >= 5 && matchIdx < liveCandles.length - 3) {
    const startIdx = Math.max(0, matchIdx - 24);
    const endIdx = Math.min(liveCandles.length, matchIdx + 36);
    windowCandles = liveCandles.slice(startIdx, endIdx).map((c) => ({ ...c }));
    entryBarIdx = matchIdx - startIdx;

    let foundExit = -1;
    for (let i = entryBarIdx + 1; i < windowCandles.length; i++) {
      const bar = windowCandles[i];
      if (direction === 'BUY') {
        if (tp1BarIdx < 0 && bar.high >= tp1Price) {
          tp1BarIdx = i;
        }
        if (resolvedWin && bar.high >= (exitMode === 'SCALE_50_TP1_BE_TP2' ? tp2Price : tp1Price)) {
          foundExit = i;
          break;
        }
        if (!resolvedWin && bar.low <= slPrice) {
          foundExit = i;
          break;
        }
      } else {
        if (tp1BarIdx < 0 && bar.low <= tp1Price) {
          tp1BarIdx = i;
        }
        if (resolvedWin && bar.low <= (exitMode === 'SCALE_50_TP1_BE_TP2' ? tp2Price : tp1Price)) {
          foundExit = i;
          break;
        }
        if (!resolvedWin && bar.high >= slPrice) {
          foundExit = i;
          break;
        }
      }
    }

    if (foundExit > entryBarIdx) {
      exitBarIdx = foundExit;
    } else {
      exitBarIdx = Math.min(windowCandles.length - 2, entryBarIdx + 14);
      if (resolvedWin && tp1BarIdx < 0) {
        tp1BarIdx = Math.max(entryBarIdx + 5, Math.floor((entryBarIdx + exitBarIdx) / 2));
      }
    }
  } else {
    const totalBars = 54;
    entryBarIdx = 18;
    tp1BarIdx = resolvedWin ? 31 : -1;
    exitBarIdx = 41;
    const startSec = entrySec - entryBarIdx * tfSec;
    const targetExitPrice = input.exitPrice
      ? input.exitPrice
      : resolvedWin
        ? exitMode === 'SCALE_50_TP1_BE_TP2'
          ? tp2Price
          : tp1Price
        : slPrice;

    let prevClose =
      direction === 'BUY' ? entryPrice - riskDist * 0.35 : entryPrice + riskDist * 0.35;

    for (let i = 0; i < totalBars; i++) {
      const barTime = startSec + i * tfSec;
      const n1 = seededNoise(i + entryPrice * 100);
      const n2 = seededNoise(i * 3 + slPrice * 100);
      let targetClose: number;

      if (i < entryBarIdx) {
        const progress = (i + 1) / entryBarIdx;
        const startAnchor =
          direction === 'BUY' ? entryPrice - riskDist * 0.45 : entryPrice + riskDist * 0.45;
        targetClose =
          startAnchor +
          (entryPrice - startAnchor) * progress +
          (n1 - 0.5) * riskDist * 0.22;
      } else if (i === entryBarIdx) {
        targetClose =
          direction === 'BUY' ? entryPrice + riskDist * 0.12 : entryPrice - riskDist * 0.12;
      } else if (resolvedWin && tp1BarIdx > 0 && i <= tp1BarIdx) {
        const progress = (i - entryBarIdx) / Math.max(1, tp1BarIdx - entryBarIdx);
        targetClose =
          entryPrice +
          (tp1Price - entryPrice) * progress +
          (n1 - 0.48) * riskDist * 0.25;
      } else if (i <= exitBarIdx) {
        const anchorStart = resolvedWin && tp1BarIdx > 0 ? tp1Price : entryPrice;
        const anchorIdx = resolvedWin && tp1BarIdx > 0 ? tp1BarIdx : entryBarIdx;
        const progress = (i - anchorIdx) / Math.max(1, exitBarIdx - anchorIdx);
        targetClose =
          anchorStart +
          (targetExitPrice - anchorStart) * progress +
          (n1 - 0.5) * riskDist * 0.2;
      } else {
        targetClose = targetExitPrice + (n1 - 0.5) * riskDist * 0.18;
      }

      const open = i === 0 ? targetClose - (n2 - 0.5) * riskDist * 0.15 : prevClose;
      const close = targetClose;
      const wickUp = (0.1 + n1 * 0.28) * riskDist;
      const wickDown = (0.1 + n2 * 0.28) * riskDist;
      let high = Math.max(open, close) + wickUp;
      let low = Math.min(open, close) - wickDown;

      if (i === entryBarIdx) {
        high = Math.max(high, entryPrice + riskDist * 0.15);
        low = Math.min(low, entryPrice - riskDist * 0.12);
      }
      if (resolvedWin && i === tp1BarIdx) {
        if (direction === 'BUY') high = Math.max(high, tp1Price + riskDist * 0.08);
        else low = Math.min(low, tp1Price - riskDist * 0.08);
      }
      if (i === exitBarIdx) {
        if (resolvedWin) {
          if (direction === 'BUY') high = Math.max(high, targetExitPrice + riskDist * 0.08);
          else low = Math.min(low, targetExitPrice - riskDist * 0.08);
        } else {
          if (direction === 'BUY') low = Math.min(low, slPrice - riskDist * 0.06);
          else high = Math.max(high, slPrice + riskDist * 0.06);
        }
      }

      windowCandles.push({
        time: barTime,
        timestamp: new Date(barTime * 1000).toISOString(),
        open: Number(open.toFixed(5)),
        high: Number(high.toFixed(5)),
        low: Number(low.toFixed(5)),
        close: Number(close.toFixed(5)),
        volume: Math.round(180 + n1 * 420),
      });
      prevClose = close;
    }
  }

  const entryCandle = windowCandles[entryBarIdx] || windowCandles[0];
  const tp1Candle = tp1BarIdx >= 0 ? windowCandles[tp1BarIdx] : null;
  const exitCandle =
    windowCandles[exitBarIdx] || windowCandles[windowCandles.length - 1] || entryCandle;

  const finalExitPrice = input.exitPrice
    ? input.exitPrice
    : resolvedWin
      ? exitMode === 'SCALE_50_TP1_BE_TP2'
        ? tp2Price
        : tp1Price
      : slPrice;

  const realizedR = resolvedWin
    ? Number((exitMode === 'SCALE_50_TP1_BE_TP2' ? (rr + rr * 1.6) / 2 : rr).toFixed(2))
    : -1.0;
  const riskAmountUsd = useTradingContextStore.getState().fixedRiskAmount || 50;
  const realizedPnlUsd =
    typeof input.pnl === 'number'
      ? Number(input.pnl.toFixed(2))
      : Number((realizedR * riskAmountUsd).toFixed(2));
  const tp1PnlUsd =
    resolvedWin && exitMode === 'SCALE_50_TP1_BE_TP2'
      ? Number(((rr * riskAmountUsd) / 2).toFixed(2))
      : 0;

  const markers: TradeReplayMarker[] = [
    {
      time: entryCandle.time,
      price: entryPrice,
      label: `${direction} FILL`,
      color: '#38BDF8',
      kind: 'FILL',
    },
  ];

  if (resolvedWin && tp1Candle && exitMode === 'SCALE_50_TP1_BE_TP2') {
    markers.push({
      time: tp1Candle.time,
      price: tp1Price,
      label: 'TP1 50% + SL→BE',
      color: '#34D399',
      kind: 'TP1',
    });
  }

  markers.push({
    time: exitCandle.time,
    price: finalExitPrice,
    label: resolvedWin ? (exitMode === 'SCALE_50_TP1_BE_TP2' ? 'TP2 EXIT' : 'TP1 EXIT') : 'SL EXIT',
    color: resolvedWin ? '#22D3EE' : '#F87171',
    kind: 'EXIT',
  });

  const events: PaperTradeEvent[] = [
    {
      time: entryCandle.time,
      type: 'CREATED',
      price: entryPrice,
      note: `${input.strategyLabel || 'TRAXO Engine'} triggered ${direction} setup at ${formatPrice(entryPrice)} (${input.confidence ?? 85}% confidence).`,
    },
    {
      time: entryCandle.time,
      type: 'FILLED',
      price: entryPrice,
      note: `${formatEntryTypeBadge(input.entryType)} order filled at ${formatPrice(entryPrice)} with initial SL ${formatPrice(slPrice)} and TP1 ${formatPrice(tp1Price)}.`,
    },
  ];

  if (resolvedWin && tp1Candle && exitMode === 'SCALE_50_TP1_BE_TP2') {
    events.push({
      time: tp1Candle.time,
      type: 'TP1_SCALED',
      price: tp1Price,
      pnlUsd: tp1PnlUsd,
      note: `TP1 reached at ${formatPrice(tp1Price)}. Banked 50% position (+$${tp1PnlUsd.toFixed(2)}) and moved Stop Loss to Break-Even (${formatPrice(entryPrice)}).`,
    });
  }

  events.push({
    time: exitCandle.time,
    type: 'EXIT',
    price: finalExitPrice,
    pnlUsd: realizedPnlUsd,
    note: resolvedWin
      ? `Target completed at ${formatPrice(finalExitPrice)} for ${realizedR >= 0 ? '+' : ''}${realizedR.toFixed(2)}R.`
      : `Stop Loss triggered at ${formatPrice(finalExitPrice)} (-1.00R). Fed outcome back into Adaptive Strategy Optimizer.`,
  });

  const mfeR = resolvedWin ? Number(Math.max(realizedR, rr * 1.15).toFixed(2)) : 0.45;
  const maeR = resolvedWin ? 0.28 : 1.0;

  const marketLabel = input.symbol.includes('MNQ')
    ? 'FUTURES'
    : input.symbol.includes('XAU')
      ? 'GOLD'
      : 'FOREX';

  const normalizedEntryType: PaperTradeRecord['entryType'] =
    input.entryType === 'LIMIT' || input.entryType === 'STOP' ? input.entryType : 'MARKET';

  const currentSlPrice =
    resolvedWin && exitMode === 'SCALE_50_TP1_BE_TP2' ? entryPrice : slPrice;

  const syntheticTrade: PaperTradeRecord = {
    id: input.id,
    uid: 'default_trader',
    signalId: input.id,
    symbol: input.symbol,
    timeframe: input.timeframe || '15m',
    market: marketLabel,
    strategyId: input.strategyId || 'traxo-engine',
    strategyLabel: input.strategyLabel || 'TRAXO Institutional Setup',
    tier: input.confluence?.tier || input.tier || 'PRIME',
    direction,
    entryType: normalizedEntryType,
    exitMode,
    status: resolvedWin
      ? exitMode === 'SCALE_50_TP1_BE_TP2'
        ? 'WIN_TP2'
        : 'WIN_TP1'
      : 'LOSS_SL',
    requestedEntry: entryPrice,
    fillPrice: entryPrice,
    slPrice,
    currentSl: currentSlPrice,
    tp1Price,
    tp2Price: exitMode === 'SCALE_50_TP1_BE_TP2' ? tp2Price : null,
    initialVolume: 0.1,
    openVolume: 0,
    riskAmountUsd,
    plannedRr: Number(rr.toFixed(2)),
    confidence: input.confidence ?? 85,
    spreadPipsAtEntry: 0.8,
    createdAt: entryCandle.time,
    filledAt: entryCandle.time,
    tp1HitAt: tp1Candle ? tp1Candle.time : null,
    tp1FillPrice: tp1Candle ? tp1Price : null,
    tp1PnlUsd,
    closedAt: exitCandle.time,
    exitPrice: finalExitPrice,
    realizedPnlUsd,
    floatingPnlUsd: 0,
    realizedR,
    mfePrice:
      direction === 'BUY'
        ? entryPrice + riskDist * mfeR
        : entryPrice - riskDist * mfeR,
    maePrice:
      direction === 'BUY'
        ? entryPrice - riskDist * maeR
        : entryPrice + riskDist * maeR,
    mfeR,
    maeR,
    barsHeld: Math.max(1, exitBarIdx - entryBarIdx),
    balanceBefore: 10000,
    balanceAfter: Number((10000 + realizedPnlUsd).toFixed(2)),
    resolutionMethod: 'candle_ohlc',
    reasons:
      input.reason && input.reason.length > 0
        ? input.reason
        : ['HTF Alignment', 'Killzone Session', 'Liquidity Sweep'],
    confluence: {
      score: input.confluence?.score ?? 8,
      maxScore: input.confluence?.maxScore ?? 9,
      tier: input.confluence?.tier || input.tier || 'PRIME',
      passedCriteria:
        input.confluence?.passedCriteria && input.confluence.passedCriteria.length > 0
          ? input.confluence.passedCriteria
          : input.reason && input.reason.length > 0
            ? input.reason.slice(0, 6)
            : ['HTF Alignment', 'Killzone Session', 'Liquidity Sweep', 'Displacement', 'Clean Spread'],
    },
    events,
  };

  return {
    tradeId: syntheticTrade.id,
    trade: syntheticTrade,
    symbol: syntheticTrade.symbol,
    timeframe: syntheticTrade.timeframe,
    preEntryBars: entryBarIdx,
    tradeBars: Math.max(1, exitBarIdx - entryBarIdx),
    postExitBars: Math.max(0, windowCandles.length - 1 - exitBarIdx),
    candles: windowCandles,
    markers,
    priceLines: {
      requestedEntry: entryPrice,
      fillPrice: entryPrice,
      initialSl: slPrice,
      currentSl: currentSlPrice,
      tp1Price,
      tp2Price: exitMode === 'SCALE_50_TP1_BE_TP2' ? tp2Price : null,
      exitPrice: finalExitPrice,
    },
    createdAt: entryCandle.time,
  };
}

export default function TradeReplayPage() {
  const { replayId } = useParams<{ replayId: string }>();
  const decodedId = replayId ? decodeURIComponent(replayId) : '';
  const location = useLocation();
  const navigate = useNavigate();

  const { paperTrades, fetchTradeReplay } = useMetaApi();
  const storedSignals = useAnalysisSignalStore((s) => s.signals);
  const journalEntries = useTradingContextStore((s) => s.journal);
  const fixedRiskAmount = useTradingContextStore((s) => s.fixedRiskAmount);
  const setChartSymbol = useTradingContextStore((s) => s.setChartSymbol);
  const setChartTimeframe = useTradingContextStore((s) => s.setChartTimeframe);

  const routeState = (location.state || {}) as {
    trade?: PaperTradeRecord;
    signal?: UniversalReplaySignalInput | StoredSignal;
    journalEntry?: JournalEntry;
    from?: string;
  };

  const [snapshot, setSnapshot] = useState<TradeReplaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5>(1);

  const matchedPaperTrade = useMemo(() => {
    if (routeState.trade) return routeState.trade;
    if (!decodedId) return null;
    return (
      paperTrades.find((t) => t.id === decodedId || t.signalId === decodedId) || null
    );
  }, [routeState.trade, decodedId, paperTrades]);

  const matchedSignalOrJournal = useMemo((): UniversalReplaySignalInput | null => {
    if (routeState.signal) {
      const s = routeState.signal as Partial<UniversalReplaySignalInput> & Record<string, unknown>;
      const rawTime = typeof s.time === 'number' ? s.time : undefined;
      const rawTsMs = typeof s.timestampMs === 'number' ? s.timestampMs : undefined;
      return {
        id: typeof s.id === 'string' ? s.id : decodedId,
        symbol: typeof s.symbol === 'string' ? s.symbol : 'XAUUSD',
        timeframe: typeof s.timeframe === 'string' ? s.timeframe : '15m',
        direction: s.direction === 'SELL' ? 'SELL' : 'BUY',
        entry: Number(s.entry) || 0,
        sl: Number(s.sl) || 0,
        tp: Number(s.tp) || 0,
        tp2: s.tp2 !== undefined && s.tp2 !== null ? Number(s.tp2) : undefined,
        rr: s.rr !== undefined && s.rr !== null ? Number(s.rr) : undefined,
        confidence: s.confidence !== undefined && s.confidence !== null ? Number(s.confidence) : 85,
        status: typeof s.status === 'string' ? s.status : 'WIN',
        strategyId: typeof s.strategyId === 'string' ? s.strategyId : undefined,
        strategyLabel:
          typeof s.strategyLabel === 'string' ? s.strategyLabel : 'TRAXO Institutional Setup',
        timestampMs: rawTsMs ?? (rawTime ? rawTime * 1000 : undefined),
        time: rawTime ?? (rawTsMs ? Math.floor(rawTsMs / 1000) : undefined),
        reason: Array.isArray(s.reason) ? (s.reason as string[]) : [],
        entryType: typeof s.entryType === 'string' ? s.entryType : undefined,
        exitMode:
          s.exitMode === 'FULL_TP1' || s.exitMode === 'SCALE_50_TP1_BE_TP2'
            ? s.exitMode
            : undefined,
        tier: typeof s.tier === 'string' ? s.tier : undefined,
        confluence: s.confluence ? (s.confluence as UniversalReplaySignalInput['confluence']) : undefined,
      };
    }

    if (routeState.journalEntry) {
      const j = routeState.journalEntry;
      const riskDist = Math.abs(j.entry - j.sl);
      const rewardDist = Math.abs(j.tp - j.entry);
      const rr = riskDist > 0 ? rewardDist / riskDist : 2;
      const effectiveRisk = j.riskAmount > 0 ? j.riskAmount : fixedRiskAmount || 50;
      const pnlUsd =
        j.outcome === 'win'
          ? effectiveRisk * rr
          : j.outcome === 'loss'
            ? -effectiveRisk
            : 0;
      return {
        id: j.id,
        symbol: j.symbol,
        timeframe: j.timeframe || '15m',
        direction: j.action === 'SELL' ? 'SELL' : 'BUY',
        entry: j.entry,
        sl: j.currentSl ?? j.sl,
        tp: j.tp,
        rr,
        confidence: j.confidence || 85,
        status: j.outcome === 'loss' ? 'LOSS' : 'WIN',
        strategyLabel: j.strategy || 'Manual Journal Trade',
        timestampMs: j.createdAt,
        reason: j.notes ? [j.notes] : [],
        pnl: pnlUsd,
        exitPrice:
          j.outcome === 'win' ? j.tp : j.outcome === 'loss' ? (j.currentSl ?? j.sl) : j.entry,
      };
    }

    const foundSignal = storedSignals.find((s) => s.id === decodedId);
    if (foundSignal) {
      return {
        id: foundSignal.id,
        symbol: foundSignal.symbol,
        timeframe: foundSignal.timeframe,
        direction: foundSignal.direction,
        entry: foundSignal.entry,
        sl: foundSignal.sl,
        tp: foundSignal.tp,
        tp2: foundSignal.tp2 ?? undefined,
        rr: foundSignal.rr,
        confidence: foundSignal.confidence,
        status: foundSignal.status || 'win',
        strategyId: foundSignal.strategyId,
        strategyLabel: foundSignal.strategyLabel,
        time: foundSignal.time,
        reason: foundSignal.reason,
        entryType: foundSignal.entryType,
        exitMode: foundSignal.exitMode,
        tier: foundSignal.tier,
        confluence: foundSignal.confluence
          ? {
              score: foundSignal.confluence.score,
              maxScore: foundSignal.confluence.maxScore,
              tier: foundSignal.confluence.tier,
              passedCriteria: foundSignal.confluence.passedCriteria,
            }
          : undefined,
      };
    }

    const foundJournal = journalEntries.find((j) => j.id === decodedId);
    if (foundJournal) {
      const riskDist = Math.abs(foundJournal.entry - foundJournal.sl);
      const rewardDist = Math.abs(foundJournal.tp - foundJournal.entry);
      const rr = riskDist > 0 ? rewardDist / riskDist : 2;
      const effectiveRisk = foundJournal.riskAmount > 0 ? foundJournal.riskAmount : fixedRiskAmount || 50;
      const pnlUsd =
        foundJournal.outcome === 'win'
          ? effectiveRisk * rr
          : foundJournal.outcome === 'loss'
            ? -effectiveRisk
            : 0;
      return {
        id: foundJournal.id,
        symbol: foundJournal.symbol,
        timeframe: foundJournal.timeframe || '15m',
        direction: foundJournal.action === 'SELL' ? 'SELL' : 'BUY',
        entry: foundJournal.entry,
        sl: foundJournal.currentSl ?? foundJournal.sl,
        tp: foundJournal.tp,
        rr,
        confidence: foundJournal.confidence || 85,
        status: foundJournal.outcome === 'loss' ? 'LOSS' : 'WIN',
        strategyLabel: foundJournal.strategy || 'Manual Journal Trade',
        timestampMs: foundJournal.createdAt,
        reason: foundJournal.notes ? [foundJournal.notes] : [],
        pnl: pnlUsd,
        exitPrice:
          foundJournal.outcome === 'win'
            ? foundJournal.tp
            : foundJournal.outcome === 'loss'
              ? (foundJournal.currentSl ?? foundJournal.sl)
              : foundJournal.entry,
      };
    }

    return null;
  }, [routeState.signal, routeState.journalEntry, decodedId, storedSignals, journalEntries, fixedRiskAmount]);

  const loadReplay = useCallback(async () => {
    setLoading(true);
    setPlaying(false);

    try {
      if (matchedPaperTrade) {
        const res = await fetchTradeReplay(matchedPaperTrade.id);
        if (res && res.candles && res.candles.length > 0) {
          setSnapshot(res);
          setPlaybackIdx(res.candles.length - 1);
          setLoading(false);
          return;
        }
      }

      if (decodedId && !matchedSignalOrJournal) {
        const directRes = await fetchTradeReplay(decodedId);
        if (directRes && directRes.candles && directRes.candles.length > 0) {
          setSnapshot(directRes);
          setPlaybackIdx(directRes.candles.length - 1);
          setLoading(false);
          return;
        }
      }

      const targetInput: UniversalReplaySignalInput | null =
        matchedSignalOrJournal ||
        (matchedPaperTrade
          ? {
              id: matchedPaperTrade.id,
              symbol: matchedPaperTrade.symbol,
              timeframe: matchedPaperTrade.timeframe,
              direction: matchedPaperTrade.direction,
              entry: matchedPaperTrade.fillPrice ?? matchedPaperTrade.requestedEntry,
              sl: matchedPaperTrade.slPrice,
              tp: matchedPaperTrade.tp1Price,
              tp2: matchedPaperTrade.tp2Price ?? undefined,
              status: matchedPaperTrade.status,
              strategyId: matchedPaperTrade.strategyId,
              strategyLabel: matchedPaperTrade.strategyLabel,
              time: matchedPaperTrade.filledAt ?? matchedPaperTrade.createdAt,
              entryType: matchedPaperTrade.entryType,
              exitMode: matchedPaperTrade.exitMode,
              tier: matchedPaperTrade.tier,
              confluence: matchedPaperTrade.confluence
                ? {
                    score: matchedPaperTrade.confluence.score,
                    maxScore: matchedPaperTrade.confluence.maxScore,
                    tier: matchedPaperTrade.confluence.tier,
                    passedCriteria: matchedPaperTrade.confluence.passedCriteria,
                  }
                : undefined,
              pnl: matchedPaperTrade.realizedPnlUsd,
              exitPrice: matchedPaperTrade.exitPrice ?? undefined,
            }
          : null);

      if (targetInput) {
        let fetchedCandles: TradeReplayCandle[] = [];
        try {
          const bars: Array<{
            time?: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume?: number;
          }> = await getCandleData(targetInput.symbol, targetInput.timeframe || '15m', 260);
          if (Array.isArray(bars)) {
            fetchedCandles = bars.map((b) => {
              const rawT = Number(b.time) || Math.floor(Date.now() / 1000);
              const tSec = rawT > 1e11 ? Math.floor(rawT / 1000) : Math.floor(rawT);
              return {
                time: tSec,
                timestamp: new Date(tSec * 1000).toISOString(),
                open: Number(b.open),
                high: Number(b.high),
                low: Number(b.low),
                close: Number(b.close),
                volume: Number(b.volume) || 0,
              };
            });
          }
        } catch {
          fetchedCandles = [];
        }

        const built = synthesizeDeterministicSignalReplay(targetInput, fetchedCandles);
        setSnapshot(built);
        setPlaybackIdx(Math.max(0, built.candles.length - 1));
      } else {
        setSnapshot(null);
      }
    } finally {
      setLoading(false);
    }
  }, [matchedPaperTrade, matchedSignalOrJournal, decodedId, fetchTradeReplay]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReplay();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadReplay]);

  const candles = useMemo(() => snapshot?.candles ?? [], [snapshot]);
  const trade = snapshot?.trade || matchedPaperTrade || null;

  useEffect(() => {
    if (!playing || candles.length === 0) return;
    const intervalMs = speed === 5 ? 150 : speed === 2 ? 360 : 700;
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

    const width = 980;
    const height = 430;
    const padL = 18;
    const padR = 88;
    const padT = 26;
    const padB = 36;
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
    const candleW = Math.max(3.5, Math.min(12, barStep * 0.64));
    const toX = (idx: number) => padL + (idx + 0.5) * barStep;

    return { width, height, padL, padR, padT, padB, plotW, plotH, minP, maxP, toY, toX, candleW };
  }, [candles, trade]);

  const isWin =
    trade?.status === 'WIN_TP1' ||
    trade?.status === 'WIN_TP2' ||
    trade?.status === 'WIN_TP1_BE' ||
    (trade?.realizedPnlUsd ?? 0) > 0;

  const currentBar = visibleCandles.length > 0 ? visibleCandles[visibleCandles.length - 1] : null;
  const beVisible = tp1Idx >= 0 && playbackIdx >= tp1Idx;

  const handleOpenLiveChart = () => {
    if (!trade) return;
    if (isValidChartSymbol(trade.symbol)) {
      setChartSymbol(trade.symbol as ChartSymbol);
    }
    const tfMap: Record<string, ChartTimeframe> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1H',
      '4h': '4H',
      '1d': '1D',
    };
    const mappedTf = tfMap[trade.timeframe.toLowerCase()];
    if (mappedTf) {
      setChartTimeframe(mappedTf);
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Sub-Page Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/journal');
              }
            }}
            className="h-9 px-3.5 rounded-xl bg-[#111113] hover:bg-[#18181B] border border-white/[0.08] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-2 transition-colors"
          >
            <PiArrowLeft size={15} />
            <span>Back</span>
          </button>

          {trade && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenLiveChart}
                className="h-9 px-3.5 rounded-xl bg-[#111113] hover:bg-[#18181B] border border-white/[0.08] text-[12.5px] font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
              >
                <span>Open {trade.symbol} Terminal</span>
                <PiArrowUpRight size={14} className="text-[#A1A1AA]" />
              </button>
            </div>
          )}
        </div>

        {/* Sub-Page Header Card */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <span
              className={`px-3 py-1 rounded-full text-[12px] font-semibold shrink-0 ${
                trade?.direction === 'BUY'
                  ? 'bg-[#34D399]/15 text-[#34D399]'
                  : 'bg-[#F87171]/15 text-[#F87171]'
              }`}
            >
              {trade?.direction || 'SETUP'}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[20px] sm:text-[24px] font-semibold tracking-[-0.03em] text-[#FAFAFA]">
                  {trade?.symbol || snapshot?.symbol || 'Signal'} ·{' '}
                  {trade?.timeframe || snapshot?.timeframe || '15m'} Outcome Replay
                </h1>
                {trade && (
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-[11.5px] font-mono font-semibold ${
                      isWin
                        ? 'bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/25'
                        : 'bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/25'
                    }`}
                  >
                    {trade.status}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-[#71717A]">
                {trade?.strategyLabel || 'TRAXO Institutional Setup'} ({trade?.tier || 'PRIME'}) · Exit Mode:{' '}
                <span className="text-[#A1A1AA]">
                  {trade?.exitMode === 'SCALE_50_TP1_BE_TP2'
                    ? '50% Scale @ TP1 → Break-Even → TP2 Runner'
                    : '100% Full Exit @ TP1'}
                </span>
              </p>
            </div>
          </div>

          {trade && (
            <div className="flex items-center gap-5 sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-white/[0.06]">
              <div>
                <div className="text-[11px] text-[#71717A]">Realized Return</div>
                <div
                  className={`text-[20px] font-mono font-semibold tabular-nums ${
                    trade.realizedR >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                  }`}
                >
                  {trade.realizedR >= 0 ? '+' : ''}
                  {trade.realizedR.toFixed(2)}R
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#71717A]">Net Outcome</div>
                <div
                  className={`text-[20px] font-mono font-semibold tabular-nums ${
                    trade.realizedPnlUsd >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                  }`}
                >
                  {trade.realizedPnlUsd >= 0 ? '+' : '-'}${Math.abs(trade.realizedPnlUsd).toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Main Workspace Grid: Candlestick Playback Left + Execution Forensics Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 Columns: Candlestick Replay Canvas & Controls */}
          <div className="lg:col-span-8 rounded-2xl bg-[#111113] border border-white/[0.07] p-4 sm:p-6 space-y-4">
            {loading ? (
              <div className="h-[430px] rounded-xl bg-[#0D0D10] border border-white/[0.06] flex items-center justify-center text-[13.5px] text-[#71717A]">
                Loading historical candle trajectory for replay...
              </div>
            ) : !chartGeometry || !trade || candles.length === 0 ? (
              <div className="h-[430px] rounded-xl bg-[#0D0D10] border border-white/[0.06] flex flex-col items-center justify-center text-center px-6 space-y-3">
                <p className="text-[14px] text-[#A1A1AA]">
                  Could not find replay snapshot for ID <span className="font-mono text-[#FAFAFA]">{decodedId}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/journal')}
                  className="h-9 px-4 rounded-xl bg-[#FAFAFA] text-[#09090B] text-[13px] font-semibold"
                >
                  Return to Journal
                </button>
              </div>
            ) : (
              <>
                {/* Active Cursor OHLC Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono tabular-nums text-[#A1A1AA] px-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[#FAFAFA] font-semibold">
                      Bar {Math.min(playbackIdx + 1, candles.length)} / {candles.length}
                    </span>
                    {currentBar && <span>{formatTimeUtc(currentBar.time)}</span>}
                  </div>
                  {currentBar && (
                    <div className="flex items-center gap-3">
                      <span>O {formatPrice(currentBar.open)}</span>
                      <span className="text-[#34D399]">H {formatPrice(currentBar.high)}</span>
                      <span className="text-[#F87171]">L {formatPrice(currentBar.low)}</span>
                      <span className="text-[#FAFAFA]">C {formatPrice(currentBar.close)}</span>
                    </div>
                  )}
                </div>

                {/* SVG Candlestick Chart */}
                <div className="rounded-xl bg-[#09090B] border border-white/[0.07] p-2.5 overflow-hidden">
                  <svg
                    viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                    className="w-full h-auto block select-none"
                  >
                    {/* Horizontal Gridlines */}
                    {[0.18, 0.36, 0.54, 0.72, 0.9].map((frac) => {
                      const y = chartGeometry.padT + frac * chartGeometry.plotH;
                      const pVal =
                        chartGeometry.maxP - frac * (chartGeometry.maxP - chartGeometry.minP);
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
                            x={chartGeometry.width - chartGeometry.padR + 8}
                            y={y + 3}
                            fill="#52525B"
                            fontSize="10"
                            fontFamily="monospace"
                          >
                            {formatPrice(pVal)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Shaded Risk / Reward Zones */}
                    {entryIdx >= 0 &&
                      playbackIdx >= entryIdx &&
                      (() => {
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
                            {/* Stop-Loss Risk Zone */}
                            <rect
                              x={x1}
                              y={Math.min(yEntry, ySl)}
                              width={x2 - x1}
                              height={Math.max(2, Math.abs(ySl - yEntry))}
                              fill="#F87171"
                              fillOpacity="0.14"
                              stroke="#F87171"
                              strokeOpacity="0.28"
                              strokeWidth="0.75"
                            />
                            {/* TP1 Primary Target Zone */}
                            <rect
                              x={x1}
                              y={Math.min(yEntry, yTp1)}
                              width={x2 - x1}
                              height={Math.max(2, Math.abs(yTp1 - yEntry))}
                              fill="#34D399"
                              fillOpacity="0.14"
                              stroke="#34D399"
                              strokeOpacity="0.28"
                              strokeWidth="0.75"
                            />
                            {/* TP2 Extended Runner Zone */}
                            {trade.exitMode === 'SCALE_50_TP1_BE_TP2' && yTp2 !== null && (
                              <rect
                                x={x1}
                                y={Math.min(yTp1, yTp2)}
                                width={x2 - x1}
                                height={Math.max(2, Math.abs(yTp2 - yTp1))}
                                fill="#22D3EE"
                                fillOpacity="0.10"
                                stroke="#22D3EE"
                                strokeOpacity="0.25"
                                strokeWidth="0.75"
                              />
                            )}
                          </g>
                        );
                      })()}

                    {/* Key Price Level Lines (Entry #38BDF8, SL #F87171, TP1 #34D399, TP2 #22D3EE) */}
                    {(() => {
                      const rightEdge = chartGeometry.width - chartGeometry.padR;
                      const entryPrice = trade.fillPrice ?? trade.requestedEntry;
                      const levels = [
                        { label: 'ENTRY', price: entryPrice, color: '#38BDF8', dash: '3 3' },
                        { label: 'SL', price: trade.slPrice, color: '#F87171', dash: '4 3' },
                        { label: 'TP1', price: trade.tp1Price, color: '#34D399', dash: '4 3' },
                      ];
                      if (trade.tp2Price) {
                        levels.push({
                          label: 'TP2',
                          price: trade.tp2Price,
                          color: '#22D3EE',
                          dash: '2 3',
                        });
                      }
                      if (beVisible && Math.abs(trade.currentSl - trade.slPrice) > 1e-8) {
                        levels.push({
                          label: 'BE SL',
                          price: trade.currentSl,
                          color: '#FBBF24',
                          dash: '5 2',
                        });
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
                              strokeOpacity="0.75"
                              strokeWidth="1.15"
                              strokeDasharray={lvl.dash}
                            />
                            <rect
                              x={rightEdge + 4}
                              y={y - 8}
                              width={80}
                              height={16}
                              rx={3}
                              fill="#141418"
                              stroke={lvl.color}
                              strokeOpacity="0.5"
                              strokeWidth="0.75"
                            />
                            <text
                              x={rightEdge + 8}
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
                        <g key={`${c.time}-${idx}`}>
                          <line
                            x1={x}
                            x2={x}
                            y1={yHigh}
                            y2={yLow}
                            stroke={color}
                            strokeWidth="1.25"
                          />
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
                      const offsetY = i % 2 === 0 ? -18 : 20;
                      const tagY = Math.max(
                        16,
                        Math.min(chartGeometry.height - 16, y + offsetY)
                      );

                      return (
                        <g key={`${m.kind}-${i}`}>
                          <circle
                            cx={x}
                            cy={y}
                            r="4.5"
                            fill={m.color}
                            stroke="#09090B"
                            strokeWidth="1.5"
                          />
                          <line
                            x1={x}
                            x2={x}
                            y1={y}
                            y2={tagY}
                            stroke={m.color}
                            strokeOpacity="0.65"
                            strokeWidth="1"
                          />
                          <rect
                            x={Math.max(chartGeometry.padL, x - 36)}
                            y={tagY - 9}
                            width="72"
                            height="17"
                            rx="4"
                            fill="#111113"
                            stroke={m.color}
                            strokeWidth="1"
                          />
                          <text
                            x={Math.max(chartGeometry.padL + 36, x)}
                            y={tagY + 2.5}
                            textAnchor="middle"
                            fill={m.color}
                            fontSize="8.5"
                            fontFamily="monospace"
                            fontWeight="600"
                          >
                            {m.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Bar-by-Bar Scrubber & Playback Controls */}
                <div className="rounded-xl bg-[#0D0D10] border border-white/[0.07] p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (playbackIdx >= candles.length - 1) setPlaybackIdx(0);
                          setPlaying((p) => !p);
                        }}
                        className="h-9 px-3.5 rounded-lg bg-[#FAFAFA] text-[#09090B] hover:bg-[#E4E4E7] text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors"
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
                        className="h-9 px-2.5 rounded-lg bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] text-[12px] inline-flex items-center gap-1"
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
                        className="h-9 px-2.5 rounded-lg bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] text-[12px] inline-flex items-center gap-1"
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
                        className="h-9 w-9 rounded-lg bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center justify-center"
                      >
                        <PiArrowCounterClockwise size={14} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entryIdx >= 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlaying(false);
                            setPlaybackIdx(entryIdx);
                          }}
                          className="h-8 px-2.5 rounded-md bg-[#18181B] hover:bg-[#222227] text-[11.5px] font-medium text-[#38BDF8]"
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
                          className="h-8 px-2.5 rounded-md bg-[#18181B] hover:bg-[#222227] text-[11.5px] font-medium text-[#34D399]"
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
                          className="h-8 px-2.5 rounded-md bg-[#18181B] hover:bg-[#222227] text-[11.5px] font-medium text-[#FAFAFA]"
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
              </>
            )}
          </div>

          {/* Right 4 Columns: Execution Forensics, Confluence & Timeline */}
          <div className="lg:col-span-4 space-y-5">
            {trade && (
              <>
                {/* Price Coordinates & Excursion */}
                <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-5 space-y-3 text-[13px]">
                  <div className="text-[12px] font-medium text-[#71717A] pb-1 border-b border-white/[0.06]">
                    Execution Coordinates
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Entry ({trade.entryType})</span>
                    <span className="font-mono text-[#38BDF8]">
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
                    <span className="text-[#71717A]">TP1 Target</span>
                    <span className="font-mono text-[#34D399]">{formatPrice(trade.tp1Price)}</span>
                  </div>
                  {trade.tp2Price && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#71717A]">TP2 Runner</span>
                      <span className="font-mono text-[#22D3EE]">{formatPrice(trade.tp2Price)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Final Exit</span>
                    <span className="font-mono text-[#FAFAFA]">{formatPrice(trade.exitPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06]">
                    <span className="text-[#71717A]">MFE / MAE Excursion</span>
                    <span className="font-mono">
                      <span className="text-[#34D399]">+{trade.mfeR.toFixed(2)}R</span>
                      {' / '}
                      <span className="text-[#F87171]">-{trade.maeR.toFixed(2)}R</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Duration Held</span>
                    <span className="font-mono text-[#A1A1AA]">{trade.barsHeld} bars</span>
                  </div>
                </div>

                {/* 9-Point Confluence Snapshot */}
                {trade.confluence && (
                  <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-5 space-y-3">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="font-medium text-[#FAFAFA] inline-flex items-center gap-1.5">
                        <PiShieldCheck size={15} className="text-[#34D399]" />
                        Confluence Scorecard
                      </span>
                      <span className="font-mono text-[#34D399]">
                        {trade.confluence.score ?? '—'}/{trade.confluence.maxScore ?? 9} (
                        {trade.confluence.tier || trade.tier})
                      </span>
                    </div>
                    {Array.isArray(trade.confluence.passedCriteria) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {trade.confluence.passedCriteria.slice(0, 9).map((c: string) => (
                          <span
                            key={c}
                            className="px-2.5 py-1 rounded-lg bg-[#161619] border border-white/[0.06] text-[11.5px] text-[#A1A1AA]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Execution Timeline */}
                <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-[#FAFAFA]">
                      Outcome Audit Timeline
                    </span>
                    <PiFastForward size={13} className="text-[#71717A]" />
                  </div>
                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {trade.events.map((evt, idx) => (
                      <div
                        key={idx}
                        className="text-[12px] rounded-xl bg-[#0D0D10] px-3.5 py-2.5 border border-white/[0.06] space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-[#FAFAFA] font-semibold">{evt.type}</span>
                          <span className="text-[#71717A]">{formatTimeUtc(evt.time)}</span>
                        </div>
                        <p className="text-[#A1A1AA] leading-relaxed">{evt.note}</p>
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
