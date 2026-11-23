import { useEffect } from 'react';
import { useLocation } from 'react-router';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  canonicalSignalKey,
  normalizeSignalStatus,
  useAnalysisSignalStore,
  type StoredSignal,
} from '@/stores/useAnalysisSignalStore';
import { notifySignal } from '@/hooks/useSignalNotification';
import webSocketService from '@/lib/websocket';
import { useNotificationStore, type StoredNotification } from '@/stores/useNotificationStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { apiFetch, getHistoricalSignals, getLiveSignals } from '@/lib/api';

interface FirestoreTimestampLike {
  seconds?: number;
  _seconds?: number;
  toMillis?: () => number;
}

interface RawSignalPayload {
  id?: string;
  symbol?: string;
  timeframe?: string;
  strategyId?: string;
  strategyLabel?: string;
  direction?: 'BUY' | 'SELL' | string;
  entry?: number | string;
  sl?: number | string;
  tp?: number | string;
  tp2?: number | null;
  rr?: number | string;
  confidence?: number | string;
  risk?: 'Low' | 'Medium' | 'High';
  reason?: string[];
  status?: string;
  time?: number | string;
  createdAt?: unknown;
  entryType?: string;
  rawEntryType?: string;
  exitMode?: 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2';
  tier?: string;
  market?: string;
  confluence?: StoredSignal['confluence'];
  metrics?: Record<string, unknown>;
}

function normalizeTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const asNum = Number(raw.trim());
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum > 1e12 ? Math.floor(asNum) : Math.floor(asNum * 1000);
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (raw && typeof raw === 'object') {
    const ts = raw as FirestoreTimestampLike;
    if (typeof ts.toMillis === 'function') {
      const millis = ts.toMillis();
      if (Number.isFinite(millis) && millis > 0) {
        return Math.floor(millis);
      }
    }
    const sec = ts._seconds ?? ts.seconds;
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
      return Math.floor(sec * 1000);
    }
  }
  return Date.now();
}

