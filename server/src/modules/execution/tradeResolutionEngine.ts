import {
  getInstrumentSpec,
  normalizeSymbol,
  roundToDigits,
} from '../../config/instruments';
import type { MarketCandle } from '../market-data/marketDataService';
import {
  getCandlesAroundWindow,
  getDb,
  normalizeCanonicalTimeframe,
  queryCandles,
  timeframeToSeconds,
} from '../storage/sqliteDb';
import {
  isWinningPaperStatus,
  type PaperTradeEvent,
  type PaperTradeRecord,
  type PaperTradeStatus,
  type ResolutionMethod,
  type TradeReplayMarker,
  type TradeReplaySnapshot,
} from './executionBroker';

export function getTypicalSpreadPips(symbol: string): number {
  const canonical = normalizeSymbol(symbol);
  if (canonical === 'MNQ' || canonical === 'USTEC') return 2.0; // 0.50 pts = 2 ticks @ 0.25
  if (canonical === 'EURUSD') return 0.6;
  if (canonical === 'GBPUSD') return 0.9;
  if (canonical === 'USDJPY') return 0.7;
  if (canonical === 'AUDUSD' || canonical === 'USDCAD') return 1.0;
  if (canonical === 'XAUUSD') return 1.8;
  const spec = getInstrumentSpec(canonical);
  return Number(Math.min(2.0, Math.max(0.5, spec.maxAllowedSpreadPips * 0.35)).toFixed(2));
}

export function getTypicalSpreadPriceUnits(symbol: string): number {
  const spec = getInstrumentSpec(symbol);
  return Number((getTypicalSpreadPips(symbol) * spec.pipSize).toFixed(spec.digits + 1));
}

export function computeDollarPnl(params: {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  volume: number;
}): number {
  const spec = getInstrumentSpec(params.symbol);
  const dirSign = params.direction === 'BUY' ? 1 : -1;
  const pnl = (params.exitPrice - params.entryPrice) * dirSign * params.volume * spec.riskPerUnitFactor;
  return Number(pnl.toFixed(2));
}

export function getMaxPendingExpiryBars(timeframe: string): number {
  const tf = normalizeCanonicalTimeframe(timeframe);
  if (tf === '4H' || tf === '1D' || tf === '1W') return 20;
  return 12;
}

