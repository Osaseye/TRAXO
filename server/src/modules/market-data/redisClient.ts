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

const REDIS_URL = env.upstashRedisUrl;

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

    async subscribe(channel: string): Promise<any> {
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

const memoryStore = createMemoryStore();
let isRemoteHealthy = false;
let client: Redis | null = null;

if (REDIS_URL && !REDIS_URL.includes('localhost:0')) {
  try {
    client = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times >= 2) {
          console.warn('[Redis] Remote Upstash host unreachable. Suppressing reconnection loop and using in-memory store.');
          return null; // Stop reconnecting after 2 tries
        }
        return 500;
      },
    });

    client.on('connect', () => {
      isRemoteHealthy = true;
      console.log('Successfully connected to Upstash Redis.');
    });

    client.on('ready', () => {
      isRemoteHealthy = true;
    });

    client.on('error', (error: any) => {
      isRemoteHealthy = false;
      const msg = error?.message || String(error);
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        // Suppress DNS failure spam; warn once gracefully
        if ((client as any)?._dnsWarned) return;
        (client as any)._dnsWarned = true;
        console.warn(`[Redis] Remote host unresolvable (${msg}). Seamlessly using in-memory fallback.`);
      } else {
        console.warn('[Redis] Client notice:', msg);
      }
    });

    // Attempt gentle connect without unhandled rejection
    client.connect().catch(() => {
      isRemoteHealthy = false;
    });
  } catch (err: any) {
    console.warn('[Redis] Initialization error, using in-memory cache:', err?.message || err);
    isRemoteHealthy = false;
  }
} else {
  console.log('[Redis] No remote URL configured; using high-fidelity in-memory cache.');
}

/**
 * Resilient Redis facade: routes to live remote Redis when healthy,
 * or effortlessly to the in-memory store when unreachable.
 */
const redis: RedisLike = {
  async get(key: string) {
    if (isRemoteHealthy && client) {
      try { return await client.get(key); } catch { return memoryStore.get(key); }
    }
    return memoryStore.get(key);
  },

  async set(key: string, value: string, ...args: any[]) {
    if (isRemoteHealthy && client) {
      try { return await (client as any).set(key, value, ...args); } catch { return memoryStore.set(key, value, ...args); }
    }
    return memoryStore.set(key, value, ...args);
  },

  async del(...keys: string[]) {
    if (isRemoteHealthy && client) {
      try { return await client.del(...keys); } catch { return memoryStore.del(...keys); }
    }
    return memoryStore.del(...keys);
  },

  async mget(keys: string[]) {
    if (isRemoteHealthy && client) {
      try { return await client.mget(keys); } catch { return memoryStore.mget(keys); }
    }
    return memoryStore.mget(keys);
  },

  async ping() {
    if (isRemoteHealthy && client) {
      try { return await client.ping(); } catch { return memoryStore.ping(); }
    }
    return memoryStore.ping();
  },

  async lpush(key: string, ...values: string[]) {
    if (isRemoteHealthy && client) {
      try { return await client.lpush(key, ...values); } catch { return memoryStore.lpush(key, ...values); }
    }
    return memoryStore.lpush(key, ...values);
  },

  async ltrim(key: string, start: number, stop: number) {
    if (isRemoteHealthy && client) {
      try { return await client.ltrim(key, start, stop); } catch { return memoryStore.ltrim(key, start, stop); }
    }
    return memoryStore.ltrim(key, start, stop);
  },

  async lrange(key: string, start: number, stop: number) {
    if (isRemoteHealthy && client) {
      try { return await client.lrange(key, start, stop); } catch { return memoryStore.lrange(key, start, stop); }
    }
    return memoryStore.lrange(key, start, stop);
  },

  on(event: string, listener: (...args: any[]) => void) {
    if (client) {
      try { client.on(event, listener); } catch {}
    }
    memoryStore.on(event, listener);
    return this;
  },

  async publish(channel: string, message: string) {
    if (isRemoteHealthy && client) {
      try { return await client.publish(channel, message); } catch { return memoryStore.publish(channel, message); }
    }
    return memoryStore.publish(channel, message);
  },

  async subscribe(channel: string) {
    if (isRemoteHealthy && client) {
      try { return await client.subscribe(channel); } catch { return memoryStore.subscribe(channel); }
    }
    return memoryStore.subscribe(channel);
  },

  scanStream(options: { match: string; count?: number }) {
    if (isRemoteHealthy && client) {
      try { return client.scanStream(options); } catch { return memoryStore.scanStream(options); }
    }
    return memoryStore.scanStream(options);
  },
};

export default redis;
export { redis };
