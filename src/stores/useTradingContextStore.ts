import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ChartSymbol =
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'XAUUSD'
  | 'XAGUSD'
  | 'AUDUSD'
  | 'USDCAD'
  | 'USDCHF'
  | 'NZDUSD'
  | 'EURJPY'
  | 'GBPJPY'
  | 'EURGBP'
  | 'SPX500'
  | 'NAS100'
  | 'US30'
  | 'DE40'
  | 'UK100'
  | 'JP225'
  | 'FRA40'
  | 'AUS200'
  | 'WTI'
  | 'BRENT'
  | 'NATGAS'
  | 'BTCUSDT'
  | 'ETHUSD'
  | 'SOLUSDT'
  | 'XRPUSDT'
  | 'ADAUSDT'
  | 'DOGEUSDT'
  | 'BNBUSDT'
  | 'AAPL'
  | 'MSFT'
  | 'NVDA'
  | 'TSLA'
  | 'AMZN'
  | 'META'
  | 'GOOGL'
  | 'NFLX'
  | 'AMD'
  | 'COIN'
  | 'MSTR'
  | 'SMCI'
  | 'MNQ'
export type ChartTimeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D'

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
  /** True once the user has moved SL to entry (break-even management). */
  breakEvenTriggered?: boolean
  /**
   * Current stop-loss price after any manual adjustments (e.g. break-even).
   * Falls back to the original `sl` field when undefined.
   */
  currentSl?: number
}

interface TradingContextState {
  accountBalance: number
  riskPerTradePct: number
  maxDailyLossPct: number
  chartSymbol: ChartSymbol
  chartTimeframe: ChartTimeframe
  journal: JournalEntry[]

  setAccountBalance: (value: number) => void
  setRiskPerTradePct: (value: number) => void
  setMaxDailyLossPct: (value: number) => void
  setChartSymbol: (value: ChartSymbol) => void
  setChartTimeframe: (value: ChartTimeframe) => void
  logSuggestionDecision: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void
  setJournalOutcome: (suggestionKey: string, outcome: JournalOutcome) => void
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void
  editJournalEntry: (id: string, updates: Partial<JournalEntry>) => void
  deleteJournalEntry: (id: string) => void
  /** Move SL to entry for a pending trade (break-even management). */
  triggerBreakEven: (id: string) => void

  // --- Notification preferences ---
  notifToastEnabled: boolean
  notifSoundEnabled: boolean
  notifPushEnabled: boolean
  notifMinConfidencePct: number
  notifSymbolFilters: ChartSymbol[]
  notifTimeframeFilters: ChartTimeframe[]
  notifStrategyFilters: string[]
  setNotifToastEnabled: (v: boolean) => void
  setNotifSoundEnabled: (v: boolean) => void
  setNotifPushEnabled: (v: boolean) => void
  setNotifMinConfidencePct: (v: number) => void
  setNotifSymbolFilters: (symbols: ChartSymbol[]) => void
  toggleNotifSymbolFilter: (symbol: ChartSymbol) => void
  setNotifTimeframeFilters: (timeframes: ChartTimeframe[]) => void
  toggleNotifTimeframeFilter: (timeframe: ChartTimeframe) => void
  setNotifStrategyFilters: (strategyIds: string[]) => void
  toggleNotifStrategyFilter: (strategyId: string) => void
}

export const useTradingContextStore = create<TradingContextState>()(persist((set) => ({
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

    triggerBreakEven: (id) =>
      set((state) => {
        const idx = state.journal.findIndex((j) => j.id === id)
        if (idx < 0) return state
        const entry = state.journal[idx]
        if (entry.outcome !== 'pending' || entry.breakEvenTriggered) return state
        const updated = [...state.journal]
        updated[idx] = { ...entry, breakEvenTriggered: true, currentSl: entry.entry }
        return { journal: updated }
      }),
  accountBalance: 10000,
  riskPerTradePct: 1,
  maxDailyLossPct: 2,
  chartSymbol: 'EURUSD',
  chartTimeframe: '4H',
  journal: [],

  notifToastEnabled: true,
  notifSoundEnabled: true,
  notifPushEnabled: false,
  notifMinConfidencePct: 0,
  notifSymbolFilters: [],
  notifTimeframeFilters: [],
  notifStrategyFilters: [],
  setNotifToastEnabled: (v) => set({ notifToastEnabled: v }),
  setNotifSoundEnabled: (v) => set({ notifSoundEnabled: v }),
  setNotifPushEnabled: (v) => set({ notifPushEnabled: v }),
  setNotifMinConfidencePct: (v) => set({ notifMinConfidencePct: Math.max(0, Math.min(100, Number(v) || 0)) }),
  setNotifSymbolFilters: (symbols) => set({ notifSymbolFilters: symbols }),
  toggleNotifSymbolFilter: (symbol) =>
    set((state) => ({
      notifSymbolFilters: state.notifSymbolFilters.includes(symbol)
        ? state.notifSymbolFilters.filter((item) => item !== symbol)
        : [...state.notifSymbolFilters, symbol],
    })),
  setNotifTimeframeFilters: (timeframes) => set({ notifTimeframeFilters: timeframes }),
  toggleNotifTimeframeFilter: (timeframe) =>
    set((state) => ({
      notifTimeframeFilters: state.notifTimeframeFilters.includes(timeframe)
        ? state.notifTimeframeFilters.filter((item) => item !== timeframe)
        : [...state.notifTimeframeFilters, timeframe],
    })),
  setNotifStrategyFilters: (strategyIds) => set({ notifStrategyFilters: strategyIds }),
  toggleNotifStrategyFilter: (strategyId) =>
    set((state) => ({
      notifStrategyFilters: state.notifStrategyFilters.includes(strategyId)
        ? state.notifStrategyFilters.filter((item) => item !== strategyId)
        : [...state.notifStrategyFilters, strategyId],
    })),

  setAccountBalance: (value) => set({ accountBalance: Math.max(0, Number(value) || 0) }),
  setRiskPerTradePct: (value) =>
    set({ riskPerTradePct: Math.max(0.1, Math.min(10, Number(value) || 1)) }),
  setMaxDailyLossPct: (value) =>
    set({ maxDailyLossPct: Math.max(0.5, Math.min(20, Number(value) || 2)) }),
  setChartSymbol: (value) => set({ chartSymbol: value }),
  setChartTimeframe: (value) => set({ chartTimeframe: value }),

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
}), {
  name: 'traxo-trading-context',
  partialize: (state) => ({
    accountBalance: state.accountBalance,
    riskPerTradePct: state.riskPerTradePct,
    maxDailyLossPct: state.maxDailyLossPct,
    chartSymbol: state.chartSymbol,
    chartTimeframe: state.chartTimeframe,
    journal: state.journal.map(({ attachmentUrl: _url, ...j }) => j),
    notifToastEnabled: state.notifToastEnabled,
    notifSoundEnabled: state.notifSoundEnabled,
    notifPushEnabled: state.notifPushEnabled,
    notifMinConfidencePct: state.notifMinConfidencePct,
    notifSymbolFilters: state.notifSymbolFilters,
    notifTimeframeFilters: state.notifTimeframeFilters,
    notifStrategyFilters: state.notifStrategyFilters,
  }),
}))
