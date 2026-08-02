// ─── Supply & Demand Risk Engine ─────────────────────────────────────────────
// SL/TP/Breakeven with Refinement 2: Dynamic OTE entry threshold

import type { SupplyDemandZone, SDZoneType } from './types'

// ─── Stop Loss ───────────────────────────────────────────────────────────────

export interface SDSLResult {
  sl_price:    number
  sl_distance: number
  valid:       boolean
  reason?:     string
}

export function calculateSDSL(
  zone:    SupplyDemandZone,
  atr14:   number,
): SDSLResult {
  const buffer = 0.10 * atr14
  const sl_price =
    zone.type === 'DEMAND'
      ? zone.distal_line - buffer
      : zone.distal_line + buffer

  const entry = getSDEntryPrice(zone, atr14)
  const sl_distance = Math.abs(entry - sl_price)

  if (sl_distance > 2.0 * atr14) {
    return {
      sl_price,
      sl_distance,
      valid:  false,
      reason: `SL distance ${sl_distance.toFixed(5)} > 2×ATR — zone too wide`,
    }
  }

  return { sl_price, sl_distance, valid: true }
}

// ─── Refinement 2: Dynamic OTE Entry ─────────────────────────────────────────
/**
 * If departure_speed > 3.0 ATR, the momentum is so strong that waiting for
 * 50% retracement risks missed fills.  Enter aggressively at the proximal line.
 * Otherwise, use the conservative 50% mitigation level (OTE).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getSDEntryPrice(zone: SupplyDemandZone, _atr14: number): number {
  if (zone.departure_speed > 3.0) {
    // Aggressive: proximal line touch only (Refinement 2)
    return zone.proximal_line
  }
  // Conservative: 50% mitigation level (OTE)
  return zone.mitigation_level
}

// ─── Take Profit (Zone-to-Zone Targeting) ────────────────────────────────────

export interface SDTPResult {
  tp1_price: number
  tp2_price: number
}

export function calculateSDTPs(
  zone:           SupplyDemandZone,
  atr14:          number,
  opposingZones:  SupplyDemandZone[],
): SDTPResult {
  const entry    = getSDEntryPrice(zone, atr14)
  const sl       = calculateSDSL(zone, atr14)
  const R        = sl.valid ? sl.sl_distance : atr14

  // Zone-to-zone targeting — find next 1 or 2 opposing zones
  const opposing = opposingZones
    .filter(z => z.type !== zone.type)
    .sort((a, b) => {
      const distA = Math.abs(a.proximal_line - entry)
      const distB = Math.abs(b.proximal_line - entry)
      return distA - distB
    })

  if (zone.type === 'DEMAND') {
    // Long — TPs target supply zones above entry
    const aboveZones = opposing.filter(z => z.proximal_line > entry)
    const tp1 = aboveZones[0]?.proximal_line ?? entry + 1.5 * R
    const tp2 = aboveZones[1]?.proximal_line ?? entry + 3.0 * R
    return { tp1_price: tp1, tp2_price: tp2 }
  } else {
    // Short — TPs target demand zones below entry
    const belowZones = opposing.filter(z => z.proximal_line < entry)
    const tp1 = belowZones[0]?.proximal_line ?? entry - 1.5 * R
    const tp2 = belowZones[1]?.proximal_line ?? entry - 3.0 * R
    return { tp1_price: tp1, tp2_price: tp2 }
  }
}

// ─── Breakeven ───────────────────────────────────────────────────────────────

export function calculateSDBreakeven(
  entry:    number,
  atr14:    number,
  zoneType: SDZoneType,
): number {
  const tolerance = 0.10 * atr14   // slippage buffer; commission assumed baked in
  return zoneType === 'DEMAND'
    ? entry + tolerance
    : entry - tolerance
}
