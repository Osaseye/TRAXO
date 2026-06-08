export type StrategyId =
  | 'wick-rejection'
  | 'breakout'
  | 'order-block'
  | 'supply-demand'
  | 'trend-following'

/**
 * Normalizes any legacy/non-canonical strategy ids to the canonical ids used across the app.
 */
export function normalizeStrategyId(id: string): string {
  if (id === 'supply_demand') return 'supply-demand'
  return id
}

export function isSupplyDemandStrategyId(id: string): boolean {
  return normalizeStrategyId(id) === 'supply-demand'
}
