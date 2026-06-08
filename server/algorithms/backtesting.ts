/**
 * Backtesting engine for the Wick Rejection and Order Block algorithms.
 *
 * Runs analyzeWickRejection / analyzeOrderBlock across a full historical
 * candle series and simulates whether each signal would have been a win or
 * loss by checking if tp1 or sl was hit first on the candles that follow.
 */

import { analyzeWickRejection } from './wickRejection'
import type {
  WickRejectionAssetType,
  WickRejectionHTFBias,
  WickRejectionContext,
} from './wickRejection'
import { analyzeOrderBlock } from './orderBlockStrategy'
import type { OrderBlockContext } from './orderBlock/types'
import type { AssetType } from './strategyConfig'
import type { Timeframe } from '@/types'
import { analyzeTrendFollowing } from './trendFollowingStrategy'
import type { TrendFollowingContext } from './trendFollowing/types'
import { analyzeBreakout } from './breakoutStrategy'
import type { BreakoutContext, BKAssetType } from './breakout/types'
import { analyzeSupplyDemand } from './supplyDemandStrategy'
import type { SupplyDemandContext, SDAssetType } from './supplyDemand/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestCandle {
  time: number   // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface BacktestSignalResult {
  id: string
  signalIdx: number
  time: number
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp1: number
  tp2: number
  tier: string
  confidence: number
  score: number
  tp1_source: 'structure' | 'rr'
  tp2_source: 'structure' | 'rr'
  order_block_confluence: boolean
  liquidity_sweep: boolean
  reason: string[]
  /** null = not yet resolved (trade ran out of candles) */
  outcome: 'win' | 'loss' | 'pending'
  /** Actual RR achieved if win/loss, null if pending */
  achievedRR: number | null
  /** Number of candles it took to resolve */
  barsToResolution: number | null
}

export interface BacktestSummary {
  symbol: string
  timeframe: Timeframe
  assetType: WickRejectionAssetType
  totalCandles: number
  totalSignals: number
  wins: number
  losses: number
  pending: number
  winRate: number          // 0-1
  avgWinRR: number
  avgLossRR: number
  expectancy: number       // (winRate * avgWinRR) - (lossRate * 1)
  maxConsecLosses: number
  maxDrawdownPct: number   // simulated equity curve drawdown
  signals: BacktestSignalResult[]
}

// ---------------------------------------------------------------------------
// Internal helpers (mirror Dashboard.tsx helpers without React)
// ---------------------------------------------------------------------------

function calcATR14(candles: BacktestCandle[]): number[] {
  const n = candles.length
  const tr = new Array<number>(n).fill(0)
  const atr = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    const hl = candles[i].high - candles[i].low
    tr[i] =
      i === 0
        ? hl
        : Math.max(
            hl,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close),
          )
  }
  for (let i = 0; i < n; i++) {
    if (i === 13) {
      atr[i] = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14
    } else if (i > 13) {
      atr[i] = (atr[i - 1] * 13 + tr[i]) / 14
    } else {
      atr[i] = tr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1)
    }
  }
  return atr
}

function calcVolumeMa(candles: BacktestCandle[], upToIdx: number, period = 20): number {
  const start = Math.max(0, upToIdx - period + 1)
  const slice = candles.slice(start, upToIdx + 1).map((c) => c.volume ?? 0)
  if (slice.length === 0) return 0
  return slice.reduce((sum, volume) => sum + volume, 0) / slice.length
}

function findSwingHighs(candles: BacktestCandle[], lookback = 3): number[] {
  const highs: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) { isHigh = false; break }
    }
    if (isHigh) highs.push(candles[i].high)
  }
  return highs
}

function findSwingLows(candles: BacktestCandle[], lookback = 3): number[] {
  const lows: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].low <= candles[i].low) { isLow = false; break }
    }
    if (isLow) lows.push(candles[i].low)
  }
  return lows
}

function findSwingZones(candles: BacktestCandle[], lookback = 3): number[] {
  return [...findSwingHighs(candles, lookback), ...findSwingLows(candles, lookback)]
}

