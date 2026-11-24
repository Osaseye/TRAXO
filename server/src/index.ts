import fs from 'fs';
import http from 'http';
import path from 'path';
import cors from 'cors';
import express from 'express';
import { env, resolveCorsOrigin } from './config/env';
import { getScannableInstruments } from './config/instruments';
import { newsEngine, startNewsPoller, stopNewsPoller } from './services/news/newsEngine';
import { hydrateAllActiveTraders } from './modules/execution/paperAutoTraderRegistry';
import { startCron } from './modules/scanner/scannerCron';
import { broadcast, initWebSocketServer } from './modules/websocket/websocketManager';
import { registerRoutes } from './routes';

export function createApp() {
  const app = express();
  app.use(cors({ origin: resolveCorsOrigin(env.allowedOrigins) }));
  app.use(express.json());
  registerRoutes(app);

  const distIndexCandidates = [
    path.resolve(__dirname, '../../dist/index.html'),
    path.resolve(__dirname, '../../../dist/index.html'),
  ];
  const distIndexPath = distIndexCandidates.find((p) => fs.existsSync(p));
  if (distIndexPath) {
    const distDir = path.dirname(distIndexPath);
    app.use(express.static(distDir));
    app.get('*', (req: any, res: any, next: any) => {
      if (
        req.path.startsWith('/api') ||
        req.path === '/health' ||
        req.path.startsWith('/socket.io')
      ) {
        next();
        return;
      }
      res.sendFile(distIndexPath);
    });
  }

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
    void hydrateAllActiveTraders()
      .catch(() => {})
      .finally(() => {
        startCron();
      });
    newsEngine.setTransitionListener(
      (evt) => broadcast({ type: evt.type, payload: evt }),
      getScannableInstruments().map((i) => i.symbol)
    );
    startNewsPoller();
  });

  const shutdown = (sig: string) => {
    console.log(`Received ${sig}, shutting down server cleanly...`);
    stopNewsPoller();
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

const isTestProcess = process.argv.some((arg) => /\.test\.[tj]s$/i.test(arg));
if (process.env.TRAXO_NO_LISTEN !== 'true' && !isTestProcess) {
  bootstrapServer();
}
