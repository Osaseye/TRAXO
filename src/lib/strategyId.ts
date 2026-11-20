import type { LegacyStrategyCatalogId, TraxoCatalogStrategyId } from '@/lib/traxoStrategies'

export type StrategyId = LegacyStrategyCatalogId | TraxoCatalogStrategyId

/**
 * Normalizes any legacy/non-canonical strategy ids to the canonical kebab-case ids used across the app.
 */
export function normalizeStrategyId(id: string): string {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

export function isSupplyDemandStrategyId(id: string): boolean {
  return normalizeStrategyId(id) === 'supply-demand'
}
