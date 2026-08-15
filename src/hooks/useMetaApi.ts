import { useState, useEffect, useCallback } from 'react';

export interface MetaApiAccountInfo {
  connected: boolean;
  state?: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  leverage?: number;
  currency?: string;
  platform?: string;
  error?: string;
}

export interface MetaApiPosition {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  profit: number;
  swap: number;
  comment?: string;
  time: string;
}

export function useMetaApi() {
  const [account, setAccount] = useState<MetaApiAccountInfo | null>(null);
  const [positions, setPositions] = useState<MetaApiPosition[]>([]);
  const [autoTradeEnabled, setAutoTradeEnabledState] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/metaapi/account');
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
      }
    } catch {
      // silently handle offline or dev server reload
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/metaapi/positions');
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions || []);
      }
    } catch {
      // silently handle
    }
  }, []);

  const fetchAutoTradeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/metaapi/auto-trade');
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
      const res = await fetch('/api/metaapi/auto-trade', {
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

  const executeManualTrade = async (params: {
    symbol: string;
    action: 'BUY' | 'SELL';
    volume?: number;
    sl?: number;
    tp?: number;
  }) => {
    try {
      setLoading(true);
      const res = await fetch('/api/metaapi/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      await fetchPositions();
      await fetchAccount();
      return data;
    } finally {
      setLoading(false);
    }
  };

  const closeOpenPosition = async (positionId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/metaapi/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      });
      const data = await res.json();
      await fetchPositions();
      await fetchAccount();
      return data;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAccount();
    void fetchPositions();
    void fetchAutoTradeStatus();

    const interval = setInterval(() => {
      void fetchAccount();
      void fetchPositions();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchAccount, fetchPositions, fetchAutoTradeStatus]);

  return {
    account,
    positions,
    autoTradeEnabled,
    loading,
    toggleAutoTrade,
    executeManualTrade,
    closeOpenPosition,
    refreshAccount: fetchAccount,
    refreshPositions: fetchPositions,
  };
}
