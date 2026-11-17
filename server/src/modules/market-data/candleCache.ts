import redis from './redisClient';
import type { MarketCandle } from './marketDataService';

export const getCandleKey = (symbol: string, interval: string, outputsize = 200): string =>
  `candles:${symbol}:${interval}:${outputsize}`;

export function intervalToMinutes(interval: string): number {
  const s = interval.trim().toLowerCase();

  const minuteMatch = s.match(/^(\d+)\s*m(?:in)?$/);
  if (minuteMatch) return parseInt(minuteMatch[1], 10);

  const hourMatch = s.match(/^(\d+)\s*h$/);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

  const dayMatch = s.match(/^(\d+)\s*d(?:ay)?$/);
  if (dayMatch) return parseInt(dayMatch[1], 10) * 60 * 24;

  const weekMatch = s.match(/^(\d+)\s*w(?:eek)?$/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 60 * 24 * 7;

  return NaN;
}

export async function getCachedCandles(
  symbol: string,
  interval: string,
  outputsize = 200
): Promise<MarketCandle[] | null> {
  const key = getCandleKey(symbol, interval, outputsize);
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Error getting cached candles for ${key} from Redis:`, error);
    return null;
  }
}

export async function cacheCandles(
  symbol: string,
  interval: string,
  candles: MarketCandle[],
  outputsize = 200
): Promise<void> {
  const key = getCandleKey(symbol, interval, outputsize);
  const intervalMinutes = intervalToMinutes(interval);
  const ttlSeconds = intervalMinutes * 60 * 2;

  if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
    console.warn(`Could not determine a valid TTL for interval: "${interval}". Cache will not be set.`);
    return;
  }

  try {
    await redis.set(key, JSON.stringify(candles), 'EX', ttlSeconds);
  } catch (error) {
    console.error(`Error caching candles for ${key} in Redis:`, error);
  }
}
