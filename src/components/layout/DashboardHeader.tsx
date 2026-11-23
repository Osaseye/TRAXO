/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { PiCoins, PiFire, PiChartBar } from 'react-icons/pi'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'

export type SymbolOption =
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'XAUUSD'
  | 'MNQ'
  | 'AUDUSD'
  | 'USDCAD'
  | 'USDCHF'
  | 'NZDUSD'
  | 'EURJPY'
  | 'GBPJPY'
  | 'EURGBP'

export type MarketCategory = 'forex' | 'metals' | 'futures'

export const FX_SYMBOLS: SymbolOption[] = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCAD',
  'USDCHF',
  'NZDUSD',
  'EURJPY',
  'GBPJPY',
  'EURGBP',
]
export const METAL_SYMBOLS: SymbolOption[] = ['XAUUSD']
export const FUTURES_SYMBOLS: SymbolOption[] = ['MNQ']

export const MARKET_CATEGORIES: Array<{
  id: MarketCategory
  label: string
  icon: any
  symbols: SymbolOption[]
}> = [
  { id: 'forex', label: 'Forex', icon: PiCoins, symbols: FX_SYMBOLS },
  { id: 'metals', label: 'Gold', icon: PiFire, symbols: METAL_SYMBOLS },
  { id: 'futures', label: 'Futures', icon: PiChartBar, symbols: FUTURES_SYMBOLS },
]

export const TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

export interface DashboardHeaderProps {
  symbol: SymbolOption
  timeframe: ChartTimeframe
  onSymbolChange: (symbol: SymbolOption) => void
  onTimeframeChange: (timeframe: ChartTimeframe) => void
  accountBalance: number
  riskPerTradePct: number
  maxDailyLossPct: number
  todayLoss: number
  consecutiveLosses: number
  todayTakenCount: number
  strategyLabel: string
  displayName: string
}

export function DashboardHeader(_props: DashboardHeaderProps) {
  void _props
  return null
}
