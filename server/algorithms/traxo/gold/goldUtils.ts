/**
 * Shared utilities for TRAXO Gold (XAU/USD) Proprietary Engines.
 */

import type {
  TraxoCandle,
  TraxoEntryType,
  TraxoSignalDirection,
  TraxoSignalResult,
  TraxoStrategyContext,
  TraxoTier,
} from '../types';

export const GOLD_SUPPORTED_SYMBOLS: string[] = [
  'XAU/USD',
  'XAUUSD',
  'XAUUSDm',
  'GOLD',
];

export function normalizeGoldSymbol(symbol: string): string {
  const cleaned = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (
    cleaned === 'XAUUSD' ||
    cleaned === 'XAUUSDM' ||
    cleaned === 'GOLD' ||
    cleaned === 'XAU'
  ) {
    return 'XAUUSD';
  }
  return cleaned;
}

export function isSupportedGoldSymbol(symbol: string): boolean {
  const normalized = normalizeGoldSymbol(symbol);
  return normalized === 'XAUUSD';
}

export function roundGoldPrice(price: number): number {
  return Number(price.toFixed(2));
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

export function getUtcMinutesOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function normalizeTimeframe(tf: string): string {
  const raw = String(tf || '').trim().toUpperCase();
  if (raw === 'M1' || raw === '1M' || raw === '1MIN' || raw === '1') return '1m';
  if (raw === 'M5' || raw === '5M' || raw === '5MIN' || raw === '5') return '5m';
  if (raw === 'M15' || raw === '15M' || raw === '15MIN' || raw === '15') return '15m';
  if (raw === 'M30' || raw === '30M' || raw === '30MIN' || raw === '30') return '30m';
  if (raw === 'H1' || raw === '1H' || raw === '60') return '1H';
  if (raw === 'H4' || raw === '4H' || raw === '240') return '4H';
  if (raw === 'D1' || raw === '1D' || raw === '1DAY' || raw === 'D') return '1D';
  return String(tf || '').trim();
}

export interface UtcClockSnapshot {
  utcHour: number;
  utcMinute: number;
  utcMinutesOfDay: number;
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
  const utcHour = parsed ? baseDate.getUTCHours() : (context.session?.utcHour ?? baseDate.getUTCHours());
  const utcMinute = parsed ? baseDate.getUTCMinutes() : (context.session?.utcMinute ?? baseDate.getUTCMinutes());
  const dayOfMonth = parsed ? baseDate.getUTCDate() : (context.session?.dayOfMonth ?? baseDate.getUTCDate());
  const dayOfWeek = parsed ? baseDate.getUTCDay() : (context.session?.dayOfWeek ?? baseDate.getUTCDay());

  return {
    utcHour,
    utcMinute,
    utcMinutesOfDay: utcHour * 60 + utcMinute,
    dayOfMonth,
    dayOfWeek,
    dateKey: getUtcDateKey(baseDate),
    date: baseDate,
  };
}

export function hasValidCandles(candles: TraxoCandle[], minLength: number): boolean {
  if (!Array.isArray(candles) || candles.length < minLength) return false;
  for (const c of candles) {
    if (
      !c ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.high < c.low ||
      c.low <= 0
    ) {
      return false;
    }
  }
  return true;
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
      return 1.0;
    case 'STANDARD':
      return 0.75;
    case 'AGGRESSIVE':
      return 0.5;
  }
}

export interface BuildGoldSignalParams {
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
  metrics?: TraxoSignalResult['metrics'];
  timestampIso: string;
}

export function buildGoldSignal(params: BuildGoldSignalParams): TraxoSignalResult | null {
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

  const normalizedSymbol = normalizeGoldSymbol(symbol);
  const roundedEntry = roundGoldPrice(entryPrice);
  const roundedSl = roundGoldPrice(slPrice);
  const roundedTp1 = roundGoldPrice(tp1Price);
  const roundedTp2 = roundGoldPrice(tp2Price);

  const risk = Math.abs(roundedEntry - roundedSl);
  const reward = Math.abs(roundedTp1 - roundedEntry);
  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(reward) || reward <= 0) {
    return null;
  }

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
    market: 'METALS',
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
