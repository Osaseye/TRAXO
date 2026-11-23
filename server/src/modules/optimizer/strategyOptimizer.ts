import { roundToDigits } from '../../config/instruments';
import redis, { backupRedis } from '../market-data/redisClient';

export type StrategyId =
  | 'wick_rejection'
  | 'breakout'
  | 'order_block'
  | 'supply_demand'
  | 'trend_following'
  | 'traxo_london_apex'
  | 'traxo_tokyo_yield'
  | 'traxo_sovereign_fix'
  | 'traxo_barrier_grid'
  | 'traxo_macro_vector'
  | 'traxo_aurum_sweep'
  | 'traxo_bullion_strike'
  | 'traxo_ny_bullet'
  | 'traxo_aurum_fix'
  | 'traxo_kinetic_nr7'
  | 'traxo_globex_sweep'
  | 'traxo_velocity_orb'
  | 'traxo_initial_balance'
  | 'traxo_mean_equilibrium'
  | 'traxo_power_hour_moc';

export const TRAXO_STRATEGY_IDS: readonly StrategyId[] = [
  'traxo_london_apex',
  'traxo_tokyo_yield',
  'traxo_sovereign_fix',
  'traxo_barrier_grid',
  'traxo_macro_vector',
  'traxo_aurum_sweep',
  'traxo_bullion_strike',
  'traxo_ny_bullet',
  'traxo_aurum_fix',
  'traxo_kinetic_nr7',
  'traxo_globex_sweep',
  'traxo_velocity_orb',
  'traxo_initial_balance',
  'traxo_mean_equilibrium',
  'traxo_power_hour_moc',
];

const TRAXO_DEFAULT_PARAMS = (): Record<string, number> => ({
  atrSlPadding: 1.0,
  minConfidence: 50,
});

const TRAXO_DEFAULT_BOUNDS = (): Record<string, ParameterBounds> => ({
  atrSlPadding: { min: 0.85, max: 1.8, decimals: 2 },
  minConfidence: { min: 45, max: 80, decimals: 0 },
});

export interface ParameterBounds {
  min: number;
  max: number;
  decimals: number;
}

export interface OptimizationChange {
  param: string;
  from: number;
  to: number;
  reason: string;
}

export interface OptimizationHistoryItem {
  timestamp: number;
  outcome: 'WIN' | 'LOSS';
  strategyId: StrategyId | string;
  symbol: string;
  timeframe: string;
  changes: OptimizationChange[];
}

export const FACTORY_DEFAULTS: Record<StrategyId, Record<string, number>> = {
  wick_rejection: {
    minWickRatio: 2.0,
    atrSlPadding: 1.0,
    minConfidence: 50,
  },
  breakout: {
    volumeSpikeMultiplier: 1.5,
    consolidationCount: 3,
    minConfidence: 50,
  },
  order_block: {
    displacementRatio: 1.5,
    minConfidence: 50,
  },
  supply_demand: {
    zoneFlipStrength: 1.2,
    minConfidence: 50,
  },
  trend_following: {
    pullbackDepth: 0.382,
    minConfidence: 50,
  },
  traxo_london_apex: TRAXO_DEFAULT_PARAMS(),
  traxo_tokyo_yield: TRAXO_DEFAULT_PARAMS(),
  traxo_sovereign_fix: TRAXO_DEFAULT_PARAMS(),
  traxo_barrier_grid: TRAXO_DEFAULT_PARAMS(),
  traxo_macro_vector: TRAXO_DEFAULT_PARAMS(),
  traxo_aurum_sweep: TRAXO_DEFAULT_PARAMS(),
  traxo_bullion_strike: TRAXO_DEFAULT_PARAMS(),
  traxo_ny_bullet: TRAXO_DEFAULT_PARAMS(),
  traxo_aurum_fix: TRAXO_DEFAULT_PARAMS(),
  traxo_kinetic_nr7: TRAXO_DEFAULT_PARAMS(),
  traxo_globex_sweep: TRAXO_DEFAULT_PARAMS(),
  traxo_velocity_orb: TRAXO_DEFAULT_PARAMS(),
  traxo_initial_balance: TRAXO_DEFAULT_PARAMS(),
  traxo_mean_equilibrium: TRAXO_DEFAULT_PARAMS(),
  traxo_power_hour_moc: TRAXO_DEFAULT_PARAMS(),
};

