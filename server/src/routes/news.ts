import express from 'express';
import { admin } from '../modules/market-data/firebaseAdmin';
import {
  fetchMarketNews,
  getCachedNews,
  setCachedNews,
  VALID_CATEGORIES,
} from '../services/news/newsEngine';

const router = express.Router();

/**
 * GET /api/news?category=general
 * Protected by Firebase Auth (requires Authorization: Bearer <idToken>).
 * Checks Upstash Redis cache first; falls back to live Finnhub API on cache miss.
 */
router.get('/', async (req: any, res: any) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header' });
    return;
  }

  const idToken = authHeader.slice(7).trim();
  try {
    await admin.auth().verifyIdToken(idToken);
  } catch (err: any) {
    console.warn('[news route] Invalid Firebase ID token:', err.message);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }

  const rawCategory = String(req.query.category || 'general').toLowerCase();
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'general';
  const cacheKey = `news:${category}`;

  try {
    const cached = await getCachedNews(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ category, items: cached, cachedAt: Date.now() });
      return;
    }

    const items = await fetchMarketNews(category);
    await setCachedNews(cacheKey, items);
    res.setHeader('X-Cache', 'MISS');
    res.json({ category, items, cachedAt: Date.now() });
  } catch (err: any) {
    console.error(`[news route] Failed to load news for "${category}":`, err.message);
    res.status(500).json({ error: err.message || 'Failed to load market news' });
  }
});

export default router;
