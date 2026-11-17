import { env } from '../../config/env';

const NEWS_TTL_SECONDS = 15 * 60;

let upstashRedis: any = null;

if (env.upstashRedisRestUrl && env.upstashRedisRestToken) {
  try {
    const { Redis } = require('@upstash/redis');
    upstashRedis = new Redis({
      url: env.upstashRedisRestUrl,
      token: env.upstashRedisRestToken,
    });
    console.log('[news-cache] Connected to Upstash Redis');
  } catch (err: any) {
    console.warn('[news-cache] Failed to initialise Upstash Redis:', err.message);
    upstashRedis = null;
  }
} else {
  console.log('[news-cache] No Redis credentials — falling back to direct Finnhub calls');
}

export async function getCachedNews(key: string): Promise<any[] | null> {
  if (!upstashRedis) return null;
  try {
    const value = await upstashRedis.get(key);
    if (!value) return null;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (err: any) {
    console.warn('[news-cache] GET failed, falling through:', err.message);
    return null;
  }
}

export async function setCachedNews(key: string, data: any[]): Promise<void> {
  if (!upstashRedis) return;
  try {
    await upstashRedis.set(key, JSON.stringify(data), { ex: NEWS_TTL_SECONDS });
  } catch (err: any) {
    console.warn('[news-cache] SET failed:', err.message);
  }
}

export async function invalidateCachedNews(key: string): Promise<void> {
  if (!upstashRedis) return;
  try {
    await upstashRedis.del(key);
  } catch (err: any) {
    console.warn('[news-cache] DEL failed:', err.message);
  }
}

export function isRedisAvailable(): boolean {
  return !!upstashRedis;
}
