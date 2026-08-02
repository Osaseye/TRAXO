/**
 * globalSignalScanner.js
 *
 * Provides the signal query API consumed by the /api/global-signals route.
 * Data is read from two sources (mirroring exactly what signalScanner.js writes):
 *
 *   • Redis  — "signals:live:{symbol}:{timeframe}:{strategyId}" keys (1h TTL)
 *              These are the most recent signal per strategy/pair/tf combo.
 *
 *   • Firestore — "signals" collection (permanent, queryable history)
 *
 * Query priority: Redis live cache first (hot path), falls back to Firestore
 * for historical signals that have aged out of Redis.
 */

const redis     = require('./redisClient');
const { firestore } = require('./firebaseAdmin');

// ─────────────────────────────────────────────
// Scan-state tracker (updated by scannerCron
// so the /status endpoint stays accurate)
// ─────────────────────────────────────────────
const scanState = {
  running:         false,
  current:         '',
  done:            0,
  total:           0,
  lastCompletedAt: null,
  lastError:       null,
};

function getGlobalScanStatus() {
  return { ...scanState };
}

// Called by scannerCron so the status stays live.
function updateScanState(patch) {
  Object.assign(scanState, patch);
}

// ─────────────────────────────────────────────
// Live signals from Redis
// Redis key pattern: signals:live:{symbol}:{timeframe}:{strategyId}
// ─────────────────────────────────────────────
async function getLiveSignalsFromRedis() {
  try {
    // Scan all live signal keys in one pass
    const keys = await new Promise((resolve, reject) => {
      const found = [];
      const stream = redis.scanStream({ match: 'signals:live:*', count: 500 });
      stream.on('data', (batch) => found.push(...batch));
      stream.on('end',  () => resolve(found));
      stream.on('error', reject);
    });

    if (keys.length === 0) return [];

    const values = await redis.mget(keys);
    return values
      .filter(Boolean)
      .map((v) => { try { return JSON.parse(v); } catch { return null; } })
      .filter(Boolean);
  } catch (err) {
    console.error('[globalSignalScanner] Redis live fetch error:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Historical signals from Firestore
// ─────────────────────────────────────────────
async function getHistoricalSignalsFromFirestore({ symbol, timeframe, strategyIds, limit }) {
  try {
    let query = firestore
      .collection('signals')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    // Firestore only allows equality filters without composite indexes,
    // so we apply symbol/timeframe as equality filters and filter the rest in JS.
    if (symbol)    query = query.where('symbol',    '==', symbol);
    if (timeframe) query = query.where('timeframe', '==', timeframe);

    const snapshot = await query.get();
    let docs = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));

    // JS-side filter for strategyIds (avoids needing composite index)
    if (Array.isArray(strategyIds) && strategyIds.length > 0) {
      const set = new Set(strategyIds);
      docs = docs.filter((s) => set.has(s.strategyId));
    }

    return docs;
  } catch (err) {
    console.error('[globalSignalScanner] Firestore fetch error:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Main query function — merges Redis + Firestore,
// deduplicates by signal ID, newest first.
// ─────────────────────────────────────────────
async function getGlobalSignals({ symbol, timeframe, strategyIds, limit = 50 }) {
  const l = Number.isFinite(Number(limit)) ? Number(limit) : 50;

  // 1. Pull live signals from Redis (freshest data, sub-ms)
  const liveSignals = await getLiveSignalsFromRedis();

  // 2. Pull recent history from Firestore (catches signals that aged out of Redis)
  const historicalSignals = await getHistoricalSignalsFromFirestore({
    symbol, timeframe, strategyIds, limit: l,
  });

  // 3. Merge — live signals take precedence (overwrite historical with same ID)
  const merged = new Map();
  for (const s of historicalSignals) merged.set(s.id, s);
  for (const s of liveSignals)       merged.set(s.id, { ...s, status: s.status || 'live' });

  // 4. Apply remaining filters (symbol/timeframe on live; strategyIds on all)
  let list = [...merged.values()];

  if (symbol) {
    list = list.filter((s) => s.symbol === symbol);
  }
  if (timeframe) {
    list = list.filter((s) => s.timeframe === timeframe);
  }
  if (Array.isArray(strategyIds) && strategyIds.length > 0) {
    const set = new Set(strategyIds);
    list = list.filter((s) => set.has(s.strategyId));
  }

  // 5. Sort newest first, cap at limit
  list.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return list.slice(0, l);
}

// ─────────────────────────────────────────────
// No-op — the real scanner is started by scannerCron.
// Kept for interface compatibility.
// ─────────────────────────────────────────────
function startGlobalSignalScannerIfNeeded() {
  // Real scan is driven by scannerCron → signalScanner.js
}

module.exports = {
  getGlobalScanStatus,
  getGlobalSignals,
  updateScanState,
  startGlobalSignalScannerIfNeeded,
};