function calcHTFBias(candles: BacktestCandle[]): WickRejectionHTFBias {
  if (candles.length < 20) return 'neutral'
  const period = Math.min(50, candles.length)
  const avg = candles.slice(-period).reduce((sum, c) => sum + c.close, 0) / period
  const last = candles[candles.length - 1].close
  const threshold = avg * 0.001
  if (last > avg + threshold) return 'bullish'
  if (last < avg - threshold) return 'bearish'
  return 'neutral'
}

function calcOrderBlock(
  candles: BacktestCandle[],
  atrs: number[],
  upToIdx: number,
  lookback = 20,
): { high: number; low: number; type: 'bullish' | 'bearish' } | undefined {
  const start = Math.max(1, upToIdx - lookback)
  for (let i = upToIdx - 1; i >= start; i--) {
    const next = candles[i + 1]
    const atr = atrs[i] || atrs[atrs.length - 1]
    const move = Math.abs(next.close - next.open)
    if (move < atr * 0.8) continue
    if (next.close > next.open && candles[i].close < candles[i].open) {
      return { high: candles[i].high, low: candles[i].low, type: 'bullish' }
    }
    if (next.close < next.open && candles[i].close > candles[i].open) {
      return { high: candles[i].high, low: candles[i].low, type: 'bearish' }
    }
  }
  return undefined
}

/**
 * Forward-simulate the trade: scan candles after the signal and return the
 * first price event (TP1 or SL hit). We use high/low of each bar.
 * Maximum lookforward is 50 bars.
 */
function simulateTrade(
  candles: BacktestCandle[],
  signalIdx: number,
  entry: number,
  sl: number,
  tp: number,
  direction: 'BUY' | 'SELL',
): { outcome: 'win' | 'loss' | 'pending'; barsToResolution: number | null; achievedRR: number | null } {
  const MAX_BARS = 50
  const risk = Math.abs(entry - sl)
  if (risk <= 0) return { outcome: 'pending', barsToResolution: null, achievedRR: null }

  for (let i = signalIdx + 1; i <= signalIdx + MAX_BARS && i < candles.length; i++) {
    const bar = candles[i]
    if (direction === 'BUY') {
      if (bar.low <= sl) {
        return { outcome: 'loss', barsToResolution: i - signalIdx, achievedRR: -1 }
      }
      if (bar.high >= tp) {
        const reward = Math.abs(tp - entry)
        return { outcome: 'win', barsToResolution: i - signalIdx, achievedRR: Number((reward / risk).toFixed(2)) }
      }
    } else {
      if (bar.high >= sl) {
        return { outcome: 'loss', barsToResolution: i - signalIdx, achievedRR: -1 }
      }
      if (bar.low <= tp) {
        const reward = Math.abs(entry - tp)
        return { outcome: 'win', barsToResolution: i - signalIdx, achievedRR: Number((reward / risk).toFixed(2)) }
      }
    }
  }
  return { outcome: 'pending', barsToResolution: null, achievedRR: null }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BacktestOptions {
  symbol: string
  timeframe: Timeframe
  assetType: WickRejectionAssetType
  /** Minimum candle index to start scanning (needs 14+ for ATR warm-up). Default: 20 */
  startIdx?: number
}

export function runBacktest(candles: BacktestCandle[], options: BacktestOptions): BacktestSummary {
  const { symbol, timeframe, assetType, startIdx = 20 } = options

  if (candles.length < 30) {
    return emptyBacktest(symbol, timeframe, assetType, candles.length)
  }

  const atrArr = calcATR14(candles)
  const allSwingHighs = findSwingHighs(candles, 3)
  const allSwingLows = findSwingLows(candles, 3)
  const signals: BacktestSignalResult[] = []

  // Walk forward one candle at a time — never look ahead.
  for (let i = startIdx; i < candles.length - 1; i++) {
    const windowCandles = candles.slice(0, i + 1)
    const zones = findSwingZones(windowCandles, 3)
    const htfBias = calcHTFBias(windowCandles)
    const candle = candles[i]
    const confirmationCandle = candles[i + 1]
    const atr14 = atrArr[i]

    const nearestZone =
      zones.length > 0
        ? zones.reduce((z, curr) =>
            Math.abs(curr - candle.close) < Math.abs(z - candle.close) ? curr : z,
          )
        : null

    const ctx: WickRejectionContext = {
      symbol,
      assetType,
      timeframe,
      candle: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
        timestamp: new Date(candle.time * 1000).toISOString(),
      },
      confirmationCandle: {
        open: confirmationCandle.open,
        high: confirmationCandle.high,
        low: confirmationCandle.low,
        close: confirmationCandle.close,
        volume: confirmationCandle.volume ?? 0,
      },
      atr14,
      volumeMa20: calcVolumeMa(candles, i, 20),
      nearestZone,
      htfBias,
      htfCacheStatus: 'fresh',
      swingHighs: allSwingHighs.filter((h) => h > candle.close),
      swingLows: allSwingLows.filter((l) => l < candle.close),
      orderBlockZone: calcOrderBlock(candles, atrArr, i, 20),
    }

    const sig = analyzeWickRejection(ctx)
    if (sig.signal === 'NO_TRADE') continue

    const direction = sig.signal as 'BUY' | 'SELL'
    const trade = simulateTrade(candles, i, sig.entry_price, sig.sl_price, sig.tp1_price, direction)

    signals.push({
      id: sig.id,
      signalIdx: i,
      time: candle.time,
      direction,
      entry: sig.entry_price,
      sl: sig.sl_price,
      tp1: sig.tp1_price,
      tp2: sig.tp2_price,
      tier: sig.tier,
      confidence: sig.confidence_pct,
      score: sig.score,
      tp1_source: sig.tp1_source,
      tp2_source: sig.tp2_source,
      order_block_confluence: sig.order_block_confluence,
      liquidity_sweep: sig.liquidity_sweep,
      reason: sig.reason,
      outcome: trade.outcome,
      achievedRR: trade.achievedRR,
      barsToResolution: trade.barsToResolution,
    })
  }

  return buildSummary(symbol, timeframe, assetType, candles.length, signals)
}

