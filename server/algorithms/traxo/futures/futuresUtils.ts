/**
 * Shared utilities for TRAXO Futures (MNQ / NQ / USTEC) Proprietary Engines.
 */

import type {
  TraxoCandle,
  TraxoEntryType,
  TraxoSignalDirection,
  TraxoSignalResult,
  TraxoStrategyContext,
  TraxoTier,
} from '../types';

export const FUTURES_SUPPORTED_SYMBOLS: string[] = ['MNQ', 'NQ', 'USTEC'];

const FUTURES_SYMBOL_ALIASES: Record<string, string> = {
  MNQ: 'MNQ',
  MNQ1: 'MNQ',
  MNQM: 'MNQ',
  NQ: 'NQ',
  NQ1: 'NQ',
  NQM: 'NQ',
  USTEC: 'USTEC',
  USTECM: 'USTEC',
  NAS100: 'USTEC',
  NAS100M: 'USTEC',
  US100: 'USTEC',
  NDX: 'USTEC',
};

const NY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function normalizeFuturesSymbol(symbol: string): string {
  const cleaned = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (FUTURES_SYMBOL_ALIASES[cleaned]) {
    return FUTURES_SYMBOL_ALIASES[cleaned];
  }
  return cleaned;
}

export function isSupportedFuturesSymbol(
  symbol: string,
  supported: readonly string[] = FUTURES_SUPPORTED_SYMBOLS
): boolean {
  const normalized = normalizeFuturesSymbol(symbol);
  return supported.includes(normalized);
}

export function roundFuturesPrice(price: number): number {
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

export function normalizeTimeframe(tf: string): string {
  const raw = String(tf || '').trim().toUpperCase();
  if (raw === 'M1' || raw === '1M' || raw === '1MIN' || raw === '1') return '1m';
  if (raw === 'M3' || raw === '3M' || raw === '3MIN' || raw === '3') return '3m';
  if (raw === 'M5' || raw === '5M' || raw === '5MIN' || raw === '5') return '5m';
  if (raw === 'M15' || raw === '15M' || raw === '15MIN' || raw === '15') return '15m';
  if (raw === 'M30' || raw === '30M' || raw === '30MIN' || raw === '30') return '30m';
  if (raw === 'H1' || raw === '1H' || raw === '60') return '1H';
  if (raw === 'H4' || raw === '4H' || raw === '240') return '4H';
  if (raw === 'D1' || raw === '1D' || raw === '1DAY' || raw === 'D') return '1D';
  return String(tf || '').trim();
}

export interface NyClockSnapshot {
  nyYear: number;
  nyMonth: number;
  nyDay: number;
  nyHour: number;
  nyMinute: number;
  nyMinutesOfDay: number;
  nyDateKey: string;
  prevNyDateKey: string;
  utcDate: Date;
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toNyClock(ts: string | number | Date): NyClockSnapshot | null {
  const utcDate = parseUtcDate(ts);
  if (!utcDate) return null;

  const parts = NY_FORMATTER.formatToParts(utcDate);
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '0');
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '0');
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '0');
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const nyHour = rawHour % 24;
  const nyMinute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  if (!year || !month || !day) return null;

  const prev = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));
  const prevNyDateKey = formatDateKey(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());

  return {
    nyYear: year,
    nyMonth: month,
    nyDay: day,
    nyHour,
    nyMinute,
    nyMinutesOfDay: nyHour * 60 + nyMinute,
    nyDateKey: formatDateKey(year, month, day),
    prevNyDateKey,
    utcDate,
  };
}

export function resolveNyClock(
  context: TraxoStrategyContext,
  fallbackCandle: TraxoCandle
): NyClockSnapshot | null {
  const fromCandle = toNyClock(fallbackCandle.timestamp);
  if (fromCandle) return fromCandle;

  if (!context.session) return null;
  // Fallback when candle timestamp is non-standard but session UTC clock is supplied (fixed EST = UTC-5)
  const now = new Date();
  now.setUTCHours(context.session.utcHour, context.session.utcMinute, 0, 0);
  if (context.session.dayOfMonth) {
    now.setUTCDate(context.session.dayOfMonth);
  }
  return toNyClock(now);
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

export interface BuildFuturesSignalParams {
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

export function buildFuturesSignal(params: BuildFuturesSignalParams): TraxoSignalResult | null {
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

  const normalizedSymbol = normalizeFuturesSymbol(symbol);
  const roundedEntry = roundFuturesPrice(entryPrice);
  const roundedSl = roundFuturesPrice(slPrice);
  const roundedTp1 = roundFuturesPrice(tp1Price);
  const roundedTp2 = roundFuturesPrice(tp2Price);

  const risk = Math.abs(roundedEntry - roundedSl);
  const reward = Math.abs(roundedTp1 - roundedEntry);
  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(reward) || reward <= 0) {
    return null;
  }

  if (
    direction === 'BUY' &&
    (roundedSl >= roundedEntry || roundedTp1 <= roundedEntry || roundedTp2 <= roundedTp1)
  ) {
    return null;
  }
  if (
    direction === 'SELL' &&
    (roundedSl <= roundedEntry || roundedTp1 >= roundedEntry || roundedTp2 >= roundedTp1)
  ) {
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
    market: 'FUTURES',
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
