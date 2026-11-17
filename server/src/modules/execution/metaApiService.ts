import MetaApi from 'metaapi.cloud-sdk';
import { env } from '../../config/env';
import {
  calculateSpreadPips,
  getExnessSymbolCandidates,
  getInstrumentSpec,
  normalizeSymbol,
  roundToDigits,
} from '../../config/instruments';
import redis from '../market-data/redisClient';

let api: any = null;
let account: any = null;
let connection: any = null;
let connectionPromise: Promise<any> | null = null;
let isAutoTradeEnabled = false;

redis
  .get('metaapi:auto_trade_enabled')
  .then((val) => {
    if (val !== null) {
      isAutoTradeEnabled = val === 'true';
    }
  })
  .catch(() => {});

export interface ExecuteTradeParams {
  symbol: string;
  action: 'BUY' | 'SELL' | string;
  volume?: number;
  sl?: number;
  tp?: number;
  entryType?: 'market' | 'limit';
  price?: number;
  openPrice?: number;
  limitPrice?: number;
  comment?: string;
}

export interface ExecuteTradeResult {
  success: boolean;
  entryType: 'market' | 'limit';
  symbol: string;
  brokerSymbol?: string;
  volume?: number;
  price?: number;
  sl?: number;
  tp?: number;
  result?: any;
  error?: string;
}

export interface SymbolQuoteResponse {
  ok: boolean;
  symbol: string;
  brokerSymbol?: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread: number | null;
  spreadPips: number | null;
  digits: number;
  timestamp?: string;
  error?: string;
}

export async function initMetaApi(): Promise<boolean> {
  const token = env.metaApiToken;
  const accountId = env.metaApiAccountId;
  if (!token || !accountId) {
    return false;
  }
  try {
    if (!api) {
      api = new MetaApi(token);
    }
    if (!account) {
      account = await api.metatraderAccountApi.getAccount(accountId);
    }
    return true;
  } catch {
    return false;
  }
}