function emptyBacktest(
  symbol: string,
  timeframe: Timeframe,
  assetType: WickRejectionAssetType,
  totalCandles: number,
): BacktestSummary {
  return {
    symbol, timeframe, assetType, totalCandles,
    totalSignals: 0, wins: 0, losses: 0, pending: 0,
    winRate: 0, avgWinRR: 0, avgLossRR: 0, expectancy: 0,
    maxConsecLosses: 0, maxDrawdownPct: 0, signals: [],
  }
}

function buildSummary(
  symbol: string,
  timeframe: Timeframe,
  assetType: WickRejectionAssetType,
  totalCandles: number,
  signals: BacktestSignalResult[],
): BacktestSummary {
  const settled = signals.filter((s) => s.outcome !== 'pending')
  const wins = settled.filter((s) => s.outcome === 'win')
  const losses = settled.filter((s) => s.outcome === 'loss')

  const winRate = settled.length > 0 ? wins.length / settled.length : 0
  const avgWinRR = wins.length > 0 ? wins.reduce((a, s) => a + (s.achievedRR ?? 0), 0) / wins.length : 0
  const avgLossRR = losses.length > 0 ? Math.abs(losses.reduce((a, s) => a + (s.achievedRR ?? 0), 0) / losses.length) : 1

  const expectancy = winRate * avgWinRR - (1 - winRate) * avgLossRR

  // Max consecutive losses
  let maxConsecLosses = 0
  let consecLosses = 0
  for (const s of settled) {
    if (s.outcome === 'loss') {
      consecLosses++
      maxConsecLosses = Math.max(maxConsecLosses, consecLosses)
    } else {
      consecLosses = 0
    }
  }

  // Simulated equity curve — 1% risk per trade
  const riskPct = 0.01
  let equity = 1
  let peak = 1
  let maxDrawdownPct = 0
  for (const s of settled) {
    if (s.outcome === 'win') {
      equity *= 1 + riskPct * (s.achievedRR ?? 1)
    } else {
      equity *= 1 - riskPct
    }
    if (equity > peak) peak = equity
    const dd = (peak - equity) / peak
    if (dd > maxDrawdownPct) maxDrawdownPct = dd
  }

  return {
    symbol,
    timeframe,
    assetType,
    totalCandles,
    totalSignals: signals.length,
    wins: wins.length,
    losses: losses.length,
    pending: signals.filter((s) => s.outcome === 'pending').length,
    winRate: Number(winRate.toFixed(4)),
    avgWinRR: Number(avgWinRR.toFixed(2)),
    avgLossRR: Number(avgLossRR.toFixed(2)),
    expectancy: Number(expectancy.toFixed(4)),
    maxConsecLosses,
    maxDrawdownPct: Number((maxDrawdownPct * 100).toFixed(2)),
    signals,
  }
}

