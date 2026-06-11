import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import { notifySignal } from '@/hooks/useSignalNotification';
import webSocketService from '@/lib/websocket';

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

    const handleSignal = (signal: any) => {
      // Use getState() to access the store action. This is stable and won't cause re-renders.
      useAnalysisSignalStore.getState().addSignals([signal]);
      notifySignal(signal);
    };

    const unsubscribe = webSocketService.subscribe('signal', handleSignal);

    // The useEffect cleanup function will properly unsubscribe.
    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]); // The dependency array is now stable.

  return null;
}
