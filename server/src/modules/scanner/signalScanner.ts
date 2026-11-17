import { analyzeBreakout } from '../../../algorithms/breakoutStrategy';
import { analyzeOrderBlock } from '../../../algorithms/orderBlockStrategy';
import { analyzeSupplyDemand } from '../../../algorithms/supplyDemandStrategy';
import { analyzeTrendFollowing } from '../../../algorithms/trendFollowingStrategy';
import { analyzeWickRejection } from '../../../algorithms/wickRejection';
import { getWickRejectionAnchorTimeframe } from '../../../algorithms/wickRejectionContext';
import type { NewsEvent } from '../../../algorithms/orderBlock/types';
import { getInstrumentDigits, getScannableInstruments, normalizeSymbol } from '../../config/instruments';
import * as marketDataService from '../market-data/marketDataService';
import * as candleCache from '../market-data/candleCache';
import { getAvailableCount } from '../market-data/keyRotator';
import { getCachedNews } from '../market-data/newsCache';
import redis from '../market-data/redisClient';
import { broadcast } from '../websocket/websocketManager';
import { buildLiveStrategyContext, normalizeCandle, type RawCandleInput } from '../algorithms/contextBuilder';
import {
  applySlPaddingWithRRPreservation,
  getParameters,
  processResolvedLoss,
  processResolvedWin,
} from '../optimizer/strategyOptimizer';
import {
  evaluatePreTradeGuardrails,
  getRiskRuntimeState,
  loadGuardrailConfig,
  recordGuardrailRejection,
  recordTradeResolutionForRisk,
} from '../risk/guardrails';
import { calculateLots } from '../risk/positionSizing';
import {
  executeTrade,
  getAutoTradeEnabled,
  getOpenPositions,
  getSymbolQuote,
} from '../execution/metaApiService';
import * as signalStore from './signalStore';
import { updateScanState } from './globalSignalScanner';

const TIMEFRAME_MAP: Record<string, string> = {
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '1h': '1H',
  '4h': '4H',
  '1day': '1D',
  '1d': '1D',
};

const FRONTEND_TO_TD_INTERVAL: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1H': '1h',
  '4H': '4h',
  '1D': '1day',
};

export function toFrontendTimeframe(tf: string): string {
  return TIMEFRAME_MAP[tf.toLowerCase()] || tf;
}

function toTwelveDataInterval(tf: string): string {
  return FRONTEND_TO_TD_INTERVAL[tf] || tf.toLowerCase();
}

function riskLabel(confidence: number): 'Low' | 'Medium' | 'High' {
  if (confidence >= 85) return 'Low';
  if (confidence >= 77) return 'Medium';
  return 'High';
}

function stableSignalId(signal: {
  strategyId: string;
  symbol: string;
  timeframe: string;
  direction: string;
  time: number;
}): string {
  return ['sig', signal.strategyId, signal.symbol, signal.timeframe, signal.direction, signal.time].join(':');
}

const STRATEGY_LABELS: Record<string, string> = {
  breakout: 'Breakout',
  order_block: 'Order Block',
  supply_demand: 'Supply & Demand',
  trend_following: 'Trend Following',
  wick_rejection: 'Wick Rejection',
};

