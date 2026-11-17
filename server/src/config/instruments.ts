export type InstrumentAssetType = 'FOREX' | 'STOCKS' | 'CRYPTO';
export type MarketCategory = 'forex' | 'metals' | 'stocks' | 'crypto' | 'indices' | 'energy';
export type UsdExposure = 'LONG_USD' | 'SHORT_USD' | null;

export interface InstrumentSpec {
  /** Canonical uppercase ticker without slash, e.g. 'EURUSD', 'XAUUSD', 'AAPL' */
  symbol: string;
  /** TwelveData API symbol format, e.g. 'EUR/USD', 'XAU/USD', 'AAPL' */
  twelveDataSymbol: string;
  /** Primary Exness MT5 symbol name */
  exnessSymbol: string;
  /** Candidate Exness MT5 symbol names to try during broker execution */
  exnessAliases: string[];
  assetType: InstrumentAssetType;
  category: MarketCategory;
  /** Decimal digits for price rounding on broker */
  digits: number;
  /** Value of 1 pip in price units (e.g. 0.0001 FX, 0.01 JPY, 0.1 XAU) */
  pipSize: number;
  /** Units per 1.00 standard lot */
  contractSize: number;
  /** USD loss per 1.00 lot per 1.0 price move (riskDist * riskPerUnitFactor) */
  riskPerUnitFactor: number;
  /** Safety max lot ceiling */
  maxLots: number;
  /** Default maximum allowed live spread in pips */
  maxAllowedSpreadPips: number;
  /** USD correlation orientation relative to BUY orders */
  usdCorrelationSide: 'INVERSE_USD' | 'DIRECT_USD' | null;
  /** Whether the TwelveData background scanner includes this symbol */
  scannable: boolean;
}

const FX_STANDARD_SPEC = (
  symbol: string,
  twelveDataSymbol: string,
  usdCorrelationSide: 'INVERSE_USD' | 'DIRECT_USD' | null,
  maxAllowedSpreadPips = 3.5,
  scannable = true,
): InstrumentSpec => ({
  symbol,
  twelveDataSymbol,
  exnessSymbol: symbol,
  exnessAliases: [symbol, `${symbol}m`],
  assetType: 'FOREX',
  category: 'forex',
  digits: 5,
  pipSize: 0.0001,
  contractSize: 100_000,
  riskPerUnitFactor: 100_000,
  maxLots: 5.0,
  maxAllowedSpreadPips,
  usdCorrelationSide,
  scannable,
});

const FX_JPY_SPEC = (
  symbol: string,
  twelveDataSymbol: string,
  usdCorrelationSide: 'INVERSE_USD' | 'DIRECT_USD' | null,
  maxAllowedSpreadPips = 3.5,
  scannable = true,
): InstrumentSpec => ({
  symbol,
  twelveDataSymbol,
  exnessSymbol: symbol,
  exnessAliases: [symbol, `${symbol}m`],
  assetType: 'FOREX',
  category: 'forex',
  digits: 3,
  pipSize: 0.01,
  contractSize: 100_000,
  riskPerUnitFactor: 650,
  maxLots: 5.0,
  maxAllowedSpreadPips,
  usdCorrelationSide,
  scannable,
});

