/* eslint-disable @typescript-eslint/no-explicit-any */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(value: number, decimals = 5): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`
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
