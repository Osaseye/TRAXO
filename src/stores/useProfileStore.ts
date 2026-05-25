import { create } from 'zustand'

interface ProfileFields {
  firstName: string
  lastName: string
  displayName: string
  email: string
  phone: string
  country: string
}

interface ProfileState extends ProfileFields {
  twoFaEnabled: boolean
  updateProfile: (updates: Partial<ProfileFields>) => void
  setTwoFaEnabled: (enabled: boolean) => void
}

export const useProfileStore = create<ProfileState>((set) => ({
  firstName: 'Avery',
  lastName: 'Walker',
  displayName: 'AveryW',
  email: '',
  phone: '+1 555 0182',
  country: 'United States',
  twoFaEnabled: false,

  updateProfile: (updates) => set((state) => ({ ...state, ...updates })),
  setTwoFaEnabled: (twoFaEnabled) => set({ twoFaEnabled }),
}))
