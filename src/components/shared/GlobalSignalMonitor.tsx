/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import { notifySignal } from '@/hooks/useSignalNotification';
import webSocketService from '@/lib/websocket';
import { getHistoricalSignals, getLiveSignals } from '@/lib/api';

/**
 * Invisible component that listens for real-time signals from the server
 * via WebSocket and adds them to the global store, triggering notifications.
 */
export function GlobalSignalMonitor() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;

    async function hydrateServerSignals() {
      try {
        const [liveSignals, historical] = await Promise.all([
          getLiveSignals(),
          getHistoricalSignals(),
        ]);

        if (cancelled) return;

        const liveIds = new Set((Array.isArray(liveSignals) ? liveSignals : []).map((s: any) => s.id));
        const previousSignals = (historical?.signals || [])
          .filter((s: any) => s?.id && !liveIds.has(s.id))
          .map((s: any) => ({ ...s, status: (s.status && s.status !== 'live') ? s.status : 'expired' }));

        useAnalysisSignalStore.getState().addSignals([
          ...(Array.isArray(liveSignals) ? liveSignals.map((s: any) => ({ ...s, status: 'live' })) : []),
          ...previousSignals,
        ]);
      } catch {
        // Non-fatal: websocket updates can still arrive after startup.
      }
    }

    void hydrateServerSignals();

    const handleSignal = (signal: any) => {
      // Use getState() to access the store action. This is stable and won't cause re-renders.
      useAnalysisSignalStore.getState().addSignals([{ ...signal, status: 'live' }]);
      notifySignal(signal);
    };

    const unsubscribeSignal = webSocketService.subscribe('signal', handleSignal);
    
    const handleSignalUpdate = (signal: any) => {
      useAnalysisSignalStore.getState().updateSignalStatus(signal.id, signal.status);
    };
    
    const unsubscribeUpdate = webSocketService.subscribe('signal-updated', handleSignalUpdate);

    // The useEffect cleanup function will properly unsubscribe.
    return () => {
      cancelled = true;
      unsubscribeSignal();
      unsubscribeUpdate();
    };
  }, [isAuthenticated]); // The dependency array is now stable.

  return null;
}
