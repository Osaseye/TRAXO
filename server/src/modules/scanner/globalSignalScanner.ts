import redis from '../market-data/redisClient';
import { firestore } from '../market-data/firebaseAdmin';

export interface ScanState {
  running: boolean;
  current: string;
  done: number;
  total: number;
  lastCompletedAt: string | null;
  lastError: string | null;
}

const scanState: ScanState = {
  running: false,
  current: '',
  done: 0,
  total: 0,
  lastCompletedAt: null,
  lastError: null,
};

export function getGlobalScanStatus(): ScanState {
  return { ...scanState };
}

export function updateScanState(patch: Partial<ScanState>): void {
  Object.assign(scanState, patch);
}

export async function getLiveSignalsFromRedis(): Promise<any[]> {
  try {
    const keys: string[] = await new Promise((resolve, reject) => {
      const found: string[] = [];
      const stream = redis.scanStream({ match: 'signals:live:*', count: 500 });
      stream.on('data', (batch: string[]) => found.push(...batch));
      stream.on('end', () => resolve(found));
      stream.on('error', reject);
    });

    if (keys.length === 0) return [];

    const values = await redis.mget(keys);
    return values
      .filter(Boolean)
      .map((v) => {
        try {
          return JSON.parse(v!);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err: any) {
    console.error('[globalSignalScanner] Redis live fetch error:', err.message);
    return [];
  }
}

export async function getHistoricalSignalsFromFirestore(params: {
  symbol?: string | null;
  timeframe?: string | null;
  strategyIds?: string[] | null;
  limit: number;
}): Promise<any[]> {
  const { symbol, timeframe, strategyIds, limit } = params;
  try {
    let query = firestore.collection('signals').orderBy('createdAt', 'desc').limit(limit);
    if (symbol) query = query.where('symbol', '==', symbol);
    if (timeframe) query = query.where('timeframe', '==', timeframe);

    const snapshot = await query.get();
    let docs = (snapshot?.docs || []).map((d: any) => ({ ...d.data(), id: d.id }));

    if (Array.isArray(strategyIds) && strategyIds.length > 0) {
      const set = new Set(strategyIds);
      docs = docs.filter((s: any) => set.has(s.strategyId));
    }

    return docs;
  } catch (err: any) {
    console.error('[globalSignalScanner] Firestore fetch error:', err.message);
    return [];
  }
}

export async function getGlobalSignals(params: {
  symbol?: string | null;
  timeframe?: string | null;
  strategyIds?: string[] | null;
  limit?: number;
}): Promise<any[]> {
  const { symbol, timeframe, strategyIds, limit = 50 } = params;
  const l = Number.isFinite(Number(limit)) ? Number(limit) : 50;

  const liveSignals = await getLiveSignalsFromRedis();
  const historicalSignals = await getHistoricalSignalsFromFirestore({
    symbol,
    timeframe,
    strategyIds,
    limit: l,
  });

  const merged = new Map<string, any>();
  for (const s of historicalSignals) merged.set(s.id, s);
  for (const s of liveSignals) merged.set(s.id, { ...s, status: s.status || 'live' });

  let list = [...merged.values()];
  if (symbol) list = list.filter((s) => s.symbol === symbol);
  if (timeframe) list = list.filter((s) => s.timeframe === timeframe);
  if (Array.isArray(strategyIds) && strategyIds.length > 0) {
    const set = new Set(strategyIds);
    list = list.filter((s) => set.has(s.strategyId));
  }

  list.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return list.slice(0, l);
}

export function startGlobalSignalScannerIfNeeded(): void {
  // Real scan is driven by scannerCron -> signalScanner.ts
}
