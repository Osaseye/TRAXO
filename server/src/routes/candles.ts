import express from 'express';
import { toTwelveDataSymbol } from '../config/instruments';
import * as marketDataService from '../modules/market-data/marketDataService';
import * as candleCache from '../modules/market-data/candleCache';

const router = express.Router();

function normalizeTdInterval(tf: string): string {
  const lower = String(tf || '').trim().toLowerCase();
  if (lower === '1m') return '1min';
  if (lower === '5m') return '5min';
  if (lower === '15m') return '15min';
  if (lower === '30m') return '30min';
  if (lower === '1d') return '1day';
  return lower;
}

/**
 * GET /api/candles?symbol=EURUSD&timeframe=15min&outputsize=200
 * Checks Redis cache first (raw and TwelveData normalized key) before hitting TwelveData.
 */
router.get('/', async (req: any, res: any) => {
  const { symbol, timeframe, outputsize = 200 } = req.query;

  if (!symbol || !timeframe) {
    res.status(400).json({ error: 'symbol and timeframe query parameters are required.' });
    return;
  }

  const parsedOutputsize = parseInt(String(outputsize), 10) || 200;
  const rawSymbol = String(symbol);
  const rawTimeframe = String(timeframe);
  const tdSymbol = toTwelveDataSymbol(rawSymbol);
  const tdInterval = normalizeTdInterval(rawTimeframe);

  try {
    let cachedCandles = await candleCache.getCachedCandles(rawSymbol, rawTimeframe, parsedOutputsize);
    if (!cachedCandles && (tdSymbol !== rawSymbol || tdInterval !== rawTimeframe)) {
      cachedCandles = await candleCache.getCachedCandles(tdSymbol, tdInterval, parsedOutputsize);
    }

    if (cachedCandles) {
      res.json(cachedCandles);
      return;
    }

    const candles = await marketDataService.fetchCandles(rawSymbol, rawTimeframe, parsedOutputsize);

    await candleCache.cacheCandles(tdSymbol, tdInterval, candles, parsedOutputsize);
    if (tdSymbol !== rawSymbol || tdInterval !== rawTimeframe) {
      await candleCache.cacheCandles(rawSymbol, rawTimeframe, candles, parsedOutputsize);
    }

    res.json(candles);
  } catch (error: any) {
    console.error(`Error getting candles for ${rawSymbol} on ${rawTimeframe}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve candle data.' });
  }
});

export default router;
