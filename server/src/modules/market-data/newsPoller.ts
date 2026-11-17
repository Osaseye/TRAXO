import { fetchMarketNews } from './newsFetcher';
import { setCachedNews, isRedisAvailable } from './newsCache';

const CATEGORIES = ['general', 'forex', 'crypto', 'merger'];
let started = false;

export async function prefetchAllCategories(): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  console.log('[news-poller] Pre-warming news cache for all categories...');
  for (const category of CATEGORIES) {
    try {
      const items = await fetchMarketNews(category);
      await setCachedNews(`news:${category}`, items);
      console.log(`[news-poller] Cached ${items.length} items — ${category}`);
    } catch (err: any) {
      console.warn(`[news-poller] Failed to prefetch "${category}":`, err.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('[news-poller] Cache warm-up complete');
}

export function startNewsPoller(): void {
  if (started) return;
  started = true;

  let cron: any;
  try {
    cron = require('node-cron');
  } catch {
    console.warn('[news-poller] node-cron not installed — scheduled polling disabled');
    void prefetchAllCategories();
    return;
  }

  cron.schedule('0 7 * * *', () => {
    void prefetchAllCategories();
  });

  cron.schedule('*/15 7-22 * * 1-5', () => {
    void prefetchAllCategories();
  });

  console.log('[news-poller] Cron schedules registered (07:00 UTC daily + every 15 min weekday market hours)');
  void prefetchAllCategories();
}
