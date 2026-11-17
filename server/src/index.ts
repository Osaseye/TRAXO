import http from 'http';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { startNewsPoller } from './modules/market-data/newsPoller';
import { startCron } from './modules/scanner/scannerCron';
import { initWebSocketServer } from './modules/websocket/websocketManager';
import { registerRoutes } from './routes';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  registerRoutes(app);
  return app;
}

export function bootstrapServer() {
  const app = createApp();
  const server = http.createServer(app);
  const port = env.port;

  initWebSocketServer(server);

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Exiting cleanly for restart.`);
      process.exit(0);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    startCron();
    startNewsPoller();
  });

  const shutdown = (sig: string) => {
    console.log(`Received ${sig}, shutting down server cleanly...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGUSR2', () => {
    server.close(() => process.kill(process.pid, 'SIGUSR2'));
  });

  return { app, server };
}

if (process.env.TRAXO_NO_LISTEN !== 'true') {
  bootstrapServer();
}
