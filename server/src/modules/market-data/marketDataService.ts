import https from 'https';
import { getKey, markKeyRateLimited } from './keyRotator';
import { getInstrumentSpec, normalizeSymbol, toTwelveDataSymbol } from '../../config/instruments';
import { upsertCandles } from '../storage/sqliteDb';

const BASE_URL = 'api.twelvedata.com';

export interface MarketCandle {
  timestamp: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function normalizeTwelveDataInterval(interval: string): string {
  const lower = String(interval || '').trim().toLowerCase();
  if (lower === '1m') return '1min';
  if (lower === '5m') return '5min';
  if (lower === '15m') return '15min';
  if (lower === '30m') return '30min';
  if (lower === '1d') return '1day';
  return lower;
}

export interface FetchCandlesOptions {
  startDate?: string;
  endDate?: string;
  archive?: boolean;
}

function _doFetch(
  tdSymbol: string,
  tdInterval: string,
  outputsize: number,
  apiKey: string,
  options?: FetchCandlesOptions
): Promise<MarketCandle[]> {
  return new Promise((resolve, reject) => {
    const paramObj: Record<string, string> = {
      symbol: tdSymbol,
      interval: tdInterval,
      outputsize: String(outputsize),
      apikey: apiKey,
      timezone: 'UTC',
    };
    if (options?.startDate) paramObj.start_date = options.startDate;
    if (options?.endDate) paramObj.end_date = options.endDate;

    const params = new URLSearchParams(paramObj);

    const reqOptions = {
      hostname: BASE_URL,
      path: `/time_series?${params.toString()}`,
      method: 'GET',
      timeout: 10000,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode === 429) {
            const err: any = new Error(`TwelveData rate limit (HTTP 429) for key ${apiKey.slice(0, 6)}...`);
            err.code = 429;
            return reject(err);
          }

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`TwelveData API responded with status ${res.statusCode}: ${data}`));
          }

          const parsed = JSON.parse(data);

          if (parsed.code === 429 || (parsed.status === 'error' && /credit|limit/i.test(parsed.message || ''))) {
            const err: any = new Error(`TwelveData rate limit (JSON body): ${parsed.message}`);
            err.code = 429;
            return reject(err);
          }

          if (parsed.status === 'error' || !parsed.values) {
            return reject(
              new Error(`TwelveData API error for ${tdSymbol}: ${parsed.message || 'No values in response'}`)
            );
          }

          const candles: MarketCandle[] = parsed.values
            .map((v: any) => ({
              timestamp: new Date(v.datetime + 'Z').toISOString(),
              time: Math.floor(new Date(v.datetime + 'Z').getTime() / 1000),
              open: parseFloat(v.open),
              high: parseFloat(v.high),
              low: parseFloat(v.low),
              close: parseFloat(v.close),
              volume: v.volume ? parseInt(v.volume, 10) : 0,
            }))
            .reverse();

