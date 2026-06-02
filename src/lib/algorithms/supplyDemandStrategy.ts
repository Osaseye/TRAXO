// ─── Supply & Demand Strategy Orchestrator ───────────────────────────────────
// Assembles zone detection, 14-point scoring, risk engine, and 4 refinements
// into a single analysable pipeline that outputs SupplyDemandSignal.

import type { SupplyDemandContext, SupplyDemandSignal, SupplyDemandZone } from './supplyDemand/types'
import {
  computeSDATR,
  mapLiquidityPools,
  detectZones,
  hasRealVolume,
  scoreZoneQuality,
} from './supplyDemand/zoneEngine'
import { scoreSupplyDemand, getSDRiskPct, isActiveSession } from './supplyDemand/scoringEngine'
import {
  calculateSDSL,
  calculateSDTPs,
  calculateSDBreakeven,
  getSDEntryPrice,
} from './supplyDemand/riskEngine'

// Re-export for consumers (backtesting, signalDetection)
export type { SupplyDemandSignal }

// ─── Expiry table (candles by timeframe) ─────────────────────────────────────

const EXPIRY_CANDLES: Record<string, number> = {
  '1m':    50,
  '5m':    50,
  '15m':   50,
  '30m':   50,
  '1h':    50,
  '4h':    50,
  'daily': 30,
}

// ─── NO_TRADE factory ─────────────────────────────────────────────────────────

function noTrade(
  ctx:    SupplyDemandContext,
  reason: string[],
): SupplyDemandSignal {
  return {
    id:                   `sd_${ctx.symbol}_${ctx.timeframe}_notrade_${Date.now()}`,
    strategy_id:          'supply_demand',
    signal:               'NO_TRADE',
    symbol:               ctx.symbol,
    asset_type:           ctx.assetType,
    zone_type:            'DEMAND',
    pattern:              'DBR',
    proximal_line:        0,
    distal_line:          0,
    mitigation_level:     0,
    zone_width_atr:       0,
    zone_quality_score:   0,
    score:                0,
    confidence_pct:       0,
    tier:                 'discard',
    fresh:                false,
    tap_count:            0,
    entry_type:           'limit',
    entry_price:          0,
    sl_price:             0,
    tp1_price:            0,
    tp2_price:            0,
    suggested_risk_pct:   0,
    breakeven_price:      0,
    breakeven_triggered:  false,
    expiry_candles:       50,
    time_decay_limit:     50,
    zone_invalidated:     false,
    htf_aligned:          false,
    htf_zone_nested:      false,
    fvg_inside:           false,
    liquidity_swept:      false,
    departure_candles:    0,
    session_active:       false,
    reason,
    timestamp:            new Date().toISOString(),
  }
}

// ─── Main Analyser ────────────────────────────────────────────────────────────

