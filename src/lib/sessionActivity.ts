export const SESSION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
export const SESSION_WARNING_BEFORE_MS = 60 * 1000 // 1 minute warning
const STORAGE_KEY = 'traxo_last_activity_at'

export function markSessionActivityNow(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // ignore storage errors
  }
}

export function clearSessionActivity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore storage errors
  }
}

export function readLastActivityMs(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  } catch {
    // ignore
  }
  return Date.now()
}
