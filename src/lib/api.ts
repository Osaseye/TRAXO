import { auth } from './firebase'; // Assuming you have a function to get the user's auth token

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function request(endpoint: string, options: any = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

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

export const getCandleData = (symbol: string, timeframe: string, outputsize = 200) => {
  return request(`/api/candles?symbol=${symbol}&timeframe=${timeframe}&outputsize=${outputsize}`);
};

export const getScannerStatus = () => {
  return request('/api/scanner/status');
};
