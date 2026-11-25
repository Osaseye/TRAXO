import { auth } from './firebase';
import { useAuthStore } from '@/stores/useAuthStore';

const DEFAULT_LIVE_API_URL = 'https://traxo-backend-1.onrender.com';

const ENV_API_URL = ((import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL) as string | undefined)
  ?.trim()
  .replace(/\/+$/, '');

export function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalHost && (!ENV_API_URL || ENV_API_URL.includes('localhost') || ENV_API_URL.includes('127.0.0.1'))) {
      return DEFAULT_LIVE_API_URL;
    }
  }
  return ENV_API_URL || DEFAULT_LIVE_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function getActiveUid(): string | null {
  return useAuthStore.getState().user?.id || auth.currentUser?.uid || null;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
  const headers = new Headers(options.headers);
  const activeUid = getActiveUid();

  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (activeUid && !headers.has('X-Traxo-Uid')) {
    headers.set('X-Traxo-Uid', activeUid);
  }
  const activeEmail = useAuthStore.getState().user?.email || auth.currentUser?.email || '';
  if (activeEmail && !headers.has('X-Traxo-Admin-Email')) {
    headers.set('X-Traxo-Admin-Email', activeEmail);
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
  const activeUid = getActiveUid();
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (activeUid && !headers.has('X-Traxo-Uid')) {
    headers.set('X-Traxo-Uid', activeUid);
  }

  const response = await apiFetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || 'An error occurred');
  }

  return response.json();
}

// --- API Service Functions ---

export const getHistoricalSignals = (lastVisible: string | null = null, limit = 200) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (lastVisible) {
    params.set('lastVisible', lastVisible);
  }
  return request(`/api/signals/historical?${params.toString()}`);
};

export const getLiveSignals = () => {
  return request('/api/signals/live');
};

export const getMarketQuotes = () => {
  return request('/api/paper/quotes');
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
  const activeUid = uid?.trim() || getActiveUid();
  if (!activeUid) return Promise.resolve(null);
  return request(`/api/trading-context?uid=${encodeURIComponent(activeUid)}`);
};

export const postTradingContext = (data: Record<string, unknown>) => {
  const activeUid =
    typeof data?.uid === 'string' && data.uid.trim() ? data.uid.trim() : getActiveUid();
  if (!activeUid) {
    return Promise.reject(new Error('Authentication required to update trading context'));
  }
  return request('/api/trading-context', {
    method: 'POST',
    body: JSON.stringify({ ...data, uid: activeUid }),
  });
};

export const getJournalEntries = (uid?: string) => {
  const activeUid = uid?.trim() || getActiveUid();
  if (!activeUid) return Promise.resolve([]);
  return request(`/api/journal?uid=${encodeURIComponent(activeUid)}`);
};

export const postJournalEntry = <T extends object & { uid?: string }>(entry: T) => {
  const activeUid =
    typeof entry?.uid === 'string' && entry.uid.trim() ? entry.uid.trim() : getActiveUid();
  if (!activeUid) {
    return Promise.reject(new Error('Authentication required to save journal entry'));
  }
  return request('/api/journal', {
    method: 'POST',
    body: JSON.stringify({ ...entry, uid: activeUid }),
  });
};

export const updateJournalEntry = <T extends object & { uid?: string }>(id: string, updates: T) => {
  const activeUid =
    typeof updates?.uid === 'string' && updates.uid.trim() ? updates.uid.trim() : getActiveUid();
  if (!activeUid) {
    return Promise.reject(new Error('Authentication required to update journal entry'));
  }
  return request(`/api/journal/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...updates, uid: activeUid }),
  });
};

// --- Admin 5-Digit Login Access Codes ---

export const requestLoginAccessCode = (email: string) => {
  return request('/api/access-codes/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const verifyLoginAccessCode = (email: string, code: string) => {
  return request('/api/access-codes/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
};

export const getAdminAccessCodes = () => {
  return request('/api/access-codes/admin/list');
};

export const generateAdminAccessCode = (payload: {
  targetEmail?: string;
  requestId?: string;
  ttlHours?: number;
}) => {
  return request('/api/access-codes/admin/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const revokeAdminAccessCode = (code: string) => {
  return request('/api/access-codes/admin/revoke', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
};
