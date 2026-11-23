/* eslint-disable @typescript-eslint/no-explicit-any */
import { analyzeBreakout } from '../../server/algorithms/breakoutStrategy';
import { analyzeOrderBlock } from '../../server/algorithms/orderBlockStrategy';
import { analyzeSupplyDemand } from '../../server/algorithms/supplyDemandStrategy';
import { analyzeTrendFollowing } from '../../server/algorithms/trendFollowingStrategy';
import { analyzeWickRejection } from '../../server/algorithms/wickRejection';
import { evaluateNinePointConfluence, getTraxoStrategy } from '../../server/algorithms/traxo';

export interface Candle {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type RiskLabel = 'Low' | 'Medium' | 'High';

export interface AnalysisSignal {
  id: string;
  time: number;
  strategyId: string;
  strategyLabel: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  confidence: number;
  risk: RiskLabel;
  reason: string[];
  status?: 'live' | 'expired' | 'WIN' | 'LOSS' | 'tp_hit' | 'sl_hit' | string;
  tp2?: number | null;
  entryType?: 'MARKET' | 'LIMIT' | 'STOP' | 'market' | 'limit' | string;
  rawEntryType?: 'MARKET' | 'LIMIT' | 'STOP' | string;
  exitMode?: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';
  tier?: 'PRIME' | 'STANDARD' | 'AGGRESSIVE' | string;
  market?: 'FOREX' | 'METALS' | 'FUTURES' | string;
  confluence?: {
    score: number;
    maxScore?: number;
    tier?: string;
    riskScalePct?: number;
    passedCriteria?: string[];
    checks?: Array<{ key: string; point?: number; label: string; passed: boolean; detail?: string }>;
  } | null;
}

const SHORT_ENGINE_TAGS: Record<string, string> = {
  traxo_london_apex: 'LONDON',
  traxo_tokyo_yield: 'TOKYO',
  traxo_sovereign_fix: 'SOV FIX',
  traxo_barrier_grid: 'BARRIER',
  traxo_macro_vector: 'MACRO',
  traxo_aurum_sweep: 'AURUM',
  traxo_bullion_strike: 'BULLION',
  traxo_ny_bullet: 'NY BULLET',
  traxo_aurum_fix: 'FIX',
  traxo_kinetic_nr7: 'NR7',
  traxo_globex_sweep: 'GLOBEX',
  traxo_velocity_orb: 'ORB',
  traxo_initial_balance: 'IB',
  traxo_mean_equilibrium: 'VWAP',
  traxo_power_hour_moc: 'MOC',
  supply_demand: 'S&D',
  wick_rejection: 'WICK',
  order_block: 'OB',
  trend_following: 'TREND',
  breakout: 'BRK',
};

const TWO_WORD_TAG_SUFFIXES = new Set(['FIX', 'BULLET', 'NR7', 'ORB', 'MOC']);

export function formatShortEngineTag(strategyId?: string, strategyLabel?: string): string {
  const normId = (strategyId || '').trim().toLowerCase().replace(/-/g, '_');
  if (normId && SHORT_ENGINE_TAGS[normId]) {
    return SHORT_ENGINE_TAGS[normId];
  }

  const raw = strategyLabel?.trim() || strategyId?.trim() || 'SIGNAL';
  const cleaned = raw.replace(/^traxo[\s_-]+/i, '').trim() || raw;
  const words = cleaned.toUpperCase().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return 'SIGNAL';

  const [w1, w2] = words;
  if (w2 && TWO_WORD_TAG_SUFFIXES.has(w2)) {
    return `${w1} ${w2}`;
  }
  return w1;
}

export function formatEntryTypeBadge(entryType?: string | null): 'MKT' | 'LMT' | 'STP' {
  const upper = String(entryType || 'MARKET').trim().toUpperCase();
  if (upper === 'LIMIT' || upper === 'LMT') return 'LMT';
  if (upper === 'STOP' || upper === 'STP') return 'STP';
  return 'MKT';
}

const FULL_TP1_STRATEGIES = new Set([
  'traxo_mean_equilibrium',
  'traxo_sovereign_fix',
  'traxo_aurum_fix',
  'traxo_barrier_grid',
  'traxo_power_hour_moc',
]);

export function resolveSignalExitMode(params: {
  strategyId?: string;
  market?: string;
  symbol?: string;
  tier?: string;
  volume: number;
  tp2?: number | null;
}): 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2' {
  const id = (params.strategyId || '').trim().replace(/-/g, '_').toLowerCase();
  if (FULL_TP1_STRATEGIES.has(id)) return 'FULL_TP1';

