import { create } from 'zustand'
import type { AnalysisSignal } from '@/lib/signalDetection'
import { normalizeStrategyId } from '@/lib/strategyId'

export type CanonicalSignalStatus = 'LIVE' | 'WIN' | 'LOSS' | 'EXPIRED'

export function normalizeSignalStatus(raw: unknown): CanonicalSignalStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (['win', 'tp_hit', 'tp', 'won', 'win_tp1', 'win_tp2', 'win_tp1_be'].includes(s)) {
    return 'WIN'
  }
  if (['loss', 'sl_hit', 'sl', 'lost', 'loss_sl'].includes(s)) {
    return 'LOSS'
  }
  if (['expired', 'stale', 'cancelled', 'closed'].includes(s)) {
    return 'EXPIRED'
  }
  return 'LIVE'
}

function canonicalTimeframe(raw: unknown): string {
  const tf = String(raw ?? '').trim().toLowerCase()
  if (tf === '1min' || tf === '1m') return '1m'
  if (tf === '5min' || tf === '5m') return '5m'
  if (tf === '15min' || tf === '15m') return '15m'
  if (tf === '30min' || tf === '30m') return '30m'
  if (tf === '1h' || tf === '60m' || tf === '60min') return '1H'
  if (tf === '4h' || tf === '240m' || tf === '240min') return '4H'
  if (tf === '1day' || tf === '1d' || tf === 'd' || tf === 'daily') return '1D'
  return String(raw ?? '').trim()
}

