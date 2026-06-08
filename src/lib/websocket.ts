import io from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

class WebSocketService {
  socket;
  listeners = new Map();

  constructor() {
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'], // Use WebSockets with a fallback to long-polling
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

    // Generic handler to route all events from the server
    this.socket.onAny((eventName, ...args) => {
      if (this.listeners.has(eventName)) {
        this.listeners.get(eventName).forEach(callback => callback(...args));
      }
    });
  }

  /**
   * Subscribe to a specific event from the server.
   * @param {string} eventName - The name of the event to subscribe to.
   * @param {function} callback - The function to call when the event is received.
   * @returns {function} - A function to unsubscribe from the event.
   */
  subscribe(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);

    // Return an unsubscribe function
    return () => {
      this.listeners.get(eventName).delete(callback);
      if (this.listeners.get(eventName).size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  /**
   * Unsubscribe a callback from a specific event.
   * @param {string} eventName - The name of the event.
   * @param {function} callback - The callback to remove.
   */
  unsubscribe(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
      if (this.listeners.get(eventName).size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  /**
   * Get the underlying socket.io client instance.
   */
  getClient() {
    return this.socket;
  }
}

// Export a singleton instance of the service
const webSocketService = new WebSocketService();
export default webSocketService;
