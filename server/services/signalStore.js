const redis = require('./redisClient');
const { firestore } = require('./firebaseAdmin'); // Assuming a shared Firebase Admin client

// Redis keys for live signals
const getLiveSignalKey = (symbol, interval) => `signals:live:${symbol}:${interval}`;

/**
 * Caches a new signal to Redis as a live signal.
 *
 * @param {object} signal - The signal object to cache.
 * @returns {Promise<void>}
 */
async function cacheLiveSignal(signal) {
  // Live signals are keyed by symbol and interval for quick lookup by the scanner.
  const key = getLiveSignalKey(signal.symbol, signal.interval);
  const ttlSeconds = 3600; // Cache live signals for 1 hour, scanner will overwrite.

  try {
    // We store the full signal object as a JSON string.
    await redis.set(key, JSON.stringify(signal), 'EX', ttlSeconds);
  } catch (error) {
    console.error(`Error caching live signal for ${signal.symbol} in Redis:`, error);
  }
}

/**
 * Retrieves a live signal from the Redis cache.
 *
 * @param {string} symbol - The ticker symbol.
 * @param {string} interval - The candle interval.
 * @returns {Promise<object|null>} The parsed signal object or null.
 */
async function getLiveSignal(symbol, interval) {
  const key = getLiveSignalKey(symbol, interval);
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Error getting live signal for ${symbol} from Redis:`, error);
    return null;
  }
}

/**
 * Saves a signal to the historical Firestore database.
 * This is the permanent, queryable record of the signal.
 *
 * @param {object} signal - The signal object to save.
 * @returns {Promise<void>}
 */
async function saveHistoricalSignal(signal) {
  try {
    const signalWithTimestamp = {
      ...signal,
      createdAt: new Date(), // Add a server-side timestamp for reliable sorting
      status: 'live', // All new signals start as live
    };
    
    // Signals are stored in a top-level 'signals' collection.
    // Firestore will automatically generate a unique ID for the document.
    await firestore.collection('signals').add(signalWithTimestamp);

  } catch (error) {
    console.error(`Error saving historical signal for ${signal.symbol} to Firestore:`, error);
  }
}

/**
 * Updates the status of a signal in Firestore (e.g., to 'tp_hit', 'sl_hit', 'expired').
 *
 * @param {string} signalId - The Firestore document ID of the signal.
 * @param {string} status - The new status.
 * @returns {Promise<void>}
 */
async function updateSignalStatus(signalId, status) {
  try {
    await firestore.collection('signals').doc(signalId).update({ status });
  } catch (error) {
    console.error(`Error updating signal ${signalId} status in Firestore:`, error);
  }
}


module.exports = {
  cacheLiveSignal,
  getLiveSignal,
  saveHistoricalSignal,
  updateSignalStatus,
};