          resolve(candles);
        } catch (e: any) {
          reject(new Error(`Failed to parse TwelveData JSON response: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('TwelveData HTTPS request timed out after 10s'));
    });

    req.on('error', (e: Error) => {
      reject(new Error(`Node.js HTTPS request failed: ${e.message}`));
    });

    req.end();
  });
}

function resolveYahooIntervalAndRange(interval: string): {
  yInterval: string;
  yRange: string;
  aggregate4h: boolean;
} {
  const lower = String(interval || '15min').trim().toLowerCase();
  if (lower === '1m' || lower === '1min') return { yInterval: '1m', yRange: '5d', aggregate4h: false };
  if (lower === '5m' || lower === '5min') return { yInterval: '5m', yRange: '5d', aggregate4h: false };
  if (lower === '15m' || lower === '15min') return { yInterval: '15m', yRange: '1mo', aggregate4h: false };
  if (lower === '30m' || lower === '30min') return { yInterval: '30m', yRange: '1mo', aggregate4h: false };
  if (lower === '1h' || lower === '60m') return { yInterval: '1h', yRange: '3mo', aggregate4h: false };
  if (lower === '4h' || lower === '240m') return { yInterval: '1h', yRange: '6mo', aggregate4h: true };
  if (lower === '1d' || lower === '1day') return { yInterval: '1d', yRange: '2y', aggregate4h: false };
  return { yInterval: '15m', yRange: '1mo', aggregate4h: false };
}

function aggregateCandlesTo4H(bars: MarketCandle[]): MarketCandle[] {
  const buckets = new Map<number, MarketCandle>();
  for (const bar of bars) {
    const bucketTime = Math.floor(bar.time / 14_400) * 14_400;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        timestamp: new Date(bucketTime * 1000).toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

function _doYahooFetch(yahooSymbol: string, yInterval: string, yRange: string): Promise<MarketCandle[]> {
  return new Promise((resolve, reject) => {
    const urlPath = `/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${encodeURIComponent(yInterval)}&range=${encodeURIComponent(yRange)}`;
    const req = https.get(
      {
        hostname: 'query1.finance.yahoo.com',
        path: urlPath,
        method: 'GET',
        timeout: 10_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TRAXO/1.0)',
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              return reject(new Error(`Yahoo Finance HTTP ${res.statusCode} for ${yahooSymbol}`));
            }
            const parsed = JSON.parse(data);
            const result = parsed?.chart?.result?.[0];
            const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
            const quote = result?.indicators?.quote?.[0] || {};
            const opens: Array<number | null> = quote.open || [];
            const highs: Array<number | null> = quote.high || [];
            const lows: Array<number | null> = quote.low || [];
            const closes: Array<number | null> = quote.close || [];
            const volumes: Array<number | null> = quote.volume || [];

            const bars: MarketCandle[] = [];
            for (let i = 0; i < timestamps.length; i++) {
              const t = Number(timestamps[i]);
              const o = opens[i];
              const h = highs[i];
              const l = lows[i];
              const c = closes[i];
              if (
                !Number.isFinite(t) ||
                o === null || o === undefined || !Number.isFinite(Number(o)) ||
                h === null || h === undefined || !Number.isFinite(Number(h)) ||
                l === null || l === undefined || !Number.isFinite(Number(l)) ||
                c === null || c === undefined || !Number.isFinite(Number(c))
              ) {
                continue;
              }
              const vol = volumes[i];
              bars.push({
                time: Math.floor(t),
                timestamp: new Date(Math.floor(t) * 1000).toISOString(),
                open: Number(Number(o).toFixed(2)),
                high: Number(Number(h).toFixed(2)),
                low: Number(Number(l).toFixed(2)),
                close: Number(Number(c).toFixed(2)),
                volume: vol !== null && vol !== undefined && Number.isFinite(Number(vol)) ? Math.round(Number(vol)) : 0,
              });
            }
            bars.sort((a, b) => a.time - b.time);
            resolve(bars);
          } catch (e: any) {
            reject(new Error(`Failed to parse Yahoo Finance response for ${yahooSymbol}: ${e.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Yahoo Finance request timed out for ${yahooSymbol}`));
    });
    req.on('error', (e: Error) => {
      reject(new Error(`Yahoo Finance network error for ${yahooSymbol}: ${e.message}`));
    });
  });
}

export async function fetchYahooFuturesCandles(
  interval: string,
  outputsize = 200
): Promise<MarketCandle[]> {
  const { yInterval, yRange, aggregate4h } = resolveYahooIntervalAndRange(interval);
  const candidates = ['MNQ=F', 'NQ=F'];
  let lastErr: Error | null = null;

  for (const ticker of candidates) {
    try {
      let bars = await _doYahooFetch(ticker, yInterval, yRange);
      if (aggregate4h) {
        bars = aggregateCandlesTo4H(bars);
      }
      if (bars.length > 0) {
        return bars.slice(-Math.max(1, outputsize));
      }
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[marketData] Yahoo futures fallback notice for ${ticker}:`, lastErr.message);
    }
  }

  throw lastErr || new Error('Failed to retrieve MNQ/NQ futures candles from Yahoo Finance');
}

export async function fetchCandles(
  symbol: string,
  interval: string,
  outputsize = 200,
  options?: FetchCandlesOptions
): Promise<MarketCandle[]> {
  const canonical = normalizeSymbol(symbol);
  const spec = getInstrumentSpec(canonical);

  if (spec.assetType === 'FUTURES') {
    const candles = await fetchYahooFuturesCandles(interval, outputsize);
    if (options?.archive !== false && candles.length > 0) {
      try {
        upsertCandles(canonical, interval, candles);
      } catch {}
    }
    return candles;
  }

  const MAX_RETRIES = 5;
  const tdSymbol = toTwelveDataSymbol(symbol);
  const tdInterval = normalizeTwelveDataInterval(interval);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let apiKey: string;
    try {
      apiKey = getKey();
    } catch (err: any) {
      throw new Error(`[marketData] Cannot fetch ${symbol} — ${err.message}`);
    }

    try {
      const candles = await _doFetch(tdSymbol, tdInterval, outputsize, apiKey, options);
      if (options?.archive !== false && candles.length > 0) {
        try {
          upsertCandles(symbol, interval, candles);
        } catch {}
      }
      return candles;
    } catch (err: any) {
      if (err.code === 429) {
        markKeyRateLimited(apiKey);
        console.warn(
          `[marketData] 429 on key ${apiKey.slice(0, 6)}... for ${symbol}:${interval}. ` +
          `Rotating to next key (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        continue;
      }

      const isTransientNetwork = /EPROTO|ECONNRESET|ETIMEDOUT|SSL|bad record mac|socket|network/i.test(
        err.message || ''
      );
      if (isTransientNetwork && attempt < MAX_RETRIES - 1) {
        console.warn(
          `[marketData] Transient network/SSL glitch for ${symbol}:${interval}: ${err.message}. ` +
          `Retrying in 500ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`[marketData] All retries exhausted for ${symbol}:${interval} after ${MAX_RETRIES} attempts.`);
}