const STOCK_SPEC = (symbol: string): InstrumentSpec => ({
  symbol,
  twelveDataSymbol: symbol,
  exnessSymbol: symbol,
  exnessAliases: [symbol, `${symbol}m`],
  assetType: 'STOCKS',
  category: 'stocks',
  digits: 2,
  pipSize: 0.01,
  contractSize: 100,
  riskPerUnitFactor: 100,
  maxLots: 2.0,
  maxAllowedSpreadPips: 15.0,
  usdCorrelationSide: null,
  scannable: true,
});

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  // ── Forex (10) ──────────────────────────────────────────────────────────
  EURUSD: FX_STANDARD_SPEC('EURUSD', 'EUR/USD', 'INVERSE_USD', 3.5),
  GBPUSD: FX_STANDARD_SPEC('GBPUSD', 'GBP/USD', 'INVERSE_USD', 3.5),
  AUDUSD: FX_STANDARD_SPEC('AUDUSD', 'AUD/USD', 'INVERSE_USD', 3.5),
  NZDUSD: FX_STANDARD_SPEC('NZDUSD', 'NZD/USD', 'INVERSE_USD', 3.5),
  USDCAD: FX_STANDARD_SPEC('USDCAD', 'USD/CAD', 'DIRECT_USD', 3.5),
  USDCHF: FX_STANDARD_SPEC('USDCHF', 'USD/CHF', 'DIRECT_USD', 3.5),
  USDJPY: FX_JPY_SPEC('USDJPY', 'USD/JPY', 'DIRECT_USD', 3.5),
  EURJPY: FX_JPY_SPEC('EURJPY', 'EUR/JPY', null, 4.0),
  GBPJPY: FX_JPY_SPEC('GBPJPY', 'GBP/JPY', null, 4.5),
  EURGBP: FX_STANDARD_SPEC('EURGBP', 'EUR/GBP', null, 3.5),

  // ── Metals ──────────────────────────────────────────────────────────────
  XAUUSD: {
    symbol: 'XAUUSD',
    twelveDataSymbol: 'XAU/USD',
    exnessSymbol: 'XAUUSD',
    exnessAliases: ['XAUUSD', 'XAUUSDm'],
    assetType: 'FOREX',
    category: 'metals',
    digits: 2,
    pipSize: 0.1,
    contractSize: 100,
    riskPerUnitFactor: 100,
    maxLots: 5.0,
    maxAllowedSpreadPips: 4.5,
    usdCorrelationSide: null,
    scannable: true,
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    twelveDataSymbol: 'XAG/USD',
    exnessSymbol: 'XAGUSD',
    exnessAliases: ['XAGUSD', 'XAGUSDm'],
    assetType: 'FOREX',
    category: 'metals',
    digits: 3,
    pipSize: 0.01,
    contractSize: 5000,
    riskPerUnitFactor: 5000,
    maxLots: 5.0,
    maxAllowedSpreadPips: 5.0,
    usdCorrelationSide: null,
    scannable: false,
  },

  // ── US Stocks (12) ──────────────────────────────────────────────────────
  AAPL: STOCK_SPEC('AAPL'),
  MSFT: STOCK_SPEC('MSFT'),
  NVDA: STOCK_SPEC('NVDA'),
  TSLA: STOCK_SPEC('TSLA'),
  AMZN: STOCK_SPEC('AMZN'),
  META: STOCK_SPEC('META'),
  GOOGL: STOCK_SPEC('GOOGL'),
  NFLX: STOCK_SPEC('NFLX'),
  AMD: STOCK_SPEC('AMD'),
  COIN: STOCK_SPEC('COIN'),
  MSTR: STOCK_SPEC('MSTR'),
  SMCI: STOCK_SPEC('SMCI'),

  // ── Crypto / Indices / Energy Exness Mappings (non-scannable defaults) ─
  BTCUSD: {
    symbol: 'BTCUSD',
    twelveDataSymbol: 'BTC/USD',
    exnessSymbol: 'BTCUSD',
    exnessAliases: ['BTCUSD', 'BTCUSDm'],
    assetType: 'CRYPTO',
    category: 'crypto',
    digits: 2,
    pipSize: 1.0,
    contractSize: 1,
    riskPerUnitFactor: 1,
    maxLots: 2.0,
    maxAllowedSpreadPips: 50.0,
    usdCorrelationSide: null,
    scannable: false,
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    twelveDataSymbol: 'ETH/USD',
    exnessSymbol: 'ETHUSD',
    exnessAliases: ['ETHUSD', 'ETHUSDm'],
    assetType: 'CRYPTO',
    category: 'crypto',
    digits: 2,
    pipSize: 0.1,
    contractSize: 1,
    riskPerUnitFactor: 1,
    maxLots: 5.0,
    maxAllowedSpreadPips: 25.0,
    usdCorrelationSide: null,
    scannable: false,
  },
  US500: {
    symbol: 'US500',
    twelveDataSymbol: 'SPX500',
    exnessSymbol: 'US500',
    exnessAliases: ['US500', 'US500m', 'SPX500'],
    assetType: 'STOCKS',
    category: 'indices',
    digits: 2,
    pipSize: 0.1,
    contractSize: 1,
    riskPerUnitFactor: 1,
    maxLots: 5.0,
    maxAllowedSpreadPips: 10.0,
    usdCorrelationSide: null,
    scannable: false,
  },
  USTEC: {
    symbol: 'USTEC',
    twelveDataSymbol: 'NAS100',
    exnessSymbol: 'USTEC',
    exnessAliases: ['USTEC', 'USTECm', 'NAS100'],
    assetType: 'STOCKS',
    category: 'indices',
    digits: 2,
    pipSize: 0.1,
    contractSize: 1,
    riskPerUnitFactor: 1,
    maxLots: 5.0,
    maxAllowedSpreadPips: 15.0,
    usdCorrelationSide: null,
    scannable: false,
  },
  GER40: {
    symbol: 'GER40',
    twelveDataSymbol: 'DE40',
    exnessSymbol: 'GER40',
    exnessAliases: ['GER40', 'GER40m', 'DE40'],
    assetType: 'STOCKS',
    category: 'indices',
    digits: 2,
    pipSize: 0.1,
    contractSize: 1,
    riskPerUnitFactor: 1,
    maxLots: 5.0,
    maxAllowedSpreadPips: 15.0,
    usdCorrelationSide: null,
    scannable: false,
  },
  USOIL: {
    symbol: 'USOIL',
    twelveDataSymbol: 'WTI/USD',
    exnessSymbol: 'USOIL',
    exnessAliases: ['USOIL', 'USOILm'],
    assetType: 'FOREX',
    category: 'energy',
    digits: 2,
    pipSize: 0.01,
    contractSize: 1000,
    riskPerUnitFactor: 1000,
    maxLots: 3.0,
    maxAllowedSpreadPips: 5.0,
    usdCorrelationSide: null,
    scannable: false,
  },
  UKOIL: {
    symbol: 'UKOIL',
    twelveDataSymbol: 'BRENT/USD',
    exnessSymbol: 'UKOIL',
    exnessAliases: ['UKOIL', 'UKOILm'],
    assetType: 'FOREX',
    category: 'energy',
    digits: 2,
    pipSize: 0.01,
    contractSize: 1000,
    riskPerUnitFactor: 1000,
    maxLots: 3.0,
    maxAllowedSpreadPips: 5.0,
    usdCorrelationSide: null,
    scannable: false,
  },
};

