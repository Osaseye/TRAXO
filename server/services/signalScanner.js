const path = require('path');
const marketDataService = require('./marketDataService');
const candleCache = require('./candleCache');
const signalStore = require('./signalStore');
const websocketManager = require('./websocketManager');
const redis = require('./redisClient');

// ─────────────────────────────────────────────
// Timeframe normalisation
// Maps TwelveData intervals → frontend ChartTimeframe strings
// ─────────────────────────────────────────────
const TIMEFRAME_MAP = {
  '1min':  '1m',
  '5min':  '5m',
  '15min': '15m',
  '30min': '30m',  // fixed: was incorrectly mapped to '15m'
  '1h':    '1H',
  '4h':    '4H',
  '1day':  '1D',
  '1d':    '1D',
};

function toFrontendTimeframe(tf) {
  return TIMEFRAME_MAP[tf.toLowerCase()] || tf;
}

// ─────────────────────────────────────────────
// Asset-type helper (mirrors signalDetection.ts)
// ─────────────────────────────────────────────
const CRYPTO_SYMBOLS  = ['BTCUSDT','ETHUSD','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','BNBUSDT'];
const STOCK_SYMBOLS   = ['AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','NFLX','AMD','COIN','MSTR','SMCI'];
const INDEX_SYMBOLS   = ['SPX500','NAS100','US30','DE40','UK100','JP225','FRA40','AUS200'];
const ENERGY_SYMBOLS  = ['WTI','BRENT','NATGAS'];
const FUTURES_SYMBOLS = ['MNQ'];
// Metals (XAUUSD, XAGUSD) are treated as FOREX by the strategy engines (price-action based)
function getAssetType(sym) {
  if (CRYPTO_SYMBOLS.includes(sym))  return 'CRYPTO';
  if (STOCK_SYMBOLS.includes(sym))   return 'STOCKS';
  if (INDEX_SYMBOLS.includes(sym))   return 'STOCKS';  // indices use stock-market rules
  if (ENERGY_SYMBOLS.includes(sym))  return 'FOREX';   // commodities use forex-style PA
  if (FUTURES_SYMBOLS.includes(sym)) return 'STOCKS';  // futures use stock-market rules
  return 'FOREX'; // forex pairs + metals
}

// ─────────────────────────────────────────────
// Lazy-load the TS strategy modules once
// (ts-node is registered by index.js already)
// ─────────────────────────────────────────────
let _mods = null;
function getStrategyModules() {
  if (_mods) return _mods;
  const algoDir = path.join(__dirname, '..', 'algorithms');
  _mods = {
    analyzeBreakout:      require(path.join(algoDir, 'breakoutStrategy.ts')).analyzeBreakout,
    analyzeOrderBlock:    require(path.join(algoDir, 'orderBlockStrategy.ts')).analyzeOrderBlock,
    analyzeSupplyDemand:  require(path.join(algoDir, 'supplyDemandStrategy.ts')).analyzeSupplyDemand,
    analyzeTrendFollowing:require(path.join(algoDir, 'trendFollowingStrategy.ts')).analyzeTrendFollowing,
    analyzeWickRejection: require(path.join(algoDir, 'wickRejection.ts')).analyzeWickRejection,
  };
  return _mods;
}

// ─────────────────────────────────────────────
// ATR helper (mirrors signalDetection.ts)
// ─────────────────────────────────────────────
function calcATR14(candles) {
  const n   = candles.length;
  const tr  = new Array(n).fill(0);
  const atr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    tr[i] = i === 0 ? hl : Math.max(
      hl,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close)
    );
  }
  for (let i = 0; i < n; i++) {
    if (i === 13) {
      atr[i] = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    } else if (i > 13) {
      atr[i] = (atr[i - 1] * 13 + tr[i]) / 14;
    } else {
      atr[i] = tr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
    }
  }
  return atr;
}

