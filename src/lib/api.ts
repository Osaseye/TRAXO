/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from './firebase'; // Assuming you have a function to get the user's auth token

const ENV_API_URL = ((import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL) as string | undefined)
  ?.trim()
  .replace(/\/$/, '');

export function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalHost && (!ENV_API_URL || ENV_API_URL.includes('localhost') || ENV_API_URL.includes('127.0.0.1'))) {
      return window.location.origin.replace(/\/$/, '');
    }
  }
  return ENV_API_URL || 'http://localhost:8080';
}

export const API_BASE_URL = resolveApiBaseUrl();

export function getActiveUid(): string {
  return auth.currentUser?.uid || 'default_trader';
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('X-Traxo-Uid')) {
    headers.set('X-Traxo-Uid', getActiveUid());
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

async function request(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('X-Traxo-Uid')) {
    headers.set('X-Traxo-Uid', getActiveUid());
  }

  const response = await apiFetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})); // Gracefully handle non-JSON error responses
    throw new Error(errorData.message || 'An error occurred');
  }

  return response.json();
}

// --- API Service Functions ---

export const getHistoricalSignals = (lastVisible = null) => {
  const endpoint = lastVisible ? `/api/signals/historical?lastVisible=${lastVisible}` : '/api/signals/historical';
  return request(endpoint);
};

export const getLiveSignals = () => {
  return request('/api/signals/live');
};

export const getCandleData = (
  symbol: string,
  timeframe: string,
  outputsize = 200,
  options?: { from?: number; to?: number; limit?: number; source?: 'sqlite' }
) => {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    outputsize: String(outputsize),
  });
  if (options?.from !== undefined) params.set('from', String(options.from));
  if (options?.to !== undefined) params.set('to', String(options.to));
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.source) params.set('source', options.source);
  return request(`/api/candles?${params.toString()}`);
};

export const getScannerStatus = () => {
  return request('/api/scanner/status');
};

export const getScannerRejects = (symbol: string, timeframe: string) => {
  return request(`/api/scanner/rejects?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
};

export const getTradingContext = (uid?: string) => {
  const activeUid = uid || getActiveUid();
  return request(`/api/trading-context?uid=${encodeURIComponent(activeUid)}`);
};

export const postTradingContext = (data: Record<string, unknown>) => {
  const activeUid =
    typeof data?.uid === 'string' && data.uid.trim() ? data.uid : getActiveUid();
  return request('/api/trading-context', {
    method: 'POST',
    body: JSON.stringify({ ...data, uid: activeUid }),
  });
};

export const getJournalEntries = (uid?: string) => {
  const activeUid = uid || getActiveUid();
  return request(`/api/journal?uid=${encodeURIComponent(activeUid)}`);
};

export const postJournalEntry = (entry: any) => {
  const activeUid =
    typeof entry?.uid === 'string' && entry.uid.trim() ? entry.uid : getActiveUid();
  return request('/api/journal', {
    method: 'POST',
    body: JSON.stringify({ ...entry, uid: activeUid }),
  });
};

export const updateJournalEntry = (id: string, updates: any) => {
  const activeUid =
    typeof updates?.uid === 'string' && updates.uid.trim() ? updates.uid : getActiveUid();
  return request(`/api/journal/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...updates, uid: activeUid }),
  });
};
