import { analyzeBreakout } from '../../server/algorithms/breakoutStrategy';
import { analyzeOrderBlock } from '../../server/algorithms/orderBlockStrategy';
import { analyzeSupplyDemand } from '../../server/algorithms/supplyDemandStrategy';
import { analyzeTrendFollowing } from '../../server/algorithms/trendFollowingStrategy';
import { analyzeWickRejection } from '../../server/algorithms/wickRejection';

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
}

const CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT'];
const STOCK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI'];

function getAssetType(symbol: string): any {
  if (CRYPTO_SYMBOLS.includes(symbol)) return 'CRYPTO';
  if (STOCK_SYMBOLS.includes(symbol)) return 'STOCKS';
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

  for (const id of activeStrategyIds) {
    let rawSignal: any = null;

    try {
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
          htfBias: 'neutral'
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
          id: rawSignal.id,
          time: lastTime,
          strategyId: id,
          strategyLabel: id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          direction: rawSignal.signal as 'BUY' | 'SELL',
          entry,
          sl,
          tp,
          rr,
          confidence,
          risk: riskFromConfidence(confidence),
          reason: rawSignal.reason || []
        });
      }
    } catch (error) {
      console.error(`Error analyzing ${id}:`, error);
    }
  }

  return results;
}