const API_CALL_DELAY_MS = 2_500;
const TIMEFRAMES = ['1min', '5min', '15min', '1h', '4h', '1day'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForKey(maxWaitMs = 70_000): Promise<void> {
  const started = Date.now();
  while (getAvailableCount() === 0) {
    if (Date.now() - started > maxWaitMs) {
      throw new Error('Timed out waiting for an available TwelveData API key.');
    }
    await sleep(500);
  }
}

export async function getUpcomingNewsContext(
  symbol: string
): Promise<{ minutesAway: number | null; newsEvents: NewsEvent[] }> {
  const canonical = normalizeSymbol(symbol);
  const ctx = buildLiveStrategyContext({
    symbol: canonical,
    timeframe: '15m',
    candles: [
      { open: 1, high: 1, low: 1, close: 1, volume: 0, timestamp: new Date().toISOString() },
    ],
  });
  const assetType = ctx.assetType;
  let category = 'general';
  if (assetType === 'FOREX') category = 'forex';
  if (assetType === 'CRYPTO') category = 'crypto';

  const newsItems = await getCachedNews(`news:${category}`);
  if (!newsItems || !newsItems.length) {
    return { minutesAway: null, newsEvents: [] };
  }

  const now = Math.floor(Date.now() / 1000);
  let minMinutes: number | null = null;
  const newsEvents: NewsEvent[] = [];

  const tokens =
    assetType === 'FOREX' || assetType === 'CRYPTO'
      ? [canonical.slice(0, 3), canonical.slice(3, 6)].filter(Boolean)
      : [canonical];

  for (const item of newsItems) {
    const text = `${item.headline || ''} ${item.summary || ''}`.toUpperCase();
    const isRelevant = tokens.some((t) => text.includes(t));
    if (!isRelevant) continue;

    const minutesAway = Math.floor(((item.datetime || 0) - now) / 60);
    if (minutesAway >= 0 && (minMinutes === null || minutesAway < minMinutes)) {
      minMinutes = minutesAway;
    }

    if (minutesAway >= -60 && minutesAway <= 180) {
      const upperHeadline = String(item.headline || '').toUpperCase();
      const severity: NewsEvent['severity'] = /\b(NFP|FOMC|CPI|FED|RATE DECISION|NON-FARM|INFLATION)\b/.test(
        upperHeadline
      )
        ? 'CRITICAL'
        : /\b(GDP|PMI|RETAIL SALES|UNEMPLOYMENT|CENTRAL BANK|ECB|BOE|BOJ)\b/.test(upperHeadline)
          ? 'HIGH'
          : 'MEDIUM';

      newsEvents.push({
        name: String(item.headline || 'Market Event').slice(0, 80),
        severity,
        timestamp_utc: new Date((item.datetime || now) * 1000).toISOString(),
        minutes_away: minutesAway,
      });
    }
  }

  return { minutesAway: minMinutes, newsEvents };
}

export interface RunStrategiesOptions {
  candles: RawCandleInput[];
  symbol: string;
  timeframe: string;
  htfCandles?: RawCandleInput[];
  newsMinutesAway?: number | null;
  newsEvents?: NewsEvent[];
  rollingDrawdownPct?: number;
  consecutiveLosses?: number;
  accountBalance?: number;
}

export function runAllStrategies(
  candlesInput: RawCandleInput[],
  symbol: string,
  timeframe: string,
  newsMinutesAway: number | null = null,
  extra: Omit<RunStrategiesOptions, 'candles' | 'symbol' | 'timeframe' | 'newsMinutesAway'> = {}
): { signals: any[]; rejects: Record<string, string[]> } {
  if (!candlesInput || candlesInput.length < 30) {
    return { signals: [], rejects: { system: ['Insufficient candles (< 30)'] } };
  }

  const normalizedCandles = candlesInput.map(normalizeCandle);
  const canonicalSymbol = normalizeSymbol(symbol);
  const frontTimeframe = toFrontendTimeframe(timeframe);
  const lastCandle = normalizedCandles[normalizedCandles.length - 1];
  const lastTime = lastCandle.time;
  const digits = getInstrumentDigits(canonicalSymbol);

  const liveCtx = buildLiveStrategyContext({
    symbol: canonicalSymbol,
    timeframe: frontTimeframe,
    candles: normalizedCandles,
    htfCandles: extra.htfCandles,
    newsMinutesAway,
    newsEvents: extra.newsEvents,
    rollingDrawdownPct: extra.rollingDrawdownPct,
    consecutiveLosses: extra.consecutiveLosses,
    accountBalance: extra.accountBalance,
  });

  const runners: Array<{ id: string; run: () => any }> = [
    { id: 'breakout', run: () => analyzeBreakout(liveCtx.toBreakoutContext()) },
    { id: 'order_block', run: () => analyzeOrderBlock(liveCtx.toOrderBlockContext()) },
    { id: 'supply_demand', run: () => analyzeSupplyDemand(liveCtx.toSupplyDemandContext()) },
    { id: 'trend_following', run: () => analyzeTrendFollowing(liveCtx.toTrendFollowingContext()) },
    { id: 'wick_rejection', run: () => analyzeWickRejection(liveCtx.toWickRejectionContext()) },
  ];

  const signals: any[] = [];
  const rejects: Record<string, string[]> = {};

  for (const runner of runners) {
    const strategyId = runner.id;
    try {
      const params = getParameters(strategyId);
      const raw = runner.run();

      if (!raw || raw.signal === 'NO_TRADE') {
        rejects[strategyId] = raw?.reason || ['No specific reason provided by strategy'];
        continue;
      }

      const conf = Number(raw.confidence_pct || 0);
      if (conf < (params.minConfidence || 50)) {
        rejects[strategyId] = [
          `Confidence ${conf}% below AI-tuned threshold of ${params.minConfidence}%`,
        ];
        continue;
      }

      const entry = Number(raw.entry_price || raw.entry_proximal || 0);
      const origSl = Number(raw.sl_price || 0);
      const origTp = Number(raw.tp1_price || 0);
      const direction = raw.signal as 'BUY' | 'SELL';

      // CRITICAL R:R PRESERVATION: scale TP cleanly when atrSlPadding changes SL distance
      const adjusted = applySlPaddingWithRRPreservation({
        direction,
        entryPrice: entry,
        slPrice: origSl,
        tpPrice: origTp,
        atrSlPadding: params.atrSlPadding,
        digits,
      });

      const riskD = Math.abs(entry - adjusted.slPrice);
      const rewardD = Math.abs(adjusted.tpPrice - entry);
      const rr = riskD > 0 ? Number((rewardD / riskD).toFixed(2)) : 0;

      const entryType: 'market' | 'limit' = raw.entry_type === 'limit' ? 'limit' : 'market';
      const limitPrice =
        entryType === 'limit'
          ? Number(raw.limit_entry_price || raw.entry_price || raw.entry_proximal || entry)
          : null;

      signals.push({
        id: stableSignalId({
          strategyId,
          symbol: canonicalSymbol,
          timeframe: frontTimeframe,
          direction,
          time: lastTime,
        }),
        sourceId: raw.id,
        time: lastTime,
        strategyId,
        strategyLabel: STRATEGY_LABELS[strategyId],
        direction,
        entryType,
        entry,
        limitPrice,
        sl: adjusted.slPrice,
        tp: adjusted.tpPrice,
        rr,
        confidence: conf,
        risk: riskLabel(conf),
        reason: raw.reason || [],
        symbol: canonicalSymbol,
        timeframe: frontTimeframe,
        status: 'live',
        htfBias: liveCtx.htfBias,
        nearestZone: liveCtx.nearestZone,
      });
    } catch (err: any) {
      rejects[strategyId] = [`Error executing strategy: ${err.message || err}`];
      console.error(`[scanner] ${strategyId} error on ${canonicalSymbol} ${timeframe}: ${err.message || err}`);
    }
  }

  return { signals, rejects };
}

async function resolveActiveSignalsForCandle(
  frontSymbol: string,
  frontTimeframe: string,
  latestCandle: marketDataService.MarketCandle
): Promise<void> {
  const activeSignals = await signalStore.getActiveLiveSignals(frontSymbol, frontTimeframe);
  if (!activeSignals.length) return;

  const cfg = await loadGuardrailConfig().catch(() => null);

  for (const sig of activeSignals) {
    if (sig.time && latestCandle.time && latestCandle.time <= sig.time) {
      continue;
    }

    let outcome: 'WIN' | 'LOSS' | null = null;
    if (sig.direction === 'BUY') {
      if (latestCandle.low <= sig.sl) outcome = 'LOSS';
      else if (latestCandle.high >= sig.tp) outcome = 'WIN';
    } else if (sig.direction === 'SELL') {
      if (latestCandle.high >= sig.sl) outcome = 'LOSS';
      else if (latestCandle.low <= sig.tp) outcome = 'WIN';
    }

    if (outcome) {
      console.log(`[Evaluation] Signal ${sig.id} resolved as ${outcome}`);
      await signalStore.updateSignalStatus(sig.id, outcome);
      broadcast({
        type: 'SIGNAL_UPDATED',
        payload: { ...sig, status: outcome },
      });

      if (outcome === 'WIN') {
        await processResolvedWin(sig).catch(() => {});
        await recordTradeResolutionForRisk('WIN', 0, cfg || undefined).catch(() => {});
      } else {
        await processResolvedLoss(sig).catch(() => {});
        await recordTradeResolutionForRisk('LOSS', cfg?.riskAmountUsd ?? 500, cfg || undefined).catch(() => {});
      }
    }
  }
}

export async function runScan(): Promise<void> {
  console.log('Starting signal scan...');
  const instruments = getScannableInstruments();
  const totalPairs = instruments.length * TIMEFRAMES.length;
  let donePairs = 0;

  updateScanState({
    running: true,
    total: totalPairs,
    done: 0,
    current: '',
    lastError: null,
  });

  for (const instrument of instruments) {
    const tdSymbol = instrument.twelveDataSymbol;
    const frontSymbol = instrument.symbol;

    for (const timeframe of TIMEFRAMES) {
      const frontTimeframe = toFrontendTimeframe(timeframe);
      donePairs += 1;
      updateScanState({ current: `${frontSymbol}:${frontTimeframe}`, done: donePairs });

      try {
        let candles = await candleCache.getCachedCandles(tdSymbol, timeframe, 200);
        if (!candles) {
          console.log(`Cache miss for ${tdSymbol}:${timeframe}. Fetching from API...`);
          await waitForKey();
          await sleep(API_CALL_DELAY_MS);
          candles = await marketDataService.fetchCandles(tdSymbol, timeframe, 200);
          if (candles && candles.length > 0) {
            await candleCache.cacheCandles(tdSymbol, timeframe, candles, 200);
          }
        }

        if (!candles || candles.length === 0) continue;

        const latestCandle = candles[candles.length - 1];
        broadcast({
          type: 'NEW_CANDLE',
          payload: {
            ...latestCandle,
            symbol: frontSymbol,
            timeframe: frontTimeframe,
          },
        });

        // 1. Resolution Loop (triggers WIN & LOSS optimizer feedback + D.1/D.2 risk updates)
        await resolveActiveSignalsForCandle(frontSymbol, frontTimeframe, latestCandle);

        // 2. Gather cached HTF candles + news + risk state for full live context
        const anchorTf = getWickRejectionAnchorTimeframe(frontTimeframe);
        const anchorTdTf = toTwelveDataInterval(anchorTf);
        const [htfCandles, newsCtx, guardrailCfg, riskState] = await Promise.all([
          candleCache.getCachedCandles(tdSymbol, anchorTdTf, 200).catch(() => null),
          getUpcomingNewsContext(frontSymbol).catch(() => ({ minutesAway: null, newsEvents: [] })),
          loadGuardrailConfig().catch(() => null),
          getRiskRuntimeState().catch(() => ({
            dailyLossUsd: 0,
            consecutiveLosses: 0,
            cooldownUntil: null,
            dateKey: '',
          })),
        ]);

        const rollingDrawdownPct =
          guardrailCfg && guardrailCfg.accountBalance > 0
            ? Number(((riskState.dailyLossUsd / guardrailCfg.accountBalance) * 100).toFixed(2))
            : 0;

        // 3. Run all 5 strategies with full structural context
        const { signals: found, rejects } = runAllStrategies(
          candles,
          frontSymbol,
          timeframe,
          newsCtx.minutesAway,
          {
            htfCandles: htfCandles || undefined,
            newsEvents: newsCtx.newsEvents,
            rollingDrawdownPct,
            consecutiveLosses: riskState.consecutiveLosses,
            accountBalance: guardrailCfg?.accountBalance,
          }
        );

        // Preserve any recent guardrail events in scan_rejects while updating strategy rejects
        try {
          const rejectKey = `scan_rejects:${frontSymbol}:${frontTimeframe}`;
          const existingRaw = await redis.get(rejectKey).catch(() => null);
          let prevGuardrailEvents: any[] = [];
          if (existingRaw) {
            try {
              const parsed = JSON.parse(existingRaw);
              if (Array.isArray(parsed._guardrailEvents)) {
                prevGuardrailEvents = parsed._guardrailEvents;
              }
            } catch {}
          }
          const payload =
            prevGuardrailEvents.length > 0
              ? { ...rejects, _guardrailEvents: prevGuardrailEvents }
              : rejects;
          await redis.set(rejectKey, JSON.stringify(payload), 'EX', 7200);
        } catch (err) {
          console.error(`Failed to save scan rejects for ${frontSymbol} to Redis:`, err);
        }

        // 4. Deduplicate, store, broadcast, and evaluate atomic pre-trade guardrails
        for (const signal of found) {
          const existingLive = await signalStore.getLiveSignal(
            signal.symbol,
            signal.timeframe,
            signal.strategyId
          );
          if (existingLive && existingLive.id === signal.id) continue;

          const existingHistorical = await signalStore.hasHistoricalSignal(signal.id);
          if (existingHistorical) {
            await signalStore.cacheLiveSignal(signal);
            continue;
          }

          console.log(
            `New signal found! ${signal.direction} ${signal.symbol} ${signal.timeframe} (${signal.strategyLabel} | ${signal.confidence}%)`
          );
          await signalStore.cacheLiveSignal(signal);
          await signalStore.saveHistoricalSignal(signal);
          broadcast({ type: 'NEW_SIGNAL', payload: signal });

          if (getAutoTradeEnabled()) {
            try {
              const cfg = guardrailCfg || (await loadGuardrailConfig());
              const currentRisk = await getRiskRuntimeState();
              const [openPositions, quote] = await Promise.all([
                getOpenPositions(),
                getSymbolQuote(signal.symbol),
              ]);

              const evaluation = evaluatePreTradeGuardrails({
                signal,
                config: cfg,
                openPositions,
                quote: quote.ok ? { bid: quote.bid, ask: quote.ask } : null,
                dailyLossUsd: currentRisk.dailyLossUsd,
                accountBalance: cfg.accountBalance,
                consecutiveLosses: currentRisk.consecutiveLosses,
                cooldownActiveUntil: currentRisk.cooldownUntil,
                newsMinutesAway: newsCtx.minutesAway,
              });

              if (!evaluation.allowed) {
                console.log(
                  `[AutoTrader] Guardrails blocked ${signal.symbol} ${signal.direction} (${signal.strategyId}): ${evaluation.reasons.join(' | ')}`
                );
                await recordGuardrailRejection(signal, evaluation);
                continue;
              }

              const dynamicLots = calculateLots(signal.symbol, signal.entry, signal.sl, cfg.riskAmountUsd);
              let entryType: 'market' | 'limit' = signal.entryType === 'limit' ? 'limit' : 'market';
              let execPrice: number | undefined = signal.limitPrice ?? signal.entry;

              // Only send LIMIT if price sits on the favorable side of live market quote
              if (entryType === 'limit' && quote.ok && quote.bid && quote.ask && execPrice) {
                const limitStillValid =
                  signal.direction === 'BUY' ? execPrice < quote.ask : execPrice > quote.bid;
                if (!limitStillValid) {
                  entryType = 'market';
                  execPrice = undefined;
                }
              }

              console.log(
                `[AutoTrader] Executing ${signal.direction} (${entryType.toUpperCase()}) on ${signal.symbol} (${dynamicLots} Lots, $${cfg.riskAmountUsd} Risk, ${signal.confidence}% Conf)...`
              );

              const execRes = await executeTrade({
                symbol: signal.symbol,
                action: signal.direction,
                volume: dynamicLots,
                sl: signal.sl,
                tp: signal.tp,
                entryType,
                price: execPrice,
                comment: `TRAXO ${signal.strategyId || 'Auto'}`.slice(0, 26),
              });

              if (execRes.success) {
                console.log(
                  `[AutoTrader] Trade executed on Exness MT5: ${signal.symbol} ${signal.direction} ${dynamicLots}L (${entryType})`
                );
              } else {
                console.error(`[AutoTrader] Trade execution failed: ${execRes.error}`);
              }
            } catch (execErr: any) {
              console.error(`[AutoTrader] Execution exception: ${execErr.message}`);
            }
          }
        }
      } catch (error: any) {
        console.error(`Error scanning ${frontSymbol} on ${timeframe}:`, error.message || error);
      }
    }
  }

  console.log('Signal scan finished.');
}
