import type { Timeframe } from '@/types'
import type { WickRejectionAssetType, WickRejectionSession } from './wickRejection'

// Cached formatter for high-frequency calls
const NY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
})

export function getWickRejectionAnchorTimeframe(timeframe: Timeframe): Timeframe {
  if (timeframe === '1m' || timeframe === '3m' || timeframe === '5m') return '1H'
  if (timeframe === '15m' || timeframe === '30m') return '4H'
  return '1D'
}

function getNewYorkTimeParts(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null

  const parts = NY_FORMATTER.formatToParts(date)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

  return { hour, minute }
}

export function resolveWickRejectionSession(
  assetType: WickRejectionAssetType,
  timestamp: string
): WickRejectionSession {
  if (assetType === 'STOCKS') {
    const nyTime = getNewYorkTimeParts(timestamp)
    if (nyTime) {
      const minutesSinceMidnight = nyTime.hour * 60 + nyTime.minute
      if (minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight < 10 * 60) {
        return 'opening_bell'
      }
    }
    return 'normal'
  }

  if (assetType === 'FOREX') {
    const utcDate = new Date(timestamp)
    if (!Number.isNaN(utcDate.getTime())) {
      const utcMinutes = utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes()
      // True London/NY overlap is ~13:00 - 16:00 UTC
      if (utcMinutes >= 13 * 60 && utcMinutes < 16 * 60) {
        return 'london_ny_overlap'
      }
      return 'off_hours'
    }
  }

  return 'normal'
}