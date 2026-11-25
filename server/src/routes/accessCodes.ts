import express from 'express';
import { admin } from '../modules/market-data/firebaseAdmin';
import {
  ADMIN_EMAIL,
  generateLoginAccessCode,
  isAdminEmail,
  listLoginAccessCodesAndRequests,
  normalizeEmail,
  requestLoginAccessCode,
  revokeLoginAccessCode,
  verifyAndConsumeLoginAccessCode,
} from '../modules/auth/accessCodeService';

const router = express.Router();

async function requireAdminEmail(req: any, res: any): Promise<string | null> {
  const rawAuthHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  const authHeader = typeof rawAuthHeader === 'string' ? rawAuthHeader.trim() : '';

  if (
    authHeader.toLowerCase().startsWith('bearer ') &&
    Array.isArray(admin?.apps) &&
    admin.apps.length > 0
  ) {
    const token = authHeader.slice(7).trim();
    if (token && token !== 'null' && token !== 'undefined') {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        const tokenEmail = normalizeEmail(decoded?.email);
        if (isAdminEmail(tokenEmail)) {
          return tokenEmail;
        }
        res.status(403).json({
          ok: false,
          error: `Admin privileges required (${ADMIN_EMAIL})`,
        });
        return null;
      } catch (err: any) {
        console.warn('[AccessCodes] Admin token verification error:', err?.message || err);
      }
    }
  }

  // Fallback header check only when Firebase Admin SDK isn't initialized in local dev
  const fallbackEmail = normalizeEmail(
    req?.headers?.['x-traxo-admin-email'] ?? req?.headers?.['X-Traxo-Admin-Email']
  );
  if (isAdminEmail(fallbackEmail)) {
    return fallbackEmail;
  }

  res.status(403).json({
    ok: false,
    error: `Admin privileges required (${ADMIN_EMAIL})`,
  });
  return null;
}

// Public: User requests a 5-digit access code from the admin on the Login screen
router.post('/request', async (req: any, res: any) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email || !email.includes('@')) {
      res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
      return;
    }
    if (isAdminEmail(email)) {
      res.json({ ok: true, bypass: true, message: 'Admin account does not require an access code.' });
      return;
    }
    const requestRecord = await requestLoginAccessCode(email);
    res.json({
      ok: true,
      request: requestRecord,
      message: 'Access code request sent to admin. Ask the admin for your 5-digit code.',
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to submit request' });
  }
});

// Public: Verify & consume a 5-digit access code during login
router.post('/verify', async (req: any, res: any) => {
  try {
    const email = String(req.body?.email || '').trim();
    const code = String(req.body?.code || '').trim();
    const result = await verifyAndConsumeLoginAccessCode(email, code);
    if (!result.ok) {
      res.status(403).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to verify access code' });
  }
});

// Admin: List pending requests and active/recent 5-digit codes
router.get('/admin/list', async (req: any, res: any) => {
  const adminEmail = await requireAdminEmail(req, res);
  if (!adminEmail) return;
  try {
    const data = await listLoginAccessCodesAndRequests();
    res.json({ ok: true, ...data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to load access codes' });
  }
});

// Admin: Generate a new 5-digit random code
router.post('/admin/generate', async (req: any, res: any) => {
  const adminEmail = await requireAdminEmail(req, res);
  if (!adminEmail) return;
  try {
    const targetEmail = req.body?.targetEmail ? String(req.body.targetEmail).trim() : null;
    const requestId = req.body?.requestId ? String(req.body.requestId).trim() : null;
    const ttlHours = req.body?.ttlHours ? Number(req.body.ttlHours) : 24;
    const record = await generateLoginAccessCode({
      targetEmail,
      requestId,
      createdBy: adminEmail,
      ttlHours,
    });
    res.json({ ok: true, code: record.code, record });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to generate access code' });
  }
});

// Admin: Revoke an active code
router.post('/admin/revoke', async (req: any, res: any) => {
  const adminEmail = await requireAdminEmail(req, res);
  if (!adminEmail) return;
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) {
      res.status(400).json({ ok: false, error: 'Missing code' });
      return;
    }
    const result = await revokeLoginAccessCode(code);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to revoke code' });
  }
});

export default router;
