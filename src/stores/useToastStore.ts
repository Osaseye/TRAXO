import { create } from 'zustand'

export interface SignalToastItem {
  id: string
  symbol: string
  timeframe: string
  strategyLabel: string
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
}

export interface AppNotificationToast {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'info'
  createdAt: number
}

interface ToastState {
  toasts: SignalToastItem[]
  appToasts: AppNotificationToast[]
  addToast: (item: SignalToastItem) => void
  removeToast: (id: string) => void
  addAppToast: (item: AppNotificationToast) => void
  removeAppToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  appToasts: [],
  addToast: (item) =>
    set((state) => ({
      toasts: [item, ...state.toasts].slice(0, 4),
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  addAppToast: (item) =>
    set((state) => ({
      appToasts: [item, ...state.appToasts].slice(0, 5),
    })),
  removeAppToast: (id) =>
    set((state) => ({
      appToasts: state.appToasts.filter((t) => t.id !== id),
    })),
}))

export function showToast(title: string, message: string, type: 'success' | 'error' | 'info' = 'info') {
  useToastStore.getState().addAppToast({
    id: `app-toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    message,
    type,
    createdAt: Date.now(),
  })
}
