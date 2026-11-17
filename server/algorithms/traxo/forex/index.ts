/**
 * TRAXO Forex Proprietary Engines Registry
 */

import type { ITraxoStrategy } from '../types';
import { traxoBarrierGrid, TraxoBarrierGridStrategy, findNearestBarrierLevel } from './traxoBarrierGrid';
import { traxoLondonApex, TraxoLondonApexStrategy, extractAsianRange } from './traxoLondonApex';
import { traxoMacroVector, TraxoMacroVectorStrategy, evaluateHtfEmaStack } from './traxoMacroVector';
import { traxoTokyoYield, TraxoTokyoYieldStrategy, isTokyoGotobiDate } from './traxoTokyoYield';

export {
  TraxoLondonApexStrategy,
  traxoLondonApex,
  extractAsianRange,
  TraxoTokyoYieldStrategy,
  traxoTokyoYield,
  isTokyoGotobiDate,
  TraxoBarrierGridStrategy,
  traxoBarrierGrid,
  findNearestBarrierLevel,
  TraxoMacroVectorStrategy,
  traxoMacroVector,
  evaluateHtfEmaStack,
};

export * from './forexUtils';

export const TRAXO_FOREX_STRATEGIES: ITraxoStrategy[] = [
  traxoLondonApex,
  traxoTokyoYield,
  traxoBarrierGrid,
  traxoMacroVector,
];
