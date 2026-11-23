import { firestore } from '../market-data/firebaseAdmin';
import { backupRedis, getRedisTopologyStatus } from '../market-data/redisClient';
import { getDb } from './sqliteDb';

const BACKUP_KEY_PREFIX = 'backup:traxo:paper_state:';
const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const FIRESTORE_COLLECTION = 'system';
const FIRESTORE_DOC_PREFIX = 'paper_state_';

let lastSyncedAt: number | null = null;
let lastRestoredFromCloud = false;
const debounceTimers = new Map<string, NodeJS.Timeout>();

export interface PaperCloudBackupPayload {
  version: number;
  syncedAt: number;
  uid: string;
  account: any | null;
  trades: any[];
  replaySnapshots: any[];
}

export async function syncPaperStateToCloudBackup(uid = 'default_trader'): Promise<{
  ok: boolean;
  syncedAt: number;
  tradeCount: number;
  snapshotCount: number;
}> {
  const db = getDb();
  const account = db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid) || null;
  const trades = db
    .prepare('SELECT * FROM paper_trades WHERE uid = ? ORDER BY created_at DESC LIMIT 250')
    .all(uid);
  const tradeIds = trades.map((t: any) => String(t.id));

  let replaySnapshots: any[] = [];
  if (tradeIds.length > 0) {
    const recentIds = tradeIds.slice(0, 30);
    const placeholders = recentIds.map(() => '?').join(', ');
    replaySnapshots = db
      .prepare(`SELECT * FROM trade_replay_snapshots WHERE trade_id IN (${placeholders})`)
      .all(...recentIds);
  }

  const syncedAt = Date.now();
  const payload: PaperCloudBackupPayload = {
    version: 1,
    syncedAt,
    uid,
    account,
    trades,
    replaySnapshots,
  };

  await backupRedis
    .set(`${BACKUP_KEY_PREFIX}${uid}`, JSON.stringify(payload), 'EX', BACKUP_TTL_SECONDS)
    .catch(() => {});

  const firestoreMirror = JSON.parse(
    JSON.stringify({
      version: 1,
      syncedAt,
      uid,
      account,
      trades: trades.slice(0, 200),
    })
  );
  await firestore
    .collection(FIRESTORE_COLLECTION)
    .doc(`${FIRESTORE_DOC_PREFIX}${uid}`)
    .set(firestoreMirror, { merge: true })
    .catch(() => {});

  lastSyncedAt = syncedAt;

  return {
    ok: true,
    syncedAt,
    tradeCount: trades.length,
    snapshotCount: replaySnapshots.length,
  };
}

export function schedulePaperCloudBackup(uid = 'default_trader', delayMs = 1_500): void {
  const existing = debounceTimers.get(uid);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    debounceTimers.delete(uid);
    void syncPaperStateToCloudBackup(uid).catch((err: any) => {
      console.warn('[PaperBackup] Cloud mirror sync notice:', err?.message || err);
    });
  }, delayMs);

  if (typeof timer.unref === 'function') timer.unref();
  debounceTimers.set(uid, timer);
}

/**
 * On startup (especially ephemeral cloud deployments where SQLite disk is wiped),
 * restores paper_accounts, paper_trades, and recent replay snapshots from backupRedis
 * or Firestore fallback if the local SQLite paper_trades table is empty.
 */
