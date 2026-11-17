/**
 * TRAXO Proprietary Trading Strategies Registry
 *
 * Consolidates all proprietary TRAXO trading engines across:
 * - Forex Majors (TRAXO London Apex, TRAXO Tokyo Yield, TRAXO Barrier Grid, TRAXO Macro Vector)
 * - Gold / XAUUSD (TRAXO Aurum Sweep, TRAXO Bullion Strike, TRAXO NY Bullet, TRAXO Kinetic NR7)
 * - Futures / MNQ (TRAXO Globex Sweep, TRAXO Velocity ORB, TRAXO Initial Balance, TRAXO Mean Equilibrium, TRAXO Power Hour MOC)
 */

export * from './types';
export * from './indicators';

// Forex
export * from './forex';

// Gold
export * from './gold';

// Futures
export * from './futures';

import { TRAXO_FOREX_STRATEGIES } from './forex';
import { GOLD_STRATEGIES } from './gold';
import { TRAXO_FUTURES_STRATEGIES } from './futures';
import { ITraxoStrategy, TraxoStrategyContext, TraxoSignalResult } from './types';

export const ALL_TRAXO_STRATEGIES: ITraxoStrategy[] = [
  ...TRAXO_FOREX_STRATEGIES,
  ...GOLD_STRATEGIES,
  ...TRAXO_FUTURES_STRATEGIES,
];

export const TRAXO_STRATEGY_REGISTRY = new Map<string, ITraxoStrategy>(
  ALL_TRAXO_STRATEGIES.map((s) => [s.id, s])
);

export function getTraxoStrategy(id: string): ITraxoStrategy | undefined {
  return TRAXO_STRATEGY_REGISTRY.get(id);
}

export function evaluateTraxoStrategies(context: TraxoStrategyContext): TraxoSignalResult[] {
  const results: TraxoSignalResult[] = [];
  for (const strategy of ALL_TRAXO_STRATEGIES) {
    try {
      const sig = strategy.evaluate(context);
      if (sig) {
        results.push(sig);
      }
    } catch (err) {
      console.error(`[TRAXO Engine Error] ${strategy.name} failed on ${context.symbol}:`, err);
    }
  }
  return results;
}
