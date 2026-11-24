import fs from 'fs';
import path from 'path';
import { normalizeSymbol } from '../../config/instruments';
import type { MarketCandle } from '../market-data/marketDataService';

const SERVER_ROOT = fs.existsSync(path.resolve(__dirname, '../../../package.json'))
  ? path.resolve(__dirname, '../../..')
  : path.resolve(__dirname, '../../../..');
const DEFAULT_DB_PATH = path.resolve(SERVER_ROOT, 'data/traxo_market.db');

let dbInstance: any = null;
let currentDbPath: string | null = null;

export function normalizeCanonicalTimeframe(tf: string): string {
  const lower = String(tf || '15m').trim().toLowerCase();
  if (lower === '1min' || lower === '1m') return '1m';
  if (lower === '5min' || lower === '5m') return '5m';
  if (lower === '15min' || lower === '15m') return '15m';
  if (lower === '30min' || lower === '30m') return '30m';
  if (lower === '1h' || lower === '60m' || lower === '60min') return '1H';
  if (lower === '4h' || lower === '240m' || lower === '240min') return '4H';
  if (lower === '1day' || lower === '1d' || lower === 'd') return '1D';
  if (lower === '1week' || lower === '1w') return '1W';
  return tf.trim();
}

export function timeframeToSeconds(tf: string): number {
  const canonical = normalizeCanonicalTimeframe(tf);
  if (canonical === '1m') return 60;
  if (canonical === '5m') return 5 * 60;
  if (canonical === '15m') return 15 * 60;
  if (canonical === '30m') return 30 * 60;
  if (canonical === '1H') return 60 * 60;
  if (canonical === '4H') return 4 * 60 * 60;
  if (canonical === '1D') return 24 * 60 * 60;
  if (canonical === '1W') return 7 * 24 * 60 * 60;
  return 15 * 60;
}

function getConfiguredDbPath(): string {
  return process.env.TRAXO_SQLITE_PATH?.trim() || DEFAULT_DB_PATH;
}