export function canonicalSignalKey(input: {
  id?: string
  strategyId?: string
  strategy?: string
  symbol?: string
  timeframe?: string
  direction?: string
  action?: string
  time?: number
  createdAt?: number
}): string {
  const parts =
    typeof input.id === 'string' && input.id.startsWith('sig:')
      ? input.id.split(':')
      : []
  const [, idStrat, idSym, idTf, idDir, idTimePart] = parts

  const normStrat = normalizeStrategyId(input.strategyId || input.strategy || idStrat || '')
  const cleanSym = String(input.symbol || idSym || '')
    .replace(/\//g, '')
    .trim()
    .toUpperCase()
  const canonTf = canonicalTimeframe(input.timeframe || idTf || '')
  const dir = String(input.direction || input.action || idDir || '')
    .trim()
    .toUpperCase()

  let timeSec = 0
  const numTime = input.time !== undefined ? Number(input.time) : Number.NaN
  if (Number.isFinite(numTime) && numTime > 0) {
    timeSec = numTime > 1e12 ? Math.floor(numTime / 1000) : Math.floor(numTime)
  } else if (idTimePart !== undefined) {
    const parsedIdTime = Number(idTimePart)
    if (Number.isFinite(parsedIdTime) && parsedIdTime > 0) {
      timeSec = parsedIdTime > 1e12 ? Math.floor(parsedIdTime / 1000) : Math.floor(parsedIdTime)
    }
  }
  if (timeSec === 0 && input.createdAt !== undefined) {
    const numCreated = Number(input.createdAt)
    if (Number.isFinite(numCreated) && numCreated > 0) {
      timeSec = numCreated > 1e12 ? Math.floor(numCreated / 1000) : Math.floor(numCreated)
    }
  }

  if (!normStrat && !cleanSym && !canonTf && !dir && timeSec === 0 && input.id) {
    return input.id
  }

  return `${normStrat}:${cleanSym}:${canonTf}:${dir}:${timeSec}`
}

export interface StoredSignal extends AnalysisSignal {
  symbol: string
  timeframe: string
  metrics?: Record<string, unknown>
}

export interface AnalysisSignalState {
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

const STATUS_RANK: Record<CanonicalSignalStatus, number> = {
  WIN: 4,
  LOSS: 4,
  EXPIRED: 3,
  LIVE: 1,
}

/**
 * Rejects signals with zero (or near-zero) risk distance.
 */
function isSane(signal: StoredSignal) {
  const riskDist = Math.abs(signal.entry - signal.sl)
  return riskDist > 0.000001
}

function isSevenPartSigId(id: string): boolean {
  return id.startsWith('sig:') && id.split(':').length >= 7
}

function pickCanonicalId(primary: StoredSignal, secondary: StoredSignal): string {
  const primaryIs7 = isSevenPartSigId(primary.id)
  const secondaryIs7 = isSevenPartSigId(secondary.id)
  if (!primaryIs7 && secondaryIs7) return primary.id
  if (primaryIs7 && !secondaryIs7) return secondary.id
  return (secondary.time ?? 0) > (primary.time ?? 0) ? secondary.id : primary.id
}

function mergeSignalRecords(winner: StoredSignal, loser: StoredSignal): StoredSignal {
  const mergedReason =
    Array.isArray(winner.reason) && winner.reason.length > 0
      ? winner.reason
      : Array.isArray(loser.reason)
        ? loser.reason
        : []
  const mergedRr = winner.rr && winner.rr > 0 ? winner.rr : loser.rr
  const mergedMetrics =
    winner.metrics || loser.metrics
      ? { ...(loser.metrics ?? {}), ...(winner.metrics ?? {}) }
      : undefined
  const mergedConfluence = winner.confluence ?? loser.confluence
  const mergedTp2 = winner.tp2 ?? loser.tp2
  const mergedLabel = winner.strategyLabel || loser.strategyLabel

  return {
    ...loser,
    ...winner,
    id: pickCanonicalId(winner, loser),
    strategyLabel: mergedLabel,
    reason: mergedReason,
    rr: mergedRr,
    ...(mergedMetrics ? { metrics: mergedMetrics } : {}),
    ...(mergedConfluence !== undefined ? { confluence: mergedConfluence } : {}),
    ...(mergedTp2 !== undefined ? { tp2: mergedTp2 } : {}),
  }
}

function dedupeSignals(signals: StoredSignal[]) {
  const byKey = new Map<string, StoredSignal>()

  for (const signal of signals.filter(isSane)) {
    const key = canonicalSignalKey(signal)
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, signal)
      continue
    }

    const existingRank = STATUS_RANK[normalizeSignalStatus(existing.status)]
    const incomingRank = STATUS_RANK[normalizeSignalStatus(signal.status)]

    if (incomingRank > existingRank) {
      byKey.set(key, mergeSignalRecords(signal, existing))
    } else if (incomingRank < existingRank) {
      byKey.set(key, mergeSignalRecords(existing, signal))
    } else {
      const incomingTime = signal.time ?? 0
      const existingTime = existing.time ?? 0
      if (incomingTime > existingTime) {
        byKey.set(key, mergeSignalRecords(signal, existing))
      } else if (existingTime > incomingTime) {
        byKey.set(key, mergeSignalRecords(existing, signal))
      } else if (isSevenPartSigId(existing.id) && !isSevenPartSigId(signal.id)) {
        byKey.set(key, mergeSignalRecords(signal, existing))
      } else {
        byKey.set(key, mergeSignalRecords(existing, signal))
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.time - a.time)
}

export const selectLiveSignalCount = (state: AnalysisSignalState): number =>
  state.signals.filter((s) => normalizeSignalStatus(s.status) === 'LIVE').length

export const useAnalysisSignalStore = create<AnalysisSignalState>()((set) => ({
  signals: [],
  _uid: null,

  setUid: (uid) => set({ _uid: uid }),

  addSignals: (newSignals) =>
    set((state) => {
      const next = dedupeSignals([...newSignals, ...state.signals]).slice(0, 1000)
      if (
        next.length === state.signals.length &&
        next.every(
          (s, i) =>
            s.id === state.signals[i]?.id &&
            s.status === state.signals[i]?.status &&
            s.rr === state.signals[i]?.rr &&
            (s.reason?.length ?? 0) === (state.signals[i]?.reason?.length ?? 0),
        )
      ) {
        return state
      }
      return { signals: next }
    }),

  clearSignals: () => set({ signals: [] }),

  updateSignalStatus: (signalId, status) =>
    set((state) => {
      const targetKey = canonicalSignalKey({ id: signalId })
      const incomingRank = STATUS_RANK[normalizeSignalStatus(status)]
      let changed = false

      const nextSignals = state.signals.map((s) => {
        const matches =
          s.id === signalId ||
          (targetKey !== '' && canonicalSignalKey(s) === targetKey)
        if (!matches) return s

        const currentRank = STATUS_RANK[normalizeSignalStatus(s.status)]
        if (incomingRank < currentRank) {
          return s
        }
        if (s.status === status) {
          return s
        }
        changed = true
        return { ...s, status }
      })

      return changed ? { signals: nextSignals } : state
    }),

  hydrateFromFirestore: async (uid) => {
    try {
      const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const colRef = uid ? collection(db, 'users', uid, 'signals') : collection(db, 'signals')
      const q = query(colRef, orderBy('time', 'desc'), limit(1000))
      const snap = await getDocs(q)
      if (!snap.empty) {
        const signals: StoredSignal[] = snap.docs
          .map((d) => {
            const data = d.data() as StoredSignal
            return { ...data, id: data.id || d.id }
          })
          .filter(isSane)
        set((state) => ({
          signals: dedupeSignals([...state.signals, ...signals]).slice(0, 1000),
        }))
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
      let targetUid = uid ?? null
      try {
        const envAdmin =
          typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ADMIN_UID : undefined
        if (!targetUid && typeof envAdmin === 'string' && envAdmin) targetUid = envAdmin
      } catch {
        // ignore env lookup failures
      }

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
