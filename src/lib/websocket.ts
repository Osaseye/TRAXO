/* eslint-disable @typescript-eslint/no-explicit-any */
import io from 'socket.io-client';

const ENV_API_URL = import.meta.env.VITE_API_URL as string | undefined;

function resolveSocketUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalHost && (!ENV_API_URL || ENV_API_URL.includes('localhost') || ENV_API_URL.includes('127.0.0.1'))) {
      return window.location.origin;
    }
  }
  return ENV_API_URL || 'http://localhost:8080';
}

const SOCKET_URL = resolveSocketUrl();

class WebSocketService {
  socket;
  listeners = new Map<string, Set<(...args: any[]) => void>>();
  /** Track which events have a native socket.on handler registered */
  private registeredEvents = new Set<string>();

  constructor() {
    this.socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('[ws] Connected to server, id:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[ws] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[ws] Connection error:', err.message);
    });
  }

  /**
   * Subscribe to a named socket.io event.
   * Uses direct socket.on() — no onAny indirection.
   */
  subscribe(eventName: string, callback: (...args: any[]) => void) {
    if (typeof callback !== 'function') {
      console.error(`[ws] subscribe("${eventName}"): callback is not a function`);
      return () => {};
    }

    // Lazily create the listener set and attach ONE native socket.on per event
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    if (!this.registeredEvents.has(eventName)) {
      this.registeredEvents.add(eventName);
      this.socket.on(eventName, (...args: any[]) => {
        const cbs = this.listeners.get(eventName);
        if (cbs) {
          cbs.forEach((cb) => {
            try { cb(...args); } catch (e) { console.error(`[ws] ${eventName} callback error:`, e); }
          });
        }
      });
    }

    this.listeners.get(eventName)!.add(callback);

    if (!this.socket.connected) {
      this.socket.connect();
    }

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(eventName);
      if (set) {
        set.delete(callback);
      }
    };
  }

  unsubscribe(eventName: string, callback: any) {
    const set = this.listeners.get(eventName);
    if (set) set.delete(callback);
  }

  getClient() {
    return this.socket;
  }
}

const webSocketService = new WebSocketService();
export default webSocketService;
