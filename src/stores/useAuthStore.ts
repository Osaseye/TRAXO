import { create } from 'zustand'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  onboardingComplete: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setOnboardingComplete: (v: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  onboardingComplete: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  logout: () => set({ user: null, isAuthenticated: false, onboardingComplete: false }),
}))
