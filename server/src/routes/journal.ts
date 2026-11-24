import express from 'express';
import { requireAuthenticatedUid } from '../modules/auth/requestAuth';
import {
  getUserTradingConfig,
  resolveEffectiveRiskUsd,
} from '../modules/execution/paperAutoTraderRegistry';
import { paperBrokerService } from '../modules/execution/paperBrokerService';
import {
  getJournalEntries,
  mapPaperTradeToJournalEntry,
  mapSignalToJournalEntry,
  saveJournalEntry,
  updateJournalEntry,
} from '../modules/journal/journalService';
import { firestore } from '../modules/market-data/firebaseAdmin';
import { ensureUserPaperHydrated } from '../modules/storage/paperCloudBackup';
import { buildCanonicalSignalKey, querySignals } from '../modules/storage/sqliteDb';

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

function getItemCanonicalKey(item: Record<string, any>): string {
  const rawSigId =
    item.signalId ||
    (typeof item.suggestionKey === 'string' && item.suggestionKey.startsWith('signal:')
      ? item.suggestionKey.slice(7)
      : undefined) ||
    (item.source === 'signal' || item.mode === 'signal' ? item.id : undefined);

  const rawTime = item.time ?? item.createdAt;
  const timeNum =
    typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 0
      ? rawTime > 1e12
        ? Math.floor(rawTime / 1000)
        : rawTime
      : undefined;

  return buildCanonicalSignalKey({
    id: rawSigId ? String(rawSigId) : undefined,
    strategyId: item.strategyId ? String(item.strategyId) : undefined,
    symbol: item.symbol ? String(item.symbol) : undefined,
    timeframe: item.timeframe ? String(item.timeframe) : undefined,
    direction: item.action
      ? String(item.action)
      : item.direction
        ? String(item.direction)
        : undefined,
    time: timeNum,
  });
}

