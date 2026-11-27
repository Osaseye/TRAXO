import express from 'express';
import { requireAuthenticatedUid } from '../modules/auth/requestAuth';
import {
  deleteUserWebhookConfig,
  getUserBrokerOverview,
  saveUserWebhookConfig,
  sendTestWebhookForUser,
} from '../modules/brokers/brokerRouter';

const router = express.Router();

router.get('/connections', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const overview = await getUserBrokerOverview(uid);
    res.json({ ok: true, ...overview });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to load broker connections' });
  }
});

router.post('/webhook', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const { enabled, url, preset, triggerMode, secret, clearSecret } = req.body || {};
    const webhook = await saveUserWebhookConfig(uid, {
      enabled,
      url,
      preset,
      triggerMode,
      secret,
      clearSecret,
    });
    res.json({ ok: true, webhook });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to save webhook settings' });
  }
});

router.post('/webhook/test', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const delivery = await sendTestWebhookForUser(uid);
    res.json({ ok: delivery.ok, delivery });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to send test webhook' });
  }
});

router.delete('/webhook', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    await deleteUserWebhookConfig(uid);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to remove webhook' });
  }
});

export default router;
