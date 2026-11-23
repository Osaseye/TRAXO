import https from 'https';
import { env } from '../../config/env';
import { getAssetType, normalizeSymbol } from '../../config/instruments';

export const NEWS_CATEGORIES = ['general', 'forex', 'crypto', 'merger'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export const VALID_CATEGORIES = new Set<string>(NEWS_CATEGORIES);

export type NewsSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export const NEWS_TTL_SECONDS = 15 * 60;
export const CALENDAR_TTL_SECONDS = 30 * 60;
export const FOREX_FACTORY_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const REDIS_OP_TIMEOUT_MS = 4_500;
const FINNHUB_TIMEOUT_MS = 8_000;

export const DEFAULT_FREEZE_BEFORE_MINUTES = 30;
export const DEFAULT_FREEZE_AFTER_MINUTES = 15;

const CRITICAL_NEWS_RE = /\b(NFP|FOMC|CPI|FED|RATE DECISION|NON-FARM|INFLATION)\b/;
const HIGH_NEWS_RE = /\b(GDP|PMI|RETAIL SALES|UNEMPLOYMENT|CENTRAL BANK|ECB|BOE|BOJ)\b/;
const KNOWN_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'XAU', 'XAG', 'BTC', 'ETH'];

export interface NormalizedNewsItem {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  related: string;
}

export interface CalendarEvent {
  id: number | string;
  name: string;
  headline: string;
  category: string;
  severity: NewsSeverity;
  impact: NewsSeverity;
  currencies: string[];
  timestamp_utc: string;
  datetime: number;
  minutes_away: number;
  source: string;
  url: string;
}

export interface FreezeStatus {
  symbol: string;
  isFrozen: boolean;
  reason: string | null;
  minutesToImpact: number | null;
  activeEvents: CalendarEvent[];
  source?: 'engine' | 'cache' | 'remote' | 'fallback';
  checkedAt: string;
}

export interface NewsFreezeTransitionEvent {
  type: 'NEWS_FREEZE_ENTER' | 'NEWS_RELEASED' | 'NEWS_FREEZE_EXIT';
  symbol: string;
  status: FreezeStatus;
  timestamp: string;
}

export interface CalendarFilterOptions {
  category?: string;
  symbol?: string;
  impact?: NewsSeverity[];
  hoursAhead?: number;
  includePastMinutes?: number;
  nowMs?: number;
}

export interface CalendarResult {
  events: CalendarEvent[];
  count: number;
  updatedAt: string;
}

export interface PollCategoryResult {
  ok: boolean;
  count: number;
  error?: string;
}

export interface PollResult {
  ok: boolean;
  polledAt: string;
  totalItems: number;
  categories: Record<string, PollCategoryResult>;
}

export interface RawForexFactoryEvent {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
}

export interface NewsEngineOptions {
  finnhubApiKey?: string;
  finnhubApiKeys?: string[];
  redisClient?: UpstashRedisLike | null;
  fetcher?: (category: string, limit?: number) => Promise<NormalizedNewsItem[]>;
  calendarFetcher?: () => Promise<RawForexFactoryEvent[]>;
  interCategoryDelayMs?: number;
  ttlSeconds?: number;
}

export interface UpstashRedisLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

