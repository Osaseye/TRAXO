export const ADMIN_EMAIL = 'wavecrest@gmail.com'

export function normalizeEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase()
}

export function isAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === ADMIN_EMAIL
}

export function isAdminUser(user?: { email?: string | null } | null): boolean {
  return isAdminEmail(user?.email)
}

export function normalizeEpochMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? raw : raw * 1000
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed) {
      const asNum = Number(trimmed)
      if (Number.isFinite(asNum) && asNum > 0) {
        return asNum > 1e12 ? asNum : asNum * 1000
      }
      const parsed = Date.parse(trimmed)
      if (!Number.isNaN(parsed) && parsed > 0) return parsed
    }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { seconds?: unknown; _seconds?: unknown; toMillis?: () => number }
    if (typeof obj.toMillis === 'function') {
      const ms = obj.toMillis()
      if (Number.isFinite(ms) && ms > 0) return ms
    }
    const secs =
      typeof obj.seconds === 'number'
        ? obj.seconds
        : typeof obj._seconds === 'number'
          ? obj._seconds
          : null
    if (secs !== null && Number.isFinite(secs) && secs > 0) {
      return secs > 1e12 ? secs : secs * 1000
    }
  }
  return 0
}

/**
 * Returns the minimum signal timestamp (in ms) visible to this user.
 * - Admin (`wavecrest@gmail.com`) sees all historical & live signals (returns 0).
 * - Every other user starts fresh from the exact moment they registered/signed up.
 */
export function getUserSignalCutoffMs(
  user?: { email?: string | null; createdAtMs?: number | null } | null
): number {
  if (!user) return Number.MAX_SAFE_INTEGER
  if (isAdminEmail(user.email)) return 0
  if (typeof user.createdAtMs === 'number' && Number.isFinite(user.createdAtMs) && user.createdAtMs > 0) {
    return user.createdAtMs
  }
  return Date.now()
}

export function isTimestampVisibleForUser(
  rawTimestamp: unknown,
  user?: { email?: string | null; createdAtMs?: number | null } | null
): boolean {
  const cutoff = getUserSignalCutoffMs(user)
  if (cutoff <= 0) return true
  const tsMs = normalizeEpochMs(rawTimestamp)
  if (tsMs <= 0) return false
  return tsMs >= cutoff
}
