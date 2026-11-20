import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  TRAXO_STRATEGIES,
  type LegacyStrategyCatalogId,
  type TraxoCatalogStrategyId,
  type TraxoMarketPillar,
} from '@/lib/traxoStrategies'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'pro'
export type Instrument = 'forex' | 'crypto' | 'stocks' | 'commodities'
export type SubscriptionPlan = 'free' | 'pro'

export interface OnboardingStrategyItem {
  id: TraxoCatalogStrategyId
  name: string
  winRate: string
  signalsPerDay: number
  market: TraxoMarketPillar
  marketLabel: string
}

export const ONBOARDING_STRATEGIES: readonly OnboardingStrategyItem[] = TRAXO_STRATEGIES.map(
  (spec) => ({
    id: spec.id,
    name: spec.name,
    winRate: spec.winRate,
    signalsPerDay: spec.signalsPerDay,
    market: spec.market,
    marketLabel: spec.marketLabel,
  }),
)

export type OnboardingStrategyId = TraxoCatalogStrategyId | LegacyStrategyCatalogId

const DEFAULT_STRATEGY: OnboardingStrategyId = 'traxo-london-apex'
const ALL_STRATEGY_IDS: OnboardingStrategyId[] = ONBOARDING_STRATEGIES.map((s) => s.id)

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
  // internal uid for auto-sync (not persisted)
  _uid: string | null

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
  setUid: (uid: string | null) => void
  hydrateFromFirestore: (uid: string) => Promise<void>
  syncToFirestore: () => Promise<void>
}

