import { create } from 'zustand'
import type { User } from '@/types'
import { auth, db } from '@/lib/firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'

interface AuthState {
  user: User | null
  idToken?: string | null
  isAuthenticated: boolean
  isLoading: boolean
  onboardingComplete: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setOnboardingComplete: (v: boolean) => void
  signUp: (name: string, email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  logout: () => Promise<void>
}

function mapFirebaseUser(u: FirebaseUser | null, profile?: Partial<User> | null): User | null {
  if (!u) return null
  return {
    id: u.uid,
    email: u.email ?? '',
    plan: 'free',
    subscriptionStatus: 'active',
    ...profile,
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  // subscribe to firebase auth state
  onAuthStateChanged(auth, async (fu) => {
    if (fu) {
      const token = await fu.getIdToken()
      try {
        const { getDoc, doc } = await import('firebase/firestore')
        const snapshot = await getDoc(doc(db, 'users', fu.uid))
        const profile = snapshot.exists() ? (snapshot.data() as Partial<User>) : null
        set({ user: mapFirebaseUser(fu, profile), isAuthenticated: true, idToken: token, isLoading: false })
      } catch (err) {
         
        console.warn('Failed to hydrate Firestore profile', err)
        set({ user: mapFirebaseUser(fu), isAuthenticated: true, idToken: token, isLoading: false })
      }
      // Hydrate onboarding preferences and signals from Firestore
      try {
        const { useOnboardingStore } = await import('@/stores/useOnboardingStore')
        useOnboardingStore.getState().setUid(fu.uid)
        void useOnboardingStore.getState().hydrateFromFirestore(fu.uid)
      } catch { /* non-fatal */ }
      try {
        const { useAnalysisSignalStore } = await import('@/stores/useAnalysisSignalStore')
        useAnalysisSignalStore.getState().setUid(fu.uid)
        void useAnalysisSignalStore.getState().hydrateFromFirestore(fu.uid)
      } catch { /* non-fatal */ }
      try {
        const { useNotificationStore } = await import('@/stores/useNotificationStore')
        useNotificationStore.getState().setUid(fu.uid)
        void useNotificationStore.getState().hydrateFromFirestore(fu.uid)
      } catch { /* non-fatal */ }
    } else {
      set({ user: null, isAuthenticated: false, idToken: null, isLoading: false })
      try {
        const { useOnboardingStore } = await import('@/stores/useOnboardingStore')
        useOnboardingStore.getState().setUid(null)
      } catch { /* non-fatal */ }
      try {
        const { useAnalysisSignalStore } = await import('@/stores/useAnalysisSignalStore')
        useAnalysisSignalStore.getState().setUid(null)
      } catch { /* non-fatal */ }
      try {
        const { useNotificationStore } = await import('@/stores/useNotificationStore')
        useNotificationStore.getState().setUid(null)
        useNotificationStore.setState({ notifications: [] })
      } catch { /* non-fatal */ }
    }
  })

  return {
    user: null,
    idToken: null,
    isAuthenticated: false,
    isLoading: true,
    onboardingComplete: false,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    setLoading: (isLoading) => set({ isLoading }),
    setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
    signUp: async (name: string, email: string, password: string) => {
      set({ isLoading: true })
      try {
        const res = await createUserWithEmailAndPassword(auth, email, password)
        const fu = res.user
        const token = await fu.getIdToken()
        // persist a basic profile document to Firestore
        try {
          // lazy import Firestore helpers to avoid top-level bundling issues
          const { doc, setDoc, serverTimestamp } = await import('firebase/firestore')
          if (fu) {
            const userRef = doc(db, 'users', fu.uid)
            await setDoc(userRef, {
              fullName: name,
              displayName: name,
              email: fu.email,
              createdAt: serverTimestamp(),
              plan: 'free',
            })
          }
        } catch (err) {
          // non-fatal: log and continue — devs can inspect Firestore writes separately
           
          console.warn('Failed to write user profile to Firestore', err)
        }

        set({ user: mapFirebaseUser(fu), isAuthenticated: true, idToken: token, isLoading: false })
      } catch (error) {
        set({ isLoading: false })
        throw error
      }
    },
    updateProfile: async (data: Partial<User>) => {
      set({ isLoading: true })
      try {
        const current = get().user
        const uid = current?.id || auth.currentUser?.uid
        if (!uid) throw new Error('Not authenticated')
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore')
        const userRef = doc(db, 'users', uid)
        const normalized = {
          ...data,
          fullName: data.fullName?.trim() || current?.fullName || undefined,
          displayName: data.displayName?.trim() || data.fullName?.trim() || current?.displayName || current?.fullName || undefined,
          country: data.country?.trim() || current?.country || undefined,
          bio: data.bio?.trim() || current?.bio || undefined,
          dob: data.dob?.trim() || current?.dob || undefined,
        }
        const toWrite = { ...normalized, updatedAt: serverTimestamp() }
        await setDoc(userRef, toWrite, { merge: true })
        // update local store user (shallow merge)
        set({ user: { ...(current ?? {}), ...normalized } as User, isLoading: false })
      } catch (err) {
        set({ isLoading: false })
         
        console.error('Failed to update profile', err)
        throw err
      }
    },
    signIn: async (email: string, password: string) => {
      set({ isLoading: true })
      try {
        const res = await signInWithEmailAndPassword(auth, email, password)
        const fu = res.user
        const token = await fu.getIdToken()
        try {
          const { getDoc, doc } = await import('firebase/firestore')
          const snapshot = await getDoc(doc(db, 'users', fu.uid))
          const profile = snapshot.exists() ? (snapshot.data() as Partial<User>) : null
          set({ user: mapFirebaseUser(fu, profile), isAuthenticated: true, idToken: token, isLoading: false })
        } catch (err) {
           
          console.warn('Failed to hydrate Firestore profile on sign-in', err)
          set({ user: mapFirebaseUser(fu), isAuthenticated: true, idToken: token, isLoading: false })
        }
        // Hydrate onboarding preferences and signals from Firestore
        try {
          const { useOnboardingStore } = await import('@/stores/useOnboardingStore')
          useOnboardingStore.getState().setUid(fu.uid)
          void useOnboardingStore.getState().hydrateFromFirestore(fu.uid)
        } catch { /* non-fatal */ }
        try {
          const { useAnalysisSignalStore } = await import('@/stores/useAnalysisSignalStore')
          useAnalysisSignalStore.getState().setUid(fu.uid)
          void useAnalysisSignalStore.getState().hydrateFromFirestore(fu.uid)
        } catch { /* non-fatal */ }
        try {
          const { useNotificationStore } = await import('@/stores/useNotificationStore')
          useNotificationStore.getState().setUid(fu.uid)
          void useNotificationStore.getState().hydrateFromFirestore(fu.uid)
        } catch { /* non-fatal */ }
      } catch (error) {
        set({ isLoading: false })
        throw error
      }
    },
    logout: async () => {
      set({ isLoading: true })
      await fbSignOut(auth)
      set({ user: null, isAuthenticated: false, onboardingComplete: false, idToken: null, isLoading: false })
      try {
        const { useNotificationStore } = await import('@/stores/useNotificationStore')
        useNotificationStore.getState().setUid(null)
        useNotificationStore.setState({ notifications: [] })
      } catch { /* non-fatal */ }
    },
  }
})
