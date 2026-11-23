import {
  getInstrumentSpec,
  normalizeSymbol,
} from '../../config/instruments';
import type { MarketCandle } from '../market-data/marketDataService';
import {
  evaluatePreTradeGuardrailsAsync,
  getRiskRuntimeState,
  loadGuardrailConfig,
  recordTradeResolutionForRisk,
} from '../risk/guardrails';
import { calculateLots } from '../risk/positionSizing';
import { processResolvedLoss, processResolvedWin } from '../optimizer/strategyOptimizer';
import { isWinningPaperStatus } from '../execution/executionBroker';
import { paperBrokerService } from '../execution/paperBrokerService';
import { runAllStrategies } from '../scanner/signalScanner';
import {
  normalizeCanonicalTimeframe,
  queryCandles,
  timeframeToSeconds,
  upsertCandles,
} from '../storage/sqliteDb';
import { broadcast } from '../websocket/websocketManager';

export type ReplayState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

export interface StartReplayOptions {
  symbols?: string[];
  timeframe?: string;
  startTime?: number;
  endTime?: number;
  speedMs?: number;
  seedIfEmpty?: boolean;
}

export interface ReplayStatus {
  state: ReplayState;
  symbols: string[];
  timeframe: string;
  cursorIndex: number;
  totalBars: number;
  currentCandleTime: number | null;
  currentCandleIso: string | null;
  speedMs: number;
  signalsGenerated: number;
  tradesExecuted: number;
  tradesResolved: number;
  seededSynthetic: boolean;
}

function generateSyntheticReplaySeries(symbol: string, timeframe: string): MarketCandle[] {
  const canonical = normalizeSymbol(symbol);
  const tf = normalizeCanonicalTimeframe(timeframe);
  const tfSec = timeframeToSeconds(tf);
  const spec = getInstrumentSpec(canonical);

  let basePrice = 1.085;
  let step = 0.0007;
  if (canonical === 'XAUUSD') {
    basePrice = 2648;
    step = 2.4;
  } else if (canonical === 'MNQ' || canonical === 'USTEC') {
    basePrice = 20990;
    step = 14;
  } else if (canonical === 'USDJPY') {
    basePrice = 152.2;
    step = 0.09;
  }

  // Anchor at 2026-11-18T00:00:00Z so UTC Asian / London / NY sessions line up cleanly
  const anchorSec = Math.floor(Date.parse('2026-11-18T00:00:00Z') / 1000);
  const bars: MarketCandle[] = [];
  let price = basePrice;

  for (let i = 0; i < 120; i++) {
    const time = anchorSec + i * tfSec;
    const d = new Date(time * 1000);
    const utcHour = d.getUTCHours();

    // Multi-wave cycle: Asian tight balance -> London Open liquidity sweep -> NY displacement
    let delta = 0;
    let vol = 950;
    if (utcHour < 6) {
      delta = (i % 2 === 0 ? 1 : -1) * step * 0.45;
      vol = 850;
    } else if (utcHour === 6) {
      delta = step * 0.3;
      vol = 1100;
    } else if (utcHour === 7 && i % 4 === 0) {
      // Sweep high & snap down to trigger institutional sweep/apex displacement
      const open = price;
      const high = Number((open + step * 3.1).toFixed(spec.digits));
      const low = Number((open - step * 1.4).toFixed(spec.digits));
      const close = Number((open - step * 0.9).toFixed(spec.digits));
      bars.push({
        time,
        timestamp: d.toISOString(),
        open,
        high,
        low,
        close,
        volume: 2250,
      });
      price = close;
      continue;
    } else if (utcHour >= 7 && utcHour < 13) {
      delta = ((i % 5) - 2.2) * step * 0.85;
      vol = 1500;
    } else if (utcHour >= 13 && utcHour < 18) {
      delta = (i % 7 < 4 ? 1 : -1) * step * 1.25;
      vol = 2400;
    } else {
      delta = (i % 2 === 0 ? -1 : 1) * step * 0.35;
      vol = 800;
    }

    const open = Number(price.toFixed(spec.digits));
    const close = Number((open + delta).toFixed(spec.digits));
    const high = Number((Math.max(open, close) + step * 0.65).toFixed(spec.digits));
    const low = Number((Math.min(open, close) - step * 0.65).toFixed(spec.digits));
    bars.push({
      time,
      timestamp: d.toISOString(),
      open,
      high,
      low,
      close,
      volume: vol,
    });
    price = close;
  }

  return bars;
}