function calcVolumeMa(candles, upToIdx, period = 20) {
  const start = Math.max(0, upToIdx - period + 1);
  const slice = candles.slice(start, upToIdx + 1).map(c => c.volume ?? 0);
  if (!slice.length) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function riskLabel(confidence) {
  if (confidence >= 85) return 'Low';
  if (confidence >= 77) return 'Medium';
  return 'High';
}

function stableSignalId(signal) {
  return [
    'sig',
    signal.strategyId,
    signal.symbol,
    signal.timeframe,
    signal.direction,
    signal.time,
  ].join(':');
}

function normalizeCandle(candle) {
  const rawTime = candle.timestamp ?? candle.time;
  const ms = typeof rawTime === 'string'
    ? new Date(rawTime).getTime()
    : rawTime > 10_000_000_000
      ? rawTime
      : rawTime * 1000;

  return {
    ...candle,
    timestamp: Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString(),
    time: Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000),
  };
}

// ─────────────────────────────────────────────
// Strategy runner — mirrors signalDetection.ts
// ─────────────────────────────────────────────
function runAllStrategies(candles, symbol, timeframe) {
  if (!candles || candles.length < 30) return [];

  candles = candles.map(normalizeCandle);
  const mods       = getStrategyModules();
  const assetType  = getAssetType(symbol);
  const lastCandle = candles[candles.length - 1];
  const lastTime   = lastCandle.time ?? Math.floor(new Date(lastCandle.timestamp).getTime() / 1000);

  const atrArr    = calcATR14(candles);
  const atr14     = atrArr[atrArr.length - 1] ?? 0;
  const volumeMa20 = calcVolumeMa(candles, candles.length - 1);

  const STRATEGIES = [
    // ── Breakout ──────────────────────────────────────────────────────
    () => {
      const raw = mods.analyzeBreakout({
        symbol, timeframe, assetType, candles,
      });
      return raw;
    },
    // ── Order Block ───────────────────────────────────────────────────
    () => {
      return mods.analyzeOrderBlock({
        symbol, asset_type: assetType, timeframe,
        candles, atr14, volumeMa20,
      });
    },
    // ── Supply & Demand ───────────────────────────────────────────────
    () => {
      return mods.analyzeSupplyDemand({
        symbol, timeframe, assetType, candles,
      });
    },
    // ── Trend Following ───────────────────────────────────────────────
    () => {
      return mods.analyzeTrendFollowing({
        candles, symbol, timeframe,
        asset_type: assetType,
        htfTrendDirection: 'UNKNOWN',
        htfAdx: 0,
        newsMinutesAway: null,
        consecutiveLosses: 0,
        rollingDrawdownPct: 0,
      });
    },
    // ── Wick Rejection ────────────────────────────────────────────────
    () => {
      return mods.analyzeWickRejection({
        symbol, assetType, timeframe,
        candle:             candles[candles.length - 2],
        confirmationCandle: candles[candles.length - 1],
        atr14, volumeMa20,
        htfBias:    'neutral',
        nearestZone: null,
      });
    },
  ];

  const STRATEGY_IDS = ['breakout', 'order_block', 'supply_demand', 'trend_following', 'wick_rejection'];
  const STRATEGY_LABELS = {
    breakout:        'Breakout',
    order_block:     'Order Block',
    supply_demand:   'Supply & Demand',
    trend_following: 'Trend Following',
    wick_rejection:  'Wick Rejection',
  };

  const signals = [];
  const rejects = {};

  for (let i = 0; i < STRATEGIES.length; i++) {
    const strategyId = STRATEGY_IDS[i];
    try {
      const raw = STRATEGIES[i]();
      
      if (!raw || raw.signal === 'NO_TRADE') {
        rejects[strategyId] = raw?.reason || ['No specific reason provided by strategy'];
        continue;
      }

      const entry   = raw.entry_price    || raw.entry_proximal || 0;
      const sl      = raw.sl_price       || 0;
      const tp      = raw.tp1_price      || 0;
      const riskD   = Math.abs(entry - sl);
      const rewardD = Math.abs(tp - entry);
      const rr      = riskD > 0 ? Number((rewardD / riskD).toFixed(2)) : 0;
      const conf    = raw.confidence_pct || 0;

      signals.push({
        id:            stableSignalId({
          strategyId,
          symbol,
          timeframe: toFrontendTimeframe(timeframe),
          direction: raw.signal,
          time: lastTime,
          entry,
        }),
        sourceId:      raw.id,
        time:          lastTime,
        strategyId,
        strategyLabel: STRATEGY_LABELS[strategyId],
        direction:     raw.signal,          // 'BUY' | 'SELL'
        entry,
        sl,
        tp,
        rr,
        confidence:    conf,
        risk:          riskLabel(conf),
        reason:        raw.reason || [],
        symbol,
        timeframe:     toFrontendTimeframe(timeframe),
        status:        'live',
      });
    } catch (err) {
      rejects[strategyId] = [`Error executing strategy: ${err.message || err}`];
      console.error(`[scanner] ${strategyId} error on ${symbol} ${timeframe}: ${err.message || err}`);
    }
  }

  return { signals, rejects };
}

