import type { NewsEvent } from '../../../algorithms/orderBlock/types';
import { env } from '../../config/env';
import { normalizeSymbol } from '../../config/instruments';
import {
  DEFAULT_FREEZE_AFTER_MINUTES,
  DEFAULT_FREEZE_BEFORE_MINUTES,
  newsEngine,
  type CalendarEvent,
  type CalendarFilterOptions,
  type CalendarResult,
  type FreezeStatus,
  type NewsEngine,
  type PollResult,
} from './newsEngine';

export interface NewsServiceClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  pollTimeoutMs?: number;
  failureThreshold?: number;
  cooldownMs?: number;
  staleMaxAgeMs?: number;
  engine?: NewsEngine;
}

export interface UpcomingNewsContextResult {
  minutesAway: number | null;
  newsEvents: NewsEvent[];
  freezeStatus: FreezeStatus;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const DEFAULT_TIMEOUT_MS = 1_500;
const DEFAULT_POLL_TIMEOUT_MS = 15_000;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_STALE_MAX_AGE_MS = 5 * 60_000;

function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function toAlgorithmNewsEvents(events: CalendarEvent[]): NewsEvent[] {
  return events.map((evt) => ({
    name: evt.name,
    severity: evt.severity,
    timestamp_utc: evt.timestamp_utc,
    minutes_away: evt.minutes_away,
  }));
}

/**
 * Resilient client for querying the decoupled News Engine (either over HTTP when
 * NEWS_SERVICE_URL is configured or in-process), featuring strict timeouts, a
 * circuit breaker, stale-snapshot fallback, and non-blocking fail-open semantics
 * so signalScanner.ts and guardrails.ts never stall.
 */
export class NewsServiceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pollTimeoutMs: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly staleMaxAgeMs: number;
  private readonly engine: NewsEngine;

  private circuitState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;

  private readonly lastGoodFreeze = new Map<
    string,
    { status: FreezeStatus; events: CalendarEvent[]; cachedAt: number }
  >();