// ---------------------------------------------------------------------------
// Order Block backtest
// ---------------------------------------------------------------------------

function getOBAssetType(symbol: string): AssetType {
  const crypto = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const stocks = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (crypto.includes(symbol)) return 'CRYPTO'
  if (stocks.includes(symbol)) return 'STOCKS'
  return 'FOREX'
}

/**
 * Backtests the Order Block engine across a historical candle series.
 * For each candle window ending at index i, runs analyzeOrderBlock on the
 * slice [0..i] and simulates each resulting trade on the forward candles.
 * Uses the same rolling-window approach as the live signal detector so
 * backtest results reflect what the live engine would have generated.
 */
export function runOrderBlockBacktest(
  candles: BacktestCandle[],
  options: BacktestOptions,
): BacktestSummary {
  const { symbol, timeframe, startIdx = 50 } = options
  const assetType = options.assetType  // kept for summary shape compatibility

  if (candles.length < 50) {
    return emptyBacktest(symbol, timeframe, assetType, candles.length)
  }

  const atrArr = calcATR14(candles)
  const signals: BacktestSignalResult[] = []
  const seenZones = new Set<string>()

  for (let endIdx = startIdx; endIdx < candles.length - 1; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)
    const atr14 = atrArr[endIdx] ?? 0

    const obCandles: OrderBlockContext['candles'] = slice.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      timestamp: new Date(c.time * 1000).toISOString(),
    }))

    const ctx: OrderBlockContext = {
      symbol,
      asset_type: getOBAssetType(symbol),
      timeframe: timeframe as OrderBlockContext['timeframe'],
      candles: obCandles,
      atr14,
      volumeMa20: calcVolumeMa(candles, endIdx, 20),
    }

    const sig = analyzeOrderBlock(ctx)
    if (sig.signal === 'NO_TRADE') continue

    // Deduplicate: same OB zone across multiple window endpoints
    const zoneKey = sig.entry_proximal.toPrecision(5)
    if (seenZones.has(zoneKey)) continue
    seenZones.add(zoneKey)

    const direction = sig.signal as 'BUY' | 'SELL'
    const entry = sig.entry_proximal
    const trade = simulateTrade(candles, endIdx, entry, sig.sl_price, sig.tp1_price, direction)

    signals.push({
      id: sig.id,
      signalIdx: endIdx,
      time: candles[endIdx].time,
      direction,
      entry,
      sl: sig.sl_price,
      tp1: sig.tp1_price,
      tp2: sig.tp2_price,
      tier: sig.tier,
      confidence: sig.confidence_pct,
      score: 0,
      tp1_source: 'structure',
      tp2_source: 'structure',
      order_block_confluence: true,
      liquidity_sweep: false,
      reason: sig.reason,
      outcome: trade.outcome,
      achievedRR: trade.achievedRR,
      barsToResolution: trade.barsToResolution,
    })
  }

  return buildSummary(symbol, timeframe, assetType, candles.length, signals)
}

