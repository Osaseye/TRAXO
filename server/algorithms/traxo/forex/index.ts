/**
 * TRAXO Forex Proprietary Engines Registry
 */

import type { ITraxoStrategy } from '../types';
import { traxoBarrierGrid, TraxoBarrierGridStrategy, findNearestBarrierLevel } from './traxoBarrierGrid';
import { traxoLondonApex, TraxoLondonApexStrategy, extractAsianRange } from './traxoLondonApex';
import { traxoMacroVector, TraxoMacroVectorStrategy, evaluateHtfEmaStack } from './traxoMacroVector';
import {
  traxoSovereignFix,
  TraxoSovereignFixStrategy,
  isMonthEndFixWindow,
  SOVEREIGN_FIX_SYMBOLS,
} from './traxoSovereignFix';
import { traxoTokyoYield, TraxoTokyoYieldStrategy, isTokyoGotobiDate } from './traxoTokyoYield';

export {
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
};

export * from './forexUtils';

export const TRAXO_FOREX_STRATEGIES: ITraxoStrategy[] = [
  traxoLondonApex,
  traxoTokyoYield,
  traxoSovereignFix,
  traxoBarrierGrid,
  traxoMacroVector,
];
