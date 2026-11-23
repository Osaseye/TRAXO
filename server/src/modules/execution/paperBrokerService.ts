import crypto from 'crypto';
import {
  calculateSpreadPips,
  getInstrumentSpec,
  normalizeSymbol,
  roundToDigits,
} from '../../config/instruments';
import type { MarketCandle } from '../market-data/marketDataService';
import redis from '../market-data/redisClient';
import { schedulePaperCloudBackup } from '../storage/paperCloudBackup';
import {
  getDb,
  getLatestArchivedCandle,
  normalizeCanonicalTimeframe,
  queryCandles,
} from '../storage/sqliteDb';
import { broadcast } from '../websocket/websocketManager';
import { syncPaperTradeToJournal } from '../journal/journalService';
import {
  assignDynamicExitMode,
  isTerminalPaperStatus,
  isWinningPaperStatus,
  type ExecuteTradeParams,
  type ExecuteTradeResult,
  type IExecutionBroker,
  type PaperAccountRecord,
  type PaperTradeRecord,
  type SymbolQuoteResponse,
  type TradeReplaySnapshot,
} from './executionBroker';
import {
  buildAndSaveTradeReplaySnapshot,
  computeDollarPnl,
  evaluateTradeOnBar,
  getTypicalSpreadPriceUnits,
  mapTradeRowToRecord,
} from './tradeResolutionEngine';

const DEFAULT_UID = 'default_trader';

function mapAccountRow(row: any): PaperAccountRecord {
  return {
    uid: String(row.uid),
    startingBalance: Number(row.starting_balance),
    balance: Number(row.balance),
    equity: Number(row.equity),
    usedMargin: Number(row.used_margin),
    freeMargin: Number(row.free_margin),
    floatingPnl: Number(row.floating_pnl),
    realizedPnl: Number(row.realized_pnl),
    peakEquity: Number(row.peak_equity),
    maxDrawdownPct: Number(row.max_drawdown_pct),
    currency: String(row.currency || 'USD'),
    leverage: Number(row.leverage || 100),
    updatedAt: Number(row.updated_at || Date.now()),
  };
}

function estimateMarginRequired(symbol: string, price: number, volume: number, leverage: number): number {
  const spec = getInstrumentSpec(symbol);
  if (spec.assetType === 'FUTURES') {
    // Micro Nasdaq intraday margin ~$150 per contract in paper engine
    return Number((volume * 150).toFixed(2));
  }
  const notional = volume * spec.contractSize * (price > 0 ? price : 1);
  return Number((notional / Math.max(1, leverage)).toFixed(2));
}

export class PaperBrokerService implements IExecutionBroker {
  readonly mode = 'paper' as const;
  private readonly inFlightOrderKeys = new Set<string>();
  private readonly recentOrderTimestamps = new Map<string, number>();

  async ensureAccount(uid = DEFAULT_UID): Promise<PaperAccountRecord> {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid);
    if (existing) {
      return mapAccountRow(existing);
    }

