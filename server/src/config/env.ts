import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let envLoaded = false;

export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;

  const candidates = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      break;
    }
  }
  dotenv.config();
}

loadEnv();

export interface ServerEnv {
  port: number;
  nodeEnv: string;
  allowedOrigins: string[];
  twelvedataKeys: string[];
  finnhubApiKey: string;
  finnhubApiKeys: string[];
  upstashRedisUrl: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  upstashBackupRedisUrl: string;
  upstashBackupRedisRestUrl: string;
  upstashBackupRedisRestToken: string;
  newsServiceUrl: string;
  firebaseServiceAccount: string;
}

export function getEnv(): ServerEnv {
  loadEnv();

  const rawKeys = [
    process.env.TWELVEDATA_API_KEY,
    process.env.TWELVEDATA_API_KEY_2,
    process.env.TWELVEDATA_API_KEY_3,
    process.env.TWELVEDATA_API_KEY_4,
    process.env.TWELVEDATA_API_KEY_5,
  ]
    .map((k) => (k || '').trim())
    .filter(Boolean);

  const twelvedataKeys = Array.from(new Set(rawKeys));

  const rawFinnhubKeys = [
    process.env.FINNHUB_API_KEY,
    process.env.FINNHUB_API_KEY_2,
    process.env.FINNHUB_API_KEY_3,
    process.env.FINNHUB_API_KEY_4,
    process.env.VITE_FINNHUB_API_KEY,
    process.env.VITE_FINNHUB_API_KEY_2,
  ]
    .map((k) => (k || '').trim())
    .filter(Boolean);

  const finnhubApiKeys = Array.from(new Set(rawFinnhubKeys));

  const rawAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = rawAllowedOrigins.length > 0 ? rawAllowedOrigins : ['*'];

  return {
    port: Number(process.env.PORT) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    allowedOrigins,
    twelvedataKeys,
    finnhubApiKey: finnhubApiKeys[0] || '',
    finnhubApiKeys,
    upstashRedisUrl: (process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    upstashRedisRestUrl: (process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    upstashRedisRestToken: (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
    upstashBackupRedisUrl: (process.env.UPSTASH_BACKUP_REDIS_URL || '').trim(),
    upstashBackupRedisRestUrl: (process.env.UPSTASH_BACKUP_REDIS_REST_URL || '').trim(),
    upstashBackupRedisRestToken: (process.env.UPSTASH_BACKUP_REDIS_REST_TOKEN || '').trim(),
    newsServiceUrl: (process.env.NEWS_SERVICE_URL || '').trim(),
    firebaseServiceAccount: (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim(),
  };
}

export const env: ServerEnv = getEnv();

/**
 * Checks whether a request Origin is permitted by the configured allow-list.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[] = env.allowedOrigins
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;

  try {
    const parsed = new URL(origin);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    // Non-URL origins fall through to exact string comparison
  }

  const normalized = origin.replace(/\/+$/, '');
  return allowedOrigins.some((allowed) => allowed.replace(/\/+$/, '') === normalized);
}

/**
 * Builds a cors/socket.io origin matcher from allowedOrigins.
 */
export function resolveCorsOrigin(
  allowedOrigins: string[] = env.allowedOrigins
): string | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  if (allowedOrigins.includes('*')) {
    return '*';
  }
  return (origin, callback) => {
    callback(null, isOriginAllowed(origin, allowedOrigins));
  };
}
