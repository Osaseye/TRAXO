import { create } from 'zustand'
import type { AnalysisSignal } from '@/lib/signalDetection'

export interface StoredSignal extends AnalysisSignal {
  symbol: string
  timeframe: string
}

interface AnalysisSignalState {
  signals: StoredSignal[]
  _uid: string | null
  addSignals: (signals: StoredSignal[]) => void
  clearSignals: () => void
  setUid: (uid: string | null) => void
  hydrateFromFirestore: (uid?: string | null) => Promise<void>
  saveToFirestore: (uid: string | null, signals: StoredSignal[]) => Promise<void>
  clearFirestoreSignals: (uid?: string | null) => Promise<void>
}

export const useAnalysisSignalStore = create<AnalysisSignalState>()((set) => ({
  signals: [],
  _uid: null,

  setUid: (uid) => set({ _uid: uid }),

  addSignals: (newSignals) =>
    set((state) => {
      const existingIds = new Set(state.signals.map((s) => s.id))
      const fresh = newSignals.filter((s) => !existingIds.has(s.id))
      if (fresh.length === 0) return state
      return { signals: [...fresh, ...state.signals].slice(0, 500) }
    }),

  clearSignals: () => set({ signals: [] }),

  hydrateFromFirestore: async (uid) => {
    try {
      const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const colRef = uid ? collection(db, 'users', uid, 'signals') : collection(db, 'signals')
      const q = query(colRef, orderBy('time', 'desc'), limit(500))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const signals: StoredSignal[] = snap.docs.map((d) => d.data() as StoredSignal)
        set({ signals })
      }
    } catch {
      // silently ignore
    }
  },

  saveToFirestore: async (uid, signals) => {
    if (signals.length === 0) return
    try {
      const { doc, writeBatch } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      // If no uid provided, prefer a build-time admin UID (Vite env var) to seed into admin's collection
      let targetUid = uid ?? null
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const envAdmin = (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_ADMIN_UID : undefined)
        if (!targetUid && envAdmin) targetUid = envAdmin
      } catch {
        // ignore env lookup failures
      }

      // Firestore writeBatch limit is 500 ops
      for (let i = 0; i < signals.length; i += 500) {
        const chunk = signals.slice(i, i + 500)
        const batch = writeBatch(db)
        for (const signal of chunk) {
          const ref = targetUid ? doc(db, 'users', targetUid, 'signals', signal.id) : doc(db, 'signals', signal.id)
          batch.set(ref, signal)
        }
        await batch.commit()
      }
    } catch {
      // silently ignore
    }
  },

  clearFirestoreSignals: async (uid) => {
    try {
      const { collection, getDocs, query, writeBatch, doc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const colRef = uid ? collection(db, 'users', uid, 'signals') : collection(db, 'signals')
      const snap = await getDocs(query(colRef))
      if (snap.empty) return
      for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = writeBatch(db)
        snap.docs
          .slice(i, i + 500)
          .forEach((d) => batch.delete(uid ? doc(db, 'users', uid, 'signals', d.id) : doc(db, 'signals', d.id)))
        await batch.commit()
      }
    } catch {
      // silently ignore
    }
  },
}))
