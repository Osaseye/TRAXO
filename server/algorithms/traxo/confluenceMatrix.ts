/**
 * TRAXO Harmonized 9-Point Confluence Rule Matrix
 *
 * Evaluates any proprietary TRAXO strategy signal across 9 institutional
 * confluence pillars (HTF bias, liquidity sweep, displacement, imbalance/FVG,
 * optimal value pricing, relative volume, session killzone, asymmetric R:R,
 * and news clearance) to attach uniform diagnostic metadata and tier risk
 * scaling WITHOUT flattening proprietary strategy identities.
 */

import { calculateATR, calculateEMA, calculateRVOL } from './indicators';
import type { TraxoCandle, TraxoSignalResult, TraxoStrategyContext } from './types';

export type NinePointCheckKey =
  | 'htf_bias'
  | 'liquidity_sweep'
  | 'displacement'
  | 'structural_imbalance'
  | 'optimal_value'
  | 'volume_confirmation'
  | 'session_killzone'
  | 'asymmetric_rr'
  | 'news_clearance';

export type NinePointConfluenceTier = 'PRIME' | 'STANDARD' | 'AGGRESSIVE' | 'DISCARD';

export interface NinePointCheckResult {
  key: NinePointCheckKey;
  point: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface NinePointConfluenceResult {
  score: number;
  maxScore: 9;
  tier: NinePointConfluenceTier;
  riskScalePct: 100 | 60 | 25 | 0;
  checks: NinePointCheckResult[];
}

function parseTimestamp(ts: TraxoCandle['timestamp']): Date | null {
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') {
    if (!Number.isFinite(ts)) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === 'string' && ts.trim()) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function hasRecentDirectionalFvg(
  candles: TraxoCandle[],
  direction: 'BUY' | 'SELL',
  atr: number
): boolean {
  if (candles.length < 3) return false;
  const start = Math.max(1, candles.length - 10);
  const minGap = atr > 0 ? atr * 0.08 : 0;

  for (let i = start; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    if (direction === 'BUY' && next.low - prev.high > minGap) return true;
    if (direction === 'SELL' && prev.low - next.high > minGap) return true;
  }
  return false;
}

export function evaluateNinePointConfluence(
  signal: TraxoSignalResult,
  context: TraxoStrategyContext
): NinePointConfluenceResult {
  const candles = context.candles || [];
  const latest = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2] : undefined;
  const atrSeries = candles.length >= 2 ? calculateATR(candles, 14) : [];
  const atr = atrSeries[atrSeries.length - 1] || 0;
  const reasonsJoined = signal.reasons.join(' ').toLowerCase();
  const metrics = signal.metrics || {};

  // 1. HTF Bias
  let htfPassed = true;
  let htfDetail = 'HTF context unavailable; intraday signal bias accepted';
  if (context.higherTimeframeCandles && context.higherTimeframeCandles.length >= 50) {
    const htfCloses = context.higherTimeframeCandles.map((c) => c.close);
    const ema21 = calculateEMA(htfCloses, 21);
    const ema50 = calculateEMA(htfCloses, 50);
    const lastIdx = htfCloses.length - 1;
    const e21 = ema21[lastIdx];
    const e50 = ema50[lastIdx];
    const lastClose = htfCloses[lastIdx];
    const bullish = e21 > e50 && lastClose >= e50;
    const bearish = e21 < e50 && lastClose <= e50;

    htfPassed =
      (signal.direction === 'BUY' && bullish) ||
      (signal.direction === 'SELL' && bearish);
    htfDetail = htfPassed
      ? `HTF EMA21/50 aligned ${signal.direction}`
      : `HTF EMA21/50 not aligned with ${signal.direction}`;
  } else if (metrics.htfAligned === false) {
    htfPassed = false;
    htfDetail = 'Signal HTF alignment metric flagged counter-trend';
  }

  // 2. Liquidity Sweep / Structural Event
  const sweepKeywords = ['sweep', 'swept', 'judas', 'fakeout', 'strike', 'barrier', 'orb', 'initial balance', 'fix', 'nr7', 'vwap'];
  const sweepPassed =
    sweepKeywords.some((kw) => reasonsJoined.includes(kw)) ||
    metrics.sweptLevel !== undefined ||
    metrics.sweepPips !== undefined ||
    metrics.strikePrice !== undefined;

  // 3. Energetic Displacement
  const candleBars = prev ? [prev, latest] : latest ? [latest] : [];
  const displacementPassed = candleBars.some((bar) => {
    const r = bar.high - bar.low;
    if (r <= 0) return false;
    const bodyDom = Math.abs(bar.close - bar.open) / r;
    const atrOk = atr <= 0 || r >= atr * 0.85;
    return bodyDom >= 0.45 && atrOk;
  }) || reasonsJoined.includes('displacement') || reasonsJoined.includes('engulf');

  // 4. Structural Imbalance / FVG
  const fvgDetected = hasRecentDirectionalFvg(candles, signal.direction, atr);
  const imbalancePassed =
    fvgDetected ||
    reasonsJoined.includes('fvg') ||
    reasonsJoined.includes('imbalance') ||
    metrics.fvgLow !== undefined;

