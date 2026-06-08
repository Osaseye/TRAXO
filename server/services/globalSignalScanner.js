const scanState = {
  running: false,
  current: '',
  done: 0,
  total: 0,
  lastCompletedAt: null,
  lastError: null,
}

// In-memory placeholder store for “global scan results”.
// In a full implementation this will query Firestore.
let persistedSignals = []

// Canonical strategy ids used by the client.
const CANONICAL_STRATEGY_IDS = [
  'wick-rejection',
  'breakout',
  'order-block',
  'supply-demand',
  'trend-following',
]

// Minimal placeholder implementation.
// Returns empty results until the real scanner + persistence is implemented.
function getGlobalScanStatus() {
  return scanState
}

async function getGlobalSignals({ symbol, timeframe, strategyIds, limit }) {
  let list = persistedSignals

  if (symbol) list = list.filter((s) => s.symbol === symbol)
  if (timeframe) list = list.filter((s) => s.timeframe === timeframe)
  if (Array.isArray(strategyIds) && strategyIds.length > 0) {
    const set = new Set(strategyIds.filter(Boolean))
    list = list.filter((s) => set.has(s.strategyId))
  }

  const l = Number.isFinite(limit) ? limit : 50
  return list
    .slice()
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
    .slice(0, l)
}

function startGlobalSignalScannerIfNeeded() {
  if (scanState.running) return

  // Placeholder: do not start heavy loop yet.
  scanState.running = false
  scanState.total = 0
  scanState.done = 0
  scanState.current = ''
  scanState.lastCompletedAt = null
  scanState.lastError = null
}

module.exports = {
  getGlobalScanStatus,
  getGlobalSignals,
  startGlobalSignalScannerIfNeeded,
}
