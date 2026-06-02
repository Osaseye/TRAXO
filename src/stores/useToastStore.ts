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

interface ToastState {
  toasts: SignalToastItem[]
  addToast: (item: SignalToastItem) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (item) =>
    set((state) => ({
      toasts: [item, ...state.toasts].slice(0, 4),
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
