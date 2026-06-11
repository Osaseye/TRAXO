import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';
import { useSignalNotification } from '@/hooks/useSignalNotification';

/**
 * Invisible component that listens for real-time signals from the server
 * via WebSocket and adds them to the global store, triggering notifications.
 */
export function GlobalSignalMonitor() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addSignals = useAnalysisSignalStore((s) => s.addSignals);

  const { notifySignal } = useSignalNotification();

  useMarketWebSocket({
    enabled: isAuthenticated,
    onSignal: (signal) => {
      // Add the signal to the store and trigger a notification
      addSignals([signal]);
      notifySignal(signal);
    },
  });

  return null;
}