export class OfflineReplayController {
  private state: ReplayState = 'IDLE';
  private symbols: string[] = ['EURUSD', 'XAUUSD', 'MNQ'];
  private timeframe = '15m';
  private seriesBySymbol = new Map<string, MarketCandle[]>();
  private emittedSignals = new Set<string>();
  private cursorIndex = 0;
  private totalBars = 0;
  private speedMs = 800;
  private signalsGenerated = 0;
  private tradesExecuted = 0;
  private tradesResolved = 0;
  private seededSynthetic = false;
  private timer: NodeJS.Timeout | null = null;
  private stepping = false;

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): ReplayStatus {
    let currentCandleTime: number | null = null;
    for (const sym of this.symbols) {
      const series = this.seriesBySymbol.get(sym);
      if (series && series.length > 0 && this.cursorIndex > 0) {
        const idx = Math.min(this.cursorIndex - 1, series.length - 1);
        currentCandleTime = series[idx].time;
        break;
      }
    }

    return {
      state: this.state,
      symbols: [...this.symbols],
      timeframe: this.timeframe,
      cursorIndex: this.cursorIndex,
      totalBars: this.totalBars,
      currentCandleTime,
      currentCandleIso: currentCandleTime ? new Date(currentCandleTime * 1000).toISOString() : null,
      speedMs: this.speedMs,
      signalsGenerated: this.signalsGenerated,
      tradesExecuted: this.tradesExecuted,
      tradesResolved: this.tradesResolved,
      seededSynthetic: this.seededSynthetic,
    };
  }

  private prepareSeries(options: StartReplayOptions): void {
    const requestedSymbols =
      Array.isArray(options.symbols) && options.symbols.length > 0
        ? options.symbols.map((s) => normalizeSymbol(s))
        : ['EURUSD', 'XAUUSD', 'MNQ'];
    this.symbols = Array.from(new Set(requestedSymbols));
    this.timeframe = normalizeCanonicalTimeframe(options.timeframe || '15m');
    this.speedMs = Math.max(50, Math.min(10_000, Number(options.speedMs) || 800));

    this.seriesBySymbol.clear();
    this.emittedSignals.clear();
    this.signalsGenerated = 0;
    this.tradesExecuted = 0;
    this.tradesResolved = 0;
    this.seededSynthetic = false;

    let minLen = Number.POSITIVE_INFINITY;
    for (const sym of this.symbols) {
      let candles = queryCandles({
        symbol: sym,
        timeframe: this.timeframe,
        fromTime: options.startTime,
        toTime: options.endTime,
        limit: 1000,
      });

      if (candles.length < 45 && options.seedIfEmpty !== false) {
        const synthetic = generateSyntheticReplaySeries(sym, this.timeframe);
        upsertCandles(sym, this.timeframe, synthetic);
        candles = queryCandles({
          symbol: sym,
          timeframe: this.timeframe,
          fromTime: options.startTime,
          toTime: options.endTime,
          limit: 1000,
        });
        this.seededSynthetic = true;
      }

      if (candles.length > 0) {
        this.seriesBySymbol.set(sym, candles);
        minLen = Math.min(minLen, candles.length);
      }
    }

    if (!Number.isFinite(minLen) || minLen <= 0) {
      this.totalBars = 0;
      this.cursorIndex = 0;
      return;
    }

    this.totalBars = minLen;
    // Start after initial indicator warm-up window (35 bars or less if short test set)
    this.cursorIndex = Math.min(35, Math.max(1, minLen - 1));
  }

  startReplay(options: StartReplayOptions = {}): ReplayStatus {
    this.clearTimer();
    this.prepareSeries(options);

    if (this.totalBars === 0) {
      this.state = 'COMPLETED';
      return this.getStatus();
    }

    this.state = 'RUNNING';
    this.timer = setInterval(() => {
      void this.tickLoop();
    }, this.speedMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.getStatus();
  }

  private async tickLoop(): Promise<void> {
    if (this.state !== 'RUNNING' || this.stepping) return;
    await this.stepReplay(1);
  }

  pauseReplay(): ReplayStatus {
    this.clearTimer();
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
    }
    return this.getStatus();
  }

  resumeReplay(): ReplayStatus {
    if (this.state !== 'PAUSED') {
      return this.getStatus();
    }
    this.clearTimer();
    this.state = 'RUNNING';
    this.timer = setInterval(() => {
      void this.tickLoop();
    }, this.speedMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.getStatus();
  }

  stopReplay(): ReplayStatus {
    this.clearTimer();
    this.state = 'IDLE';
    return this.getStatus();
  }

  async stepReplay(bars = 1, initOptions?: StartReplayOptions): Promise<ReplayStatus> {
    if (this.stepping) return this.getStatus();
    this.stepping = true;

    try {
      if (this.totalBars === 0 || this.seriesBySymbol.size === 0 || this.state === 'IDLE') {
        this.prepareSeries(initOptions || {});
        if (this.totalBars > 0 && this.state === 'IDLE') {
          this.state = 'PAUSED';
        }
      }

      const steps = Math.max(1, Math.min(50, Math.floor(bars)));
      for (let s = 0; s < steps; s++) {
        if (this.cursorIndex >= this.totalBars) {
          this.clearTimer();
          this.state = 'COMPLETED';
          break;
        }

        const cfg = await loadGuardrailConfig().catch(() => null);
        const riskState = await getRiskRuntimeState().catch(() => ({
          dailyLossUsd: 0,
          consecutiveLosses: 0,
          cooldownUntil: null,
          dateKey: '',
        }));

        for (const sym of this.symbols) {
          const fullSeries = this.seriesBySymbol.get(sym);
          if (!fullSeries || this.cursorIndex >= fullSeries.length) continue;

          const windowSlice = fullSeries.slice(0, this.cursorIndex + 1);
          const currentBar = windowSlice[windowSlice.length - 1];

          broadcast({
            type: 'NEW_CANDLE',
            payload: { ...currentBar, symbol: sym, timeframe: this.timeframe },
          });

          // 1. Resolve open/pending Paper Broker trades on this bar
          const resOutcome = await paperBrokerService.resolveSymbolOnCandle(
            sym,
            this.timeframe,
            currentBar
          );
          for (const closedTrade of resOutcome.newlyClosedTrades) {
            if (closedTrade.status === 'EXPIRED' || closedTrade.status === 'CANCELLED') continue;
            this.tradesResolved += 1;
            const isWin = isWinningPaperStatus(closedTrade.status);
            const optPayload = {
              id: closedTrade.signalId || closedTrade.id,
              strategyId: closedTrade.strategyId,
              symbol: closedTrade.symbol,
              timeframe: closedTrade.timeframe,
              direction: closedTrade.direction,
              entry: closedTrade.fillPrice ?? closedTrade.requestedEntry,
              sl: closedTrade.slPrice,
              tp: closedTrade.tp1Price,
            };
            if (isWin) {
              await processResolvedWin(optPayload).catch(() => {});
              await recordTradeResolutionForRisk('WIN', Math.abs(closedTrade.realizedPnlUsd), cfg || undefined).catch(() => {});
            } else {
              await processResolvedLoss(optPayload).catch(() => {});
              await recordTradeResolutionForRisk('LOSS', Math.abs(closedTrade.realizedPnlUsd), cfg || undefined).catch(() => {});
            }
          }

          // 2. Run all TRAXO + core strategies on the historical slice
          const rollingDrawdownPct =
            cfg && cfg.accountBalance > 0
              ? Number(((riskState.dailyLossUsd / cfg.accountBalance) * 100).toFixed(2))
              : 0;

          const { signals: found } = runAllStrategies(windowSlice, sym, this.timeframe, null, {
            rollingDrawdownPct,
            consecutiveLosses: riskState.consecutiveLosses,
            accountBalance: cfg?.accountBalance,
          });

          for (const signal of found) {
            if (this.emittedSignals.has(signal.id)) continue;
            this.emittedSignals.add(signal.id);
            this.signalsGenerated += 1;

            broadcast({ type: 'NEW_SIGNAL', payload: signal });

            if (cfg) {
              const [openPositions, quote] = await Promise.all([
                paperBrokerService.getOpenPositions(),
                paperBrokerService.getSymbolQuote(signal.symbol, currentBar.close),
              ]);
              const evaluation = await evaluatePreTradeGuardrailsAsync({
                signal,
                config: cfg,
                openPositions,
                quote: quote.ok ? { bid: quote.bid, ask: quote.ask } : null,
                dailyLossUsd: riskState.dailyLossUsd,
                accountBalance: cfg.accountBalance,
                consecutiveLosses: riskState.consecutiveLosses,
                cooldownActiveUntil: riskState.cooldownUntil,
                newsMinutesAway: null,
                now: new Date(currentBar.time * 1000),
              });

              if (!evaluation.allowed) continue;

              const dynamicLots = calculateLots(signal.symbol, signal.entry, signal.sl, cfg.riskAmountUsd);
              const execRes = await paperBrokerService.executeTrade({
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
                riskAmountUsd: cfg.riskAmountUsd,
                rr: signal.rr,
                confidence: signal.confidence,
                entryType: signal.entryType,
                rawEntryType: signal.rawEntryType,
                price: signal.limitPrice ?? signal.entry,
                referencePrice: currentBar.close,
                signalTime: currentBar.time,
                reasons: signal.reason,
                confluence: signal.confluence,
                comment: `REPLAY ${signal.strategyId}`,
              });

              if (execRes.success) {
                this.tradesExecuted += 1;
              }
            }
          }
        }

        this.cursorIndex += 1;
        if (this.cursorIndex >= this.totalBars) {
          this.clearTimer();
          this.state = 'COMPLETED';
          break;
        }
      }

      const status = this.getStatus();
      broadcast({ type: 'REPLAY_TICK', payload: status });
      return status;
    } finally {
      this.stepping = false;
    }
  }
}

export const offlineReplayController = new OfflineReplayController();
