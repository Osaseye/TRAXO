import { create } from 'zustand'
import type { User } from '@/types'
import { auth, db } from '@/lib/firebase'
import { isAdminEmail, normalizeEpochMs } from '@/lib/userSignalScope'
import { verifyLoginAccessCode } from '@/lib/api'
import {
  clearSessionActivity,
  markSessionActivityNow,
} from '@/lib/sessionActivity'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
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
  signIn: (email: string, password: string, accessCode?: string) => Promise<void>
  signInWithGoogle: (accessCode?: string) => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  logout: () => Promise<void>
}

let accessCodeVerificationInFlight = false

function resolveUserCreatedAtMs(u: FirebaseUser, profile?: Partial<User> & { createdAt?: unknown } | null): number {
  const metaMs = normalizeEpochMs(u.metadata?.creationTime)
  if (metaMs > 0) return metaMs
  const profileMs = normalizeEpochMs(profile?.createdAtMs ?? profile?.createdAt)
  if (profileMs > 0) return profileMs
  return Date.now()
}

function mapFirebaseUser(
  u: FirebaseUser | null,
  profile?: (Partial<User> & { createdAt?: unknown }) | null
): User | null {
  if (!u) return null
  const createdAtMs = resolveUserCreatedAtMs(u, profile)
  return {
    id: u.uid,
    email: u.email ?? '',
    plan: 'free',
    subscriptionStatus: 'active',
    ...profile,
    createdAtMs,
  }
}

async function bindTradingContextOwner(uid: string | null) {
  try {
    const { useTradingContextStore } = await import('@/stores/useTradingContextStore')
    useTradingContextStore.getState().bindOwnerUid(uid)
  } catch { /* non-fatal */ }
}

