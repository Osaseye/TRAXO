const express = require('express');
const marketDataService = require('../services/marketDataService');
const candleCache = require('../services/candleCache');

const router = express.Router();

/**
 * GET /api/candles
 * Fetches candle data for a specific symbol and timeframe.
 * This endpoint is designed for the chart replay feature.
 */
router.get('/', async (req, res) => {
  const { symbol, timeframe, outputsize = 200 } = req.query;

  if (!symbol || !timeframe) {
    return res.status(400).json({ message: 'Symbol and timeframe are required query parameters.' });
  }

  try {
    const parsedOutputsize = parseInt(outputsize, 10);
    // 1. Check the cache first
    let candles = await candleCache.getCachedCandles(symbol, timeframe, parsedOutputsize);

    // 2. If not in cache, fetch from the API and cache the result
    if (!candles) {
      console.log(`Cache miss for ${symbol}:${timeframe} (size ${parsedOutputsize}) via API request. Fetching...`);
      candles = await marketDataService.fetchCandles(symbol, timeframe, parsedOutputsize);
      // Cache the freshly fetched data
      await candleCache.cacheCandles(symbol, timeframe, candles, parsedOutputsize);
    }

    res.json(candles);

  } catch (error) {
    console.error(`Error fetching candle data for ${symbol}:${timeframe}:`, error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
