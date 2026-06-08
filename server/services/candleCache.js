const redis = require('./redisClient'); // Assuming a shared Redis client setup

/**
 * Generates a standardized Redis key for caching candle data.
 * @param {string} symbol - The ticker symbol.
 * @param {string} interval - The candle interval.
 * @returns {string} The Redis key.
 */
const getCandleKey = (symbol, interval) => `candles:${symbol}:${interval}`;

/**
 * Retrieves candle data from the Redis cache.
 *
 * @param {string} symbol - The ticker symbol.
 * @param {string} interval - The candle interval.
 * @returns {Promise<Array<object>|null>} A promise that resolves to the cached candle array, or null if not found.
 */
async function getCachedCandles(symbol, interval) {
  const key = getCandleKey(symbol, interval);
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
async function cacheCandles(symbol, interval, candles) {
  const key = getCandleKey(symbol, interval);
  // As per our plan, TTL is 2x the candle interval to ensure data freshness and overlap.
  // Example: '1min' -> 120 seconds, '1h' -> 7200 seconds.
  const intervalMinutes = parseInt(interval.replace('min', '').replace('h', '') * (interval.includes('h') ? 60 : 1));
  const ttlSeconds = intervalMinutes * 60 * 2;

  if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
    console.warn(`Could not determine a valid TTL for interval: ${interval}. Cache will not be set.`);
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
