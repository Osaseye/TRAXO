import express from 'express';
import {
  getJournalEntries,
  saveJournalEntry,
  updateJournalEntry,
} from '../modules/journal/journalService';

const router = express.Router();

// GET /api/journal?uid=...
router.get('/', async (req: any, res: any) => {
  try {
    const uid = String(req.query.uid || 'default_trader');
    const entries = await getJournalEntries(uid);
    res.json(entries);
  } catch (err: any) {
    console.error('[journal GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load journal entries' });
  }
});

// POST /api/journal
router.post('/', async (req: any, res: any) => {
  try {
    const entry = await saveJournalEntry(req.body || {});
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
    const result = await updateJournalEntry(id, req.body || {});

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
