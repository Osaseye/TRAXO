const redis = require('./redisClient');

const token = process.env.METAAPI_TOKEN;
const accountId = process.env.METAAPI_ACCOUNT_ID;

let api = null;
let account = null;
let connection = null;
let isAutoTradeEnabled = false;

// Hydrate initial auto trade setting from Redis if available
redis.get('metaapi:auto_trade_enabled').then((val) => {
  if (val !== null) {
    isAutoTradeEnabled = val === 'true';
  }
}).catch(() => {});

/**
 * Initializes MetaApi instance and gets account reference
 */
async function initMetaApi() {
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
  } catch (error) {
    return false;
  }
}

/**
 * Ensures RPC connection is active and deployed
 */
async function getConnection() {
  const initialized = await initMetaApi();
  if (!initialized || !account) return null;

  try {
    if (account.state !== 'DEPLOYED') {
      await account.deploy();
    }
    if (account.connectionStatus !== 'CONNECTED') {
      await account.waitConnected();
    }
    if (!connection) {
      connection = account.getRPCConnection();
      await connection.connect();
      await connection.waitSynchronized();
    }
    return connection;
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('top up your account') || msg.includes('deployment')) {
      console.warn('[MetaApi] Notice: Terminal requires MetaApi account deployment / top up on metaapi.cloud');
    } else {
      console.error('[MetaApi] Connection notice:', msg);
    }
    return null;
  }
}

/**
 * Get account information (Balance, Equity, Margin, Free Margin)
 */
async function getAccountInfo() {
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
  } catch (error) {
    console.error('[MetaApi] Failed to fetch account info:', error.message);
    return {
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Executes a trade on Exness MT5
 * @param {Object} tradeParams
 * @param {string} tradeParams.symbol (e.g. 'EURUSD', 'BTCUSD')
 * @param {'BUY' | 'SELL'} tradeParams.action
 * @param {number} tradeParams.volume (lots, e.g. 0.01)
 * @param {number} tradeParams.sl (optional stop loss price)
 * @param {number} tradeParams.tp (optional take profit price)
 * @param {string} tradeParams.comment (optional comment)
 */
async function executeTrade({ symbol, action, volume = 0.01, sl, tp, comment = 'TRAXO Auto' }) {
  try {
    const conn = await getConnection();
    if (!conn) {
      throw new Error('MetaApi connection unavailable');
    }

    // Format symbol if needed (e.g. EUR/USD -> EURUSD)
    const formattedSymbol = symbol.replace('/', '');

    console.log(`[MetaApi Execution] Placing ${action} on ${formattedSymbol} volume ${volume} SL:${sl} TP:${tp}`);

    const tradeOptions = {
      comment,
      clientId: `traxo_${Date.now()}`,
    };
    if (sl) tradeOptions.stopLoss = Number(sl);
    if (tp) tradeOptions.takeProfit = Number(tp);

    let result;
    if (action.toUpperCase() === 'BUY') {
      result = await conn.createMarketBuyOrder(formattedSymbol, volume, tradeOptions.stopLoss, tradeOptions.takeProfit, tradeOptions);
    } else {
      result = await conn.createMarketSellOrder(formattedSymbol, volume, tradeOptions.stopLoss, tradeOptions.takeProfit, tradeOptions);
    }

    console.log('[MetaApi Execution] Result:', result);
    return { success: true, result };
  } catch (error) {
    console.error('[MetaApi Execution] Error executing trade:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get current open positions on Exness MT5
 */
async function getOpenPositions() {
  try {
    const conn = await getConnection();
    if (!conn) return [];
    const positions = await conn.getPositions();
    return positions.map((p) => ({
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
  } catch (error) {
    console.error('[MetaApi] Failed to fetch open positions:', error.message);
    return [];
  }
}

/**
 * Close a specific open position by ID
 */
async function closePosition(positionId) {
  try {
    const conn = await getConnection();
    if (!conn) throw new Error('MetaApi connection unavailable');
    const result = await conn.closePosition(positionId);
    return { success: true, result };
  } catch (error) {
    console.error(`[MetaApi] Failed to close position ${positionId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Toggle auto trade setting
 */
function setAutoTradeEnabled(enabled) {
  isAutoTradeEnabled = Boolean(enabled);
  redis.set('metaapi:auto_trade_enabled', String(isAutoTradeEnabled)).catch(() => {});
  console.log(`[MetaApi] Auto Trade status updated: ${isAutoTradeEnabled}`);
  return isAutoTradeEnabled;
}

function getAutoTradeEnabled() {
  return isAutoTradeEnabled;
}

module.exports = {
  initMetaApi,
  getConnection,
  getAccountInfo,
  executeTrade,
  getOpenPositions,
  closePosition,
  setAutoTradeEnabled,
  getAutoTradeEnabled,
};
