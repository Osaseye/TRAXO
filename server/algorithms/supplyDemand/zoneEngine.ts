// ─── Supply & Demand Zone Engine ─────────────────────────────────────────────
// Phase 1: ATR normalisation, liquidity pool GC, zone detection & classification

import type {
  SDCandle,
  SDZoneType,
  SDPattern,
  SDSwingPoint,
  LiquidityPool,
  SupplyDemandZone,
} from './types'

// ─── ATR (Wilder Smoothing) ──────────────────────────────────────────────────

export function computeSDATR(candles: SDCandle[], period = 14): number[] {
  const atr: number[] = new Array(candles.length).fill(0)
  if (candles.length < period + 1) return atr

  let sumTR = 0
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close),
    )
    sumTR += tr
  }
  atr[period] = sumTR / period

  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close),
    )
    atr[i] = (atr[i - 1] * (period - 1) + tr) / period
  }

  return atr
}

// ─── Volume Moving Average (VMA20) ───────────────────────────────────────────

export function computeVMA20(candles: SDCandle[], upToIndex: number): number {
  const start = Math.max(0, upToIndex - 19)
  const slice = candles.slice(start, upToIndex + 1)
  const sum   = slice.reduce((acc, c) => acc + c.volume, 0)
  return slice.length > 0 ? sum / slice.length : 0
}

export function hasRealVolume(candles: SDCandle[]): boolean {
  const sample = candles.slice(-30)
  return sample.some(c => c.volume > 0)
}

// ─── Refinement 4: Orphaned Liquidity Pool GC ───────────────────────────────
/**
 * Removes liquidity pools older than `maxAge` candles from the current index.
 * Prevents memory / compute bloat in long-running sessions.
 */
export function pruneStaleSwingPoints(
  pools:        LiquidityPool[],
  currentIndex: number,
  maxAge        = 100,
): LiquidityPool[] {
  return pools.filter(p => currentIndex - p.formedAtIndex <= maxAge)
}

// ─── Swing Point Detection ───────────────────────────────────────────────────

export function detectSwingHighs(
  candles: SDCandle[],
  lookback = 5,
): SDSwingPoint[] {
  const highs: SDSwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const pivot = candles[i].high
    let isHigh  = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= pivot) { isHigh = false; break }
    }
    if (isHigh) highs.push({ price: pivot, index: i, type: 'high' })
  }
  return highs
}

export function detectSwingLows(
  candles: SDCandle[],
  lookback = 5,
): SDSwingPoint[] {
  const lows: SDSwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const pivot = candles[i].low
    let isLow   = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= pivot) { isLow = false; break }
    }
    if (isLow) lows.push({ price: pivot, index: i, type: 'low' })
  }
  return lows
}

// ─── Liquidity Pool Mapping (with auto-prune) ────────────────────────────────

export function mapLiquidityPools(
  candles:      SDCandle[],
  currentIndex: number,
  _atr14:       number,   // reserved for future proximity filters
  maxAge        = 100,
): LiquidityPool[] {
  const highs = detectSwingHighs(candles.slice(0, currentIndex + 1))
  const lows  = detectSwingLows(candles.slice(0, currentIndex + 1))

  const raw: LiquidityPool[] = [
    ...highs.map(h => ({ price: h.price, type: 'BSL' as const, formedAtIndex: h.index })),
    ...lows.map(l  => ({ price: l.price, type: 'SSL' as const, formedAtIndex: l.index })),
  ]

  return pruneStaleSwingPoints(raw, currentIndex, maxAge)
}

// ─── Candle Classification ───────────────────────────────────────────────────

export function isBaseCandle(candle: SDCandle, atr14: number): boolean {
  const body = Math.abs(candle.close - candle.open)
  return body < 0.40 * atr14
}

export function isDepartureCandle(candle: SDCandle, atr14: number): boolean {
  const body = Math.abs(candle.close - candle.open)
  return body > 2.0 * atr14
}

// ─── Pattern Classifier ──────────────────────────────────────────────────────

function countBullish(candles: SDCandle[]): number {
  return candles.filter(c => c.close > c.open).length
}
function countBearish(candles: SDCandle[]): number {
  return candles.filter(c => c.close < c.open).length
}

