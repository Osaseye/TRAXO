import redis from '../market-data/redisClient';
import { firestore } from '../market-data/firebaseAdmin';

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

export async function updateSignalStatus(signalId: string, status: string): Promise<void> {
  try {
    await firestore.collection('signals').doc(signalId).update({
      status,
      resolvedAt: new Date(),
    });
  } catch (error) {
    console.error(`Error updating signal ${signalId} status in Firestore:`, error);
  }
}

export async function getActiveLiveSignals(symbol: string, timeframe: string): Promise<any[]> {
  try {
    const snapshot = await firestore
      .collection('signals')
      .where('symbol', '==', symbol)
      .where('timeframe', '==', timeframe)
      .where('status', '==', 'live')
      .get();

    if (!snapshot || snapshot.empty) return [];
    return snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
  } catch (error) {
    console.error(`Error fetching active live signals for ${symbol}:${timeframe}:`, error);
    return [];
  }
}