const initialState = {
  step: 0,
  experienceLevel: null,
  instruments: ['forex'] as Instrument[],
  plan: 'pro' as SubscriptionPlan,
  selectedStrategyId: DEFAULT_STRATEGY,
  selectedStrategyIds: [...ALL_STRATEGY_IDS] as OnboardingStrategyId[],
  riskPerTrade: 1.0,
  maxDailyLoss: 2.0,
  maxOpenTrades: 5,
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...initialState,
      _uid: null,

      setUid: (uid) => set({ _uid: uid }),

      hydrateFromFirestore: async (uid) => {
        try {
          const { getDoc, doc } = await import('firebase/firestore')
          const { db } = await import('@/lib/firebase')
          const snap = await getDoc(doc(db, 'users', uid))
          if (snap.exists()) {
            const prefs = snap.data().preferences as Partial<typeof initialState> | undefined
            if (prefs) {
              const incomingIds = Array.isArray(prefs.selectedStrategyIds)
                ? (prefs.selectedStrategyIds as OnboardingStrategyId[]).filter((id) =>
                    ALL_STRATEGY_IDS.includes(id),
                  )
                : []
              const wasLockedFree = prefs.plan !== 'pro' && incomingIds.length <= 1

              set({
                experienceLevel: prefs.experienceLevel ?? null,
                instruments: (prefs.instruments as Instrument[]) ?? ['forex'],
                plan: 'pro',
                selectedStrategyId:
                  prefs.selectedStrategyId && ALL_STRATEGY_IDS.includes(prefs.selectedStrategyId)
                    ? prefs.selectedStrategyId
                    : DEFAULT_STRATEGY,
                selectedStrategyIds:
                  wasLockedFree || incomingIds.length === 0 ? [...ALL_STRATEGY_IDS] : incomingIds,
                riskPerTrade: prefs.riskPerTrade ?? 1.0,
                maxDailyLoss: prefs.maxDailyLoss ?? 2.0,
                maxOpenTrades: prefs.maxOpenTrades ?? 5,
              })
            }
          }
        } catch {
          // silently ignore — localStorage value already loaded via persist
        }
      },

      syncToFirestore: async () => {
        const state = get()
        const uid = state._uid
        if (!uid) return
        try {
          const { doc, setDoc, serverTimestamp } = await import('firebase/firestore')
          const { db } = await import('@/lib/firebase')
          const { cleanUndefined } = await import('@/lib/utils')
          const rawPrefs = {
            experienceLevel: state.experienceLevel,
            instruments: state.instruments,
            plan: 'pro',
            selectedStrategyId: state.selectedStrategyId,
            selectedStrategyIds: state.selectedStrategyIds,
            riskPerTrade: state.riskPerTrade,
            maxDailyLoss: state.maxDailyLoss,
            maxOpenTrades: state.maxOpenTrades,
          }
          await setDoc(
            doc(db, 'users', uid),
            {
              preferences: cleanUndefined(rawPrefs),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )
        } catch {
          // silently ignore
        }
      },

      setStep: (step) => set({ step }),
      nextStep: () => set((s) => ({ step: s.step + 1 })),
      prevStep: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
      setExperienceLevel: (experienceLevel) => {
        set({ experienceLevel })
        void get().syncToFirestore()
      },
      toggleInstrument: (instrument) => {
        set((s) => ({
          instruments: s.instruments.includes(instrument)
            ? s.instruments.filter((i) => i !== instrument)
            : [...s.instruments, instrument],
        }))
        void get().syncToFirestore()
      },
      setPlan: (_plan) => {
        // All 5 strategies are unlocked out-of-the-box; strategy locks never block any strategy.
        void _plan
        set((s) => ({
          plan: 'pro',
          selectedStrategyIds:
            s.selectedStrategyIds.length > 0 ? s.selectedStrategyIds : [...ALL_STRATEGY_IDS],
        }))
        void get().syncToFirestore()
      },
      setSelectedStrategy: (selectedStrategyId) => {
        set((s) => ({
          plan: 'pro',
          selectedStrategyId,
          selectedStrategyIds: Array.from(new Set([selectedStrategyId, ...s.selectedStrategyIds])).slice(
            0,
            ALL_STRATEGY_IDS.length,
          ),
        }))
        void get().syncToFirestore()
      },
      setSelectedStrategies: (ids) => {
        set((s) => {
          const unique = Array.from(new Set(ids)).filter((id) =>
            ALL_STRATEGY_IDS.includes(id),
          ) as OnboardingStrategyId[]
          const fallback = s.selectedStrategyId || DEFAULT_STRATEGY
          const normalized = unique.length > 0 ? unique : [fallback]
          return {
            plan: 'pro',
            selectedStrategyIds: normalized.slice(0, ALL_STRATEGY_IDS.length),
            selectedStrategyId: normalized[0],
          }
        })
        void get().syncToFirestore()
      },
      toggleSelectedStrategy: (id) => {
        set((s) => {
          const exists = s.selectedStrategyIds.includes(id)
          const next = exists
            ? s.selectedStrategyIds.filter((x) => x !== id)
            : [...s.selectedStrategyIds, id]
          const normalized = next.length > 0 ? next.slice(0, ALL_STRATEGY_IDS.length) : [s.selectedStrategyId]
          return {
            plan: 'pro',
            selectedStrategyIds: normalized,
            selectedStrategyId: normalized[0],
          }
        })
        void get().syncToFirestore()
      },
      setRiskPerTrade: (riskPerTrade) => {
        set({ riskPerTrade })
        void get().syncToFirestore()
      },
      setMaxDailyLoss: (maxDailyLoss) => {
        set({ maxDailyLoss })
        void get().syncToFirestore()
      },
      setMaxOpenTrades: (maxOpenTrades) => {
        set({ maxOpenTrades })
        void get().syncToFirestore()
      },
      reset: () => set(initialState),
    }),
    {
      name: 'traxo-onboarding',
      version: 3,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<OnboardingState>
        const existingIds = Array.isArray(state.selectedStrategyIds)
          ? (state.selectedStrategyIds as OnboardingStrategyId[]).filter((id) =>
              ALL_STRATEGY_IDS.includes(id),
            )
          : []
        const nextIds = existingIds.length > 0 ? existingIds.slice(0, ALL_STRATEGY_IDS.length) : [...ALL_STRATEGY_IDS]
        const nextPrimary =
          state.selectedStrategyId && ALL_STRATEGY_IDS.includes(state.selectedStrategyId)
            ? state.selectedStrategyId
            : nextIds[0]

        return {
          ...initialState,
          ...state,
          plan: 'pro' as SubscriptionPlan,
          selectedStrategyId: nextPrimary,
          selectedStrategyIds: nextIds,
        }
      },
      // Only persist data fields, not internal state or methods
      partialize: (state) => ({
        step: state.step,
        experienceLevel: state.experienceLevel,
        instruments: state.instruments,
        plan: state.plan,
        selectedStrategyId: state.selectedStrategyId,
        selectedStrategyIds: state.selectedStrategyIds,
        riskPerTrade: state.riskPerTrade,
        maxDailyLoss: state.maxDailyLoss,
        maxOpenTrades: state.maxOpenTrades,
      }),
    },
  ),
)