export const PARAMETER_BOUNDS: Record<StrategyId, Record<string, ParameterBounds>> = {
  wick_rejection: {
    minWickRatio: { min: 1.5, max: 3.5, decimals: 2 },
    atrSlPadding: { min: 0.85, max: 1.8, decimals: 2 },
    minConfidence: { min: 45, max: 75, decimals: 0 },
  },
  breakout: {
    volumeSpikeMultiplier: { min: 1.2, max: 2.5, decimals: 2 },
    consolidationCount: { min: 2, max: 6, decimals: 0 },
    minConfidence: { min: 45, max: 75, decimals: 0 },
  },
  order_block: {
    displacementRatio: { min: 1.2, max: 2.4, decimals: 2 },
    minConfidence: { min: 45, max: 75, decimals: 0 },
  },
  supply_demand: {
    zoneFlipStrength: { min: 1.0, max: 2.0, decimals: 2 },
    minConfidence: { min: 45, max: 75, decimals: 0 },
  },
  trend_following: {
    pullbackDepth: { min: 0.236, max: 0.618, decimals: 3 },
    minConfidence: { min: 45, max: 75, decimals: 0 },
  },
  traxo_london_apex: TRAXO_DEFAULT_BOUNDS(),
  traxo_tokyo_yield: TRAXO_DEFAULT_BOUNDS(),
  traxo_sovereign_fix: TRAXO_DEFAULT_BOUNDS(),
  traxo_barrier_grid: TRAXO_DEFAULT_BOUNDS(),
  traxo_macro_vector: TRAXO_DEFAULT_BOUNDS(),
  traxo_aurum_sweep: TRAXO_DEFAULT_BOUNDS(),
  traxo_bullion_strike: TRAXO_DEFAULT_BOUNDS(),
  traxo_ny_bullet: TRAXO_DEFAULT_BOUNDS(),
  traxo_aurum_fix: TRAXO_DEFAULT_BOUNDS(),
  traxo_kinetic_nr7: TRAXO_DEFAULT_BOUNDS(),
  traxo_globex_sweep: TRAXO_DEFAULT_BOUNDS(),
  traxo_velocity_orb: TRAXO_DEFAULT_BOUNDS(),
  traxo_initial_balance: TRAXO_DEFAULT_BOUNDS(),
  traxo_mean_equilibrium: TRAXO_DEFAULT_BOUNDS(),
  traxo_power_hour_moc: TRAXO_DEFAULT_BOUNDS(),
};

let isFeedbackEngineEnabled = false;
let learnedParameters: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(FACTORY_DEFAULTS));
let optimizationHistory: OptimizationHistoryItem[] = [];
let totalLossesAnalyzed = 0;
let totalWinsAnalyzed = 0;

function clampBounded(strategyId: StrategyId, param: string, value: number): number {
  const bounds = PARAMETER_BOUNDS[strategyId]?.[param];
  if (!bounds) return value;
  const clamped = Math.max(bounds.min, Math.min(bounds.max, value));
  return Number(clamped.toFixed(bounds.decimals));
}

export function normalizeStrategyId(id?: string): StrategyId {
  if (!id) return 'wick_rejection';
  const normalized = String(id).toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (Object.prototype.hasOwnProperty.call(FACTORY_DEFAULTS, normalized)) {
    return normalized as StrategyId;
  }
  if (normalized.includes('wick')) return 'wick_rejection';
  if (normalized.includes('breakout')) return 'breakout';
  if (normalized.includes('order')) return 'order_block';
  if (normalized.includes('supply') || normalized.includes('demand')) return 'supply_demand';
  if (normalized.includes('trend')) return 'trend_following';
  return 'wick_rejection';
}

export async function init(): Promise<void> {
  try {
    let [enabledVal, paramsVal, historyVal, lossCountVal, winCountVal] = await Promise.all([
      redis.get('optimizer:enabled').catch(() => null),
      redis.get('optimizer:parameters').catch(() => null),
      redis.get('optimizer:history').catch(() => null),
      redis.get('optimizer:loss_count').catch(() => null),
      redis.get('optimizer:win_count').catch(() => null),
    ]);

    if (enabledVal === null && paramsVal === null) {
      [enabledVal, paramsVal, historyVal, lossCountVal, winCountVal] = await Promise.all([
        backupRedis.get('optimizer:enabled').catch(() => null),
        backupRedis.get('optimizer:parameters').catch(() => null),
        backupRedis.get('optimizer:history').catch(() => null),
        backupRedis.get('optimizer:loss_count').catch(() => null),
        backupRedis.get('optimizer:win_count').catch(() => null),
      ]);
    }

    if (enabledVal !== null) {
      isFeedbackEngineEnabled = enabledVal === 'true';
    }
    if (paramsVal) {
      const parsed = JSON.parse(paramsVal);
      learnedParameters = JSON.parse(JSON.stringify(FACTORY_DEFAULTS));
      for (const strat of Object.keys(FACTORY_DEFAULTS) as StrategyId[]) {
        if (parsed[strat]) {
          learnedParameters[strat] = { ...FACTORY_DEFAULTS[strat], ...parsed[strat] };
        }
      }
    }
    if (historyVal) {
      optimizationHistory = JSON.parse(historyVal);
    }
    if (lossCountVal) {
      totalLossesAnalyzed = Number(lossCountVal) || 0;
    }
    if (winCountVal) {
      totalWinsAnalyzed = Number(winCountVal) || 0;
    }
    console.log(`[StrategyOptimizer] Initialized. Engine active: ${isFeedbackEngineEnabled}`);
  } catch (err: any) {
    console.error('[StrategyOptimizer] Hydration error:', err.message);
  }
}

