import { admin } from '../market-data/firebaseAdmin';

const FORBIDDEN_UIDS = new Set(['default_trader', 'undefined', 'null', 'anonymous']);

export function sanitizeUid(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/[^a-zA-Z0-9_.:@-]/g, '').slice(0, 128);
}

export function isValidUserUid(uid: unknown): uid is string {
  if (typeof uid !== 'string') {
    return false;
  }
  const sanitized = sanitizeUid(uid);
  if (!sanitized || sanitized.length < 4) {
    return false;
  }
  if (FORBIDDEN_UIDS.has(sanitized.toLowerCase())) {
    return false;
  }
  return true;
}

export async function resolveAuthenticatedUid(req: any): Promise<string | null> {
  const rawAuthHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  const authHeader = typeof rawAuthHeader === 'string' ? rawAuthHeader.trim() : '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (
      token &&
      token !== 'null' &&
      token !== 'undefined' &&
      Array.isArray(admin?.apps) &&
      admin.apps.length > 0
    ) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        const verifiedUid = sanitizeUid(decoded?.uid);
        if (isValidUserUid(verifiedUid)) {
          return verifiedUid;
        }
      } catch (err: any) {
        console.warn('[Auth] verifyIdToken fallback notice:', err?.message || err);
      }
    }
  }

  const candidates = [
    req?.headers?.['x-traxo-uid'] ?? req?.headers?.['X-Traxo-Uid'],
    req?.query?.uid,
    req?.body?.uid,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeUid(candidate);
    if (isValidUserUid(sanitized)) {
      return sanitized;
    }
  }

  return null;
}

export async function requireAuthenticatedUid(req: any, res: any): Promise<string | null> {
  const uid = await resolveAuthenticatedUid(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return null;
  }
  return uid;
}
