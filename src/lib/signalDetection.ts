import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore'
import type { Candle } from '@/lib/marketData'
import { analyzeWickRejection } from '@/lib/algorithms/wickRejection'
import type { WickRejectionContext, WickRejectionAssetType, WickRejectionHTFBias } from '@/lib/algorithms/wickRejection'
import { analyzeOrderBlock } from '@/lib/algorithms/orderBlockStrategy'
import type { OrderBlockContext } from '@/lib/algorithms/orderBlock/types'
import type { AssetType } from '@/lib/algorithms/strategyConfig'
import type { Timeframe } from '@/types'
import { analyzeTrendFollowing } from '@/lib/algorithms/trendFollowingStrategy'
import type { TrendFollowingContext } from '@/lib/algorithms/trendFollowing/types'
import { analyzeBreakout } from '@/lib/algorithms/breakoutStrategy'
import type { BreakoutContext, BKAssetType } from '@/lib/algorithms/breakout/types'
import { analyzeSupplyDemand } from '@/lib/algorithms/supplyDemandStrategy'
import type { SupplyDemandContext, SDAssetType } from '@/lib/algorithms/supplyDemand/types'

export type RiskLabel = 'Low' | 'Medium' | 'High'

export interface AnalysisSignal {
  id: string
  time: UTCTimestamp
  strategyId: string
  strategyLabel: string
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  risk: RiskLabel
  reason: string[]
}

const CRYPTO_SYMBOLS: ChartSymbol[] = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
const STOCK_SYMBOLS: ChartSymbol[] = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']

export function priceDigits(symbol: ChartSymbol): number {
  if (symbol === 'USDJPY') return 3
  if (symbol === 'XAGUSD') return 3
  if (symbol === 'XAUUSD') return 2
  if (symbol === 'MNQ') return 2
  if (symbol === 'SPX500' || symbol === 'NAS100' || symbol === 'US30' || symbol === 'DE40' || symbol === 'UK100' || symbol === 'JP225' || symbol === 'FRA40' || symbol === 'AUS200') return 1
  if (symbol === 'WTI' || symbol === 'BRENT' || symbol === 'NATGAS') return 2
  if (symbol === 'BTCUSDT' || symbol === 'ETHUSD') return 1
  if (symbol === 'SOLUSDT' || symbol === 'XRPUSDT' || symbol === 'ADAUSDT' || symbol === 'DOGEUSDT' || symbol === 'BNBUSDT') return 3
  if (symbol === 'EURJPY' || symbol === 'GBPJPY') return 3
  return 5
}

export function getAssetType(sym: ChartSymbol): WickRejectionAssetType {
  if (CRYPTO_SYMBOLS.includes(sym)) return 'CRYPTO'
  if (STOCK_SYMBOLS.includes(sym)) return 'STOCKS'
  return 'FOREX'
}

export function riskFromConfidence(confidence: number): RiskLabel {
  if (confidence >= 85) return 'Low'
  if (confidence >= 77) return 'Medium'
  return 'High'
}

export function calcATR14(candles: Candle[]): number[] {
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

function calcVolumeMa(candles: Candle[], upToIdx: number, period = 20): number {
  const start = Math.max(0, upToIdx - period + 1)
  const slice = candles.slice(start, upToIdx + 1).map((c) => c.volume ?? 0)
  if (slice.length === 0) return 0
  return slice.reduce((sum, volume) => sum + volume, 0) / slice.length
}

function findSwingZones(candles: Candle[], lookback = 3): number[] {
  const zones: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]
    let isLow = true
    let isHigh = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].low <= c.low) isLow = false
      if (candles[j].high >= c.high) isHigh = false
    }
    if (isLow) zones.push(c.low)
    if (isHigh) zones.push(c.high)
  }
  return zones
}

function findSwingHighs(candles: Candle[], lookback = 3): number[] {
  const highs: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]
    let isHigh = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= c.high) { isHigh = false; break }
    }
    if (isHigh) highs.push(c.high)
  }
  return highs
}

function findSwingLows(candles: Candle[], lookback = 3): number[] {
  const lows: number[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].low <= c.low) { isLow = false; break }
    }
    if (isLow) lows.push(c.low)
  }
  return lows
}

