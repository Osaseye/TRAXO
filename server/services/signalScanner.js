const marketDataService = require('./marketDataService');
const candleCache = require('./candleCache');
const signalStore = require('./signalStore');
const websocketManager = require('./websocketManager');

// Placeholder for the actual algorithms that will be moved
const { runTrendFollowingStrategy } = require('../algorithms/trendFollowing/index'); 

const SYMBOLS = ['EUR/USD', 'GBP/USD', 'AUD/USD', /* ...and so on */];
const TIMEFRAMES = ['5min', '15min', '1h'];

/**
 * The main function to scan for signals across all symbols and timeframes.
 */
async function runScan() {
  console.log('Starting signal scan...');

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        // 1. Get Candle Data (with caching)
        let candles = await candleCache.getCachedCandles(symbol, timeframe);
        if (!candles) {
          console.log(`Cache miss for ${symbol}:${timeframe}. Fetching from API.`);
          candles = await marketDataService.fetchCandles(symbol, timeframe, 200);
          await candleCache.cacheCandles(symbol, timeframe, candles);
        }

        // 2. Run the strategy algorithm
        const newSignal = runTrendFollowingStrategy(candles, symbol, timeframe);

        if (newSignal) {
          console.log(`New signal found for ${symbol}:${timeframe}!`);

          // 3. Persist and broadcast the new signal
          await signalStore.cacheLiveSignal(newSignal);
          await signalStore.saveHistoricalSignal(newSignal);
          websocketManager.broadcast({ type: 'NEW_SIGNAL', payload: newSignal });
        }
      } catch (error) {
        console.error(`Error scanning ${symbol} on ${timeframe}:`, error);
      }
    }
  }

  console.log('Signal scan finished.');
}

module.exports = {
  runScan,
};
