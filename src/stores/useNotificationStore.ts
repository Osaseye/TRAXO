import { create } from 'zustand'
import type { UTCTimestamp } from 'lightweight-charts'
import type { AnalysisSignal } from '@/lib/signalDetection'

export interface StoredNotification extends Omit<Pick<AnalysisSignal, 'id' | 'time' | 'strategyId' | 'strategyLabel' | 'direction' | 'entry' | 'sl' | 'tp' | 'rr' | 'confidence' | 'reason'>, 'time'> {
  symbol: string
  timeframe: string
  time?: UTCTimestamp
  read: boolean
  createdAt: number
}

interface NotificationState {
  notifications: StoredNotification[]
  _uid: string | null
  setUid: (uid: string | null) => void
  addNotifications: (notifications: StoredNotification[]) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clearNotifications: () => void
  hydrateFromFirestore: (uid: string) => Promise<void>
  saveToFirestore: (uid: string, notifications: StoredNotification[]) => Promise<void>
  clearFirestoreNotifications: (uid: string) => Promise<void>
}

function dedupeNotifications(next: StoredNotification[]) {
  const bySetup = new Map<string, StoredNotification>()
  for (const notification of next) {
    const key = [
      notification.strategyId,
      notification.symbol,
      notification.timeframe,
      notification.direction,
      notification.time ?? 'no-time',
      Number(notification.entry || 0).toPrecision(8),
      Number(notification.sl || 0).toPrecision(8),
      Number(notification.tp || 0).toPrecision(8),
    ].join(':')
    const existing = bySetup.get(key)

    if (!existing) {
      bySetup.set(key, notification)
      continue
    }

    bySetup.set(key, {
      ...notification,
      id: existing.id,
      read: existing.read && notification.read,
      createdAt: Math.min(existing.createdAt, notification.createdAt),
    })
  }

  return Array.from(bySetup.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300)
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  _uid: null,

  setUid: (uid) => set({ _uid: uid }),

  addNotifications: (incoming) =>
    set((state) => {
      const merged = dedupeNotifications([
        ...incoming,
        ...state.notifications,
      ])
      const uid = get()._uid
      if (uid && incoming.length > 0) {
        void get().saveToFirestore(uid, incoming)
      }
      return { notifications: merged }
    }),

  markRead: (id) =>
    set((state) => {
      const next = state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      )
      const uid = get()._uid
      if (uid) {
        void get().saveToFirestore(uid, next)
      }
      return { notifications: next }
    }),

  markAllRead: () =>
    set((state) => {
      const next = state.notifications.map((notification) => ({ ...notification, read: true }))
      const uid = get()._uid
      if (uid) {
        void get().saveToFirestore(uid, next)
      }
      return { notifications: next }
    }),

  clearNotifications: () =>
    set(() => {
      const uid = get()._uid
      if (uid) {
        void get().clearFirestoreNotifications(uid)
      }
      return { notifications: [] }
    }),

  hydrateFromFirestore: async (uid) => {
    try {
      const { collection, getDocs, limit, orderBy, query } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const q = query(
        collection(db, 'users', uid, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(300),
      )
      const snap = await getDocs(q)
      if (!snap.empty) {
        const notifications = snap.docs.map((doc) => doc.data() as StoredNotification)
        set({ notifications: dedupeNotifications(notifications) })
      } else {
        set({ notifications: [] })
      }
    } catch {
      // silently ignore
    }
  },

  saveToFirestore: async (uid, notifications) => {
    if (!uid || notifications.length === 0) return
    try {
      const { doc, writeBatch } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      for (let i = 0; i < notifications.length; i += 500) {
        const batch = writeBatch(db)
        for (const notification of notifications.slice(i, i + 500)) {
          batch.set(doc(db, 'users', uid, 'notifications', notification.id), notification)
        }
        await batch.commit()
      }
    } catch {
      // silently ignore
    }
  },

  clearFirestoreNotifications: async (uid) => {
    if (!uid) return
    try {
      const { collection, getDocs, query, writeBatch, doc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const snap = await getDocs(query(collection(db, 'users', uid, 'notifications')))
      if (snap.empty) return
      for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = writeBatch(db)
        snap.docs.slice(i, i + 500).forEach((d) => batch.delete(doc(db, 'users', uid, 'notifications', d.id)))
        await batch.commit()
      }
    } catch {
      // silently ignore
    }
  },
}))
