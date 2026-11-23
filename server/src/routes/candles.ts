import express from 'express';
import { toTwelveDataSymbol } from '../config/instruments';
import * as marketDataService from '../modules/market-data/marketDataService';
import * as candleCache from '../modules/market-data/candleCache';
import { queryCandles, upsertCandles } from '../modules/storage/sqliteDb';

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
 * Optional historical archive params: ?from=<unix>&to=<unix>&limit=300&source=sqlite
 */
router.get('/', async (req: any, res: any) => {
  const { symbol, timeframe, outputsize = 200, from, to, limit, source } = req.query;

  if (!symbol || !timeframe) {
    res.status(400).json({ error: 'symbol and timeframe query parameters are required.' });
    return;
  }

  const parsedOutputsize = parseInt(String(outputsize), 10) || 200;
  const rawSymbol = String(symbol);
  const rawTimeframe = String(timeframe);
  const tdSymbol = toTwelveDataSymbol(rawSymbol);
  const tdInterval = normalizeTdInterval(rawTimeframe);

  const fromTime = from !== undefined && from !== '' ? Number(from) : undefined;
  const toTime = to !== undefined && to !== '' ? Number(to) : undefined;
  const parsedLimit = limit !== undefined && limit !== '' ? Number(limit) : parsedOutputsize;

  try {
    if (
      source === 'sqlite' ||
      (fromTime !== undefined && Number.isFinite(fromTime)) ||
      (toTime !== undefined && Number.isFinite(toTime))
    ) {
      const archived = queryCandles({
        symbol: rawSymbol,
        timeframe: rawTimeframe,
        fromTime: Number.isFinite(fromTime) ? fromTime : undefined,
        toTime: Number.isFinite(toTime) ? toTime : undefined,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 300,
      });
      res.setHeader('X-Candle-Source', 'sqlite-archive');
      res.json(archived);
      return;
    }

    const stitchedLimit =
      limit !== undefined && limit !== '' && Number.isFinite(parsedLimit)
        ? Math.min(5000, Math.max(1, parsedLimit))
        : Math.min(5000, Math.max(parsedOutputsize, 1000));

    let cachedCandles = await candleCache.getCachedCandles(rawSymbol, rawTimeframe, parsedOutputsize);
    if (!cachedCandles && (tdSymbol !== rawSymbol || tdInterval !== rawTimeframe)) {
      cachedCandles = await candleCache.getCachedCandles(tdSymbol, tdInterval, parsedOutputsize);
    }

    if (cachedCandles) {
      try {
        upsertCandles(rawSymbol, rawTimeframe, cachedCandles);
      } catch {}
      let stitched: marketDataService.MarketCandle[] = [];
      try {
        stitched = queryCandles({ symbol: rawSymbol, timeframe: rawTimeframe, limit: stitchedLimit });
      } catch {}
      if (stitched.length >= cachedCandles.length && stitched.length > 0) {
        res.setHeader('X-Candle-Source', 'sqlite-stitched-cache');
        res.json(stitched);
      } else {
        res.setHeader('X-Candle-Source', 'redis-cache');
        res.json(cachedCandles);
      }
      return;
    }

    try {
      const candles = await marketDataService.fetchCandles(rawSymbol, rawTimeframe, parsedOutputsize);
      await candleCache.cacheCandles(tdSymbol, tdInterval, candles, parsedOutputsize);
      if (tdSymbol !== rawSymbol || tdInterval !== rawTimeframe) {
        await candleCache.cacheCandles(rawSymbol, rawTimeframe, candles, parsedOutputsize);
      }
      let stitched: marketDataService.MarketCandle[] = [];
      try {
        stitched = queryCandles({ symbol: rawSymbol, timeframe: rawTimeframe, limit: stitchedLimit });
      } catch {}
      if (stitched.length >= candles.length && stitched.length > 0) {
        res.setHeader('X-Candle-Source', 'sqlite-stitched');
        res.json(stitched);
      } else {
        res.setHeader('X-Candle-Source', 'live-provider');
        res.json(candles);
      }
      return;
    } catch (fetchErr: any) {
      const fallback = candleCache.getArchivedCandlesFallback(rawSymbol, rawTimeframe, stitchedLimit);
      if (fallback.length > 0) {
        res.setHeader('X-Candle-Source', 'sqlite-fallback');
        res.json(fallback);
        return;
      }
      throw fetchErr;
    }
  } catch (error: any) {
    console.error(`Error getting candles for ${rawSymbol} on ${rawTimeframe}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve candle data.' });
  }
});

export default router;
