const { Server } = require('socket.io');

let io;

/**
 * Initializes the Socket.io server and attaches it to the HTTP server.
 * The frontend uses socket.io-client, so this must match.
 *
 * @param {http.Server} server - The Node.js HTTP server to attach Socket.io to.
 */
function initWebSocketServer(server) {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins in development; restrict in production
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Client connected to WebSocket server. [id: ${socket.id}]`);

    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected. [id: ${socket.id}, reason: ${reason}]`);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error [id: ${socket.id}]:`, error);
    });
  });

  console.log('Socket.io server initialized and attached to HTTP server.');
}

/**
 * Broadcasts a message to all connected Socket.io clients.
 * Maps payload type to the event name the frontend subscribes to.
 *
 * Frontend listeners:
 *   - 'new-signal'  → SignalTracker.tsx
 *   - 'signal'      → GlobalSignalMonitor.tsx
 *   - 'new-candle'  → useMarketWebSocket.ts
 *
 * @param {object} message - Must have a `type` field (e.g. 'NEW_SIGNAL', 'NEW_CANDLE').
 */
function broadcast(message) {
  if (!io) {
    console.error('Socket.io server is not initialized. Cannot broadcast message.');
    return;
  }

  // Map server-side type → frontend event name
  const EVENT_MAP = {
    NEW_SIGNAL: ['new-signal', 'signal'], // emit to both listeners
    NEW_CANDLE: ['new-candle'],
    SIGNAL_UPDATED: ['signal-updated'],
  };

  const events = EVENT_MAP[message.type];

  if (events) {
    events.forEach((event) => io.emit(event, message.payload));
  } else {
    // Fallback: emit the raw message under its type as the event name
    io.emit(message.type, message.payload ?? message);
  }
}

module.exports = {
  initWebSocketServer,
  broadcast,
};
