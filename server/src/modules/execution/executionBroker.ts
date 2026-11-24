import type { MarketCandle } from '../market-data/marketDataService';

export type ExecutionMode = 'paper';
export type ExitMode = 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';

export type PaperTradeStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIAL_TP1'
  | 'WIN_TP1'
  | 'WIN_TP2'
  | 'WIN_TP1_BE'
  | 'LOSS_SL'
  | 'CLOSED_MANUAL'
  | 'EXPIRED'
  | 'CANCELLED';

export type ResolutionMethod =
  | 'exact_1m'
  | 'candle_ohlc'
  | 'conservative_tiebreak'
  | 'manual';

export interface PaperTradeEvent {
  type:
    | 'CREATED'
    | 'FILLED'
    | 'TP1_SCALED'
    | 'SL_MOVED_TO_BE'
    | 'EXIT'
    | 'EXPIRED'
    | 'CANCELLED';
  time: number;
  price: number;
  volume?: number;
  pnlUsd?: number;
  note: string;
}

export interface PaperAccountRecord {
  uid: string;
  startingBalance: number;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  floatingPnl: number;
  realizedPnl: number;
  peakEquity: number;
  maxDrawdownPct: number;
  currency: string;
  leverage: number;
  updatedAt: number;
}

export interface PaperTradeRecord {
  id: string;
  uid: string;
  signalId: string | null;
  symbol: string;
  timeframe: string;
  market: string;
  strategyId: string;
  strategyLabel: string;
  tier: string;
  direction: 'BUY' | 'SELL';
  entryType: 'MARKET' | 'LIMIT' | 'STOP';
  exitMode: ExitMode;
  status: PaperTradeStatus;
  requestedEntry: number;
  fillPrice: number | null;
  slPrice: number;
  currentSl: number;
  tp1Price: number;
  tp2Price: number | null;
  initialVolume: number;
  openVolume: number;
  riskAmountUsd: number;
  plannedRr: number;
  confidence: number;
  spreadPipsAtEntry: number | null;
  createdAt: number;
  filledAt: number | null;
  tp1HitAt: number | null;
  tp1FillPrice: number | null;
  tp1PnlUsd: number;
  closedAt: number | null;
  exitPrice: number | null;
  realizedPnlUsd: number;
  floatingPnlUsd: number;
  realizedR: number;
  mfePrice: number | null;
  maePrice: number | null;
  mfeR: number;
  maeR: number;
  barsHeld: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  resolutionMethod: ResolutionMethod | null;
  lastEvaluatedTime: number | null;
  reasons: string[];
  confluence: any | null;
  events: PaperTradeEvent[];
}

export interface TradeReplayMarker {
  kind: 'SIGNAL' | 'FILL' | 'TP1' | 'BE_MOVE' | 'EXIT';
  label: string;
  time: number;
  price: number;
  color: string;
}

export interface TradeReplayPriceLines {
  requestedEntry: number;
  fillPrice: number | null;
  initialSl: number;
  currentSl: number;
  tp1Price: number;
  tp2Price: number | null;
  exitPrice: number | null;
}

export interface TradeReplaySnapshot {
  tradeId: string;
  symbol: string;
  timeframe: string;
  preEntryBars: number;
  tradeBars: number;
  postExitBars: number;
  candles: MarketCandle[];
  markers: TradeReplayMarker[];
  priceLines: TradeReplayPriceLines;
  createdAt: number;
  trade?: PaperTradeRecord;
}

export interface ExecuteTradeParams {
  uid?: string;
  signalId?: string;
  symbol: string;
  timeframe?: string;
  market?: string;
  strategyId?: string;
  strategyLabel?: string;
  tier?: string;
  action: 'BUY' | 'SELL' | string;
  volume?: number;
  sl?: number;
  tp?: number;
  tp2?: number;
  riskAmountUsd?: number;
  rr?: number;
  confidence?: number;
  entryType?: 'market' | 'limit' | 'stop' | string;
  rawEntryType?: string;
  price?: number;
  openPrice?: number;
  limitPrice?: number;
  referencePrice?: number;
  signalTime?: number;
  reasons?: string[];
  confluence?: any;
  comment?: string;
}