const ALIAS_TO_CANONICAL: Record<string, string> = {
  WTI: 'USOIL',
  WTIUSD: 'USOIL',
  BRENT: 'UKOIL',
  BRENTUSD: 'UKOIL',
  SPX500: 'US500',
  NAS100: 'USTEC',
  DE40: 'GER40',
  GOLD: 'XAUUSD',
  SILVER: 'XAGUSD',
};

export const USD_CORRELATION_PAIRS = {
  inverseUsd: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'],
  directUsd: ['USDCAD', 'USDCHF', 'USDJPY'],
} as const;

export const STOCK_SYMBOLS = Object.values(INSTRUMENTS)
  .filter((i) => i.category === 'stocks')
  .map((i) => i.symbol);

export function normalizeSymbol(sym: string): string {
  if (!sym) return 'EURUSD';
  let s = String(sym).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (s.endsWith('USDT')) {
    s = s.replace(/USDT$/, 'USD');
  }
  if (s.length > 4 && s.endsWith('M') && INSTRUMENTS[s.slice(0, -1)]) {
    s = s.slice(0, -1);
  }
  return ALIAS_TO_CANONICAL[s] || s;
}

export function getInstrumentSpec(sym: string): InstrumentSpec {
  const canonical = normalizeSymbol(sym);
  if (INSTRUMENTS[canonical]) {
    return INSTRUMENTS[canonical];
  }

  // Fallback heuristic for unknown symbols
  const isJpy = canonical.includes('JPY');
  const isGold = canonical.includes('XAU') || canonical.includes('GOLD');
  const isSilver = canonical.includes('XAG') || canonical.includes('SILVER');
  const isCrypto = canonical.includes('BTC') || canonical.includes('ETH') || canonical.includes('SOL') || canonical.includes('BNB');

  if (isGold) return INSTRUMENTS.XAUUSD;
  if (isSilver) return INSTRUMENTS.XAGUSD;
  if (isJpy) return FX_JPY_SPEC(canonical, `${canonical.slice(0, 3)}/${canonical.slice(3, 6)}`, null, 4.0, false);
  if (isCrypto) {
    return {
      symbol: canonical,
      twelveDataSymbol: canonical.length === 6 ? `${canonical.slice(0, 3)}/${canonical.slice(3, 6)}` : canonical,
      exnessSymbol: canonical,
      exnessAliases: [canonical, `${canonical}m`],
      assetType: 'CRYPTO',
      category: 'crypto',
      digits: 2,
      pipSize: 0.1,
      contractSize: 1,
      riskPerUnitFactor: 1,
      maxLots: 2.0,
      maxAllowedSpreadPips: 25.0,
      usdCorrelationSide: null,
      scannable: false,
    };
  }

  const twelveDataSymbol =
    canonical.length === 6 ? `${canonical.slice(0, 3)}/${canonical.slice(3, 6)}` : canonical;
  return FX_STANDARD_SPEC(canonical, twelveDataSymbol, null, 3.5, false);
}