export function splitScaleOutVolume(symbol: string, initialVolume: number): {
  tp1Volume: number;
  runnerVolume: number;
} {
  const spec = getInstrumentSpec(symbol);
  if (spec.assetType === 'FUTURES') {
    const total = Math.max(1, Math.floor(initialVolume));
    if (total < 2) return { tp1Volume: total, runnerVolume: 0 };
    const tp1Volume = Math.floor(total / 2);
    return { tp1Volume, runnerVolume: total - tp1Volume };
  }
  if (initialVolume < 0.02) {
    return { tp1Volume: initialVolume, runnerVolume: 0 };
  }
  const tp1Volume = Math.max(0.01, Number((initialVolume / 2).toFixed(2)));
  const runnerVolume = Number(Math.max(0, initialVolume - tp1Volume).toFixed(2));
  return { tp1Volume, runnerVolume };
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapTradeRowToRecord(row: any): PaperTradeRecord {
  return {
    id: String(row.id),
    uid: String(row.uid || 'default_trader'),
    signalId: row.signal_id ? String(row.signal_id) : null,
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    market: String(row.market),
    strategyId: String(row.strategy_id),
    strategyLabel: String(row.strategy_label),
    tier: String(row.tier),
    direction: row.direction === 'SELL' ? 'SELL' : 'BUY',
    entryType: (row.entry_type || 'MARKET') as 'MARKET' | 'LIMIT' | 'STOP',
    exitMode: (row.exit_mode || 'FULL_TP1') as 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2',
    status: row.status as PaperTradeStatus,
    requestedEntry: Number(row.requested_entry),
    fillPrice: row.fill_price !== null && row.fill_price !== undefined ? Number(row.fill_price) : null,
    slPrice: Number(row.sl_price),
    currentSl: Number(row.current_sl),
    tp1Price: Number(row.tp1_price),
    tp2Price: row.tp2_price !== null && row.tp2_price !== undefined ? Number(row.tp2_price) : null,
    initialVolume: Number(row.initial_volume),
    openVolume: Number(row.open_volume),
    riskAmountUsd: Number(row.risk_amount_usd),
    plannedRr: Number(row.planned_rr),
    confidence: Number(row.confidence),
    spreadPipsAtEntry:
      row.spread_pips_at_entry !== null && row.spread_pips_at_entry !== undefined
        ? Number(row.spread_pips_at_entry)
        : null,
    createdAt: Number(row.created_at),
    filledAt: row.filled_at !== null && row.filled_at !== undefined ? Number(row.filled_at) : null,
    tp1HitAt: row.tp1_hit_at !== null && row.tp1_hit_at !== undefined ? Number(row.tp1_hit_at) : null,
    tp1FillPrice:
      row.tp1_fill_price !== null && row.tp1_fill_price !== undefined ? Number(row.tp1_fill_price) : null,
    tp1PnlUsd: Number(row.tp1_pnl_usd || 0),
    closedAt: row.closed_at !== null && row.closed_at !== undefined ? Number(row.closed_at) : null,
    exitPrice: row.exit_price !== null && row.exit_price !== undefined ? Number(row.exit_price) : null,
    realizedPnlUsd: Number(row.realized_pnl_usd || 0),
    floatingPnlUsd: Number(row.floating_pnl_usd || 0),
    realizedR: Number(row.realized_r || 0),
    mfePrice: row.mfe_price !== null && row.mfe_price !== undefined ? Number(row.mfe_price) : null,
    maePrice: row.mae_price !== null && row.mae_price !== undefined ? Number(row.mae_price) : null,
    mfeR: Number(row.mfe_r || 0),
    maeR: Number(row.mae_r || 0),
    barsHeld: Number(row.bars_held || 0),
    balanceBefore:
      row.balance_before !== null && row.balance_before !== undefined ? Number(row.balance_before) : null,
    balanceAfter:
      row.balance_after !== null && row.balance_after !== undefined ? Number(row.balance_after) : null,
    resolutionMethod: (row.resolution_method || null) as ResolutionMethod | null,
    lastEvaluatedTime:
      row.last_evaluated_time !== null && row.last_evaluated_time !== undefined
        ? Number(row.last_evaluated_time)
        : null,
    reasons: safeJsonParse<string[]>(row.reasons_json, []),
    confluence: safeJsonParse<any>(row.confluence_json, null),
    events: safeJsonParse<PaperTradeEvent[]>(row.events_json, []),
  };
}

function didPendingOrderFillOnCandle(
  trade: PaperTradeRecord,
  candle: MarketCandle,
  spread: number
): boolean {
  if (trade.entryType === 'LIMIT') {
    if (trade.direction === 'BUY') {
      return candle.low + spread <= trade.requestedEntry;
    }
    return candle.high >= trade.requestedEntry;
  }
  if (trade.entryType === 'STOP') {
    if (trade.direction === 'BUY') {
      return candle.high + spread >= trade.requestedEntry;
    }
    return candle.low <= trade.requestedEntry;
  }
  return false;
}

function checkSlTpOnBar(params: {
  direction: 'BUY' | 'SELL';
  bar: MarketCandle;
  sl: number;
  tp: number;
  spread: number;
}): { hitSl: boolean; hitTp: boolean } {
  if (params.direction === 'BUY') {
    return {
      hitSl: params.bar.low <= params.sl,
      hitTp: params.bar.high >= params.tp,
    };
  }
  return {
    hitSl: params.bar.high + params.spread >= params.sl,
    hitTp: params.bar.low + params.spread <= params.tp,
  };
}

function updateExcursionMetrics(trade: PaperTradeRecord, candle: MarketCandle, specDigits: number): void {
  const fill = trade.fillPrice ?? trade.requestedEntry;
  const riskDist = Math.abs(fill - trade.slPrice);

  if (trade.direction === 'BUY') {
    const best = candle.high;
    const worst = candle.low;
    trade.mfePrice =
      trade.mfePrice === null ? best : Math.max(trade.mfePrice, best);
    trade.maePrice =
      trade.maePrice === null ? worst : Math.min(trade.maePrice, worst);
    if (riskDist > 0) {
      trade.mfeR = Number(Math.max(trade.mfeR, (trade.mfePrice - fill) / riskDist).toFixed(2));
      trade.maeR = Number(Math.max(trade.maeR, (fill - trade.maePrice) / riskDist).toFixed(2));
    }
  } else {
    const best = candle.low;
    const worst = candle.high;
    trade.mfePrice =
      trade.mfePrice === null ? best : Math.min(trade.mfePrice, best);
    trade.maePrice =
      trade.maePrice === null ? worst : Math.max(trade.maePrice, worst);
    if (riskDist > 0) {
      trade.mfeR = Number(Math.max(trade.mfeR, (fill - trade.mfePrice) / riskDist).toFixed(2));
      trade.maeR = Number(Math.max(trade.maeR, (trade.maePrice - fill) / riskDist).toFixed(2));
    }
  }

  trade.mfePrice = roundToDigits(trade.mfePrice, specDigits) ?? trade.mfePrice;
  trade.maePrice = roundToDigits(trade.maePrice, specDigits) ?? trade.maePrice;
  trade.floatingPnlUsd = computeDollarPnl({
    symbol: trade.symbol,
    direction: trade.direction,
    entryPrice: fill,
    exitPrice: candle.close,
    volume: trade.openVolume,
  });
}

function computeBreakevenSl(trade: PaperTradeRecord, spread: number, digits: number): number {
  const fill = trade.fillPrice ?? trade.requestedEntry;
  const raw = trade.direction === 'BUY' ? fill + spread * 0.5 : fill - spread * 0.5;
  return roundToDigits(raw, digits) ?? raw;
}

/**
 * Evaluates a single bar (and any 1m sub-candles in SQLite) against an active paper trade.
 * Mutates `trade` in place and returns `{ tp1Scaled, closed, realizedDeltaUsd }`.
 */
export function evaluateTradeOnBar(
  trade: PaperTradeRecord,
  candle: MarketCandle,
  subCandles1m?: MarketCandle[]
): { tp1Scaled: boolean; closed: boolean; realizedDeltaUsd: number } {
  const canonicalTf = normalizeCanonicalTimeframe(trade.timeframe);
  const spec = getInstrumentSpec(trade.symbol);
  const spread = getTypicalSpreadPriceUnits(trade.symbol);

  if (trade.lastEvaluatedTime !== null && candle.time <= trade.lastEvaluatedTime) {
    return { tp1Scaled: false, closed: false, realizedDeltaUsd: 0 };
  }

  // Strictly ignore bars on or before creation unless explicitly newer
  if (candle.time <= trade.createdAt) {
    trade.lastEvaluatedTime = candle.time;
    return { tp1Scaled: false, closed: false, realizedDeltaUsd: 0 };
  }

  // 1. Handle PENDING Limit/Stop Fill Verification
  if (trade.status === 'PENDING') {
    trade.barsHeld += 1;
    trade.lastEvaluatedTime = candle.time;

    if (didPendingOrderFillOnCandle(trade, candle, spread)) {
      trade.status = 'OPEN';
      trade.fillPrice = trade.requestedEntry;
      trade.filledAt = candle.time;
      trade.mfePrice = trade.requestedEntry;
      trade.maePrice = trade.requestedEntry;
      trade.events.push({
        type: 'FILLED',
        time: candle.time,
        price: trade.fillPrice,
        volume: trade.initialVolume,
        note: `${trade.entryType} order filled @ ${trade.fillPrice}`,
      });
      return { tp1Scaled: false, closed: false, realizedDeltaUsd: 0 };
    }

    const maxBars = getMaxPendingExpiryBars(canonicalTf);
    if (trade.barsHeld >= maxBars) {
      trade.status = 'EXPIRED';
      trade.closedAt = candle.time;
      trade.resolutionMethod = 'candle_ohlc';
      trade.events.push({
        type: 'EXPIRED',
        time: candle.time,
        price: candle.close,
        note: `Pending ${trade.entryType} expired after ${trade.barsHeld} bars without price touching ${trade.requestedEntry}`,
      });
      return { tp1Scaled: false, closed: true, realizedDeltaUsd: 0 };
    }

    return { tp1Scaled: false, closed: false, realizedDeltaUsd: 0 };
  }

  if (trade.status !== 'OPEN' && trade.status !== 'PARTIAL_TP1') {
    return { tp1Scaled: false, closed: false, realizedDeltaUsd: 0 };
  }

  trade.barsHeld += 1;
  trade.lastEvaluatedTime = candle.time;
  updateExcursionMetrics(trade, candle, spec.digits);

  const fill = trade.fillPrice ?? trade.requestedEntry;
  let tp1Scaled = false;
  let closed = false;
  let realizedDeltaUsd = 0;

  const finalizeClose = (
    newStatus: PaperTradeStatus,
    exitPrice: number,
    method: ResolutionMethod,
    note: string
  ) => {
    const legPnl = computeDollarPnl({
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: fill,
      exitPrice,
      volume: trade.openVolume,
    });
    realizedDeltaUsd += legPnl;
    trade.realizedPnlUsd = Number((trade.tp1PnlUsd + legPnl).toFixed(2));
    trade.realizedR =
      trade.riskAmountUsd > 0
        ? Number((trade.realizedPnlUsd / trade.riskAmountUsd).toFixed(2))
        : 0;
    trade.openVolume = 0;
    trade.floatingPnlUsd = 0;
    trade.status = newStatus;
    trade.closedAt = candle.time;
    trade.exitPrice = exitPrice;
    trade.resolutionMethod = method;
    trade.events.push({
      type: 'EXIT',
      time: candle.time,
      price: exitPrice,
      pnlUsd: legPnl,
      note,
    });
    closed = true;
  };

  const applyTp1Scale = (method: ResolutionMethod) => {
    if (trade.exitMode !== 'SCALE_50_TP1_BE_TP2' || !trade.tp2Price) {
      finalizeClose(
        'WIN_TP1',
        trade.tp1Price,
        method,
        `100% TP1 cleared @ ${trade.tp1Price}`
      );
      return;
    }

    const { tp1Volume, runnerVolume } = splitScaleOutVolume(trade.symbol, trade.initialVolume);
    if (runnerVolume <= 0) {
      finalizeClose(
        'WIN_TP1',
        trade.tp1Price,
        method,
        `Full TP1 cleared @ ${trade.tp1Price}`
      );
      return;
    }

    const tp1Pnl = computeDollarPnl({
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: fill,
      exitPrice: trade.tp1Price,
      volume: tp1Volume,
    });

    realizedDeltaUsd += tp1Pnl;
    trade.tp1HitAt = candle.time;
    trade.tp1FillPrice = trade.tp1Price;
    trade.tp1PnlUsd = tp1Pnl;
    trade.realizedPnlUsd = tp1Pnl;
    trade.openVolume = runnerVolume;
    trade.status = 'PARTIAL_TP1';
    const beSl = computeBreakevenSl(trade, spread, spec.digits);
    trade.currentSl = beSl;
    trade.events.push({
      type: 'TP1_SCALED',
      time: candle.time,
      price: trade.tp1Price,
      volume: tp1Volume,
      pnlUsd: tp1Pnl,
      note: `Scaled out ${tp1Volume} at TP1 (+$${tp1Pnl.toFixed(2)})`,
    });
    trade.events.push({
      type: 'SL_MOVED_TO_BE',
      time: candle.time,
      price: beSl,
      note: `Stop moved to Breakeven @ ${beSl} for ${runnerVolume} runner`,
    });
    tp1Scaled = true;
  };

  // Helper to resolve intrabar using 1m sub-candles when both SL & TP are touched on one candle
  const tfSec = timeframeToSeconds(canonicalTf);
  const subBars =
    subCandles1m !== undefined
      ? subCandles1m
      : canonicalTf !== '1m'
      ? queryCandles({
          symbol: trade.symbol,
          timeframe: '1m',
          fromTime: candle.time,
          toTime: candle.time + tfSec - 1,
        })
      : [];

  if (trade.status === 'OPEN') {
    const check1 = checkSlTpOnBar({
      direction: trade.direction,
      bar: candle,
      sl: trade.currentSl,
      tp: trade.tp1Price,
      spread,
    });

    if (check1.hitSl && !check1.hitTp) {
      finalizeClose('LOSS_SL', trade.currentSl, 'candle_ohlc', `Stop loss hit @ ${trade.currentSl}`);
      return { tp1Scaled, closed, realizedDeltaUsd };
    }

    if (check1.hitTp && !check1.hitSl) {
      applyTp1Scale('candle_ohlc');
      // If scaled on this bar and sub-candles exist, check if TP2/BE hit on later 1m sub-candles
      const statusAfterTp1 = trade.status as PaperTradeStatus;
      if (!closed && statusAfterTp1 === 'PARTIAL_TP1' && subBars.length > 0 && trade.tp2Price) {
        let afterTp1 = false;
        for (const bar1m of subBars) {
          if (!afterTp1) {
            const c1 = checkSlTpOnBar({
              direction: trade.direction,
              bar: bar1m,
              sl: trade.slPrice,
              tp: trade.tp1Price,
              spread,
            });
            if (c1.hitTp) afterTp1 = true;
            continue;
          }
          const c2 = checkSlTpOnBar({
            direction: trade.direction,
            bar: bar1m,
            sl: trade.currentSl,
            tp: trade.tp2Price,
            spread,
          });
          if (c2.hitSl) {
            finalizeClose(
              'WIN_TP1_BE',
              trade.currentSl,
              'exact_1m',
              `1m tie-break: runner stopped at Breakeven @ ${trade.currentSl}`
            );
            break;
          }
          if (c2.hitTp) {
            finalizeClose(
              'WIN_TP2',
              trade.tp2Price,
              'exact_1m',
              `1m exact: TP2 cleared @ ${trade.tp2Price}`
            );
            break;
          }
        }
      }
      return { tp1Scaled, closed, realizedDeltaUsd };
    }

    if (check1.hitSl && check1.hitTp) {
      if (subBars.length > 0) {
        for (const bar1m of subBars) {
          if (trade.status === 'OPEN') {
            const c1 = checkSlTpOnBar({
              direction: trade.direction,
              bar: bar1m,
              sl: trade.currentSl,
              tp: trade.tp1Price,
              spread,
            });
            if (c1.hitSl && c1.hitTp) {
              finalizeClose(
                'LOSS_SL',
                trade.currentSl,
                'conservative_tiebreak',
                `Conservative 1m tie-break: SL @ ${trade.currentSl} touched inside same 1m bar`
              );
              break;
            }
            if (c1.hitSl) {
              finalizeClose(
                'LOSS_SL',
                trade.currentSl,
                'exact_1m',
                `1m exact sub-candle: SL touched before TP1 @ ${trade.currentSl}`
              );
              break;
            }
            if (c1.hitTp) {
              applyTp1Scale('exact_1m');
              continue;
            }
          } else if (trade.status === 'PARTIAL_TP1' && trade.tp2Price) {
            const c2 = checkSlTpOnBar({
              direction: trade.direction,
              bar: bar1m,
              sl: trade.currentSl,
              tp: trade.tp2Price,
              spread,
            });
            if (c2.hitSl) {
              finalizeClose(
                'WIN_TP1_BE',
                trade.currentSl,
                'exact_1m',
                `1m exact sub-candle: runner stopped at BE @ ${trade.currentSl}`
              );
              break;
            }
            if (c2.hitTp) {
              finalizeClose(
                'WIN_TP2',
                trade.tp2Price,
                'exact_1m',
                `1m exact sub-candle: TP2 runner cleared @ ${trade.tp2Price}`
              );
              break;
            }
          }
        }
        if (!closed && trade.status === 'OPEN') {
          finalizeClose(
            'LOSS_SL',
            trade.currentSl,
            'conservative_tiebreak',
            `Conservative tie-break SL @ ${trade.currentSl}`
          );
        }
      } else {
        finalizeClose(
          'LOSS_SL',
          trade.currentSl,
          'conservative_tiebreak',
          `Same-bar SL & TP1 spanned without 1m archive; conservative SL @ ${trade.currentSl}`
        );
      }
      return { tp1Scaled, closed, realizedDeltaUsd };
    }
  } else if (trade.status === 'PARTIAL_TP1' && trade.tp2Price) {
    const check2 = checkSlTpOnBar({
      direction: trade.direction,
      bar: candle,
      sl: trade.currentSl,
      tp: trade.tp2Price,
      spread,
    });

    if (check2.hitSl && !check2.hitTp) {
      finalizeClose(
        'WIN_TP1_BE',
        trade.currentSl,
        'candle_ohlc',
        `Runner retraced to Breakeven SL @ ${trade.currentSl} (TP1 banked)`
      );
      return { tp1Scaled, closed, realizedDeltaUsd };
    }

    if (check2.hitTp && !check2.hitSl) {
      finalizeClose(
        'WIN_TP2',
        trade.tp2Price,
        'candle_ohlc',
        `Runner cleared TP2 @ ${trade.tp2Price}`
      );
      return { tp1Scaled, closed, realizedDeltaUsd };
    }

    if (check2.hitSl && check2.hitTp) {
      if (subBars.length > 0) {
        for (const bar1m of subBars) {
          const c2 = checkSlTpOnBar({
            direction: trade.direction,
            bar: bar1m,
            sl: trade.currentSl,
            tp: trade.tp2Price,
            spread,
          });
          if (c2.hitSl) {
            finalizeClose(
              'WIN_TP1_BE',
              trade.currentSl,
              'exact_1m',
              `1m exact: Breakeven SL touched before TP2 @ ${trade.currentSl}`
            );
            break;
          }
          if (c2.hitTp) {
            finalizeClose(
              'WIN_TP2',
              trade.tp2Price,
              'exact_1m',
              `1m exact: TP2 cleared before BE retrace @ ${trade.tp2Price}`
            );
            break;
          }
        }
      }
      if (!closed) {
        finalizeClose(
          'WIN_TP1_BE',
          trade.currentSl,
          'conservative_tiebreak',
          `Same-bar BE & TP2 spanned; conservative Breakeven exit @ ${trade.currentSl}`
        );
      }
      return { tp1Scaled, closed, realizedDeltaUsd };
    }
  }

  return { tp1Scaled, closed, realizedDeltaUsd };
}

export function buildAndSaveTradeReplaySnapshot(trade: PaperTradeRecord): TradeReplaySnapshot {
  const db = getDb();
  const entryWindowStart = trade.createdAt;
  const exitWindowEnd = trade.closedAt ?? trade.lastEvaluatedTime ?? trade.createdAt;
  const window = getCandlesAroundWindow(
    trade.symbol,
    trade.timeframe,
    entryWindowStart,
    exitWindowEnd,
    60,
    20
  );

  const markers: TradeReplayMarker[] = [];
  markers.push({
    kind: 'SIGNAL',
    label: `SIGNAL ${trade.direction}`,
    time: trade.createdAt,
    price: trade.requestedEntry,
    color: '#A1A1AA',
  });

  if (trade.filledAt && trade.fillPrice !== null) {
    markers.push({
      kind: 'FILL',
      label: `FILLED @ ${trade.fillPrice}`,
      time: trade.filledAt,
      price: trade.fillPrice,
      color: '#60A5FA',
    });
  }

  if (trade.tp1HitAt && trade.tp1FillPrice !== null) {
    markers.push({
      kind: 'TP1',
      label: `TP1 +50% (+$${trade.tp1PnlUsd.toFixed(2)})`,
      time: trade.tp1HitAt,
      price: trade.tp1FillPrice,
      color: '#34D399',
    });
    markers.push({
      kind: 'BE_MOVE',
      label: `SL -> BE (${trade.currentSl})`,
      time: trade.tp1HitAt,
      price: trade.currentSl,
      color: '#FBBF24',
    });
  }

  if (trade.closedAt && trade.exitPrice !== null) {
    const win = isWinningPaperStatus(trade.status);
    markers.push({
      kind: 'EXIT',
      label: `${trade.status} (${trade.realizedPnlUsd >= 0 ? '+' : ''}$${trade.realizedPnlUsd.toFixed(2)})`,
      time: trade.closedAt,
      price: trade.exitPrice,
      color: win ? '#34D399' : '#F87171',
    });
  }

  const priceLines = {
    requestedEntry: trade.requestedEntry,
    fillPrice: trade.fillPrice,
    initialSl: trade.slPrice,
    currentSl: trade.currentSl,
    tp1Price: trade.tp1Price,
    tp2Price: trade.tp2Price,
    exitPrice: trade.exitPrice,
  };

  const snapshot: TradeReplaySnapshot = {
    tradeId: trade.id,
    symbol: trade.symbol,
    timeframe: trade.timeframe,
    preEntryBars: window.preCount,
    tradeBars: window.tradeCount,
    postExitBars: window.postCount,
    candles: window.candles,
    markers,
    priceLines,
    createdAt: Date.now(),
  };

  db.prepare(`
    INSERT INTO trade_replay_snapshots (
      trade_id, symbol, timeframe, pre_entry_bars, trade_bars, post_exit_bars,
      candles_json, markers_json, price_lines_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_id) DO UPDATE SET
      pre_entry_bars = excluded.pre_entry_bars,
      trade_bars = excluded.trade_bars,
      post_exit_bars = excluded.post_exit_bars,
      candles_json = excluded.candles_json,
      markers_json = excluded.markers_json,
      price_lines_json = excluded.price_lines_json
  `).run(
    snapshot.tradeId,
    snapshot.symbol,
    snapshot.timeframe,
    snapshot.preEntryBars,
    snapshot.tradeBars,
    snapshot.postExitBars,
    JSON.stringify(snapshot.candles),
    JSON.stringify(snapshot.markers),
    JSON.stringify(snapshot.priceLines),
    snapshot.createdAt
  );

  return snapshot;
}

/**
 * Evaluates an un-executed active signal deterministically with spread awareness,
 * pending limit entry verification, and 1m SQLite intrabar tie-breaking.
 */
export function evaluateSignalDeterministically(params: {
  signal: {
    symbol: string;
    timeframe?: string;
    direction: 'BUY' | 'SELL';
    entryType?: string;
    limitPrice?: number | null;
    entry: number;
    sl: number;
    tp: number;
    time: number;
  };
  candles: MarketCandle[];
}): { outcome: 'WIN' | 'LOSS' | null; resolutionMethod: ResolutionMethod | null; resolvedAtTime: number | null } {
  const { signal, candles } = params;
  if (!candles.length) return { outcome: null, resolutionMethod: null, resolvedAtTime: null };

  const tf = normalizeCanonicalTimeframe(signal.timeframe || '15m');
  const tfSec = timeframeToSeconds(tf);
  const spread = getTypicalSpreadPriceUnits(signal.symbol);
  const entryTarget = Number(signal.limitPrice ?? signal.entry);
  let filled = signal.entryType !== 'limit';

  for (const bar of candles) {
    if (bar.time <= signal.time) continue;

    if (!filled) {
      if (signal.direction === 'BUY' && bar.low + spread <= entryTarget) {
        filled = true;
      } else if (signal.direction === 'SELL' && bar.high >= entryTarget) {
        filled = true;
      }
      continue;
    }

    const check = checkSlTpOnBar({
      direction: signal.direction,
      bar,
      sl: signal.sl,
      tp: signal.tp,
      spread,
    });

    if (check.hitSl && !check.hitTp) {
      return { outcome: 'LOSS', resolutionMethod: 'candle_ohlc', resolvedAtTime: bar.time };
    }
    if (check.hitTp && !check.hitSl) {
      return { outcome: 'WIN', resolutionMethod: 'candle_ohlc', resolvedAtTime: bar.time };
    }
    if (check.hitSl && check.hitTp) {
      if (tf !== '1m') {
        const subBars = queryCandles({
          symbol: signal.symbol,
          timeframe: '1m',
          fromTime: bar.time,
          toTime: bar.time + tfSec - 1,
        });
        for (const b1m of subBars) {
          const c1m = checkSlTpOnBar({
            direction: signal.direction,
            bar: b1m,
            sl: signal.sl,
            tp: signal.tp,
            spread,
          });
          if (c1m.hitSl && c1m.hitTp) {
            return { outcome: 'LOSS', resolutionMethod: 'conservative_tiebreak', resolvedAtTime: bar.time };
          }
          if (c1m.hitSl) {
            return { outcome: 'LOSS', resolutionMethod: 'exact_1m', resolvedAtTime: bar.time };
          }
          if (c1m.hitTp) {
            return { outcome: 'WIN', resolutionMethod: 'exact_1m', resolvedAtTime: bar.time };
          }
        }
      }
      return { outcome: 'LOSS', resolutionMethod: 'conservative_tiebreak', resolvedAtTime: bar.time };
    }
  }

  return { outcome: null, resolutionMethod: null, resolvedAtTime: null };
}
