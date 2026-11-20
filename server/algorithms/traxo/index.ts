/**
 * TRAXO Proprietary Trading Strategies Registry
 *
 * Consolidates all 15 proprietary TRAXO trading engines across:
 * - Forex Majors (5): TRAXO London Apex, TRAXO Tokyo Yield, TRAXO Sovereign Fix, TRAXO Barrier Grid, TRAXO Macro Vector
 * - Gold / XAUUSD (5): TRAXO Aurum Sweep, TRAXO Bullion Strike, TRAXO NY Bullet, TRAXO Aurum Fix, TRAXO Kinetic NR7
 * - Futures / MNQ (5): TRAXO Globex Sweep, TRAXO Velocity ORB, TRAXO Initial Balance, TRAXO Mean Equilibrium, TRAXO Power Hour MOC
 */

export * from './types';
export * from './indicators';
export * from './confluenceMatrix';

export * as forexUtils from './forex/forexUtils';
export * as goldUtils from './gold/goldUtils';
export * as futuresUtils from './futures/futuresUtils';

// Forex Strategies & Helpers
export {
  TRAXO_FOREX_STRATEGIES,
  TraxoLondonApexStrategy,
  traxoLondonApex,
  extractAsianRange,
  TraxoTokyoYieldStrategy,
  traxoTokyoYield,
  isTokyoGotobiDate,
  TraxoSovereignFixStrategy,
  traxoSovereignFix,
  isMonthEndFixWindow,
  SOVEREIGN_FIX_SYMBOLS,
  TraxoBarrierGridStrategy,
  traxoBarrierGrid,
  findNearestBarrierLevel,
  TraxoMacroVectorStrategy,
  traxoMacroVector,
  evaluateHtfEmaStack,
} from './forex';

// Gold Strategies & Helpers
export {
  GOLD_STRATEGIES,
  TraxoAurumSweepStrategy,
  traxoAurumSweep,
  extractAurumAsianRange,
  type AurumAsianRange,
  TraxoAurumFixStrategy,
  traxoAurumFix,
  AURUM_FIX_MIN_SL_ATR_BUFFER,
  TraxoBullionStrikeStrategy,
  traxoBullionStrike,
  findInstitutionalStrikes,
  GOLD_MIN_SL_ATR_BUFFER,
  type InstitutionalStrikeLevel,
  TraxoNyBulletStrategy,
  traxoNyBullet,
  type DetectedSilverBulletFvg,
  TraxoKineticNr7Strategy,
  traxoKineticNr7,
  buildDailyBars,
  checkNr7At,
  type DailyBar,
  type Nr7PatternMatch,
  GOLD_SUPPORTED_SYMBOLS,
  normalizeGoldSymbol,
  isSupportedGoldSymbol,
  roundGoldPrice,
} from './gold';

// Futures Strategies & Helpers
export {
  TRAXO_FUTURES_STRATEGIES,
  TraxoGlobexSweepStrategy,
  traxoGlobexSweep,
  extractOvernightRange,
  TraxoVelocityOrbStrategy,
  traxoVelocityOrb,
  extractFiveMinuteOrb,
  TraxoInitialBalanceStrategy,
  traxoInitialBalance,
  extractInitialBalance,
  TraxoMeanEquilibriumStrategy,
  traxoMeanEquilibrium,
  computeSessionVwapZScore,
  TraxoPowerHourMocStrategy,
  traxoPowerHourMoc,
  assessDailyTrend,
  FUTURES_SUPPORTED_SYMBOLS,
  normalizeFuturesSymbol,
  isSupportedFuturesSymbol,
  roundFuturesPrice,
  toNyClock,
  resolveNyClock,
  type NyClockSnapshot,
} from './futures';

import { TRAXO_FOREX_STRATEGIES, normalizeForexSymbol } from './forex';
import { GOLD_STRATEGIES, isSupportedGoldSymbol } from './gold';
import { TRAXO_FUTURES_STRATEGIES, isSupportedFuturesSymbol } from './futures';
import type { ITraxoStrategy, TraxoStrategyContext, TraxoSignalResult } from './types';

export const ALL_TRAXO_STRATEGIES: ITraxoStrategy[] = [
  ...TRAXO_FOREX_STRATEGIES,
  ...GOLD_STRATEGIES,
  ...TRAXO_FUTURES_STRATEGIES,
];

export const TRAXO_STRATEGY_REGISTRY = new Map<string, ITraxoStrategy>(
  ALL_TRAXO_STRATEGIES.map((s) => [s.id, s])
);

export const TRAXO_STRATEGY_LABELS: Record<string, string> = Object.fromEntries(
  ALL_TRAXO_STRATEGIES.map((s) => [s.id, s.name])
);

export function getTraxoStrategy(id: string): ITraxoStrategy | undefined {
  return TRAXO_STRATEGY_REGISTRY.get(id);
}

export function getTraxoStrategiesForSymbol(symbol: string): ITraxoStrategy[] {
  const fxRaw = normalizeForexSymbol(symbol);
  const fxCanonical = fxRaw.length === 7 && fxRaw.endsWith('M') ? fxRaw.slice(0, 6) : fxRaw;
  const goldMatched = isSupportedGoldSymbol(symbol);
  const futuresMatched = isSupportedFuturesSymbol(symbol);

  return ALL_TRAXO_STRATEGIES.filter((strategy) => {
    if (strategy.market === 'METALS') return goldMatched;
    if (strategy.market === 'FUTURES') return futuresMatched;
    return strategy.supportedSymbols.includes(fxCanonical);
  });
}

export function evaluateTraxoStrategies(context: TraxoStrategyContext): TraxoSignalResult[] {
  const results: TraxoSignalResult[] = [];
  for (const strategy of getTraxoStrategiesForSymbol(context.symbol)) {
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