// ---------------------------------------------------------------------------
// Trend Following backtest
// ---------------------------------------------------------------------------

/**
 * Backtests the Trend Following engine across a historical candle series.
 *
 * Walk-forward approach: for each candle index i, run analyzeTrendFollowing
 * on the slice [0..i] and simulate the resulting trade on the forward candles.
 * Minimum 50 candles required; best results with 220+ (EMA-200 fully seeded).
 */
export function runTrendFollowingBacktest(
  candles: BacktestCandle[],
  options: BacktestOptions,
): BacktestSummary {
  const { symbol, timeframe, startIdx = 50 } = options
  const assetType = options.assetType

  if (candles.length < 50) {
    return emptyBacktest(symbol, timeframe, assetType, candles.length)
  }

  const signals: BacktestSignalResult[] = []
  // Deduplicate signals whose entry price rounds to the same zone (prevents
  // the same pullback from generating multiple identical signals).
  const seenEntries = new Set<string>()

  for (let endIdx = startIdx; endIdx < candles.length - 1; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)

    const tfCandles: TrendFollowingContext['candles'] = slice.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      timestamp: new Date(c.time * 1000).toISOString(),
    }))

    const ctx: TrendFollowingContext = {
      symbol,
      timeframe,
      asset_type: getOBAssetType(symbol),
      candles: tfCandles,
    }

    const sig = analyzeTrendFollowing(ctx)
    if (sig.signal === 'NO_TRADE') continue

    // Deduplicate: same pullback zone across multiple window endpoints
    const entryKey = sig.entry_price.toPrecision(5)
    if (seenEntries.has(entryKey)) continue
    seenEntries.add(entryKey)

    const direction = sig.signal as 'BUY' | 'SELL'
    const trade = simulateTrade(candles, endIdx, sig.entry_price, sig.sl_price, sig.tp1_price, direction)

    signals.push({
      id: sig.id,
      signalIdx: endIdx,
      time: candles[endIdx].time,
      direction,
      entry: sig.entry_price,
      sl: sig.sl_price,
      tp1: sig.tp1_price,
      tp2: sig.tp2_price,
      tier: sig.tier,
      confidence: sig.confidence_pct,
      score: sig.score,
      tp1_source: 'structure',
      tp2_source: 'structure',
      order_block_confluence: sig.entry_trigger === 'OB_AT_PULLBACK',
      liquidity_sweep: sig.internal_liq_swept,
      reason: sig.reason,
      outcome: trade.outcome,
      achievedRR: trade.achievedRR,
      barsToResolution: trade.barsToResolution,
    })
  }

  return buildSummary(symbol, timeframe, assetType, candles.length, signals)
}

// ---------------------------------------------------------------------------
// Breakout backtest
// ---------------------------------------------------------------------------

function getBKAssetType(symbol: string): BKAssetType {
  const crypto = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const stocks = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (crypto.includes(symbol)) return 'CRYPTO'
  if (stocks.includes(symbol)) return 'STOCKS'
  return 'FOREX'
}

/**
 * Backtests the Breakout engine across a historical candle series.
 *
 * Walk-forward approach: for each candle index i (starting at MIN_CANDLES),
 * run analyzeBreakout on the slice [0..i] and simulate the resulting trade
 * on the forward candles. Deduplicates signals by entry price zone so that
 * the same consolidation breakout is not counted multiple times as the window
 * advances through the retest period.
 */
