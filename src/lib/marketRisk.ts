import type { Timeframe } from '@/types'

export type MarketType = 'forex' | 'crypto' | 'stocks' | 'futures' | 'commodities'
export type MarketRiskLevel = 'Low' | 'Medium' | 'High'

export interface MarketRiskContext {
  marketType: MarketType
  riskLevel: MarketRiskLevel
  confidencePenalty: number
  title: string
  summary: string
  drivers: string[]
  userFacingWarning: string
}

const FOREX_SYMBOLS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'])
const CRYPTO_SYMBOLS = new Set(['BTCUSDT', 'ETHUSD'])
const COMMODITY_SYMBOLS = new Set(['XAUUSD'])

export function getMarketTypeForSymbol(symbol: string): MarketType {
  if (FOREX_SYMBOLS.has(symbol)) return 'forex'
  if (CRYPTO_SYMBOLS.has(symbol)) return 'crypto'
  if (COMMODITY_SYMBOLS.has(symbol)) return 'commodities'
  if (symbol.includes('US') || symbol.includes('SP') || symbol.includes('QQ')) return 'stocks'
  return 'futures'
}

function getTimeframeFactor(timeframe: Timeframe) {
  if (timeframe === '1H') return 1
  if (timeframe === '4H') return 0.85
  return 0.6
}

function buildRiskProfile(marketType: MarketType): Pick<MarketRiskContext, 'title' | 'summary' | 'drivers' | 'userFacingWarning'> {
  if (marketType === 'forex') {
    return {
      title: 'Forex calendar risk',
      summary: 'FX pairs are heavily impacted by scheduled economic releases and central bank communication.',
      drivers: ['CPI / inflation', 'Central bank rates and speeches', 'Jobs data', 'GDP / PMI', 'Geopolitical shocks'],
      userFacingWarning: 'Watch high-impact economic releases before trading FX. News can overpower technical setups and widen spreads.',
    }
  }

  if (marketType === 'crypto') {
    return {
      title: 'Crypto catalyst risk',
      summary: 'Crypto does not use a single economic calendar like forex; it reacts to macro news and crypto-native catalysts.',
      drivers: ['Fed / macro data spillover', 'Regulation and policy', 'ETF flows', 'Token unlocks', 'Listings and protocol upgrades'],
      userFacingWarning: 'Crypto has catalyst risk rather than a classic economic calendar. Macro headlines and token-specific events can move price fast.',
    }
  }

  if (marketType === 'stocks') {
    return {
      title: 'Equity event risk',
      summary: 'Stocks react to earnings, guidance, macro data, rates, and company-specific headlines.',
      drivers: ['Earnings / guidance', 'CPI / Fed spillover', 'M&A and litigation', 'Sector news'],
      userFacingWarning: 'Stocks can gap on earnings, guidance, and macro headlines. Technical entries work best away from scheduled release windows.',
    }
  }

  if (marketType === 'commodities') {
    return {
      title: 'Commodity shock risk',
      summary: 'Commodities are driven by supply shocks, inventories, geopolitics, and macro inflation expectations.',
      drivers: ['Inventory reports', 'OPEC / supply disruption', 'Geopolitics', 'Inflation expectations'],
      userFacingWarning: 'Commodity prices can jump on inventory and supply news. Keep stops wider and avoid news spikes.',
    }
  }

  return {
    title: 'Futures event risk',
    summary: 'Futures often move on macro releases, inventory data, and order-flow shifts around session opens.',
    drivers: ['CPI / jobs', 'Inventory and supply reports', 'Order-flow shocks', 'Session open volatility'],
    userFacingWarning: 'Futures can react violently to macro releases and inventory data. Use calendar awareness and session timing.',
  }
}

export function getMarketRiskContext(symbol: string, timeframe: Timeframe, strategyCount = 1): MarketRiskContext {
  const marketType = getMarketTypeForSymbol(symbol)
  const profile = buildRiskProfile(marketType)
  const timeframeFactor = getTimeframeFactor(timeframe)
  const strategyFactor = strategyCount > 1 ? 0.88 : 1

  const basePenalty =
    marketType === 'forex'
      ? 12
      : marketType === 'crypto'
      ? 10
      : marketType === 'stocks'
      ? 7
      : marketType === 'commodities'
      ? 8
      : 6

  const confidencePenalty = Math.round(basePenalty * timeframeFactor * strategyFactor)
  const riskLevel: MarketRiskLevel = confidencePenalty >= 10 ? 'High' : confidencePenalty >= 6 ? 'Medium' : 'Low'

  return {
    marketType,
    riskLevel,
    confidencePenalty,
    title: profile.title,
    summary: profile.summary,
    drivers: profile.drivers,
    userFacingWarning: profile.userFacingWarning,
  }
}