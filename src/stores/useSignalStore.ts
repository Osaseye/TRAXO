import { create } from 'zustand'
import type { Signal, Timeframe } from '@/types'

interface SignalState {
  signals: Signal[]
  activeSymbol: string
  activeTimeframe: Timeframe
  setSignals: (signals: Signal[]) => void
  addSignal: (signal: Signal) => void
  setActiveSymbol: (symbol: string) => void
  setActiveTimeframe: (timeframe: Timeframe) => void
}

export const useSignalStore = create<SignalState>((set) => ({
  signals: [],
  activeSymbol: 'EURUSD',
  activeTimeframe: '1H',
  setSignals: (signals) => set({ signals }),
  addSignal: (signal) =>
    set((state) => ({ signals: [signal, ...state.signals].slice(0, 100) })),
  setActiveSymbol: (activeSymbol) => set({ activeSymbol }),
  setActiveTimeframe: (activeTimeframe) => set({ activeTimeframe }),
}))
