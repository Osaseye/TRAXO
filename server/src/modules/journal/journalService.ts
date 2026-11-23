import { firestore } from '../market-data/firebaseAdmin';
import { processResolvedLoss, processResolvedWin } from '../optimizer/strategyOptimizer';
import { loadGuardrailConfig, recordTradeResolutionForRisk } from '../risk/guardrails';
import type { PaperTradeRecord, PaperTradeStatus } from '../execution/executionBroker';

// In-memory store per UID so auto-traded / live / manual journal writes and updates
// never vanish if Firestore is offline or slow.
const memoryJournalByUid = new Map<string, Map<string, Record<string, any>>>();

function getMemoryBucket(uid: string): Map<string, Record<string, any>> {
  let bucket = memoryJournalByUid.get(uid);
  if (!bucket) {
    bucket = new Map();
    memoryJournalByUid.set(uid, bucket);
  }
  return bucket;
}

export function normalizeCreatedAtMs(raw: any, fallbackTimeSec?: any): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (raw instanceof Date) {
    const ms = raw.getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  if (raw && typeof raw === 'object') {
    if (typeof raw.toMillis === 'function') {
      const ms = raw.toMillis();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    const sec = raw.seconds ?? raw._seconds;
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
      return sec * 1000;
    }
  }
  if (typeof raw === 'string' && raw.trim()) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return num > 1e12 ? num : num * 1000;
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (fallbackTimeSec !== undefined && fallbackTimeSec !== null) {
    const ft = Number(fallbackTimeSec);
    if (Number.isFinite(ft) && ft > 0) {
      return ft > 1e12 ? ft : ft * 1000;
    }
    if (typeof fallbackTimeSec === 'string') {
      const parsed = Date.parse(fallbackTimeSec);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return Date.now();
}

export function mapSignalToJournalEntry(
  sig: Record<string, any>,
  defaultRiskUsd = 50
): Record<string, any> {
  const rawStatus = String(sig.status || 'live').trim().toLowerCase();
  let outcome: 'pending' | 'skipped' | 'win' | 'loss' = 'pending';
  if (
    rawStatus === 'win' ||
    rawStatus === 'won' ||
    rawStatus === 'tp' ||
    rawStatus === 'tp_hit' ||
    rawStatus === 'win_tp1' ||
    rawStatus === 'win_tp2' ||
    rawStatus === 'win_tp1_be'
  ) {
    outcome = 'win';
  } else if (
    rawStatus === 'loss' ||
    rawStatus === 'lost' ||
    rawStatus === 'sl' ||
    rawStatus === 'sl_hit' ||
    rawStatus === 'loss_sl'
  ) {
    outcome = 'loss';
  } else if (rawStatus === 'expired' || rawStatus === 'stale' || rawStatus === 'cancelled') {
    outcome = 'skipped';
  }

  const entryNum = Number(sig.entry || 0);
  const slNum = Number(sig.sl || 0);
  const tpNum = Number(sig.tp || 0);
  const riskDist = Math.abs(entryNum - slNum);
  const rewardDist = Math.abs(tpNum - entryNum);
  const rr =
    Number(sig.rr) > 0
      ? Number(sig.rr)
      : riskDist > 0
        ? Number((rewardDist / riskDist).toFixed(2))
        : 0;

  const pnlUsd =
    outcome === 'win'
      ? Number((defaultRiskUsd * rr).toFixed(2))
      : outcome === 'loss'
        ? -Number(defaultRiskUsd.toFixed(2))
        : 0;
  const pnlR =
    outcome === 'win' ? Number(rr.toFixed(2)) : outcome === 'loss' ? -1 : 0;

  return {
    id: String(sig.id),
    signalId: String(sig.id),
    suggestionKey: `signal:${sig.id}`,
    symbol: String(sig.symbol || ''),
    timeframe: String(sig.timeframe || ''),
    strategy: String(sig.strategyLabel || sig.strategyId || 'TRAXO Engine'),
    action: String(sig.direction).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    entry: entryNum,
    sl: slNum,
    tp: tpNum,
    tp2: sig.tp2 != null ? Number(sig.tp2) : null,
    rr,
    confidence: Number(sig.confidence || 50),
    risk: sig.risk || 'Medium',
    suggestedPosition: 0,
    riskAmount: defaultRiskUsd,
    taken: false,
    outcome,
    pnlUsd,
    pnlR,
    exitPrice: sig.exitPrice != null ? Number(sig.exitPrice) : null,
    mode: 'signal',
    source: 'signal',
    status: String(sig.status || 'live'),
    notes: Array.isArray(sig.reason)
      ? sig.reason.join(' · ')
      : Array.isArray(sig.reasons)
        ? sig.reasons.join(' · ')
        : typeof sig.notes === 'string'
          ? sig.notes
          : '',
    createdAt: normalizeCreatedAtMs(sig.createdAt, sig.time),
  };
}

export function mapPaperStatusToJournalOutcome(
  status: PaperTradeStatus,
  realizedPnlUsd: number
): 'pending' | 'skipped' | 'win' | 'loss' | 'breakeven' {
  if (status === 'WIN_TP1' || status === 'WIN_TP2' || status === 'WIN_TP1_BE') {
    return 'win';
  }
  if (status === 'LOSS_SL') {
    return 'loss';
  }
  if (status === 'CLOSED_MANUAL') {
    if (realizedPnlUsd > 0) return 'win';
    if (realizedPnlUsd < 0) return 'loss';
    return 'breakeven';
  }
  if (status === 'EXPIRED' || status === 'CANCELLED') {
    return 'skipped';
  }
  return 'pending';
}

export function mapPaperTradeToJournalEntry(trade: PaperTradeRecord): Record<string, any> {
  const outcome = mapPaperStatusToJournalOutcome(trade.status, trade.realizedPnlUsd);
  return {
    id: trade.id,
    suggestionKey: trade.signalId ? `signal:${trade.signalId}` : `trade:${trade.id}`,
    symbol: trade.symbol,
    timeframe: trade.timeframe,
    strategy: trade.strategyLabel,
    action: trade.direction,
    entry: trade.fillPrice ?? trade.requestedEntry,
    sl: trade.slPrice,
    currentSl: trade.currentSl,
    tp: trade.tp1Price,
    tp2: trade.tp2Price ?? null,
    rr: trade.plannedRr,
    confidence: trade.confidence,
    risk: trade.tier === 'PRIME' ? 'Low' : trade.tier === 'STANDARD' ? 'Medium' : 'High',
    suggestedPosition: trade.initialVolume,
    riskAmount: trade.riskAmountUsd,
    taken: true,
    outcome,
    pnlUsd: trade.realizedPnlUsd,
    pnlR: trade.realizedR,
    exitPrice: trade.exitPrice ?? null,
    tradeId: trade.id,
    signalId: trade.signalId ?? null,
    mode: 'paper' as const,
    status: trade.status,
    source: 'paper',
    notes: Array.isArray(trade.reasons) ? trade.reasons.join(' · ') : '',
    createdAt: trade.createdAt > 1e12 ? trade.createdAt : trade.createdAt * 1000,
    updatedAt: Date.now(),
  };
}

export async function syncPaperTradeToJournal(trade: PaperTradeRecord): Promise<Record<string, any>> {
  const uid = trade.uid || 'default_trader';
  const entry = mapPaperTradeToJournalEntry(trade);
  getMemoryBucket(uid).set(entry.id, entry);
  try {
    const docRef = firestore.collection('users').doc(uid).collection('journal').doc(entry.id);
    await docRef.set(entry, { merge: true });
  } catch {
    // Non-fatal when Firestore unavailable — in-memory + SQLite paper_trades remain authoritative
  }
  return entry;
}

export async function getJournalEntries(uid = 'default_trader'): Promise<any[]> {
  const merged = new Map<string, Record<string, any>>();

  // Start with in-memory entries for this UID
  const bucket = memoryJournalByUid.get(uid);
  if (bucket) {
    for (const [id, item] of bucket.entries()) {
      merged.set(id, item);
    }
  }

  try {
    const colRef = firestore.collection('users').doc(uid).collection('journal');
    const snap = await colRef.orderBy('createdAt', 'desc').limit(250).get();
    for (const d of snap?.docs || []) {
      const data = { id: d.id, ...d.data() };
      const existing = merged.get(d.id);
      if (!existing || (Number((data as any).updatedAt || 0) >= Number(existing.updatedAt || 0))) {
        merged.set(d.id, data);
      }
    }
  } catch {
    // Return in-memory entries when Firestore is offline
  }

  return Array.from(merged.values()).sort(
    (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
  );
}

export async function saveJournalEntry(body: Record<string, any>): Promise<Record<string, any>> {
  const {
    uid = 'default_trader',
    id,
    suggestionKey,
    symbol,
    timeframe,
    strategy,
    action,
    entry,
    sl,
    currentSl,
    tp,
    tp2,
    rr,
    confidence,
    risk,
    suggestedPosition,
    riskAmount,
    taken = true,
    outcome = 'pending',
    notes = '',
    pnlUsd,
    pnlR,
    exitPrice,
    tradeId,
    signalId,
    source,
    mode,
    exitMode,
    volume,
    status,
    createdAt,
  } = body;

  const resolvedUid = String(uid || 'default_trader').trim() || 'default_trader';
  const entryId = String(id || tradeId || `journal-${Date.now()}`);

  const createdTs = normalizeCreatedAtMs(createdAt);

  const payload: Record<string, any> = {
    id: entryId,
    suggestionKey: suggestionKey || `manual:${symbol}:${timeframe}:${Date.now()}`,
    symbol,
    timeframe,
    strategy: strategy || 'Wick Rejection',
    action,
    entry: Number(entry),
    sl: sl != null ? Number(sl) : null,
    currentSl: currentSl != null ? Number(currentSl) : sl != null ? Number(sl) : null,
    tp: tp != null ? Number(tp) : null,
    tp2: tp2 != null ? Number(tp2) : null,
    rr: rr != null ? Number(rr) : 1.5,
    confidence: confidence != null ? Number(confidence) : 85,
    risk: risk || 'Low',
    suggestedPosition:
      suggestedPosition != null ? Number(suggestedPosition) : volume != null ? Number(volume) : 0.01,
    riskAmount: riskAmount != null ? Number(riskAmount) : 50,
    taken: Boolean(taken),
    outcome,
    notes: notes || '',
    createdAt: createdTs,
    updatedAt: Date.now(),
  };

  if (pnlUsd !== undefined) payload.pnlUsd = Number(pnlUsd);
  if (pnlR !== undefined) payload.pnlR = Number(pnlR);
  if (exitPrice !== undefined) payload.exitPrice = exitPrice != null ? Number(exitPrice) : null;
  if (tradeId !== undefined) payload.tradeId = String(tradeId);
  if (signalId !== undefined) payload.signalId = signalId ? String(signalId) : null;
  if (source !== undefined) payload.source = String(source);
  if (mode !== undefined) payload.mode = String(mode);
  if (exitMode !== undefined) payload.exitMode = String(exitMode);
  if (volume !== undefined) payload.volume = Number(volume);
  if (status !== undefined) payload.status = String(status);

  getMemoryBucket(resolvedUid).set(entryId, payload);

  try {
    const docRef = firestore
      .collection('users')
      .doc(resolvedUid)
      .collection('journal')
      .doc(entryId);
    await docRef.set(payload, { merge: true });
  } catch {
    // Non-fatal when Firestore unavailable
  }

  return payload;
}

export async function updateJournalEntry(
  id: string,
  body: Record<string, any>
): Promise<{ found: boolean; entry?: Record<string, any> }> {
  const {
    uid = 'default_trader',
    outcome,
    pnlUsd,
    pnlR,
    exitPrice,
    status,
    currentSl,
    breakEvenTriggered,
    notes,
  } = body;
  const resolvedUid = String(uid || 'default_trader').trim() || 'default_trader';
  const bucket = getMemoryBucket(resolvedUid);
  const memPrev = bucket.get(id);

  let fsPrev: Record<string, any> | null = null;
  const docRef = firestore.collection('users').doc(resolvedUid).collection('journal').doc(id);
  try {
    const snap = await docRef.get();
    if (snap && snap.exists) {
      fsPrev = snap.data() || {};
    }
  } catch {
    // ignore Firestore read error
  }

  const basePrev = memPrev || fsPrev;
  const priorOutcome = basePrev?.outcome;
  const { uid: _ignoredUid, ...bodyFields } = body;
  const prevData = basePrev || {
    ...bodyFields,
    id,
    createdAt: normalizeCreatedAtMs(body.createdAt, body.time),
  };

  const updates: Record<string, any> = {
    updatedAt: Date.now(),
  };
  if (outcome !== undefined) updates.outcome = outcome;
  if (pnlUsd !== undefined) updates.pnlUsd = Number(pnlUsd);
  if (pnlR !== undefined) updates.pnlR = Number(pnlR);
  if (exitPrice !== undefined) updates.exitPrice = exitPrice != null ? Number(exitPrice) : null;
  if (status !== undefined) updates.status = String(status);
  if (currentSl !== undefined) updates.currentSl = Number(currentSl);
  if (breakEvenTriggered !== undefined) updates.breakEvenTriggered = Boolean(breakEvenTriggered);
  if (notes !== undefined) updates.notes = String(notes);

  const merged = { ...prevData, ...updates, id };
  bucket.set(id, merged);

  try {
    await docRef.set(fsPrev ? updates : merged, { merge: true });
  } catch {
    // Non-fatal
  }

  if (outcome === 'loss' && priorOutcome !== 'loss') {
    const cfg = await loadGuardrailConfig().catch(() => null);
    processResolvedLoss(prevData).catch(() => {});
    recordTradeResolutionForRisk(
      'LOSS',
      Math.abs(Number(pnlUsd ?? prevData.riskAmount ?? cfg?.riskAmountUsd ?? 0)),
      cfg || undefined
    ).catch(() => {});
  } else if (outcome === 'win' && priorOutcome !== 'win') {
    const cfg = await loadGuardrailConfig().catch(() => null);
    processResolvedWin(prevData).catch(() => {});
    recordTradeResolutionForRisk('WIN', 0, cfg || undefined).catch(() => {});
  }

  return { found: true, entry: merged };
}