  const isFutures =
    (params.market || '').toUpperCase() === 'FUTURES' ||
    (params.symbol || '').toUpperCase().includes('MNQ');
  if ((isFutures && params.volume < 2) || (!isFutures && params.volume < 0.02)) {
    return 'FULL_TP1';
  }

  if ((params.tier || '').toUpperCase() === 'AGGRESSIVE') return 'FULL_TP1';
  if (!params.tp2 || !Number.isFinite(params.tp2) || params.tp2 <= 0) return 'FULL_TP1';

  return 'SCALE_50_TP1_BE_TP2';
}

export function priceDigits(symbol: string): number {
  if (symbol.includes('JPY')) return 3
  if (symbol.includes('XAU') || symbol.includes('MNQ')) return 2
  return 5
}

function getAssetType(symbol: string): any {
  const upper = symbol.toUpperCase();
  if (upper.includes('MNQ')) return 'FUTURES';
  if (upper.includes('XAU')) return 'COMMODITY';
  return 'FOREX';
}

export function calcATR14(candles: Candle[]): number[] {
  const n = candles.length;
  const tr = new Array<number>(n).fill(0);
  const atr = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    tr[i] = i === 0 ? hl : Math.max(
      hl,
      Math.abs(candles[i].high - (candles[i - 1].close as number)),
      Math.abs(candles[i].low - (candles[i - 1].close as number))
    );
  }
  for (let i = 0; i < n; i++) {
    if (i === 13) {
      atr[i] = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    } else if (i > 13) {
      atr[i] = (atr[i - 1] * 13 + tr[i]) / 14;
    } else {
      atr[i] = tr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
    }
  }
  return atr;
}

export function calcVolumeMa(candles: Candle[], upToIdx: number, period = 20): number {
  const start = Math.max(0, upToIdx - period + 1);
  const slice = candles.slice(start, upToIdx + 1).map((c) => c.volume ?? 0);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, vol) => sum + vol, 0) / slice.length;
}

export function riskFromConfidence(confidence: number): RiskLabel {
  if (confidence >= 85) return 'Low';
  if (confidence >= 77) return 'Medium';
  return 'High';
}

