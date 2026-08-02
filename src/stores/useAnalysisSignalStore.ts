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
  updateSignalStatus: (signalId: string, status: string) => void
  setUid: (uid: string | null) => void
  hydrateFromFirestore: (uid?: string | null) => Promise<void>
  saveToFirestore: (uid: string | null, signals: StoredSignal[]) => Promise<void>
  clearFirestoreSignals: (uid?: string | null) => Promise<void>
}

function signalFingerprint(signal: StoredSignal) {
  return [
    signal.strategyId,
    signal.symbol,
    signal.timeframe,
    signal.direction,
    signal.time,
  ].join(':')
}

function dedupeSignals(signals: StoredSignal[]) {
  const byFingerprint = new Map<string, StoredSignal>()

  for (const signal of signals) {
    const key = signalFingerprint(signal)
    const existing = byFingerprint.get(key)

    if (!existing) {
      byFingerprint.set(key, signal)
      continue
    }

    if (existing.status !== 'live' && signal.status === 'live') {
      byFingerprint.set(key, signal)
    }
  }

  return Array.from(byFingerprint.values()).sort((a, b) => b.time - a.time)
}

export const useAnalysisSignalStore = create<AnalysisSignalState>()((set) => ({
  signals: [],
  _uid: null,

  setUid: (uid) => set({ _uid: uid }),

  addSignals: (newSignals) =>
    set((state) => {
      const next = dedupeSignals([...newSignals, ...state.signals]).slice(0, 500)
      if (next.length === state.signals.length && next.every((s, i) => s.id === state.signals[i]?.id && s.status === state.signals[i]?.status)) {
        return state
      }
      return { signals: next }
    }),

  clearSignals: () => set({ signals: [] }),

  updateSignalStatus: (signalId, status) =>
    set((state) => {
      const idx = state.signals.findIndex((s) => s.id === signalId)
      if (idx === -1) return state
      const nextSignals = [...state.signals]
      nextSignals[idx] = { ...nextSignals[idx], status }
      return { signals: nextSignals }
    }),

  hydrateFromFirestore: async (uid) => {
    try {
      const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const colRef = uid ? collection(db, 'users', uid, 'signals') : collection(db, 'signals')
      const q = query(colRef, orderBy('time', 'desc'), limit(500))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const signals: StoredSignal[] = snap.docs.map((d) => d.data() as StoredSignal)
        set({ signals: dedupeSignals(signals).slice(0, 500) })
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
