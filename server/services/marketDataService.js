const https = require('https');

const API_KEY = process.env.TWELVEDATA_API_KEY;
const BASE_URL = 'api.twelvedata.com';

/**
 * Fetches time series candle data from TwelveData.
 *
 * @param {string} symbol - The ticker symbol (e.g., 'EUR/USD', 'AAPL').
 * @param {string} interval - The candle interval (e.g., '1min', '5min', '1h', '4h', '1day').
 * @param {number} outputsize - The number of data points to retrieve.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of candle objects matching the TFCandle format.
 * @throws {Error} If the API request fails or returns an error.
 */
function fetchCandles(symbol, interval, outputsize = 200) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      // This check is crucial for server health.
      console.error('CRITICAL: TWELVEDATA_API_KEY is not set in environment variables.');
      return reject(new Error('TWELVEDATA_API_KEY is not set in environment variables.'));
    }

    const params = new URLSearchParams({
      symbol,
      interval,
      outputsize,
      apikey: API_KEY,
      timezone: 'UTC', // Standardize on UTC for all server-side operations
    });

    const options = {
      hostname: BASE_URL,
      path: `/time_series?${params.toString()}`,
      method: 'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          // Handle non-200 responses that don't throw an error
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`TwelveData API responded with status ${res.statusCode}: ${data}`));
          }
          
          const parsedData = JSON.parse(data);

          if (parsedData.status === 'error' || !parsedData.values) {
            return reject(new Error(`TwelveData API error for ${symbol}: ${parsedData.message || 'No values in response'}`));
          }

          // The API returns data in reverse chronological order (newest first).
          // Our algorithms require chronological order (oldest first), so we must reverse the array.
          const candles = parsedData.values.map(v => ({
            timestamp: new Date(v.datetime + 'Z').getTime(), // Append 'Z' to ensure UTC parsing
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
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

module.exports = {
  fetchCandles,
};
