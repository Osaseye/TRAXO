/**
 * Scheduled news pre-fetcher.
 * - Runs once immediately on server start to warm the cache.
 * - Refreshes every 15 minutes during market hours Mon–Fri (07:00–22:00 UTC).
 * - Full daily refresh at 07:00 UTC (European pre-market open).
 *
 * node-cron is only loaded when scheduled mode is enabled; if the package is
 * absent (e.g. during CI) the module still exports prefetchAllCategories for
 * manual use.
 */

const { fetchMarketNews } = require('./newsFetcher')
const { setCachedNews, isRedisAvailable } = require('./newsCache')

const CATEGORIES = ['general', 'forex', 'crypto', 'merger']

/**
 * Fetches and caches all news categories sequentially.
 * Errors per-category are logged but do not abort remaining categories.
 */
async function prefetchAllCategories() {
  if (!isRedisAvailable()) {
    // No point pre-fetching when there is nowhere to cache the result.
    return
  }
  console.log('[news-poller] Pre-warming news cache for all categories...')
  for (const category of CATEGORIES) {
    try {
      const items = await fetchMarketNews(category)
      await setCachedNews(`news:${category}`, items)
      console.log(`[news-poller] Cached ${items.length} items — ${category}`)
    } catch (err) {
      console.warn(`[news-poller] Failed to prefetch "${category}":`, err.message)
    }
    // Small delay between Finnhub calls to stay within rate limits.
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('[news-poller] Cache warm-up complete')
}

/**
 * Starts the cron schedules and fires an initial warm-up.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
let started = false
function startNewsPoller() {
  if (started) return
  started = true

  let cron
  try {
    cron = require('node-cron')
  } catch {
    console.warn('[news-poller] node-cron not installed — scheduled polling disabled')
    void prefetchAllCategories()
    return
  }

  // Full refresh daily at 07:00 UTC (European pre-market).
  cron.schedule('0 7 * * *', () => {
    void prefetchAllCategories()
  })

  // Rolling 15-minute refresh during market hours Mon–Fri 07:00–22:00 UTC.
  cron.schedule('*/15 7-22 * * 1-5', () => {
    void prefetchAllCategories()
  })

  console.log('[news-poller] Cron schedules registered (07:00 UTC daily + every 15 min weekday market hours)')

  // Immediate warm-up on startup.
  void prefetchAllCategories()
}

module.exports = { startNewsPoller, prefetchAllCategories }