  constructor(options: NewsServiceClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? env.newsServiceUrl ?? '').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.staleMaxAgeMs = options.staleMaxAgeMs ?? DEFAULT_STALE_MAX_AGE_MS;
    this.engine = options.engine ?? newsEngine;
  }

  getCircuitState(): {
    state: CircuitState;
    consecutiveFailures: number;
    remoteConfigured: boolean;
  } {
    this.refreshCircuitState();
    return {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      remoteConfigured: Boolean(this.baseUrl),
    };
  }

  private refreshCircuitState(): void {
    if (this.circuitState === 'OPEN' && Date.now() - this.openedAt >= this.cooldownMs) {
      this.circuitState = 'HALF_OPEN';
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitState = 'CLOSED';
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitState = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  private canAttemptRemote(): boolean {
    if (!this.baseUrl) return false;
    this.refreshCircuitState();
    return this.circuitState !== 'OPEN';
  }

  private async fetchRemoteJson<T>(path: string, init?: RequestInit, timeoutMs = this.timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(`News service HTTP ${response.status}`);
      }
      const data = (await response.json()) as T;
      this.recordSuccess();
      return data;
    } catch (err) {
      this.recordFailure();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildFailOpenFreezeStatus(canonicalSymbol: string): FreezeStatus {
    const cached = this.lastGoodFreeze.get(canonicalSymbol);
    if (cached && Date.now() - cached.cachedAt <= this.staleMaxAgeMs) {
      return {
        ...cached.status,
        source: 'fallback',
      };
    }

    return {
      symbol: canonicalSymbol,
      isFrozen: false,
      reason: null,
      minutesToImpact: null,
      activeEvents: [],
      source: 'fallback',
      checkedAt: new Date().toISOString(),
    };
  }

  async getFreezeStatus(
    symbol: string,
    opts: { beforeMinutes?: number; afterMinutes?: number } = {}
  ): Promise<FreezeStatus> {
    const canonical = normalizeSymbol(symbol);
    const beforeMinutes = opts.beforeMinutes ?? DEFAULT_FREEZE_BEFORE_MINUTES;
    const afterMinutes = opts.afterMinutes ?? DEFAULT_FREEZE_AFTER_MINUTES;

    if (this.canAttemptRemote()) {
      try {
        const qs = new URLSearchParams({
          beforeMinutes: String(beforeMinutes),
          afterMinutes: String(afterMinutes),
        });
        const remote = await this.fetchRemoteJson<FreezeStatus>(
          `/api/v1/news/freeze-status/${encodeURIComponent(canonical)}?${qs.toString()}`
        );
        const normalized: FreezeStatus = {
          symbol: remote.symbol || canonical,
          isFrozen: Boolean(remote.isFrozen),
          reason: remote.reason ?? null,
          minutesToImpact: remote.minutesToImpact ?? null,
          activeEvents: Array.isArray(remote.activeEvents) ? remote.activeEvents : [],
          source: 'remote',
          checkedAt: remote.checkedAt || new Date().toISOString(),
        };
        this.lastGoodFreeze.set(canonical, {
          status: normalized,
          events: normalized.activeEvents,
          cachedAt: Date.now(),
        });
        return normalized;
      } catch (err: any) {
        console.warn(
          `[NewsServiceClient] Remote freeze-status failed for ${canonical}, falling back locally:`,
          err?.message || err
        );
      }
    }

    try {
      const local = await raceWithTimeout(
        this.engine.getFreezeStatus(canonical, { beforeMinutes, afterMinutes }),
        this.timeoutMs,
        `local getFreezeStatus(${canonical})`
      );
      this.lastGoodFreeze.set(canonical, {
        status: local,
        events: local.activeEvents,
        cachedAt: Date.now(),
      });
      return local;
    } catch (err: any) {
      console.warn(
        `[NewsServiceClient] Local fallback failed for ${canonical}, using fail-open snapshot:`,
        err?.message || err
      );
      return this.buildFailOpenFreezeStatus(canonical);
    }
  }

  async getUpcomingNewsContext(
    symbol: string,
    opts: { beforeMinutes?: number; afterMinutes?: number } = {}
  ): Promise<UpcomingNewsContextResult> {
    const canonical = normalizeSymbol(symbol);
    const beforeMinutes = opts.beforeMinutes ?? DEFAULT_FREEZE_BEFORE_MINUTES;
    const afterMinutes = opts.afterMinutes ?? DEFAULT_FREEZE_AFTER_MINUTES;

    if (this.canAttemptRemote()) {
      try {
        const [freezeStatus, calendar] = await Promise.all([
          this.getFreezeStatus(canonical, { beforeMinutes, afterMinutes }),
          this.getCalendar({
            symbol: canonical,
            hoursAhead: 3,
            includePastMinutes: 60,
            impact: ['CRITICAL', 'HIGH', 'MEDIUM'],
          }),
        ]);
        return {
          minutesAway: freezeStatus.minutesToImpact,
          newsEvents: toAlgorithmNewsEvents(calendar.events),
          freezeStatus,
        };
      } catch (err: any) {
        console.warn(
          `[NewsServiceClient] Remote news context failed for ${canonical}, falling back locally:`,
          err?.message || err
        );
      }
    }

    try {
      const localCtx = await raceWithTimeout(
        this.engine.getUpcomingNewsContext(canonical, { beforeMinutes, afterMinutes }),
        this.timeoutMs,
        `local getUpcomingNewsContext(${canonical})`
      );
      this.lastGoodFreeze.set(canonical, {
        status: localCtx.freezeStatus,
        events: localCtx.newsEvents,
        cachedAt: Date.now(),
      });
      return {
        minutesAway: localCtx.minutesAway,
        newsEvents: toAlgorithmNewsEvents(localCtx.newsEvents),
        freezeStatus: localCtx.freezeStatus,
      };
    } catch (err: any) {
      console.warn(
        `[NewsServiceClient] Local news context fallback failed for ${canonical}:`,
        err?.message || err
      );
      const fallbackStatus = this.buildFailOpenFreezeStatus(canonical);
      const cached = this.lastGoodFreeze.get(canonical);
      const staleEvents =
        cached && Date.now() - cached.cachedAt <= this.staleMaxAgeMs ? cached.events : [];
      return {
        minutesAway: fallbackStatus.minutesToImpact,
        newsEvents: toAlgorithmNewsEvents(staleEvents),
        freezeStatus: fallbackStatus,
      };
    }
  }

  async getCalendar(filters: CalendarFilterOptions = {}): Promise<CalendarResult & { source: string }> {
    if (this.canAttemptRemote()) {
      try {
        const qs = new URLSearchParams();
        if (filters.category) qs.set('category', filters.category);
        if (filters.symbol) qs.set('symbol', filters.symbol);
        if (filters.impact?.length) qs.set('impact', filters.impact.join(','));
        if (filters.hoursAhead !== undefined) qs.set('hoursAhead', String(filters.hoursAhead));
        if (filters.includePastMinutes !== undefined) {
          qs.set('includePastMinutes', String(filters.includePastMinutes));
        }

        const remote = await this.fetchRemoteJson<{
          events?: CalendarEvent[];
          count?: number;
          updatedAt?: string;
        }>(`/api/v1/news/calendar?${qs.toString()}`);

        const events = Array.isArray(remote.events) ? remote.events : [];
        return {
          events,
          count: remote.count ?? events.length,
          updatedAt: remote.updatedAt || new Date().toISOString(),
          source: 'remote',
        };
      } catch (err: any) {
        console.warn('[NewsServiceClient] Remote calendar failed, falling back locally:', err?.message || err);
      }
    }

    try {
      const local = await raceWithTimeout(
        this.engine.getCalendar(filters),
        this.timeoutMs,
        'local getCalendar'
      );
      return { ...local, source: 'engine' };
    } catch (err: any) {
      console.warn('[NewsServiceClient] Local calendar fallback failed:', err?.message || err);
      return {
        events: [],
        count: 0,
        updatedAt: new Date().toISOString(),
        source: 'fallback',
      };
    }
  }

  async triggerPoll(categories?: readonly string[]): Promise<PollResult> {
    if (this.canAttemptRemote()) {
      try {
        return await this.fetchRemoteJson<PollResult>(
          '/api/v1/news/poll',
          {
            method: 'POST',
            body: JSON.stringify(categories ? { categories } : {}),
          },
          this.pollTimeoutMs
        );
      } catch (err: any) {
        console.warn('[NewsServiceClient] Remote poll failed, falling back locally:', err?.message || err);
      }
    }

    try {
      return await raceWithTimeout(
        this.engine.pollAllCategories(categories),
        this.pollTimeoutMs,
        'local pollAllCategories'
      );
    } catch (err: any) {
      return {
        ok: false,
        polledAt: new Date().toISOString(),
        totalItems: 0,
        categories: {
          error: { ok: false, count: 0, error: err?.message || String(err) },
        },
      };
    }
  }
}

export const newsServiceClient = new NewsServiceClient();
