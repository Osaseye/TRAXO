/**
 * TRAXO Trend Following — EMA / ATR / ADX / VMA Calculations
 *
 * All indicator math is isolated here.  Engine files import pre-computed arrays
 * from the orchestrator; they never call these functions directly.
 */

import type { TFCandle } from './types'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sum(arr: number[], start: number, end: number): number {
  let s = 0
  for (let i = start; i < end; i++) s += arr[i]
  return s
}

// ─────────────────────────────────────────────
// Simple Moving Average
// ─────────────────────────────────────────────

export function computeSMA(values: number[], period: number): number[] {
  const n = values.length
  const result = new Array<number>(n).fill(0)
  for (let i = period - 1; i < n; i++) {
    result[i] = sum(values, i - period + 1, i + 1) / period
  }
  return result
}

// ─────────────────────────────────────────────
// Exponential Moving Average (standard, not Wilder)
// ─────────────────────────────────────────────

export function computeEMA(values: number[], period: number): number[] {
  const n = values.length
  const result = new Array<number>(n).fill(0)
  if (n < period) return result

  const k = 2 / (period + 1)
  // Seed: SMA of first `period` values
  result[period - 1] = sum(values, 0, period) / period
  for (let i = period; i < n; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k)
  }
  return result
}

// ─────────────────────────────────────────────
// Average True Range (Wilder smoothing)
// ─────────────────────────────────────────────

export function computeATR(candles: TFCandle[], period = 14): number[] {
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
    if (i === period - 1) {
      atr[i] = sum(tr, 0, period) / period
    } else if (i >= period) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    } else {
      atr[i] = sum(tr, 0, i + 1) / (i + 1)
    }
  }
  return atr
}

// ─────────────────────────────────────────────
// Average Directional Index (Wilder)
// ─────────────────────────────────────────────

export function computeADX(candles: TFCandle[], period = 14): number[] {
  const n = candles.length
  const adx = new Array<number>(n).fill(0)
  if (n < period * 2 + 1) return adx

  const plusDM  = new Array<number>(n).fill(0)
  const minusDM = new Array<number>(n).fill(0)
  const tr      = new Array<number>(n).fill(0)

  for (let i = 1; i < n; i++) {
    const upMove   = candles[i].high - candles[i - 1].high
    const downMove = candles[i - 1].low - candles[i].low
    plusDM[i]  = upMove > downMove && upMove > 0 ? upMove : 0
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close),
    )
  }

  // Initial Wilder sums (period 1 to period, 0-index 1..period)
  let smoothTR   = sum(tr,      1, period + 1)
  let smoothPDM  = sum(plusDM,  1, period + 1)
  let smoothNDM  = sum(minusDM, 1, period + 1)

  const dx = new Array<number>(n).fill(0)

  for (let i = period; i < n; i++) {
    if (i > period) {
      smoothTR  = smoothTR  - smoothTR  / period + tr[i]
      smoothPDM = smoothPDM - smoothPDM / period + plusDM[i]
      smoothNDM = smoothNDM - smoothNDM / period + minusDM[i]
    }
    const pdi    = smoothTR !== 0 ? (smoothPDM / smoothTR) * 100 : 0
    const ndi    = smoothTR !== 0 ? (smoothNDM / smoothTR) * 100 : 0
    const diSum  = pdi + ndi
    dx[i] = diSum !== 0 ? (Math.abs(pdi - ndi) / diSum) * 100 : 0
  }

  // ADX = Wilder smoothing of DX starting at index period*2-1
  const adxSeedStart = period
  const adxSeedEnd   = period * 2
  let   adxVal       = sum(dx, adxSeedStart, adxSeedEnd) / period
  adx[adxSeedEnd - 1] = adxVal
  for (let i = adxSeedEnd; i < n; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period
    adx[i] = adxVal
  }
  return adx
}

// ─────────────────────────────────────────────
// EMA Stack Assessment
// ─────────────────────────────────────────────

export type EMAStackResult = {
  status:    'ALIGNED' | 'PARTIAL' | 'MESSY'
  direction: 'BULLISH' | 'BEARISH' | 'AMBIGUOUS'
}

export function assessEMAStack(
  price:  number,
  ema20:  number,
  ema50:  number,
  ema200: number,
): EMAStackResult {
  if (price > ema20 && ema20 > ema50 && ema50 > ema200) {
    return { status: 'ALIGNED', direction: 'BULLISH' }
  }
  if (price < ema20 && ema20 < ema50 && ema50 < ema200) {
    return { status: 'ALIGNED', direction: 'BEARISH' }
  }
  // At least one EMA is on the right side but stack isn't perfect
  const bullPartial = ema20 > ema50 || (price > ema50 && ema50 > ema200)
  const bearPartial = ema20 < ema50 || (price < ema50 && ema50 < ema200)
  if (bullPartial || bearPartial) {
    return { status: 'PARTIAL', direction: 'AMBIGUOUS' }
  }
  return { status: 'MESSY', direction: 'AMBIGUOUS' }
}

// ─────────────────────────────────────────────
// ADX Strength Band
// ─────────────────────────────────────────────

export function getTrendStrength(adx: number): 'STRONG' | 'MODERATE' | 'WEAK' {
  if (adx > 40) return 'STRONG'
  if (adx >= 25) return 'MODERATE'
  return 'WEAK'
}