export function runSignalsForStrategies(
  candles: Candle[],
  symbol: string,
  timeframe: string,
  activeStrategyIds: string[]
): AnalysisSignal[] {
  if (candles.length === 0) return [];

  const normalizedStrategyIds = activeStrategyIds.map((id) => id.replace(/-/g, '_'));
  const assetType = getAssetType(symbol);
  const lastCandle = candles[candles.length - 1];
  const lastTime = typeof lastCandle.time === 'string' ? Math.floor(new Date(lastCandle.time).getTime() / 1000) : lastCandle.time;

  const strategyContextCandles = candles.map(c => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? 0,
    timestamp: typeof c.time === 'string' ? c.time : new Date(c.time * 1000).toISOString()
  }));

  const atrArr = calcATR14(candles);
  const atr14 = atrArr[atrArr.length - 1];
  const volumeMa20 = calcVolumeMa(candles, candles.length - 1);

  const results: AnalysisSignal[] = [];

  for (const id of normalizedStrategyIds) {
    let rawSignal: any = null;

    try {
      if (id.startsWith('traxo_')) {
        const traxoEngine = getTraxoStrategy(id);
        if (traxoEngine) {
          const traxoSig = traxoEngine.evaluate({
            symbol,
            timeframe,
            candles: strategyContextCandles,
            currentPrice: strategyContextCandles[strategyContextCandles.length - 1]?.close,
          });
          if (traxoSig) {
            const traxoRisk = Math.abs(traxoSig.entryPrice - traxoSig.slPrice);
            const traxoReward = Math.abs(traxoSig.tp1Price - traxoSig.entryPrice);
            const traxoRr = traxoRisk > 0 ? Number((traxoReward / traxoRisk).toFixed(2)) : traxoSig.riskRewardRatio;
            const confluence = evaluateNinePointConfluence(traxoSig, {
              symbol,
              timeframe,
              candles: strategyContextCandles,
              currentPrice: strategyContextCandles[strategyContextCandles.length - 1]?.close,
            });
            results.push({
              id: [
                'sig',
                traxoSig.strategyId,
                symbol,
                timeframe,
                traxoSig.direction,
                lastTime,
                Number(traxoSig.entryPrice || 0).toPrecision(8),
              ].join(':'),
              time: lastTime,
              strategyId: traxoSig.strategyId,
              strategyLabel: traxoSig.strategyName,
              direction: traxoSig.direction,
              entry: traxoSig.entryPrice,
              sl: traxoSig.slPrice,
              tp: traxoSig.tp1Price,
              tp2: traxoSig.tp2Price,
              rr: traxoRr,
              confidence: traxoSig.confidencePct,
              risk: riskFromConfidence(traxoSig.confidencePct),
              reason: traxoSig.reasons || [],
              entryType: traxoSig.entryType,
              rawEntryType: traxoSig.entryType,
              tier: confluence.tier === 'DISCARD' ? traxoSig.tier : confluence.tier || traxoSig.tier,
              market: traxoSig.market,
              confluence: {
                ...confluence,
                passedCriteria: confluence.checks.filter((c) => c.passed).map((c) => c.label),
              },
              status: 'live',
            });
          }
        }
        continue;
      }

      if (id === 'breakout') {
        rawSignal = analyzeBreakout({
          symbol,
          timeframe: timeframe as any,
          assetType,
          candles: strategyContextCandles as any
        });
      } else if (id === 'order_block') {
        rawSignal = analyzeOrderBlock({
          symbol,
          asset_type: assetType,
          timeframe: timeframe as any,
          candles: strategyContextCandles as any,
          atr14,
          volumeMa20
        });
      } else if (id === 'supply_demand') {
        rawSignal = analyzeSupplyDemand({
          symbol,
          timeframe: timeframe as any,
          assetType,
          candles: strategyContextCandles as any
        });
      } else if (id === 'trend_following') {
        rawSignal = analyzeTrendFollowing({
          symbol,
          timeframe: timeframe as any,
          asset_type: assetType,
          candles: strategyContextCandles as any
        });
      } else if (id === 'wick_rejection') {
        rawSignal = analyzeWickRejection({
          symbol,
          assetType,
          timeframe: timeframe as any,
          candle: strategyContextCandles[strategyContextCandles.length - 2] as any,
          confirmationCandle: strategyContextCandles[strategyContextCandles.length - 1] as any,
          atr14,
          volumeMa20,
          htfBias: 'neutral',
          nearestZone: null
        });
      }

      if (rawSignal && rawSignal.signal !== 'NO_TRADE') {
        const entry = rawSignal.entry_price || rawSignal.entry_proximal || 0;
        const sl = rawSignal.sl_price || 0;
        const tp = rawSignal.tp1_price || 0;
        const confidence = rawSignal.confidence_pct || 0;
        
        const riskDist = Math.abs(entry - sl);
        const rewardDist = Math.abs(tp - entry);
        const rr = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 0;

        results.push({
          id: [
            'sig',
            id,
            symbol,
            timeframe,
            rawSignal.signal,
            lastTime,
            Number(entry || 0).toPrecision(8),
          ].join(':'),
          time: lastTime,
          strategyId: id,
          strategyLabel: id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          direction: rawSignal.signal as 'BUY' | 'SELL',
          entry,
          sl,
          tp,
          tp2: rawSignal.tp2_price ?? null,
          rr,
          confidence,
          risk: riskFromConfidence(confidence),
          reason: rawSignal.reason || [],
          entryType: rawSignal.entry_type === 'limit' ? 'LIMIT' : 'MARKET',
          rawEntryType: rawSignal.entry_type === 'limit' ? 'LIMIT' : 'MARKET',
          tier: confidence >= 82 ? 'PRIME' : confidence >= 72 ? 'STANDARD' : 'AGGRESSIVE',
          status: 'live',
        });
      }
    } catch (error) {
      console.error(`Error analyzing ${id}:`, error);
    }
  }

  return results;
}
