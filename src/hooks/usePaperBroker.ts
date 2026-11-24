import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';
import webSocketService from '@/lib/websocket';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';

export interface MarketQuoteItem {
  symbol: string;
  name: string;
  assetType: 'FOREX' | 'METAL' | 'FUTURES';
  digits: number;
  pipSize: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spreadPips: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  changePct: number | null;
  timestamp: string | null;
}

export interface PaperAccountInfo {
  connected: boolean;
  mode?: 'paper';
  state?: string;
  uid?: string;
  balance?: number;
  equity?: number;
  margin?: number;
  usedMargin?: number;
  freeMargin?: number;
  floatingPnl?: number;
  realizedPnl?: number;
  startingBalance?: number;
  peakEquity?: number;
  maxDrawdownPct?: number;
  leverage?: number;
  currency?: string;
  platform?: string;
  error?: string;
}

export type MetaApiAccountInfo = PaperAccountInfo;

export interface PaperPosition {
  id: string;
  symbol: string;
  type: string;
  direction?: 'BUY' | 'SELL';
  volume: number;
  initialVolume?: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  tp1?: number;
  tp2?: number | null;
  exitMode?: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';
  status?: string;
  strategyId?: string;
  strategyLabel?: string;
  profit: number;
  swap: number;
  comment?: string;
  time: string;
}

export type MetaApiPosition = PaperPosition;

export interface PaperOrder {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  tp2?: number | null;
  exitMode?: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';
  state?: string;
  comment?: string;
  time: string;
}

export interface PaperTradeEvent {
  type: 'CREATED' | 'FILLED' | 'TP1_SCALED' | 'SL_MOVED_TO_BE' | 'EXIT' | 'EXPIRED' | 'CANCELLED';
  time: number;
  price: number;
  volume?: number;
  pnlUsd?: number;
  note: string;
}

export interface PaperTradeRecord {
  id: string;
  uid: string;
  signalId: string | null;
  symbol: string;
  timeframe: string;
  market: string;
  strategyId: string;
  strategyLabel: string;
  tier: string;
  direction: 'BUY' | 'SELL';
  entryType: 'MARKET' | 'LIMIT' | 'STOP';
  exitMode: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';
  status:
    | 'PENDING'
    | 'OPEN'
    | 'PARTIAL_TP1'
    | 'WIN_TP1'
    | 'WIN_TP2'
    | 'WIN_TP1_BE'
    | 'LOSS_SL'
    | 'CLOSED_MANUAL'
    | 'EXPIRED'
    | 'CANCELLED';
  requestedEntry: number;
  fillPrice: number | null;
  slPrice: number;
  currentSl: number;
  tp1Price: number;
  tp2Price: number | null;
  initialVolume: number;
  openVolume: number;
  riskAmountUsd: number;
  plannedRr: number;
  confidence: number;
  spreadPipsAtEntry: number | null;
  createdAt: number;
  filledAt: number | null;
  tp1HitAt: number | null;
  tp1FillPrice: number | null;
  tp1PnlUsd: number;
  closedAt: number | null;
  exitPrice: number | null;
  realizedPnlUsd: number;
  floatingPnlUsd: number;
  realizedR: number;
  mfePrice: number | null;
  maePrice: number | null;
  mfeR: number;
  maeR: number;
  barsHeld: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  resolutionMethod: 'exact_1m' | 'candle_ohlc' | 'conservative_tiebreak' | 'manual' | null;
  reasons: string[];
  confluence: {
    score?: number;
    maxScore?: number;
    tier?: string;
    riskScalePct?: number;
    passedCriteria?: string[];
    checks?: Array<{ key: string; point?: number; label: string; passed: boolean; detail?: string }>;
    [key: string]: unknown;
  } | null;
  events: PaperTradeEvent[];
}

