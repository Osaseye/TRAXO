/* eslint-disable @typescript-eslint/no-explicit-any */
import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

class WebSocketService {
  socket;
  listeners = new Map();

  constructor() {
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.socket.onAny((eventName, ...args) => {
      if (this.listeners.has(eventName)) {
        const callbacks = new Set(this.listeners.get(eventName));
        callbacks.forEach(callback => {
          if (typeof callback === 'function') {
            callback(...args);
          }
        });
      }
    });
  }

  subscribe(eventName: string, callback: any) {
    if (typeof callback !== 'function') {
      console.error(`[WebSocketService] Attempted to subscribe to event "${eventName}" with a non-function callback.`);
      return () => {}; // Return a no-op for safety
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);

    return () => {
      const eventListeners = this.listeners.get(eventName);
      if (eventListeners) {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          this.listeners.delete(eventName);
        }
      }
    };
  }

  unsubscribe(eventName: string, callback: any) {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      eventListeners.delete(callback);
      if (eventListeners.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  getClient() {
    return this.socket;
  }
}

const webSocketService = new WebSocketService();
export default webSocketService;
