import { useAuthStore } from '@/stores/useAuthStore';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';
import { notifySignal } from '@/hooks/useSignalNotification';

/**
 * Invisible component that listens for real-time signals from the server
 * via WebSocket and adds them to the global store, triggering notifications.
 */
export function GlobalSignalMonitor() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addSignals = useAnalysisSignalStore((s) => s.addSignals);

  useMarketWebSocket({
    enabled: isAuthenticated,
    onSignal: (signal) => {
      // 1. Add the signal to the central analysis store
      addSignals([signal]);
      // 2. Trigger a toast, sound, or push notification if user settings allow
      notifySignal(signal);
    },
  });

  return null;
}