export interface ExecuteTradeResult {
  success: boolean;
  duplicate?: boolean;
  entryType: 'market' | 'limit';
  symbol: string;
  brokerSymbol?: string;
  volume?: number;
  price?: number;
  sl?: number;
  tp?: number;
  tp2?: number;
  exitMode?: ExitMode;
  tradeId?: string;
  result?: any;
  error?: string;
}

export interface SymbolQuoteResponse {
  ok: boolean;
  symbol: string;
  brokerSymbol?: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread: number | null;
  spreadPips: number | null;
  digits: number;
  timestamp?: string;
  error?: string;
}

export interface MarketQuoteRow {
  symbol: string;
  name: string;
  assetType: 'FOREX' | 'METAL' | 'FUTURES';
  digits: number;
  pipSize: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spreadPips: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  changePct: number | null;
  timestamp: string | null;
}

export interface IExecutionBroker {
  readonly mode: ExecutionMode;
  getAccountInfo(uid: string): Promise<Record<string, any>>;
  getSymbolQuote(symbol: string, referencePrice?: number): Promise<SymbolQuoteResponse>;
  getAllInstrumentQuotes(): Promise<MarketQuoteRow[]>;
  executeTrade(params: ExecuteTradeParams): Promise<ExecuteTradeResult>;
  getOpenPositions(uid: string): Promise<any[]>;
  getOpenOrders(uid: string): Promise<any[]>;
  closePosition(
    positionId: string,
    exitPriceOverride?: number,
    expectedUid?: string
  ): Promise<{ success: boolean; result?: any; error?: string }>;
  cancelOrder(
    orderId: string,
    expectedUid?: string
  ): Promise<{ success: boolean; result?: any; error?: string }>;
}

const FULL_TP1_STRATEGY_IDS = new Set([
  'traxo_mean_equilibrium',
  'traxo_sovereign_fix',
  'traxo_aurum_fix',
  'traxo_barrier_grid',
  'traxo_power_hour_moc',
]);

/**
 * Dynamic TP1 vs TP2 Exit Policy Assignment:
 * - Returns FULL_TP1 when volume cannot be cleanly split in half (< 2 futures contracts or < 0.02 lots),
 *   for mean-reversion/benchmark-fix snapback strategies, for AGGRESSIVE confluence (< 6 pts),
 *   or when no valid tp2 target exists.
 * - Returns SCALE_50_TP1_BE_TP2 for PRIME/STANDARD expansion, breakout, and liquidity-sweep
 *   engines with splittable size and a defined TP2 target.
 */
export function assignDynamicExitMode(params: {
  strategyId?: string;
  market?: string;
  tier?: string;
  volume: number;
  tp2?: number | null;
}): ExitMode {
  const marketUpper = String(params.market || '').toUpperCase();
  const tierUpper = String(params.tier || 'STANDARD').toUpperCase();
  const vol = Number(params.volume) || 0;

  if (marketUpper === 'FUTURES') {
    if (vol < 2) return 'FULL_TP1';
  } else if (vol < 0.02) {
    return 'FULL_TP1';
  }

  if (params.strategyId && FULL_TP1_STRATEGY_IDS.has(params.strategyId)) {
    return 'FULL_TP1';
  }

  if (tierUpper === 'AGGRESSIVE') {
    return 'FULL_TP1';
  }

  if (!params.tp2 || !Number.isFinite(params.tp2) || params.tp2 <= 0) {
    return 'FULL_TP1';
  }

  return 'SCALE_50_TP1_BE_TP2';
}

export function isTerminalPaperStatus(status: PaperTradeStatus | string): boolean {
  return (
    status === 'WIN_TP1' ||
    status === 'WIN_TP2' ||
    status === 'WIN_TP1_BE' ||
    status === 'LOSS_SL' ||
    status === 'CLOSED_MANUAL' ||
    status === 'EXPIRED' ||
    status === 'CANCELLED'
  );
}

export function isWinningPaperStatus(status: PaperTradeStatus | string): boolean {
  return status === 'WIN_TP1' || status === 'WIN_TP2' || status === 'WIN_TP1_BE';
}
