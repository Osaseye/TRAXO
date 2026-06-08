const WebSocket = require('ws');

let wss;

/**
 * Initializes the WebSocket server.
 *
 * @param {http.Server} server - The Node.js HTTP server to attach the WebSocket server to.
 */
function initWebSocketServer(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket server.');

    // The primary purpose is server-to-client push. We can add
    // client-to-server message handling here if needed later.
    ws.on('message', (message) => {
      console.log('Received message from client:', message);
    });

    ws.on('close', () => {
      console.log('Client disconnected.');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  console.log('WebSocket server initialized and attached to HTTP server.');
}

/**
 * Broadcasts a message to all connected WebSocket clients.
 * This will be used by the signal scanner to push new signals.
 *
 * @param {object} message - The message object to broadcast. It will be stringified to JSON.
 */
function broadcast(message) {
  if (!wss) {
    console.error('WebSocket server is not initialized. Cannot broadcast message.');
    return;
  }

  const jsonMessage = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonMessage);
    }
  });
}

module.exports = {
  initWebSocketServer,
  broadcast,
};
