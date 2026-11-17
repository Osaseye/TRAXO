import { useState, useEffect, useCallback } from 'react';

export interface OptimizationHistoryItem {
  timestamp: number;
  strategyId: string;
  symbol?: string;
  changes: Array<{
    param: string;
    from: number;
    to: number;
    reason: string;
  }>;
}

export interface StrategyOptimizerStatus {
  isFeedbackEngineEnabled: boolean;
  totalLossesAnalyzed: number;
  factoryDefaults: Record<string, Record<string, number>>;
  learnedParameters: Record<string, Record<string, number>>;
  history: OptimizationHistoryItem[];
}

export function useStrategyOptimizer() {
  const [status, setStatus] = useState<StrategyOptimizerStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/strategy-optimization/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silently handle
    }
  }, []);

  const toggleFeedbackEngine = async (enabled: boolean) => {
    try {
      setLoading(true);
      const res = await fetch('/api/strategy-optimization/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => (prev ? { ...prev, isFeedbackEngineEnabled: data.isFeedbackEngineEnabled } : prev));
        await fetchStatus();
      }
    } finally {
      setLoading(false);
    }
  };

  const resetToFactory = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/strategy-optimization/reset', {
        method: 'POST',
      });
      if (res.ok) {
        await fetchStatus();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(fetchStatus, 20000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    status,
    loading,
    toggleFeedbackEngine,
    resetToFactory,
    refreshStatus: fetchStatus,
  };
}
