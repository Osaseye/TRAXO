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
import { newsServiceClient } from '../../services/news/NewsServiceClient';
import { backupRedis } from '../market-data/redisClient';
import { broadcast } from '../websocket/websocketManager';
import { buildLiveStrategyContext, normalizeCandle, type RawCandleInput } from '../algorithms/contextBuilder';
import {
  applySlPaddingWithRRPreservation,
  getParameters,
  processResolvedLoss,
  processResolvedWin,
} from '../optimizer/strategyOptimizer';
import {
  evaluatePreTradeGuardrailsAsync,
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
import { paperBrokerService } from '../execution/paperBrokerService';
import { isWinningPaperStatus } from '../execution/executionBroker';
import { evaluateSignalDeterministically } from '../execution/tradeResolutionEngine';
import { queryCandles } from '../storage/sqliteDb';
import * as signalStore from './signalStore';
import { updateScanState } from './globalSignalScanner';
import {
  TRAXO_STRATEGY_LABELS,
  evaluateNinePointConfluence,
  getTraxoStrategiesForSymbol,
  type TraxoSignalResult,
  type TraxoStrategyContext,
} from '../../../algorithms/traxo';

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

export const STRATEGY_LABELS: Record<string, string> = {
  breakout: 'Breakout',
  order_block: 'Order Block',
  supply_demand: 'Supply & Demand',
  trend_following: 'Trend Following',
  wick_rejection: 'Wick Rejection',
  ...TRAXO_STRATEGY_LABELS,
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
  const ctx = await newsServiceClient.getUpcomingNewsContext(symbol);
  return {
    minutesAway: ctx.minutesAway,
    newsEvents: ctx.newsEvents,
  };
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
  bypassMinConfidence?: boolean;
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
      if (!extra.bypassMinConfidence && conf < (params.minConfidence || 50)) {
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

  // TRAXO Proprietary Tri-Market Strategy Engines (Forex, Gold, Futures)
  const traxoCtx: TraxoStrategyContext = liveCtx.toTraxoContext();
  const applicableTraxoStrategies = getTraxoStrategiesForSymbol(canonicalSymbol);

  for (const strategy of applicableTraxoStrategies) {
    try {
      const params = getParameters(strategy.id);
      const rawTraxo: TraxoSignalResult | null = strategy.evaluate(traxoCtx);

      if (!rawTraxo) {
        rejects[strategy.id] = ['Setup criteria not met on current bar'];
        continue;
      }

      const confluence = evaluateNinePointConfluence(rawTraxo, traxoCtx);
      const conf = Number(rawTraxo.confidencePct || 0);
      if (!extra.bypassMinConfidence && conf < (params.minConfidence || 50)) {
        rejects[strategy.id] = [
          `Confidence ${conf}% below AI-tuned threshold of ${params.minConfidence}%`,
        ];
        continue;
      }

      const entry = Number(rawTraxo.entryPrice || 0);
      const origSl = Number(rawTraxo.slPrice || 0);
      const origTp = Number(rawTraxo.tp1Price || 0);
      const direction = rawTraxo.direction;

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
      const rr = riskD > 0 ? Number((rewardD / riskD).toFixed(2)) : rawTraxo.riskRewardRatio;
      const entryType: 'market' | 'limit' = rawTraxo.entryType === 'LIMIT' ? 'limit' : 'market';
      const limitPrice = entryType === 'limit' ? entry : null;

      signals.push({
        id: stableSignalId({
          strategyId: rawTraxo.strategyId,
          symbol: canonicalSymbol,
          timeframe: frontTimeframe,
          direction,
          time: lastTime,
        }),
        sourceId: rawTraxo.id,
        time: lastTime,
        strategyId: rawTraxo.strategyId,
        strategyLabel: rawTraxo.strategyName || STRATEGY_LABELS[rawTraxo.strategyId],
        market: rawTraxo.market,
        tier: rawTraxo.tier,
        direction,
        entryType,
        rawEntryType: rawTraxo.entryType,
        entry,
        limitPrice,
        sl: adjusted.slPrice,
        tp: adjusted.tpPrice,
        tp2: rawTraxo.tp2Price,
        rr,
        confidence: conf,
        risk: riskLabel(conf),
        reason: rawTraxo.reasons || [],
        metrics: rawTraxo.metrics,
        confluence,
        symbol: canonicalSymbol,
        timeframe: frontTimeframe,
        status: 'live',
        htfBias: liveCtx.htfBias,
        nearestZone: liveCtx.nearestZone,
      });
    } catch (err: any) {
      rejects[strategy.id] = [`Error executing strategy: ${err?.message || err}`];
      console.error(`[scanner] ${strategy.id} error on ${canonicalSymbol} ${timeframe}: ${err?.message || err}`);
    }
  }

  return { signals, rejects };
}

async function resolveActiveSignalsForCandle(
  frontSymbol: string,
  frontTimeframe: string,
  latestCandle: marketDataService.MarketCandle
): Promise<void> {
  const cfg = await loadGuardrailConfig().catch(() => null);
  const resolvedSignalIds = new Set<string>();

  // 1. Resolve all open/pending Internal Paper Broker trades deterministically across archived bars
  try {
    const { newlyClosedTrades } = await paperBrokerService.resolveSymbolOnCandle(
      frontSymbol,
      frontTimeframe,
      latestCandle
    );

    for (const trade of newlyClosedTrades) {
      if (trade.status === 'EXPIRED' || trade.status === 'CANCELLED') continue;
      const isWin = isWinningPaperStatus(trade.status);
      const outcome: 'WIN' | 'LOSS' = isWin ? 'WIN' : 'LOSS';

      if (trade.signalId) {
        resolvedSignalIds.add(trade.signalId);
        await signalStore.updateSignalStatus(trade.signalId, outcome, trade.exitPrice).catch(() => {});
        broadcast({
          type: 'SIGNAL_UPDATED',
          payload: {
            id: trade.signalId,
            symbol: trade.symbol,
            timeframe: trade.timeframe,
            strategyId: trade.strategyId,
            status: outcome,
            realizedPnlUsd: trade.realizedPnlUsd,
            realizedR: trade.realizedR,
          },
        });
      }

      const optPayload = {
        id: trade.signalId || trade.id,
        strategyId: trade.strategyId,
        symbol: trade.symbol,
        timeframe: trade.timeframe,
        direction: trade.direction,
        entry: trade.fillPrice ?? trade.requestedEntry,
        sl: trade.slPrice,
        tp: trade.tp1Price,
      };

      if (isWin) {
        await processResolvedWin(optPayload).catch(() => {});
        await recordTradeResolutionForRisk('WIN', Math.abs(trade.realizedPnlUsd), cfg || undefined).catch(() => {});
      } else {
        await processResolvedLoss(optPayload).catch(() => {});
        await recordTradeResolutionForRisk(
          'LOSS',
          Math.abs(trade.realizedPnlUsd || cfg?.riskAmountUsd || 50),
          cfg || undefined
        ).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error(`[PaperResolver] Failed resolving ${frontSymbol} ${frontTimeframe}:`, err?.message);
  }

  // 2. Deterministic resolution for un-executed live signals remaining in SQLite/Firestore
  const tfSignals = await signalStore.getActiveLiveSignals(frontSymbol, frontTimeframe);
  const allSymbolSignals =
    frontTimeframe === '1m' ? await signalStore.getActiveLiveSignals(frontSymbol) : [];
  const activeById = new Map<string, any>();
  for (const s of [...tfSignals, ...allSymbolSignals]) {
    if (s && s.id && !resolvedSignalIds.has(String(s.id))) {
      activeById.set(String(s.id), s);
    }
  }
  const activeSignals = Array.from(activeById.values());
  if (!activeSignals.length) return;

  const latestTimeSec =
    latestCandle.time > 1e12 ? Math.floor(latestCandle.time / 1000) : Number(latestCandle.time || 0);
  const archivedTail = queryCandles({
    symbol: frontSymbol,
    timeframe: frontTimeframe,
    toTime: latestTimeSec,
    limit: frontTimeframe === '1m' ? 240 : 60,
  });
  const evalBars = archivedTail.some((b) => b.time === latestTimeSec)
    ? archivedTail
    : [...archivedTail, { ...latestCandle, time: latestTimeSec }].sort((a, b) => a.time - b.time);

  for (const sig of activeSignals) {
    const sigTimeSec = sig.time > 1e12 ? Math.floor(sig.time / 1000) : Number(sig.time || 0);
    if (sigTimeSec > 0 && latestTimeSec > 0 && latestTimeSec <= sigTimeSec) {
      continue;
    }

    const res = evaluateSignalDeterministically({
      signal: {
        ...sig,
        time: sigTimeSec,
        timeframe: frontTimeframe,
      },
      candles: evalBars,
    });

    if (res.outcome) {
      console.log(
        `[Evaluation] Signal ${sig.id} resolved as ${res.outcome} (${res.resolutionMethod || 'candle_ohlc'})`
      );
      await signalStore.updateSignalStatus(sig.id, res.outcome);
      broadcast({
        type: 'SIGNAL_UPDATED',
        payload: { ...sig, status: res.outcome, resolutionMethod: res.resolutionMethod },
      });

      if (res.outcome === 'WIN') {
        await processResolvedWin(sig).catch(() => {});
      } else {
        await processResolvedLoss(sig).catch(() => {});
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

        const rawSignalMode = guardrailCfg?.guardrailsEnabled === false;
        const rollingDrawdownPct =
          !rawSignalMode && guardrailCfg && guardrailCfg.accountBalance > 0
            ? Number(((riskState.dailyLossUsd / guardrailCfg.accountBalance) * 100).toFixed(2))
            : 0;

        // 3. Run all 5 strategies with full structural context
        const { signals: found, rejects } = runAllStrategies(
          candles,
          frontSymbol,
          timeframe,
          rawSignalMode ? null : newsCtx.minutesAway,
          {
            htfCandles: htfCandles || undefined,
            newsEvents: rawSignalMode ? [] : newsCtx.newsEvents,
            rollingDrawdownPct,
            consecutiveLosses: rawSignalMode ? 0 : riskState.consecutiveLosses,
            accountBalance: guardrailCfg?.accountBalance,
            bypassMinConfidence: rawSignalMode,
          }
        );

        // Preserve any recent guardrail events in scan_rejects while updating strategy rejects (offloaded to backupRedis)
        try {
          const rejectKey = `scan_rejects:${frontSymbol}:${frontTimeframe}`;
          const existingRaw = await backupRedis.get(rejectKey).catch(() => null);
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
          await backupRedis.set(rejectKey, JSON.stringify(payload), 'EX', 7200);
        } catch (err) {
          console.error(`Failed to save scan rejects for ${frontSymbol} to backup Redis:`, err);
        }

        // 4. Deduplicate, store, broadcast, and evaluate atomic pre-trade guardrails
        for (const signal of found) {
          const existingLive = await signalStore.getLiveSignal(
            signal.symbol,
            signal.timeframe,
            signal.strategyId
          );
          const existingHistorical = await signalStore.hasHistoricalSignal(signal.id);
          const isNewSignal =
            !(existingLive && existingLive.id === signal.id) && !existingHistorical;

          if (isNewSignal) {
            console.log(
              `New signal found! ${signal.direction} ${signal.symbol} ${signal.timeframe} (${signal.strategyLabel} | ${signal.confidence}%)`
            );
            await signalStore.cacheLiveSignal(signal);
            await signalStore.saveHistoricalSignal(signal);
            broadcast({ type: 'NEW_SIGNAL', payload: signal });
          } else {
            if (!existingLive || existingLive.id !== signal.id) {
              await signalStore.cacheLiveSignal(signal);
            }
            if (!rawSignalMode) {
              continue;
            }
          }

          if (getAutoTradeEnabled() && (isNewSignal || rawSignalMode)) {
            if (paperBrokerService.hasTradeForSignal(signal.id, 'default_trader')) {
              continue;
            }
            try {
              const cfg = guardrailCfg || (await loadGuardrailConfig());
              const currentRisk = await getRiskRuntimeState();
              const [openPositions, quote] = await Promise.all([
                getOpenPositions('default_trader'),
                getSymbolQuote(signal.symbol),
              ]);

              const evaluation = await evaluatePreTradeGuardrailsAsync({
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

              const riskUsd = cfg.riskAmountUsd || 50;
              const dynamicLots = calculateLots(signal.symbol, signal.entry, signal.sl, riskUsd);
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
                `[AutoTrader] Executing ${signal.direction} (${entryType.toUpperCase()}) on ${signal.symbol} (${dynamicLots} Lots, $${riskUsd} Risk, ${signal.confidence}% Conf)...`
              );

              const execRes = await executeTrade({
                uid: 'default_trader',
                signalId: signal.id,
                symbol: signal.symbol,
                timeframe: signal.timeframe,
                market: signal.market,
                strategyId: signal.strategyId,
                strategyLabel: signal.strategyLabel,
                tier: signal.tier,
                action: signal.direction,
                volume: dynamicLots,
                sl: signal.sl,
                tp: signal.tp,
                tp2: signal.tp2,
                riskAmountUsd: riskUsd,
                rr: signal.rr,
                confidence: signal.confidence,
                entryType,
                rawEntryType: signal.rawEntryType,
                price: execPrice,
                referencePrice: latestCandle.close,
                signalTime: latestCandle.time,
                reasons: signal.reason,
                confluence: signal.confluence,
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
