import { firestore } from '../market-data/firebaseAdmin';
import { processResolvedLoss, processResolvedWin } from '../optimizer/strategyOptimizer';
import { loadGuardrailConfig, recordTradeResolutionForRisk } from '../risk/guardrails';

export async function getJournalEntries(uid = 'default_trader'): Promise<any[]> {
  const colRef = firestore.collection('users').doc(uid).collection('journal');
  const snap = await colRef.orderBy('createdAt', 'desc').limit(100).get();
  return (snap?.docs || []).map((d: any) => ({ id: d.id, ...d.data() }));
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
    tp,
    rr,
    confidence,
    risk,
    suggestedPosition,
    riskAmount,
    taken,
    outcome = 'pending',
    notes = '',
  } = body;

  const entryId = id || `journal-${Date.now()}`;
  const docRef = firestore.collection('users').doc(uid).collection('journal').doc(entryId);

  const payload = {
    id: entryId,
    suggestionKey: suggestionKey || `manual:${symbol}:${timeframe}:${Date.now()}`,
    symbol,
    timeframe,
    strategy: strategy || 'Wick Rejection',
    action,
    entry: Number(entry),
    sl: sl != null ? Number(sl) : null,
    tp: tp != null ? Number(tp) : null,
    rr: rr != null ? Number(rr) : 1.5,
    confidence: confidence != null ? Number(confidence) : 85,
    risk: risk || 'Low',
    suggestedPosition: suggestedPosition != null ? Number(suggestedPosition) : 2500,
    riskAmount: riskAmount != null ? Number(riskAmount) : 25,
    taken: Boolean(taken),
    outcome,
    notes: notes || '',
    createdAt: Date.now(),
  };

  await docRef.set(payload, { merge: true });
  return payload;
}

export async function updateJournalEntry(
  id: string,
  body: Record<string, any>
): Promise<{ found: boolean; entry?: Record<string, any> }> {
  const { uid = 'default_trader', outcome, pnlUsd, notes } = body;
  const docRef = firestore.collection('users').doc(uid).collection('journal').doc(id);
  const snap = await docRef.get();

  if (!snap || !snap.exists) {
    return { found: false };
  }

  const prevData = snap.data() || {};
  const updates: Record<string, any> = {
    updatedAt: Date.now(),
  };
  if (outcome !== undefined) updates.outcome = outcome;
  if (pnlUsd !== undefined) updates.pnlUsd = Number(pnlUsd);
  if (notes !== undefined) updates.notes = String(notes);

  await docRef.update(updates);

  if (outcome === 'loss' && prevData.outcome !== 'loss') {
    const cfg = await loadGuardrailConfig().catch(() => null);
    processResolvedLoss(prevData).catch(() => {});
    recordTradeResolutionForRisk(
      'LOSS',
      Math.abs(Number(pnlUsd ?? prevData.riskAmount ?? cfg?.riskAmountUsd ?? 0)),
      cfg || undefined
    ).catch(() => {});
  } else if (outcome === 'win' && prevData.outcome !== 'win') {
    const cfg = await loadGuardrailConfig().catch(() => null);
    processResolvedWin(prevData).catch(() => {});
    recordTradeResolutionForRisk('WIN', 0, cfg || undefined).catch(() => {});
  }

  const updatedSnap = await docRef.get();
  return { found: true, entry: { id, ...(updatedSnap?.data() || {}) } };
}