    let startingBalance = 10_000;
    try {
      const cached = await redis.get(`trading_context:${uid}`).catch(() => null);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed.accountBalance === 'number' && parsed.accountBalance > 0) {
          startingBalance = parsed.accountBalance;
        }
      }
    } catch {}

    const now = Date.now();
    db.prepare(`
      INSERT INTO paper_accounts (
        uid, starting_balance, balance, equity, used_margin, free_margin,
        floating_pnl, realized_pnl, peak_equity, max_drawdown_pct, currency, leverage, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, 0, 0, ?, 0, 'USD', 100, ?)
    `).run(uid, startingBalance, startingBalance, startingBalance, startingBalance, startingBalance, now);

    const created = db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid);
    return mapAccountRow(created);
  }

  private broadcastAccountUpdate(acc: PaperAccountRecord): void {
    broadcast({
      type: 'PAPER_ACCOUNT_UPDATED',
      payload: {
        connected: true,
        mode: 'paper',
        state: 'CONNECTED',
        platform: 'TRAXO PAPER',
        uid: acc.uid,
        balance: acc.balance,
        equity: acc.equity,
        margin: acc.usedMargin,
        usedMargin: acc.usedMargin,
        freeMargin: acc.freeMargin,
        floatingPnl: acc.floatingPnl,
        realizedPnl: acc.realizedPnl,
        startingBalance: acc.startingBalance,
        peakEquity: acc.peakEquity,
        maxDrawdownPct: acc.maxDrawdownPct,
        currency: acc.currency,
        leverage: acc.leverage,
      },
    });
  }

  hasTradeForSignal(signalId: string, uid = DEFAULT_UID): boolean {
    const cleanId = String(signalId || '').trim();
    if (!cleanId) return false;
    const db = getDb();
    return Boolean(
      db
        .prepare("SELECT 1 FROM paper_trades WHERE uid = ? AND signal_id = ? AND status NOT IN ('CANCELLED') LIMIT 1")
        .get(uid, cleanId)
    );
  }

  recalculateAccountMetrics(uid = DEFAULT_UID): PaperAccountRecord {
    const db = getDb();
    const row = db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid);
    if (!row) {
      const now = Date.now();
      db.prepare(`
        INSERT INTO paper_accounts (
          uid, starting_balance, balance, equity, used_margin, free_margin,
          floating_pnl, realized_pnl, peak_equity, max_drawdown_pct, currency, leverage, updated_at
        ) VALUES (?, 10000, 10000, 10000, 0, 10000, 0, 0, 10000, 0, 'USD', 100, ?)
      `).run(uid, now);
    }
    const acc = mapAccountRow(db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid));

    const openRows = db
      .prepare(`SELECT * FROM paper_trades WHERE uid = ? AND status IN ('OPEN', 'PARTIAL_TP1')`)
      .all(uid);

    let floatingPnl = 0;
    let usedMargin = 0;
    for (const r of openRows) {
      const t = mapTradeRowToRecord(r);
      const latest = getLatestArchivedCandle(t.symbol);
      const liveFloating = latest
        ? computeDollarPnl({
            symbol: t.symbol,
            direction: t.direction,
            entryPrice: t.fillPrice ?? t.requestedEntry,
            exitPrice: latest.close,
            volume: t.openVolume,
          })
        : t.floatingPnlUsd;
      floatingPnl += liveFloating;
      usedMargin += estimateMarginRequired(
        t.symbol,
        t.fillPrice ?? t.requestedEntry,
        t.openVolume,
        acc.leverage
      );
    }

    const realizedRow = db
      .prepare(`SELECT COALESCE(SUM(realized_pnl_usd), 0) AS total_realized FROM paper_trades WHERE uid = ?`)
      .get(uid);
    const realizedPnl = Number(Number(realizedRow?.total_realized || 0).toFixed(2));
    const balance = Number((acc.startingBalance + realizedPnl).toFixed(2));
    const equity = Number((balance + floatingPnl).toFixed(2));
    const freeMargin = Number(Math.max(0, equity - usedMargin).toFixed(2));
    const peakEquity = Number(Math.max(acc.peakEquity, equity).toFixed(2));
    const currentDdPct = peakEquity > 0 ? Math.max(0, ((peakEquity - equity) / peakEquity) * 100) : 0;
    const maxDrawdownPct = Number(Math.max(acc.maxDrawdownPct, currentDdPct).toFixed(2));
    const now = Date.now();

    db.prepare(`
      UPDATE paper_accounts
      SET balance = ?, equity = ?, used_margin = ?, free_margin = ?, floating_pnl = ?,
          realized_pnl = ?, peak_equity = ?, max_drawdown_pct = ?, updated_at = ?
      WHERE uid = ?
    `).run(
      balance,
      equity,
      Number(usedMargin.toFixed(2)),
      freeMargin,
      Number(floatingPnl.toFixed(2)),
      realizedPnl,
      peakEquity,
      maxDrawdownPct,
      now,
      uid
    );

    return mapAccountRow(db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid));
  }

  async resetOrSetPaperBalance(
    uid = DEFAULT_UID,
    balanceUsd: number,
    clearTrades = false
  ): Promise<PaperAccountRecord> {
    const cleanBal = Math.max(100, Number(balanceUsd) || 10_000);
    await this.ensureAccount(uid);
    const db = getDb();

    if (clearTrades) {
      db.prepare('DELETE FROM trade_replay_snapshots WHERE trade_id IN (SELECT id FROM paper_trades WHERE uid = ?)').run(uid);
      db.prepare('DELETE FROM paper_trades WHERE uid = ?').run(uid);
      for (const key of this.recentOrderTimestamps.keys()) {
        if (key.startsWith(`${uid}::`)) {
          this.recentOrderTimestamps.delete(key);
        }
      }
    }

    const now = Date.now();
    db.prepare(`
      UPDATE paper_accounts
      SET starting_balance = ?, balance = ?, equity = ?, used_margin = 0, free_margin = ?,
          floating_pnl = 0, realized_pnl = ?, peak_equity = ?, max_drawdown_pct = 0, updated_at = ?
      WHERE uid = ?
    `).run(cleanBal, cleanBal, cleanBal, cleanBal, clearTrades ? 0 : 0, cleanBal, now, uid);

    try {
      const existingCtx = await redis.get(`trading_context:${uid}`).catch(() => null);
      const parsed = existingCtx ? JSON.parse(existingCtx) : {};
      await redis.set(
        `trading_context:${uid}`,
        JSON.stringify({ ...parsed, accountBalance: cleanBal })
      );
    } catch {}

    const rec = this.recalculateAccountMetrics(uid);
    this.broadcastAccountUpdate(rec);
    schedulePaperCloudBackup(uid);
    return rec;
  }

  async getAccountInfo(uid = DEFAULT_UID): Promise<Record<string, any>> {
    await this.ensureAccount(uid);
    const acc = this.recalculateAccountMetrics(uid);
    return {
      connected: true,
      mode: 'paper',
      state: 'CONNECTED',
      platform: 'TRAXO PAPER',
      balance: acc.balance,
      equity: acc.equity,
      margin: acc.usedMargin,
      freeMargin: acc.freeMargin,
      floatingPnl: acc.floatingPnl,
      realizedPnl: acc.realizedPnl,
      startingBalance: acc.startingBalance,
      peakEquity: acc.peakEquity,
      maxDrawdownPct: acc.maxDrawdownPct,
      leverage: acc.leverage,
      currency: acc.currency,
    };
  }

  async getSymbolQuote(symbol: string, referencePrice?: number): Promise<SymbolQuoteResponse> {
    const canonical = normalizeSymbol(symbol);
    const spec = getInstrumentSpec(canonical);

    let midPrice = referencePrice && Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : null;
    let quoteTs = new Date().toISOString();

    if (midPrice === null) {
      const archived = getLatestArchivedCandle(canonical);
      if (archived) {
        midPrice = archived.close;
        quoteTs = archived.timestamp;
      }
    }

    if (midPrice === null) {
      // Fallback: check cached candles in Redis for scannable timeframes
      for (const tf of ['15min', '15m', '5min', '1h']) {
        try {
          const cached = await redis.get(`candles:${spec.twelveDataSymbol}:${tf}:200`);
          if (cached) {
            const arr = JSON.parse(cached) as MarketCandle[];
            if (Array.isArray(arr) && arr.length > 0) {
              const last = arr[arr.length - 1];
              midPrice = last.close;
              quoteTs = last.timestamp;
              break;
            }
          }
        } catch {}
      }
    }

    if (midPrice === null || !Number.isFinite(midPrice)) {
      return {
        ok: false,
        symbol: canonical,
        brokerSymbol: spec.exnessSymbol,
        bid: null,
        ask: null,
        mid: null,
        spread: null,
        spreadPips: null,
        digits: spec.digits,
        error: `No archived or cached candle available for ${canonical}`,
      };
    }

    const spreadUnits = getTypicalSpreadPriceUnits(canonical);
    const halfSpread = spreadUnits / 2;
    const bid = roundToDigits(midPrice - halfSpread, spec.digits) ?? midPrice - halfSpread;
    const ask = roundToDigits(midPrice + halfSpread, spec.digits) ?? midPrice + halfSpread;
    const mid = roundToDigits((bid + ask) / 2, spec.digits) ?? midPrice;
    const spread = Number(Math.abs(ask - bid).toFixed(spec.digits));
    const spreadPips = calculateSpreadPips(canonical, bid, ask);

    return {
      ok: true,
      symbol: canonical,
      brokerSymbol: spec.exnessSymbol,
      bid,
      ask,
      mid,
      spread,
      spreadPips,
      digits: spec.digits,
      timestamp: quoteTs,
    };
  }

  async executeTrade(params: ExecuteTradeParams): Promise<ExecuteTradeResult> {
    const uid = params.uid || DEFAULT_UID;
    const canonical = normalizeSymbol(params.symbol);
    const spec = getInstrumentSpec(canonical);
    const actionUpper = String(params.action || '').toUpperCase();

    if (actionUpper !== 'BUY' && actionUpper !== 'SELL') {
      return {
        success: false,
        entryType: 'market',
        symbol: canonical,
        error: `Invalid action '${params.action}'`,
      };
    }

    const rawEntryUpper = String(params.rawEntryType || params.entryType || 'MARKET').toUpperCase();
    const orderEntryType: 'MARKET' | 'LIMIT' | 'STOP' =
      rawEntryUpper === 'STOP' ? 'STOP' : rawEntryUpper === 'LIMIT' ? 'LIMIT' : 'MARKET';
    const compatEntryType: 'market' | 'limit' = orderEntryType === 'MARKET' ? 'market' : 'limit';

    const volume =
      spec.assetType === 'FUTURES'
        ? Math.max(1, Math.min(Math.floor(spec.maxLots), Math.floor(Number(params.volume ?? 1) || 1)))
        : Math.min(spec.maxLots, Math.max(0.01, Number(Number(params.volume ?? 0.01).toFixed(2)) || 0.01));

    const signalIdClean = params.signalId ? String(params.signalId).trim() : '';
    const earlyLockKey = signalIdClean
      ? `${uid}::sig::${signalIdClean}`
      : `${uid}::manual::${canonical}::${actionUpper}::${orderEntryType}::${volume}::${params.price ?? params.openPrice ?? params.limitPrice ?? ''}::${params.sl ?? ''}::${params.tp ?? ''}`;

    if (this.inFlightOrderKeys.has(earlyLockKey)) {
      return {
        success: false,
        duplicate: true,
        entryType: compatEntryType,
        symbol: canonical,
        volume,
        error: 'Order submission is already in progress',
      };
    }

    const lastOrderTs = this.recentOrderTimestamps.get(earlyLockKey);
    if (lastOrderTs && Date.now() - lastOrderTs < 5_000) {
      return {
        success: false,
        duplicate: true,
        entryType: compatEntryType,
        symbol: canonical,
        volume,
        error: 'Duplicate order ignored — already placed',
      };
    }

    this.inFlightOrderKeys.add(earlyLockKey);

    try {
      const quote = await this.getSymbolQuote(canonical, params.referencePrice);
      const rawRequestedPrice =
        params.price ??
        params.openPrice ??
        params.limitPrice ??
        params.referencePrice ??
        (actionUpper === 'BUY' ? quote.ask : quote.bid);

      const requestedEntry = roundToDigits(rawRequestedPrice, spec.digits);
      if (!requestedEntry || requestedEntry <= 0) {
        return {
          success: false,
          entryType: compatEntryType,
          symbol: canonical,
          volume,
          error: 'Unable to determine entry price (no price or archived quote available)',
        };
      }

      const db = getDb();
      if (signalIdClean) {
        const existingSignalTrade = db
          .prepare(
            `SELECT id, status FROM paper_trades WHERE uid = ? AND signal_id = ? AND status NOT IN ('CANCELLED') LIMIT 1`
          )
          .get(uid, signalIdClean);
        if (existingSignalTrade) {
          return {
            success: false,
            duplicate: true,
            tradeId: String(existingSignalTrade.id),
            entryType: compatEntryType,
            symbol: canonical,
            volume,
            error: 'This signal has already been executed in Paper Broker',
          };
        }
      }

      const account = await this.ensureAccount(uid);
      const isImmediateMarket = orderEntryType === 'MARKET';
      const fillPrice = isImmediateMarket
        ? actionUpper === 'BUY'
          ? quote.ask ?? requestedEntry
          : quote.bid ?? requestedEntry
        : null;
      const anchor = fillPrice ?? requestedEntry;

      const rawSl =
        params.sl !== undefined && params.sl !== null && Number(params.sl) > 0
          ? Number(params.sl)
          : undefined;
      const rawTp =
        params.tp !== undefined && params.tp !== null && Number(params.tp) > 0
          ? Number(params.tp)
          : undefined;
      const rawTp2 =
        params.tp2 !== undefined && params.tp2 !== null && Number(params.tp2) > 0
          ? Number(params.tp2)
          : undefined;

      let slPrice =
        roundToDigits(rawSl, spec.digits) ??
        roundToDigits(
          actionUpper === 'BUY' ? anchor - spec.pipSize * 20 : anchor + spec.pipSize * 20,
          spec.digits
        )!;
      let tp1Price =
        roundToDigits(rawTp, spec.digits) ??
        roundToDigits(
          actionUpper === 'BUY' ? anchor + spec.pipSize * 40 : anchor - spec.pipSize * 40,
          spec.digits
        )!;
      let tp2Price = rawTp2 !== undefined ? roundToDigits(rawTp2, spec.digits) ?? null : null;

      if (actionUpper === 'BUY') {
        if (slPrice >= anchor) {
          slPrice = roundToDigits(anchor - spec.pipSize * 20, spec.digits)!;
        }
        if (tp1Price <= anchor) {
          tp1Price = roundToDigits(anchor + spec.pipSize * 40, spec.digits)!;
        }
        if (tp2Price !== null && tp2Price <= tp1Price) {
          tp2Price = null;
        }
      } else {
        if (slPrice <= anchor) {
          slPrice = roundToDigits(anchor + spec.pipSize * 20, spec.digits)!;
        }
        if (tp1Price >= anchor) {
          tp1Price = roundToDigits(anchor - spec.pipSize * 40, spec.digits)!;
        }
        if (tp2Price !== null && tp2Price >= tp1Price) {
          tp2Price = null;
        }
      }

      const exitMode = assignDynamicExitMode({
        strategyId: params.strategyId,
        market: params.market || spec.assetType,
        tier: params.tier || 'STANDARD',
        volume,
        tp2: tp2Price,
      });

      const createdAt =
        params.signalTime && Number.isFinite(params.signalTime)
          ? params.signalTime > 1e12
            ? Math.floor(params.signalTime / 1000)
            : Math.floor(params.signalTime)
          : Math.floor(Date.now() / 1000);

      const filledAt = isImmediateMarket ? createdAt : null;
      const status = isImmediateMarket ? 'OPEN' : 'PENDING';

      const riskDist = Math.abs((fillPrice ?? requestedEntry) - slPrice);
      const rewardDist = Math.abs(tp1Price - (fillPrice ?? requestedEntry));
      const plannedRr = params.rr ?? (riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 0);
      const riskAmountUsd =
        params.riskAmountUsd && params.riskAmountUsd > 0
          ? Number(params.riskAmountUsd)
          : Number((riskDist * volume * spec.riskPerUnitFactor).toFixed(2));

      const tradeId = `paper_${crypto.randomBytes(6).toString('hex')}`;
      const canonicalTf = normalizeCanonicalTimeframe(params.timeframe || '15m');

      const initialEvents = [
        {
          type: 'CREATED',
          time: createdAt,
          price: requestedEntry,
          volume,
          note: `${actionUpper} ${orderEntryType} (${exitMode}) created for ${canonical} ${canonicalTf}`,
        },
        ...(isImmediateMarket && fillPrice !== null
          ? [
              {
                type: 'FILLED',
                time: createdAt,
                price: fillPrice,
                volume,
                note: `Market order filled @ ${fillPrice} (spread ${quote.spreadPips ?? 0}p)`,
              },
            ]
          : []),
      ];

      db.prepare(`
        INSERT INTO paper_trades (
          id, uid, signal_id, symbol, timeframe, market, strategy_id, strategy_label, tier,
          direction, entry_type, exit_mode, status, requested_entry, fill_price, sl_price, current_sl,
          tp1_price, tp2_price, initial_volume, open_volume, risk_amount_usd, planned_rr, confidence,
          spread_pips_at_entry, created_at, filled_at, tp1_hit_at, tp1_fill_price, tp1_pnl_usd,
          closed_at, exit_price, realized_pnl_usd, floating_pnl_usd, realized_r,
          mfe_price, mae_price, mfe_r, mae_r, bars_held, balance_before, balance_after,
          resolution_method, last_evaluated_time, reasons_json, confluence_json, events_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, NULL, NULL, 0,
          NULL, NULL, 0, 0, 0,
          ?, ?, 0, 0, 0, ?, ?,
          NULL, ?, ?, ?, ?
        )
      `).run(
        tradeId,
        uid,
        signalIdClean || null,
        canonical,
        canonicalTf,
        String(params.market || spec.assetType),
        String(params.strategyId || 'manual'),
        String(params.strategyLabel || params.comment || 'TRAXO Engine'),
        String(params.tier || 'STANDARD'),
        actionUpper,
        orderEntryType,
        exitMode,
        status,
        requestedEntry,
        fillPrice,
        slPrice,
        slPrice,
        tp1Price,
        tp2Price,
        volume,
        volume,
        riskAmountUsd,
        plannedRr,
        Number(params.confidence ?? 75),
        quote.spreadPips ?? 0,
        createdAt,
        filledAt,
        fillPrice ?? requestedEntry,
        fillPrice ?? requestedEntry,
        account.balance,
        account.balance,
        createdAt,
        JSON.stringify(params.reasons || []),
        params.confluence ? JSON.stringify(params.confluence) : null,
        JSON.stringify(initialEvents)
      );

      const nowTs = Date.now();
      this.recentOrderTimestamps.set(earlyLockKey, nowTs);
      if (this.recentOrderTimestamps.size > 200) {
        for (const [k, ts] of this.recentOrderTimestamps.entries()) {
          if (nowTs - ts > 30_000) {
            this.recentOrderTimestamps.delete(k);
          }
        }
      }

      const updatedAcc = this.recalculateAccountMetrics(uid);
      this.broadcastAccountUpdate(updatedAcc);
      schedulePaperCloudBackup(uid);
      const saved = this.getTradeById(tradeId);
      if (saved) {
        broadcast({ type: 'PAPER_TRADE_UPDATED', payload: saved });
        void syncPaperTradeToJournal(saved).catch(() => {});
      }

      return {
        success: true,
        entryType: compatEntryType,
        symbol: canonical,
        brokerSymbol: spec.exnessSymbol,
        volume,
        price: fillPrice ?? requestedEntry,
        sl: slPrice,
        tp: tp1Price,
        tp2: tp2Price ?? undefined,
        exitMode,
        tradeId,
        result: {
          orderId: tradeId,
          positionId: tradeId,
          mode: 'paper',
          exitMode,
        },
      };
    } finally {
      this.inFlightOrderKeys.delete(earlyLockKey);
    }
  }

  getTradeById(tradeId: string): PaperTradeRecord | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM paper_trades WHERE id = ?').get(tradeId);
    return row ? mapTradeRowToRecord(row) : null;
  }

  async getOpenPositions(uid = DEFAULT_UID): Promise<any[]> {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM paper_trades WHERE uid = ? AND status IN ('OPEN', 'PARTIAL_TP1') ORDER BY created_at DESC`)
      .all(uid);

    const results: any[] = [];
    for (const r of rows) {
      const t = mapTradeRowToRecord(r);
      const quote = await this.getSymbolQuote(t.symbol);
      const currentPrice =
        t.direction === 'BUY'
          ? quote.bid ?? t.fillPrice ?? t.requestedEntry
          : quote.ask ?? t.fillPrice ?? t.requestedEntry;
      const profit =
        quote.ok && currentPrice
          ? computeDollarPnl({
              symbol: t.symbol,
              direction: t.direction,
              entryPrice: t.fillPrice ?? t.requestedEntry,
              exitPrice: currentPrice,
              volume: t.openVolume,
            })
          : t.floatingPnlUsd;

      results.push({
        id: t.id,
        symbol: t.symbol,
        type: t.direction === 'BUY' ? 'POSITION_TYPE_BUY' : 'POSITION_TYPE_SELL',
        direction: t.direction,
        volume: t.openVolume,
        initialVolume: t.initialVolume,
        openPrice: t.fillPrice ?? t.requestedEntry,
        currentPrice,
        sl: t.currentSl,
        tp: t.status === 'PARTIAL_TP1' && t.tp2Price ? t.tp2Price : t.tp1Price,
        tp1: t.tp1Price,
        tp2: t.tp2Price,
        exitMode: t.exitMode,
        status: t.status,
        strategyId: t.strategyId,
        strategyLabel: t.strategyLabel,
        profit,
        swap: 0,
        comment: `${t.strategyLabel} (${t.exitMode})`,
        time: new Date((t.filledAt ?? t.createdAt) * 1000).toISOString(),
      });
    }
    return results;
  }

  async getOpenOrders(uid = DEFAULT_UID): Promise<any[]> {
    const db = getDb();
    const rows = db
      .prepare(`SELECT * FROM paper_trades WHERE uid = ? AND status = 'PENDING' ORDER BY created_at DESC`)
      .all(uid);

    return rows.map((r: any) => {
      const t = mapTradeRowToRecord(r);
      return {
        id: t.id,
        symbol: t.symbol,
        type: `ORDER_TYPE_${t.direction}_${t.entryType}`,
        volume: t.initialVolume,
        openPrice: t.requestedEntry,
        currentPrice: t.requestedEntry,
        sl: t.slPrice,
        tp: t.tp1Price,
        tp2: t.tp2Price,
        exitMode: t.exitMode,
        state: t.status,
        comment: t.strategyLabel,
        time: new Date(t.createdAt * 1000).toISOString(),
      };
    });
  }

  async closePosition(
    positionId: string,
    exitPriceOverride?: number
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const db = getDb();
    const existing = this.getTradeById(positionId);
    if (!existing) {
      return { success: false, error: `Paper trade '${positionId}' not found` };
    }
    if (isTerminalPaperStatus(existing.status)) {
      return { success: false, error: `Paper trade '${positionId}' is already closed (${existing.status})` };
    }
    if (existing.status === 'PENDING') {
      return this.cancelOrder(positionId);
    }

    const quote = await this.getSymbolQuote(existing.symbol);
    const exitPrice =
      exitPriceOverride ??
      (existing.direction === 'BUY'
        ? quote.bid ?? existing.fillPrice ?? existing.requestedEntry
        : quote.ask ?? existing.fillPrice ?? existing.requestedEntry);

    const fill = existing.fillPrice ?? existing.requestedEntry;
    const legPnl = computeDollarPnl({
      symbol: existing.symbol,
      direction: existing.direction,
      entryPrice: fill,
      exitPrice,
      volume: existing.openVolume,
    });

    const totalPnl = Number((existing.tp1PnlUsd + legPnl).toFixed(2));
    const realizedR =
      existing.riskAmountUsd > 0 ? Number((totalPnl / existing.riskAmountUsd).toFixed(2)) : 0;
    const nowSec = Math.floor(Date.now() / 1000);

    const acc = await this.ensureAccount(existing.uid);
    const newBalance = Number((acc.balance + legPnl).toFixed(2));
    db.prepare('UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE uid = ?').run(
      newBalance,
      Date.now(),
      existing.uid
    );

    const updatedEvents = [
      ...existing.events,
      {
        type: 'EXIT' as const,
        time: nowSec,
        price: exitPrice,
        pnlUsd: legPnl,
        note: `Manually closed @ ${exitPrice} (${legPnl >= 0 ? '+' : ''}$${legPnl.toFixed(2)})`,
      },
    ];

    db.prepare(`
      UPDATE paper_trades
      SET status = 'CLOSED_MANUAL', open_volume = 0, closed_at = ?, exit_price = ?,
          realized_pnl_usd = ?, floating_pnl_usd = 0, realized_r = ?,
          balance_after = ?, resolution_method = 'manual', events_json = ?
      WHERE id = ?
    `).run(
      nowSec,
      exitPrice,
      totalPnl,
      realizedR,
      newBalance,
      JSON.stringify(updatedEvents),
      existing.id
    );

    const updatedAcc = this.recalculateAccountMetrics(existing.uid);
    this.broadcastAccountUpdate(updatedAcc);
    schedulePaperCloudBackup(existing.uid);
    const updated = this.getTradeById(existing.id);
    if (updated) {
      buildAndSaveTradeReplaySnapshot(updated);
      broadcast({ type: 'PAPER_TRADE_UPDATED', payload: updated });
      void syncPaperTradeToJournal(updated).catch(() => {});
    }
    return { success: true, result: updated };
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; result?: any; error?: string }> {
    const db = getDb();
    const existing = this.getTradeById(orderId);
    if (!existing) {
      return { success: false, error: `Paper order '${orderId}' not found` };
    }
    if (existing.status !== 'PENDING') {
      return { success: false, error: `Order '${orderId}' is not pending (${existing.status})` };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const events = [
      ...existing.events,
      {
        type: 'CANCELLED' as const,
        time: nowSec,
        price: existing.requestedEntry,
        note: 'Pending order cancelled by user/system',
      },
    ];
    db.prepare(`
      UPDATE paper_trades
      SET status = 'CANCELLED', open_volume = 0, closed_at = ?, events_json = ?
      WHERE id = ?
    `).run(nowSec, JSON.stringify(events), existing.id);

    const updatedAcc = this.recalculateAccountMetrics(existing.uid);
    this.broadcastAccountUpdate(updatedAcc);
    schedulePaperCloudBackup(existing.uid);
    const updated = this.getTradeById(existing.id);
    if (updated) {
      broadcast({ type: 'PAPER_TRADE_UPDATED', payload: updated });
    }
    return { success: true, result: updated };
  }

  getAllTrades(uid = DEFAULT_UID, statusFilter?: string, limit = 200): PaperTradeRecord[] {
    const db = getDb();
    const args: Array<string | number> = [uid];
    let filterSql = '';
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'ACTIVE') {
        filterSql = ` AND status IN ('PENDING', 'OPEN', 'PARTIAL_TP1')`;
      } else if (statusFilter === 'WINS') {
        filterSql = ` AND status IN ('WIN_TP1', 'WIN_TP2', 'WIN_TP1_BE')`;
      } else if (statusFilter === 'LOSSES') {
        filterSql = ` AND status = 'LOSS_SL'`;
      } else {
        filterSql = ` AND status = ?`;
        args.push(statusFilter);
      }
    }
    args.push(Math.min(1000, Math.max(1, limit)));

    const rows = db
      .prepare(`SELECT * FROM paper_trades WHERE uid = ?${filterSql} ORDER BY created_at DESC LIMIT ?`)
      .all(...args);
    return rows.map(mapTradeRowToRecord);
  }

  getClosedTrades(uid = DEFAULT_UID, limit = 100): PaperTradeRecord[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM paper_trades
         WHERE uid = ? AND status IN ('WIN_TP1', 'WIN_TP2', 'WIN_TP1_BE', 'LOSS_SL', 'CLOSED_MANUAL', 'EXPIRED', 'CANCELLED')
         ORDER BY COALESCE(closed_at, created_at) DESC LIMIT ?`
      )
      .all(uid, Math.min(1000, Math.max(1, limit)));
    return rows.map(mapTradeRowToRecord);
  }

  getTradeReplay(tradeId: string): TradeReplaySnapshot | null {
    const trade = this.getTradeById(tradeId);
    if (!trade) return null;

    const db = getDb();
    const snapRow = db.prepare('SELECT * FROM trade_replay_snapshots WHERE trade_id = ?').get(tradeId);

    // If snapshot doesn't exist yet OR we haven't collected 20 post-exit bars yet, rebuild from SQLite archive
    if (!snapRow || Number(snapRow.post_exit_bars) < 20) {
      const rebuilt = buildAndSaveTradeReplaySnapshot(trade);
      return { ...rebuilt, trade };
    }

    return {
      tradeId: String(snapRow.trade_id),
      symbol: String(snapRow.symbol),
      timeframe: String(snapRow.timeframe),
      preEntryBars: Number(snapRow.pre_entry_bars),
      tradeBars: Number(snapRow.trade_bars),
      postExitBars: Number(snapRow.post_exit_bars),
      candles: JSON.parse(snapRow.candles_json),
      markers: JSON.parse(snapRow.markers_json),
      priceLines: JSON.parse(snapRow.price_lines_json),
      createdAt: Number(snapRow.created_at),
      trade,
    };
  }

  /**
   * Deterministic Multi-Bar Resolution:
   * Queries all chronological archived candles since each trade's `lastEvaluatedTime`
   * up to `latestCandle` (or evaluates `[latestCandle]` if SQLite has none yet),
   * verifying pending fills, dynamic TP1 scale-outs -> Breakeven, TP2/SL hits, and 1m tie-breaks.
   */
  async resolveSymbolOnCandle(
    symbol: string,
    timeframe: string,
    latestCandle?: MarketCandle,
    subCandles1m?: MarketCandle[]
  ): Promise<{
    updatedTrades: PaperTradeRecord[];
    newlyClosedTrades: PaperTradeRecord[];
    tp1ScaledTrades: PaperTradeRecord[];
  }> {
    const db = getDb();
    const canonicalSym = normalizeSymbol(symbol);
    const canonicalTf = normalizeCanonicalTimeframe(timeframe);

    const isSubTfTick = canonicalTf === '1m' || canonicalTf === '5m';
    const activeRows = isSubTfTick
      ? db
          .prepare(
            `SELECT * FROM paper_trades
             WHERE symbol = ? AND status IN ('PENDING', 'OPEN', 'PARTIAL_TP1')
             ORDER BY created_at ASC`
          )
          .all(canonicalSym)
      : db
          .prepare(
            `SELECT * FROM paper_trades
             WHERE symbol = ? AND timeframe = ? AND status IN ('PENDING', 'OPEN', 'PARTIAL_TP1')
             ORDER BY created_at ASC`
          )
          .all(canonicalSym, canonicalTf);

    if (!activeRows.length) {
      return { updatedTrades: [], newlyClosedTrades: [], tp1ScaledTrades: [] };
    }

    const updatedTrades: PaperTradeRecord[] = [];
    const newlyClosedTrades: PaperTradeRecord[] = [];
    const tp1ScaledTrades: PaperTradeRecord[] = [];
    const touchedUids = new Set<string>();

    for (const row of activeRows) {
      const trade = mapTradeRowToRecord(row);
      const tradeTf = normalizeCanonicalTimeframe(trade.timeframe);
      const isIntrabar = tradeTf !== canonicalTf;
      const evalTf = isIntrabar ? canonicalTf : tradeTf;
      const fromTime = (trade.lastEvaluatedTime ?? trade.createdAt) + 1;
      const toTime = latestCandle?.time;

      let bars = queryCandles({
        symbol: trade.symbol,
        timeframe: evalTf,
        fromTime,
        toTime,
      });

      if (latestCandle && !bars.some((b) => b.time === latestCandle.time)) {
        if (latestCandle.time >= fromTime) {
          bars = [...bars, latestCandle].sort((a, b) => a.time - b.time);
        }
      }

      if (!bars.length) continue;

      let tradeChanged = false;
      let hitTp1OnRun = false;
      let closedOnRun = false;

      for (const bar of bars) {
        const res = evaluateTradeOnBar(
          trade,
          bar,
          isIntrabar ? undefined : subCandles1m,
          { isIntrabarSubCandle: isIntrabar }
        );
        tradeChanged = true;

        if (res.realizedDeltaUsd !== 0) {
          const acc = await this.ensureAccount(trade.uid);
          const nextBal = Number((acc.balance + res.realizedDeltaUsd).toFixed(2));
          db.prepare('UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE uid = ?').run(
            nextBal,
            Date.now(),
            trade.uid
          );
          trade.balanceAfter = nextBal;
        }

        if (res.tp1Scaled) hitTp1OnRun = true;
        if (res.closed) {
          closedOnRun = true;
          break;
        }
      }

      if (!tradeChanged) continue;

      if (
        (closedOnRun && trade.balanceAfter === null) ||
        (!closedOnRun && (trade.status === 'OPEN' || trade.status === 'PARTIAL_TP1'))
      ) {
        const currentAcc = await this.ensureAccount(trade.uid);
        trade.balanceAfter = Number(currentAcc.balance.toFixed(2));
      }

      db.prepare(`
        UPDATE paper_trades
        SET status = ?, fill_price = ?, current_sl = ?, open_volume = ?,
            filled_at = ?, tp1_hit_at = ?, tp1_fill_price = ?, tp1_pnl_usd = ?,
            closed_at = ?, exit_price = ?, realized_pnl_usd = ?, floating_pnl_usd = ?,
            realized_r = ?, mfe_price = ?, mae_price = ?, mfe_r = ?, mae_r = ?,
            bars_held = ?, balance_after = ?, resolution_method = ?,
            last_evaluated_time = ?, events_json = ?
        WHERE id = ?
      `).run(
        trade.status,
        trade.fillPrice,
        trade.currentSl,
        trade.openVolume,
        trade.filledAt,
        trade.tp1HitAt,
        trade.tp1FillPrice,
        trade.tp1PnlUsd,
        trade.closedAt,
        trade.exitPrice,
        trade.realizedPnlUsd,
        trade.floatingPnlUsd,
        trade.realizedR,
        trade.mfePrice,
        trade.maePrice,
        trade.mfeR,
        trade.maeR,
        trade.barsHeld,
        trade.balanceAfter,
        trade.resolutionMethod,
        trade.lastEvaluatedTime,
        JSON.stringify(trade.events),
        trade.id
      );

      touchedUids.add(trade.uid);
      updatedTrades.push(trade);
      if (hitTp1OnRun) tp1ScaledTrades.push(trade);
      if (closedOnRun) {
        buildAndSaveTradeReplaySnapshot(trade);
        newlyClosedTrades.push(trade);
      }

      broadcast({ type: 'PAPER_TRADE_UPDATED', payload: trade });
      void syncPaperTradeToJournal(trade).catch(() => {});
    }

    for (const uid of touchedUids) {
      const updatedAcc = this.recalculateAccountMetrics(uid);
      this.broadcastAccountUpdate(updatedAcc);
      schedulePaperCloudBackup(uid);
    }

    return { updatedTrades, newlyClosedTrades, tp1ScaledTrades };
  }

  getPerformanceSummary(uid = DEFAULT_UID): {
    account: PaperAccountRecord;
    totalTrades: number;
    openCount: number;
    pendingCount: number;
    wins: number;
    winTp2Count: number;
    winTp1Count: number;
    winTp1BeCount: number;
    losses: number;
    expiredCount: number;
    winRate: number;
    profitFactor: string;
    netRealizedUsd: number;
    netReturnPct: number;
  } {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM paper_trades WHERE uid = ?').all(uid);
    const trades = rows.map(mapTradeRowToRecord);

    let openCount = 0;
    let pendingCount = 0;
    let wins = 0;
    let winTp2Count = 0;
    let winTp1Count = 0;
    let winTp1BeCount = 0;
    let losses = 0;
    let expiredCount = 0;
    let grossWin = 0;
    let grossLoss = 0;

    for (const t of trades) {
      if (t.status === 'PENDING') pendingCount += 1;
      else if (t.status === 'OPEN' || t.status === 'PARTIAL_TP1') openCount += 1;
      else if (t.status === 'EXPIRED' || t.status === 'CANCELLED') expiredCount += 1;
      else if (isWinningPaperStatus(t.status)) {
        wins += 1;
        if (t.status === 'WIN_TP2') winTp2Count += 1;
        else if (t.status === 'WIN_TP1') winTp1Count += 1;
        else if (t.status === 'WIN_TP1_BE') winTp1BeCount += 1;
        if (t.realizedPnlUsd > 0) grossWin += t.realizedPnlUsd;
        else grossLoss += Math.abs(t.realizedPnlUsd);
      } else if (t.status === 'LOSS_SL') {
        losses += 1;
        grossLoss += Math.abs(t.realizedPnlUsd);
      } else if (t.status === 'CLOSED_MANUAL') {
        if (t.realizedPnlUsd > 0) {
          wins += 1;
          grossWin += t.realizedPnlUsd;
        } else if (t.realizedPnlUsd < 0) {
          losses += 1;
          grossLoss += Math.abs(t.realizedPnlUsd);
        }
      }
    }

    const decided = wins + losses;
    const winRate = decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : 0;
    const profitFactor =
      grossLoss > 0
        ? (grossWin / grossLoss).toFixed(2)
        : grossWin > 0
        ? 'INF'
        : '0.00';

    const account = this.recalculateAccountMetrics(uid);
    const netRealizedUsd = account.realizedPnl;
    const netReturnPct =
      account.startingBalance > 0
        ? Number(((netRealizedUsd / account.startingBalance) * 100).toFixed(2))
        : 0;

    return {
      account,
      totalTrades: trades.length,
      openCount,
      pendingCount,
      wins,
      winTp2Count,
      winTp1Count,
      winTp1BeCount,
      losses,
      expiredCount,
      winRate,
      profitFactor,
      netRealizedUsd,
      netReturnPct,
    };
  }
}

export const paperBrokerService = new PaperBrokerService();
