/**
 * TRAXO Quantitative Technical & Statistical Indicators
 *
 * Precision calculation utilities for proprietary TRAXO engines.
 */

import type { TraxoCandle } from './types';

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = new Array(values.length);
  
  // Seed with SMA
  let sum = 0;
  const seedPeriod = Math.min(period, values.length);
  for (let i = 0; i < seedPeriod; i++) {
    sum += values[i];
  }
  emaValues[seedPeriod - 1] = sum / seedPeriod;

  for (let i = 0; i < seedPeriod - 1; i++) {
    emaValues[i] = values[i];
  }

  for (let i = seedPeriod; i < values.length; i++) {
    emaValues[i] = values[i] * k + emaValues[i - 1] * (1 - k);
  }

  return emaValues;
}

/**
 * Average True Range (ATR)
 */
export function calculateATR(candles: TraxoCandle[], period = 14): number[] {
  if (candles.length < 2) return candles.map((c) => c.high - c.low);
  const tr: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prevClose = candles[i - 1].close;
    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - prevClose),
      Math.abs(current.low - prevClose)
    );
    tr.push(trueRange);
  }

  const atr: number[] = new Array(candles.length);
  let trSum = 0;
  const seed = Math.min(period, candles.length);
  for (let i = 0; i < seed; i++) {
    trSum += tr[i];
  }
  atr[seed - 1] = trSum / seed;

  for (let i = 0; i < seed - 1; i++) {
    atr[i] = tr[i];
  }

  for (let i = seed; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  return atr;
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(candles: TraxoCandle[]): { vwap: number[]; stdDev: number[] } {
  let cumVolume = 0;
  let cumTypicalVolume = 0;
  const vwap: number[] = [];
  const stdDev: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1; // Fallback for zero volume

    cumVolume += vol;
    cumTypicalVolume += typicalPrice * vol;
    const currentVwap = cumTypicalVolume / cumVolume;
    vwap.push(currentVwap);

    // Variance calculation
    let varianceSum = 0;
    for (let j = 0; j <= i; j++) {
      const p = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const v = candles[j].volume > 0 ? candles[j].volume : 1;
      varianceSum += v * Math.pow(p - currentVwap, 2);
    }
    stdDev.push(Math.sqrt(varianceSum / cumVolume));
  }

  return { vwap, stdDev };
}

/**
 * Relative Volume (RVOL)
 */
export function calculateRVOL(candles: TraxoCandle[], lookback = 20): number {
  if (candles.length < 2) return 1.0;
  const currentVol = candles[candles.length - 1].volume || 1;
  const slice = candles.slice(Math.max(0, candles.length - 1 - lookback), candles.length - 1);
  if (slice.length === 0) return 1.0;
  const avgVol = slice.reduce((sum, c) => sum + (c.volume || 1), 0) / slice.length;
  return avgVol > 0 ? currentVol / avgVol : 1.0;
}

/**
 * Swing Highs and Lows (Fractals)
 */
export function findSwingPoints(
  candles: TraxoCandle[],
  leftBars = 3,
  rightBars = 3
): { swingHighs: { index: number; price: number }[]; swingLows: { index: number; price: number }[] } {
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isHigh = false;
      if (candles[j].low <= currentLow) isLow = false;
    }

    if (isHigh) swingHighs.push({ index: i, price: currentHigh });
    if (isLow) swingLows.push({ index: i, price: currentLow });
  }

  return { swingHighs, swingLows };
}