export function analyzeSupplyDemand(ctx: SupplyDemandContext): SupplyDemandSignal {
  const { candles, symbol, timeframe, assetType } = ctx
  const currentIndex = candles.length - 1

  // ── Guard: minimum candles ────────────────────────────────────────────────
  if (candles.length < 30) {
    return noTrade(ctx, ['GUARD: insufficient candles (< 30)'])
  }

  // ── ATR computation ───────────────────────────────────────────────────────
  const atr  = computeSDATR(candles, 14)
  const atr14 = atr[currentIndex]
  if (atr14 <= 0) return noTrade(ctx, ['GUARD: ATR is zero'])

  // ── Refinement 4: prune stale liquidity pools + map fresh ones ────────────
  const pools = mapLiquidityPools(candles, currentIndex, atr14, 100)

  // ── Zone detection ─────────────────────────────────────────────────────────
  const rawZones = detectZones(candles, atr, currentIndex, pools)

  // ── HTF alignment pass ─────────────────────────────────────────────────────
  const htfBias = ctx.htfTrendDirection ?? 'NEUTRAL'
  const zones: SupplyDemandZone[] = rawZones.map(z => ({
    ...z,
    htf_aligned:
      (z.type === 'DEMAND' && htfBias === 'BULLISH') ||
      (z.type === 'SUPPLY' && htfBias === 'BEARISH'),
  }))

  // ── Quality gate (zone score ≥ 7) ─────────────────────────────────────────
  const tradeable = zones.filter(z => z.quality_score >= 7)
  if (tradeable.length === 0) {
    return noTrade(ctx, ['NO_ZONE: no zones passed quality gate (score ≥ 7)'])
  }

  // ── Refine quality scores with opposing-zone distance ─────────────────────
  const hasVol = hasRealVolume(candles)
  const scored = tradeable.map(z => {
    const opposing = tradeable.filter(o => o.type !== z.type)
    const entry    = getSDEntryPrice(z, atr14)
    const closest  = opposing.reduce((best, o) => {
      const d = Math.abs(o.proximal_line - entry)
      return d < best ? d : best
    }, Infinity)
    const q = scoreZoneQuality(z, htfBias, hasVol, z.departure_volume_ratio, closest)
    return { ...z, quality_score: q }
  })

  // ── Select best zone by quality (prefer fresh DEMAND/SUPPLY nearest price) ─
  const lastClose = candles[currentIndex].close
  const eligible  = scored.filter(z => z.quality_score >= 7)
  if (eligible.length === 0) return noTrade(ctx, ['NO_ZONE: all zones below quality gate after re-score'])

  const best = eligible.slice().sort((a, b) => {
    // Higher quality first, then closer proximal to current price
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score
    return Math.abs(a.proximal_line - lastClose) - Math.abs(b.proximal_line - lastClose)
  })[0]

  // ── Only trigger if price is near the proximal line ──────────────────────
  // (within 1.5 ATR of the proximal edge — zone is "in play")
  const distToProximal = Math.abs(lastClose - best.proximal_line)
  if (distToProximal > 1.5 * atr14) {
    return noTrade(ctx, [
      `NO_TRIGGER: price ${lastClose.toFixed(5)} is ${distToProximal.toFixed(5)} away from proximal (> 1.5 ATR)`,
    ])
  }

  // ── 14-point confidence matrix ─────────────────────────────────────────────
  const htfZoneNested = eligible.some(
    o => o.type === best.type && o !== best &&
         ((best.proximal_line >= o.distal_line && best.distal_line <= o.proximal_line) ||
          (best.distal_line   >= o.proximal_line && best.proximal_line <= o.distal_line))
  )

  const scoring = scoreSupplyDemand({
    zone:                   best,
    atr14,
    htfZoneNested,
    newsMinutesAway:        ctx.newsMinutesAway,
    htfTrendDirection:      ctx.htfTrendDirection,
    perSymbolDrawdownPct:   ctx.perSymbolDrawdownPct,
    perSymbolConsecLosses:  ctx.perSymbolConsecLosses,
    rollingDrawdownPct:     ctx.rollingDrawdownPct,
    consecutiveLosses:      ctx.consecutiveLosses,
  })

  if (scoring.no_trade) return noTrade(ctx, scoring.reason)

  // ── Entry price (Refinement 2: Dynamic OTE) ───────────────────────────────
  const entryPrice = getSDEntryPrice(best, atr14)

  // ── SL gate ───────────────────────────────────────────────────────────────
  const slResult = calculateSDSL(best, atr14)
  if (!slResult.valid) {
    return noTrade(ctx, [slResult.reason ?? 'SL gate failed'])
  }

  // ── TPs (zone-to-zone) ────────────────────────────────────────────────────
  const { tp1_price, tp2_price } = calculateSDTPs(best, atr14, eligible)

  // ── Breakeven ─────────────────────────────────────────────────────────────
  const breakevenPrice = calculateSDBreakeven(entryPrice, atr14, best.type)

  // ── Risk % ────────────────────────────────────────────────────────────────
  const suggestedRiskPct = getSDRiskPct(
    scoring.tier,
    ctx.consecutiveLosses ?? 0,
    ctx.perSymbolConsecLosses ?? 0,
  )

  // ── Assemble signal ───────────────────────────────────────────────────────
  const signal: SupplyDemandSignal['signal'] = best.type === 'DEMAND' ? 'BUY' : 'SELL'
  const expiry = EXPIRY_CANDLES[timeframe.toLowerCase()] ?? 50
  const timestamp = new Date().toISOString()

  return {
    id:                   `sd_${symbol}_${timeframe}_${Date.now()}`,
    strategy_id:          'supply_demand',
    signal,
    symbol,
    asset_type:           assetType,
    zone_type:            best.type,
    pattern:              best.pattern,
    proximal_line:        best.proximal_line,
    distal_line:          best.distal_line,
    mitigation_level:     best.mitigation_level,
    zone_width_atr:       best.zone_width_atr,
    zone_quality_score:   best.quality_score,
    score:                scoring.score,
    confidence_pct:       scoring.confidence_pct,
    tier:                 scoring.tier,
    fresh:                best.fresh,
    tap_count:            best.tap_count,
    entry_type:           'limit',   // S&D is always a limit-order strategy
    entry_price:          entryPrice,
    sl_price:             slResult.sl_price,
    tp1_price,
    tp2_price,
    suggested_risk_pct:   suggestedRiskPct,
    breakeven_price:      breakevenPrice,
    breakeven_triggered:  false,
    expiry_candles:       expiry,
    time_decay_limit:     expiry,
    zone_invalidated:     false,
    htf_aligned:          best.htf_aligned,
    htf_zone_nested:      htfZoneNested,
    fvg_inside:           best.fvg_inside,
    liquidity_swept:      best.liquidity_swept,
    departure_candles:    best.base_candle_count,
    session_active:       isActiveSession(),
    reason:               scoring.reason,
    timestamp,
  }
}
