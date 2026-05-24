import { create } from 'zustand'
import type { Strategy, StrategyId } from '@/types'

interface StrategyState {
  strategies: Strategy[]
  setStrategies: (strategies: Strategy[]) => void
  toggleStrategy: (id: StrategyId) => void
  updateStrategy: (id: StrategyId, updates: Partial<Strategy>) => void
}

export const useStrategyStore = create<StrategyState>((set) => ({
  strategies: [],
  setStrategies: (strategies) => set({ strategies }),
  toggleStrategy: (id) =>
    set((state) => ({
      strategies: state.strategies.map((s) =>
        s.id === id ? { ...s, active: !s.active } : s
      ),
    })),
  updateStrategy: (id, updates) =>
    set((state) => ({
      strategies: state.strategies.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
}))
