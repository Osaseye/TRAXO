import express from 'express';
import {
  getJournalEntries,
  mapPaperTradeToJournalEntry,
  saveJournalEntry,
  updateJournalEntry,
} from '../modules/journal/journalService';
import { paperBrokerService } from '../modules/execution/paperBrokerService';

const router = express.Router();

function resolveJournalUid(req: any, preferBody = false): string {
  const fromBody = req?.body?.uid;
  const fromQuery = req?.query?.uid;
  const fromHeader = req?.headers?.['x-traxo-uid'];
  const raw = preferBody
    ? fromBody || fromQuery || fromHeader
    : fromQuery || fromHeader || fromBody;
  return String(raw || 'default_trader').trim() || 'default_trader';
}

// GET /api/journal?uid=...
router.get('/', async (req: any, res: any) => {
  try {
    const uid = resolveJournalUid(req, false);
    const [storedEntries, paperTrades] = await Promise.all([
      getJournalEntries(uid).catch(() => []),
      Promise.resolve(paperBrokerService.getAllTrades(uid, undefined, 500)),
    ]);

    const mergedById = new Map<string, Record<string, any>>();
    for (const e of storedEntries) {
      if (e && e.id) mergedById.set(String(e.id), e);
    }

    // Ensure every SQLite Paper Broker trade (open, resolved, manual, auto-traded)
    // is represented in /api/journal with authoritative realized P&L & status.
    for (const trade of paperTrades) {
      const mapped = mapPaperTradeToJournalEntry(trade);
      const existing = mergedById.get(mapped.id);
      mergedById.set(mapped.id, existing ? { ...existing, ...mapped } : mapped);
    }

    const result = Array.from(mergedById.values()).sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );
    res.json(result);
  } catch (err: any) {
    console.error('[journal GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load journal entries' });
  }
});

// POST /api/journal
router.post('/', async (req: any, res: any) => {
  try {
    const uid = resolveJournalUid(req, true);
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
    const { id } = req.params;
    const uid = resolveJournalUid(req, true);
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
