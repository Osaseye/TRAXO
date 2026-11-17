import https from 'https';
import { getKey, markKeyRateLimited } from './keyRotator';
import { toTwelveDataSymbol } from '../../config/instruments';

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

function _doFetch(
  tdSymbol: string,
  tdInterval: string,
  outputsize: number,
  apiKey: string
): Promise<MarketCandle[]> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      symbol: tdSymbol,
      interval: tdInterval,
      outputsize: String(outputsize),
      apikey: apiKey,
      timezone: 'UTC',
    });

    const options = {
      hostname: BASE_URL,
      path: `/time_series?${params.toString()}`,
      method: 'GET',
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
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

export async function fetchCandles(
  symbol: string,
  interval: string,
  outputsize = 200
): Promise<MarketCandle[]> {
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
      return await _doFetch(tdSymbol, tdInterval, outputsize, apiKey);
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
