import { isValidUserUid } from '../auth/requestAuth';
import { firestore } from '../market-data/firebaseAdmin';
import { backupRedis, getRedisTopologyStatus } from '../market-data/redisClient';
import { getDb } from './sqliteDb';

const BACKUP_KEY_PREFIX = 'backup:traxo:paper_v2:';
const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const hydratedUids = new Set<string>();
const inFlightHydrations = new Map<string, Promise<boolean>>();
const lastSyncedAtByUid = new Map<string, number>();
const restoredFromCloudUids = new Set<string>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

function getUserPaperStateDoc(uid: string) {
  return firestore.collection('users').doc(uid).collection('paper_state').doc('v2');
}

export interface PaperCloudBackupPayload {
  version: number;
  syncedAt: number;
  uid: string;
  account: any | null;
  trades: any[];
  replaySnapshots: any[];
  settings?: any | null;
}

export function resetHydratedCacheForTests(): void {
  hydratedUids.clear();
  inFlightHydrations.clear();
  lastSyncedAtByUid.clear();
  restoredFromCloudUids.clear();
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
}

export async function syncPaperStateToCloudBackup(uid: string): Promise<{
  ok: boolean;
  syncedAt: number;
  tradeCount: number;
  snapshotCount: number;
}> {
  if (!isValidUserUid(uid)) {
    return {
      ok: false,
      syncedAt: 0,
      tradeCount: 0,
      snapshotCount: 0,
    };
  }

  const db = getDb();
  const account = db.prepare('SELECT * FROM paper_accounts WHERE uid = ?').get(uid) || null;
  const settings = db.prepare('SELECT * FROM user_paper_settings WHERE uid = ?').get(uid) || null;
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
    version: 2,
    syncedAt,
    uid,
    account,
    trades,
    replaySnapshots,
    settings,
  };

  await backupRedis
    .set(`${BACKUP_KEY_PREFIX}${uid}`, JSON.stringify(payload), 'EX', BACKUP_TTL_SECONDS)
    .catch(() => {});

  const firestoreMirror = JSON.parse(
    JSON.stringify({
      version: 2,
      syncedAt,
      uid,
      account,
      settings,
      trades: trades.slice(0, 200),
    })
  );
  await getUserPaperStateDoc(uid)
    .set(firestoreMirror, { merge: true })
    .catch(() => {});

  lastSyncedAtByUid.set(uid, syncedAt);

  return {
    ok: true,
    syncedAt,
    tradeCount: trades.length,
    snapshotCount: replaySnapshots.length,
  };
}

