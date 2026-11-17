import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { postJournalEntry, postTradingContext, updateJournalEntry } from '@/lib/api'

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

  riskMode: 'fixedAmount' | 'percentage'
  fixedRiskAmount: number
  autoSyncBrokerBalance: boolean

  setAccountBalance: (value: number) => void
  setRiskPerTradePct: (value: number) => void
  setFixedRiskAmount: (value: number) => void
  setRiskMode: (mode: 'fixedAmount' | 'percentage') => void
  setAutoSyncBrokerBalance: (value: boolean) => void
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

  // --- Auto-Trade Guardrails & Execution Rules ---
  autoTradeMinConfidence: number
  autoTradeMaxPositions: number
  autoTradeMinRR: number
  autoTradeSessionFilter: 'all' | 'london_ny' | 'ny_only'
  autoTradeAllowedCategories: string[]
  autoTradeCooldownOnLoss: boolean
  autoTradeCorrelationShield: boolean
  autoTradeNewsFilter: boolean
  autoTradeSpreadCapPips: number
  setAutoTradeMinConfidence: (v: number) => void
  setAutoTradeMaxPositions: (v: number) => void
  setAutoTradeMinRR: (v: number) => void
  setAutoTradeSessionFilter: (v: 'all' | 'london_ny' | 'ny_only') => void
  setAutoTradeAllowedCategories: (cats: string[]) => void
  toggleAutoTradeAllowedCategory: (cat: string) => void
  setAutoTradeCooldownOnLoss: (v: boolean) => void
  setAutoTradeCorrelationShield: (v: boolean) => void
  setAutoTradeNewsFilter: (v: boolean) => void
  setAutoTradeSpreadCapPips: (v: number) => void

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
  riskMode: 'fixedAmount',
  fixedRiskAmount: 500,
  autoSyncBrokerBalance: true,
  riskPerTradePct: 2.5,
  maxDailyLossPct: 6,
  chartSymbol: 'EURUSD',
  chartTimeframe: '4H',
  journal: [],

  // --- Auto-Trade Defaults & Guardrails ---
  autoTradeMinConfidence: 75,
  autoTradeMaxPositions: 3,
  autoTradeMinRR: 1.8,
  autoTradeSessionFilter: 'all',
  autoTradeAllowedCategories: ['forex', 'metals', 'stocks'],
  autoTradeCooldownOnLoss: true,

  setAutoTradeMinConfidence: (v) => {
    const val = Math.max(50, Math.min(95, Number(v) || 75))
    postTradingContext({ autoTradeMinConfidence: val }).catch(() => {})
    set({ autoTradeMinConfidence: val })
  },
  setAutoTradeMaxPositions: (v) => {
    const val = Math.max(1, Math.min(500, Number(v) || 1))
    postTradingContext({ autoTradeMaxPositions: val }).catch(() => {})
    set({ autoTradeMaxPositions: val })
  },
  setAutoTradeMinRR: (v) => {
    const val = Math.max(1.0, Math.min(4.0, Number(v) || 1.8))
    postTradingContext({ autoTradeMinRR: val }).catch(() => {})
    set({ autoTradeMinRR: val })
  },
  setAutoTradeSessionFilter: (v) => {
    postTradingContext({ autoTradeSessionFilter: v }).catch(() => {})
    set({ autoTradeSessionFilter: v })
  },
  setAutoTradeAllowedCategories: (cats) => {
    postTradingContext({ autoTradeAllowedCategories: cats }).catch(() => {})
    set({ autoTradeAllowedCategories: cats })
  },
  toggleAutoTradeAllowedCategory: (cat) =>
    set((state) => {
      const next = state.autoTradeAllowedCategories.includes(cat)
        ? state.autoTradeAllowedCategories.filter((c) => c !== cat)
        : [...state.autoTradeAllowedCategories, cat]
      postTradingContext({ autoTradeAllowedCategories: next }).catch(() => {})
      return { autoTradeAllowedCategories: next }
    }),
  autoTradeCorrelationShield: true,
  autoTradeNewsFilter: true,
  autoTradeSpreadCapPips: 3.5,

  setAutoTradeCorrelationShield: (v) => {
    postTradingContext({ autoTradeCorrelationShield: v }).catch(() => {})
    set({ autoTradeCorrelationShield: v })
  },
  setAutoTradeNewsFilter: (v) => {
    postTradingContext({ autoTradeNewsFilter: v }).catch(() => {})
    set({ autoTradeNewsFilter: v })
  },
  setAutoTradeSpreadCapPips: (v) => {
    const val = Math.max(0.5, Math.min(15.0, Number(v) || 3.5))
    postTradingContext({ autoTradeSpreadCapPips: val }).catch(() => {})
    set({ autoTradeSpreadCapPips: val })
  },
  setAutoTradeCooldownOnLoss: (v) => {
    postTradingContext({ autoTradeCooldownOnLoss: v }).catch(() => {})
    set({ autoTradeCooldownOnLoss: v })
  },

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

  setAccountBalance: (value) => {
    const nextVal = Math.max(0, Number(value) || 0)
    postTradingContext({ accountBalance: nextVal }).catch(() => {})
    set({ accountBalance: nextVal })
  },
  setRiskPerTradePct: (value) => {
    const nextVal = Math.max(0.1, Math.min(10, Number(value) || 1))
    postTradingContext({ riskPerTradePct: nextVal }).catch(() => {})
    set({ riskPerTradePct: nextVal })
  },
  setFixedRiskAmount: (value) => {
    const num = Number(value)
    const nextVal = isNaN(num) ? 0 : Math.max(0, num)
    postTradingContext({ fixedRiskAmount: nextVal }).catch(() => {})
    set({ fixedRiskAmount: nextVal })
  },
  setRiskMode: (mode) => {
    postTradingContext({ riskMode: mode }).catch(() => {})
    set({ riskMode: mode })
  },
  setAutoSyncBrokerBalance: (value) => {
    postTradingContext({ autoSyncBrokerBalance: value }).catch(() => {})
    set({ autoSyncBrokerBalance: value })
  },
  setMaxDailyLossPct: (value) => {
    const nextVal = Math.max(0.5, Math.min(20, Number(value) || 2))
    postTradingContext({ maxDailyLossPct: nextVal }).catch(() => {})
    set({ maxDailyLossPct: nextVal })
  },
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

      // Sync to backend asynchronously
      postJournalEntry(next).catch(() => {})
      postTradingContext({ accountBalance: nextBalance }).catch(() => {})

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

      // Sync outcome & updated balance to backend asynchronously
      updateJournalEntry(target.id, { outcome }).catch(() => {})
      postTradingContext({ accountBalance: nextBalance }).catch(() => {})

      if (outcome === 'loss') {
        fetch('/api/strategy-optimization/analyze-loss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target),
        }).catch(() => {})
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
    riskMode: state.riskMode,
    fixedRiskAmount: state.fixedRiskAmount,
    autoSyncBrokerBalance: state.autoSyncBrokerBalance,
    maxDailyLossPct: state.maxDailyLossPct,
    autoTradeMinConfidence: state.autoTradeMinConfidence,
    autoTradeMaxPositions: state.autoTradeMaxPositions,
    autoTradeMinRR: state.autoTradeMinRR,
    autoTradeSessionFilter: state.autoTradeSessionFilter,
    autoTradeAllowedCategories: state.autoTradeAllowedCategories,
    autoTradeCooldownOnLoss: state.autoTradeCooldownOnLoss,
    autoTradeCorrelationShield: state.autoTradeCorrelationShield,
    autoTradeNewsFilter: state.autoTradeNewsFilter,
    autoTradeSpreadCapPips: state.autoTradeSpreadCapPips,
    chartSymbol: state.chartSymbol,
    chartTimeframe: state.chartTimeframe,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
