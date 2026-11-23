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
      uid TEXT NOT NULL DEFAULT 'default_trader',
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
  `);
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
