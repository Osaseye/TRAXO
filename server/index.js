const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

// Enable TS support at runtime so adapters can import .ts strategy modules.
require('ts-node/register/transpile-only');

// --- New Service Imports ---
const { initWebSocketServer } = require('./services/websocketManager');
const { startCron } = require('./services/scannerCron');

// --- Route Imports ---
const newsRouter = require('./routes/news');
const signalsRouter = require('./routes/signals');
const candlesRouter = require('./routes/candles');
const scannerRouter = require('./routes/scanner');

// --- Legacy Auth/Profile Route Imports (to be refactored later if needed) ---
const { setupAuthRoutes } = require('./routes/auth'); 

const app = express();
app.use(cors());
app.use(express.json());

// --- API Routes ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/news', newsRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/candles', candlesRouter);
app.use('/api/scanner', scannerRouter);

// Setup legacy authentication and profile routes
setupAuthRoutes(app);

// --- Server Initialization ---
const server = http.createServer(app);

// Initialize WebSocket Server and attach to the HTTP server
initWebSocketServer(server);

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  
  // Start the background jobs after the server is running
  startCron();
  // startNewsPoller(); // Assuming you have a news poller to start
});
