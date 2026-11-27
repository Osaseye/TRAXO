import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { isAdminUser } from '@/lib/userSignalScope'
import {
  clearSessionActivity,
  markSessionActivityNow,
  readLastActivityMs,
  SESSION_TIMEOUT_MS,
  SESSION_WARNING_BEFORE_MS,
} from '@/lib/sessionActivity'
import { showToast } from '@/stores/useToastStore'

const ACTIVITY_THROTTLE_MS = 15_000
const CHECK_INTERVAL_MS = 10_000

export function SessionInactivityGuard() {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const lastWriteRef = useRef<number>(0)
  const warnedRef = useRef<boolean>(false)
  const loggingOutRef = useRef<boolean>(false)

  useEffect(() => {
    if (!isAuthenticated || !user || isAdminUser(user)) {
      warnedRef.current = false
      loggingOutRef.current = false
      return
    }

    const triggerTimeoutLogout = () => {
      if (loggingOutRef.current) return
      loggingOutRef.current = true
      clearSessionActivity()
      showToast(
        'Session Expired',
        'You were signed out after 15 minutes of inactivity. Please sign in again.',
        'info',
      )
      void logout().finally(() => {
        navigate('/login?reason=session_timeout', { replace: true })
        loggingOutRef.current = false
      })
    }

    // Check immediately on mount (handles PWA reopen or returning after lock screen)
    const initialLast = readLastActivityMs()
    if (Date.now() - initialLast >= SESSION_TIMEOUT_MS) {
      triggerTimeoutLogout()
      return
    }
    markSessionActivityNow()
    lastWriteRef.current = Date.now()

    const handleActivity = () => {
      const now = Date.now()
      warnedRef.current = false
      if (now - lastWriteRef.current >= ACTIVITY_THROTTLE_MS) {
        lastWriteRef.current = now
        markSessionActivityNow()
      }
    }

    const checkExpiration = () => {
      const elapsed = Date.now() - readLastActivityMs()
      if (elapsed >= SESSION_TIMEOUT_MS) {
        triggerTimeoutLogout()
        return
      }
      if (!warnedRef.current && elapsed >= SESSION_TIMEOUT_MS - SESSION_WARNING_BEFORE_MS) {
        warnedRef.current = true
        showToast(
          'Session Expiring Soon',
          'You will be signed out in 1 minute due to inactivity.',
          'info',
        )
      }
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkExpiration()
      }
    }

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'mousemove',
      'touchstart',
      'scroll',
    ]
    for (const evt of events) {
      window.addEventListener(evt, handleActivity, { passive: true })
    }
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)

    const intervalId = window.setInterval(checkExpiration, CHECK_INTERVAL_MS)

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handleActivity)
      }
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.clearInterval(intervalId)
    }
  }, [isAuthenticated, user, logout, navigate])

  return null
}