function calcOrderBlock(
  candles: Candle[],
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

function calcHTFBias(candles: Candle[]): WickRejectionHTFBias {
  if (candles.length < 20) return 'neutral'
  const period = Math.min(50, candles.length)
  const avg = candles.slice(-period).reduce((sum, c) => sum + c.close, 0) / period
  const last = candles[candles.length - 1].close
  const threshold = avg * 0.001
  if (last > avg + threshold) return 'bullish'
  if (last < avg - threshold) return 'bearish'
  return 'neutral'
}

export function runWickRejectionOnCandles(
  candles: Candle[],
  sym: ChartSymbol,
  activeTimeframe: ChartTimeframe,
): AnalysisSignal[] {
  if (candles.length < 20) return []
  const assetType = getAssetType(sym)
  const atrArr = calcATR14(candles)
  const zones = findSwingZones(candles, 3)
  const swingHighs = findSwingHighs(candles, 3)
  const swingLows = findSwingLows(candles, 3)
  const htfBias = calcHTFBias(candles)
  const results: AnalysisSignal[] = []
  const startIdx = Math.max(14, candles.length - 30)
  const endIdx = candles.length - 2

  for (let i = startIdx; i <= endIdx; i++) {
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
      symbol: sym,
      assetType,
      timeframe: activeTimeframe as Timeframe,
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
      swingHighs: swingHighs.filter((h) => h > candle.close),
      swingLows: swingLows.filter((l) => l < candle.close),
      orderBlockZone: calcOrderBlock(candles, atrArr, i, 20),
    }

    const sig = analyzeWickRejection(ctx)
    if (sig.signal !== 'NO_TRADE') {
      const rr =
        sig.sl_price > 0
          ? Number(
              (
                Math.abs(sig.tp1_price - sig.entry_price) /
                Math.abs(sig.entry_price - sig.sl_price)
              ).toFixed(2),
            )
          : 0
      results.push({
        id: sig.id,
        time: candle.time,
        strategyId: 'wick-rejection',
        strategyLabel: 'Wick Rejection',
        direction: sig.signal as 'BUY' | 'SELL',
        entry: sig.entry_price,
        sl: sig.sl_price,
        tp: sig.tp1_price,
        rr,
        confidence: sig.confidence_pct,
        risk: riskFromConfidence(sig.confidence_pct),
        reason: sig.reason,
      })
    }
  }
  return results
}

// ─────────────────────────────────────────────
// Order Block strategy runner
// ─────────────────────────────────────────────

function getOBAssetType(sym: ChartSymbol): AssetType {
  const CRYPTO_SYMS: ChartSymbol[] = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const STOCK_SYMS: ChartSymbol[] = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (CRYPTO_SYMS.includes(sym)) return 'CRYPTO'
  if (STOCK_SYMS.includes(sym)) return 'STOCKS'
  return 'FOREX'
}

export function runOrderBlockOnCandles(
  candles: Candle[],
  sym: ChartSymbol,
  activeTimeframe: ChartTimeframe,
): AnalysisSignal[] {
  // Need enough candles for swings + BOS + OB formation + price return
  const MIN_WINDOW = 50
  if (candles.length < MIN_WINDOW) return []

  const atrArr = calcATR14(candles)

  // Scan multiple recent candle-window endpoints (rolling window).
  // For each endpoint i, we check what setup existed at that slice.
  // This mirrors the wick-rejection loop and catches setups where
  // the BOS confirmed mid-history and price is currently returning to the OB.
  const SCAN_BACK = 40
  const scanStart = Math.max(MIN_WINDOW - 1, candles.length - 1 - SCAN_BACK)
  const scanEnd = candles.length - 1

  const results: AnalysisSignal[] = []
  // Deduplicate: bucket by entry_proximal rounded to 5 significant figures
  const seen = new Set<string>()

  for (let endIdx = scanStart; endIdx <= scanEnd; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)
    const atr14 = atrArr[endIdx] ?? atrArr[atrArr.length - 1] ?? 0

    const obCandles: OrderBlockContext['candles'] = slice.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      timestamp: new Date((c.time as number) * 1000).toISOString(),
    }))

    const ctx: OrderBlockContext = {
      symbol: sym,
      asset_type: getOBAssetType(sym),
      timeframe: activeTimeframe as Timeframe,
      candles: obCandles,
      atr14,
      volumeMa20: calcVolumeMa(candles, endIdx, 20),
    }

    const sig = analyzeOrderBlock(ctx)
    if (sig.signal === 'NO_TRADE') continue

    // Deduplicate by price zone (same OB surfaced across multiple window sizes)
    const bucket = sig.entry_proximal.toPrecision(5)
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const entry = sig.entry_proximal
    const rr =
      sig.sl_price > 0
        ? Number(
            (
              Math.abs(sig.tp1_price - entry) /
              Math.abs(entry - sig.sl_price)
            ).toFixed(2),
          )
        : 0

    results.push({
      id: sig.id,
      time: candles[endIdx].time,
      strategyId: 'order-block',
      strategyLabel: 'Order Block',
      direction: sig.signal as 'BUY' | 'SELL',
      entry,
      sl: sig.sl_price,
      tp: sig.tp1_price,
      rr,
      confidence: sig.confidence_pct,
      risk: riskFromConfidence(sig.confidence_pct),
      reason: sig.reason,
    })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

