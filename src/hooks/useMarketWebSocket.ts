import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import type { StoredSignal } from '@/stores/useAnalysisSignalStore';

interface UseMarketWebSocketParams {
  onSignal: (signal: StoredSignal) => void;
  enabled: boolean;
}

const WEBSOCKET_URL = 'ws://localhost:8080';

export function useMarketWebSocket({ onSignal, enabled }: UseMarketWebSocketParams) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onSignalRef = useRef(onSignal);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    let isClosed = false;
    let reconnectTimer: number | null = null;
    let backoffMs = 1000;

    function connect() {
      if (isClosed || socketRef.current) return;

      const socket = new WebSocket(WEBSOCKET_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected to server');
        backoffMs = 1000; // Reset backoff on successful connection
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message?.type === 'NEW_SIGNAL') {
            onSignalRef.current(message.payload as StoredSignal);
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        socket.close(); // Triggers onclose
      };

      socket.onclose = () => {
        if (isClosed) return;
        
        console.log(`[WebSocket] Disconnected. Reconnecting in ${backoffMs}ms...`);
        socketRef.current = null;
        reconnectTimer = window.setTimeout(connect, backoffMs);
        backoffMs = Math.min(backoffMs * 2, 15000); // Exponential backoff
      };
    }

    connect();

    return () => {
      console.log('[WebSocket] Closing connection');
      isClosed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [enabled, isAuthenticated]);
}