export const useAuthStore = create<AuthState>((set, get) => {
  // subscribe to firebase auth state
  onAuthStateChanged(auth, async (fu) => {
    if (accessCodeVerificationInFlight) return
    if (fu) {
      await bindTradingContextOwner(fu.uid)
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
      await bindTradingContextOwner(null)
      try {
        const { useOnboardingStore } = await import('@/stores/useOnboardingStore')
        useOnboardingStore.getState().setUid(null)
      } catch { /* non-fatal */ }
      try {
        const { useAnalysisSignalStore } = await import('@/stores/useAnalysisSignalStore')
        useAnalysisSignalStore.getState().setUid(null)
        useAnalysisSignalStore.setState({ signals: [] })
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
        try {
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
          console.warn('Failed to write user profile to Firestore', err)
        }

        await bindTradingContextOwner(fu?.uid ?? null)
        markSessionActivityNow()
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
        const { cleanUndefined } = await import('@/lib/utils')
        const userRef = doc(db, 'users', uid)
        const rawNormalized = {
          ...data,
          fullName: data.fullName !== undefined ? data.fullName.trim() : current?.fullName,
          displayName:
            data.displayName !== undefined
              ? data.displayName.trim()
              : data.fullName !== undefined
              ? data.fullName.trim()
              : current?.displayName || current?.fullName,
          country: data.country !== undefined ? data.country.trim() : current?.country,
          bio: data.bio !== undefined ? data.bio.trim() : current?.bio,
          dob: data.dob !== undefined ? data.dob.trim() : current?.dob,
        }
        const cleaned = cleanUndefined(rawNormalized)
        const toWrite = { ...cleaned, updatedAt: serverTimestamp() }
        await setDoc(userRef, toWrite, { merge: true })
        set({ user: { ...(current ?? {}), ...cleaned } as User, isLoading: false })
      } catch (err) {
        set({ isLoading: false })
        console.error('Failed to update profile', err)
        throw err
      }
    },
    signIn: async (email: string, password: string, accessCode?: string) => {
      set({ isLoading: true })
      const cleanEmail = email.trim()
      const requiresCode = !isAdminEmail(cleanEmail)
      if (requiresCode && !/^\d{5}$/.test(String(accessCode || '').trim())) {
        set({ isLoading: false })
        throw new Error('A valid 5-digit access code from the admin is required to sign in.')
      }

      accessCodeVerificationInFlight = true
      try {
        const res = await signInWithEmailAndPassword(auth, cleanEmail, password)
        const fu = res.user

        if (!isAdminEmail(fu.email || cleanEmail)) {
          try {
            await verifyLoginAccessCode(fu.email || cleanEmail, String(accessCode || '').trim())
          } catch (codeErr) {
            await fbSignOut(auth).catch(() => {})
            set({ user: null, isAuthenticated: false, idToken: null, isLoading: false })
            throw codeErr
          }
        }

        const token = await fu.getIdToken()
        markSessionActivityNow()
        await bindTradingContextOwner(fu.uid)
        try {
          const { getDoc, doc } = await import('firebase/firestore')
          const snapshot = await getDoc(doc(db, 'users', fu.uid))
          const profile = snapshot.exists() ? (snapshot.data() as Partial<User>) : null
          set({ user: mapFirebaseUser(fu, profile), isAuthenticated: true, idToken: token, isLoading: false })
        } catch (err) {
          console.warn('Failed to hydrate Firestore profile on sign-in', err)
          set({ user: mapFirebaseUser(fu), isAuthenticated: true, idToken: token, isLoading: false })
        }
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
      } finally {
        accessCodeVerificationInFlight = false
      }
    },
    signInWithGoogle: async (accessCode?: string) => {
      set({ isLoading: true })
      accessCodeVerificationInFlight = true
      try {
        const provider = new GoogleAuthProvider()
        const res = await signInWithPopup(auth, provider)
        const fu = res.user

        if (!isAdminEmail(fu.email)) {
          const cleanCode = String(accessCode || '').trim()
          if (!/^\d{5}$/.test(cleanCode)) {
            await fbSignOut(auth).catch(() => {})
            set({ user: null, isAuthenticated: false, idToken: null, isLoading: false })
            throw new Error('Enter your 5-digit admin access code above before signing in with Google.')
          }
          try {
            await verifyLoginAccessCode(fu.email || '', cleanCode)
          } catch (codeErr) {
            await fbSignOut(auth).catch(() => {})
            set({ user: null, isAuthenticated: false, idToken: null, isLoading: false })
            throw codeErr
          }
        }

        const token = await fu.getIdToken()
        markSessionActivityNow()
        await bindTradingContextOwner(fu.uid)
        try {
          const { getDoc, doc } = await import('firebase/firestore')
          const snapshot = await getDoc(doc(db, 'users', fu.uid))
          const profile = snapshot.exists() ? (snapshot.data() as Partial<User>) : null
          set({ user: mapFirebaseUser(fu, profile), isAuthenticated: true, idToken: token, isLoading: false })
        } catch (err) {
          console.warn('Failed to hydrate Firestore profile on Google sign-in', err)
          set({ user: mapFirebaseUser(fu), isAuthenticated: true, idToken: token, isLoading: false })
        }
        try {
          const { useOnboardingStore } = await import('@/stores/useOnboardingStore')
          useOnboardingStore.getState().setUid(fu.uid)
          void useOnboardingStore.getState().hydrateFromFirestore(fu.uid)
        } catch { /* non-fatal */ }
      } catch (error) {
        set({ isLoading: false })
        throw error
      } finally {
        accessCodeVerificationInFlight = false
      }
    },
    logout: async () => {
      set({ isLoading: true })
      clearSessionActivity()
      await fbSignOut(auth)
      await bindTradingContextOwner(null)
      set({ user: null, isAuthenticated: false, onboardingComplete: false, idToken: null, isLoading: false })
      try {
        const { useNotificationStore } = await import('@/stores/useNotificationStore')
        useNotificationStore.getState().setUid(null)
        useNotificationStore.setState({ notifications: [] })
      } catch { /* non-fatal */ }
    },
  }
})
