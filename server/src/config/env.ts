import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let envLoaded = false;

export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;

  const candidates = [
    path.resolve(__dirname, '../../.env'),
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
  twelvedataKeys: string[];
  finnhubApiKey: string;
  upstashRedisUrl: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  newsServiceUrl: string;
  firebaseServiceAccount: string;
  metaApiToken: string;
  metaApiAccountId: string;
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

  return {
    port: Number(process.env.PORT) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    twelvedataKeys,
    finnhubApiKey: (process.env.FINNHUB_API_KEY || process.env.VITE_FINNHUB_API_KEY || '').trim(),
    upstashRedisUrl: (process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    upstashRedisRestUrl: (process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    upstashRedisRestToken: (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
    newsServiceUrl: (process.env.NEWS_SERVICE_URL || '').trim(),
    firebaseServiceAccount: (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim(),
    metaApiToken: (process.env.METAAPI_TOKEN || '').trim(),
    metaApiAccountId: (process.env.METAAPI_ACCOUNT_ID || '').trim(),
  };
}

export const env: ServerEnv = getEnv();