void init();

export function getFeedbackEngineEnabled(): boolean {
  return isFeedbackEngineEnabled;
}

export async function setFeedbackEngineEnabled(enabled: boolean): Promise<boolean> {
  isFeedbackEngineEnabled = Boolean(enabled);
  await Promise.all([
    redis.set('optimizer:enabled', String(isFeedbackEngineEnabled)).catch(() => {}),
    backupRedis.set('optimizer:enabled', String(isFeedbackEngineEnabled)).catch(() => {}),
  ]);
  console.log(`[StrategyOptimizer] Feedback Engine Master Switch set to: ${isFeedbackEngineEnabled}`);
  return isFeedbackEngineEnabled;
}

export function getParameters(strategyId?: string): Record<string, number> {
  const normalizedId = normalizeStrategyId(strategyId);
  if (!isFeedbackEngineEnabled) {
    return { ...FACTORY_DEFAULTS[normalizedId] };
  }
  return { ...(learnedParameters[normalizedId] || FACTORY_DEFAULTS[normalizedId]) };
}

/**
 * CRITICAL R:R PRESERVATION:
 * Whenever `atrSlPadding` modifies SL distance from entryPrice, recalculate
 * takeProfit cleanly from entryPrice and target R:R (`newRiskDistance * targetRR`)
 * so Risk:Reward NEVER shrinks when SL is padded!
 */
export function applySlPaddingWithRRPreservation(params: {
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  atrSlPadding?: number;
  minRR?: number;
  digits?: number;
}): {
  slPrice: number;
  tpPrice: number;
  originalRR: number;
  preservedRR: number;
  adjusted: boolean;
} {
  const { direction, entryPrice, slPrice, tpPrice, atrSlPadding = 1.0, minRR = 0, digits } = params;
  const origRisk = Math.abs(entryPrice - slPrice);
  const origReward = Math.abs(tpPrice - entryPrice);
  const originalRR = origRisk > 0 ? Number((origReward / origRisk).toFixed(4)) : 0;

  if (origRisk <= 0 || entryPrice <= 0 || slPrice <= 0 || !Number.isFinite(atrSlPadding) || atrSlPadding === 1.0) {
    return {
      slPrice,
      tpPrice,
      originalRR,
      preservedRR: originalRR,
      adjusted: false,
    };
  }

  const targetRR = Math.max(originalRR, minRR);
  const newRisk = origRisk * atrSlPadding;
  const newReward = newRisk * targetRR;

  const rawSl = direction === 'BUY' ? entryPrice - newRisk : entryPrice + newRisk;
  const rawTp = direction === 'BUY' ? entryPrice + newReward : entryPrice - newReward;

  const finalSl = digits !== undefined ? (roundToDigits(rawSl, digits) ?? rawSl) : Number(rawSl.toFixed(6));
  const finalTp = digits !== undefined ? (roundToDigits(rawTp, digits) ?? rawTp) : Number(rawTp.toFixed(6));

  const actualRisk = Math.abs(entryPrice - finalSl);
  const actualReward = Math.abs(finalTp - entryPrice);
  const preservedRR = actualRisk > 0 ? Number((actualReward / actualRisk).toFixed(2)) : targetRR;

  return {
    slPrice: finalSl,
    tpPrice: finalTp,
    originalRR: Number(originalRR.toFixed(2)),
    preservedRR,
    adjusted: true,
  };
}

function applyParamStep(
  stratId: StrategyId,
  currentParams: Record<string, number>,
  param: string,
  delta: number,
  reason: string,
  changes: OptimizationChange[]
): void {
  const oldVal = currentParams[param] ?? FACTORY_DEFAULTS[stratId][param];
  if (oldVal === undefined) return;
  const nextVal = clampBounded(stratId, param, oldVal + delta);
  if (nextVal !== oldVal) {
    currentParams[param] = nextVal;
    changes.push({ param, from: oldVal, to: nextVal, reason });
  }
}

