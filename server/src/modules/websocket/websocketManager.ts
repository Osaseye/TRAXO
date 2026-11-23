import type http from 'http';
import { Server } from 'socket.io';
import { env, resolveCorsOrigin } from '../../config/env';

let io: Server | null = null;

export function initWebSocketServer(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: resolveCorsOrigin(env.allowedOrigins),
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
  return io;
}

export interface BroadcastMessage {
  type:
    | 'NEW_SIGNAL'
    | 'NEW_CANDLE'
    | 'SIGNAL_UPDATED'
    | 'NEWS_FREEZE_ENTER'
    | 'NEWS_RELEASED'
    | 'NEWS_FREEZE_EXIT'
    | 'PAPER_TRADE_UPDATED'
    | 'PAPER_ACCOUNT_UPDATED'
    | 'REPLAY_TICK'
    | string;
  payload?: any;
}

export function broadcast(message: BroadcastMessage): void {
  if (!io) {
    if (process.env.TRAXO_NO_LISTEN !== 'true') {
      console.error('Socket.io server is not initialized. Cannot broadcast message.');
    }
    return;
  }

  const EVENT_MAP: Record<string, string[]> = {
    NEW_SIGNAL: ['new-signal', 'signal'],
    NEW_CANDLE: ['new-candle'],
    SIGNAL_UPDATED: ['signal-updated'],
    NEWS_FREEZE_ENTER: ['news-freeze-enter'],
    NEWS_RELEASED: ['news-released'],
    NEWS_FREEZE_EXIT: ['news-freeze-exit'],
    PAPER_TRADE_UPDATED: ['paper-trade-updated'],
    PAPER_ACCOUNT_UPDATED: ['paper-account-updated'],
    REPLAY_TICK: ['replay-tick'],
  };

  const events = EVENT_MAP[message.type];

  if (events) {
    const clients = io.engine?.clientsCount ?? 0;
    if (message.type === 'NEW_SIGNAL') {
      const p = message.payload;
      console.log(
        `📡 Signal sent to ${clients} client(s) → ${p?.direction} ${p?.symbol} ${p?.timeframe} | ${p?.strategyLabel || 'Strategy'} | ${p?.confidence ?? 0}%`
      );
    } else if (message.type === 'SIGNAL_UPDATED') {
      const p = message.payload;
      console.log(`📊 Signal update sent → ${p?.symbol} ${p?.timeframe} resolved as ${p?.status}`);
    }
    events.forEach((event) => io!.emit(event, message.payload));
  } else {
    io.emit(message.type, message.payload ?? message);
  }
}

export function getWebSocketStatus(): { initialized: boolean; connectedClients: number } {
  return {
    initialized: Boolean(io),
    connectedClients: io?.engine?.clientsCount ?? 0,
  };
}
