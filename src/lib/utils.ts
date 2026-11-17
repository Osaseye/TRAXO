/* eslint-disable @typescript-eslint/no-explicit-any */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(value: number, decimals?: number, symbol?: string): string {
  let targetDecimals = decimals
  if (targetDecimals === undefined) {
    if (symbol) {
      if (symbol.includes('JPY')) targetDecimals = 3
      else if (['XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'XRPUSD', 'ADAUSD', 'DOGEUSD'].some(s => symbol.includes(s))) targetDecimals = 4
      else if (['BTCUSDT', 'ETHUSD', 'SOLUSDT', 'BNBUSDT', 'BTCUSD', 'SOLUSD', 'BNBUSD'].some(s => symbol.includes(s))) targetDecimals = 2
      else if (['XAUUSD', 'XAGUSD', 'SPX500', 'NAS100', 'US30', 'DE40', 'UK100', 'JP225', 'WTI', 'BRENT', 'NATGAS'].some(s => symbol.includes(s))) targetDecimals = 2
      else if (['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI'].some(s => symbol.includes(s))) targetDecimals = 2
      else targetDecimals = 5
    } else {
      const absVal = Math.abs(value)
      targetDecimals = absVal >= 100 ? 2 : absVal >= 10 ? 2 : 5
    }
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: targetDecimals,
    maximumFractionDigits: targetDecimals,
  })
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function calculateLots(symbol: string, entry: number, sl: number, riskAmount: number): number {
  let riskDist = Math.abs(entry - sl)
  if (riskAmount <= 0) return 0.01

  // Prevent division by 0 or micro-distances
  const minDistance = Math.max(0.0001, (entry || 1) * 0.001)
  if (riskDist < minDistance) {
    riskDist = minDistance
  }

  const cleanSymbol = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  let lotSize = 0.01

  if (cleanSymbol.includes('JPY')) {
    lotSize = riskAmount / (riskDist * 650)
  } else if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
    lotSize = riskAmount / (riskDist * 100)
  } else if (cleanSymbol.includes('XAG') || cleanSymbol.includes('SILVER')) {
    lotSize = riskAmount / (riskDist * 5000)
  } else if (['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'COIN', 'MSTR', 'SMCI'].some(s => cleanSymbol.includes(s))) {
    // US Stocks on MT5 (1 lot = 100 shares)
    lotSize = riskAmount / (riskDist * 100)
    lotSize = Math.min(2.0, lotSize)
  } else {
    // Forex standard lot = 100,000 units
    lotSize = riskAmount / (riskDist * 100000)
    lotSize = Math.min(5.0, lotSize)
  }

  // Safe clamping: minimum 0.01 lots
  const clamped = Math.max(0.01, lotSize)
  return Number(clamped.toFixed(2))
}

export function formatMT4OrderClipboardPayload(signal: {
  symbol: string
  direction: string
  entry: number
  sl: number
  tp: number
  riskAmount?: number
}): string {
  const symbol = signal.symbol
  const entryFmt = formatPrice(signal.entry, undefined, symbol)
  const slFmt = formatPrice(signal.sl, undefined, symbol)
  const tpFmt = formatPrice(signal.tp, undefined, symbol)
  const riskAmt = signal.riskAmount ?? 25
  const lots = calculateLots(symbol, signal.entry, signal.sl, riskAmt)

  return `${signal.direction} ${symbol} @ ${entryFmt} | SL: ${slFmt} | TP: ${tpFmt} | Risk: $${riskAmt.toFixed(2)} (${lots} Lots)`
}

export function timeAgo(date: string | Date): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function getFirebaseErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred.'
  
  const code = error?.code || ''
  const message = error?.message || ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password is too weak. Please use a stronger password.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.'
  }

  // Fallback for when the code is embedded in the message
  if (message) {
    if (message.includes('auth/invalid-credential')) return 'Invalid email or password.'
    if (message.includes('auth/user-not-found')) return 'Invalid email or password.'
    if (message.includes('auth/wrong-password')) return 'Invalid email or password.'
    if (message.includes('auth/email-already-in-use')) return 'An account with this email already exists.'
    if (message.includes('auth/weak-password')) return 'Password is too weak.'
    if (message.includes('auth/invalid-email')) return 'Please enter a valid email address.'
    if (message.includes('auth/too-many-requests')) return 'Too many failed login attempts. Please try again later.'
    
    // Strip "Firebase: " and trailing error codes like "(auth/xyz)."
    return message.replace(/^Firebase:\s*(Error\s*)?/, '').replace(/\s*\(auth\/[^)]+\)\.?/g, '').trim()
  }

  return 'An unexpected error occurred. Please try again.'
}

export function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  const cleaned: Record<string, any> = Array.isArray(obj) ? [] : {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        typeof (value as any).toMillis !== 'function'
          ? cleanUndefined(value)
          : value
    }
  }
  return cleaned as T
}

