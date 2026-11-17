import { computeATR, computeADX, computeEMA, assessEMAStack } from '../../../algorithms/trendFollowing/emaEngine';
import {
  detectSwingHighs,
  detectSwingLows,
  labelSwingHighs,
  labelSwingLows,
  determineTrend,
} from '../../../algorithms/trendFollowing/structureEngine';
import { detectFVG } from '../../../algorithms/orderBlock/fvgEngine';
import {
  getWickRejectionAnchorTimeframe,
  resolveWickRejectionSession,
} from '../../../algorithms/wickRejectionContext';
import type {
  WickRejectionAssetType,
  WickRejectionContext,
  WickRejectionHTFBias,
  WickRejectionZoneType,
} from '../../../algorithms/wickRejection';
import type { OrderBlockContext, NewsEvent, OBCandle } from '../../../algorithms/orderBlock/types';
import type { BreakoutContext, BKAssetType } from '../../../algorithms/breakout/types';
import type { SupplyDemandContext, SDAssetType } from '../../../algorithms/supplyDemand/types';
import type { TrendFollowingContext, TFAssetType, TrendDirection } from '../../../algorithms/trendFollowing/types';
import { getAssetType, normalizeSymbol } from '../../config/instruments';

export interface RawCandleInput {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp?: string;
  time?: number | string;
}

export interface NormalizedCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  time: number;
}

export interface OrderBlockZoneSummary {
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
}

export interface BuildStrategyContextParams {
  symbol: string;
  timeframe: string;
  candles: RawCandleInput[];
  htfCandles?: RawCandleInput[];
  htfTimeframe?: string;
  newsMinutesAway?: number | null;
  newsEvents?: NewsEvent[];
  rollingDrawdownPct?: number;
  consecutiveLosses?: number;
  perSymbolDrawdownPct?: number;
  perSymbolConsecLosses?: number;
  accountBalance?: number;
}

export interface LiveStrategyContext {
  symbol: string;
  timeframe: string;
  assetType: 'FOREX' | 'STOCKS' | 'CRYPTO';
  candles: NormalizedCandle[];
  htfTimeframe: string;
  htfCandles: NormalizedCandle[];
  atrArr: number[];
  atr14: number;
  wickAtr14: number;
  volumeMa20: number;
  wickVolumeMa20: number;
  allSwingHighs: number[];
  allSwingLows: number[];
  swingHighs: number[];
  swingLows: number[];
  nearestZone: number | null;
  zoneType: WickRejectionZoneType | undefined;
  orderBlockZone: OrderBlockZoneSummary | undefined;
  htfBias: WickRejectionHTFBias;
  htfTrendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tfHtfDirection: TrendDirection;
  htfAdx: number;
  htfCacheStatus: 'fresh' | 'stale' | 'failed';
  newsMinutesAway: number | null;
  newsEvents: NewsEvent[];
  rollingDrawdownPct: number;
  consecutiveLosses: number;
  perSymbolDrawdownPct: number;
  perSymbolConsecLosses: number;
  accountBalance?: number;
  toWickRejectionContext(): WickRejectionContext;
  toBreakoutContext(): BreakoutContext;
  toOrderBlockContext(): OrderBlockContext;
  toSupplyDemandContext(): SupplyDemandContext;
  toTrendFollowingContext(): TrendFollowingContext;
}

export function normalizeCandle(candle: RawCandleInput): NormalizedCandle {
  const rawTime = candle.timestamp ?? candle.time;
  const ms =
    typeof rawTime === 'string'
      ? new Date(rawTime).getTime()
      : typeof rawTime === 'number'
        ? rawTime > 10_000_000_000
          ? rawTime
          : rawTime * 1000
        : Date.now();

  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return {
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume ?? 0),
    timestamp: new Date(safeMs).toISOString(),
    time: Math.floor(safeMs / 1000),
  };
}

export function calcATR14(candles: NormalizedCandle[]): number[] {
  return computeATR(candles, 14);
}

