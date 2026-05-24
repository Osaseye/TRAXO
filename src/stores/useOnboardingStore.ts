import { create } from 'zustand'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'pro'
export type Instrument = 'forex' | 'crypto' | 'stocks' | 'commodities'
export type SubscriptionPlan = 'free' | 'pro'

export const ONBOARDING_STRATEGIES = [
  { id: 'wick-rejection',  name: 'Wick Rejection',  winRate: '74%', signalsPerDay: 4 },
  { id: 'breakout',        name: 'Breakout',         winRate: '68%', signalsPerDay: 3 },
  { id: 'order-block',     name: 'Order Block',      winRate: '71%', signalsPerDay: 3 },
  { id: 'supply-demand',   name: 'Supply & Demand',  winRate: '77%', signalsPerDay: 3 },
  { id: 'trend-following', name: 'Trend Following',  winRate: '69%', signalsPerDay: 2 },
] as const

export type OnboardingStrategyId = (typeof ONBOARDING_STRATEGIES)[number]['id']

const DEFAULT_STRATEGY: OnboardingStrategyId = 'wick-rejection'

interface OnboardingState {
  step: number
  experienceLevel: ExperienceLevel | null
  instruments: Instrument[]
  plan: SubscriptionPlan
  selectedStrategyId: OnboardingStrategyId
  selectedStrategyIds: OnboardingStrategyId[]
  riskPerTrade: number
  maxDailyLoss: number
  maxOpenTrades: number

  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setExperienceLevel: (level: ExperienceLevel) => void
  toggleInstrument: (instrument: Instrument) => void
  setPlan: (plan: SubscriptionPlan) => void
  setSelectedStrategy: (id: OnboardingStrategyId) => void
  setSelectedStrategies: (ids: OnboardingStrategyId[]) => void
  toggleSelectedStrategy: (id: OnboardingStrategyId) => void
  setRiskPerTrade: (v: number) => void
  setMaxDailyLoss: (v: number) => void
  setMaxOpenTrades: (v: number) => void
  reset: () => void
}

const initialState = {
  step: 0,
  experienceLevel: null,
  instruments: ['forex'] as Instrument[],
  plan: 'free' as SubscriptionPlan,
  selectedStrategyId: DEFAULT_STRATEGY,
  selectedStrategyIds: [DEFAULT_STRATEGY] as OnboardingStrategyId[],
  riskPerTrade: 1.0,
  maxDailyLoss: 2.0,
  maxOpenTrades: 5,
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: s.step + 1 })),
  prevStep: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  setExperienceLevel: (experienceLevel) => set({ experienceLevel }),
  toggleInstrument: (instrument) =>
    set((s) => ({
      instruments: s.instruments.includes(instrument)
        ? s.instruments.filter((i) => i !== instrument)
        : [...s.instruments, instrument],
    })),
  setPlan: (plan) =>
    set((s) => {
      if (plan === 'free') {
        const primary = s.selectedStrategyIds[0] ?? s.selectedStrategyId
        return {
          plan,
          selectedStrategyId: primary,
          selectedStrategyIds: [primary],
        }
      }
      return { plan }
    }),
  setSelectedStrategy: (selectedStrategyId) =>
    set((s) => ({
      selectedStrategyId,
      selectedStrategyIds:
        s.plan === 'pro'
          ? Array.from(new Set([selectedStrategyId, ...s.selectedStrategyIds]))
          : [selectedStrategyId],
    })),
  setSelectedStrategies: (ids) =>
    set((s) => {
      const unique = Array.from(new Set(ids)) as OnboardingStrategyId[]
      const fallback = s.selectedStrategyId || DEFAULT_STRATEGY
      const normalized = unique.length > 0 ? unique : [fallback]
      return {
        selectedStrategyIds: s.plan === 'pro' ? normalized.slice(0, 5) : [normalized[0]],
        selectedStrategyId: normalized[0],
      }
    }),
  toggleSelectedStrategy: (id) =>
    set((s) => {
      const exists = s.selectedStrategyIds.includes(id)
      const next = exists
        ? s.selectedStrategyIds.filter((x) => x !== id)
        : [...s.selectedStrategyIds, id]
      const normalized = next.length > 0 ? next.slice(0, 5) : [s.selectedStrategyId]
      return {
        selectedStrategyIds: s.plan === 'pro' ? normalized : [id],
        selectedStrategyId: s.plan === 'pro' ? normalized[0] : id,
      }
    }),
  setRiskPerTrade: (riskPerTrade) => set({ riskPerTrade }),
  setMaxDailyLoss: (maxDailyLoss) => set({ maxDailyLoss }),
  setMaxOpenTrades: (maxOpenTrades) => set({ maxOpenTrades }),
  reset: () => set(initialState),
}))