export function classifyPattern(
  candles: SDCandle[],
  i:       number,
  atr14:   number,
): { pattern: SDPattern; zoneType: SDZoneType; baseCandles: SDCandle[]; departureIndex: number } | null {
  if (i < 3) return null

  const priorCandles = candles.slice(i - 3, i)
  const baseCandles: SDCandle[] = []
  let j = i

  while (j < candles.length && isBaseCandle(candles[j], atr14) && baseCandles.length < 4) {
    baseCandles.push(candles[j])
    j++
  }

  if (baseCandles.length === 0) return null
  if (j >= candles.length)      return null

  const departure = candles[j]
  if (!isDepartureCandle(departure, atr14)) return null

  const priorBullish = countBullish(priorCandles) >= 2
  const priorBearish = countBearish(priorCandles) >= 2
  const depBullish   = departure.close > departure.open
  const depBearish   = departure.close < departure.open

  let pattern:  SDPattern  | null = null
  let zoneType: SDZoneType | null = null

  if (priorBearish && depBullish) { pattern = 'DBR'; zoneType = 'DEMAND' }
  if (priorBullish && depBearish) { pattern = 'RBD'; zoneType = 'SUPPLY' }
  if (priorBullish && depBullish) { pattern = 'RBR'; zoneType = 'DEMAND' }
  if (priorBearish && depBearish) { pattern = 'DBD'; zoneType = 'SUPPLY' }

  if (!pattern || !zoneType) return null

  return { pattern, zoneType, baseCandles, departureIndex: j }
}

// ─── Zone Boundaries ─────────────────────────────────────────────────────────

export function calculateZoneBoundaries(
  baseCandles: SDCandle[],
  zoneType:    SDZoneType,
  atr14:       number,
): { proximalLine: number; distalLine: number; mitigationLevel: number; zoneWidthAtr: number } {
  let proximalLine: number
  let distalLine:   number

  if (zoneType === 'DEMAND') {
    distalLine   = Math.min(...baseCandles.map(c => c.low))
    proximalLine = Math.max(...baseCandles.map(c => c.close))
  } else {
    distalLine   = Math.max(...baseCandles.map(c => c.high))
    proximalLine = Math.min(...baseCandles.map(c => c.close))
  }

  const mitigationLevel = (proximalLine + distalLine) / 2
  const zoneWidthAtr    = Math.abs(distalLine - proximalLine) / (atr14 || 1)

  return { proximalLine, distalLine, mitigationLevel, zoneWidthAtr }
}

// ─── Liquidity Sweep Validator ───────────────────────────────────────────────

export function checkLiquiditySweep(
  baseCandles: SDCandle[],
  pools:       LiquidityPool[],
  atr14:       number,
  zoneType:    SDZoneType,
): boolean {
  const targetPoolType = zoneType === 'DEMAND' ? 'SSL' : 'BSL'
  const baseLow  = Math.min(...baseCandles.map(c => c.low))
  const baseHigh = Math.max(...baseCandles.map(c => c.high))
  const anchor   = zoneType === 'DEMAND' ? baseLow : baseHigh

  for (const pool of pools) {
    if (pool.type !== targetPoolType) continue
    if (Math.abs(anchor - pool.price) <= 0.2 * atr14) return true
  }
  return false
}

// ─── FVG Inside Zone Detection ───────────────────────────────────────────────

export function detectFVGInside(
  candles:  SDCandle[],
  proximal: number,
  distal:   number,
  atr14:    number,
): boolean {
  const lo = Math.min(proximal, distal)
  const hi = Math.max(proximal, distal)

  for (let i = 1; i < candles.length - 1; i++) {
    const gap = candles[i + 1].low - candles[i - 1].high   // bullish FVG
    if (gap > 0.1 * atr14) {
      const gapMid = (candles[i - 1].high + candles[i + 1].low) / 2
      if (gapMid >= lo && gapMid <= hi) return true
    }
    const gap2 = candles[i - 1].low - candles[i + 1].high  // bearish FVG
    if (gap2 > 0.1 * atr14) {
      const gapMid2 = (candles[i + 1].high + candles[i - 1].low) / 2
      if (gapMid2 >= lo && gapMid2 <= hi) return true
    }
  }
  return false
}

// ─── Tap Count ───────────────────────────────────────────────────────────────

export function checkTapCount(
  candles:      SDCandle[],
  proximalLine: number,
  distalLine:   number,
  departureIdx: number,
  currentIndex: number,
  zoneType:     SDZoneType,
): number {
  const lo   = Math.min(proximalLine, distalLine)
  const hi   = Math.max(proximalLine, distalLine)
  let   taps = 0

  for (let i = departureIdx + 1; i <= currentIndex; i++) {
    const c = candles[i]
    if (zoneType === 'DEMAND') {
      if (c.low <= hi && c.low >= lo) taps++
    } else {
      if (c.high >= lo && c.high <= hi) taps++
    }
  }
  return taps
}

// ─── Zone Quality Score (0–10 rubric, Phase 2) ───────────────────────────────
// Refinement 1: departure_volume_ratio check integrated into quality scoring

