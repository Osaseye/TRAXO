const express = require('express');
const { firestore } = require('../services/firebaseAdmin');
const redis = require('../services/redisClient');

const router = express.Router();

/**
 * GET /api/journal
 * Retrieves paginated or full journal entries for a user.
 * Query: ?uid=...
 */
router.get('/', async (req, res) => {
  const uid = req.query.uid || 'default_trader';

  try {
    const colRef = firestore.collection('users').doc(uid).collection('journal');
    const snap = await colRef.orderBy('createdAt', 'desc').limit(100).get();

    const journalEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    res.json(journalEntries);
  } catch (error) {
    console.error(`[Journal] GET error for ${uid}:`, error);
    res.status(500).json({ error: 'Failed to retrieve journal entries.' });
  }
});

/**
 * POST /api/journal
 * Saves a new trade decision ("Took It", "Skipped", or manual setup) to the user's journal.
 * Body: { uid, suggestionKey, symbol, timeframe, strategy, action, entry, sl, tp, confidence, risk, suggestedPosition, riskAmount, taken, outcome, notes }
 */
router.post('/', async (req, res) => {
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
  } = req.body;

  try {
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

    res.json({ success: true, entry: payload });
  } catch (error) {
    console.error(`[Journal] POST error for ${uid}:`, error);
    res.status(500).json({ error: 'Failed to save journal decision.' });
  }
});

/**
 * PATCH /api/journal/:id
 * Updates an existing journal entry (e.g. marking outcome win/loss/breakeven, adding notes).
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { uid = 'default_trader', outcome, pnlUsd, notes } = req.body;

  try {
    const docRef = firestore.collection('users').doc(uid).collection('journal').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Journal entry not found.' });
    }

    const updates = {};
    if (outcome !== undefined) updates.outcome = outcome;
    if (pnlUsd !== undefined) updates.pnlUsd = Number(pnlUsd);
    if (notes !== undefined) updates.notes = String(notes);
    updates.updatedAt = Date.now();

    await docRef.update(updates);

    const updatedSnap = await docRef.get();
    res.json({ success: true, entry: { id, ...updatedSnap.data() } });
  } catch (error) {
    console.error(`[Journal] PATCH error for ${id}:`, error);
    res.status(500).json({ error: 'Failed to update journal entry.' });
  }
});

module.exports = router;
