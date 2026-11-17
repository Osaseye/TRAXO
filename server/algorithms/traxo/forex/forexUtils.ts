/**
 * Shared utilities for TRAXO Forex Proprietary Engines.
 */

import type {
  TraxoCandle,
  TraxoEntryType,
  TraxoSignalDirection,
  TraxoSignalResult,
  TraxoStrategyContext,
  TraxoTier,
} from '../types';

export const FOREX_ALL_SYMBOLS: string[] = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCAD',
  'USDCHF',
  'NZDUSD',
  'EURJPY',
  'GBPJPY',
  'EURGBP',
];

export const LONDON_APEX_SYMBOLS: string[] = [
  'EURUSD',
  'GBPUSD',
  'EURGBP',
  'USDCHF',
  'EURJPY',
  'GBPJPY',
  'AUDUSD',
  'USDCAD',
];

export function normalizeForexSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

export function isSupportedForexSymbol(symbol: string, supported: readonly string[]): boolean {
  const normalized = normalizeForexSymbol(symbol);
  return supported.includes(normalized);
}

export function getForexPipSize(symbol: string): number {
  return normalizeForexSymbol(symbol).endsWith('JPY') ? 0.01 : 0.0001;
}

export function roundForexPrice(price: number, symbol: string): number {
  const decimals = normalizeForexSymbol(symbol).endsWith('JPY') ? 3 : 5;
  return Number(price.toFixed(decimals));
}

export function parseUtcDate(ts: string | number | Date): Date | null {
  if (ts instanceof Date) {
    return Number.isNaN(ts.getTime()) ? null : ts;
  }
  if (typeof ts === 'number') {
    if (!Number.isFinite(ts)) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === 'string' && ts.trim().length > 0) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function getUtcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeTimeframe(tf: string): string {
  const raw = tf.trim().toUpperCase();
  if (raw === 'M1' || raw === '1M' || raw === '1') return '1m';
  if (raw === 'M5' || raw === '5M' || raw === '5') return '5m';
  if (raw === 'M15' || raw === '15M' || raw === '15') return '15m';
  if (raw === 'M30' || raw === '30M' || raw === '30') return '30m';
  if (raw === 'H1' || raw === '1H' || raw === '60') return '1H';
  if (raw === 'H4' || raw === '4H' || raw === '240') return '4H';
  if (raw === 'D1' || raw === '1D' || raw === 'D') return '1D';
  return tf.trim();
}

export interface UtcClockSnapshot {
  utcHour: number;
  utcMinute: number;
  dayOfMonth: number;
  dayOfWeek: number;
  dateKey: string;
  date: Date;
}

export function resolveUtcClock(
  context: TraxoStrategyContext,
  fallbackCandle: TraxoCandle
): UtcClockSnapshot | null {
  const parsed = parseUtcDate(fallbackCandle.timestamp);
  if (!parsed && !context.session) return null;

  const baseDate = parsed ?? new Date();
  const utcHour = context.session?.utcHour ?? baseDate.getUTCHours();
  const utcMinute = context.session?.utcMinute ?? baseDate.getUTCMinutes();
  const dayOfMonth = context.session?.dayOfMonth ?? baseDate.getUTCDate();
  const dayOfWeek = context.session?.dayOfWeek ?? baseDate.getUTCDay();

  return {
    utcHour,
    utcMinute,
    dayOfMonth,
    dayOfWeek,
    dateKey: getUtcDateKey(baseDate),
    date: baseDate,
  };
}

export function resolveTier(confidencePct: number): TraxoTier | null {
  if (confidencePct >= 75) return 'PRIME';
  if (confidencePct >= 55) return 'STANDARD';
  if (confidencePct >= 40) return 'AGGRESSIVE';
  return null;
}

export function resolveSuggestedRiskPct(tier: TraxoTier): number {
  switch (tier) {
    case 'PRIME':
      return 1.25;
    case 'STANDARD':
      return 0.75;
    case 'AGGRESSIVE':
      return 0.5;
  }
}

export interface BuildForexSignalParams {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  direction: TraxoSignalDirection;
  rawScore: number;
  maxScore?: number;
  entryType?: TraxoEntryType;
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  reasons: string[];
  metrics?: Record<string, unknown>;
  timestampIso: string;
}

export function buildForexSignal(params: BuildForexSignalParams): TraxoSignalResult | null {
  const {
    strategyId,
    strategyName,
    symbol,
    timeframe,
    direction,
    rawScore,
    maxScore = 100,
    entryType = 'MARKET',
    entryPrice,
    slPrice,
    tp1Price,
    tp2Price,
    reasons,
    metrics,
    timestampIso,
  } = params;

  const normalizedSymbol = normalizeForexSymbol(symbol);
  const roundedEntry = roundForexPrice(entryPrice, normalizedSymbol);
  const roundedSl = roundForexPrice(slPrice, normalizedSymbol);
  const roundedTp1 = roundForexPrice(tp1Price, normalizedSymbol);
  const roundedTp2 = roundForexPrice(tp2Price, normalizedSymbol);

  const risk = Math.abs(roundedEntry - roundedSl);
  const reward = Math.abs(roundedTp1 - roundedEntry);
  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(reward) || reward <= 0) {
    return null;
  }

  // Validate directional geometry
  if (direction === 'BUY' && (roundedSl >= roundedEntry || roundedTp1 <= roundedEntry || roundedTp2 <= roundedTp1)) {
    return null;
  }
  if (direction === 'SELL' && (roundedSl <= roundedEntry || roundedTp1 >= roundedEntry || roundedTp2 >= roundedTp1)) {
    return null;
  }

  const confidencePct = Math.max(0, Math.min(100, Math.round((rawScore / maxScore) * 100)));
  const tier = resolveTier(confidencePct);
  if (!tier) return null;

  const riskRewardRatio = Number((reward / risk).toFixed(2));

  return {
    id: `${strategyId}_${normalizedSymbol}_${normalizeTimeframe(timeframe)}_${timestampIso}`,
    strategyId,
    strategyName,
    market: 'FOREX',
    symbol: normalizedSymbol,
    direction,
    score: Math.round(rawScore),
    confidencePct,
    tier,
    entryType,
    entryPrice: roundedEntry,
    slPrice: roundedSl,
    tp1Price: roundedTp1,
    tp2Price: roundedTp2,
    riskRewardRatio,
    suggestedRiskPct: resolveSuggestedRiskPct(tier),
    reasons,
    metrics,
    timestamp: timestampIso,
  };
}
