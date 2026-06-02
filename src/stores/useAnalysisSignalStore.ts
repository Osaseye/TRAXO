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
  hydrateFromFirestore: (uid: string) => Promise<void>
  saveToFirestore: (uid: string, signals: StoredSignal[]) => Promise<void>
  clearFirestoreSignals: (uid: string) => Promise<void>
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
      const q = query(
        collection(db, 'users', uid, 'signals'),
        orderBy('time', 'desc'),
        limit(500),
      )
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
    if (!uid || signals.length === 0) return
    try {
      const { doc, writeBatch } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      // Firestore writeBatch limit is 500 ops
      for (let i = 0; i < signals.length; i += 500) {
        const chunk = signals.slice(i, i + 500)
        const batch = writeBatch(db)
        for (const signal of chunk) {
          const ref = doc(db, 'users', uid, 'signals', signal.id)
          batch.set(ref, signal)
        }
        await batch.commit()
      }
    } catch {
      // silently ignore
    }
  },

  clearFirestoreSignals: async (uid) => {
    if (!uid) return
    try {
      const { collection, getDocs, query, writeBatch, doc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const snap = await getDocs(query(collection(db, 'users', uid, 'signals')))
      if (snap.empty) return
      for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = writeBatch(db)
        snap.docs
          .slice(i, i + 500)
          .forEach((d) => batch.delete(doc(db, 'users', uid, 'signals', d.id)))
        await batch.commit()
      }
    } catch {
      // silently ignore
    }
  },
}))
