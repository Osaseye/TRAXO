const https = require('https');
const { getKey, markKeyRateLimited } = require('./keyRotator');

const BASE_URL = 'api.twelvedata.com';

/**
 * Fetches time series candle data from TwelveData.
 * Automatically rotates to the next API key on a 429 rate-limit response
 * and retries the request up to MAX_RETRIES times.
 *
 * @param {string} symbol     - The ticker symbol (e.g., 'EUR/USD', 'AAPL').
 * @param {string} interval   - The candle interval (e.g., '1min', '5min', '1h', '4h', '1day').
 * @param {number} outputsize - The number of data points to retrieve.
 * @returns {Promise<Array<object>>} A promise resolving to an array of candle objects.
 * @throws {Error} If all keys are exhausted or the API returns a non-recoverable error.
 */
async function fetchCandles(symbol, interval, outputsize = 200) {
  const MAX_RETRIES = 5; // maximum key rotations before giving up

  // Normalise symbol (e.g. 'EURUSD' → 'EUR/USD')
  let tdSymbol = symbol;
  if (symbol.length === 6 && !symbol.includes('/') && !['SPX500', 'NAS100'].includes(symbol)) {
    tdSymbol = `${symbol.substring(0, 3)}/${symbol.substring(3)}`;
  } else if (symbol.endsWith('USDT')) {
    tdSymbol = symbol.replace('USDT', '/USD');
  }

  // Normalise interval (e.g. '1m' → '1min')
  let tdInterval = interval.toLowerCase();
  if (tdInterval === '1m')  tdInterval = '1min';
  else if (tdInterval === '5m')  tdInterval = '5min';
  else if (tdInterval === '15m') tdInterval = '15min';
  else if (tdInterval === '1d')  tdInterval = '1day';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let apiKey;
    try {
      apiKey = getKey(); // throws if all keys are cooling down
    } catch (err) {
      throw new Error(`[marketData] Cannot fetch ${symbol} — ${err.message}`);
    }

    try {
      const candles = await _doFetch(tdSymbol, tdInterval, outputsize, apiKey);
      return candles; // success — return immediately
    } catch (err) {
      if (err.code === 429) {
        // Rate limited — cool this key down and loop to try the next one
        markKeyRateLimited(apiKey);
        console.warn(
          `[marketData] 429 on key ${apiKey.slice(0, 6)}... for ${symbol}:${interval}. ` +
          `Rotating to next key (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        // No sleep needed — getKey() will skip cooling keys automatically
        continue;
      }
      // Non-429 error (bad symbol, network issue, etc.) — re-throw immediately
      throw err;
    }
  }

  throw new Error(
    `[marketData] All retries exhausted for ${symbol}:${interval} after ${MAX_RETRIES} attempts.`
  );
}

/**
 * Internal: performs a single HTTPS request to TwelveData with the given key.
 * Resolves with the parsed candle array or rejects with an Error.
 * The error has a `code` property set to 429 for rate-limit responses.
 *
 * @private
 */
function _doFetch(tdSymbol, tdInterval, outputsize, apiKey) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      symbol: tdSymbol,
      interval: tdInterval,
      outputsize,
      apikey: apiKey,
      timezone: 'UTC',
    });

    const options = {
      hostname: BASE_URL,
      path: `/time_series?${params.toString()}`,
      method: 'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          // Handle HTTP-level 429 (some proxies surface it this way)
          if (res.statusCode === 429) {
            const err = new Error(`TwelveData rate limit (HTTP 429) for key ${apiKey.slice(0, 6)}...`);
            err.code = 429;
            return reject(err);
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(
              `TwelveData API responded with status ${res.statusCode}: ${data}`
            ));
          }

          const parsed = JSON.parse(data);

          // TwelveData also returns 429 inside the JSON body with status 200
          if (parsed.code === 429 || (parsed.status === 'error' && /credit|limit/i.test(parsed.message || ''))) {
            const err = new Error(`TwelveData rate limit (JSON body): ${parsed.message}`);
            err.code = 429;
            return reject(err);
          }

          if (parsed.status === 'error' || !parsed.values) {
            return reject(new Error(
              `TwelveData API error for ${tdSymbol}: ${parsed.message || 'No values in response'}`
            ));
          }

          // API returns newest-first; reverse to chronological (oldest-first)
          const candles = parsed.values.map((v) => ({
            timestamp: new Date(v.datetime + 'Z').toISOString(),
            time: Math.floor(new Date(v.datetime + 'Z').getTime() / 1000),
            open:   parseFloat(v.open),
            high:   parseFloat(v.high),
            low:    parseFloat(v.low),
            close:  parseFloat(v.close),
            volume: v.volume ? parseInt(v.volume, 10) : 0,
          })).reverse();

          resolve(candles);
        } catch (e) {
          reject(new Error(`Failed to parse TwelveData JSON response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Node.js HTTPS request failed: ${e.message}`));
    });

    req.end();
  });
}

module.exports = { fetchCandles };
