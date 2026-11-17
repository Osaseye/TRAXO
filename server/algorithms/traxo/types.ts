/**
 * TRAXO Proprietary Strategy Types & Contract
 *
 * All proprietary TRAXO strategies adhere strictly to this contract.
 * Each strategy is an isolated, modular algorithmic engine capable of
 * standalone execution, unit-testing, and dynamic scanner dispatch.
 */

export interface TraxoCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string | number | Date;
}

export type TraxoMarket = 'FOREX' | 'METALS' | 'FUTURES';
export type TraxoSignalDirection = 'BUY' | 'SELL';
export type TraxoTier = 'PRIME' | 'STANDARD' | 'AGGRESSIVE';
export type TraxoEntryType = 'MARKET' | 'LIMIT' | 'STOP';

export interface TraxoSignalResult {
  id: string;
  strategyId: string;
  strategyName: string;
  market: TraxoMarket;
  symbol: string;
  direction: TraxoSignalDirection;
  score: number;
  confidencePct: number;
  tier: TraxoTier;
  entryType: TraxoEntryType;
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  riskRewardRatio: number;
  suggestedRiskPct: number;
  reasons: string[];
  metrics?: Record<string, any>;
  timestamp: string;
}

export interface TraxoStrategyContext {
  symbol: string;
  timeframe: string;
  candles: TraxoCandle[];
  higherTimeframeCandles?: TraxoCandle[];
  currentPrice?: number;
  spreadPips?: number;
  session?: {
    isAsian: boolean;
    isLondon: boolean;
    isNewYork: boolean;
    isOverlap: boolean;
    utcHour: number;
    utcMinute: number;
    dayOfMonth?: number;
    dayOfWeek?: number;
  };
  newsBlackout?: boolean;
}

export interface ITraxoStrategy {
  readonly id: string;
  readonly name: string;
  readonly market: TraxoMarket;
  readonly supportedSymbols: string[];
  readonly optimalTimeframes: string[];
  evaluate(context: TraxoStrategyContext): TraxoSignalResult | null;
}