export function scoreZoneQuality(
  zone:                  Omit<SupplyDemandZone, 'quality_score'>,
  htfBias:               'BULLISH' | 'BEARISH' | 'NEUTRAL' | undefined,
  hasVolume:             boolean,
  departureVolumeRatio:  number | null,
  opposingZoneDistance:  number,   // distance to next opposing zone in price units
): number {
  let score = 0

  // Freshness (0–2)
  if (zone.tap_count === 0)      score += 2
  else if (zone.tap_count === 1) score += 1

  // Departure speed (0–2)
  if (zone.departure_speed >= 3.0)      score += 2
  else if (zone.departure_speed >= 2.0) score += 1

  // Base candle quality (0–2)
  if (zone.base_candle_count <= 2)      score += 2
  else if (zone.base_candle_count <= 4) score += 1

  // HTF alignment (0–1)
  if (
    (zone.type === 'DEMAND' && htfBias === 'BULLISH') ||
    (zone.type === 'SUPPLY' && htfBias === 'BEARISH')
  ) score += 1

  // Departure size bonus (0–1)
  if (zone.departure_speed >= 3.0) score += 1

  // Pattern purity (0–1)
  if (zone.pattern === 'DBR' || zone.pattern === 'RBD') score += 1
  else score += 0.5

  // RR availability (0–1)
  const riskDistance = zone.zone_width
  if (riskDistance > 0 && opposingZoneDistance >= 2 * riskDistance) score += 1

  // Refinement 1: Volume confluence penalty
  // High-speed departure + exceptionally low volume = false institutional print
  if (hasVolume && departureVolumeRatio !== null) {
    if (departureVolumeRatio < 0.8) score -= 1.5  // Very low volume on departure — likely false print
    else if (departureVolumeRatio >= 1.5) score += 0.5  // Volume confirmation bonus
  }

  return Math.min(Math.max(Math.round(score), 0), 10)
}

// ─── Primary Zone Detector ───────────────────────────────────────────────────

export function detectZones(
  candles:      SDCandle[],
  atr:          number[],
  currentIndex: number,
  pools:        LiquidityPool[],
): SupplyDemandZone[] {
  const zones:   SupplyDemandZone[] = []
  const hasVol   = hasRealVolume(candles)
  const scanFrom = Math.max(6, currentIndex - 200)  // look back up to 200 candles

  for (let i = scanFrom; i < currentIndex - 3; i++) {
    const atr14 = atr[i]
    if (atr14 <= 0) continue

    const result = classifyPattern(candles, i, atr14)
    if (!result) continue

    const { pattern, zoneType, baseCandles, departureIndex } = result

    const { proximalLine, distalLine, mitigationLevel, zoneWidthAtr } =
      calculateZoneBoundaries(baseCandles, zoneType, atr14)

    // Width gate — skip before scoring to avoid wasted work
    if (zoneWidthAtr > 2.0) continue

    const departure       = candles[departureIndex]
    const depBody         = Math.abs(departure.close - departure.open)
    const departureSpeed  = depBody / atr14

    // Refinement 1: compute departure volume ratio
    let departureVolumeRatio: number | null = null
    if (hasVol) {
      const vma20 = computeVMA20(candles, departureIndex)
      departureVolumeRatio = vma20 > 0 ? departure.volume / vma20 : null
    }

    const tapCount        = checkTapCount(candles, proximalLine, distalLine, departureIndex, currentIndex, zoneType)
    const liquiditySwept  = checkLiquiditySweep(baseCandles, pools, atr14, zoneType)
    const fvgInside       = detectFVGInside(candles.slice(i, departureIndex + 2), proximalLine, distalLine, atr14)

    const zonePartial = {
      id:                     `sd_${i}_${departureIndex}`,
      type:                   zoneType,
      pattern,
      proximal_line:          proximalLine,
      distal_line:            distalLine,
      mitigation_level:       mitigationLevel,
      zone_width:             Math.abs(distalLine - proximalLine),
      zone_width_atr:         zoneWidthAtr,
      base_candle_count:      baseCandles.length,
      departure_speed:        departureSpeed,
      departure_volume_ratio: departureVolumeRatio,
      fresh:                  tapCount === 0,
      tap_count:              tapCount,
      formed_at:              Date.parse(candles[departureIndex].timestamp) || 0,
      base_start_index:       i,
      departure_index:        departureIndex,
      htf_aligned:            false,  // caller fills this
      fvg_inside:             fvgInside,
      liquidity_swept:        liquiditySwept,
    }

    // Quality score — no opposing zone distance available here; caller can refine
    const quality = scoreZoneQuality(zonePartial, undefined, hasVol, departureVolumeRatio, 0)

    zones.push({ ...zonePartial, quality_score: quality })
  }

  return zones
}