function createUpstashRedisClient(): UpstashRedisLike | null {
  // Prefer dedicated backup/offload Upstash instance so news polling does not consume primary execution quota
  const restUrl = env.upstashBackupRedisRestUrl || env.upstashRedisRestUrl;
  const restToken = env.upstashBackupRedisRestToken || env.upstashRedisRestToken;
  if (!restUrl || !restToken) {
    console.log('[news-cache] No Redis credentials — using local in-memory cache');
    return null;
  }

  try {
    const { Redis } = require('@upstash/redis');
    const client = new Redis({
      url: restUrl,
      token: restToken,
    });
    const roleLabel = env.upstashBackupRedisRestUrl ? 'backup offload' : 'primary';
    console.log(`[news-cache] Connected to Upstash Redis (${roleLabel})`);
    return client;
  } catch (err: any) {
    console.warn('[news-cache] Failed to initialise Upstash Redis:', err?.message || err);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out (${ms}ms)`)), ms);
    if (typeof timer.unref === 'function') timer.unref();
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function httpsGetJson(url: string, timeoutMs = FINNHUB_TIMEOUT_MS, provider = 'Finnhub'): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TRAXO/1.0)',
          Accept: 'application/json',
        },
      },
      (res) => {
        if (res.statusCode === 429) {
          const retryAfter = Number(res.headers['retry-after']) || 300;
          const err: any = new Error(`${provider} rate limit reached (429, retry after ${retryAfter}s)`);
          err.statusCode = 429;
          err.retryAfterSec = retryAfter;
          reject(err);
          res.resume();
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          const err: any = new Error(`${provider} HTTP error (${res.statusCode})`);
          err.statusCode = res.statusCode;
          reject(err);
          res.resume();
          return;
        }
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e: any) {
            reject(new Error(`${provider} JSON parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`${provider} request timed out (${timeoutMs / 1000}s)`));
    });
  });
}

export function normaliseNewsItem(item: any): NormalizedNewsItem {
  return {
    id: item?.id ?? 0,
    category: item?.category ?? 'general',
    datetime: Number(item?.datetime) || 0,
    headline: item?.headline ?? '',
    summary: item?.summary ?? '',
    source: item?.source ?? '',
    url: item?.url ?? '',
    image: item?.image ?? '',
    related: item?.related ?? '',
  };
}

export function classifyNewsSeverity(headline: string, summary = ''): NewsSeverity {
  const upper = `${headline} ${summary}`.toUpperCase();
  if (CRITICAL_NEWS_RE.test(upper)) return 'CRITICAL';
  if (HIGH_NEWS_RE.test(upper)) return 'HIGH';
  return 'MEDIUM';
}

function extractCurrencies(item: NormalizedNewsItem): string[] {
  const haystack = `${item.headline} ${item.summary} ${item.related}`.toUpperCase();
  const found = KNOWN_CURRENCIES.filter((code) => haystack.includes(code));
  if (item.related) {
    for (const part of item.related.toUpperCase().split(/[\s,;/]+/)) {
      const clean = part.trim();
      if (clean && !found.includes(clean)) found.push(clean);
    }
  }
  return found;
}

export function getSymbolQueryPlan(rawSymbol: string): {
  canonical: string;
  categories: string[];
  tokens: string[];
} {
  const canonical = normalizeSymbol(rawSymbol);
  const assetType = String(getAssetType(canonical));

  let primaryCategory = 'general';
  if (assetType === 'FOREX' || assetType === 'COMMODITY') primaryCategory = 'forex';
  else if (assetType === 'CRYPTO') primaryCategory = 'crypto';

  const categories =
    primaryCategory === 'general' ? ['general'] : [primaryCategory, 'general'];

  const tokens: string[] = [];
  if (assetType === 'COMMODITY') {
    if (canonical === 'XAGUSD') {
      tokens.push('XAG', 'SILVER');
    } else {
      tokens.push('XAU', 'GOLD');
    }
    tokens.push('USD', 'CPI', 'NFP', 'FOMC', 'FED');
  } else if (assetType === 'FUTURES') {
    tokens.push(canonical, 'NASDAQ', 'NQ', 'USTEC', 'USD', 'CPI', 'PPI', 'ISM', 'FOMC', 'FED', 'NFP');
  } else if (assetType === 'FOREX' || assetType === 'CRYPTO') {
    const base = canonical.slice(0, 3);
    const quote = canonical.slice(3, 6);
    if (base) tokens.push(base);
    if (quote) tokens.push(quote);
    if (canonical === 'XAUUSD') tokens.push('GOLD');
    if (canonical === 'XAGUSD') tokens.push('SILVER');
    if (canonical === 'BTCUSD') tokens.push('BITCOIN');
    if (canonical === 'ETHUSD') tokens.push('ETHEREUM');
  } else {
    tokens.push(canonical);
  }

  return { canonical, categories, tokens };
}

function isItemRelevantToTokens(item: NormalizedNewsItem, tokens: string[]): boolean {
  const text = `${item.headline || ''} ${item.summary || ''} ${item.related || ''}`.toUpperCase();
  return tokens.some((token) => text.includes(token));
}