async function persistOptimizerState(): Promise<void> {
  const paramsStr = JSON.stringify(learnedParameters);
  const histStr = JSON.stringify(optimizationHistory);
  const lossStr = String(totalLossesAnalyzed);
  const winStr = String(totalWinsAnalyzed);
  const enabledStr = String(isFeedbackEngineEnabled);

  await Promise.all([
    redis.set('optimizer:parameters', paramsStr).catch(() => {}),
    redis.set('optimizer:history', histStr).catch(() => {}),
    redis.set('optimizer:loss_count', lossStr).catch(() => {}),
    redis.set('optimizer:win_count', winStr).catch(() => {}),
    backupRedis.set('optimizer:enabled', enabledStr).catch(() => {}),
    backupRedis.set('optimizer:parameters', paramsStr).catch(() => {}),
    backupRedis.set('optimizer:history', histStr).catch(() => {}),
    backupRedis.set('optimizer:loss_count', lossStr).catch(() => {}),
    backupRedis.set('optimizer:win_count', winStr).catch(() => {}),
  ]);
}

export async function processResolvedLoss(signal: any): Promise<Record<string, any>> {
  if (!signal) return { processed: false, reason: 'No signal provided' };

  const stratId = normalizeStrategyId(signal.strategyId || signal.strategy_id || signal.strategy);

  if (!isFeedbackEngineEnabled) {
    console.log(
      `[StrategyOptimizer] Received loss for ${stratId} (${signal.symbol || 'N/A'}), but Feedback Engine is OFF.`
    );
    return { processed: false, reason: 'Feedback Engine switch is OFF', stratId };
  }

  totalLossesAnalyzed += 1;
  const currentParams = { ...(learnedParameters[stratId] || FACTORY_DEFAULTS[stratId]) };
  const changes: OptimizationChange[] = [];

  if (stratId === 'wick_rejection') {
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      2,
      'Increased minimum confidence threshold after loss to filter marginal entries',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minWickRatio',
      0.15,
      'Sharpened wick rejection ratio threshold for stricter candle rejection validation',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'atrSlPadding',
      0.1,
      'Expanded Stop-Loss ATR padding (with R:R-preserving TP scaling) to absorb stop-hunt noise',
      changes
    );
  } else if (stratId === 'breakout') {
    applyParamStep(
      stratId,
      currentParams,
      'volumeSpikeMultiplier',
      0.2,
      'Raised volume spike threshold after loss to eliminate low-volume fakeouts',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      2,
      'Raised minimum confidence threshold after breakout loss',
      changes
    );
  } else if (stratId === 'order_block') {
    applyParamStep(
      stratId,
      currentParams,
      'displacementRatio',
      0.1,
      'Tightened displacement ratio requirement for stronger institutional OB confirmation',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      2,
      'Raised minimum confidence threshold after order block loss',
      changes
    );
  } else if (stratId === 'supply_demand') {
    applyParamStep(
      stratId,
      currentParams,
      'zoneFlipStrength',
      0.1,
      'Increased zone departure strength requirement after S&D loss',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      2,
      'Raised minimum confidence threshold after S&D loss',
      changes
    );
  } else if (stratId === 'trend_following') {
    applyParamStep(
      stratId,
      currentParams,
      'pullbackDepth',
      0.02,
      'Required deeper pullback retracement toward OTE zone after loss',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      2,
      'Raised minimum confidence threshold after trend-following loss',
      changes
    );
  } else if (stratId.startsWith('traxo_')) {
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      2,
      `Increased minimum confidence threshold for ${stratId} after loss`,
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'atrSlPadding',
      0.1,
      `Expanded Stop-Loss ATR padding for ${stratId} (with R:R-preserving TP scaling)`,
      changes
    );
  }

  learnedParameters[stratId] = currentParams;
  const historyRecord: OptimizationHistoryItem = {
    timestamp: Date.now(),
    outcome: 'LOSS',
    strategyId: stratId,
    symbol: signal.symbol || 'N/A',
    timeframe: signal.timeframe || 'N/A',
    changes,
  };
  optimizationHistory.unshift(historyRecord);
  optimizationHistory = optimizationHistory.slice(0, 50);

  await persistOptimizerState();

  console.log(`[StrategyOptimizer] Processed LOSS for ${stratId}. Applied ${changes.length} parameter updates.`);
  return { processed: true, outcome: 'LOSS', stratId, changes, totalLossesAnalyzed, totalWinsAnalyzed };
}