export function normalizeExnessSymbol(sym: string): string {
  const rawClean = String(sym || '').toUpperCase().replace('/', '').replace(/USDT$/, 'USD');
  const exnessExtras: Record<string, string> = {
    NATGAS: 'NGAS',
    WTI: 'USOIL',
    BRENT: 'UKOIL',
    SPX500: 'US500',
    NAS100: 'USTEC',
    DE40: 'GER40',
  };
  if (exnessExtras[rawClean]) return exnessExtras[rawClean];
  return getInstrumentSpec(sym).exnessSymbol;
}

export function getExnessSymbolCandidates(sym: string): string[] {
  const spec = getInstrumentSpec(sym);
  const rawClean = String(sym || '').toUpperCase().replace('/', '');
  const list = [...spec.exnessAliases, spec.exnessSymbol, rawClean].filter(Boolean);
  return Array.from(new Set(list));
}

export function toTwelveDataSymbol(sym: string): string {
  const spec = getInstrumentSpec(sym);
  if (INSTRUMENTS[spec.symbol]) return spec.twelveDataSymbol;
  const s = String(sym || '').toUpperCase().trim();
  if (s.includes('/')) return s;
  if (s.endsWith('USDT')) return s.replace(/USDT$/, '/USD');
  if (s.length === 6 && !['SPX500', 'NAS100'].includes(s)) {
    return `${s.slice(0, 3)}/${s.slice(3)}`;
  }
  return s;
}

export function getInstrumentDigits(sym: string): number {
  return getInstrumentSpec(sym).digits;
}

export function roundToDigits(value: number | undefined | null, digits: number): number | undefined {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return undefined;
  return Number(Number(value).toFixed(digits));
}

export function calculateSpreadPips(sym: string, bid: number, ask: number): number {
  const spec = getInstrumentSpec(sym);
  const diff = Math.abs(ask - bid);
  return Number((diff / spec.pipSize).toFixed(2));
}

export function getAssetType(sym: string): InstrumentAssetType {
  return getInstrumentSpec(sym).assetType;
}

export function getUsdExposure(sym: string, direction: string): UsdExposure {
  const spec = getInstrumentSpec(sym);
  const dirUpper = String(direction || '').toUpperCase();
  const isBuy = dirUpper.includes('BUY');
  const isSell = dirUpper.includes('SELL');
  if (!isBuy && !isSell) return null;

  if (spec.usdCorrelationSide === 'INVERSE_USD') {
    return isBuy ? 'SHORT_USD' : 'LONG_USD';
  }
  if (spec.usdCorrelationSide === 'DIRECT_USD') {
    return isBuy ? 'LONG_USD' : 'SHORT_USD';
  }
  return null;
}

export function getScannableInstruments(): InstrumentSpec[] {
  return Object.values(INSTRUMENTS).filter((i) => i.scannable);
}
