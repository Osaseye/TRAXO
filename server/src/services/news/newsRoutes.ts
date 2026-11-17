import express from 'express';
import { newsEngine, type NewsEngine, type NewsSeverity } from './newsEngine';

const VALID_SEVERITIES = new Set<NewsSeverity>(['CRITICAL', 'HIGH', 'MEDIUM']);

function parseOptionalNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

function parseImpactFilter(raw: unknown): NewsSeverity[] | undefined {
  if (!raw) return undefined;
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is NewsSeverity => VALID_SEVERITIES.has(s as NewsSeverity));
  return parts.length > 0 ? parts : undefined;
}

/**
 * Creates the Express router for the decoupled News Engine microservice (`/api/v1/news`).
 */
export function createNewsRoutes(engine: NewsEngine = newsEngine): express.Router {
  const router = express.Router();

  router.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      service: 'news-engine',
      ...engine.getStatus(),
    });
  });

  /**
   * GET /api/v1/news/freeze-status/:symbol
   * Returns { symbol, isFrozen, reason, minutesToImpact, activeEvents }.
   */
  router.get('/freeze-status/:symbol', async (req: any, res: any) => {
    const rawSymbol = String(req.params?.symbol || '').trim();
    if (!rawSymbol) {
      res.status(400).json({ error: 'Symbol parameter is required' });
      return;
    }

    try {
      const beforeMinutes = parseOptionalNumber(req.query?.beforeMinutes);
      const afterMinutes = parseOptionalNumber(req.query?.afterMinutes);
      const status = await engine.getFreezeStatus(rawSymbol, {
        beforeMinutes,
        afterMinutes,
      });

      res.json({
        symbol: status.symbol,
        isFrozen: status.isFrozen,
        reason: status.reason,
        minutesToImpact: status.minutesToImpact,
        activeEvents: status.activeEvents,
        source: status.source,
        checkedAt: status.checkedAt,
      });
    } catch (err: any) {
      console.error('[news-routes] Failed to evaluate freeze status:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Failed to evaluate news freeze status' });
    }
  });

  /**
   * GET /api/v1/news/calendar
   * Returns filtered upcoming high-impact events.
   */
  router.get('/calendar', async (req: any, res: any) => {
    try {
      const category = req.query?.category ? String(req.query.category) : undefined;
      const symbol = req.query?.symbol ? String(req.query.symbol) : undefined;
      const impact = parseImpactFilter(req.query?.impact);
      const hoursAhead = parseOptionalNumber(req.query?.hoursAhead);
      const includePastMinutes = parseOptionalNumber(req.query?.includePastMinutes);

      const calendar = await engine.getCalendar({
        category,
        symbol,
        impact,
        hoursAhead,
        includePastMinutes,
      });

      res.json({
        ok: true,
        count: calendar.count,
        events: calendar.events,
        updatedAt: calendar.updatedAt,
      });
    } catch (err: any) {
      console.error('[news-routes] Failed to load news calendar:', err?.message || err);
      res.status(500).json({ ok: false, error: err?.message || 'Failed to load news calendar' });
    }
  });

  /**
   * POST /api/v1/news/poll
   * Triggers an on-demand poll across news categories.
   */
  router.post('/poll', async (req: any, res: any) => {
    try {
      const rawCategories = req.body?.categories ?? req.query?.categories;
      const categories = Array.isArray(rawCategories)
        ? rawCategories.map(String)
        : typeof rawCategories === 'string' && rawCategories.trim()
          ? rawCategories.split(',').map((c) => c.trim())
          : undefined;

      const isAsync = req.body?.async === true || String(req.query?.async || '') === 'true';
      if (isAsync) {
        void engine.pollAllCategories(categories);
        res.status(202).json({
          ok: true,
          accepted: true,
          message: 'News poll triggered asynchronously',
        });
        return;
      }

      const result = await engine.pollAllCategories(categories);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[news-routes] On-demand poll failed:', err?.message || err);
      res.status(500).json({ ok: false, error: err?.message || 'Failed to poll news' });
    }
  });

  return router;
}

/**
 * Standalone Express application factory for running the News Engine
 * as an isolated microservice (`app.listen(...)`).
 */
export function createNewsApp(engine: NewsEngine = newsEngine): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/news', createNewsRoutes(engine));
  return app;
}

const newsRoutes = createNewsRoutes();
export default newsRoutes;