/**
 * Bi-directional adaptation on TP win: gradually relaxes tightened filters
 * within bounded [min, max] limits so strategies do not permanently choke.
 */
export async function processResolvedWin(signal: any): Promise<Record<string, any>> {
  if (!signal) return { processed: false, reason: 'No signal provided' };

  const stratId = normalizeStrategyId(signal.strategyId || signal.strategy_id || signal.strategy);

  if (!isFeedbackEngineEnabled) {
    return { processed: false, reason: 'Feedback Engine switch is OFF', stratId };
  }

  totalWinsAnalyzed += 1;
  const currentParams = { ...(learnedParameters[stratId] || FACTORY_DEFAULTS[stratId]) };
  const changes: OptimizationChange[] = [];

  if (stratId === 'wick_rejection') {
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      -1,
      'Relaxed minimum confidence threshold slightly after confirmed TP win',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minWickRatio',
      -0.05,
      'Gradually eased wick rejection ratio within bounds after confirmed TP win',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'atrSlPadding',
      -0.05,
      'Tightened SL ATR padding slightly after clean TP win to normalize risk distance',
      changes
    );
  } else if (stratId === 'breakout') {
    applyParamStep(
      stratId,
      currentParams,
      'volumeSpikeMultiplier',
      -0.08,
      'Gradually eased volume spike threshold within bounds after confirmed breakout win',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      -1,
      'Relaxed minimum confidence threshold slightly after confirmed TP win',
      changes
    );
  } else if (stratId === 'order_block') {
    applyParamStep(
      stratId,
      currentParams,
      'displacementRatio',
      -0.05,
      'Gradually eased displacement ratio within bounds after confirmed OB win',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      -1,
      'Relaxed minimum confidence threshold slightly after confirmed OB win',
      changes
    );
  } else if (stratId === 'supply_demand') {
    applyParamStep(
      stratId,
      currentParams,
      'zoneFlipStrength',
      -0.05,
      'Gradually eased zone strength threshold within bounds after confirmed S&D win',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      -1,
      'Relaxed minimum confidence threshold slightly after confirmed S&D win',
      changes
    );
  } else if (stratId === 'trend_following') {
    applyParamStep(
      stratId,
      currentParams,
      'pullbackDepth',
      -0.01,
      'Slightly relaxed pullback depth within OTE bounds after confirmed trend win',
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      -1,
      'Relaxed minimum confidence threshold slightly after confirmed trend win',
      changes
    );
  } else if (stratId.startsWith('traxo_')) {
    applyParamStep(
      stratId,
      currentParams,
      'minConfidence',
      -1,
      `Relaxed minimum confidence threshold for ${stratId} after confirmed TP win`,
      changes
    );
    applyParamStep(
      stratId,
      currentParams,
      'atrSlPadding',
      -0.05,
      `Normalized Stop-Loss ATR padding for ${stratId} after clean TP win`,
      changes
    );
  }

  learnedParameters[stratId] = currentParams;
  const historyRecord: OptimizationHistoryItem = {
    timestamp: Date.now(),
    outcome: 'WIN',
    strategyId: stratId,
    symbol: signal.symbol || 'N/A',
    timeframe: signal.timeframe || 'N/A',
    changes,
  };
  optimizationHistory.unshift(historyRecord);
  optimizationHistory = optimizationHistory.slice(0, 50);

  await persistOptimizerState();

  console.log(`[StrategyOptimizer] Processed WIN for ${stratId}. Applied ${changes.length} parameter updates.`);
  return { processed: true, outcome: 'WIN', stratId, changes, totalLossesAnalyzed, totalWinsAnalyzed };
}

export async function resetToFactoryDefaults(): Promise<{ success: boolean }> {
  learnedParameters = JSON.parse(JSON.stringify(FACTORY_DEFAULTS));
  optimizationHistory = [];
  totalLossesAnalyzed = 0;
  totalWinsAnalyzed = 0;
  await Promise.all([
    redis.del('optimizer:parameters').catch(() => {}),
    redis.del('optimizer:history').catch(() => {}),
    redis.del('optimizer:loss_count').catch(() => {}),
    redis.del('optimizer:win_count').catch(() => {}),
  ]);
  console.log('[StrategyOptimizer] Reset parameters to factory defaults.');
  return { success: true };
}

export function getOptimizationDiagnostics() {
  return {
    isFeedbackEngineEnabled,
    totalLossesAnalyzed,
    totalWinsAnalyzed,
    factoryDefaults: FACTORY_DEFAULTS,
    learnedParameters,
    parameterBounds: PARAMETER_BOUNDS,
    history: optimizationHistory,
  };
}
