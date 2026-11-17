/**
 * TRAXO Futures (MNQ / NQ / USTEC) Proprietary Engines Registry
 */

import type { ITraxoStrategy } from '../types';
import {
  extractOvernightRange,
  traxoGlobexSweep,
  TraxoGlobexSweepStrategy,
} from './traxoGlobexSweep';
import {
  extractInitialBalance,
  traxoInitialBalance,
  TraxoInitialBalanceStrategy,
} from './traxoInitialBalance';
import {
  computeSessionVwapZScore,
  traxoMeanEquilibrium,
  TraxoMeanEquilibriumStrategy,
} from './traxoMeanEquilibrium';
import {
  assessDailyTrend,
  traxoPowerHourMoc,
  TraxoPowerHourMocStrategy,
} from './traxoPowerHourMoc';
import {
  extractFiveMinuteOrb,
  traxoVelocityOrb,
  TraxoVelocityOrbStrategy,
} from './traxoVelocityOrb';

export {
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
};

export {
  FUTURES_SUPPORTED_SYMBOLS,
  normalizeFuturesSymbol,
  isSupportedFuturesSymbol,
  roundFuturesPrice,
  parseUtcDate,
  normalizeTimeframe,
  toNyClock,
  resolveNyClock,
  hasValidCandles,
  resolveTier,
  resolveSuggestedRiskPct,
  buildFuturesSignal,
  type NyClockSnapshot,
  type BuildFuturesSignalParams,
} from './futuresUtils';

export const TRAXO_FUTURES_STRATEGIES: ITraxoStrategy[] = [
  traxoGlobexSweep,
  traxoVelocityOrb,
  traxoInitialBalance,
  traxoMeanEquilibrium,
  traxoPowerHourMoc,
];
