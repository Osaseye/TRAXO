/**
 * CommonJS adapter for trendFollowingStrategy.ts
 *
 * The server is CommonJS. The strategy implementation is TypeScript using ES imports.
 * This adapter loads the TS module via require() so ts-node (registered in index.js)
 * can transpile it on the fly.
 */

const path = require('path');

/**
 * @param {Array} candles
 * @param {string} symbol
 * @param {string} timeframe
 */
async function runTrendFollowingStrategy(candles, symbol, timeframe) {
  // Build a minimal context expected by analyzeTrendFollowing.
  // If your upstream scanner provides a richer context, extend this mapping.
  const ctx = {
    candles,
    symbol,
    timeframe,
    asset_type: 'forex',
    htfTrendDirection: 'UNKNOWN',
    htfAdx: 0,
    newsMinutesAway: null,
    consecutiveLosses: 0,
    rollingDrawdownPct: 0,
  };

  const tsModulePath = path.join(__dirname, 'trendFollowingStrategy.ts');

  // ts-node is expected to be registered in TRAXO/server/index.js
  // so requiring the TS module works at runtime.
  // eslint-disable-next-line import/no-dynamic-require
  const mod = require(tsModulePath);

  const analyze =
    mod.analyzeTrendFollowing ||
    mod.default ||
    mod.runTrendFollowingStrategy;

  if (typeof analyze !== 'function') {
    throw new Error('trendFollowingStrategyAdapter: could not find analyzeTrendFollowing export');
  }

  return analyze(ctx);
}

module.exports = { runTrendFollowingStrategy };