function initSchema(db: any, dbPath: string): void {
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (symbol, timeframe, time)
    );
    CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, timeframe, time DESC);

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_paper_settings (
      uid TEXT PRIMARY KEY,
      auto_trade_enabled INTEGER NOT NULL DEFAULT 0,
      guardrails_enabled INTEGER NOT NULL DEFAULT 1,
      risk_mode TEXT NOT NULL DEFAULT 'fixedAmount',
      fixed_risk_amount REAL NOT NULL DEFAULT 50,
      risk_per_trade_pct REAL NOT NULL DEFAULT 0.5,
      max_daily_loss_pct REAL NOT NULL DEFAULT 4.0,
      max_consecutive_loss_cap INTEGER NOT NULL DEFAULT 3,
      min_confidence REAL NOT NULL DEFAULT 60,
      min_rr REAL NOT NULL DEFAULT 1.8,
      max_positions INTEGER NOT NULL DEFAULT 5,
      spread_cap_pips REAL NOT NULL DEFAULT 3.5,
      session_filter TEXT NOT NULL DEFAULT 'all',
      correlation_shield INTEGER NOT NULL DEFAULT 1,
      news_filter INTEGER NOT NULL DEFAULT 1,
      cooldown_on_loss INTEGER NOT NULL DEFAULT 1,
      allowed_categories_json TEXT NOT NULL DEFAULT '["forex","metals","indices"]',
      account_balance REAL NOT NULL DEFAULT 10000,
      auto_sync_broker_balance INTEGER NOT NULL DEFAULT 1,
      daily_loss_usd REAL NOT NULL DEFAULT 0,
      daily_loss_date TEXT NOT NULL DEFAULT '',
      consecutive_losses INTEGER NOT NULL DEFAULT 0,
      cooldown_until INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_paper_settings_autotrade ON user_paper_settings(auto_trade_enabled);

    CREATE TABLE IF NOT EXISTS paper_accounts (
      uid TEXT PRIMARY KEY,
      starting_balance REAL NOT NULL DEFAULT 10000,
      balance REAL NOT NULL DEFAULT 10000,
      equity REAL NOT NULL DEFAULT 10000,
      used_margin REAL NOT NULL DEFAULT 0,
      free_margin REAL NOT NULL DEFAULT 10000,
      floating_pnl REAL NOT NULL DEFAULT 0,
      realized_pnl REAL NOT NULL DEFAULT 0,
      peak_equity REAL NOT NULL DEFAULT 10000,
      max_drawdown_pct REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      leverage INTEGER NOT NULL DEFAULT 100,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paper_trades (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      signal_id TEXT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      market TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      strategy_label TEXT NOT NULL,
      tier TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      exit_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_entry REAL NOT NULL,
      fill_price REAL,
      sl_price REAL NOT NULL,
      current_sl REAL NOT NULL,
      tp1_price REAL NOT NULL,
      tp2_price REAL,
      initial_volume REAL NOT NULL,
      open_volume REAL NOT NULL,
      risk_amount_usd REAL NOT NULL,
      planned_rr REAL NOT NULL,
      confidence REAL NOT NULL,
      spread_pips_at_entry REAL,
      created_at INTEGER NOT NULL,
      filled_at INTEGER,
      tp1_hit_at INTEGER,
      tp1_fill_price REAL,
      tp1_pnl_usd REAL NOT NULL DEFAULT 0,
      closed_at INTEGER,
      exit_price REAL,
      realized_pnl_usd REAL NOT NULL DEFAULT 0,
      floating_pnl_usd REAL NOT NULL DEFAULT 0,
      realized_r REAL NOT NULL DEFAULT 0,
      mfe_price REAL,
      mae_price REAL,
      mfe_r REAL NOT NULL DEFAULT 0,
      mae_r REAL NOT NULL DEFAULT 0,
      bars_held INTEGER NOT NULL DEFAULT 0,
      balance_before REAL,
      balance_after REAL,
      resolution_method TEXT,
      last_evaluated_time INTEGER,
      reasons_json TEXT,
      confluence_json TEXT,
      events_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_paper_trades_uid_status ON paper_trades(uid, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_trades_symbol_tf ON paper_trades(symbol, timeframe, status);

    CREATE TABLE IF NOT EXISTS trade_replay_snapshots (
      trade_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      pre_entry_bars INTEGER NOT NULL,
      trade_bars INTEGER NOT NULL,
      post_exit_bars INTEGER NOT NULL,
      candles_json TEXT NOT NULL,
      markers_json TEXT NOT NULL,
      price_lines_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      canonical_key TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      strategy_label TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'market',
      entry REAL NOT NULL,
      sl REAL NOT NULL,
      tp REAL NOT NULL,
      tp2 REAL,
      rr REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      risk TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'live',
      reason_json TEXT,
      time INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      exit_price REAL
    );
    CREATE INDEX IF NOT EXISTS idx_signals_status_sym_tf ON signals(status, symbol, timeframe);
    CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_canonical ON signals(canonical_key);
  `);

  const migrationRow = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'paper_v2_migrated'")
    .get();
  if (migrationRow?.value !== '1') {
    db.exec(`
      DELETE FROM trade_replay_snapshots;
      DELETE FROM paper_trades;
      DELETE FROM paper_accounts;
      INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('paper_v2_migrated', '1');
    `);
  }
}

export function getDb(): any {
  const targetPath = getConfiguredDbPath();
  if (dbInstance && currentDbPath === targetPath) {
    return dbInstance;
  }

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }

  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  // Node 22.5+ / Node 24 built-in synchronous SQLite engine (zero native build step)
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string) => any };
  const db = new DatabaseSync(targetPath);
  initSchema(db, targetPath);

  dbInstance = db;
  currentDbPath = targetPath;
  return db;
}

export function resetDbForTests(customPath?: string): any {
  if (customPath !== undefined) {
    process.env.TRAXO_SQLITE_PATH = customPath;
  }
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
  currentDbPath = null;
  return getDb();
}

function normalizeCandleTimeSec(c: MarketCandle): number {
  if (typeof c.time === 'number' && Number.isFinite(c.time) && c.time > 0) {
    return c.time > 1e12 ? Math.floor(c.time / 1000) : Math.floor(c.time);
  }
  const parsed = Date.parse(c.timestamp || '');
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

export function upsertCandles(symbol: string, timeframe: string, candles: MarketCandle[]): number {
  if (!Array.isArray(candles) || candles.length === 0) return 0;

  const db = getDb();
  const canonicalSym = normalizeSymbol(symbol);
  const canonicalTf = normalizeCanonicalTimeframe(timeframe);

  const stmt = db.prepare(`
    INSERT INTO candles (symbol, timeframe, time, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, timeframe, time) DO UPDATE SET
      timestamp = excluded.timestamp,
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `);

  let count = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const c of candles) {
      if (
        c == null ||
        !Number.isFinite(Number(c.open)) ||
        !Number.isFinite(Number(c.high)) ||
        !Number.isFinite(Number(c.low)) ||
        !Number.isFinite(Number(c.close))
      ) {
        continue;
      }
      const timeSec = normalizeCandleTimeSec(c);
      const iso = c.timestamp ? String(c.timestamp) : new Date(timeSec * 1000).toISOString();
      stmt.run(
        canonicalSym,
        canonicalTf,
        timeSec,
        iso,
        Number(c.open),
        Number(c.high),
        Number(c.low),
        Number(c.close),
        Number.isFinite(Number(c.volume)) ? Number(c.volume) : 0
      );
      count += 1;
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }

  return count;
}

export interface QueryCandlesParams {
  symbol: string;
  timeframe: string;
  fromTime?: number;
  toTime?: number;
  limit?: number;
}

export function queryCandles(params: QueryCandlesParams): MarketCandle[] {
  const db = getDb();
  const canonicalSym = normalizeSymbol(params.symbol);
  const canonicalTf = normalizeCanonicalTimeframe(params.timeframe);

  const conditions: string[] = ['symbol = ?', 'timeframe = ?'];
  const args: Array<string | number> = [canonicalSym, canonicalTf];

  if (typeof params.fromTime === 'number' && Number.isFinite(params.fromTime)) {
    conditions.push('time >= ?');
    args.push(Math.floor(params.fromTime));
  }
  if (typeof params.toTime === 'number' && Number.isFinite(params.toTime)) {
    conditions.push('time <= ?');
    args.push(Math.floor(params.toTime));
  }

  const whereClause = conditions.join(' AND ');
  const limit = params.limit && params.limit > 0 ? Math.min(5000, Math.floor(params.limit)) : null;

  let rows: any[];
  if (limit !== null && params.fromTime === undefined) {
    // Take most recent N bars then sort chronologically ASC
    const sql = `
      SELECT * FROM (
        SELECT time, timestamp, open, high, low, close, volume
        FROM candles
        WHERE ${whereClause}
        ORDER BY time DESC
        LIMIT ?
      ) sub
      ORDER BY time ASC
    `;
    rows = db.prepare(sql).all(...args, limit);
  } else {
    const limitClause = limit !== null ? 'LIMIT ?' : '';
    const sql = `
      SELECT time, timestamp, open, high, low, close, volume
      FROM candles
      WHERE ${whereClause}
      ORDER BY time ASC
      ${limitClause}
    `;
    rows = limit !== null ? db.prepare(sql).all(...args, limit) : db.prepare(sql).all(...args);
  }

  return rows.map((r) => ({
    time: Number(r.time),
    timestamp: String(r.timestamp),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume ?? 0),
  }));
}

export function getLatestArchivedCandle(symbol: string, timeframe?: string): MarketCandle | null {
  const db = getDb();
  const canonicalSym = normalizeSymbol(symbol);

  let row: any;
  if (timeframe) {
    const canonicalTf = normalizeCanonicalTimeframe(timeframe);
    row = db
      .prepare(
        `SELECT time, timestamp, open, high, low, close, volume
         FROM candles
         WHERE symbol = ? AND timeframe = ?
         ORDER BY time DESC LIMIT 1`
      )
      .get(canonicalSym, canonicalTf);
  }

  if (!row) {
    row = db
      .prepare(
        `SELECT time, timestamp, open, high, low, close, volume
         FROM candles
         WHERE symbol = ?
         ORDER BY time DESC LIMIT 1`
      )
      .get(canonicalSym);
  }

  if (!row) return null;
  return {
    time: Number(row.time),
    timestamp: String(row.timestamp),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0),
  };
}

export function getCandlesAroundWindow(
  symbol: string,
  timeframe: string,
  entryTimeSec: number,
  exitTimeSec: number,
  preBars = 60,
  postBars = 20
): { candles: MarketCandle[]; preCount: number; tradeCount: number; postCount: number } {
  const db = getDb();
  const canonicalSym = normalizeSymbol(symbol);
  const canonicalTf = normalizeCanonicalTimeframe(timeframe);

  const preRows = db
    .prepare(
      `SELECT time, timestamp, open, high, low, close, volume
       FROM candles
       WHERE symbol = ? AND timeframe = ? AND time < ?
       ORDER BY time DESC
       LIMIT ?`
    )
    .all(canonicalSym, canonicalTf, entryTimeSec, preBars)
    .reverse();

  const tradeRows = db
    .prepare(
      `SELECT time, timestamp, open, high, low, close, volume
       FROM candles
       WHERE symbol = ? AND timeframe = ? AND time >= ? AND time <= ?
       ORDER BY time ASC`
    )
    .all(canonicalSym, canonicalTf, entryTimeSec, exitTimeSec);

  const postRows = db
    .prepare(
      `SELECT time, timestamp, open, high, low, close, volume
       FROM candles
       WHERE symbol = ? AND timeframe = ? AND time > ?
       ORDER BY time ASC
       LIMIT ?`
    )
    .all(canonicalSym, canonicalTf, exitTimeSec, postBars);

  const mapRow = (r: any): MarketCandle => ({
    time: Number(r.time),
    timestamp: String(r.timestamp),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume ?? 0),
  });

  const mergedMap = new Map<number, MarketCandle>();
  for (const r of [...preRows, ...tradeRows, ...postRows]) {
    const c = mapRow(r);
    mergedMap.set(c.time, c);
  }

  return {
    candles: Array.from(mergedMap.values()).sort((a, b) => a.time - b.time),
    preCount: preRows.length,
    tradeCount: tradeRows.length,
    postCount: postRows.length,
  };
}

export interface ArchivedSignalRecord {
  id: string;
  canonicalKey: string;
  symbol: string;
  timeframe: string;
  strategyId: string;
  strategyLabel: string;
  direction: 'BUY' | 'SELL';
  entryType: string;
  entry: number;
  sl: number;
  tp: number;
  tp2: number | null;
  rr: number;
  confidence: number;
  risk: string;
  status: string;
  reason: string[];
  time: number;
  createdAt: number;
  resolvedAt: number | null;
  exitPrice: number | null;
}

function normalizeSignalStatus(status: unknown): 'WIN' | 'LOSS' | 'EXPIRED' | 'live' {
  const upper = String(status || 'live').trim().toUpperCase();
  if (upper === 'WIN' || upper === 'WIN_TP1' || upper === 'WIN_TP2' || upper === 'WIN_TP1_BE') {
    return 'WIN';
  }
  if (upper === 'LOSS' || upper === 'LOSS_SL') {
    return 'LOSS';
  }
  if (upper === 'EXPIRED' || upper === 'CANCELLED') {
    return 'EXPIRED';
  }
  return 'live';
}

function signalStatusRank(status: string): number {
  const norm = normalizeSignalStatus(status);
  if (norm === 'WIN' || norm === 'LOSS') return 4;
  if (norm === 'EXPIRED') return 3;
  return 1;
}

function normalizeEpochSeconds(val: unknown, fallbackSec: number): number {
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : fallbackSec;
  }
  if (val && typeof val === 'object') {
    const anyVal = val as Record<string, unknown>;
    if (typeof anyVal.toMillis === 'function') {
      const ms = Number(anyVal.toMillis());
      if (Number.isFinite(ms) && ms > 0) return Math.floor(ms / 1000);
    }
    const sec = anyVal._seconds ?? anyVal.seconds;
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
      return Math.floor(sec);
    }
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return val > 1e12 ? Math.floor(val / 1000) : Math.floor(val);
  }
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val.trim());
    if (Number.isFinite(num) && num > 0) {
      return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
    }
    const parsed = Date.parse(val.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed / 1000);
    }
  }
  return fallbackSec;
}

function normalizeEpochMs(val: unknown, fallbackMs: number): number {
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? Math.floor(ms) : fallbackMs;
  }
  if (val && typeof val === 'object') {
    const anyVal = val as Record<string, unknown>;
    if (typeof anyVal.toMillis === 'function') {
      const ms = Number(anyVal.toMillis());
      if (Number.isFinite(ms) && ms > 0) return Math.floor(ms);
    }
    const sec = anyVal._seconds ?? anyVal.seconds;
    const ns = Number(anyVal._nanoseconds ?? anyVal.nanoseconds ?? 0);
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
      return Math.floor(sec * 1000 + (Number.isFinite(ns) ? ns / 1e6 : 0));
    }
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return val <= 1e12 ? Math.floor(val * 1000) : Math.floor(val);
  }
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val.trim());
    if (Number.isFinite(num) && num > 0) {
      return num <= 1e12 ? Math.floor(num * 1000) : Math.floor(num);
    }
    const parsed = Date.parse(val.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallbackMs;
}

function parseReasonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item) => item != null).map((item) => String(item));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item != null).map((item) => String(item));
      }
    } catch {}
    return [raw.trim()];
  }
  return [];
}

function mapSignalRowToRecord(row: any): ArchivedSignalRecord {
  return {
    id: String(row.id),
    canonicalKey: String(row.canonical_key),
    symbol: String(row.symbol),
    timeframe: String(row.timeframe),
    strategyId: String(row.strategy_id),
    strategyLabel: String(row.strategy_label),
    direction: row.direction === 'SELL' ? 'SELL' : 'BUY',
    entryType: String(row.entry_type || 'market'),
    entry: Number(row.entry),
    sl: Number(row.sl),
    tp: Number(row.tp),
    tp2: row.tp2 !== null && row.tp2 !== undefined ? Number(row.tp2) : null,
    rr: Number(row.rr ?? 0),
    confidence: Number(row.confidence ?? 0),
    risk: String(row.risk || 'Medium'),
    status: String(row.status || 'live'),
    reason: parseReasonArray(row.reason_json),
    time: Number(row.time),
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at !== null && row.resolved_at !== undefined ? Number(row.resolved_at) : null,
    exitPrice: row.exit_price !== null && row.exit_price !== undefined ? Number(row.exit_price) : null,
  };
}

export function buildCanonicalSignalKey(input: {
  id?: string;
  strategyId?: string;
  symbol?: string;
  timeframe?: string;
  direction?: string;
  time?: number;
}): string {
  const rawId = typeof input.id === 'string' ? input.id.trim() : '';
  const parts = rawId.startsWith('sig:') ? rawId.split(':') : [];
  const rawStrategy = input.strategyId || parts[1] || '';
  const rawSymbol = input.symbol || parts[2] || '';
  const rawTimeframe = input.timeframe || parts[3] || '';
  const rawDirection = input.direction || parts[4] || '';
  const rawTime =
    input.time !== undefined && input.time !== null && Number.isFinite(Number(input.time)) && Number(input.time) > 0
      ? Number(input.time)
      : parts[5] !== undefined
      ? Number(parts[5])
      : 0;

  const strategyId =
    String(rawStrategy || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_') || 'unknown';
  const symbol = rawSymbol ? normalizeSymbol(String(rawSymbol)) : 'UNKNOWN';
  const timeframe = normalizeCanonicalTimeframe(String(rawTimeframe || '15m'));
  const direction = String(rawDirection || '').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const timeSec =
    Number.isFinite(rawTime) && rawTime > 0
      ? rawTime > 1e12
        ? Math.floor(rawTime / 1000)
        : Math.floor(rawTime)
      : 0;

  return `sig:${strategyId}:${symbol}:${timeframe}:${direction}:${timeSec}`;
}

export function upsertSignal(signal: Record<string, any>): void {
  if (!signal || typeof signal !== 'object') return;
  const db = getDb();

  const rawId = typeof signal.id === 'string' ? signal.id.trim() : '';
  const idParts = rawId.startsWith('sig:') ? rawId.split(':') : [];
  const fallbackNowSec = Math.floor(Date.now() / 1000);
  const timeSec = normalizeEpochSeconds(
    signal.time ?? (idParts[5] !== undefined ? Number(idParts[5]) : undefined),
    fallbackNowSec
  );
  const createdAtMs = normalizeEpochMs(signal.createdAt, timeSec * 1000 || Date.now());

  const canonicalKey = buildCanonicalSignalKey({
    id: rawId || undefined,
    strategyId: signal.strategyId ?? signal.strategy_id,
    symbol: signal.symbol,
    timeframe: signal.timeframe ?? signal.interval,
    direction: signal.direction,
    time: timeSec,
  });

  const id = rawId || canonicalKey;
  const keyParts = canonicalKey.split(':');
  const symbol = signal.symbol ? normalizeSymbol(String(signal.symbol)) : keyParts[2] || 'UNKNOWN';
  const timeframe = normalizeCanonicalTimeframe(
    String(signal.timeframe || signal.interval || keyParts[3] || '15m')
  );
  const strategyId =
    String(signal.strategyId || signal.strategy_id || keyParts[1] || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_') || 'unknown';
  const strategyLabel = String(signal.strategyLabel || signal.strategyName || strategyId);
  const direction: 'BUY' | 'SELL' =
    String(signal.direction || keyParts[4] || 'BUY').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const entryType = String(signal.entryType || signal.rawEntryType || 'market').trim().toLowerCase();
  const entry = Number(signal.entry ?? signal.entryPrice ?? signal.limitPrice ?? 0) || 0;
  const sl = Number(signal.sl ?? signal.slPrice ?? 0) || 0;
  const tp = Number(signal.tp ?? signal.tp1Price ?? 0) || 0;
  const tp2 = signal.tp2 != null && Number.isFinite(Number(signal.tp2)) ? Number(signal.tp2) : null;
  const rr = Number(signal.rr ?? signal.riskRewardRatio ?? 0) || 0;
  const confidence = Number(signal.confidence ?? signal.confidencePct ?? 0) || 0;
  const risk = String(signal.risk || 'Medium');
  const reasonArr = parseReasonArray(signal.reason ?? signal.reasons ?? signal.reason_json);

  const incomingStatus = normalizeSignalStatus(signal.status);
  let finalStatus = incomingStatus;
  let finalResolvedAt =
    signal.resolvedAt != null
      ? normalizeEpochMs(signal.resolvedAt, Date.now())
      : incomingStatus === 'live'
      ? null
      : Date.now();
  let finalExitPrice =
    signal.exitPrice != null && Number.isFinite(Number(signal.exitPrice))
      ? Number(signal.exitPrice)
      : null;
  let finalCreatedAt = createdAtMs;

  const existingById = db
    .prepare('SELECT id, status, resolved_at, exit_price, created_at FROM signals WHERE id = ?')
    .get(id);
  const existingByCanonical = !existingById
    ? db
        .prepare(
          'SELECT id, status, resolved_at, exit_price, created_at FROM signals WHERE canonical_key = ? ORDER BY created_at DESC LIMIT 1'
        )
        .get(canonicalKey)
    : null;
  const existing = existingById || existingByCanonical;

  if (existing) {
    const existingStatus = normalizeSignalStatus(existing.status);
    if (signalStatusRank(existingStatus) > signalStatusRank(incomingStatus)) {
      finalStatus = existingStatus;
      finalResolvedAt =
        existing.resolved_at != null ? Number(existing.resolved_at) : finalResolvedAt;
      finalExitPrice =
        existing.exit_price != null ? Number(existing.exit_price) : finalExitPrice;
    } else {
      if (finalResolvedAt === null && existing.resolved_at != null && finalStatus !== 'live') {
        finalResolvedAt = Number(existing.resolved_at);
      }
      if (finalExitPrice === null && existing.exit_price != null) {
        finalExitPrice = Number(existing.exit_price);
      }
    }
    if (existing.created_at != null && Number(existing.created_at) > 0) {
      finalCreatedAt = Math.min(createdAtMs, Number(existing.created_at));
    }
  }

  db.prepare(`
    INSERT INTO signals (
      id, canonical_key, symbol, timeframe, strategy_id, strategy_label,
      direction, entry_type, entry, sl, tp, tp2, rr, confidence, risk,
      status, reason_json, time, created_at, resolved_at, exit_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      canonical_key = excluded.canonical_key,
      symbol = excluded.symbol,
      timeframe = excluded.timeframe,
      strategy_id = excluded.strategy_id,
      strategy_label = excluded.strategy_label,
      direction = excluded.direction,
      entry_type = excluded.entry_type,
      entry = excluded.entry,
      sl = excluded.sl,
      tp = excluded.tp,
      tp2 = excluded.tp2,
      rr = excluded.rr,
      confidence = excluded.confidence,
      risk = excluded.risk,
      status = excluded.status,
      reason_json = excluded.reason_json,
      time = excluded.time,
      created_at = excluded.created_at,
      resolved_at = excluded.resolved_at,
      exit_price = excluded.exit_price
  `).run(
    id,
    canonicalKey,
    symbol,
    timeframe,
    strategyId,
    strategyLabel,
    direction,
    entryType,
    entry,
    sl,
    tp,
    tp2,
    rr,
    confidence,
    risk,
    finalStatus,
    JSON.stringify(reasonArr),
    timeSec,
    finalCreatedAt,
    finalResolvedAt,
    finalExitPrice
  );
}

export function updateSignalStatusSqlite(
  signalId: string,
  status: string,
  exitPrice?: number | null
): void {
  const cleanId = String(signalId || '').trim();
  if (!cleanId) return;

  const db = getDb();
  const normStatus = normalizeSignalStatus(status);
  const nowMs = Date.now();
  const cleanExit =
    exitPrice !== undefined && exitPrice !== null && Number.isFinite(Number(exitPrice))
      ? Number(exitPrice)
      : null;
  const canonicalKey = cleanId.startsWith('sig:') ? buildCanonicalSignalKey({ id: cleanId }) : null;

  const rows = canonicalKey
    ? db
        .prepare('SELECT id, status FROM signals WHERE id = ? OR canonical_key = ?')
        .all(cleanId, canonicalKey)
    : db.prepare('SELECT id, status FROM signals WHERE id = ?').all(cleanId);

  for (const row of rows) {
    const currentStatus = normalizeSignalStatus(row.status);
    if (signalStatusRank(normStatus) < signalStatusRank(currentStatus)) {
      continue;
    }
    db.prepare(
      `UPDATE signals
       SET status = ?,
           resolved_at = CASE WHEN ? = 'live' THEN NULL ELSE ? END,
           exit_price = COALESCE(?, exit_price)
       WHERE id = ?`
    ).run(normStatus, normStatus, nowMs, cleanExit, String(row.id));
  }
}

export function querySignals(options?: {
  limit?: number;
  status?: string;
  symbol?: string;
  timeframe?: string;
}): ArchivedSignalRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (options?.symbol && String(options.symbol).trim()) {
    conditions.push('symbol = ?');
    args.push(normalizeSymbol(String(options.symbol)));
  }

  if (options?.timeframe && String(options.timeframe).trim()) {
    conditions.push('timeframe = ?');
    args.push(normalizeCanonicalTimeframe(String(options.timeframe)));
  }

  if (options?.status && String(options.status).trim()) {
    const upper = String(options.status).trim().toUpperCase();
    if (upper !== 'ALL') {
      if (upper === 'RESOLVED') {
        conditions.push("status IN ('WIN', 'LOSS', 'EXPIRED')");
      } else {
        conditions.push('status = ?');
        args.push(normalizeSignalStatus(options.status));
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit =
    options?.limit && Number(options.limit) > 0
      ? Math.min(5000, Math.floor(Number(options.limit)))
      : 200;

  const rows = db
    .prepare(
      `SELECT * FROM signals
       ${whereClause}
       ORDER BY created_at DESC, time DESC
       LIMIT ?`
    )
    .all(...args, limit);

  return rows.map(mapSignalRowToRecord);
}

export function queryActiveLiveSignals(symbol?: string, timeframe?: string): ArchivedSignalRecord[] {
  return querySignals({
    status: 'live',
    symbol,
    timeframe,
    limit: 1000,
  });
}

export interface UserPaperSettingsRow {
  uid: string;
  autoTradeEnabled: boolean;
  guardrailsEnabled: boolean;
  riskMode: 'fixedAmount' | 'percentage';
  fixedRiskAmount: number;
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxConsecutiveLossCap: number;
  minConfidence: number;
  minRR: number;
  maxPositions: number;
  spreadCapPips: number;
  sessionFilter: 'all' | 'london_ny' | 'ny_only' | 'london_only';
  correlationShield: boolean;
  newsFilter: boolean;
  cooldownOnLoss: boolean;
  allowedCategories: string[];
  accountBalance: number;
  autoSyncBrokerBalance: boolean;
  dailyLossUsd: number;
  dailyLossDate: string;
  consecutiveLosses: number;
  cooldownUntil: number | null;
  updatedAt: number;
}

const VALID_SESSION_FILTERS = new Set(['all', 'london_ny', 'ny_only', 'london_only']);

function normalizeSessionFilter(
  raw: unknown
): 'all' | 'london_ny' | 'ny_only' | 'london_only' {
  const s = String(raw || 'all').trim().toLowerCase();
  if (VALID_SESSION_FILTERS.has(s)) {
    return s as 'all' | 'london_ny' | 'ny_only' | 'london_only';
  }
  return 'all';
}

function parseAllowedCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const cleaned = raw.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : ['forex', 'metals', 'indices'];
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean);
        return cleaned.length > 0 ? cleaned : ['forex', 'metals', 'indices'];
      }
    } catch {}
  }
  return ['forex', 'metals', 'indices'];
}

function mapUserPaperSettingsRow(row: any): UserPaperSettingsRow {
  return {
    uid: String(row.uid),
    autoTradeEnabled: Boolean(Number(row.auto_trade_enabled)),
    guardrailsEnabled: Boolean(Number(row.guardrails_enabled)),
    riskMode: row.risk_mode === 'percentage' ? 'percentage' : 'fixedAmount',
    fixedRiskAmount: Number(row.fixed_risk_amount ?? 50),
    riskPerTradePct: Number(row.risk_per_trade_pct ?? 0.5),
    maxDailyLossPct: Number(row.max_daily_loss_pct ?? 4.0),
    maxConsecutiveLossCap: Number(row.max_consecutive_loss_cap ?? 3),
    minConfidence: Number(row.min_confidence ?? 60),
    minRR: Number(row.min_rr ?? 1.8),
    maxPositions: Number(row.max_positions ?? 5),
    spreadCapPips: Number(row.spread_cap_pips ?? 3.5),
    sessionFilter: normalizeSessionFilter(row.session_filter),
    correlationShield: Boolean(Number(row.correlation_shield)),
    newsFilter: Boolean(Number(row.news_filter)),
    cooldownOnLoss: Boolean(Number(row.cooldown_on_loss)),
    allowedCategories: parseAllowedCategories(row.allowed_categories_json),
    accountBalance: Number(row.account_balance ?? 10000),
    autoSyncBrokerBalance: Boolean(Number(row.auto_sync_broker_balance)),
    dailyLossUsd: Number(row.daily_loss_usd ?? 0),
    dailyLossDate: String(row.daily_loss_date || ''),
    consecutiveLosses: Number(row.consecutive_losses ?? 0),
    cooldownUntil:
      row.cooldown_until !== null && row.cooldown_until !== undefined
        ? Number(row.cooldown_until)
        : null,
    updatedAt: Number(row.updated_at || Date.now()),
  };
}

export function getUserPaperSettings(uid: string): UserPaperSettingsRow | null {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM user_paper_settings WHERE uid = ?')
    .get(cleanUid);
  return row ? mapUserPaperSettingsRow(row) : null;
}

export function upsertUserPaperSettings(settings: UserPaperSettingsRow): void {
  const cleanUid = String(settings?.uid || '').trim();
  if (!cleanUid) return;
  const db = getDb();

  const riskMode: 'fixedAmount' | 'percentage' =
    settings.riskMode === 'percentage' ? 'percentage' : 'fixedAmount';
  const sessionFilter = normalizeSessionFilter(settings.sessionFilter);
  const allowedCategories = parseAllowedCategories(settings.allowedCategories);
  const cooldownUntil =
    settings.cooldownUntil !== null &&
    settings.cooldownUntil !== undefined &&
    Number.isFinite(Number(settings.cooldownUntil))
      ? Math.floor(Number(settings.cooldownUntil))
      : null;
  const updatedAt =
    Number.isFinite(Number(settings.updatedAt)) && Number(settings.updatedAt) > 0
      ? Math.floor(Number(settings.updatedAt))
      : Date.now();

  db.prepare(`
    INSERT INTO user_paper_settings (
      uid,
      auto_trade_enabled,
      guardrails_enabled,
      risk_mode,
      fixed_risk_amount,
      risk_per_trade_pct,
      max_daily_loss_pct,
      max_consecutive_loss_cap,
      min_confidence,
      min_rr,
      max_positions,
      spread_cap_pips,
      session_filter,
      correlation_shield,
      news_filter,
      cooldown_on_loss,
      allowed_categories_json,
      account_balance,
      auto_sync_broker_balance,
      daily_loss_usd,
      daily_loss_date,
      consecutive_losses,
      cooldown_until,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET
      auto_trade_enabled = excluded.auto_trade_enabled,
      guardrails_enabled = excluded.guardrails_enabled,
      risk_mode = excluded.risk_mode,
      fixed_risk_amount = excluded.fixed_risk_amount,
      risk_per_trade_pct = excluded.risk_per_trade_pct,
      max_daily_loss_pct = excluded.max_daily_loss_pct,
      max_consecutive_loss_cap = excluded.max_consecutive_loss_cap,
      min_confidence = excluded.min_confidence,
      min_rr = excluded.min_rr,
      max_positions = excluded.max_positions,
      spread_cap_pips = excluded.spread_cap_pips,
      session_filter = excluded.session_filter,
      correlation_shield = excluded.correlation_shield,
      news_filter = excluded.news_filter,
      cooldown_on_loss = excluded.cooldown_on_loss,
      allowed_categories_json = excluded.allowed_categories_json,
      account_balance = excluded.account_balance,
      auto_sync_broker_balance = excluded.auto_sync_broker_balance,
      daily_loss_usd = excluded.daily_loss_usd,
      daily_loss_date = excluded.daily_loss_date,
      consecutive_losses = excluded.consecutive_losses,
      cooldown_until = excluded.cooldown_until,
      updated_at = excluded.updated_at
  `).run(
    cleanUid,
    settings.autoTradeEnabled ? 1 : 0,
    settings.guardrailsEnabled ? 1 : 0,
    riskMode,
    Number.isFinite(Number(settings.fixedRiskAmount)) ? Number(settings.fixedRiskAmount) : 50,
    Number.isFinite(Number(settings.riskPerTradePct)) ? Number(settings.riskPerTradePct) : 0.5,
    Number.isFinite(Number(settings.maxDailyLossPct)) ? Number(settings.maxDailyLossPct) : 4.0,
    Math.max(1, Math.floor(Number(settings.maxConsecutiveLossCap) || 3)),
    Number.isFinite(Number(settings.minConfidence)) ? Number(settings.minConfidence) : 60,
    Number.isFinite(Number(settings.minRR)) ? Number(settings.minRR) : 1.8,
    Math.max(1, Math.floor(Number(settings.maxPositions) || 5)),
    Number.isFinite(Number(settings.spreadCapPips)) ? Number(settings.spreadCapPips) : 3.5,
    sessionFilter,
    settings.correlationShield ? 1 : 0,
    settings.newsFilter ? 1 : 0,
    settings.cooldownOnLoss ? 1 : 0,
    JSON.stringify(allowedCategories),
    Number.isFinite(Number(settings.accountBalance)) && Number(settings.accountBalance) > 0
      ? Number(settings.accountBalance)
      : 10000,
    settings.autoSyncBrokerBalance ? 1 : 0,
    Number.isFinite(Number(settings.dailyLossUsd)) ? Number(settings.dailyLossUsd) : 0,
    String(settings.dailyLossDate || ''),
    Math.max(0, Math.floor(Number(settings.consecutiveLosses) || 0)),
    cooldownUntil,
    updatedAt
  );
}

export function listAutoTradeEnabledSettings(): UserPaperSettingsRow[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM user_paper_settings WHERE auto_trade_enabled = 1 ORDER BY updated_at DESC')
    .all();
  return rows.map(mapUserPaperSettingsRow);
}

export function updateUserRiskRuntime(
  uid: string,
  risk: {
    dailyLossUsd: number;
    dailyLossDate: string;
    consecutiveLosses: number;
    cooldownUntil: number | null;
  }
): void {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  const db = getDb();
  const now = Date.now();
  const dailyLossUsd = Number.isFinite(Number(risk.dailyLossUsd)) ? Number(risk.dailyLossUsd) : 0;
  const dailyLossDate = String(risk.dailyLossDate || '');
  const consecutiveLosses = Math.max(0, Math.floor(Number(risk.consecutiveLosses) || 0));
  const cooldownUntil =
    risk.cooldownUntil !== null &&
    risk.cooldownUntil !== undefined &&
    Number.isFinite(Number(risk.cooldownUntil))
      ? Math.floor(Number(risk.cooldownUntil))
      : null;

  const result = db
    .prepare(`
      UPDATE user_paper_settings
      SET daily_loss_usd = ?,
          daily_loss_date = ?,
          consecutive_losses = ?,
          cooldown_until = ?,
          updated_at = ?
      WHERE uid = ?
    `)
    .run(dailyLossUsd, dailyLossDate, consecutiveLosses, cooldownUntil, now, cleanUid);

  if (!result?.changes) {
    db.prepare(`
      INSERT OR IGNORE INTO user_paper_settings (
        uid, daily_loss_usd, daily_loss_date, consecutive_losses, cooldown_until, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(cleanUid, dailyLossUsd, dailyLossDate, consecutiveLosses, cooldownUntil, now);
  }
}
