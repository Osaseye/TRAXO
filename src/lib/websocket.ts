/* eslint-disable @typescript-eslint/no-explicit-any */
import io from 'socket.io-client';
import { resolveApiBaseUrl } from './api';

const SOCKET_URL = resolveApiBaseUrl();

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