function toCalendarEvent(item: NormalizedNewsItem, nowSec: number): CalendarEvent {
  const severity = classifyNewsSeverity(item.headline, item.summary);
  const dt = Number(item.datetime) || nowSec;
  const minutesAway = Math.floor((dt - nowSec) / 60);
  const headline = String(item.headline || 'Market Event');

  return {
    id: item.id || `${item.category}:${dt}:${headline.slice(0, 24)}`,
    name: headline.slice(0, 80),
    headline,
    category: item.category || 'general',
    severity,
    impact: severity,
    currencies: extractCurrencies(item),
    timestamp_utc: new Date(dt * 1000).toISOString(),
    datetime: dt,
    minutes_away: minutesAway,
    source: item.source || '',
    url: item.url || '',
  };
}

/**
 * Decoupled News Engine encapsulating Finnhub fetching, dual-layer caching
 * (Upstash Redis + local in-memory TTL fallback), scheduled polling, and
 * symbol freeze / economic calendar evaluation.
 */
export class NewsEngine {
  private readonly upstashRedis: UpstashRedisLike | null;
  private readonly memoryCache = new Map<string, { data: NormalizedNewsItem[]; expiresAt: number }>();
  private readonly customFetcher?: (category: string, limit?: number) => Promise<NormalizedNewsItem[]>;
  private readonly customCalendarFetcher?: () => Promise<RawForexFactoryEvent[]>;
  private calendarCache: { events: Omit<CalendarEvent, 'minutes_away'>[]; expiresAt: number } | null = null;
  private calendarRetryAfter = 0;
  private readonly apiKeyOverride?: string;
  private readonly apiKeysOverride?: string[];
  private finnhubKeyIndex = 0;
  private readonly finnhubCooldownUntil = new Map<string, number>();
  private readonly interCategoryDelayMs: number;
  private readonly ttlSeconds: number;

  private started = false;
  private cronTasks: Array<{ stop?: () => void }> = [];
  private inFlightPoll: Promise<PollResult> | null = null;
  private lastPolledAt: string | null = null;
  private lastPollResult: PollResult | null = null;
  private upstashRetryAfter = 0;

  private readonly lastFreezeState = new Map<
    string,
    { isFrozen: boolean; releasedEventIds: Set<string> }
  >();
  private watchedSymbols: string[] = [];
  private transitionListener?: (event: NewsFreezeTransitionEvent) => void;

  setTransitionListener(
    listener: (event: NewsFreezeTransitionEvent) => void,
    watchedSymbols: string[] = []
  ): void {
    this.transitionListener = listener;
    this.watchedSymbols = watchedSymbols;
  }

  constructor(options: NewsEngineOptions = {}) {
    this.upstashRedis =
      options.redisClient !== undefined ? options.redisClient : createUpstashRedisClient();
    this.customFetcher = options.fetcher;
    this.customCalendarFetcher = options.calendarFetcher;
    this.apiKeyOverride = options.finnhubApiKey;
    this.apiKeysOverride = options.finnhubApiKeys;
    this.interCategoryDelayMs = options.interCategoryDelayMs ?? 500;
    this.ttlSeconds = options.ttlSeconds ?? NEWS_TTL_SECONDS;
  }

  private getFinnhubKeyPool(): string[] {
    if (this.apiKeysOverride && this.apiKeysOverride.length > 0) {
      return Array.from(new Set(this.apiKeysOverride.map((k) => k.trim()).filter(Boolean)));
    }
    if (this.apiKeyOverride) {
      return [this.apiKeyOverride.trim()].filter(Boolean);
    }
    if (env.finnhubApiKeys && env.finnhubApiKeys.length > 0) {
      return env.finnhubApiKeys;
    }
    return env.finnhubApiKey ? [env.finnhubApiKey] : [];
  }

  isRedisAvailable(): boolean {
    return !!this.upstashRedis;
  }