export function schedulePaperCloudBackup(uid: string, delayMs = 1_500): void {
  if (!isValidUserUid(uid)) {
    return;
  }

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
 * On demand per authenticated user (especially ephemeral cloud deployments where SQLite disk is wiped),
 * restores paper_accounts, paper_trades, recent replay snapshots, and settings from backupRedis
 * or Firestore fallback (`users/{uid}/paper_state/v2`) if the local SQLite has no data for `uid`.
 */
export async function hydratePaperStateFromCloudBackup(uid: string): Promise<{
  restored: boolean;
  tradeCount: number;
  snapshotCount: number;
}> {
  if (!isValidUserUid(uid)) {
    return { restored: false, tradeCount: 0, snapshotCount: 0 };
  }

  const db = getDb();
  const localAccountRow = db.prepare('SELECT 1 FROM paper_accounts WHERE uid = ?').get(uid);
  const localTradeCountRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM paper_trades WHERE uid = ?')
    .get(uid);
  if (localAccountRow || Number(localTradeCountRow?.cnt || 0) > 0) {
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
    const snap = await getUserPaperStateDoc(uid)
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
        uid,
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

    if (parsed.settings && typeof parsed.settings === 'object') {
      const st = parsed.settings;
      db.prepare(`
        INSERT OR IGNORE INTO user_paper_settings (
          uid, auto_trade_enabled, guardrails_enabled, risk_mode, fixed_risk_amount,
          risk_per_trade_pct, max_daily_loss_pct, max_consecutive_loss_cap, min_confidence,
          min_rr, max_positions, spread_cap_pips, session_filter, correlation_shield,
          news_filter, cooldown_on_loss, allowed_categories_json, account_balance,
          auto_sync_broker_balance, daily_loss_usd, daily_loss_date, consecutive_losses,
          cooldown_until, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid,
        Number(st.auto_trade_enabled ?? 0),
        Number(st.guardrails_enabled ?? 1),
        String(st.risk_mode || 'fixedAmount'),
        Number(st.fixed_risk_amount ?? 50),
        Number(st.risk_per_trade_pct ?? 0.5),
        Number(st.max_daily_loss_pct ?? 4.0),
        Number(st.max_consecutive_loss_cap ?? 3),
        Number(st.min_confidence ?? 60),
        Number(st.min_rr ?? 1.8),
        Number(st.max_positions ?? 5),
        Number(st.spread_cap_pips ?? 3.5),
        String(st.session_filter || 'all'),
        Number(st.correlation_shield ?? 1),
        Number(st.news_filter ?? 1),
        Number(st.cooldown_on_loss ?? 1),
        String(st.allowed_categories_json || '["forex","metals","indices"]'),
        Number(st.account_balance ?? 10000),
        Number(st.auto_sync_broker_balance ?? 1),
        Number(st.daily_loss_usd ?? 0),
        String(st.daily_loss_date || ''),
        Number(st.consecutive_losses ?? 0),
        st.cooldown_until ?? null,
        Number(st.updated_at || Date.now())
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
        uid,
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
    restoredFromCloudUids.add(uid);
    lastSyncedAtByUid.set(uid, parsed.syncedAt || Date.now());
    console.log(
      `[PaperBackup] Restored ${trades.length} paper trade(s) & ${snaps.length} replay snapshot(s) for uid=${uid} from ${sourceLabel}.`
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

export async function ensureUserPaperHydrated(uid: string): Promise<boolean> {
  if (!isValidUserUid(uid)) {
    return false;
  }

  const db = getDb();
  const hasLocalAccount = Boolean(
    db.prepare('SELECT 1 FROM paper_accounts WHERE uid = ?').get(uid)
  );
  if (hydratedUids.has(uid) && hasLocalAccount) {
    return true;
  }
  if (hasLocalAccount) {
    hydratedUids.add(uid);
    return true;
  }

  const existingInFlight = inFlightHydrations.get(uid);
  if (existingInFlight) {
    return existingInFlight;
  }

  const hydrationPromise = (async () => {
    try {
      const res = await hydratePaperStateFromCloudBackup(uid);
      hydratedUids.add(uid);
      return res.restored;
    } catch {
      hydratedUids.add(uid);
      return false;
    } finally {
      inFlightHydrations.delete(uid);
    }
  })();

  inFlightHydrations.set(uid, hydrationPromise);
  return hydrationPromise;
}

export async function getPaperBackupStatus(uid: string): Promise<{
  configured: boolean;
  primaryHealthy: boolean;
  backupHealthy: boolean;
  lastSyncedAt: number | null;
  restoredFromCloud: boolean;
  cloudSnapshotPresent: boolean;
}> {
  const topology = getRedisTopologyStatus();
  if (!isValidUserUid(uid)) {
    return {
      configured: topology.backupConfigured,
      primaryHealthy: topology.primaryHealthy,
      backupHealthy: topology.backupHealthy,
      lastSyncedAt: null,
      restoredFromCloud: false,
      cloudSnapshotPresent: false,
    };
  }

  const raw = await backupRedis.get(`${BACKUP_KEY_PREFIX}${uid}`).catch(() => null);
  let cloudSnapshotPresent = Boolean(raw);
  if (!cloudSnapshotPresent) {
    const snap = await getUserPaperStateDoc(uid)
      .get()
      .catch(() => null);
    cloudSnapshotPresent = Boolean(snap?.exists);
  }
  return {
    configured: topology.backupConfigured,
    primaryHealthy: topology.primaryHealthy,
    backupHealthy: topology.backupHealthy,
    lastSyncedAt: lastSyncedAtByUid.get(uid) ?? null,
    restoredFromCloud: restoredFromCloudUids.has(uid),
    cloudSnapshotPresent,
  };
}