export interface PaperPerformanceSummary {
  account: {
    uid: string;
    startingBalance: number;
    balance: number;
    equity: number;
    usedMargin: number;
    freeMargin: number;
    floatingPnl: number;
    realizedPnl: number;
    peakEquity: number;
    maxDrawdownPct: number;
    currency: string;
    leverage: number;
    updatedAt: number;
  };
  totalTrades: number;
  openCount: number;
  pendingCount: number;
  wins: number;
  winTp2Count: number;
  winTp1Count: number;
  winTp1BeCount: number;
  losses: number;
  expiredCount: number;
  winRate: number;
  profitFactor: string;
  netRealizedUsd: number;
  netReturnPct: number;
}

export interface TradeReplayCandle {
  time: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeReplayMarker {
  kind: 'SIGNAL' | 'FILL' | 'TP1' | 'BE_MOVE' | 'EXIT';
  label: string;
  time: number;
  price: number;
  color: string;
}

export interface TradeReplaySnapshot {
  tradeId: string;
  symbol: string;
  timeframe: string;
  preEntryBars: number;
  tradeBars: number;
  postExitBars: number;
  candles: TradeReplayCandle[];
  markers: TradeReplayMarker[];
  priceLines: {
    requestedEntry: number;
    fillPrice: number | null;
    initialSl: number;
    currentSl: number;
    tp1Price: number;
    tp2Price: number | null;
    exitPrice: number | null;
  };
  createdAt: number;
  trade?: PaperTradeRecord;
}

export interface ReplayStatus {
  state: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  symbols: string[];
  timeframe: string;
  cursorIndex: number;
  totalBars: number;
  currentCandleTime: number | null;
  currentCandleIso: string | null;
  speedMs: number;
  signalsGenerated: number;
  tradesExecuted: number;
  tradesResolved: number;
  seededSynthetic: boolean;
}

export interface ExecutePaperTradeParams {
  symbol: string;
  action: 'BUY' | 'SELL';
  volume?: number;
  sl?: number;
  tp?: number;
  tp2?: number;
  signalId?: string;
  timeframe?: string;
  market?: string;
  strategyId?: string;
  strategyLabel?: string;
  tier?: string;
  entryType?: 'market' | 'limit' | 'stop';
  rawEntryType?: string;
  price?: number;
  openPrice?: number;
  limitPrice?: number;
  referencePrice?: number;
  riskAmountUsd?: number;
  rr?: number;
  confidence?: number;
  signalTime?: number;
  reasons?: string[];
  confluence?: unknown;
  comment?: string;
}

interface IncomingCandlePayload {
  symbol?: string;
  close?: number | string;
  high?: number | string;
  low?: number | string;
  time?: number | string;
  timestamp?: string;
}

function normalizeQuoteSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function roundToDigits(value: number, digits: number): number {
  const safeDigits = Number.isFinite(digits) && digits >= 0 && digits <= 8 ? Math.floor(digits) : 5;
  return Number(value.toFixed(safeDigits));
}

function parseCandleTimestampIso(payload: IncomingCandlePayload): string {
  if (typeof payload.timestamp === 'string' && payload.timestamp.trim()) {
    return payload.timestamp;
  }
  if (typeof payload.time === 'number' && Number.isFinite(payload.time)) {
    const ms = payload.time > 1e12 ? payload.time : payload.time * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof payload.time === 'string' && payload.time.trim()) {
    const numeric = Number(payload.time);
    if (Number.isFinite(numeric)) {
      const ms = numeric > 1e12 ? numeric : numeric * 1000;
      return new Date(ms).toISOString();
    }
    const parsed = Date.parse(payload.time);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

export function usePaperBroker() {
  const activeStoreUid = useAuthStore((s) => s.user?.id ?? null);
  const [account, setAccount] = useState<PaperAccountInfo | null>(null);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTradeRecord[]>([]);
  const [paperSummary, setPaperSummary] = useState<PaperPerformanceSummary | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabledState] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const uidGenRef = useRef(0);

  const resolveUid = useCallback(
    (): string | null => activeStoreUid || auth.currentUser?.uid || null,
    [activeStoreUid]
  );

  const fetchAccount = useCallback(async () => {
    const uid = resolveUid();
    if (!uid) {
      setAccount(null);
      return;
    }
    const gen = uidGenRef.current;
    try {
      const res = await apiFetch(`/api/paper/account?uid=${encodeURIComponent(uid)}`);
      if (gen !== uidGenRef.current || resolveUid() !== uid) return;
      if (res.ok) {
        const data = (await res.json()) as PaperAccountInfo;
        setAccount(data);
        if (data.connected && typeof data.balance === 'number' && data.balance > 0) {
          const { autoSyncBrokerBalance, setAccountBalance, accountBalance } =
            useTradingContextStore.getState();
          if (autoSyncBrokerBalance && Math.abs(accountBalance - data.balance) > 0.01) {
            setAccountBalance(Number(data.balance.toFixed(2)));
          }
        }
      }
    } catch {
      // silently handle offline or dev server reload
    }
  }, [resolveUid]);

  const fetchPositions = useCallback(async () => {
    const uid = resolveUid();
    if (!uid) {
      setPositions([]);
      return;
    }
    const gen = uidGenRef.current;
    try {
      const res = await apiFetch(`/api/paper/positions?uid=${encodeURIComponent(uid)}`);
      if (gen !== uidGenRef.current || resolveUid() !== uid) return;
      if (res.ok) {
        const data = (await res.json()) as { positions?: PaperPosition[] } | PaperPosition[];
        setPositions(Array.isArray(data) ? data : Array.isArray(data?.positions) ? data.positions : []);
      }
    } catch {
      // silently handle
    }
  }, [resolveUid]);

  const fetchOrders = useCallback(async () => {
    const uid = resolveUid();
    if (!uid) {
      setOrders([]);
      return;
    }
    const gen = uidGenRef.current;
    try {
      const res = await apiFetch(`/api/paper/orders?uid=${encodeURIComponent(uid)}`);
      if (gen !== uidGenRef.current || resolveUid() !== uid) return;
      if (res.ok) {
        const data = (await res.json()) as { orders?: PaperOrder[] } | PaperOrder[];
        setOrders(Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : []);
      }
    } catch {
      // silently handle
    }
  }, [resolveUid]);

  const fetchPaperTrades = useCallback(
    async (statusFilter?: string) => {
      const uid = resolveUid();
      if (!uid) {
        setPaperTrades([]);
        setPaperSummary(null);
        return;
      }
      const gen = uidGenRef.current;
      try {
        const params = new URLSearchParams({ uid });
        if (statusFilter && statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        const res = await apiFetch(`/api/paper/trades?${params.toString()}`);
        if (gen !== uidGenRef.current || resolveUid() !== uid) return;
        if (res.ok) {
          const data = (await res.json()) as {
            trades?: PaperTradeRecord[];
            summary?: PaperPerformanceSummary;
          };
          setPaperTrades(Array.isArray(data?.trades) ? data.trades : []);
          if (data?.summary) setPaperSummary(data.summary);
        }
      } catch {
        // silently handle
      }
    },
    [resolveUid]
  );

  const fetchReplayStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/replay/status');
      if (res.ok) {
        const data = (await res.json()) as { status?: ReplayStatus };
        if (data?.status) setReplayStatus(data.status);
      }
    } catch {
      // silently handle
    }
  }, []);

