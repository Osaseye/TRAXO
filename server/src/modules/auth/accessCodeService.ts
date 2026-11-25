import crypto from 'crypto';
import { admin } from '../market-data/firebaseAdmin';
import { getDb } from '../storage/sqliteDb';

function getFirestoreDb(): any | null {
  try {
    if (Array.isArray(admin?.apps) && admin.apps.length > 0) {
      return admin.firestore();
    }
  } catch {}
  return null;
}

export const ADMIN_EMAIL = 'wavecrest@gmail.com';
const FIRESTORE_DOC_PATH = 'system_admin/login_access_codes_v1';
const DEFAULT_TTL_HOURS = 24;

export interface AccessCodeRecord {
  code: string;
  targetEmail: string | null;
  status: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  usedByEmail: string | null;
  usedAt: number | null;
}

export interface AccessCodeRequestRecord {
  id: string;
  email: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  code: string | null;
  requestedAt: number;
  resolvedAt: number | null;
}

let tablesReady = false;
let hydratedFromCloud = false;

export function normalizeEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

function ensureTables(): void {
  if (tablesReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_access_codes (
      code TEXT PRIMARY KEY,
      target_email TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_by_email TEXT,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_login_access_codes_status
      ON login_access_codes(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS login_code_requests (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      code TEXT,
      requested_at INTEGER NOT NULL,
      resolved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_login_code_requests_status
      ON login_code_requests(status, requested_at DESC);
  `);
  tablesReady = true;
}

function mapCodeRow(row: any): AccessCodeRecord {
  const now = Date.now();
  let status = String(row.status || 'ACTIVE') as AccessCodeRecord['status'];
  const expiresAt = Number(row.expires_at || 0);
  if (status === 'ACTIVE' && expiresAt > 0 && now > expiresAt) {
    status = 'EXPIRED';
  }
  return {
    code: String(row.code),
    targetEmail: row.target_email ? String(row.target_email) : null,
    status,
    createdBy: String(row.created_by || ADMIN_EMAIL),
    createdAt: Number(row.created_at || 0),
    expiresAt,
    usedByEmail: row.used_by_email ? String(row.used_by_email) : null,
    usedAt: row.used_at != null ? Number(row.used_at) : null,
  };
}

function mapRequestRow(row: any): AccessCodeRequestRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    status: String(row.status || 'PENDING') as AccessCodeRequestRecord['status'],
    code: row.code ? String(row.code) : null,
    requestedAt: Number(row.requested_at || 0),
    resolvedAt: row.resolved_at != null ? Number(row.resolved_at) : null,
  };
}

async function hydrateFromFirestoreIfNeeded(): Promise<void> {
  ensureTables();
  const firestoreDb = getFirestoreDb();
  if (hydratedFromCloud || !firestoreDb) return;
  hydratedFromCloud = true;
  try {
    const snap = await firestoreDb.doc(FIRESTORE_DOC_PATH).get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    const db = getDb();

    if (Array.isArray(data.codes)) {
      const insertCode = db.prepare(`
        INSERT OR IGNORE INTO login_access_codes
          (code, target_email, status, created_by, created_at, expires_at, used_by_email, used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of data.codes) {
        if (!c?.code) continue;
        insertCode.run(
          String(c.code),
          c.targetEmail ? normalizeEmail(c.targetEmail) : null,
          String(c.status || 'ACTIVE'),
          String(c.createdBy || ADMIN_EMAIL),
          Number(c.createdAt || Date.now()),
          Number(c.expiresAt || Date.now() + DEFAULT_TTL_HOURS * 3600_000),
          c.usedByEmail ? normalizeEmail(c.usedByEmail) : null,
          c.usedAt != null ? Number(c.usedAt) : null
        );
      }
    }

    if (Array.isArray(data.requests)) {
      const insertReq = db.prepare(`
        INSERT OR IGNORE INTO login_code_requests
          (id, email, status, code, requested_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const r of data.requests) {
        if (!r?.id || !r?.email) continue;
        insertReq.run(
          String(r.id),
          normalizeEmail(r.email),
          String(r.status || 'PENDING'),
          r.code ? String(r.code) : null,
          Number(r.requestedAt || Date.now()),
          r.resolvedAt != null ? Number(r.resolvedAt) : null
        );
      }
    }
  } catch (err: any) {
    console.warn('[AccessCodes] Firestore hydration skipped:', err?.message || err);
  }
}

async function syncToFirestore(): Promise<void> {
  const firestoreDb = getFirestoreDb();
  if (!firestoreDb) return;
  try {
    const db = getDb();
    const codes = db
      .prepare('SELECT * FROM login_access_codes ORDER BY created_at DESC LIMIT 100')
      .all()
      .map(mapCodeRow);
    const requests = db
      .prepare('SELECT * FROM login_code_requests ORDER BY requested_at DESC LIMIT 100')
      .all()
      .map(mapRequestRow);
    await firestoreDb.doc(FIRESTORE_DOC_PATH).set(
      {
        codes,
        requests,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.warn('[AccessCodes] Firestore sync skipped:', err?.message || err);
  }
}

function generateUnique5DigitCode(): string {
  const db = getDb();
  for (let attempt = 0; attempt < 30; attempt++) {
    const num = crypto.randomInt(10000, 100000);
    const code = String(num);
    const exists = db
      .prepare('SELECT 1 FROM login_access_codes WHERE code = ?')
      .get(code);
    if (!exists) return code;
  }
  return String(crypto.randomInt(10000, 100000));
}

export async function requestLoginAccessCode(email: string): Promise<AccessCodeRequestRecord> {
  await hydrateFromFirestoreIfNeeded();
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address first.');
  }

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT * FROM login_code_requests WHERE email = ? AND status = 'PENDING' ORDER BY requested_at DESC LIMIT 1`
    )
    .get(cleanEmail);

  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE login_code_requests SET requested_at = ? WHERE id = ?').run(
      now,
      existing.id
    );
    void syncToFirestore();
    return mapRequestRow(
      db.prepare('SELECT * FROM login_code_requests WHERE id = ?').get(existing.id)
    );
  }

  const id = `req_${now}_${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(
    `INSERT INTO login_code_requests (id, email, status, code, requested_at, resolved_at)
     VALUES (?, ?, 'PENDING', NULL, ?, NULL)`
  ).run(id, cleanEmail, now);

  void syncToFirestore();
  return mapRequestRow(db.prepare('SELECT * FROM login_code_requests WHERE id = ?').get(id));
}

export async function generateLoginAccessCode(opts: {
  targetEmail?: string | null;
  requestId?: string | null;
  createdBy?: string;
  ttlHours?: number;
}): Promise<AccessCodeRecord> {
  await hydrateFromFirestoreIfNeeded();
  const db = getDb();
  const now = Date.now();
  const ttlHours = Math.max(1, Math.min(168, Number(opts.ttlHours) || DEFAULT_TTL_HOURS));
  const expiresAt = now + ttlHours * 3600_000;
  let targetEmail = opts.targetEmail ? normalizeEmail(opts.targetEmail) : null;

  if (opts.requestId) {
    const reqRow = db
      .prepare('SELECT * FROM login_code_requests WHERE id = ?')
      .get(opts.requestId);
    if (reqRow && !targetEmail) {
      targetEmail = normalizeEmail(reqRow.email);
    }
  }

  const code = generateUnique5DigitCode();
  const createdBy = normalizeEmail(opts.createdBy || ADMIN_EMAIL) || ADMIN_EMAIL;

  db.prepare(
    `INSERT INTO login_access_codes
       (code, target_email, status, created_by, created_at, expires_at, used_by_email, used_at)
     VALUES (?, ?, 'ACTIVE', ?, ?, ?, NULL, NULL)`
  ).run(code, targetEmail || null, createdBy, now, expiresAt);

  if (opts.requestId) {
    db.prepare(
      `UPDATE login_code_requests SET status = 'APPROVED', code = ?, resolved_at = ? WHERE id = ?`
    ).run(code, now, opts.requestId);
  } else if (targetEmail) {
    db.prepare(
      `UPDATE login_code_requests SET status = 'APPROVED', code = ?, resolved_at = ? WHERE email = ? AND status = 'PENDING'`
    ).run(code, now, targetEmail);
  }

  void syncToFirestore();
  return mapCodeRow(db.prepare('SELECT * FROM login_access_codes WHERE code = ?').get(code));
}

export async function verifyAndConsumeLoginAccessCode(
  email: string,
  rawCode: string
): Promise<{ ok: boolean; bypass?: boolean; error?: string }> {
  const cleanEmail = normalizeEmail(email);
  if (isAdminEmail(cleanEmail)) {
    return { ok: true, bypass: true };
  }

  await hydrateFromFirestoreIfNeeded();
  const code = String(rawCode || '').trim().replace(/\s+/g, '');
  if (!/^\d{5}$/.test(code)) {
    return {
      ok: false,
      error: 'A valid 5-digit admin access code is required to sign in.',
    };
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM login_access_codes WHERE code = ?').get(code);
  if (!row) {
    return {
      ok: false,
      error: 'Invalid 5-digit access code. Please request a fresh code from the admin.',
    };
  }

  const rec = mapCodeRow(row);
  if (rec.status === 'USED') {
    return {
      ok: false,
      error: 'This access code has already been used. Request a new 5-digit code from the admin.',
    };
  }
  if (rec.status === 'REVOKED') {
    return {
      ok: false,
      error: 'This access code has been revoked by the admin.',
    };
  }
  if (rec.status === 'EXPIRED') {
    db.prepare(`UPDATE login_access_codes SET status = 'EXPIRED' WHERE code = ?`).run(code);
    void syncToFirestore();
    return {
      ok: false,
      error: 'This access code has expired. Request a new 5-digit code from the admin.',
    };
  }

  if (rec.targetEmail && cleanEmail && rec.targetEmail !== cleanEmail) {
    return {
      ok: false,
      error: `This access code is assigned to a different account.`,
    };
  }

  const now = Date.now();
  db.prepare(
    `UPDATE login_access_codes SET status = 'USED', used_by_email = ?, used_at = ? WHERE code = ?`
  ).run(cleanEmail || 'unknown', now, code);

  void syncToFirestore();
  return { ok: true };
}

export async function revokeLoginAccessCode(code: string): Promise<{ ok: boolean; error?: string }> {
  await hydrateFromFirestoreIfNeeded();
  const cleanCode = String(code || '').trim();
  const db = getDb();
  const row = db.prepare('SELECT * FROM login_access_codes WHERE code = ?').get(cleanCode);
  if (!row) {
    return { ok: false, error: 'Code not found' };
  }
  db.prepare(`UPDATE login_access_codes SET status = 'REVOKED' WHERE code = ?`).run(cleanCode);
  void syncToFirestore();
  return { ok: true };
}

export async function listLoginAccessCodesAndRequests(): Promise<{
  codes: AccessCodeRecord[];
  requests: AccessCodeRequestRecord[];
}> {
  await hydrateFromFirestoreIfNeeded();
  const db = getDb();
  const codes = db
    .prepare('SELECT * FROM login_access_codes ORDER BY created_at DESC LIMIT 60')
    .all()
    .map(mapCodeRow);
  const requests = db
    .prepare('SELECT * FROM login_code_requests ORDER BY requested_at DESC LIMIT 60')
    .all()
    .map(mapRequestRow);
  return { codes, requests };
}
