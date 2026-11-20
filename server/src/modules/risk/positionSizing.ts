import { getInstrumentSpec } from '../../config/instruments';

export interface PositionSizeInput {
  symbol: string;
  entry: number;
  sl: number;
  riskAmountUsd?: number;
  accountBalance?: number;
  riskPerTradePct?: number;
  riskMode?: 'fixedAmount' | 'percentage';
}

export interface PositionSizeResult {
  lots: number;
  riskAmountUsd: number;
  stopDistance: number;
  units: number;
}

export function resolveRiskAmountUsd(params: {
  riskAmountUsd?: number;
  accountBalance?: number;
  riskPerTradePct?: number;
  riskMode?: 'fixedAmount' | 'percentage';
}): number {
  if (typeof params.riskAmountUsd === 'number' && Number.isFinite(params.riskAmountUsd) && params.riskAmountUsd > 0) {
    return params.riskAmountUsd;
  }
  if (params.riskMode === 'percentage' && params.accountBalance && params.riskPerTradePct) {
    return Math.max(1, Number(((params.accountBalance * params.riskPerTradePct) / 100).toFixed(2)));
  }
  return 500;
}

export function calculateLots(
  symbol: string,
  entry: number,
  sl: number,
  riskAmount = 500
): number {
  const spec = getInstrumentSpec(symbol);
  if (!Number.isFinite(riskAmount) || riskAmount <= 0) {
    return spec.assetType === 'FUTURES' ? 1 : 0.01;
  }

  let riskDist = Math.abs(Number(entry) - Number(sl));

  if (spec.assetType === 'FUTURES') {
    const minDistance = Math.max(spec.pipSize, 0.25);
    if (!riskDist || Number.isNaN(riskDist) || riskDist < minDistance) {
      riskDist = minDistance;
    }
    const rawContracts = riskAmount / (riskDist * spec.riskPerUnitFactor);
    return Math.max(1, Math.min(Math.floor(spec.maxLots), Math.floor(rawContracts)));
  }

  const minDistance = Math.max(0.0001, (Number(entry) || 1) * 0.001);
  if (!riskDist || Number.isNaN(riskDist) || riskDist < minDistance) {
    riskDist = minDistance;
  }

  let lots = riskAmount / (riskDist * spec.riskPerUnitFactor);
  lots = Math.min(spec.maxLots, lots);
  return Math.max(0.01, Number(lots.toFixed(2)));
}

export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const spec = getInstrumentSpec(input.symbol);
  const riskAmountUsd = resolveRiskAmountUsd(input);
  const stopDistance = Math.abs(Number(input.entry) - Number(input.sl));
  const lots = calculateLots(input.symbol, input.entry, input.sl, riskAmountUsd);
  const units = Number((lots * spec.contractSize).toFixed(2));

  return {
    lots,
    riskAmountUsd,
    stopDistance,
    units,
  };
}
