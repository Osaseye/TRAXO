const { admin, firestore } = require('../services/firebaseAdmin');

function getTimestamp(value) {
  if (!value) return null;
  return typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
}

function setupAuthRoutes(app) {
  // Verify token endpoint
  app.post('/verify-token', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      res.json({ ok: true, uid: decoded.uid, email: decoded.email, decoded });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token', details: err.message });
    }
  });

  // Authenticated profile endpoint
  app.post('/api/profile', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const snapshot = firestore ? await firestore.collection('users').doc(decoded.uid).get() : null;
      const data = snapshot && snapshot.exists ? snapshot.data() : {};
      const profile = {
        id: decoded.uid,
        email: data?.email || decoded.email || null,
        full_name: data?.fullName || data?.name || null,
        display_name: data?.displayName || data?.fullName || data?.name || decoded.name || decoded.email || 'TRAXO Trader',
        dob: data?.dob || null,
        country: data?.country || null,
        bio: data?.bio || null,
        plan: data?.plan || 'free',
        subscription_status: data?.subscriptionStatus || 'active',
        created_at: data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data?.createdAt || null,
        updated_at: data?.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data?.updatedAt || null,
      };
      res.json({ ok: true, profile });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token', details: err.message });
    }
  });

  // Authenticated trades endpoint
  app.get('/api/trades', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      if (!firestore) {
        return res.status(503).json({ error: 'Firestore unavailable' });
      }

      const snapshot = await firestore.collection('trades').where('userId', '==', decoded.uid).orderBy('createdAt', 'desc').limit(20).get();
      const trades = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          symbol: data.symbol ?? null,
          side: data.side ?? null,
          entry: data.entry ?? null,
          exit: data.exit ?? null,
          rr: data.rr ?? null,
          status: data.status ?? 'open',
          created_at: getTimestamp(data.createdAt),
          updated_at: getTimestamp(data.updatedAt),
        };
      });

      res.json({ ok: true, uid: decoded.uid, trades });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token', details: err.message });
    }
  });
}

module.exports = { setupAuthRoutes };