// GET /api/journal
router.get('/', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;

    await ensureUserPaperHydrated(uid);

    const [
      uidEntries,
      uidPaperTrades,
      userCfg,
      sqliteSignals,
      fsSignalSnap,
    ] = await Promise.all([
      getJournalEntries(uid).catch(() => []),
      Promise.resolve(paperBrokerService.getAllTrades(uid, undefined, 500)),
      getUserTradingConfig(uid).catch(() => null),
      Promise.resolve()
        .then(() => querySignals({ limit: 400 }))
        .catch(() => []),
      firestore
        .collection('signals')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
        .catch(() => null),
    ]);

    const defaultRiskUsd = userCfg ? resolveEffectiveRiskUsd(userCfg) : 50;

    // Step A: Index user notes/overrides from stored journal entries strictly for this UID
    const storedById = new Map<string, Record<string, any>>();
    const storedByTradeId = new Map<string, Record<string, any>>();
    const storedBySignalId = new Map<string, Record<string, any>>();
    const storedByCanonicalKey = new Map<string, Record<string, any>>();
    const dedupedStored = new Map<string, Record<string, any>>();

    for (const entry of uidEntries) {
      if (!entry || !entry.id) continue;
      const id = String(entry.id);
      const prev = dedupedStored.get(id);
      const merged =
        prev && Number(prev.updatedAt || 0) > Number(entry.updatedAt || 0)
          ? { ...entry, ...prev }
          : { ...(prev || {}), ...entry };
      dedupedStored.set(id, merged);

      storedById.set(id, merged);
      if (merged.tradeId) storedByTradeId.set(String(merged.tradeId), merged);
      if (merged.signalId) storedBySignalId.set(String(merged.signalId), merged);
      if (typeof merged.suggestionKey === 'string' && merged.suggestionKey.startsWith('signal:')) {
        storedBySignalId.set(merged.suggestionKey.slice(7), merged);
      }
      const canonKey = getItemCanonicalKey(merged);
      if (canonKey) storedByCanonicalKey.set(canonKey, merged);
    }

    const result: Record<string, any>[] = [];
    const executedIds = new Set<string>();
    const executedSignalIds = new Set<string>();
    const executedCanonicalKeys = new Set<string>();

    // Step B (Priority 1): Map every Paper Broker trade belonging strictly to this UID
    const paperById = new Map<string, any>();
    for (const trade of uidPaperTrades) {
      if (trade && trade.id) paperById.set(String(trade.id), trade);
    }

    for (const trade of paperById.values()) {
      const mapped = mapPaperTradeToJournalEntry(trade);
      const tradeCanonKey = buildCanonicalSignalKey({
        id: trade.signalId || undefined,
        strategyId: trade.strategyId,
        symbol: trade.symbol,
        timeframe: trade.timeframe,
        direction: trade.direction,
        time: trade.createdAt,
      });

      const stored =
        storedById.get(mapped.id) ||
        storedByTradeId.get(mapped.id) ||
        (mapped.signalId ? storedBySignalId.get(String(mapped.signalId)) : undefined) ||
        (tradeCanonKey ? storedByCanonicalKey.get(tradeCanonKey) : undefined);

      if (stored && typeof stored.notes === 'string') {
        mapped.notes = stored.notes;
      }

      result.push(mapped);
      executedIds.add(mapped.id);
      if (mapped.signalId) executedSignalIds.add(String(mapped.signalId));
      if (tradeCanonKey) executedCanonicalKeys.add(tradeCanonKey);
    }

    // Step C (Priority 2): Add remaining stored manual journal entries (taken: true) for this UID
    for (const stored of dedupedStored.values()) {
      if (stored.taken !== true) continue;
      const id = String(stored.id);
      const tradeId = stored.tradeId ? String(stored.tradeId) : null;
      const signalId = stored.signalId
        ? String(stored.signalId)
        : typeof stored.suggestionKey === 'string' && stored.suggestionKey.startsWith('signal:')
          ? stored.suggestionKey.slice(7)
          : null;
      const canonKey = getItemCanonicalKey(stored);

      if (
        executedIds.has(id) ||
        (tradeId && executedIds.has(tradeId)) ||
        (signalId && (executedSignalIds.has(signalId) || executedIds.has(signalId))) ||
        (canonKey && executedCanonicalKeys.has(canonKey))
      ) {
        continue;
      }

      result.push(stored);
      executedIds.add(id);
      if (tradeId) executedIds.add(tradeId);
      if (signalId) executedSignalIds.add(signalId);
      if (canonKey) executedCanonicalKeys.add(canonKey);
    }

    // Step D (Priority 3): Map global SQLite + Firestore scanner signals not covered by a user trade
    const fsSignals: Record<string, any>[] = [];
    if (Array.isArray(fsSignalSnap?.docs)) {
      for (const doc of fsSignalSnap.docs) {
        fsSignals.push({ id: doc.id, ...doc.data() });
      }
    } else if (typeof fsSignalSnap?.forEach === 'function') {
      fsSignalSnap.forEach((doc: any) => {
        fsSignals.push({ id: doc.id, ...doc.data() });
      });
    }

    const signalsByKey = new Map<string, Record<string, any>>();
    const sigIdToKey = new Map<string, string>();
    for (const sig of [...fsSignals, ...sqliteSignals]) {
      if (!sig || !sig.id) continue;
      const sigId = String(sig.id);
      const canonKey = getItemCanonicalKey({ ...sig, source: 'signal' });
      const existingKey = sigIdToKey.get(sigId);
      const dedupeKey = canonKey || existingKey || sigId;

      if (existingKey && existingKey !== dedupeKey && signalsByKey.has(existingKey)) {
        const moved = signalsByKey.get(existingKey)!;
        signalsByKey.delete(existingKey);
        if (!signalsByKey.has(dedupeKey)) {
          signalsByKey.set(dedupeKey, moved);
        }
      }

      const prev = signalsByKey.get(dedupeKey);
      if (!prev) {
        signalsByKey.set(dedupeKey, sig);
      } else {
        const prevRank = signalStatusRank(prev.status);
        const currRank = signalStatusRank(sig.status);
        signalsByKey.set(
          dedupeKey,
          currRank >= prevRank ? { ...prev, ...sig } : { ...sig, ...prev }
        );
      }
      sigIdToKey.set(sigId, dedupeKey);
    }

    for (const sig of signalsByKey.values()) {
      const sigId = String(sig.id);
      const canonKey = getItemCanonicalKey({ ...sig, source: 'signal' });
      if (
        executedSignalIds.has(sigId) ||
        executedIds.has(sigId) ||
        (canonKey && executedCanonicalKeys.has(canonKey))
      ) {
        continue;
      }

      const mapped = mapSignalToJournalEntry(sig, defaultRiskUsd);
      const stored =
        storedById.get(sigId) ||
        storedBySignalId.get(sigId) ||
        (canonKey ? storedByCanonicalKey.get(canonKey) : undefined);

      if (stored) {
        if (typeof stored.notes === 'string') {
          mapped.notes = stored.notes;
        }
        if (mapped.outcome === 'pending' && stored.outcome && stored.outcome !== 'pending') {
          mapped.outcome = stored.outcome;
          if (typeof stored.pnlUsd === 'number' && Number.isFinite(stored.pnlUsd)) {
            mapped.pnlUsd = stored.pnlUsd;
          }
        }
      }

      result.push(mapped);
    }

    result.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    res.json(result);
  } catch (err: any) {
    console.error('[journal GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load journal entries' });
  }
});

// POST /api/journal
router.post('/', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const entry = await saveJournalEntry({ ...(req.body || {}), uid });
    res.json({ success: true, entry });
  } catch (err: any) {
    console.error('[journal POST] Error:', err.message);
    res.status(500).json({ error: 'Failed to save trade journal entry' });
  }
});

// PATCH /api/journal/:id
router.patch('/:id', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const { id } = req.params;
    const result = await updateJournalEntry(id, { ...(req.body || {}), uid });

    if (!result.found) {
      res.status(404).json({ error: 'Journal entry not found' });
      return;
    }

    res.json({ success: true, entry: result.entry });
  } catch (err: any) {
    console.error('[journal PATCH] Error:', err.message);
    res.status(500).json({ error: 'Failed to update journal entry' });
  }
});

export default router;