export function runBreakoutBacktest(
  candles: BacktestCandle[],
  options: BacktestOptions,
): BacktestSummary {
  const { symbol, timeframe, startIdx = 30 } = options
  const assetType = options.assetType

  if (candles.length < 30) {
    return emptyBacktest(symbol, timeframe, assetType, candles.length)
  }

  const signals: BacktestSignalResult[] = []
  const seenEntries = new Set<string>()

  for (let endIdx = startIdx; endIdx < candles.length - 1; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)

    const bkCandles: BreakoutContext['candles'] = slice.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      timestamp: new Date(c.time * 1000).toISOString(),
    }))

    const ctx: BreakoutContext = {
      symbol,
      timeframe,
      assetType: getBKAssetType(symbol),
      candles: bkCandles,
    }

    const sig = analyzeBreakout(ctx)
    if (sig.signal === 'NO_TRADE') continue

    // Deduplicate: same consolidation zone across multiple window endpoints
    const entryKey = sig.entry_price.toPrecision(5)
    if (seenEntries.has(entryKey)) continue
    seenEntries.add(entryKey)

    const direction = sig.signal as 'BUY' | 'SELL'
    const trade = simulateTrade(candles, endIdx, sig.entry_price, sig.sl_price, sig.tp1_price, direction)

    signals.push({
      id: sig.id,
      signalIdx: endIdx,
      time: candles[endIdx].time,
      direction,
      entry: sig.entry_price,
      sl: sig.sl_price,
      tp1: sig.tp1_price,
      tp2: sig.tp2_price,
      tier: sig.tier,
      confidence: sig.confidence_pct,
      score: sig.score,
      tp1_source: 'structure',
      tp2_source: 'structure',
      order_block_confluence: sig.retest_entry ?? false,
      liquidity_sweep:        sig.stop_hunt_detected ?? false,
      reason:          sig.reason,
      outcome:         trade.outcome,
      achievedRR:      trade.achievedRR,
      barsToResolution: trade.barsToResolution,
    })
  }

  return buildSummary(symbol, timeframe, assetType, candles.length, signals)
}

// ---------------------------------------------------------------------------
// Supply & Demand backtest
// ---------------------------------------------------------------------------

function getSDAssetType_bt(symbol: string): SDAssetType {
  const crypto = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const stocks = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (crypto.includes(symbol)) return 'CRYPTO'
  if (stocks.includes(symbol)) return 'STOCKS'
  return 'FOREX'
}

export function runSDBacktest(candles: BacktestCandle[], options: BacktestOptions): BacktestSummary {
  const { symbol, timeframe, assetType, startIdx = 30 } = options
  if (candles.length < 30) return emptyBacktest(symbol, timeframe, assetType, candles.length)

  const signals: BacktestSignalResult[] = []
  const seen    = new Set<string>()
  for (let endIdx = startIdx; endIdx < candles.length - 1; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)

    const sdCandles: SupplyDemandContext['candles'] = slice.map((c) => ({
      open:      c.open,
      high:      c.high,
      low:       c.low,
      close:     c.close,
      volume:    c.volume ?? 0,
      timestamp: new Date(c.time * 1000).toISOString(),
    }))

    const ctx: SupplyDemandContext = {
      symbol,
      timeframe,
      assetType: getSDAssetType_bt(symbol),
      candles:   sdCandles,
    }

    const sig = analyzeSupplyDemand(ctx)
    if (sig.signal === 'NO_TRADE') continue

    const bucket = sig.entry_price.toPrecision(5)
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const direction = sig.signal as 'BUY' | 'SELL'
    const trade = simulateTrade(candles, endIdx, sig.entry_price, sig.sl_price, sig.tp1_price, direction)

    signals.push({
      id:                    sig.id,
      signalIdx:             endIdx,
      time:                  candles[endIdx].time,
      direction,
      entry:                 sig.entry_price,
      sl:                    sig.sl_price,
      tp1:                   sig.tp1_price,
      tp2:                   sig.tp2_price,
      tier:                  sig.tier,
      confidence:            sig.confidence_pct,
      score:                 sig.score,
      tp1_source:            'structure',
      tp2_source:            'structure',
      order_block_confluence: sig.htf_zone_nested,
      liquidity_sweep:        sig.liquidity_swept,
      reason:                 sig.reason,
      outcome:                trade.outcome,
      achievedRR:             trade.achievedRR,
      barsToResolution:       trade.barsToResolution,
    })
  }

  return buildSummary(symbol, timeframe, assetType, candles.length, signals)
}