  // 5. Optimal Value Pricing (Pullback / VWAP / OTE / Mean Reversion / Limit)
  const ema21Series = candles.length >= 21 ? calculateEMA(candles.map((c) => c.close), 21) : [];
  const currEma21 = ema21Series[ema21Series.length - 1];
  const nearEma21 =
    Number.isFinite(currEma21) && atr > 0 && Math.abs(signal.entryPrice - currEma21) <= atr * 1.25;
  const optimalValuePassed =
    signal.entryType === 'LIMIT' ||
    Boolean(metrics.cleanZoneTouch) ||
    metrics.zScore !== undefined ||
    metrics.sessionVwap !== undefined ||
    metrics.preFixEquilibrium !== undefined ||
    nearEma21 ||
    reasonsJoined.includes('pullback') ||
    reasonsJoined.includes('retest') ||
    reasonsJoined.includes('inside');

  // 6. Volume Confirmation
  const rvol = Number.isFinite(Number(metrics.rvol))
    ? Number(metrics.rvol)
    : calculateRVOL(candles, 20);
  const volumePassed = rvol >= 1.25;

  // 7. Session Kill Zone Alignment
  const latestDate = latest ? parseTimestamp(latest.timestamp) : null;
  const utcHour = context.session?.utcHour ?? (latestDate ? latestDate.getUTCHours() : -1);
  const utcMin = context.session?.utcMinute ?? (latestDate ? latestDate.getUTCMinutes() : 0);
  const utcTotalMin = utcHour >= 0 ? utcHour * 60 + utcMin : -1;
  const upperSym = signal.symbol.toUpperCase();
  const isAsianActivePair = upperSym.includes('JPY') || upperSym.includes('AUD');

  const inLondon = utcTotalMin >= 7 * 60 && utcTotalMin < 11 * 60 + 30;
  const inNylon = utcTotalMin >= 12 * 60 && utcTotalMin < 16 * 60 + 30;
  const inTokyo = isAsianActivePair && utcTotalMin >= 0 && utcTotalMin < 6 * 60;
  const inCmeRth = signal.market === 'FUTURES' && utcTotalMin >= 13 * 60 + 30 && utcTotalMin < 21 * 60;
  const sessionPassed =
    utcTotalMin >= 0
      ? inLondon || inNylon || inTokyo || inCmeRth
      : Boolean(context.session?.isLondon || context.session?.isNewYork || context.session?.isOverlap);

  // 8. Asymmetric Risk-to-Reward
  const rrPassed = Number.isFinite(signal.riskRewardRatio) && signal.riskRewardRatio >= 1.5;

  // 9. News Proximity Clearance
  const newsPassed = !context.newsBlackout;

  const checks: NinePointCheckResult[] = [
    { key: 'htf_bias', point: 1, label: 'Higher Timeframe Bias', passed: htfPassed, detail: htfDetail },
    {
      key: 'liquidity_sweep',
      point: 2,
      label: 'Liquidity Sweep / Event',
      passed: sweepPassed,
      detail: sweepPassed ? 'Liquidity event confirmed' : 'No explicit liquidity sweep detected',
    },
    {
      key: 'displacement',
      point: 3,
      label: 'Energetic Displacement',
      passed: displacementPassed,
      detail: displacementPassed ? 'Candle body/ATR displacement verified' : 'Weak candle displacement',
    },
    {
      key: 'structural_imbalance',
      point: 4,
      label: 'Structural Imbalance / FVG',
      passed: imbalancePassed,
      detail: imbalancePassed ? 'Fair Value Gap / imbalance present' : 'No active 3-candle FVG',
    },
    {
      key: 'optimal_value',
      point: 5,
      label: 'Optimal Value Pricing',
      passed: optimalValuePassed,
      detail: optimalValuePassed ? 'Favorable value/equilibrium pricing' : 'Entry outside value zone',
    },
    {
      key: 'volume_confirmation',
      point: 6,
      label: 'Volume Confirmation',
      passed: volumePassed,
      detail: `RVOL ${rvol.toFixed(2)}x (min 1.25x${rvol >= 1.5 ? ', elite >= 1.50x' : ''})`,
    },
    {
      key: 'session_killzone',
      point: 7,
      label: 'Session Kill Zone',
      passed: sessionPassed,
      detail: utcHour >= 0 ? `UTC ${String(utcHour).padStart(2, '0')}:${String(utcMin).padStart(2, '0')}` : 'Session unknown',
    },
    {
      key: 'asymmetric_rr',
      point: 8,
      label: 'Asymmetric Geometry',
      passed: rrPassed,
      detail: `R:R ${signal.riskRewardRatio.toFixed(2)} (min 1.50)`,
    },
    {
      key: 'news_clearance',
      point: 9,
      label: 'News Proximity Clearance',
      passed: newsPassed,
      detail: newsPassed ? 'No active Tier-1 news blackout' : 'Active news blackout',
    },
  ];

  const score = checks.filter((c) => c.passed).length;
  const tier: NinePointConfluenceTier =
    score >= 8 ? 'PRIME' : score >= 6 ? 'STANDARD' : score >= 4 ? 'AGGRESSIVE' : 'DISCARD';
  const riskScalePct: 100 | 60 | 25 | 0 =
    tier === 'PRIME' ? 100 : tier === 'STANDARD' ? 60 : tier === 'AGGRESSIVE' ? 25 : 0;

  return {
    score,
    maxScore: 9,
    tier,
    riskScalePct,
    checks,
  };
}
