import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { env } from '../../config/env';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(...keys: string[]): Promise<number>;
  mget(keys: string[]): Promise<(string | null)[]>;
  ping(): Promise<string>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<any>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  on(event: string, listener: (...args: any[]) => void): any;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<any>;
  scanStream(options: { match: string; count?: number }): NodeJS.EventEmitter;
}

/**
 * High-fidelity in-memory Redis implementation for offline/local resilience.
 * Supports TTL expiration, list operations, and pub/sub emulation.
 */
function createMemoryStore(): RedisLike {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const lists = new Map<string, string[]>();
  const pubsub = new EventEmitter();

  const isExpired = (key: string): boolean => {
    const entry = store.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key);
      return true;
    }
    return false;
  };

  return {
    async get(key: string): Promise<string | null> {
      if (isExpired(key)) return null;
      return store.get(key)?.value ?? null;
    },

    async set(key: string, value: string, ...args: any[]): Promise<any> {
      let expiresAt: number | undefined;
      for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === 'string' && args[i].toUpperCase() === 'EX' && args[i + 1]) {
          const seconds = Number(args[i + 1]);
          if (!isNaN(seconds)) expiresAt = Date.now() + seconds * 1000;
        } else if (typeof args[i] === 'string' && args[i].toUpperCase() === 'PX' && args[i + 1]) {
          const ms = Number(args[i + 1]);
          if (!isNaN(ms)) expiresAt = Date.now() + ms;
        }
      }
      store.set(key, { value: String(value), expiresAt });
      return 'OK';
    },

    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
        if (lists.delete(k)) count++;
      }
      return count;
    },

    async mget(keys: string[]): Promise<(string | null)[]> {
      return keys.map((k) => (isExpired(k) ? null : store.get(k)?.value ?? null));
    },

    async ping(): Promise<string> {
      return 'PONG';
    },

    async lpush(key: string, ...values: string[]): Promise<number> {
      const list = lists.get(key) || [];
      list.unshift(...values.map(String));
      lists.set(key, list);
      return list.length;
    },

    async ltrim(key: string, start: number, stop: number): Promise<any> {
      const list = lists.get(key) || [];
      const end = stop < 0 ? list.length + stop + 1 : stop + 1;
      lists.set(key, list.slice(start, end));
      return 'OK';
    },

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
      const list = lists.get(key) || [];
      const end = stop < 0 ? list.length + stop + 1 : stop + 1;
      return list.slice(start, end);
    },

    on(event: string, listener: (...args: any[]) => void) {
      pubsub.on(event, listener);
      return this;
    },

    async publish(channel: string, message: string): Promise<number> {
      pubsub.emit(channel, message);
      return 1;
    },

    async subscribe(_channel: string): Promise<any> {
      return 'OK';
    },

    scanStream(options: { match: string; count?: number }): NodeJS.EventEmitter {
      const emitter = new EventEmitter();
      setImmediate(() => {
        const regexStr = options.match.replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexStr}$`);
        const matches: string[] = [];
        for (const [k] of store) {
          if (!isExpired(k) && regex.test(k)) {
            matches.push(k);
          }
        }
        if (matches.length > 0) {
          emitter.emit('data', matches);
        }
        emitter.emit('end');
      });
      return emitter;
    },
  };
}

interface ManagedRedisHandle {
  name: string;
  client: Redis | null;
  healthy: boolean;
}

function createManagedClient(
  url: string,
  name: string,
  connectTimeoutMs: number
): ManagedRedisHandle {
  const handle: ManagedRedisHandle = { name, client: null, healthy: false };
  if (!url || url.includes('localhost:0')) {
    return handle;
  }

  try {
    const c = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: connectTimeoutMs,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if ((c as any)?._dnsFailed || times >= 4) {
          console.warn(
            `[Redis:${name}] Remote host unreachable; suppressing retries and falling back gracefully.`
          );
          return null;
        }
        return Math.min(1500, times * 400);
      },
    });

    c.on('connect', () => {
      handle.healthy = true;
      console.log(`Successfully connected to Upstash Redis (${name}).`);
    });

    c.on('ready', () => {
      handle.healthy = true;
    });

    c.on('close', () => {
      handle.healthy = false;
    });

    c.on('error', (error: any) => {
      handle.healthy = false;
      const msg = error?.message || String(error);
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        (c as any)._dnsFailed = true;
        if ((c as any)?._dnsWarned) return;
        (c as any)._dnsWarned = true;
        console.warn(`[Redis:${name}] Remote host unresolvable (${msg}). Using fallback.`);
      } else {
        console.warn(`[Redis:${name}] Client notice:`, msg);
      }
    });

    c.connect().catch(() => {
      handle.healthy = false;
    });

    handle.client = c;
  } catch (err: any) {
    console.warn(`[Redis:${name}] Initialization error:`, err?.message || err);
    handle.healthy = false;
  }

  return handle;
}

const memoryStore = createMemoryStore();
const primaryHandle = createManagedClient(env.upstashRedisUrl, 'primary', 5_000);
const backupHandle = createManagedClient(env.upstashBackupRedisUrl, 'backup', 6_000);

function createRoutedFacade(order: ManagedRedisHandle[]): RedisLike {
  const pickActive = (): Redis | null => {
    for (const h of order) {
      if (h.healthy && h.client) return h.client;
    }
    return null;
  };

  async function runChain<T>(
    op: (client: Redis) => Promise<T>,
    memOp: () => Promise<T>
  ): Promise<T> {
    for (const h of order) {
      if (h.healthy && h.client) {
        try {
          return await op(h.client);
        } catch {
          // Fail over to next client in chain
        }
      }
    }
    return memOp();
  }

  return {
    get: (key) => runChain((c) => c.get(key), () => memoryStore.get(key)),
    set: (key, value, ...args) =>
      runChain((c) => (c as any).set(key, value, ...args), () => memoryStore.set(key, value, ...args)),
    del: (...keys) => runChain((c) => c.del(...keys), () => memoryStore.del(...keys)),
    mget: (keys) => runChain((c) => c.mget(keys), () => memoryStore.mget(keys)),
    ping: () => runChain((c) => c.ping(), () => memoryStore.ping()),
    lpush: (key, ...values) => runChain((c) => c.lpush(key, ...values), () => memoryStore.lpush(key, ...values)),
    ltrim: (key, start, stop) => runChain((c) => c.ltrim(key, start, stop), () => memoryStore.ltrim(key, start, stop)),
    lrange: (key, start, stop) => runChain((c) => c.lrange(key, start, stop), () => memoryStore.lrange(key, start, stop)),
    on(event, listener) {
      for (const h of order) {
        if (h.client) {
          try { h.client.on(event, listener); } catch {}
        }
      }
      memoryStore.on(event, listener);
      return this;
    },
    publish: (channel, message) => runChain((c) => c.publish(channel, message), () => memoryStore.publish(channel, message)),
    subscribe: (channel) => runChain((c) => c.subscribe(channel), () => memoryStore.subscribe(channel)),
    scanStream(options) {
      const c = pickActive();
      if (c) {
        try { return c.scanStream(options); } catch {}
      }
      return memoryStore.scanStream(options);
    },
  };
}

/** Primary hot Redis facade: primary (South Africa) -> backup (US-Central) -> memory */
const redis: RedisLike = createRoutedFacade([primaryHandle, backupHandle]);

/** Offload & cloud backup Redis facade: backup (US-Central) -> primary (South Africa) -> memory */
export const backupRedis: RedisLike = createRoutedFacade([backupHandle, primaryHandle]);

export function getRedisTopologyStatus(): {
  primaryHealthy: boolean;
  backupHealthy: boolean;
  backupConfigured: boolean;
} {
  return {
    primaryHealthy: primaryHandle.healthy,
    backupHealthy: backupHandle.healthy,
    backupConfigured: Boolean(env.upstashBackupRedisUrl || env.upstashBackupRedisRestUrl),
  };
}

export function closeRedis(): void {
  for (const h of [primaryHandle, backupHandle]) {
    if (h.client) {
      try {
        h.client.disconnect(false);
      } catch {}
      h.healthy = false;
    }
  }
}

export default redis;
export { redis };