  const fetchAutoTradeStatus = useCallback(async () => {
    const uid = resolveUid();
    if (!uid) {
      setAutoTradeEnabledState(false);
      return;
    }
    const gen = uidGenRef.current;
    try {
      const res = await apiFetch(`/api/paper/auto-trade?uid=${encodeURIComponent(uid)}`);
      if (gen !== uidGenRef.current || resolveUid() !== uid) return;
      if (res.ok) {
        const data = (await res.json()) as { autoTradeEnabled?: boolean };
        setAutoTradeEnabledState(Boolean(data?.autoTradeEnabled));
      }
    } catch {
      // silently handle
    }
  }, [resolveUid]);

  const toggleAutoTrade = useCallback(
    async (enabled: boolean) => {
      const uid = resolveUid();
      if (!uid) return;
      try {
        setLoading(true);
        const res = await apiFetch('/api/paper/auto-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, uid }),
        });
        if (res.ok) {
          const data = (await res.json()) as { autoTradeEnabled?: boolean };
          setAutoTradeEnabledState(Boolean(data?.autoTradeEnabled));
        }
      } finally {
        setLoading(false);
      }
    },
    [resolveUid]
  );

  const resetPaperBalance = useCallback(
    async (balance: number, clearTrades = false) => {
      const uid = resolveUid();
      if (!uid) return { ok: false, error: 'Authentication required' };
      try {
        setLoading(true);
        const res = await apiFetch('/api/paper/reset-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, balance, clearTrades }),
        });
        const data = await res.json();
        await Promise.all([fetchAccount(), fetchPositions(), fetchOrders(), fetchPaperTrades()]);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [resolveUid, fetchAccount, fetchPositions, fetchOrders, fetchPaperTrades]
  );

  const fetchTradeReplay = useCallback(
    async (tradeId: string): Promise<TradeReplaySnapshot | null> => {
      const uid = resolveUid();
      if (!uid) return null;
      try {
        const res = await apiFetch(
          `/api/paper/trades/${encodeURIComponent(tradeId)}/replay?uid=${encodeURIComponent(uid)}`
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { replay?: TradeReplaySnapshot | null };
        return data?.replay || null;
      } catch {
        return null;
      }
    },
    [resolveUid]
  );

  const startOfflineReplay = useCallback(
    async (options?: { symbols?: string[]; timeframe?: string; speedMs?: number }) => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/replay/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options || {}),
        });
        const data = await res.json();
        if (data?.status) setReplayStatus(data.status);
        return data;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const pauseOfflineReplay = useCallback(async () => {
    const res = await apiFetch('/api/replay/pause', { method: 'POST' });
    const data = await res.json();
    if (data?.status) setReplayStatus(data.status);
    return data;
  }, []);

  const resumeOfflineReplay = useCallback(async () => {
    const res = await apiFetch('/api/replay/resume', { method: 'POST' });
    const data = await res.json();
    if (data?.status) setReplayStatus(data.status);
    return data;
  }, []);

  const stopOfflineReplay = useCallback(async () => {
    const res = await apiFetch('/api/replay/stop', { method: 'POST' });
    const data = await res.json();
    if (data?.status) setReplayStatus(data.status);
    return data;
  }, []);

  const stepOfflineReplay = useCallback(
    async (bars = 1) => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/replay/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bars }),
        });
        const data = await res.json();
        if (data?.status) setReplayStatus(data.status);
        await Promise.all([fetchAccount(), fetchPositions(), fetchOrders(), fetchPaperTrades()]);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [fetchAccount, fetchPositions, fetchOrders, fetchPaperTrades]
  );

  const executeManualTrade = useCallback(
    async (params: ExecutePaperTradeParams) => {
      const uid = resolveUid();
      if (!uid) return { success: false, error: 'Authentication required' };
      try {
        setLoading(true);
        const res = await apiFetch('/api/paper/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...params, uid }),
        });
        const data = await res.json();
        await Promise.all([fetchPositions(), fetchOrders(), fetchAccount(), fetchPaperTrades()]);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [resolveUid, fetchPositions, fetchOrders, fetchAccount, fetchPaperTrades]
  );

  const closeOpenPosition = useCallback(
    async (positionId: string) => {
      const uid = resolveUid();
      if (!uid) return { success: false, error: 'Authentication required' };
      try {
        setLoading(true);
        const res = await apiFetch('/api/paper/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId, uid }),
        });
        const data = await res.json();
        await Promise.all([fetchPositions(), fetchOrders(), fetchAccount(), fetchPaperTrades()]);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [resolveUid, fetchPositions, fetchOrders, fetchAccount, fetchPaperTrades]
  );

  const cancelPendingOrder = useCallback(
    async (orderId: string) => {
      const uid = resolveUid();
      if (!uid) return { ok: false, success: false, error: 'Authentication required' };
      try {
        setLoading(true);
        const res = await apiFetch('/api/paper/orders/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, uid }),
        });
        const data = await res.json();
        await Promise.all([fetchOrders(), fetchPositions(), fetchAccount(), fetchPaperTrades()]);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [resolveUid, fetchOrders, fetchPositions, fetchAccount, fetchPaperTrades]
  );

  useEffect(() => {
    uidGenRef.current += 1;
    const activeUid = resolveUid();
    let cancelled = false;

    const initialTimer = setTimeout(() => {
      if (cancelled) return;
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setPaperTrades([]);
      setPaperSummary(null);
      setAutoTradeEnabledState(false);

      if (!activeUid) {
        void fetchReplayStatus();
        return;
      }

      void fetchAccount();
      void fetchPositions();
      void fetchOrders();
      void fetchAutoTradeStatus();
      void fetchPaperTrades();
      void fetchReplayStatus();
    }, 0);

    if (!activeUid) {
      return () => {
        cancelled = true;
        clearTimeout(initialTimer);
      };
    }

    const interval = setInterval(() => {
      void fetchAccount();
      void fetchPositions();
      void fetchOrders();
      void fetchPaperTrades();
      void fetchReplayStatus();
    }, 8000);

    let tradeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubAccount = webSocketService.subscribe(
      'paper-account-updated',
      (payload?: Partial<PaperAccountInfo> & { uid?: string }) => {
        if (cancelled || !payload || typeof payload !== 'object') return;
        if (!payload.uid || payload.uid !== activeUid) return;

        setAccount((prev) => ({
          ...(prev ?? {
            connected: true,
            mode: 'paper',
            state: 'CONNECTED',
            platform: 'TRAXO PAPER',
          }),
          ...payload,
          connected: payload.connected ?? prev?.connected ?? true,
        }));

        if (
          typeof payload.balance === 'number' &&
          Number.isFinite(payload.balance) &&
          payload.balance > 0
        ) {
          const { autoSyncBrokerBalance, setAccountBalance, accountBalance } =
            useTradingContextStore.getState();
          if (autoSyncBrokerBalance && Math.abs(accountBalance - payload.balance) > 0.01) {
            setAccountBalance(Number(payload.balance.toFixed(2)));
          }
        }
      }
    );

    const unsubTrade = webSocketService.subscribe(
      'paper-trade-updated',
      (payload?: { uid?: string }) => {
        if (cancelled) return;
        if (!payload || typeof payload !== 'object' || !payload.uid || payload.uid !== activeUid) {
          return;
        }
        if (tradeRefreshTimer) {
          clearTimeout(tradeRefreshTimer);
        }
        tradeRefreshTimer = setTimeout(() => {
          tradeRefreshTimer = null;
          void fetchAccount();
          void fetchPositions();
          void fetchOrders();
          void fetchPaperTrades();
        }, 250);
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (tradeRefreshTimer) {
        clearTimeout(tradeRefreshTimer);
      }
      unsubAccount();
      unsubTrade();
    };
  }, [
    activeStoreUid,
    resolveUid,
    fetchAccount,
    fetchPositions,
    fetchOrders,
    fetchAutoTradeStatus,
    fetchPaperTrades,
    fetchReplayStatus,
  ]);

  return {
    account,
    positions,
    orders,
    paperTrades,
    paperSummary,
    replayStatus,
    autoTradeEnabled,
    loading,
    toggleAutoTrade,
    executeManualTrade,
    closeOpenPosition,
    cancelPendingOrder,
    resetPaperBalance,
    startOfflineReplay,
    pauseOfflineReplay,
    resumeOfflineReplay,
    stopOfflineReplay,
    stepOfflineReplay,
    fetchTradeReplay,
    fetchPaperTrades,
    refreshAccount: fetchAccount,
    refreshPositions: fetchPositions,
    refreshOrders: fetchOrders,
    refreshPaperTrades: fetchPaperTrades,
    refreshReplayStatus: fetchReplayStatus,
  };
}

export function useLiveQuotes(enabled = true) {
  const [quotes, setQuotes] = useState<MarketQuoteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const fetchQuotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch('/api/paper/quotes');
      if (res.ok) {
        const data = (await res.json()) as { quotes?: MarketQuoteItem[] } | MarketQuoteItem[];
        const nextQuotes = Array.isArray(data)
          ? data
          : Array.isArray(data?.quotes)
            ? data.quotes
            : [];
        setQuotes(nextQuotes);
        setLastUpdatedAt(Date.now());
      }
    } catch {
      // silently handle offline backend
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshQuotes = useCallback(async () => {
    await fetchQuotes(false);
  }, [fetchQuotes]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const initialTimer = setTimeout(() => {
      if (!cancelled) {
        void fetchQuotes(false);
      }
    }, 0);

    const interval = setInterval(() => {
      if (!cancelled) {
        void fetchQuotes(true);
      }
    }, 5_000);

    const unsubCandle = webSocketService.subscribe(
      'new-candle',
      (candle?: IncomingCandlePayload) => {
        if (cancelled || !candle || typeof candle !== 'object' || !candle.symbol) return;
        const close = Number(candle.close);
        if (!Number.isFinite(close) || close <= 0) return;

        const targetSymbol = normalizeQuoteSymbol(String(candle.symbol));
        const candleHigh = Number(candle.high);
        const candleLow = Number(candle.low);
        const nextTimestamp = parseCandleTimestampIso(candle);

        let matched = false;
        setQuotes((prev) => {
          if (prev.length === 0) return prev;
          const idx = prev.findIndex((item) => normalizeQuoteSymbol(item.symbol) === targetSymbol);
          if (idx < 0) return prev;
          matched = true;

          const item = prev[idx];
          const halfSpread =
            item.bid !== null && item.ask !== null && item.ask >= item.bid
              ? (item.ask - item.bid) / 2
              : item.spreadPips !== null && item.pipSize > 0
                ? (item.spreadPips * item.pipSize) / 2
                : 0;

          const nextMid = roundToDigits(close, item.digits);
          const nextBid = roundToDigits(close - halfSpread, item.digits);
          const nextAsk = roundToDigits(close + halfSpread, item.digits);
          const nextSpreadPips =
            item.pipSize > 0
              ? Number(((nextAsk - nextBid) / item.pipSize).toFixed(2))
              : item.spreadPips;

          const highCandidate = Number.isFinite(candleHigh) && candleHigh > 0 ? candleHigh : close;
          const lowCandidate = Number.isFinite(candleLow) && candleLow > 0 ? candleLow : close;
          const nextDayHigh =
            item.dayHigh !== null
              ? roundToDigits(Math.max(item.dayHigh, highCandidate), item.digits)
              : roundToDigits(highCandidate, item.digits);
          const nextDayLow =
            item.dayLow !== null
              ? roundToDigits(Math.min(item.dayLow, lowCandidate), item.digits)
              : roundToDigits(lowCandidate, item.digits);
          const nextChangePct =
            item.dayOpen !== null && item.dayOpen > 0
              ? Number((((close - item.dayOpen) / item.dayOpen) * 100).toFixed(2))
              : item.changePct;

          const updated = [...prev];
          updated[idx] = {
            ...item,
            bid: nextBid,
            ask: nextAsk,
            mid: nextMid,
            spreadPips: nextSpreadPips,
            dayHigh: nextDayHigh,
            dayLow: nextDayLow,
            changePct: nextChangePct,
            timestamp: nextTimestamp,
          };
          return updated;
        });

        if (matched) {
          setLastUpdatedAt(Date.now());
        }
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      unsubCandle();
    };
  }, [enabled, fetchQuotes]);

  return {
    quotes,
    loading,
    lastUpdatedAt,
    refreshQuotes,
  };
}
