import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface OptimizationChange {
  param: string;
  from: number;
  to: number;
  reason: string;
}

export interface OptimizationHistoryItem {
  timestamp: number;
  outcome?: 'WIN' | 'LOSS';
  strategyId: string;
  symbol: string;
  timeframe: string;
  changes: OptimizationChange[];
}

export interface StrategyOptimizerStatus {
  isFeedbackEngineEnabled: boolean;
  totalLossesAnalyzed: number;
  totalWinsAnalyzed?: number;
  factoryDefaults: Record<string, Record<string, number>>;
  learnedParameters: Record<string, Record<string, number>>;
  parameterBounds?: Record<string, Record<string, { min: number; max: number }>>;
  history: OptimizationHistoryItem[];
}

const LOCAL_STORAGE_KEY = 'traxo_optimizer_state_v1';

const DEFAULT_FACTORY_PARAMETERS: Record<string, Record<string, number>> = {
  wick_rejection: { minWickRatio: 1.8, minConfidence: 70, atrSlPadding: 1.0, minRR: 1.8 },
  breakout: { volumeSpikeMultiplier: 1.5, minConfidence: 72, atrSlPadding: 1.0, minRR: 2.0 },
  order_block: { displacementRatio: 1.6, minConfidence: 75, atrSlPadding: 1.0, minRR: 2.0 },
  supply_demand: { zoneFlipStrength: 1.5, minConfidence: 72, atrSlPadding: 1.0, minRR: 2.0 },
  trend_following: { pullbackDepth: 0.38, minConfidence: 70, atrSlPadding: 1.0, minRR: 1.8 },
  traxo_london_apex: { minConfidence: 78, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_killzone_judas: { minConfidence: 78, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_tokyo_mean_reversion: { minConfidence: 76, atrSlPadding: 1.0, minRR: 1.6 },
  traxo_fvg_unicorn: { minConfidence: 82, atrSlPadding: 1.0, minRR: 2.5 },
  traxo_turtle_soup: { minConfidence: 78, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_aurum_sweep: { minConfidence: 80, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_fix_equilibrium: { minConfidence: 76, atrSlPadding: 1.0, minRR: 1.8 },
  traxo_ny_silver_bullet: { minConfidence: 82, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_kinetic_nr7: { minConfidence: 78, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_bullion_strike: { minConfidence: 80, atrSlPadding: 1.0, minRR: 2.2 },
  traxo_orb_velocity: { minConfidence: 78, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_power_hour_displacement: { minConfidence: 78, atrSlPadding: 1.0, minRR: 2.0 },
  traxo_vwap_institutional_band: { minConfidence: 76, atrSlPadding: 1.0, minRR: 1.8 },
  traxo_globex_gap_fill: { minConfidence: 76, atrSlPadding: 1.0, minRR: 1.6 },
  traxo_micro_structure_bos: { minConfidence: 80, atrSlPadding: 1.0, minRR: 2.0 },
};

const DEFAULT_PARAMETER_BOUNDS: Record<string, Record<string, { min: number; max: number }>> = {
  wick_rejection: {
    minWickRatio: { min: 1.5, max: 3.0 },
    minConfidence: { min: 65, max: 85 },
    atrSlPadding: { min: 0.9, max: 1.6 },
    minRR: { min: 1.5, max: 3.5 },
  },
  breakout: {
    volumeSpikeMultiplier: { min: 1.2, max: 3.0 },
    minConfidence: { min: 65, max: 85 },
    atrSlPadding: { min: 0.9, max: 1.6 },
    minRR: { min: 1.5, max: 3.5 },
  },
  order_block: {
    displacementRatio: { min: 1.3, max: 2.8 },
    minConfidence: { min: 68, max: 86 },
    atrSlPadding: { min: 0.9, max: 1.6 },
    minRR: { min: 1.5, max: 3.5 },
  },
  supply_demand: {
    zoneFlipStrength: { min: 1.2, max: 2.8 },
    minConfidence: { min: 66, max: 85 },
    atrSlPadding: { min: 0.9, max: 1.6 },
    minRR: { min: 1.5, max: 3.5 },
  },
  trend_following: {
    pullbackDepth: { min: 0.3, max: 0.62 },
    minConfidence: { min: 65, max: 84 },
    atrSlPadding: { min: 0.9, max: 1.6 },
    minRR: { min: 1.5, max: 3.5 },
  },
  ...Object.fromEntries(
    Object.keys(DEFAULT_FACTORY_PARAMETERS)
      .filter((k) => k.startsWith('traxo_'))
      .map((k) => [
        k,
        {
          minConfidence: { min: 70, max: 90 },
          atrSlPadding: { min: 0.85, max: 1.6 },
          minRR: { min: 1.4, max: 3.5 },
        },
      ])
  ),
};

function cloneParameters(src: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  return JSON.parse(JSON.stringify(src));
}

function loadInitialOptimizerStatus(): StrategyOptimizerStatus {
  const base: StrategyOptimizerStatus = {
    isFeedbackEngineEnabled: true,
    totalLossesAnalyzed: 0,
    totalWinsAnalyzed: 0,
    factoryDefaults: cloneParameters(DEFAULT_FACTORY_PARAMETERS),
    learnedParameters: cloneParameters(DEFAULT_FACTORY_PARAMETERS),
    parameterBounds: DEFAULT_PARAMETER_BOUNDS,
    history: [],
  };

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        isFeedbackEngineEnabled:
          typeof parsed.isFeedbackEngineEnabled === 'boolean' ? parsed.isFeedbackEngineEnabled : true,
        totalLossesAnalyzed: Number(parsed.totalLossesAnalyzed) || 0,
        totalWinsAnalyzed: Number(parsed.totalWinsAnalyzed) || 0,
        factoryDefaults: {
          ...cloneParameters(DEFAULT_FACTORY_PARAMETERS),
          ...(parsed.factoryDefaults || {}),
        },
        learnedParameters: {
          ...cloneParameters(DEFAULT_FACTORY_PARAMETERS),
          ...(parsed.learnedParameters || {}),
        },
        parameterBounds: {
          ...DEFAULT_PARAMETER_BOUNDS,
          ...(parsed.parameterBounds || {}),
        },
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    }
  } catch {
    // Ignore storage read failures
  }
  return base;
}

function saveOptimizerStatusToStorage(nextStatus: StrategyOptimizerStatus): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextStatus));
  } catch {
    // Ignore storage write failures
  }
}

export function useStrategyOptimizer(pollIntervalMs = 30000) {
  const [status, setStatus] = useState<StrategyOptimizerStatus>(() => loadInitialOptimizerStatus());
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/strategy-optimization/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.factoryDefaults) {
        setStatus((prev) => {
          const merged: StrategyOptimizerStatus = {
            isFeedbackEngineEnabled:
              typeof data.isFeedbackEngineEnabled === 'boolean'
                ? data.isFeedbackEngineEnabled
                : prev.isFeedbackEngineEnabled,
            totalLossesAnalyzed: Number(data.totalLossesAnalyzed) || 0,
            totalWinsAnalyzed: Number(data.totalWinsAnalyzed) || 0,
            factoryDefaults: {
              ...cloneParameters(DEFAULT_FACTORY_PARAMETERS),
              ...data.factoryDefaults,
            },
            learnedParameters: {
              ...cloneParameters(DEFAULT_FACTORY_PARAMETERS),
              ...(data.learnedParameters || {}),
            },
            parameterBounds: {
              ...DEFAULT_PARAMETER_BOUNDS,
              ...(data.parameterBounds || {}),
            },
            history: Array.isArray(data.history) ? data.history : prev.history,
          };
          saveOptimizerStatusToStorage(merged);
          return merged;
        });
      }
    } catch {
      // Keep optimistic / cached local status if backend is offline
    }
  }, []);

  const toggleFeedbackEngine = useCallback(async (enabled: boolean) => {
    const nextEnabled = Boolean(enabled);
    setIsLoading(true);
    setStatus((prev) => {
      const next: StrategyOptimizerStatus = {
        ...prev,
        isFeedbackEngineEnabled: nextEnabled,
      };
      saveOptimizerStatusToStorage(next);
      return next;
    });

    try {
      const res = await apiFetch('/api/strategy-optimization/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        const confirmedEnabled =
          typeof data?.isFeedbackEngineEnabled === 'boolean'
            ? data.isFeedbackEngineEnabled
            : nextEnabled;
        setStatus((prev) => {
          const next: StrategyOptimizerStatus = {
            ...prev,
            isFeedbackEngineEnabled: confirmedEnabled,
          };
          saveOptimizerStatusToStorage(next);
          return next;
        });
      }
    } catch {
      // Local state & localStorage were already updated optimistically
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetToFactory = useCallback(async () => {
    setIsLoading(true);
    setStatus((prev) => {
      const next: StrategyOptimizerStatus = {
        ...prev,
        totalLossesAnalyzed: 0,
        totalWinsAnalyzed: 0,
        learnedParameters: cloneParameters(prev.factoryDefaults || DEFAULT_FACTORY_PARAMETERS),
        history: [],
      };
      saveOptimizerStatusToStorage(next);
      return next;
    });

    try {
      const res = await apiFetch('/api/strategy-optimization/reset', {
        method: 'POST',
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      // Local factory reset already applied
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchStatus();
    }, 0);
    if (pollIntervalMs <= 0) {
      return () => clearTimeout(initialTimer);
    }
    const interval = setInterval(() => {
      void fetchStatus();
    }, pollIntervalMs);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchStatus, pollIntervalMs]);

  return {
    status,
    loading: isLoading,
    isLoading,
    fetchStatus,
    refreshStatus: fetchStatus,
    toggleFeedbackEngine,
    resetToFactory,
  };
}
