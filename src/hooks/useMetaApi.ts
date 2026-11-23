import { useState, useEffect, useCallback } from 'react';
import { resolveApiBaseUrl } from '@/lib/api';
import { auth } from '@/lib/firebase';
import webSocketService from '@/lib/websocket';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';

function getActiveUid(): string {
  return useAuthStore.getState().user?.id || auth.currentUser?.uid || 'default_trader';
}

async function metaFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = resolveApiBaseUrl();
  const url =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const activeUid = getActiveUid();
  const headers = new Headers(options.headers);

  if (!headers.has('X-Traxo-Uid')) {
    headers.set('X-Traxo-Uid', activeUid);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth.currentUser && !headers.has('Authorization')) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      // Proceed with X-Traxo-Uid header if token refresh fails
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export interface MetaApiAccountInfo {
  connected: boolean;
  mode?: 'paper' | 'metaapi';
  state?: string;
  balance?: number;
  equity?: number;
  margin?: number;
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

export interface MetaApiPosition {
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

export function useMetaApi() {
  const activeStoreUid = useAuthStore((s) => s.user?.id ?? null);
  const [account, setAccount] = useState<MetaApiAccountInfo | null>(null);
  const [positions, setPositions] = useState<MetaApiPosition[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTradeRecord[]>([]);
  const [paperSummary, setPaperSummary] = useState<PaperPerformanceSummary | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabledState] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const resolveUid = useCallback(
    () => activeStoreUid || auth.currentUser?.uid || 'default_trader',
    [activeStoreUid]
  );

  const fetchAccount = useCallback(async () => {
    try {
      const uid = resolveUid();
      const res = await metaFetch(`/api/metaapi/account?uid=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
        if (data.connected && typeof data.balance === 'number' && data.balance > 0) {
          const { autoSyncBrokerBalance, setAccountBalance, accountBalance } = useTradingContextStore.getState();
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
    try {
      const uid = resolveUid();
      const res = await metaFetch(`/api/metaapi/positions?uid=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions || []);
      }
    } catch {
      // silently handle
    }
  }, [resolveUid]);

  const fetchPaperTrades = useCallback(
    async (statusFilter?: string) => {
      try {
        const uid = resolveUid();
        const params = new URLSearchParams({ uid });
        if (statusFilter && statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        const res = await metaFetch(`/api/metaapi/trades?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setPaperTrades(data.trades || []);
          if (data.summary) setPaperSummary(data.summary);
        }
      } catch {
        // silently handle
      }
    },
    [resolveUid]
  );

  const fetchReplayStatus = useCallback(async () => {
    try {
      const res = await metaFetch('/api/replay/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) setReplayStatus(data.status);
      }
    } catch {
      // silently handle
    }
  }, []);

  const fetchAutoTradeStatus = useCallback(async () => {
    try {
      const res = await metaFetch('/api/metaapi/auto-trade');
      if (res.ok) {
        const data = await res.json();
        setAutoTradeEnabledState(data.autoTradeEnabled);
      }
    } catch {
      // silently handle
    }
  }, []);

  const toggleAutoTrade = async (enabled: boolean) => {
    try {
      setLoading(true);
      const res = await metaFetch('/api/metaapi/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoTradeEnabledState(data.autoTradeEnabled);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetPaperBalance = async (balance: number, clearTrades = false) => {
    try {
      setLoading(true);
      const activeUid = getActiveUid();
      const res = await metaFetch('/api/metaapi/account/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: activeUid, balance, clearTrades }),
      });
      const data = await res.json();
      await Promise.all([fetchAccount(), fetchPositions(), fetchPaperTrades()]);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const fetchTradeReplay = useCallback(
    async (tradeId: string): Promise<TradeReplaySnapshot | null> => {
      try {
        const uid = resolveUid();
        const res = await metaFetch(
          `/api/metaapi/trades/${encodeURIComponent(tradeId)}/replay?uid=${encodeURIComponent(uid)}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.replay || null;
      } catch {
        return null;
      }
    },
    [resolveUid]
  );

  const startOfflineReplay = async (options?: {
    symbols?: string[];
    timeframe?: string;
    speedMs?: number;
  }) => {
    try {
      setLoading(true);
      const res = await metaFetch('/api/replay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      const data = await res.json();
      if (data.status) setReplayStatus(data.status);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const pauseOfflineReplay = async () => {
    const res = await metaFetch('/api/replay/pause', { method: 'POST' });
    const data = await res.json();
    if (data.status) setReplayStatus(data.status);
    return data;
  };

  const resumeOfflineReplay = async () => {
    const res = await metaFetch('/api/replay/resume', { method: 'POST' });
    const data = await res.json();
    if (data.status) setReplayStatus(data.status);
    return data;
  };

  const stopOfflineReplay = async () => {
    const res = await metaFetch('/api/replay/stop', { method: 'POST' });
    const data = await res.json();
    if (data.status) setReplayStatus(data.status);
    return data;
  };

  const stepOfflineReplay = async (bars = 1) => {
    try {
      setLoading(true);
      const res = await metaFetch('/api/replay/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bars }),
      });
      const data = await res.json();
      if (data.status) setReplayStatus(data.status);
      await Promise.all([fetchAccount(), fetchPositions(), fetchPaperTrades()]);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const executeManualTrade = async (params: {
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
  }) => {
    try {
      setLoading(true);
      const activeUid = getActiveUid();
      const res = await metaFetch('/api/metaapi/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, uid: activeUid }),
      });
      const data = await res.json();
      await Promise.all([fetchPositions(), fetchAccount(), fetchPaperTrades()]);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const closeOpenPosition = async (positionId: string) => {
    try {
      setLoading(true);
      const activeUid = getActiveUid();
      const res = await metaFetch('/api/metaapi/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId, uid: activeUid }),
      });
      const data = await res.json();
      await Promise.all([fetchPositions(), fetchAccount(), fetchPaperTrades()]);
      return data;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchAccount();
      void fetchPositions();
      void fetchAutoTradeStatus();
      void fetchPaperTrades();
      void fetchReplayStatus();
    }, 0);

    const interval = setInterval(() => {
      void fetchAccount();
      void fetchPositions();
      void fetchPaperTrades();
      void fetchReplayStatus();
    }, 8000);

    let tradeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubAccount = webSocketService.subscribe(
      'paper-account-updated',
      (payload?: Partial<MetaApiAccountInfo>) => {
        if (!payload || typeof payload !== 'object') return;
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
        if (typeof payload.balance === 'number' && Number.isFinite(payload.balance) && payload.balance > 0) {
          const { autoSyncBrokerBalance, setAccountBalance, accountBalance } =
            useTradingContextStore.getState();
          if (autoSyncBrokerBalance && Math.abs(accountBalance - payload.balance) > 0.01) {
            setAccountBalance(Number(payload.balance.toFixed(2)));
          }
        }
      }
    );

    const unsubTrade = webSocketService.subscribe('paper-trade-updated', () => {
      if (tradeRefreshTimer) {
        clearTimeout(tradeRefreshTimer);
      }
      tradeRefreshTimer = setTimeout(() => {
        tradeRefreshTimer = null;
        void fetchAccount();
        void fetchPositions();
        void fetchPaperTrades();
      }, 250);
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (tradeRefreshTimer) {
        clearTimeout(tradeRefreshTimer);
      }
      unsubAccount();
      unsubTrade();
    };
  }, [fetchAccount, fetchPositions, fetchAutoTradeStatus, fetchPaperTrades, fetchReplayStatus]);

  return {
    account,
    positions,
    paperTrades,
    paperSummary,
    replayStatus,
    autoTradeEnabled,
    loading,
    toggleAutoTrade,
    resetPaperBalance,
    fetchPaperTrades,
    fetchTradeReplay,
    startOfflineReplay,
    pauseOfflineReplay,
    resumeOfflineReplay,
    stopOfflineReplay,
    stepOfflineReplay,
    executeManualTrade,
    closeOpenPosition,
    refreshAccount: fetchAccount,
    refreshPositions: fetchPositions,
  };
}
