const redis = require('./redisClient'); // Assuming a shared Redis client setup

/**
 * Generates a standardized Redis key for caching candle data.
 * @param {string} symbol - The ticker symbol.
 * @param {string} interval - The candle interval.
 * @param {number} outputsize - The number of candles requested.
 * @returns {string} The Redis key.
 */
const getCandleKey = (symbol, interval, outputsize = 200) => `candles:${symbol}:${interval}:${outputsize}`;

/**
 * Retrieves candle data from the Redis cache.
 *
 * @param {string} symbol - The ticker symbol.
 * @param {string} interval - The candle interval.
 * @param {number} outputsize - The number of candles requested.
 * @returns {Promise<Array<object>|null>} A promise that resolves to the cached candle array, or null if not found.
 */
async function getCachedCandles(symbol, interval, outputsize = 200) {
  const key = getCandleKey(symbol, interval, outputsize);
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Error getting cached candles for ${key} from Redis:`, error);
    return null; // On error, treat as a cache miss
  }
}

/**
 * Caches candle data in Redis with a Time-to-Live (TTL).
 *
 * @param {string} symbol - The ticker symbol.
 * @param {string} interval - The candle interval.
 * @param {Array<object>} candles - The array of candle data to cache.
 */
/**
 * Converts any interval string to its duration in minutes.
 * Handles: 1m, 5m, 15m, 1h, 4h, 1H, 4H, 1min, 5min, 15min, 1day, 1d, etc.
 * Returns NaN if the format is unrecognised.
 *
 * @param {string} interval
 * @returns {number} Duration in minutes
 */
function intervalToMinutes(interval) {
  const s = interval.trim().toLowerCase();

  // Match: 1m, 5m, 15m, 1min, 5min, 15min
  const minuteMatch = s.match(/^(\d+)\s*m(?:in)?$/);
  if (minuteMatch) return parseInt(minuteMatch[1], 10);

  // Match: 1h, 4h
  const hourMatch = s.match(/^(\d+)\s*h$/);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

  // Match: 1day, 1d
  const dayMatch = s.match(/^(\d+)\s*d(?:ay)?$/);
  if (dayMatch) return parseInt(dayMatch[1], 10) * 60 * 24;

  // Match: 1week, 1w
  const weekMatch = s.match(/^(\d+)\s*w(?:eek)?$/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 60 * 24 * 7;

  return NaN;
}

async function cacheCandles(symbol, interval, candles, outputsize = 200) {
  const key = getCandleKey(symbol, interval, outputsize);

  // TTL = 2x the candle interval so data stays fresh with some overlap.
  // e.g. 5m candles -> 10 min TTL, 1h candles -> 2h TTL, 4H candles -> 8h TTL
  const intervalMinutes = intervalToMinutes(interval);
  const ttlSeconds = intervalMinutes * 60 * 2;

  if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
    console.warn(`Could not determine a valid TTL for interval: "${interval}". Cache will not be set.`);
    return;
  }

  try {
    // Use SET with EX to perform an atomic set-with-expiration
    await redis.set(key, JSON.stringify(candles), 'EX', ttlSeconds);
  } catch (error) {
    console.error(`Error caching candles for ${key} in Redis:`, error);
  }
}

module.exports = {
  getCachedCandles,
  cacheCandles,
};
