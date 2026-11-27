import { isValidUserUid, sanitizeUid } from '../auth/requestAuth';
import { admin } from '../market-data/firebaseAdmin';
import { getDb } from '../storage/sqliteDb';
import { dispatchWebhookRequest, validateWebhookUrl } from './adapters/webhookAdapter';
import { encryptSecret, maskSecret } from './credentialVault';
import type {
  ExternalTradeDispatchPayload,
  PublicWebhookConfig,
  UserWebhookConfigRecord,
  WebhookDeliveryLogRecord,
  WebhookPreset,
  WebhookTriggerMode,
} from './types';

const VALID_PRESETS = new Set<WebhookPreset>([
  'generic',
  'traderspost',
  'pickmytrade',
  'pineconnector',
]);
const VALID_TRIGGERS = new Set<WebhookTriggerMode>(['auto', 'manual', 'both']);

let tablesReady = false;
const hydratedUids = new Set<string>();

function getFirestoreDb(): any | null {
  try {
    if (Array.isArray(admin?.apps) && admin.apps.length > 0) {
      return admin.firestore();
    }
  } catch {}
  return null;
}

function ensureBrokerTables(): void {
  if (tablesReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_broker_webhooks (
      uid TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '',
      preset TEXT NOT NULL DEFAULT 'generic',
      trigger_mode TEXT NOT NULL DEFAULT 'both',
      secret_encrypted TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broker_webhook_deliveries (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      url TEXT NOT NULL,
      preset TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      http_status INTEGER,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      response_preview TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_uid
      ON broker_webhook_deliveries(uid, created_at DESC);
  `);
  tablesReady = true;
}

function mapWebhookRow(row: any): UserWebhookConfigRecord {
  const presetRaw = String(row.preset || 'generic') as WebhookPreset;
  const triggerRaw = String(row.trigger_mode || 'both') as WebhookTriggerMode;
  return {
    uid: String(row.uid),
    enabled: Boolean(row.enabled),
    url: String(row.url || ''),
    preset: VALID_PRESETS.has(presetRaw) ? presetRaw : 'generic',
    triggerMode: VALID_TRIGGERS.has(triggerRaw) ? triggerRaw : 'both',
    secretEncrypted: String(row.secret_encrypted || ''),
    updatedAt: Number(row.updated_at || Date.now()),
  };
}

function mapDeliveryRow(row: any): WebhookDeliveryLogRecord {
  return {
    id: String(row.id),
    uid: String(row.uid),
    url: String(row.url),
    preset: String(row.preset || 'generic') as WebhookPreset,
    symbol: String(row.symbol),
    action: String(row.action),
    triggerSource: String(row.trigger_source || 'auto') as 'auto' | 'manual' | 'test',
    ok: Boolean(row.ok),
    httpStatus: row.http_status != null ? Number(row.http_status) : null,
    latencyMs: Number(row.latency_ms || 0),
    responsePreview: row.response_preview ? String(row.response_preview) : null,
    error: row.error ? String(row.error) : null,
    createdAt: Number(row.created_at || 0),
  };
}

function toPublicWebhookConfig(rec: UserWebhookConfigRecord | null): PublicWebhookConfig {
  if (!rec) {
    return {
      enabled: false,
      url: '',
      preset: 'generic',
      triggerMode: 'both',
      hasSecret: false,
      secretHint: null,
      updatedAt: null,
    };
  }
  const hint = maskSecret(rec.secretEncrypted);
  return {
    enabled: rec.enabled,
    url: rec.url,
    preset: rec.preset,
    triggerMode: rec.triggerMode,
    hasSecret: Boolean(rec.secretEncrypted),
    secretHint: hint,
    updatedAt: rec.updatedAt,
  };
}

async function hydrateUserBrokerConfig(uid: string): Promise<void> {
  ensureBrokerTables();
  if (hydratedUids.has(uid)) return;
  hydratedUids.add(uid);

  const fsDb = getFirestoreDb();
  if (!fsDb) return;

  try {
    const snap = await fsDb.doc(`users/${uid}/broker_connections/webhook_v1`).get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO user_broker_webhooks
        (uid, enabled, url, preset, trigger_mode, secret_encrypted, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid,
      data.enabled ? 1 : 0,
      String(data.url || ''),
      String(data.preset || 'generic'),
      String(data.triggerMode || 'both'),
      String(data.secretEncrypted || ''),
      Number(data.updatedAt || Date.now())
    );
  } catch (err: any) {
    console.warn(`[Brokers] Firestore hydrate skipped for uid=${uid}:`, err?.message || err);
  }
}

async function syncWebhookConfigToFirestore(rec: UserWebhookConfigRecord): Promise<void> {
  const fsDb = getFirestoreDb();
  if (!fsDb) return;
  try {
    await fsDb.doc(`users/${rec.uid}/broker_connections/webhook_v1`).set(
      {
        enabled: rec.enabled,
        url: rec.url,
        preset: rec.preset,
        triggerMode: rec.triggerMode,
        secretEncrypted: rec.secretEncrypted,
        updatedAt: rec.updatedAt,
      },
      { merge: true }
    );
  } catch (err: any) {
    console.warn(`[Brokers] Firestore sync skipped for uid=${rec.uid}:`, err?.message || err);
  }
}

function recordDeliveryLog(log: WebhookDeliveryLogRecord): void {
  ensureBrokerTables();
  const db = getDb();
  db.prepare(`
    INSERT INTO broker_webhook_deliveries
      (id, uid, url, preset, symbol, action, trigger_source, ok, http_status, latency_ms, response_preview, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log.id,
    log.uid,
    log.url,
    log.preset,
    log.symbol,
    log.action,
    log.triggerSource,
    log.ok ? 1 : 0,
    log.httpStatus,
    log.latencyMs,
    log.responsePreview,
    log.error,
    log.createdAt
  );

  // Keep only the latest 30 delivery logs per user
  db.prepare(`
    DELETE FROM broker_webhook_deliveries
    WHERE uid = ? AND id NOT IN (
      SELECT id FROM broker_webhook_deliveries WHERE uid = ? ORDER BY created_at DESC LIMIT 30
    )
  `).run(log.uid, log.uid);
}

export async function getUserWebhookConfigRecord(uid: string): Promise<UserWebhookConfigRecord | null> {
  const cleanUid = sanitizeUid(uid);
  if (!isValidUserUid(cleanUid)) return null;
  await hydrateUserBrokerConfig(cleanUid);
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_broker_webhooks WHERE uid = ?').get(cleanUid);
  return row ? mapWebhookRow(row) : null;
}

export async function getUserBrokerOverview(uid: string): Promise<{
  webhook: PublicWebhookConfig;
  deliveries: WebhookDeliveryLogRecord[];
  venues: Array<{
    id: 'paper' | 'webhook' | 'ctrader' | 'tradovate';
    name: string;
    status: 'active' | 'configured' | 'available' | 'coming_soon';
    summary: string;
  }>;
}> {
  const cleanUid = sanitizeUid(uid);
  const webhookRec = await getUserWebhookConfigRecord(cleanUid);
  const publicWebhook = toPublicWebhookConfig(webhookRec);

  ensureBrokerTables();
  const db = getDb();
  const deliveries = db
    .prepare('SELECT * FROM broker_webhook_deliveries WHERE uid = ? ORDER BY created_at DESC LIMIT 15')
    .all(cleanUid)
    .map(mapDeliveryRow);

  const ctraderConfigured = Boolean(
    process.env.CTRADER_CLIENT_ID?.trim() && process.env.CTRADER_CLIENT_SECRET?.trim()
  );
  const tradovateConfigured = Boolean(
    process.env.TRADOVATE_CLIENT_ID?.trim() && process.env.TRADOVATE_CLIENT_SECRET?.trim()
  );

  return {
    webhook: publicWebhook,
    deliveries,
    venues: [
      {
        id: 'paper',
        name: 'TRAXO Paper Engine',
        status: 'active',
        summary: 'Built-in $10,000 isolated virtual account with instant fills & replay.',
      },
      {
        id: 'webhook',
        name: 'Outbound Webhook Bridge',
        status: publicWebhook.enabled && publicWebhook.url ? 'configured' : 'available',
        summary: 'Forward trades to TradersPost, PickMyTrade, PineConnector, or any custom HTTPS endpoint.',
      },
      {
        id: 'ctrader',
        name: 'cTrader Open API (1-Click OAuth)',
        status: ctraderConfigured ? 'available' : 'coming_soon',
        summary: '1-click cloud OAuth for 50+ Forex, Gold & Prop-Firm brokers (FTMO, FundedNext, Pepperstone, IC Markets).',
      },
      {
        id: 'tradovate',
        name: 'Tradovate Futures (MNQ)',
        status: tradovateConfigured ? 'available' : 'coming_soon',
        summary: 'Direct cloud futures routing for MNQ & futures prop firms (Apex, Topstep, TakeProfitTrader).',
      },
    ],
  };
}

export async function saveUserWebhookConfig(
  uid: string,
  input: {
    enabled?: boolean;
    url?: string;
    preset?: string;
    triggerMode?: string;
    secret?: string | null;
    clearSecret?: boolean;
  }
): Promise<PublicWebhookConfig> {
  const cleanUid = sanitizeUid(uid);
  if (!isValidUserUid(cleanUid)) {
    throw new Error('Valid user UID required');
  }

  const existing = await getUserWebhookConfigRecord(cleanUid);
  const nextUrl = input.url !== undefined ? String(input.url).trim() : existing?.url || '';
  const nextEnabled = input.enabled !== undefined ? Boolean(input.enabled) : existing?.enabled ?? false;

  if (nextUrl || nextEnabled) {
    const check = validateWebhookUrl(nextUrl);
    if (!check.ok) {
      throw new Error(check.error || 'Invalid webhook URL');
    }
  }

  const presetCandidate = String(input.preset || existing?.preset || 'generic') as WebhookPreset;
  const nextPreset: WebhookPreset = VALID_PRESETS.has(presetCandidate) ? presetCandidate : 'generic';

  const triggerCandidate = String(
    input.triggerMode || existing?.triggerMode || 'both'
  ) as WebhookTriggerMode;
  const nextTrigger: WebhookTriggerMode = VALID_TRIGGERS.has(triggerCandidate)
    ? triggerCandidate
    : 'both';

  let nextSecretEncrypted = existing?.secretEncrypted || '';
  if (input.clearSecret) {
    nextSecretEncrypted = '';
  } else if (typeof input.secret === 'string' && input.secret.trim()) {
    nextSecretEncrypted = encryptSecret(input.secret.trim());
  }

  const now = Date.now();
  const record: UserWebhookConfigRecord = {
    uid: cleanUid,
    enabled: nextEnabled && Boolean(nextUrl),
    url: nextUrl,
    preset: nextPreset,
    triggerMode: nextTrigger,
    secretEncrypted: nextSecretEncrypted,
    updatedAt: now,
  };

  ensureBrokerTables();
  const db = getDb();
  db.prepare(`
    INSERT INTO user_broker_webhooks
      (uid, enabled, url, preset, trigger_mode, secret_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET
      enabled = excluded.enabled,
      url = excluded.url,
      preset = excluded.preset,
      trigger_mode = excluded.trigger_mode,
      secret_encrypted = excluded.secret_encrypted,
      updated_at = excluded.updated_at
  `).run(
    record.uid,
    record.enabled ? 1 : 0,
    record.url,
    record.preset,
    record.triggerMode,
    record.secretEncrypted,
    record.updatedAt
  );

  void syncWebhookConfigToFirestore(record);
  return toPublicWebhookConfig(record);
}

export async function deleteUserWebhookConfig(uid: string): Promise<void> {
  const cleanUid = sanitizeUid(uid);
  if (!isValidUserUid(cleanUid)) return;
  ensureBrokerTables();
  const db = getDb();
  db.prepare('DELETE FROM user_broker_webhooks WHERE uid = ?').run(cleanUid);
  const fsDb = getFirestoreDb();
  if (fsDb) {
    void fsDb
      .doc(`users/${cleanUid}/broker_connections/webhook_v1`)
      .delete()
      .catch(() => {});
  }
}

export async function sendTestWebhookForUser(uid: string): Promise<WebhookDeliveryLogRecord> {
  const config = await getUserWebhookConfigRecord(uid);
  if (!config || !config.url) {
    throw new Error('Save a webhook URL before sending a test signal.');
  }
  const delivery = await dispatchWebhookRequest(config, {
    tradeId: `test_${Date.now()}`,
    signalId: 'traxo_test_signal',
    symbol: 'EURUSD',
    action: 'BUY',
    entryType: 'MARKET',
    price: 1.085,
    sl: 1.0825,
    tp1: 1.09,
    tp2: 1.0925,
    volume: 0.2,
    riskAmountUsd: 50,
    timeframe: '15m',
    strategyId: 'traxo_london_apex',
    strategyLabel: 'TRAXO Test Signal',
    confidence: 88,
    rr: 2.0,
    triggerSource: 'test',
  });
  recordDeliveryLog(delivery);
  return delivery;
}

/**
 * Modular Broker Fan-Out:
 * Called after a trade is accepted by Paper Broker (auto or manual).
 * Safely dispatches to any enabled external broker adapter for `uid` without ever throwing.
 */
export async function notifyExternalBrokersOnExecution(
  uid: string,
  payload: ExternalTradeDispatchPayload
): Promise<void> {
  try {
    const config = await getUserWebhookConfigRecord(uid);
    if (!config || !config.enabled || !config.url) return;

    const triggerAllowed =
      config.triggerMode === 'both' ||
      (config.triggerMode === 'auto' && payload.triggerSource === 'auto') ||
      (config.triggerMode === 'manual' && payload.triggerSource === 'manual');

    if (!triggerAllowed) return;

    const delivery = await dispatchWebhookRequest(config, payload);
    recordDeliveryLog(delivery);
  } catch (err: any) {
    console.warn(`[Brokers] External dispatch error for uid=${uid}:`, err?.message || err);
  }
}
