/**
 * GET /api/news?category=general|forex|crypto|merger
 *
 * Returns up to 25 news items for the requested category.
 * Cache hit  → responds from Upstash Redis (fast, no Finnhub rate-limit usage).
 * Cache miss → fetches from Finnhub, stores in cache, then responds.
 * No Redis   → fetches from Finnhub directly on every request (graceful degradation).
 *
 * Authentication: requires a valid Firebase ID token in the Authorization header.
 */

const express = require('express')
const admin = require('firebase-admin')
const { getCachedNews, setCachedNews, isRedisAvailable } = require('../services/newsCache')
const { fetchMarketNews, VALID_CATEGORIES } = require('../services/newsFetcher')

const router = express.Router()

router.get('/', async (req, res) => {
  // --- Auth ---
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }
  try {
    await admin.auth().verifyIdToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // --- Input validation ---
  const rawCategory = req.query.category
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'general'
  const cacheKey = `news:${category}`

  // --- Cache hit ---
  const cached = await getCachedNews(cacheKey)
  if (cached) {
    return res.json({
      ok: true,
      source: 'cache',
      redisEnabled: isRedisAvailable(),
      category,
      items: cached,
    })
  }

  // --- Cache miss: fetch from Finnhub ---
  try {
    const items = await fetchMarketNews(category)
    await setCachedNews(cacheKey, items)
    return res.json({
      ok: true,
      source: 'api',
      redisEnabled: isRedisAvailable(),
      category,
      items,
    })
  } catch (err) {
    console.error('[GET /api/news] Finnhub fetch error:', err.message)
    return res.status(502).json({
      error: 'Failed to fetch news from upstream provider',
      details: err.message,
    })
  }
})

module.exports = router
