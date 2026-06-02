// Signal types
export type SignalDirection = 'BUY' | 'SELL' | 'NO_TRADE'

export interface Signal {
  id: string
  strategy_id: string
  user_id: string
  signal: SignalDirection
  symbol: string
  confidence: number      // 0.0 to 0.95
  reason: string[]
  entry: number
  sl: number
  tp: number
  rr_ratio: number
  timeframe: Timeframe
  timestamp: string       // ISO 8601
}

// Strategy types
export type StrategyId = 'wick_rejection' | 'breakout' | 'trend_following' | 'supply_demand' | 'scalping' | 'order_block'

export interface Strategy {
  id: StrategyId
  name: string
  description: string
  active: boolean
  winRate: number         // 0 to 1
  totalSignals: number
  avgRR: number
}

// Timeframe
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D'

// Subscription tiers
export type Plan = 'free' | 'pro' | 'elite'

export interface User {
  id: string
  email: string
  plan: Plan
  subscriptionStatus: 'active' | 'cancelled' | 'expired'
  // Optional profile fields stored in Firestore
  fullName?: string
  displayName?: string
  dob?: string // ISO date
  country?: string
  bio?: string
}

// Risk settings
export interface RiskSettings {
  maxDailyLoss: number      // percentage
  riskPerTrade: number      // percentage
  maxTradesPerDay: number
  cooldownMinutes: number
}

// Dashboard stats
export interface DashboardStats {
  signalsToday: number
  weeklyWinRate: number
  activeTrades: number
  pnlToday: number
}

// Broker connection
export type BrokerType = 'binance' | 'oanda' | 'ig' | 'mt5'

export interface BrokerConnection {
  id: string
  broker: BrokerType
  status: 'active' | 'revoked' | 'error'
  createdAt: string
}
