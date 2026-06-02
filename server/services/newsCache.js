/**
 * News cache backed by Upstash Redis.
 * Gracefully degrades to no-op (direct API calls) when env vars are absent.
 */

const NEWS_TTL_SECONDS = 15 * 60 // 15 minutes

let redis = null

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const { Redis } = require('@upstash/redis')
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    console.log('[news-cache] Connected to Upstash Redis')
  } catch (err) {
    console.warn('[news-cache] Failed to initialise Upstash Redis:', err.message)
    redis = null
  }
} else {
  console.log('[news-cache] No Redis credentials — falling back to direct Finnhub calls')
}

/**
 * Returns cached news array for the given key, or null on miss / error.
 * @param {string} key
 * @returns {Promise<Array|null>}
 */
async function getCachedNews(key) {
  if (!redis) return null
  try {
    const value = await redis.get(key)
    if (!value) return null
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch (err) {
    console.warn('[news-cache] GET failed, falling through:', err.message)
    return null
  }
}

/**
 * Stores news array under the given key with a 15-minute TTL.
 * Silent no-op when Redis is unavailable.
 * @param {string} key
 * @param {Array} data
 */
async function setCachedNews(key, data) {
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(data), { ex: NEWS_TTL_SECONDS })
  } catch (err) {
    console.warn('[news-cache] SET failed:', err.message)
  }
}

/**
 * Deletes a specific cache key (e.g. to force-refresh a category).
 * @param {string} key
 */
async function invalidateCachedNews(key) {
  if (!redis) return
  try {
    await redis.del(key)
  } catch (err) {
    console.warn('[news-cache] DEL failed:', err.message)
  }
}

module.exports = {
  getCachedNews,
  setCachedNews,
  invalidateCachedNews,
  isRedisAvailable: () => !!redis,
}