export function calcVolumeMa(candles: NormalizedCandle[], upToIdx: number, period = 20): number {
  if (candles.length === 0 || upToIdx < 0) return 0;
  const start = Math.max(0, upToIdx - period + 1);
  const slice = candles.slice(start, upToIdx + 1).map((c) => c.volume ?? 0);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export function findSwingHighs(candles: NormalizedCandle[], lookback = 3): number[] {
  const highs: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) highs.push(candles[i].high);
  }
  return highs;
}

export function findSwingLows(candles: NormalizedCandle[], lookback = 3): number[] {
  const lows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].low <= candles[i].low) {
        isLow = false;
        break;
      }
    }
    if (isLow) lows.push(candles[i].low);
  }
  return lows;
}

export function calcHTFBias(candles: NormalizedCandle[]): WickRejectionHTFBias {
  if (candles.length < 20) return 'neutral';
  const period = Math.min(50, candles.length);
  const avg = candles.slice(-period).reduce((sum, c) => sum + c.close, 0) / period;
  const last = candles[candles.length - 1].close;
  const threshold = avg * 0.001;
  if (last > avg + threshold) return 'bullish';
  if (last < avg - threshold) return 'bearish';
  return 'neutral';
}

export function calcOrderBlock(
  candles: NormalizedCandle[],
  atrs: number[],
  upToIdx: number,
  lookback = 20
): OrderBlockZoneSummary | undefined {
  const start = Math.max(1, upToIdx - lookback);
  for (let i = upToIdx - 1; i >= start; i--) {
    const next = candles[i + 1];
    if (!next) continue;
    const atr = atrs[i] || atrs[atrs.length - 1] || 0;
    const move = Math.abs(next.close - next.open);
    if (move < atr * 0.8) continue;
    if (next.close > next.open && candles[i].close < candles[i].open) {
      return { high: candles[i].high, low: candles[i].low, type: 'bullish' };
    }
    if (next.close < next.open && candles[i].close > candles[i].open) {
      return { high: candles[i].high, low: candles[i].low, type: 'bearish' };
    }
  }
  return undefined;
}

function resampleCandles(candles: NormalizedCandle[], factor = 4): NormalizedCandle[] {
  if (candles.length < factor * 5) return candles;
  const resampled: NormalizedCandle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    resampled.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      timestamp: chunk[chunk.length - 1].timestamp,
      time: chunk[chunk.length - 1].time,
    });
  }
  return resampled;
}

function hasEqualLevel(levels: number[], target: number, tolerance: number): boolean {
  let matches = 0;
  for (const level of levels) {
    if (Math.abs(level - target) <= tolerance) {
      matches++;
      if (matches >= 2) return true;
    }
  }
  return false;
}

function computeHTFAnalysis(
  baseCandles: NormalizedCandle[],
  providedHtfCandles?: NormalizedCandle[]
): {
  htfSeries: NormalizedCandle[];
  htfBias: WickRejectionHTFBias;
  htfTrendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tfHtfDirection: TrendDirection;
  htfAdx: number;
  htfCacheStatus: 'fresh' | 'stale' | 'failed';
} {
  const hasRealHtf = Boolean(providedHtfCandles && providedHtfCandles.length >= 20);
  const htfSeries = hasRealHtf
    ? providedHtfCandles!
    : baseCandles.length >= 120
      ? resampleCandles(baseCandles, 4)
      : baseCandles;

  const closes = htfSeries.map((c) => c.close);
  const lastIdx = htfSeries.length - 1;
  const ema20Arr = computeEMA(closes, Math.min(20, htfSeries.length));
  const ema50Arr = computeEMA(closes, Math.min(50, htfSeries.length));
  const ema200Arr = computeEMA(closes, Math.min(200, htfSeries.length));

  const stack = assessEMAStack(
    htfSeries[lastIdx]?.close ?? 0,
    ema20Arr[lastIdx] ?? 0,
    ema50Arr[lastIdx] ?? 0,
    ema200Arr[lastIdx] ?? 0
  );
  const emaBias: TrendDirection = stack.direction === 'AMBIGUOUS' ? 'RANGING' : stack.direction;

  const rawHighs = detectSwingHighs(htfSeries, 3);
  const rawLows = detectSwingLows(htfSeries, 3);
  const trendDir = determineTrend(labelSwingHighs(rawHighs), labelSwingLows(rawLows), emaBias);

  const smaBias = calcHTFBias(htfSeries);
  let htfBias: WickRejectionHTFBias = smaBias;
  if (trendDir === 'BULLISH') htfBias = 'bullish';
  else if (trendDir === 'BEARISH') htfBias = 'bearish';

  const htfTrendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    htfBias === 'bullish' ? 'BULLISH' : htfBias === 'bearish' ? 'BEARISH' : 'NEUTRAL';

  const adxSource = htfSeries.length >= 29 ? htfSeries : baseCandles;
  const adxArr = computeADX(adxSource, 14);
  const htfAdx = Number((adxArr[adxArr.length - 1] ?? 0).toFixed(2));

  return {
    htfSeries,
    htfBias,
    htfTrendDirection,
    tfHtfDirection: trendDir,
    htfAdx,
    htfCacheStatus: hasRealHtf || baseCandles.length >= 60 ? 'fresh' : 'stale',
  };
}

