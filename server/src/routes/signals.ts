import express from 'express';
import { firestore } from '../modules/market-data/firebaseAdmin';
import redis from '../modules/market-data/redisClient';
import { queryActiveLiveSignals, querySignals } from '../modules/storage/sqliteDb';

const router = express.Router();

function signalStatusRank(status: unknown): number {
  const s = String(status || '').trim().toUpperCase();
  if (
    s === 'WIN' ||
    s === 'WON' ||
    s === 'LOSS' ||
    s === 'LOST' ||
    s.startsWith('WIN_') ||
    s === 'LOSS_SL'
  ) {
    return 3;
  }
  if (s === 'EXPIRED' || s === 'CANCELLED' || s === 'STALE') {
    return 2;
  }
  if (s === 'LIVE' || s === 'ACTIVE' || s === 'PENDING') {
    return 1;
  }
  return 0;
}

function toSortableMs(sig: any): number {
  const raw = sig?.createdAt;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (raw && typeof raw.toMillis === 'function') {
    const ms = raw.toMillis();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  if (raw && typeof raw.seconds === 'number' && Number.isFinite(raw.seconds)) {
    return raw.seconds * 1000;
  }
  if (raw && typeof raw._seconds === 'number' && Number.isFinite(raw._seconds)) {
    return raw._seconds * 1000;
  }
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return raw.getTime();
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const t = Number(sig?.time || 0);
  if (Number.isFinite(t) && t > 0) {
    return t > 1e12 ? t : t * 1000;
  }
  return 0;
}

function mergeSignalRecord(existing: any, incoming: any): any {
  if (!existing) return incoming;
  const existingRank = signalStatusRank(existing.status);
  const incomingRank = signalStatusRank(incoming.status);
  if (incomingRank > existingRank) {
    return { ...existing, ...incoming };
  }
  if (incomingRank < existingRank) {
    return { ...incoming, ...existing };
  }
  return { ...existing, ...incoming };
}

// GET /api/signals/historical
router.get('/historical', async (req: any, res: any) => {
  try {
    const { lastVisible } = req.query;
    const rawLimit = Number(req.query?.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(500, Math.max(1, Math.floor(rawLimit)))
        : 200;

    let fsSignals: any[] = [];
    let nextLastVisible: string | null = null;

    try {
      let query: any = firestore.collection('signals').orderBy('createdAt', 'desc').limit(limit);

      if (lastVisible) {
        const lastVisibleDoc = await firestore.collection('signals').doc(String(lastVisible)).get();
        if (lastVisibleDoc?.exists) {
          query = query.startAfter(lastVisibleDoc);
        }
      }

      const snapshot = await query.get();
      if (snapshot?.forEach) {
        snapshot.forEach((doc: any) => {
          fsSignals.push({ id: doc.id, ...doc.data() });
        });
      } else if (Array.isArray(snapshot?.docs)) {
        snapshot.docs.forEach((doc: any) => {
          fsSignals.push({ id: doc.id, ...doc.data() });
        });
      }

      const docs = snapshot?.docs || [];
      nextLastVisible = docs.length > 0 ? docs[docs.length - 1].id : null;
    } catch (fsErr: any) {
      console.warn('Firestore historical signals query warning:', fsErr?.message || fsErr);
    }

    let sqliteSignals: any[] = [];
    if (!lastVisible) {
      try {
        sqliteSignals = querySignals({ limit });
      } catch (sqlErr: any) {
        console.warn('SQLite historical signals query warning:', sqlErr?.message || sqlErr);
      }
    }

    const mergedById = new Map<string, any>();
    for (const sig of [...fsSignals, ...sqliteSignals]) {
      if (!sig || !sig.id) continue;
      const key = String(sig.id);
      mergedById.set(key, mergeSignalRecord(mergedById.get(key), sig));
    }

    const signals = Array.from(mergedById.values())
      .sort((a, b) => toSortableMs(b) - toSortableMs(a))
      .slice(0, limit);

    res.json({
      signals,
      lastVisible: nextLastVisible,
    });
  } catch (error) {
    console.error('Error fetching historical signals:', error);
    res.status(500).json({ error: 'Failed to retrieve historical signals.' });
  }
});

// GET /api/signals/live
router.get('/live', async (_req: any, res: any) => {
  try {
    let redisSignals: any[] = [];
    try {
      const keys: string[] = await new Promise((resolve, reject) => {
        const found: string[] = [];
        const stream = redis.scanStream({
          match: 'signals:live:*:*',
          count: 100,
        });

        stream.on('data', (resultKeys: string[]) => {
          for (const key of resultKeys) {
            found.push(key);
          }
        });

        stream.on('end', () => resolve(found));
        stream.on('error', reject);
      });

      if (keys.length > 0) {
        const values = await redis.mget(keys);
        redisSignals = values
          .filter(Boolean)
          .map((val) => {
            try {
              return JSON.parse(val!);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }
    } catch (redisErr: any) {
      console.warn('Redis live signals query warning:', redisErr?.message || redisErr);
    }

    let sqliteLive: any[] = [];
    const resolvedOrExpiredIds = new Set<string>();
    try {
      sqliteLive = queryActiveLiveSignals();
      const recentSqlite = querySignals({ limit: 500 });
      for (const s of recentSqlite) {
        if (s && s.id && String(s.status || '').toLowerCase() !== 'live') {
          resolvedOrExpiredIds.add(String(s.id));
        }
      }
    } catch (sqlErr: any) {
      console.warn('SQLite live signals query warning:', sqlErr?.message || sqlErr);
    }

    const byId = new Map<string, any>();
    for (const sig of redisSignals) {
      if (!sig || !sig.id) continue;
      const id = String(sig.id);
      if (resolvedOrExpiredIds.has(id)) continue;
      if (String(sig.status || 'live').toLowerCase() !== 'live') continue;
      byId.set(id, sig);
    }

    for (const sig of sqliteLive) {
      if (!sig || !sig.id) continue;
      const id = String(sig.id);
      if (resolvedOrExpiredIds.has(id)) continue;
      const existing = byId.get(id);
      byId.set(id, existing ? { ...existing, ...sig } : sig);
    }

    const liveSignals = Array.from(byId.values()).sort(
      (a, b) => toSortableMs(b) - toSortableMs(a)
    );

    res.json(liveSignals);
  } catch (error) {
    console.error('Error fetching live signals:', error);
    res.status(500).json({ error: 'Failed to retrieve live signals.' });
  }
});

export default router;
