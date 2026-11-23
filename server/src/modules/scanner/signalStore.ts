import redis from '../market-data/redisClient';
import { firestore } from '../market-data/firebaseAdmin';
import {
  queryActiveLiveSignals,
  querySignals,
  updateSignalStatusSqlite,
  upsertSignal,
} from '../storage/sqliteDb';

export const getLiveSignalKey = (symbol: string, interval: string, strategyId?: string): string =>
  `signals:live:${symbol}:${interval}:${strategyId || 'any'}`;

export async function cacheLiveSignal(signal: any): Promise<void> {
  const key = getLiveSignalKey(signal.symbol, signal.timeframe || signal.interval, signal.strategyId);
  const ttlSeconds = 3600;
  try {
    await redis.set(key, JSON.stringify(signal), 'EX', ttlSeconds);
  } catch (error) {
    console.error(`Error caching live signal for ${signal.symbol} in Redis:`, error);
  }
}

export async function getLiveSignal(
  symbol: string,
  interval: string,
  strategyId?: string
): Promise<any | null> {
  const key = getLiveSignalKey(symbol, interval, strategyId);
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Error getting live signal for ${symbol} from Redis:`, error);
    return null;
  }
}

export async function saveHistoricalSignal(signal: any): Promise<void> {
  try {
    upsertSignal(signal);
  } catch {}

  try {
    const signalWithTimestamp = {
      ...signal,
      createdAt: new Date(),
      status: signal.status || 'live',
    };
    await firestore.collection('signals').doc(signal.id).set(signalWithTimestamp, { merge: true });
  } catch (error) {
    console.error(`Error saving historical signal for ${signal.symbol} to Firestore:`, error);
  }
}

export async function hasHistoricalSignal(signalId: string): Promise<boolean> {
  try {
    const snapshot = await firestore.collection('signals').doc(signalId).get();
    return Boolean(snapshot?.exists);
  } catch (error) {
    console.error(`Error checking historical signal ${signalId} in Firestore:`, error);
    return false;
  }
}

export async function updateSignalStatus(
  signalId: string,
  status: string,
  exitPrice?: number | null
): Promise<void> {
  try {
    updateSignalStatusSqlite(signalId, status, exitPrice);
  } catch {}

  try {
    const updates: Record<string, any> = {
      status,
      resolvedAt: new Date(),
    };
    if (exitPrice !== undefined && exitPrice !== null) {
      updates.exitPrice = exitPrice;
    }
    await firestore.collection('signals').doc(signalId).update(updates);
  } catch (error) {
    console.error(`Error updating signal ${signalId} status in Firestore:`, error);
  }
}

export async function getActiveLiveSignals(symbol: string, timeframe?: string): Promise<any[]> {
  const byId = new Map<string, any>();
  const nonLiveSqliteIds = new Set<string>();

  try {
    const sqliteLive = queryActiveLiveSignals(symbol, timeframe);
    for (const sig of sqliteLive) {
      if (sig && sig.id) {
        byId.set(String(sig.id), sig);
      }
    }
    const sqliteAll = querySignals({ symbol, timeframe, limit: 500 });
    for (const sig of sqliteAll) {
      if (sig && sig.id && String(sig.status || '').toLowerCase() !== 'live') {
        nonLiveSqliteIds.add(String(sig.id));
      }
    }
  } catch {}

  try {
    let query: any = firestore.collection('signals').where('symbol', '==', symbol);
    if (timeframe) {
      query = query.where('timeframe', '==', timeframe);
    }
    const snapshot = await query.where('status', '==', 'live').get();

    if (snapshot && !snapshot.empty) {
      for (const doc of snapshot.docs || []) {
        const id = String(doc.id);
        if (nonLiveSqliteIds.has(id)) continue;
        const fsSig = { ...doc.data(), id };
        const existing = byId.get(id);
        byId.set(id, existing ? { ...fsSig, ...existing } : fsSig);
      }
    }
  } catch (error) {
    console.error(`Error fetching active live signals for ${symbol}:${timeframe || '*'}:`, error);
  }

  return Array.from(byId.values());
}
