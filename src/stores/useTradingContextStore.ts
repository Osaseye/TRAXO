import { create } from 'zustand'

export type JournalOutcome = 'pending' | 'skipped' | 'win' | 'loss' | 'breakeven'
export type JournalRisk = 'Low' | 'Medium' | 'High'

export interface JournalEntry {
  id: string
  suggestionKey: string
  symbol: string
  timeframe: string
  strategy: string
  action: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  confidence: number
  risk: JournalRisk
  suggestedPosition: number
  riskAmount: number
  taken: boolean
  outcome: JournalOutcome
  createdAt: number
  notes?: string
  attachmentUrl?: string // local object URL only for now
}

interface TradingContextState {
  accountBalance: number
  riskPerTradePct: number
  maxDailyLossPct: number
  journal: JournalEntry[]

  setAccountBalance: (value: number) => void
  setRiskPerTradePct: (value: number) => void
  setMaxDailyLossPct: (value: number) => void
  logSuggestionDecision: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void
  setJournalOutcome: (suggestionKey: string, outcome: JournalOutcome) => void
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void
  editJournalEntry: (id: string, updates: Partial<JournalEntry>) => void
  deleteJournalEntry: (id: string) => void
}

export const useTradingContextStore = create<TradingContextState>((set) => ({
    addJournalEntry: (entry) =>
      set((state) => {
        const newEntry: JournalEntry = {
          ...entry,
          id: `jrnl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
        }
        return { journal: [newEntry, ...state.journal].slice(0, 300) }
      }),

    editJournalEntry: (id, updates) =>
      set((state) => {
        const idx = state.journal.findIndex((j) => j.id === id)
        if (idx < 0) return state
        const updated = [...state.journal]
        updated[idx] = { ...updated[idx], ...updates }
        return { journal: updated }
      }),

    deleteJournalEntry: (id) =>
      set((state) => ({
        journal: state.journal.filter((j) => j.id !== id),
      })),
  accountBalance: 10000,
  riskPerTradePct: 1,
  maxDailyLossPct: 2,
  journal: [],

  setAccountBalance: (value) => set({ accountBalance: Math.max(0, Number(value) || 0) }),
  setRiskPerTradePct: (value) =>
    set({ riskPerTradePct: Math.max(0.1, Math.min(10, Number(value) || 1)) }),
  setMaxDailyLossPct: (value) =>
    set({ maxDailyLossPct: Math.max(0.5, Math.min(20, Number(value) || 2)) }),

  logSuggestionDecision: (entry) =>
    set((state) => {
      const existingIdx = state.journal.findIndex((j) => j.suggestionKey === entry.suggestionKey)
      const previous = existingIdx >= 0 ? state.journal[existingIdx] : null
      let nextBalance = state.accountBalance

      // Reserve capital when a suggestion is marked as taken and unresolved.
      if (!previous && entry.taken) {
        nextBalance = Math.max(0, nextBalance - entry.suggestedPosition)
      }

      if (previous && previous.taken !== entry.taken) {
        // Revert reservation if user switches from taken -> not taken before outcome resolution.
        if (previous.taken && !entry.taken && previous.outcome === 'pending') {
          nextBalance = nextBalance + previous.suggestedPosition
        }
        // Reserve capital if user switches from not taken -> taken.
        if (!previous.taken && entry.taken) {
          nextBalance = Math.max(0, nextBalance - entry.suggestedPosition)
        }
      }

      const next: JournalEntry = {
        ...entry,
        id: existingIdx >= 0 ? state.journal[existingIdx].id : `jrnl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: existingIdx >= 0 ? state.journal[existingIdx].createdAt : Date.now(),
      }

      if (existingIdx >= 0) {
        const updated = [...state.journal]
        updated[existingIdx] = next
        return { journal: updated, accountBalance: nextBalance }
      }

      return { journal: [next, ...state.journal].slice(0, 300), accountBalance: nextBalance }
    }),

  setJournalOutcome: (suggestionKey, outcome) =>
    set((state) => {
      const idx = state.journal.findIndex((j) => j.suggestionKey === suggestionKey)
      if (idx < 0) return state

      const target = state.journal[idx]
      const updatedJournal = [...state.journal]

      // Only settle cashflow once when moving from pending to final outcome.
      let nextBalance = state.accountBalance
      const settling = target.outcome === 'pending' && (outcome === 'win' || outcome === 'loss' || outcome === 'breakeven')

      if (target.taken && settling) {
        const riskDist = Math.abs(target.entry - target.sl)
        const rewardDist = Math.abs(target.tp - target.entry)
        const rr = riskDist > 0 ? rewardDist / riskDist : 0

        if (outcome === 'win') {
          const profit = target.riskAmount * rr
          nextBalance = nextBalance + target.suggestedPosition + profit
        } else if (outcome === 'loss') {
          const capitalReturned = Math.max(0, target.suggestedPosition - target.riskAmount)
          nextBalance = nextBalance + capitalReturned
        } else if (outcome === 'breakeven') {
          nextBalance = nextBalance + target.suggestedPosition
        }
      }

      updatedJournal[idx] = {
        ...target,
        outcome,
      }

      return {
        journal: updatedJournal,
        accountBalance: nextBalance,
      }
    }),
}))
