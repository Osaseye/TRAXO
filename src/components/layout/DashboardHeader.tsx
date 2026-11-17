/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { PiCoins, PiFire, PiChartBar } from 'react-icons/pi'
import type { ChartTimeframe } from '@/stores/useTradingContextStore'

export type SymbolOption =
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'XAUUSD'
  | 'XAGUSD'
  | 'AUDUSD'
  | 'USDCAD'
  | 'USDCHF'
  | 'NZDUSD'
  | 'EURJPY'
  | 'GBPJPY'
  | 'EURGBP'
  | 'AAPL'
  | 'MSFT'
  | 'NVDA'
  | 'TSLA'
  | 'AMZN'
  | 'META'
  | 'GOOGL'
  | 'NFLX'
  | 'AMD'
  | 'COIN'
  | 'MSTR'
  | 'SMCI'

export type MarketCategory = 'forex' | 'metals' | 'stocks'

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
export const METAL_SYMBOLS: SymbolOption[] = ['XAUUSD', 'XAGUSD']
export const STOCK_SYMBOLS: SymbolOption[] = [
  'AAPL',
  'MSFT',
  'NVDA',
  'TSLA',
  'AMZN',
  'META',
  'GOOGL',
  'NFLX',
  'AMD',
  'COIN',
  'MSTR',
  'SMCI',
]

export const MARKET_CATEGORIES: Array<{
  id: MarketCategory
  label: string
  icon: any
  symbols: SymbolOption[]
}> = [
  { id: 'forex', label: 'Forex', icon: PiCoins, symbols: FX_SYMBOLS },
  { id: 'metals', label: 'Metals', icon: PiFire, symbols: METAL_SYMBOLS },
  { id: 'stocks', label: 'Stocks', icon: PiChartBar, symbols: STOCK_SYMBOLS },
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
