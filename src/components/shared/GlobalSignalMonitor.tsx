/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import { notifySignal } from '@/hooks/useSignalNotification';
import webSocketService from '@/lib/websocket';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';
import { getHistoricalSignals, getLiveSignals } from '@/lib/api';

function signalToNotification(s: any) {
  const ms = typeof s.createdAt === 'string'
    ? new Date(s.createdAt).getTime()
    : typeof s.createdAt === 'number'
      ? s.createdAt
      : s.createdAt?.seconds
        ? s.createdAt.seconds * 1000
        : s.time
          ? s.time * 1000
          : Date.now();

  return {
    id: s.id,
    symbol: s.symbol,
    timeframe: s.timeframe,
    strategyId: s.strategyId || 'unknown',
    strategyLabel: s.strategyLabel || s.strategyId || 'Strategy',
    direction: s.direction || 'BUY',
    entry: Number(s.entry || 0),
    sl: Number(s.sl || 0),
    tp: Number(s.tp || 0),
    rr: Number(s.rr || 1.5),
    confidence: Number(s.confidence || 50),
    reason: Array.isArray(s.reason) ? s.reason : [],
    time: s.time,
    read: false,
    createdAt: ms,
  };
}

/**
 * Invisible component mounted at the App root.
 * 1. On mount → fetches existing live/historical signals from the REST API (hydration).
 * 2. Subscribes to WebSocket events so new signals trigger instant toasts + notifications.
 */
export function GlobalSignalMonitor() {
  useEffect(() => {
    let cancelled = false;

    // ── Hydrate existing signals from REST API ──
    async function hydrateServerSignals() {
      try {
        const [liveSignals, historical] = await Promise.all([
          getLiveSignals(),
          getHistoricalSignals(),
        ]);

        if (cancelled) return;

        const liveArr = Array.isArray(liveSignals) ? liveSignals : [];
        const histArr = historical?.signals || [];

        const liveIds = new Set(liveArr.map((s: any) => s.id));
        const previousSignals = histArr
          .filter((s: any) => s?.id && !liveIds.has(s.id))
          .map((s: any) => ({ ...s, status: (s.status && s.status !== 'live') ? s.status : 'expired' }));

        useAnalysisSignalStore.getState().addSignals([
          ...liveArr.map((s: any) => ({ ...s, status: 'live' })),
          ...previousSignals,
        ]);

        const allFetched = [...liveArr, ...histArr];
        if (allFetched.length > 0) {
          useNotificationStore.getState().addNotifications(allFetched.map(signalToNotification));

          // Populate historical resolved signals into Trading Journal
          const tcStore = useTradingContextStore.getState();
          allFetched.forEach((signal: any) => {
            const statusStr = (signal.status || '').toLowerCase();
            if (statusStr === 'win' || statusStr === 'loss') {
              const exists = tcStore.journal.find((j: any) => j.suggestionKey === signal.id);
              if (!exists) {
                tcStore.addJournalEntry({
                  suggestionKey: signal.id,
                  symbol: signal.symbol,
                  timeframe: signal.timeframe,
                  strategy: signal.strategyId || signal.strategyLabel || 'System',
                  action: signal.direction || 'BUY',
                  entry: Number(signal.entry || 0),
                  sl: Number(signal.sl || 0),
                  tp: Number(signal.tp || 0),
                  confidence: Number(signal.confidence || 50),
                  risk: 'Medium',
                  suggestedPosition: 0,
                  riskAmount: 0,
                  taken: false,
                  outcome: statusStr as 'win' | 'loss'
                });
              }
            }
          });
        }
      } catch {
        // Non-fatal: websocket updates can still arrive after startup.
      }
    }

    void hydrateServerSignals();

    // ── Real-time WebSocket listeners ──
    // The server emits BOTH 'signal' AND 'new-signal' for each NEW_SIGNAL.
    // We only need to subscribe to ONE to avoid duplicates.
    const handleSignal = (signal: any) => {
      if (!signal || !signal.symbol) {
        console.warn('[GlobalSignalMonitor] Received invalid signal payload:', signal);
        return;
      }
      console.log('[GlobalSignalMonitor] 🔔 Live signal received via WebSocket:', signal.direction, signal.symbol, signal.timeframe);
      useAnalysisSignalStore.getState().addSignals([{ ...signal, status: 'live' }]);
      const didNotify = notifySignal(signal);
      console.log('[GlobalSignalMonitor] notifySignal result:', didNotify);
    };

    // Subscribe to 'signal' — the primary event emitted by the server
    const unsub1 = webSocketService.subscribe('signal', handleSignal);
    // Also subscribe to 'new-signal' for backwards compat
    const unsub2 = webSocketService.subscribe('new-signal', handleSignal);
    
    const handleSignalUpdate = (signal: any) => {
      if (signal?.id && signal?.status) {
        useAnalysisSignalStore.getState().updateSignalStatus(signal.id, signal.status);

        // Auto-log resolved signals to the Journal
        const outcome = signal.status.toLowerCase();
        if (outcome === 'win' || outcome === 'loss') {
          const tcStore = useTradingContextStore.getState();
          const exists = tcStore.journal.find((j: any) => j.suggestionKey === signal.id);
          
          if (!exists) {
            tcStore.addJournalEntry({
              suggestionKey: signal.id,
              symbol: signal.symbol,
              timeframe: signal.timeframe,
              strategy: signal.strategyId || signal.strategyLabel || 'System',
              action: signal.direction,
              entry: signal.entry,
              sl: signal.sl,
              tp: signal.tp,
              confidence: signal.confidence || 50,
              risk: 'Medium',
              suggestedPosition: 0,
              riskAmount: 0,
              taken: false,
              outcome: outcome as 'win' | 'loss'
            });
          } else if (exists.outcome === 'pending') {
            tcStore.setJournalOutcome(signal.id, outcome as 'win' | 'loss');
          }
        }
      }
    };
    
    const unsub3 = webSocketService.subscribe('signal-updated', handleSignalUpdate);

    return () => {
      cancelled = true;
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  return null;
}