function normalizeTimeSec(rawTime: unknown, fallbackCreatedAt?: unknown): number {
  const numericTime = Number(rawTime);
  if (Number.isFinite(numericTime) && numericTime > 0) {
    return numericTime > 1e12 ? Math.floor(numericTime / 1000) : Math.floor(numericTime);
  }
  if (fallbackCreatedAt !== undefined) {
    return Math.floor(normalizeTimestampMs(fallbackCreatedAt) / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function toStoredSignal(raw: RawSignalPayload, statusOverride?: string): StoredSignal | null {
  if (!raw || !raw.symbol) return null;
  const timeSec = normalizeTimeSec(raw.time, raw.createdAt);
  const direction = String(raw.direction || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const entry = Number(raw.entry || 0);
  const sl = Number(raw.sl || 0);
  const tp = Number(raw.tp || 0);
  const confidence = Number(raw.confidence ?? 50);
  const id =
    raw.id ||
    `sig:${raw.strategyId || 'unknown'}:${raw.symbol}:${raw.timeframe || '15m'}:${direction}:${timeSec}`;

  return {
    id,
    time: timeSec,
    symbol: raw.symbol,
    timeframe: raw.timeframe || '15m',
    strategyId: raw.strategyId || 'unknown',
    strategyLabel: raw.strategyLabel || raw.strategyId || 'Strategy',
    direction,
    entry,
    sl,
    tp,
    tp2: raw.tp2 ?? undefined,
    rr: Number(raw.rr || 1.5),
    confidence,
    risk: raw.risk || (confidence >= 85 ? 'Low' : confidence >= 77 ? 'Medium' : 'High'),
    reason: Array.isArray(raw.reason) ? raw.reason : [],
    status: statusOverride ?? raw.status ?? 'live',
    entryType: raw.entryType,
    rawEntryType: raw.rawEntryType,
    exitMode: raw.exitMode,
    tier: raw.tier,
    market: raw.market,
    confluence: raw.confluence,
    ...(raw.metrics ? { metrics: raw.metrics } : {}),
  };
}

function signalToNotification(s: StoredSignal | RawSignalPayload): StoredNotification {
  const createdAt = normalizeTimestampMs(
    'createdAt' in s && s.createdAt !== undefined ? s.createdAt : s.time,
  );
  const timeSec = normalizeTimeSec(s.time, 'createdAt' in s ? s.createdAt : undefined);
  const direction = String(s.direction || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';

  return {
    id:
      s.id ||
      canonicalSignalKey({
        strategyId: s.strategyId,
        symbol: s.symbol,
        timeframe: s.timeframe,
        direction: s.direction,
        time: timeSec,
        createdAt,
      }),
    symbol: s.symbol || '',
    timeframe: s.timeframe || '',
    strategyId: s.strategyId || 'unknown',
    strategyLabel: s.strategyLabel || s.strategyId || 'Strategy',
    direction,
    entry: Number(s.entry || 0),
    sl: Number(s.sl || 0),
    tp: Number(s.tp || 0),
    rr: Number(s.rr || 1.5),
    confidence: Number(s.confidence ?? 50),
    reason: Array.isArray(s.reason) ? s.reason : [],
    time: timeSec > 0 ? (timeSec as UTCTimestamp) : undefined,
    read: false,
    createdAt,
  };
}

/**
 * Invisible component mounted at the App root.
 * 1. On mount → fetches existing live/historical signals from the REST API (hydration).
 * 2. Subscribes to WebSocket events so new signals trigger instant toasts + notifications.
 */
const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/verify-otp',
  '/admin/login',
]);

export function GlobalSignalMonitor() {
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTES.has(location.pathname);
  const activeUid = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (isPublicRoute) return;
    let cancelled = false;

    // ── Hydrate existing signals from REST API ──
    async function hydrateServerSignals() {
      try {
        const [liveSignals, historical] = await Promise.all([
          getLiveSignals(),
          getHistoricalSignals(),
        ]);

        if (cancelled) return;

        const liveRaw: RawSignalPayload[] = Array.isArray(liveSignals) ? liveSignals : [];
        const histRaw: RawSignalPayload[] = Array.isArray(historical?.signals) ? historical.signals : [];

        const liveArr = liveRaw
          .map((s) => toStoredSignal(s, 'live'))
          .filter((s): s is StoredSignal => s !== null);

        const liveIds = new Set(liveArr.map((s) => s.id));
        const nowSec = Math.floor(Date.now() / 1000);
        const previousSignals: StoredSignal[] = [];

        for (const raw of histRaw) {
          if (!raw?.id) continue;
          const canonical = normalizeSignalStatus(raw.status);
          if (liveIds.has(raw.id) && canonical === 'LIVE') continue;

          const timeSec = normalizeTimeSec(raw.time, raw.createdAt);
          const keepLive = canonical === 'LIVE' && timeSec > 0 && nowSec - timeSec < 86_400;
          const resolvedStatus =
            canonical !== 'LIVE'
              ? typeof raw.status === 'string' && raw.status
                ? raw.status
                : canonical
              : keepLive
                ? 'live'
                : 'expired';

          const stored = toStoredSignal(raw, resolvedStatus);
          if (stored) {
            previousSignals.push(stored);
          }
        }

        useAnalysisSignalStore.getState().addSignals([...liveArr, ...previousSignals]);

        // Only push genuinely live signals into notification store so resolved/expired history doesn't inflate counts
        const liveOnly = [
          ...liveArr,
          ...previousSignals.filter((s) => normalizeSignalStatus(s.status) === 'LIVE'),
        ];
        if (liveOnly.length > 0) {
          useNotificationStore.getState().addNotifications(liveOnly.map(signalToNotification));
        }

        // Populate historical resolved signals into Trading Journal
        const allFetched: RawSignalPayload[] = [...liveRaw, ...histRaw];
        if (allFetched.length > 0) {
          const tcStore = useTradingContextStore.getState();
          const riskAmount = tcStore.fixedRiskAmount > 0 ? tcStore.fixedRiskAmount : 50;

          for (const signal of allFetched) {
            if (!signal?.id) continue;
            const canonical = normalizeSignalStatus(signal.status);
            if (canonical !== 'WIN' && canonical !== 'LOSS') continue;

            const outcome: 'win' | 'loss' = canonical === 'WIN' ? 'win' : 'loss';
            const sigKey = canonicalSignalKey({
              id: signal.id,
              strategyId: signal.strategyId,
              symbol: signal.symbol,
              timeframe: signal.timeframe,
              direction: signal.direction,
              time: normalizeTimeSec(signal.time, signal.createdAt),
            });

            const existingEntry = tcStore.journal.find(
              (j) =>
                j.signalId === signal.id ||
                j.suggestionKey === signal.id ||
                j.suggestionKey === `signal:${signal.id}` ||
                (j.signalId ? canonicalSignalKey({ id: j.signalId }) === sigKey : false),
            );

            if (!existingEntry) {
              const direction =
                String(signal.direction || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
              tcStore.addJournalEntry({
                suggestionKey: signal.id,
                signalId: signal.id,
                mode: 'signal',
                symbol: signal.symbol || '',
                timeframe: signal.timeframe || '15m',
                strategy: signal.strategyId || signal.strategyLabel || 'System',
                action: direction,
                entry: Number(signal.entry || 0),
                sl: Number(signal.sl || 0),
                tp: Number(signal.tp || 0),
                confidence: Number(signal.confidence ?? 50),
                risk: 'Medium',
                suggestedPosition: 0,
                riskAmount,
                taken: false,
                outcome,
                createdAt: normalizeTimestampMs(signal.time ?? signal.createdAt),
              });

              if (outcome === 'loss') {
                apiFetch('/api/strategy-optimization/analyze-loss', {
                  method: 'POST',
                  body: JSON.stringify(signal),
                }).catch(() => {});
              }
            } else if (existingEntry.outcome === 'pending') {
              tcStore.setJournalOutcome(existingEntry.suggestionKey, outcome);
            }
          }
        }
      } catch {
        // Non-fatal: websocket updates can still arrive after startup.
      }
    }

    void hydrateServerSignals();

    // ── Real-time WebSocket listeners ──
    const handleSignal = (raw: RawSignalPayload) => {
      if (!raw || !raw.symbol) {
        console.warn('[GlobalSignalMonitor] Received invalid signal payload:', raw);
        return;
      }
      const signal = toStoredSignal(raw, 'live');
      if (!signal) return;
      console.log(
        '[GlobalSignalMonitor] 🔔 Live signal received via WebSocket:',
        signal.direction,
        signal.symbol,
        signal.timeframe,
      );
      useAnalysisSignalStore.getState().addSignals([signal]);
      const didNotify = notifySignal(signal);
      console.log('[GlobalSignalMonitor] notifySignal result:', didNotify);
    };

    const unsub1 = webSocketService.subscribe('signal', handleSignal);
    const unsub2 = webSocketService.subscribe('new-signal', handleSignal);

    const handleSignalUpdate = (signal: RawSignalPayload) => {
      if (!signal?.id || !signal?.status) return;
      useAnalysisSignalStore.getState().updateSignalStatus(signal.id, signal.status);

      const canonical = normalizeSignalStatus(signal.status);
      if (canonical === 'WIN' || canonical === 'LOSS') {
        const outcome: 'win' | 'loss' = canonical === 'WIN' ? 'win' : 'loss';
        const tcStore = useTradingContextStore.getState();
        const sigKey = canonicalSignalKey({ id: signal.id });

        const existingEntry = tcStore.journal.find(
          (j) =>
            j.signalId === signal.id ||
            j.suggestionKey === signal.id ||
            j.suggestionKey === `signal:${signal.id}` ||
            (j.signalId ? canonicalSignalKey({ id: j.signalId }) === sigKey : false),
        );

        if (!existingEntry) {
          const storedSig = useAnalysisSignalStore
            .getState()
            .signals.find((s) => s.id === signal.id || canonicalSignalKey(s) === sigKey);
          const riskAmount = tcStore.fixedRiskAmount > 0 ? tcStore.fixedRiskAmount : 50;
          const direction =
            String(signal.direction ?? storedSig?.direction ?? 'BUY').toUpperCase() === 'SELL'
              ? 'SELL'
              : 'BUY';

          tcStore.addJournalEntry({
            suggestionKey: signal.id,
            signalId: signal.id,
            mode: 'signal',
            symbol: signal.symbol ?? storedSig?.symbol ?? '',
            timeframe: signal.timeframe ?? storedSig?.timeframe ?? '15m',
            strategy:
              signal.strategyId ||
              signal.strategyLabel ||
              storedSig?.strategyId ||
              storedSig?.strategyLabel ||
              'System',
            action: direction,
            entry: Number(signal.entry ?? storedSig?.entry ?? 0),
            sl: Number(signal.sl ?? storedSig?.sl ?? 0),
            tp: Number(signal.tp ?? storedSig?.tp ?? 0),
            confidence: Number(signal.confidence ?? storedSig?.confidence ?? 50),
            risk: 'Medium',
            suggestedPosition: 0,
            riskAmount,
            taken: false,
            outcome,
            createdAt: normalizeTimestampMs(signal.time ?? signal.createdAt ?? storedSig?.time),
          });
        } else if (existingEntry.outcome === 'pending') {
          tcStore.setJournalOutcome(existingEntry.suggestionKey, outcome);
        }
      }
    };

    const unsub3 = webSocketService.subscribe('signal-updated', handleSignalUpdate);

    return () => {
      cancelled = true;
      unsub1();
      unsub2();
      unsub3();
    };
  }, [isPublicRoute, activeUid]);

  return null;
}