export function buildLiveStrategyContext(params: BuildStrategyContextParams): LiveStrategyContext {
  const canonicalSymbol = normalizeSymbol(params.symbol);
  const assetType = getAssetType(canonicalSymbol);
  const candles = (params.candles || []).map(normalizeCandle);
  const htfTimeframe = params.htfTimeframe || getWickRejectionAnchorTimeframe(params.timeframe);
  const normalizedHtf = params.htfCandles?.map(normalizeCandle);

  const atrArr = calcATR14(candles);
  const lastIdx = Math.max(0, candles.length - 1);
  const wickIdx = Math.max(0, candles.length - 2);

  const atr14 = atrArr[lastIdx] ?? 0;
  const wickAtr14 = atrArr[wickIdx] ?? atr14;
  const volumeMa20 = calcVolumeMa(candles, lastIdx, 20);
  const wickVolumeMa20 = calcVolumeMa(candles, wickIdx, 20);

  // Structural slices up to wickIdx so wickRejection does not leak future confirmation bar
  const wickWindow = candles.slice(0, wickIdx + 1);
  const refPrice = candles[wickIdx]?.close ?? candles[lastIdx]?.close ?? 0;

  const allSwingHighs = findSwingHighs(wickWindow, 3);
  const allSwingLows = findSwingLows(wickWindow, 3);
  const swingHighs = allSwingHighs.filter((h) => h > refPrice).sort((a, b) => a - b);
  const swingLows = allSwingLows.filter((l) => l < refPrice).sort((a, b) => b - a);

  // Nearest structural zone (swing highs/lows + recent unfilled FVGs)
  const fvgs = wickAtr14 > 0 ? detectFVG(wickWindow as OBCandle[], wickAtr14) : [];
  const fvgMidpoints = fvgs.slice(-5).map((f) => ({
    price: (f.high + f.low) / 2,
    type: 'fvg' as WickRejectionZoneType,
  }));

  const candidateZones: Array<{ price: number; type: WickRejectionZoneType }> = [
    ...allSwingHighs.map((price) => ({
      price,
      type: (hasEqualLevel(allSwingHighs, price, wickAtr14 * 0.25)
        ? 'equal_highs'
        : 'resistance') as WickRejectionZoneType,
    })),
    ...allSwingLows.map((price) => ({
      price,
      type: (hasEqualLevel(allSwingLows, price, wickAtr14 * 0.25)
        ? 'equal_lows'
        : 'support') as WickRejectionZoneType,
    })),
    ...fvgMidpoints,
  ];

  let nearestZone: number | null = null;
  let zoneType: WickRejectionZoneType | undefined;
  if (candidateZones.length > 0) {
    const closest = candidateZones.reduce((best, curr) =>
      Math.abs(curr.price - refPrice) < Math.abs(best.price - refPrice) ? curr : best
    );
    nearestZone = closest.price;
    zoneType = closest.type;
  }

  const orderBlockZone = candles.length >= 2 ? calcOrderBlock(candles, atrArr, wickIdx, 20) : undefined;
  const htf = computeHTFAnalysis(candles, normalizedHtf);

  const newsMinutesAway = params.newsMinutesAway ?? null;
  const newsEvents = params.newsEvents ?? [];
  const rollingDrawdownPct = params.rollingDrawdownPct ?? 0;
  const consecutiveLosses = params.consecutiveLosses ?? 0;
  const perSymbolDrawdownPct = params.perSymbolDrawdownPct ?? 0;
  const perSymbolConsecLosses = params.perSymbolConsecLosses ?? 0;

  return {
    symbol: canonicalSymbol,
    timeframe: params.timeframe,
    assetType,
    candles,
    htfTimeframe,
    htfCandles: htf.htfSeries,
    atrArr,
    atr14,
    wickAtr14,
    volumeMa20,
    wickVolumeMa20,
    allSwingHighs,
    allSwingLows,
    swingHighs,
    swingLows,
    nearestZone,
    zoneType,
    orderBlockZone,
    htfBias: htf.htfBias,
    htfTrendDirection: htf.htfTrendDirection,
    tfHtfDirection: htf.tfHtfDirection,
    htfAdx: htf.htfAdx,
    htfCacheStatus: htf.htfCacheStatus,
    newsMinutesAway,
    newsEvents,
    rollingDrawdownPct,
    consecutiveLosses,
    perSymbolDrawdownPct,
    perSymbolConsecLosses,
    accountBalance: params.accountBalance,

    toWickRejectionContext(): WickRejectionContext {
      const candle = candles[wickIdx] || candles[lastIdx];
      const confirmationCandle = candles.length >= 2 ? candles[lastIdx] : undefined;
      const wrAssetType: WickRejectionAssetType =
        assetType === 'STOCKS' ? 'STOCKS' : assetType === 'CRYPTO' ? 'CRYPTO' : 'FOREX';
      const session = resolveWickRejectionSession(wrAssetType, candle.timestamp);

      return {
        symbol: canonicalSymbol,
        assetType: wrAssetType,
        timeframe: params.timeframe,
        candle,
        confirmationCandle,
        atr14: wickAtr14,
        volumeMa20: wickVolumeMa20,
        nearestZone,
        zoneType,
        htfBias: htf.htfBias,
        htfCacheStatus: htf.htfCacheStatus,
        session,
        newsMinutesAway,
        rollingDrawdownPct,
        consecutiveLosses,
        swingHighs,
        swingLows,
        orderBlockZone,
      };
    },

    toBreakoutContext(): BreakoutContext {
      return {
        symbol: canonicalSymbol,
        timeframe: params.timeframe,
        assetType: assetType as BKAssetType,
        candles,
        rollingDrawdownPct,
        consecutiveLosses,
        newsMinutesAway: newsMinutesAway ?? undefined,
        htfTrendDirection: htf.htfTrendDirection,
      };
    },

    toOrderBlockContext(): OrderBlockContext {
      const htfMap: Record<string, OBCandle[]> | undefined =
        normalizedHtf && normalizedHtf.length >= 20 ? { [htfTimeframe]: normalizedHtf } : undefined;
      return {
        symbol: canonicalSymbol,
        asset_type: assetType,
        timeframe: params.timeframe as OrderBlockContext['timeframe'],
        candles,
        htfCandles: htfMap,
        atr14,
        volumeMa20,
        htfBias: htf.htfBias,
        htfBiasStatus: htf.htfCacheStatus,
        newsEvents,
        rollingDrawdownPct,
        consecutiveLosses,
        accountBalance: params.accountBalance,
      };
    },

    toSupplyDemandContext(): SupplyDemandContext {
      return {
        symbol: canonicalSymbol,
        timeframe: params.timeframe,
        assetType: assetType as SDAssetType,
        candles,
        rollingDrawdownPct,
        consecutiveLosses,
        perSymbolDrawdownPct,
        perSymbolConsecLosses,
        newsMinutesAway: newsMinutesAway ?? undefined,
        htfTrendDirection: htf.htfTrendDirection,
      };
    },

    toTrendFollowingContext(): TrendFollowingContext {
      return {
        symbol: canonicalSymbol,
        timeframe: params.timeframe,
        asset_type: assetType as TFAssetType,
        candles,
        rollingDrawdownPct,
        consecutiveLosses,
        newsMinutesAway,
        htfTrendDirection: htf.tfHtfDirection,
        htfAdx: htf.htfAdx,
      };
    },
  };
}