  getStatus() {
    return {
      started: this.started,
      redisAvailable: this.isRedisAvailable(),
      finnhubKeyCount: this.getFinnhubKeyPool().length,
      memoryCacheKeys: Array.from(this.memoryCache.keys()),
      lastPolledAt: this.lastPolledAt,
      lastPollResult: this.lastPollResult,
    };
  }

  async getCachedNews(key: string): Promise<NormalizedNewsItem[] | null> {
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (Date.now() <= memEntry.expiresAt) {
        return memEntry.data;
      }
      this.memoryCache.delete(key);
    }

    if (this.upstashRedis && Date.now() >= this.upstashRetryAfter) {
      try {
        const value = await withTimeout(
          this.upstashRedis.get(key),
          REDIS_OP_TIMEOUT_MS,
          'Upstash GET'
        );
        if (value) {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          if (Array.isArray(parsed)) {
            this.memoryCache.set(key, {
              data: parsed,
              expiresAt: Date.now() + this.ttlSeconds * 1000,
            });
            return parsed;
          }
        }
      } catch (err: any) {
        this.upstashRetryAfter = Date.now() + 60_000;
        console.warn('[news-cache] GET failed, using local memory cache (60s Redis cooldown):', err?.message || err);
      }
    }

    return null;
  }

  async setCachedNews(key: string, data: NormalizedNewsItem[]): Promise<void> {
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    });

    if (!this.upstashRedis || Date.now() < this.upstashRetryAfter) return;
    try {
      await withTimeout(
        this.upstashRedis.set(key, JSON.stringify(data), { ex: this.ttlSeconds }),
        REDIS_OP_TIMEOUT_MS,
        'Upstash SET'
      );
    } catch (err: any) {
      this.upstashRetryAfter = Date.now() + 60_000;
      console.warn('[news-cache] SET failed (60s Redis cooldown):', err?.message || err);
    }
  }

  async invalidateCachedNews(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (!this.upstashRedis) return;
    try {
      await withTimeout(this.upstashRedis.del(key), REDIS_OP_TIMEOUT_MS, 'Upstash DEL');
    } catch (err: any) {
      console.warn('[news-cache] DEL failed:', err?.message || err);
    }
  }

  async fetchMarketNews(category = 'general', limit = 25): Promise<NormalizedNewsItem[]> {
    const cat = VALID_CATEGORIES.has(category) ? category : 'general';
    if (this.customFetcher) {
      const customItems = await this.customFetcher(cat, limit);
      return customItems.slice(0, limit).map(normaliseNewsItem);
    }

    const keys = this.getFinnhubKeyPool();
    if (keys.length === 0) {
      throw new Error('FINNHUB_API_KEY is not set on the server');
    }

    const now = Date.now();
    const startIdx = this.finnhubKeyIndex % keys.length;
    this.finnhubKeyIndex = (this.finnhubKeyIndex + 1) % keys.length;

    const orderedKeys: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      orderedKeys.push(keys[(startIdx + i) % keys.length]);
    }

    // Prefer keys not currently in a 429 cooldown window first
    const availableFirst = [
      ...orderedKeys.filter((k) => (this.finnhubCooldownUntil.get(k) || 0) <= now),
      ...orderedKeys.filter((k) => (this.finnhubCooldownUntil.get(k) || 0) > now),
    ];

    let lastErr: Error | null = null;
    for (const token of availableFirst) {
      const url = `https://finnhub.io/api/v1/news?category=${cat}&token=${token}`;
      try {
        const items = await httpsGetJson(url, FINNHUB_TIMEOUT_MS);
        if (!Array.isArray(items)) {
          throw new Error(`Unexpected Finnhub response: ${JSON.stringify(items).slice(0, 200)}`);
        }
        return items.slice(0, limit).map(normaliseNewsItem);
      } catch (err: any) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message || '';
        if (msg.includes('429')) {
          this.finnhubCooldownUntil.set(token, Date.now() + 60_000);
          console.warn(`[news-engine] Finnhub key rate-limited (429); rotating to next key...`);
          continue;
        }
        if (msg.includes('401') && availableFirst.length > 1) {
          console.warn(`[news-engine] Finnhub key rejected (401); trying fallback key...`);
          continue;
        }
        if (availableFirst.length > 1) {
          continue;
        }
        throw lastErr;
      }
    }

    throw lastErr || new Error('Failed to fetch news from all configured Finnhub keys');
  }

  async fetchForexFactoryCalendar(forceRefresh = false): Promise<Omit<CalendarEvent, 'minutes_away'>[]> {
    // Preserve isolated deterministic unit tests when a mock news fetcher is injected without a calendar mock
    if (this.customFetcher && !this.customCalendarFetcher) {
      return [];
    }

    if (!forceRefresh && this.calendarCache && Date.now() <= this.calendarCache.expiresAt) {
      return this.calendarCache.events;
    }

    // Check distributed Redis calendar cache across server restarts before hitting ForexFactory CDN
    if (!forceRefresh && !this.customCalendarFetcher && this.upstashRedis && Date.now() >= this.upstashRetryAfter) {
      try {
        const cachedRaw = await withTimeout(
          this.upstashRedis.get('calendar:ff_thisweek'),
          REDIS_OP_TIMEOUT_MS,
          'Upstash Calendar GET'
        );
        if (cachedRaw) {
          const parsed = typeof cachedRaw === 'string' ? JSON.parse(cachedRaw) : cachedRaw;
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.calendarCache = {
              events: parsed,
              expiresAt: Date.now() + CALENDAR_TTL_SECONDS * 1000,
            };
            return parsed;
          }
        }
      } catch {}
    }

    if (Date.now() < this.calendarRetryAfter) {
      return this.calendarCache?.events ?? [];
    }

    let rawList: unknown;
    try {
      rawList = this.customCalendarFetcher
        ? await this.customCalendarFetcher()
        : await httpsGetJson(FOREX_FACTORY_CALENDAR_URL, FINNHUB_TIMEOUT_MS, 'ForexFactory');
    } catch (err: any) {
      const cooldownSec = Number(err?.retryAfterSec) || 600;
      this.calendarRetryAfter = Date.now() + cooldownSec * 1000;
      if (this.calendarCache?.events) {
        return this.calendarCache.events;
      }
      throw err;
    }

    if (!Array.isArray(rawList)) {
      return this.calendarCache?.events ?? [];
    }

    const mapped: Omit<CalendarEvent, 'minutes_away'>[] = [];
    for (const item of rawList as RawForexFactoryEvent[]) {
      const impactLower = String(item?.impact || '').trim().toLowerCase();
      if (impactLower !== 'high' && impactLower !== 'medium') continue;

      const parsedMs = item?.date ? Date.parse(item.date) : NaN;
      if (!Number.isFinite(parsedMs)) continue;

      const dt = Math.floor(parsedMs / 1000);
      const title = String(item?.title || 'Scheduled Economic Release').trim();
      const country = String(item?.country || 'USD').trim().toUpperCase();
      const headline = `${country} ${title}`;
      const severity: NewsSeverity =
        impactLower === 'high'
          ? CRITICAL_NEWS_RE.test(headline.toUpperCase())
            ? 'CRITICAL'
            : 'HIGH'
          : 'MEDIUM';

      mapped.push({
        id: `ff:${dt}:${country}:${title.slice(0, 24)}`,
        name: headline.slice(0, 80),
        headline,
        category: 'forex',
        severity,
        impact: severity,
        currencies: [country],
        timestamp_utc: new Date(dt * 1000).toISOString(),
        datetime: dt,
        source: 'ForexFactory',
        url: 'https://www.forexfactory.com/calendar',
      });
    }

    this.calendarCache = {
      events: mapped,
      expiresAt: Date.now() + CALENDAR_TTL_SECONDS * 1000,
    };

    if (!this.customCalendarFetcher && this.upstashRedis && mapped.length > 0 && Date.now() >= this.upstashRetryAfter) {
      try {
        await withTimeout(
          this.upstashRedis.set('calendar:ff_thisweek', JSON.stringify(mapped), { ex: CALENDAR_TTL_SECONDS }),
          REDIS_OP_TIMEOUT_MS,
          'Upstash Calendar SET'
        );
      } catch {}
    }

    return mapped;
  }

  async pollAllCategories(categories?: readonly string[]): Promise<PollResult> {
    if (this.inFlightPoll) {
      return this.inFlightPoll;
    }

    const targetCategories =
      categories && categories.length > 0
        ? categories.filter((c) => VALID_CATEGORIES.has(c))
        : [...NEWS_CATEGORIES];

    const runPoll = async (): Promise<PollResult> => {
      console.log('[news-poller] Polling market news categories...');
      const results: Record<string, PollCategoryResult> = {};
      let totalItems = 0;
      let successCount = 0;

      for (let idx = 0; idx < targetCategories.length; idx++) {
        const category = targetCategories[idx];
        try {
          const items = await this.fetchMarketNews(category);
          await this.setCachedNews(`news:${category}`, items);
          results[category] = { ok: true, count: items.length };
          totalItems += items.length;
          successCount += 1;
          console.log(`[news-poller] Cached ${items.length} items — ${category}`);
        } catch (err: any) {
          const message = err?.message || String(err);
          results[category] = { ok: false, count: 0, error: message };
          console.warn(`[news-poller] Failed to prefetch "${category}":`, message);
        }

        if (idx < targetCategories.length - 1 && this.interCategoryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.interCategoryDelayMs));
        }
      }

      const summary: PollResult = {
        ok: successCount > 0,
        polledAt: new Date().toISOString(),
        totalItems,
        categories: results,
      };
      try {
        await this.fetchForexFactoryCalendar(false);
      } catch (ffErr: any) {
        console.warn('[news-poller] ForexFactory calendar refresh notice:', ffErr?.message || ffErr);
      }
      this.lastPolledAt = summary.polledAt;
      this.lastPollResult = summary;
      console.log('[news-poller] Cache warm-up complete');
      if (this.watchedSymbols.length > 0 && this.transitionListener) {
        await this.evaluateFreezeTransitions(this.watchedSymbols).catch(() => []);
      }
      return summary;
    };

    this.inFlightPoll = runPoll().finally(() => {
      this.inFlightPoll = null;
    });

    return this.inFlightPoll;
  }

  startPoller(): void {
    if (this.started) return;
    this.started = true;

    let cron: any;
    try {
      cron = require('node-cron');
    } catch {
      console.warn('[news-poller] node-cron not installed — scheduled polling disabled');
      void this.pollAllCategories();
      return;
    }

    const dailyTask = cron.schedule('0 7 * * *', () => {
      void this.pollAllCategories();
    });
    const marketHoursTask = cron.schedule('*/15 7-22 * * 1-5', () => {
      void this.pollAllCategories();
    });
    this.cronTasks = [dailyTask, marketHoursTask];

    console.log(
      '[news-poller] Cron schedules registered (07:00 UTC daily + every 15 min weekday market hours)'
    );
    void this.pollAllCategories();
  }

  stopPoller(): void {
    for (const task of this.cronTasks) {
      try {
        task?.stop?.();
      } catch {}
    }
    this.cronTasks = [];
    this.started = false;
  }

  private async collectCachedItems(categories: readonly string[]): Promise<NormalizedNewsItem[]> {
    const batches = await Promise.all(
      categories.map((cat) => this.getCachedNews(`news:${cat}`).catch(() => null))
    );

    const seen = new Set<string>();
    const merged: NormalizedNewsItem[] = [];
    for (const batch of batches) {
      if (!batch || !Array.isArray(batch)) continue;
      for (const item of batch) {
        const dedupeKey = `${item.id}:${item.headline}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        merged.push(item);
      }
    }
    return merged;
  }

  async getUpcomingNewsContext(
    symbol: string,
    opts: { beforeMinutes?: number; afterMinutes?: number; nowMs?: number } = {}
  ): Promise<{
    minutesAway: number | null;
    newsEvents: CalendarEvent[];
    freezeStatus: FreezeStatus;
  }> {
    const nowMs = opts.nowMs ?? Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const beforeMinutes = opts.beforeMinutes ?? DEFAULT_FREEZE_BEFORE_MINUTES;
    const afterMinutes = opts.afterMinutes ?? DEFAULT_FREEZE_AFTER_MINUTES;
    const { canonical, categories, tokens } = getSymbolQueryPlan(symbol);

    const items = await this.collectCachedItems(categories);
    const ffRaw = await this.fetchForexFactoryCalendar().catch(() => []);
    const relevantEvents: CalendarEvent[] = [];
    const seenEventKeys = new Set<string>();

    for (const item of items) {
      if (!isItemRelevantToTokens(item, tokens)) continue;
      const evt = toCalendarEvent(item, nowSec);
      if (evt.minutes_away >= -60 && evt.minutes_away <= 180) {
        const key = `${evt.datetime}:${evt.name}`;
        seenEventKeys.add(key);
        relevantEvents.push(evt);
      }
    }

    for (const ffEvt of ffRaw) {
      const hay = `${ffEvt.headline} ${ffEvt.currencies.join(' ')}`.toUpperCase();
      if (!tokens.some((token) => hay.includes(token))) continue;
      const minutesAway = Math.floor((ffEvt.datetime - nowSec) / 60);
      if (minutesAway >= -60 && minutesAway <= 180) {
        const key = `${ffEvt.datetime}:${ffEvt.name}`;
        if (seenEventKeys.has(key)) continue;
        seenEventKeys.add(key);
        relevantEvents.push({ ...ffEvt, minutes_away: minutesAway });
      }
    }

    relevantEvents.sort((a, b) => a.minutes_away - b.minutes_away);

    const highImpactEvents = relevantEvents.filter(
      (e) => e.severity === 'CRITICAL' || e.severity === 'HIGH'
    );
    const activeEvents = highImpactEvents
      .filter((e) => e.minutes_away >= -afterMinutes && e.minutes_away <= beforeMinutes)
      .sort((a, b) => Math.abs(a.minutes_away) - Math.abs(b.minutes_away));

    const isFrozen = activeEvents.length > 0;

    let minutesToImpact: number | null = null;
    if (activeEvents.length > 0) {
      minutesToImpact = activeEvents[0].minutes_away;
    } else {
      const nextHigh = highImpactEvents.find((e) => e.minutes_away >= 0);
      const nextAny = relevantEvents.find((e) => e.minutes_away >= 0);
      minutesToImpact = nextHigh?.minutes_away ?? nextAny?.minutes_away ?? null;
    }

    const reason = isFrozen
      ? activeEvents[0].minutes_away >= 0
        ? `${activeEvents[0].severity} impact event "${activeEvents[0].name}" in ${activeEvents[0].minutes_away}m`
        : `${activeEvents[0].severity} impact event "${activeEvents[0].name}" active (${Math.abs(activeEvents[0].minutes_away)}m ago)`
      : null;

    const freezeStatus: FreezeStatus = {
      symbol: canonical,
      isFrozen,
      reason,
      minutesToImpact,
      activeEvents,
      source: 'engine',
      checkedAt: new Date(nowMs).toISOString(),
    };

    return {
      minutesAway: minutesToImpact,
      newsEvents: relevantEvents,
      freezeStatus,
    };
  }

  async getFreezeStatus(
    symbol: string,
    opts: { beforeMinutes?: number; afterMinutes?: number; nowMs?: number } = {}
  ): Promise<FreezeStatus> {
    const ctx = await this.getUpcomingNewsContext(symbol, opts);
    return ctx.freezeStatus;
  }

  async evaluateFreezeTransitions(
    symbols: string[],
    nowMs: number = Date.now()
  ): Promise<NewsFreezeTransitionEvent[]> {
    const emitted: NewsFreezeTransitionEvent[] = [];
    const timestamp = new Date(nowMs).toISOString();

    for (const sym of symbols) {
      const status = await this.getFreezeStatus(sym, { nowMs });
      const canonical = status.symbol;
      const prev = this.lastFreezeState.get(canonical) ?? {
        isFrozen: false,
        releasedEventIds: new Set<string>(),
      };

      const dispatch = (type: NewsFreezeTransitionEvent['type']) => {
        const event: NewsFreezeTransitionEvent = {
          type,
          symbol: canonical,
          status,
          timestamp,
        };
        emitted.push(event);
        if (this.transitionListener) {
          try {
            this.transitionListener(event);
          } catch {}
        }
      };

      if (!prev.isFrozen && status.isFrozen) {
        dispatch('NEWS_FREEZE_ENTER');
      }

      if (status.isFrozen) {
        for (const evt of status.activeEvents) {
          const evtId = String(evt.id);
          if (evt.minutes_away <= 0 && !prev.releasedEventIds.has(evtId)) {
            prev.releasedEventIds.add(evtId);
            dispatch('NEWS_RELEASED');
          }
        }
      }

      if (prev.isFrozen && !status.isFrozen) {
        prev.releasedEventIds.clear();
        dispatch('NEWS_FREEZE_EXIT');
      }

      prev.isFrozen = status.isFrozen;
      this.lastFreezeState.set(canonical, prev);
    }

    return emitted;
  }

  async getCalendar(filters: CalendarFilterOptions = {}): Promise<CalendarResult> {
    const nowMs = filters.nowMs ?? Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const hoursAhead = Number.isFinite(filters.hoursAhead) ? Number(filters.hoursAhead) : 24;
    const includePastMinutes = Number.isFinite(filters.includePastMinutes)
      ? Math.max(0, Number(filters.includePastMinutes))
      : 0;
    const allowedImpacts = new Set<NewsSeverity>(
      filters.impact && filters.impact.length > 0 ? filters.impact : ['CRITICAL', 'HIGH']
    );

    const categories =
      filters.category && VALID_CATEGORIES.has(filters.category.toLowerCase())
        ? [filters.category.toLowerCase()]
        : [...NEWS_CATEGORIES];

    const symbolPlan = filters.symbol ? getSymbolQueryPlan(filters.symbol) : null;
    const items = await this.collectCachedItems(categories);
    const ffRaw = await this.fetchForexFactoryCalendar().catch(() => []);
    const maxMinutes = hoursAhead * 60;
    const events: CalendarEvent[] = [];
    const seenEventKeys = new Set<string>();

    for (const item of items) {
      if (symbolPlan && !isItemRelevantToTokens(item, symbolPlan.tokens)) continue;
      const evt = toCalendarEvent(item, nowSec);
      if (!allowedImpacts.has(evt.severity)) continue;
      if (evt.minutes_away < -includePastMinutes || evt.minutes_away > maxMinutes) continue;
      const key = `${evt.datetime}:${evt.name}`;
      seenEventKeys.add(key);
      events.push(evt);
    }

    for (const ffEvt of ffRaw) {
      if (filters.category && filters.category.toLowerCase() !== 'forex') continue;
      if (symbolPlan) {
        const hay = `${ffEvt.headline} ${ffEvt.currencies.join(' ')}`.toUpperCase();
        if (!symbolPlan.tokens.some((token) => hay.includes(token))) continue;
      }
      if (!allowedImpacts.has(ffEvt.severity)) continue;
      const minutesAway = Math.floor((ffEvt.datetime - nowSec) / 60);
      if (minutesAway < -includePastMinutes || minutesAway > maxMinutes) continue;
      const key = `${ffEvt.datetime}:${ffEvt.name}`;
      if (seenEventKeys.has(key)) continue;
      seenEventKeys.add(key);
      events.push({ ...ffEvt, minutes_away: minutesAway });
    }

    events.sort((a, b) => a.minutes_away - b.minutes_away);

    return {
      events,
      count: events.length,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }
}

export const newsEngine = new NewsEngine();

// Backward-compatible functional exports
export const CATEGORIES = [...NEWS_CATEGORIES];
export const getCachedNews = (key: string) => newsEngine.getCachedNews(key);
export const setCachedNews = (key: string, data: NormalizedNewsItem[]) =>
  newsEngine.setCachedNews(key, data);
export const invalidateCachedNews = (key: string) => newsEngine.invalidateCachedNews(key);
export const isRedisAvailable = () => newsEngine.isRedisAvailable();
export const fetchMarketNews = (category = 'general', limit = 25) =>
  newsEngine.fetchMarketNews(category, limit);
export const prefetchAllCategories = () => newsEngine.pollAllCategories();
export const startNewsPoller = () => newsEngine.startPoller();
export const stopNewsPoller = () => newsEngine.stopPoller();
