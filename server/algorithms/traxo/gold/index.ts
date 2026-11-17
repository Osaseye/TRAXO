/**
 * TRAXO Gold (XAU/USD) Proprietary Engines Barrel Export
 */

import type { ITraxoStrategy } from '../types';
import { traxoAurumSweep } from './traxoAurumSweep';
import { traxoBullionStrike } from './traxoBullionStrike';
import { traxoNyBullet } from './traxoNyBullet';
import { traxoKineticNr7 } from './traxoKineticNr7';

export {
  TraxoAurumSweepStrategy,
  traxoAurumSweep,
  extractAurumAsianRange,
  type AurumAsianRange,
} from './traxoAurumSweep';

export {
  TraxoBullionStrikeStrategy,
  traxoBullionStrike,
  findInstitutionalStrikes,
  GOLD_MIN_SL_ATR_BUFFER,
  type InstitutionalStrikeLevel,
} from './traxoBullionStrike';

export {
  TraxoNyBulletStrategy,
  traxoNyBullet,
  type DetectedSilverBulletFvg,
} from './traxoNyBullet';

export {
  TraxoKineticNr7Strategy,
  traxoKineticNr7,
  buildDailyBars,
  checkNr7At,
  type DailyBar,
  type Nr7PatternMatch,
} from './traxoKineticNr7';

export {
  GOLD_SUPPORTED_SYMBOLS,
  normalizeGoldSymbol,
  isSupportedGoldSymbol,
  roundGoldPrice,
} from './goldUtils';

export const GOLD_STRATEGIES: ITraxoStrategy[] = [
  traxoAurumSweep,
  traxoBullionStrike,
  traxoNyBullet,
  traxoKineticNr7,
];
