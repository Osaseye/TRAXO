import { getWickRejectionAnchorTimeframe, resolveWickRejectionSession } from '../src/lib/algorithms/wickRejectionContext.ts'
import { clearHtfCache, getHtfCache, setHtfCache } from '../src/lib/htfCache.ts'

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
// Stock opening bell in New York: 09:30 -> ensure we get opening_bell
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

// HTF cache freshness tests
clearHtfCache()
setHtfCache('EURUSD', '5m', 'bullish')
assertEqual(getHtfCache('EURUSD', '5m').status, 'fresh')

const baseNow = new Date().getTime()
assertEqual(getHtfCache('EURUSD', '5m', baseNow + 3_700_000).status, 'stale')

assertEqual(getHtfCache('EURUSD', '5m', baseNow + 7_400_000).status, 'failed')

console.log('All wickRejectionContext tests passed')
