// CommonJS adapter for trendFollowingStrategy.ts
// The server is CommonJS, while the strategy implementation is TypeScript/ESM.
// This adapter safely loads the TS module and re-exports a CommonJS entrypoint.

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

  // Dynamic import so Node can load TS/ESM depending on your runtime config.
  // If your project already transpiles TS -> JS, you can switch to that compiled file.
  const tsModulePath = path.join(__dirname, 'trendFollowingStrategy.ts');

  // Use native ESM loader when available.
  const mod = await import(pathToFileUrl(tsModulePath));

  const analyze = mod.analyzeTrendFollowing || mod.default || mod.runTrendFollowingStrategy;
  if (typeof analyze !== 'function') {
    throw new Error('trendFollowingStrategyAdapter: could not find analyzeTrendFollowing export');
  }

  return analyze(ctx);
}

function pathToFileUrl(p) {
  const normalized = p.replace(/\\/g, '/');
  // For Windows absolute paths, prepend file:///C:/...
  const match = normalized.match(/^([a-zA-Z]):\/(.*)$/);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = match[2];
    return `file:///${drive}:/${rest}`;
  }
  return `file://${normalized}`;
}

module.exports = { runTrendFollowingStrategy };

