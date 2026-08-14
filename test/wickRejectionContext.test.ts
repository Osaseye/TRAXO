/* eslint-disable @typescript-eslint/no-explicit-any */
import { getWickRejectionAnchorTimeframe, resolveWickRejectionSession } from '../server/algorithms/wickRejectionContext'
import { analyzeWickRejection } from '../server/algorithms/wickRejection'

function assertEqual(a: any, b: any, msg = '') {
  if (a !== b) throw new Error(`Assertion failed: ${a} !== ${b} ${msg}`)
}

// Anchor timeframe tests
assertEqual(getWickRejectionAnchorTimeframe('1m'), '1H')
assertEqual(getWickRejectionAnchorTimeframe('3m'), '1H')
assertEqual(getWickRejectionAnchorTimeframe('5m'), '1H')
assertEqual(getWickRejectionAnchorTimeframe('15m'), '4H')
assertEqual(getWickRejectionAnchorTimeframe('30m'), '4H')
assertEqual(getWickRejectionAnchorTimeframe('1H'), '1D')
assertEqual(getWickRejectionAnchorTimeframe('4H'), '1D')

// Session resolver tests
const nyOpening = new Date('2026-05-30T13:30:00Z').toISOString() // 09:30 EDT
assertEqual(resolveWickRejectionSession('STOCKS', nyOpening), 'opening_bell')

const oneMinuteAfterOpening = new Date('2026-05-30T13:31:00Z').toISOString()
assertEqual(resolveWickRejectionSession('STOCKS', oneMinuteAfterOpening), 'opening_bell')

const exactTenAm = new Date('2026-05-30T14:00:00Z').toISOString()
assertEqual(resolveWickRejectionSession('STOCKS', exactTenAm), 'normal')

// Forex overlap: 14:00 UTC -> within 13:00-16:00 overlap
const forexOverlap = new Date('2026-05-30T14:00:00Z').toISOString()
assertEqual(resolveWickRejectionSession('FOREX', forexOverlap), 'london_ny_overlap')

const exactOverlapStart = new Date('2026-05-30T13:00:00Z').toISOString()
assertEqual(resolveWickRejectionSession('FOREX', exactOverlapStart), 'london_ny_overlap')

const exactOverlapEnd = new Date('2026-05-30T16:00:00Z').toISOString()
assertEqual(resolveWickRejectionSession('FOREX', exactOverlapEnd), 'off_hours')

// Forex off hours: 06:00 UTC
const forexOff = new Date('2026-05-30T06:00:00Z').toISOString()
assertEqual(resolveWickRejectionSession('FOREX', forexOff), 'off_hours')

assertEqual(resolveWickRejectionSession('CRYPTO', forexOverlap), 'normal')
assertEqual(resolveWickRejectionSession('STOCKS', 'invalid'), 'normal')

// Strategy Execution Test with auto-zone fallback
const testCandle = {
  open: 1.0850,
  high: 1.0855,
  low: 1.0800,  // long lower wick: 50 pips
  close: 1.0845,
  volume: 1500,
  timestamp: forexOverlap,
}

const signal = analyzeWickRejection({
  symbol: 'EURUSD',
  assetType: 'FOREX',
  timeframe: '15m',
  candle: testCandle,
  atr14: 0.0020,
  volumeMa20: 1000,
  nearestZone: null,
})

console.log('Signal result:', JSON.stringify(signal, null, 2))
assertEqual(signal.signal, 'BUY', 'Wick rejection should generate BUY signal for long lower wick')
if (signal.confidence_pct < 70) {
  throw new Error(`Expected high confidence signal (>=70%), got ${signal.confidence_pct}%`)
}

console.log('All wickRejectionContext and strategy tests passed cleanly!')