// ─────────────────────────────────────────────
// Symbols & timeframes to scan
// Mirrors the full universe shown in the app (Dashboard + GlobalMultiSymbolScanner)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// SYMBOLS confirmed to work on the current TwelveData plan:
//   ✅ Forex pairs (EUR/USD style)
//   ✅ Gold (XAU/USD)
//   ✅ Crypto (BTCUSDT style)
//   ✅ US Stocks (AAPL, MSFT, etc.)
//
//   ❌ Indices (SPX, NDX, UKX, DAX...) — require Grow/Venture plan
//   ❌ Energy (WTI/USD, BRENT/USD, NG/USD) — require higher plan
//   ❌ Silver (XAG/USD) — requires Grow/Venture plan
//   ❌ Futures (MNQ) — requires exchange-specific subscription
//
// To enable these, upgrade the TwelveData subscription and uncomment.
// ─────────────────────────────────────────────
const SYMBOLS = [
  // ── Forex (10) ── confirmed free plan ───────────────────────────────
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'USD/CHF', 'NZD/USD', 'EUR/JPY', 'GBP/JPY', 'EUR/GBP',
  // ── Metals (1) ── confirmed free plan ───────────────────────────────
  'XAU/USD',
  // ── Crypto (7) ── confirmed free plan ───────────────────────────────
  'BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT',
  // ── US Stocks (12) ── confirmed free plan ───────────────────────────
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI',

  // ── Requires plan upgrade (uncomment when subscribed) ───────────────
  // Indices: 'SPX500','NAS100','US30','DE40','UK100','JP225','FRA40','AUS200',
  // Energy:  'WTI','BRENT','NATGAS',
  // Silver:  'XAG/USD',
  // Futures: 'MNQ',
];

// All 6 timeframes the charts support.
const TIMEFRAMES = ['1min', '5min', '15min', '1h', '4h', '1day'];

// Total scan combinations: 30 symbols × 6 timeframes = 180 pairs per cycle.
// At 2.5s per fetch, cold-start warm-up takes ~7.5 min max (all cached after first cycle).


// ─────────────────────────────────────────────
// Rate-limit-aware sleep helpers
// ─────────────────────────────────────────────
const { getAvailableCount } = require('./keyRotator');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until at least one TwelveData key is out of cooldown.
 * Polls every 500ms. Used before each cache-miss API call so we
 * never attempt a fetch when all keys are frozen.
 */
async function waitForKey(maxWaitMs = 70_000) {
  const started = Date.now();
  while (getAvailableCount() === 0) {
    if (Date.now() - started > maxWaitMs) {
      throw new Error('Timed out waiting for an available TwelveData API key.');
    }
    await sleep(500);
  }
}