export async function hydratePaperStateFromCloudBackup(uid = 'default_trader'): Promise<{
  restored: boolean;
  tradeCount: number;
  snapshotCount: number;
}> {
  const db = getDb();
  const localTradeCountRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM paper_trades WHERE uid = ?')
    .get(uid);
  if (Number(localTradeCountRow?.cnt || 0) > 0) {
    return { restored: false, tradeCount: 0, snapshotCount: 0 };
  }

  let parsed: PaperCloudBackupPayload | null = null;
  let sourceLabel = 'backup Redis';

  const raw = await backupRedis.get(`${BACKUP_KEY_PREFIX}${uid}`).catch(() => null);
  if (raw) {
    try {
      const candidate = JSON.parse(raw) as PaperCloudBackupPayload;
      if (candidate && (candidate.account || (Array.isArray(candidate.trades) && candidate.trades.length > 0))) {
        parsed = candidate;
      }
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    const snap = await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`${FIRESTORE_DOC_PREFIX}${uid}`)
      .get()
      .catch(() => null);
    const fsData = snap?.exists ? (snap.data() as PaperCloudBackupPayload | undefined) : null;
    if (fsData && (fsData.account || (Array.isArray(fsData.trades) && fsData.trades.length > 0))) {
      parsed = fsData;
      sourceLabel = 'Firestore';
    }
  }

  if (!parsed || (!parsed.account && (!Array.isArray(parsed.trades) || parsed.trades.length === 0))) {
    return { restored: false, tradeCount: 0, snapshotCount: 0 };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (parsed.account) {
      const a = parsed.account;
      db.prepare(`
        INSERT OR REPLACE INTO paper_accounts (
          uid, starting_balance, balance, equity, used_margin, free_margin,
          floating_pnl, realized_pnl, peak_equity, max_drawdown_pct, currency, leverage, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(a.uid || uid),
        Number(a.starting_balance ?? 10000),
        Number(a.balance ?? 10000),
        Number(a.equity ?? 10000),
        Number(a.used_margin ?? 0),
        Number(a.free_margin ?? 10000),
        Number(a.floating_pnl ?? 0),
        Number(a.realized_pnl ?? 0),
        Number(a.peak_equity ?? 10000),
        Number(a.max_drawdown_pct ?? 0),
        String(a.currency || 'USD'),
        Number(a.leverage ?? 100),
        Number(a.updated_at || Date.now())
      );
    }

    const tradeInsert = db.prepare(`
      INSERT OR REPLACE INTO paper_trades (
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
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    const trades = Array.isArray(parsed.trades) ? parsed.trades : [];
    for (const t of trades) {
      tradeInsert.run(
        t.id,
        t.uid || uid,
        t.signal_id ?? null,
        t.symbol,
        t.timeframe,
        t.market,
        t.strategy_id,
        t.strategy_label,
        t.tier,
        t.direction,
        t.entry_type,
        t.exit_mode,
        t.status,
        t.requested_entry,
        t.fill_price ?? null,
        t.sl_price,
        t.current_sl,
        t.tp1_price,
        t.tp2_price ?? null,
        t.initial_volume,
        t.open_volume,
        t.risk_amount_usd,
        t.planned_rr,
        t.confidence,
        t.spread_pips_at_entry ?? null,
        t.created_at,
        t.filled_at ?? null,
        t.tp1_hit_at ?? null,
        t.tp1_fill_price ?? null,
        t.tp1_pnl_usd ?? 0,
        t.closed_at ?? null,
        t.exit_price ?? null,
        t.realized_pnl_usd ?? 0,
        t.floating_pnl_usd ?? 0,
        t.realized_r ?? 0,
        t.mfe_price ?? null,
        t.mae_price ?? null,
        t.mfe_r ?? 0,
        t.mae_r ?? 0,
        t.bars_held ?? 0,
        t.balance_before ?? null,
        t.balance_after ?? null,
        t.resolution_method ?? null,
        t.last_evaluated_time ?? null,
        t.reasons_json ?? null,
        t.confluence_json ?? null,
        t.events_json ?? null
      );
    }

    const snapInsert = db.prepare(`
      INSERT OR REPLACE INTO trade_replay_snapshots (
        trade_id, symbol, timeframe, pre_entry_bars, trade_bars, post_exit_bars,
        candles_json, markers_json, price_lines_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const snaps = Array.isArray(parsed.replaySnapshots) ? parsed.replaySnapshots : [];
    for (const s of snaps) {
      snapInsert.run(
        s.trade_id,
        s.symbol,
        s.timeframe,
        s.pre_entry_bars,
        s.trade_bars,
        s.post_exit_bars,
        s.candles_json,
        s.markers_json,
        s.price_lines_json,
        s.created_at
      );
    }

    db.exec('COMMIT');
    lastRestoredFromCloud = true;
    lastSyncedAt = parsed.syncedAt || Date.now();
    console.log(
      `[PaperBackup] Restored ${trades.length} paper trade(s) & ${snaps.length} replay snapshot(s) from ${sourceLabel}.`
    );
    return { restored: true, tradeCount: trades.length, snapshotCount: snaps.length };
  } catch (err: any) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    console.warn('[PaperBackup] Failed restoring SQLite from cloud backup:', err?.message || err);
    return { restored: false, tradeCount: 0, snapshotCount: 0 };
  }
}

export async function getPaperBackupStatus(uid = 'default_trader'): Promise<{
  configured: boolean;
  primaryHealthy: boolean;
  backupHealthy: boolean;
  lastSyncedAt: number | null;
  restoredFromCloud: boolean;
  cloudSnapshotPresent: boolean;
}> {
  const topology = getRedisTopologyStatus();
  const raw = await backupRedis.get(`${BACKUP_KEY_PREFIX}${uid}`).catch(() => null);
  let cloudSnapshotPresent = Boolean(raw);
  if (!cloudSnapshotPresent) {
    const snap = await firestore
      .collection(FIRESTORE_COLLECTION)
      .doc(`${FIRESTORE_DOC_PREFIX}${uid}`)
      .get()
      .catch(() => null);
    cloudSnapshotPresent = Boolean(snap?.exists);
  }
  return {
    configured: topology.backupConfigured,
    primaryHealthy: topology.primaryHealthy,
    backupHealthy: topology.backupHealthy,
    lastSyncedAt,
    restoredFromCloud: lastRestoredFromCloud,
    cloudSnapshotPresent,
  };
}