export async function getConnection(): Promise<any | null> {
  const initialized = await initMetaApi();
  if (!initialized || !account) return null;

  if (connection) return connection;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      if (account.state !== 'DEPLOYED') {
        await account.deploy();
      }
      if (account.connectionStatus !== 'CONNECTED') {
        await account.waitConnected(60);
      }
      const conn = account.getRPCConnection();
      await conn.connect();
      await conn.waitSynchronized(60);
      connection = conn;
      return connection;
    } catch (error: any) {
      connection = null;
      const msg = error?.message || '';
      if (msg.includes('top up your account') || msg.includes('deployment')) {
        console.warn('[MetaApi] Notice: Terminal requires MetaApi account deployment / top up on metaapi.cloud');
      } else {
        console.error('[MetaApi] Connection notice:', msg);
      }
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

export async function getAccountInfo(): Promise<Record<string, any>> {
  try {
    const conn = await getConnection();
    if (!conn) {
      return {
        connected: false,
        state: account ? account.state : 'DISCONNECTED',
        balance: 0,
        equity: 0,
        margin: 0,
        freeMargin: 0,
      };
    }
    const info = await conn.getAccountInformation();
    return {
      connected: true,
      state: 'CONNECTED',
      balance: info.balance,
      equity: info.equity,
      margin: info.margin,
      freeMargin: info.freeMargin,
      leverage: info.leverage,
      currency: info.currency,
      platform: info.platform,
    };
  } catch (error: any) {
    console.error('[MetaApi] Failed to fetch account info:', error.message);
    return {
      connected: false,
      error: error.message,
    };
  }
}

export async function getSymbolPrice(symbol: string): Promise<any | null> {
  try {
    const conn = await getConnection();
    if (!conn) return null;
    const candidates = getExnessSymbolCandidates(symbol);
    for (const sym of candidates) {
      try {
        const price = await conn.getSymbolPrice(sym);
        if (price && (price.bid || price.ask)) {
          return { ...price, brokerSymbol: sym };
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSymbolQuote(symbol: string): Promise<SymbolQuoteResponse> {
  const canonical = normalizeSymbol(symbol);
  const spec = getInstrumentSpec(canonical);
  const price = await getSymbolPrice(canonical);

  if (!price || typeof price.bid !== 'number' || typeof price.ask !== 'number') {
    return {
      ok: false,
      symbol: canonical,
      bid: null,
      ask: null,
      mid: null,
      spread: null,
      spreadPips: null,
      digits: spec.digits,
      error: 'Live broker quote unavailable',
    };
  }

  const bid = roundToDigits(price.bid, spec.digits) ?? price.bid;
  const ask = roundToDigits(price.ask, spec.digits) ?? price.ask;
  const mid = roundToDigits((bid + ask) / 2, spec.digits) ?? (bid + ask) / 2;
  const spread = Number(Math.abs(ask - bid).toFixed(spec.digits));
  const spreadPips = calculateSpreadPips(canonical, bid, ask);

  return {
    ok: true,
    symbol: canonical,
    brokerSymbol: price.brokerSymbol || spec.exnessSymbol,
    bid,
    ask,
    mid,
    spread,
    spreadPips,
    digits: spec.digits,
    timestamp: price.time ? new Date(price.time).toISOString() : new Date().toISOString(),
  };
}

export async function executeTrade(params: ExecuteTradeParams): Promise<ExecuteTradeResult> {
  const canonical = normalizeSymbol(params.symbol);
  const spec = getInstrumentSpec(canonical);
  const entryType: 'market' | 'limit' = params.entryType === 'limit' ? 'limit' : 'market';
  const actionUpper = String(params.action || '').toUpperCase();

  if (actionUpper !== 'BUY' && actionUpper !== 'SELL') {
    return {
      success: false,
      entryType,
      symbol: canonical,
      error: `Invalid trade action '${params.action}'. Expected BUY or SELL.`,
    };
  }

  const safeVolume = Math.min(
    spec.maxLots,
    Math.max(0.01, Number(Number(params.volume ?? 0.01).toFixed(2)) || 0.01)
  );
  const rawLimitPrice = params.price ?? params.openPrice ?? params.limitPrice;
  const safeLimitPrice =
    entryType === 'limit' ? roundToDigits(rawLimitPrice, spec.digits) : undefined;

  if (entryType === 'limit' && (!safeLimitPrice || safeLimitPrice <= 0)) {
    return {
      success: false,
      entryType,
      symbol: canonical,
      volume: safeVolume,
      error: 'Limit entry requires a valid positive price',
    };
  }

  try {
    const conn = await getConnection();
    if (!conn) {
      throw new Error('MetaApi connection unavailable');
    }

    const tradeOptions = {
      comment: (params.comment || 'TRAXO').slice(0, 26),
    };

    const candidates = getExnessSymbolCandidates(canonical);
    let lastError: any = null;

    for (const sym of candidates) {
      const symSpec = getInstrumentSpec(sym);
      const digits = symSpec.digits ?? spec.digits;
      const minStopDist = (symSpec.pipSize || spec.pipSize) * 5;
      let safeSl = roundToDigits(params.sl, digits);
      let safeTp = roundToDigits(params.tp, digits);
      const targetPrice =
        entryType === 'limit' ? roundToDigits(safeLimitPrice, digits) : undefined;

      // Validate stop levels against anchor price (limit price or live market quote)
      let anchorPrice = targetPrice;
      if (!anchorPrice) {
        try {
          const price = await conn.getSymbolPrice(sym);
          if (price && price.bid && price.ask) {
            anchorPrice = actionUpper === 'BUY' ? price.ask : price.bid;
          }
        } catch {}
      }

      if (anchorPrice && anchorPrice > 0) {
        if (actionUpper === 'BUY') {
          if (safeSl !== undefined && safeSl >= anchorPrice - minStopDist) {
            safeSl = roundToDigits(anchorPrice - minStopDist * 2, digits);
          }
          if (safeTp !== undefined && safeTp <= anchorPrice + minStopDist) {
            safeTp = undefined;
          }
        } else {
          if (safeSl !== undefined && safeSl <= anchorPrice + minStopDist) {
            safeSl = roundToDigits(anchorPrice + minStopDist * 2, digits);
          }
          if (safeTp !== undefined && safeTp >= anchorPrice - minStopDist) {
            safeTp = undefined;
          }
        }
      }

      try {
        let result: any;
        if (entryType === 'limit' && targetPrice !== undefined) {
          console.log(
            `[MetaApi Execution] Attempting ${actionUpper} LIMIT on '${sym}' @ ${targetPrice} vol ${safeVolume} SL:${safeSl} TP:${safeTp}`
          );
          result =
            actionUpper === 'BUY'
              ? await conn.createLimitBuyOrder(sym, safeVolume, targetPrice, safeSl, safeTp, tradeOptions)
              : await conn.createLimitSellOrder(sym, safeVolume, targetPrice, safeSl, safeTp, tradeOptions);
        } else {
          console.log(
            `[MetaApi Execution] Attempting ${actionUpper} MARKET on '${sym}' vol ${safeVolume} SL:${safeSl} TP:${safeTp}`
          );
          result =
            actionUpper === 'BUY'
              ? await conn.createMarketBuyOrder(sym, safeVolume, safeSl, safeTp, tradeOptions)
              : await conn.createMarketSellOrder(sym, safeVolume, safeSl, safeTp, tradeOptions);
        }

        if (result) {
          console.log(
            `[MetaApi Execution] Success (${entryType.toUpperCase()}) with '${sym}'! Order ID:`,
            result.orderId || result
          );
          return {
            success: true,
            entryType,
            symbol: canonical,
            brokerSymbol: sym,
            volume: safeVolume,
            price: targetPrice ?? anchorPrice,
            sl: safeSl,
            tp: safeTp,
            result,
          };
        }
      } catch (orderErr: any) {
        lastError = orderErr;
        const msg = orderErr?.message || '';

        if (entryType === 'market' && msg.includes('Invalid stops')) {
          console.warn(
            `[MetaApi Execution] 'Invalid stops' on ${sym}. Executing market order then modifying stops...`
          );
          try {
            const directResult =
              actionUpper === 'BUY'
                ? await conn.createMarketBuyOrder(sym, safeVolume, undefined, undefined, tradeOptions)
                : await conn.createMarketSellOrder(sym, safeVolume, undefined, undefined, tradeOptions);

            if (directResult && (directResult.positionId || directResult.orderId)) {
              const posId = directResult.positionId || directResult.orderId;
              try {
                if (safeSl !== undefined || safeTp !== undefined) {
                  await conn.modifyPosition(posId, safeSl, safeTp);
                }
              } catch (modErr: any) {
                console.warn(`[MetaApi Execution] Post-entry stop modification notice: ${modErr.message}`);
              }
              return {
                success: true,
                entryType,
                symbol: canonical,
                brokerSymbol: sym,
                volume: safeVolume,
                price: anchorPrice,
                sl: safeSl,
                tp: safeTp,
                result: directResult,
              };
            }
          } catch (retryErr) {
            lastError = retryErr;
          }
        }

        if (
          msg.includes('Trade disabled') ||
          msg.includes('Unknown symbol') ||
          msg.includes('not found') ||
          msg.includes('not available')
        ) {
          console.warn(`[MetaApi Execution] Symbol '${sym}' returned '${msg}'. Trying next suffix/variant...`);
          continue;
        }
        throw orderErr;
      }
    }

    throw lastError || new Error(`Failed to place order for ${params.symbol}`);
  } catch (error: any) {
    const details = error?.details ? ` (${JSON.stringify(error.details)})` : '';
    console.error(`[MetaApi Execution] Error executing trade: ${error?.message}${details}`);
    return {
      success: false,
      entryType,
      symbol: canonical,
      volume: safeVolume,
      price: safeLimitPrice,
      error: `${error?.message || error}${details}`,
    };
  }
}

export async function getOpenPositions(): Promise<any[]> {
  try {
    const conn = await getConnection();
    if (!conn) return [];
    const positions = await conn.getPositions();
    return positions.map((p: any) => ({
      id: p.id,
      symbol: p.symbol,
      type: p.type,
      volume: p.volume,
      openPrice: p.openPrice,
      currentPrice: p.currentPrice,
      sl: p.stopLoss,
      tp: p.takeProfit,
      profit: p.profit,
      swap: p.swap,
      comment: p.comment,
      time: p.time,
    }));
  } catch (error: any) {
    console.error('[MetaApi] Failed to fetch open positions:', error.message);
    return [];
  }
}

export async function closePosition(positionId: string): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const conn = await getConnection();
    if (!conn) throw new Error('MetaApi connection unavailable');
    const result = await conn.closePosition(positionId);
    return { success: true, result };
  } catch (error: any) {
    console.error(`[MetaApi] Failed to close position ${positionId}:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function getOpenOrders(): Promise<any[]> {
  try {
    const conn = await getConnection();
    if (!conn) return [];
    const orders = await conn.getOrders();
    return orders.map((o: any) => ({
      id: o.id,
      symbol: o.symbol,
      type: o.type,
      volume: o.volume,
      openPrice: o.openPrice,
      currentPrice: o.currentPrice,
      sl: o.stopLoss,
      tp: o.takeProfit,
      state: o.state,
      comment: o.comment,
      time: o.time,
    }));
  } catch (error: any) {
    console.error('[MetaApi] Failed to fetch pending orders:', error.message);
    return [];
  }
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const conn = await getConnection();
    if (!conn) throw new Error('MetaApi connection unavailable');
    const result = await conn.cancelOrder(orderId);
    return { success: true, result };
  } catch (error: any) {
    console.error(`[MetaApi] Failed to cancel order ${orderId}:`, error.message);
    return { success: false, error: error.message };
  }
}

export function setAutoTradeEnabled(enabled: boolean): boolean {
  isAutoTradeEnabled = Boolean(enabled);
  redis.set('metaapi:auto_trade_enabled', String(isAutoTradeEnabled)).catch(() => {});
  console.log(`[MetaApi] Auto Trade status updated: ${isAutoTradeEnabled}`);
  return isAutoTradeEnabled;
}

export function getAutoTradeEnabled(): boolean {
  return isAutoTradeEnabled;
}