// Minimum gap between consecutive API fetches (even when a key is available).
// 3 keys × 8 req/min each = 24 req/min ≈ 1 req per 2.5s to stay safely under.
const API_CALL_DELAY_MS = 2_500;

// ─────────────────────────────────────────────
// Main scan loop
// ─────────────────────────────────────────────
async function runScan() {
  console.log('Starting signal scan...');

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        // 1. Check Redis cache first
        let candles = await candleCache.getCachedCandles(symbol, timeframe, 200);
        if (!candles) {
          console.log(`Cache miss for ${symbol}:${timeframe}. Fetching from API...`);
          // Wait for a key to be available before making the request
          await waitForKey();
          // Pace consecutive calls to stay within per-minute quota
          await sleep(API_CALL_DELAY_MS);
          candles = await marketDataService.fetchCandles(symbol, timeframe, 200);
          if (candles && candles.length > 0) {
            await candleCache.cacheCandles(symbol, timeframe, candles, 200);

            const latestCandle = candles[candles.length - 1];
            const frontSymbol = symbol.replace('/', '');
            const frontTimeframe = toFrontendTimeframe(timeframe);

            // Push the freshest candle to the frontend so charts tick live
            websocketManager.broadcast({
              type: 'NEW_CANDLE',
              payload: {
                ...latestCandle,
                symbol: frontSymbol,
                timeframe: frontTimeframe,
              },
            });

            // ─────────────────────────────────────────────
            // Evaluation Loop: Check active signals for TP/SL hits
            // ─────────────────────────────────────────────
            const activeSignals = await signalStore.getActiveLiveSignals(frontSymbol, frontTimeframe);
            for (const sig of activeSignals) {
              let outcome = null;

              if (sig.direction === 'BUY') {
                if (latestCandle.high >= sig.tp) outcome = 'WIN';
                else if (latestCandle.low <= sig.sl) outcome = 'LOSS';
              } else if (sig.direction === 'SELL') {
                if (latestCandle.low <= sig.tp) outcome = 'WIN';
                else if (latestCandle.high >= sig.sl) outcome = 'LOSS';
              }

              if (outcome) {
                console.log(`[Evaluation] Signal ${sig.id} resolved as ${outcome}`);
                await signalStore.updateSignalStatus(sig.id, outcome);
                websocketManager.broadcast({
                  type: 'SIGNAL_UPDATED',
                  payload: { ...sig, status: outcome },
                });
              }
            }
          }
        }

        if (!candles || candles.length === 0) continue;

        // 2. Run all 5 strategies (strip '/' from symbol for strategy engine)
        const { signals: found, rejects } = runAllStrategies(candles, symbol.replace('/', ''), timeframe);

        // Store rejections in Redis for Admin Panel transparency (2 hours TTL)
        try {
          await redis.set(`scan_rejects:${symbol}:${toFrontendTimeframe(timeframe)}`, JSON.stringify(rejects), 'EX', 7200);
        } catch (err) {
          console.error(`Failed to save scan rejects for ${symbol} to Redis:`, err);
        }

        // 3. Broadcast each real signal
        for (const signal of found) {
          const existingLive = await signalStore.getLiveSignal(signal.symbol, signal.timeframe, signal.strategyId);
          if (existingLive && existingLive.id === signal.id) continue;

          const existingHistorical = await signalStore.hasHistoricalSignal(signal.id);
          if (existingHistorical) {
            await signalStore.cacheLiveSignal(signal);
            continue;
          }

          console.log(`New signal found! ${signal.direction} ${signal.symbol} ${signal.timeframe} (${signal.strategyLabel} | ${signal.confidence}%)`);
          await signalStore.cacheLiveSignal(signal);
          await signalStore.saveHistoricalSignal(signal);
          websocketManager.broadcast({ type: 'NEW_SIGNAL', payload: signal });
        }
      } catch (error) {
        console.error(`Error scanning ${symbol} on ${timeframe}:`, error.message || error);
      }
    }
  }

  console.log('Signal scan finished.');
}

module.exports = { runScan };