// ─────────────────────────────────────────────
// Trend Following strategy runner
// ─────────────────────────────────────────────

export function runTrendFollowingOnCandles(
  candles: Candle[],
  sym: ChartSymbol,
  activeTimeframe: ChartTimeframe,
): AnalysisSignal[] {
  const MIN_CANDLES = 50
  if (candles.length < MIN_CANDLES) return []

  const SCAN_BACK = 40
  const scanStart = Math.max(MIN_CANDLES - 1, candles.length - 1 - SCAN_BACK)
  const scanEnd = candles.length - 1
  const results: AnalysisSignal[] = []
  const seen = new Set<string>()

  for (let endIdx = scanStart; endIdx <= scanEnd; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)
    const tfCandles = slice.map(c => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      timestamp: new Date((c.time as number) * 1000).toISOString(),
    }))

    const ctx: TrendFollowingContext = {
      symbol: sym,
      timeframe: activeTimeframe,
      asset_type: getOBAssetType(sym),
      candles: tfCandles,
    }

    const sig = analyzeTrendFollowing(ctx)
    if (sig.signal === 'NO_TRADE') continue

    const bucket = sig.entry_price.toPrecision(5)
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const rr =
      sig.sl_price > 0
        ? Number(
            (
              Math.abs(sig.tp1_price - sig.entry_price) /
              Math.abs(sig.entry_price - sig.sl_price)
            ).toFixed(2),
          )
        : 0

    results.push({
      id: sig.id,
      time: candles[endIdx].time,
      strategyId: 'trend-following',
      strategyLabel: 'Trend Following',
      direction: sig.signal as 'BUY' | 'SELL',
      entry: sig.entry_price,
      sl: sig.sl_price,
      tp: sig.tp1_price,
      rr,
      confidence: sig.confidence_pct,
      risk: riskFromConfidence(sig.confidence_pct),
      reason: sig.reason,
    })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

// ─────────────────────────────────────────────
// Breakout strategy runner
// ─────────────────────────────────────────────

function getBKAssetType(sym: ChartSymbol): BKAssetType {
  const CRYPTO_SYMS: ChartSymbol[] = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const STOCK_SYMS: ChartSymbol[] = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (CRYPTO_SYMS.includes(sym)) return 'CRYPTO'
  if (STOCK_SYMS.includes(sym)) return 'STOCKS'
  return 'FOREX'
}

export function runBreakoutOnCandles(
  candles: Candle[],
  sym: ChartSymbol,
  activeTimeframe: ChartTimeframe,
): AnalysisSignal[] {
  const MIN_CANDLES = 30
  if (candles.length < MIN_CANDLES) return []

  const SCAN_BACK = 40
  const scanStart = Math.max(MIN_CANDLES - 1, candles.length - 1 - SCAN_BACK)
  const scanEnd = candles.length - 1
  const results: AnalysisSignal[] = []
  const seen = new Set<string>()

  for (let endIdx = scanStart; endIdx <= scanEnd; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)
    const bkCandles: BreakoutContext['candles'] = slice.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
      timestamp: new Date((c.time as number) * 1000).toISOString(),
    }))

    const ctx: BreakoutContext = {
      symbol: sym,
      timeframe: activeTimeframe,
      assetType: getBKAssetType(sym),
      candles: bkCandles,
    }

    const sig = analyzeBreakout(ctx)
    if (sig.signal === 'NO_TRADE') continue

    const bucket = sig.entry_price.toPrecision(5)
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const rr =
      sig.sl_price > 0
        ? Number(
            (
              Math.abs(sig.tp1_price - sig.entry_price) /
              Math.abs(sig.entry_price - sig.sl_price)
            ).toFixed(2),
          )
        : 0

    results.push({
      id: sig.id,
      time: candles[endIdx].time,
      strategyId: 'breakout',
      strategyLabel: 'Breakout',
      direction: sig.signal as 'BUY' | 'SELL',
      entry: sig.entry_price,
      sl: sig.sl_price,
      tp: sig.tp1_price,
      rr,
      confidence: sig.confidence_pct,
      risk: riskFromConfidence(sig.confidence_pct),
      reason: sig.reason,
    })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

// ─────────────────────────────────────────────
// Supply & Demand strategy runner
// ─────────────────────────────────────────────

function getSDAssetType(sym: ChartSymbol): SDAssetType {
  const CRYPTO_SYMS: ChartSymbol[] = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT']
  const STOCK_SYMS: ChartSymbol[] = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI']
  if (CRYPTO_SYMS.includes(sym)) return 'CRYPTO'
  if (STOCK_SYMS.includes(sym)) return 'STOCKS'
  return 'FOREX'
}

export function runSupplyDemandOnCandles(
  candles: Candle[],
  sym: ChartSymbol,
  activeTimeframe: ChartTimeframe,
): AnalysisSignal[] {
  const MIN_CANDLES = 30
  if (candles.length < MIN_CANDLES) return []

  const SCAN_BACK = 40
  const scanStart = Math.max(MIN_CANDLES - 1, candles.length - 1 - SCAN_BACK)
  const scanEnd = candles.length - 1
  const results: AnalysisSignal[] = []
  const seen = new Set<string>()

  for (let endIdx = scanStart; endIdx <= scanEnd; endIdx++) {
    const slice = candles.slice(0, endIdx + 1)
    const sdCandles: SupplyDemandContext['candles'] = slice.map((c) => ({
      open:      c.open,
      high:      c.high,
      low:       c.low,
      close:     c.close,
      volume:    c.volume ?? 0,
      timestamp: new Date((c.time as number) * 1000).toISOString(),
    }))

    const ctx: SupplyDemandContext = {
      symbol:    sym,
      timeframe: activeTimeframe,
      assetType: getSDAssetType(sym),
      candles:   sdCandles,
    }

    const sig = analyzeSupplyDemand(ctx)
    if (sig.signal === 'NO_TRADE') continue

    const bucket = sig.entry_price.toPrecision(5)
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const rr =
      sig.sl_price > 0
        ? Number(
            (
              Math.abs(sig.tp1_price - sig.entry_price) /
              Math.abs(sig.entry_price - sig.sl_price)
            ).toFixed(2),
          )
        : 0

    results.push({
      id:            sig.id,
      time:          candles[endIdx].time,
      strategyId:    'supply-demand',
      strategyLabel: 'Supply & Demand',
      direction:     sig.signal as 'BUY' | 'SELL',
      entry:         sig.entry_price,
      sl:            sig.sl_price,
      tp:            sig.tp1_price,
      rr,
      confidence:    sig.confidence_pct,
      risk:          riskFromConfidence(sig.confidence_pct),
      reason:        sig.reason,
    })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

// ─────────────────────────────────────────────
// Multi-strategy aggregator
// ─────────────────────────────────────────────

/**
 * Runs signal detection for each active strategy and merges results.
 * Deduplicates by id and sorts by confidence descending.
 */
export function runSignalsForStrategies(
  candles: Candle[],
  sym: ChartSymbol,
  activeTimeframe: ChartTimeframe,
  activeStrategyIds: string[],
): AnalysisSignal[] {
  const results: AnalysisSignal[] = []

  if (activeStrategyIds.includes('wick-rejection') || activeStrategyIds.length === 0) {
    results.push(...runWickRejectionOnCandles(candles, sym, activeTimeframe))
  }
  if (activeStrategyIds.includes('order-block')) {
    results.push(...runOrderBlockOnCandles(candles, sym, activeTimeframe))
  }
  if (activeStrategyIds.includes('trend-following')) {
    results.push(...runTrendFollowingOnCandles(candles, sym, activeTimeframe))
  }
  if (activeStrategyIds.includes('breakout')) {
    results.push(...runBreakoutOnCandles(candles, sym, activeTimeframe))
  }
  if (activeStrategyIds.includes('supply-demand') || activeStrategyIds.includes('supply_demand')) {
    results.push(...runSupplyDemandOnCandles(candles, sym, activeTimeframe))
  }

  // Deduplicate by id
  const seen = new Set<string>()
  return results
    .filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    .sort((a, b) => b.confidence - a.confidence)
}
