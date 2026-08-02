/**
 * TwelveData API Key Rotator
 *
 * Maintains a pool of API keys. When a key hits its per-minute rate limit (429),
 * it is immediately marked as "cooling down" for 60 seconds and the next
 * available key is promoted. This maximises throughput across all keys.
 *
 * Usage:
 *   const { getKey, markKeyRateLimited } = require('./keyRotator');
 *   const key = getKey();
 *   // on 429 → markKeyRateLimited(key); then retry with getKey()
 */

const COOLDOWN_MS = 60 * 1000; // 60 second cooldown per TwelveData's window

// Collect all keys defined in the environment, filtering out blanks/duplicates.
const ALL_KEYS = [
  process.env.TWELVEDATA_API_KEY,
  process.env.TWELVEDATA_API_KEY_2,
  process.env.TWELVEDATA_API_KEY_3,
  process.env.TWELVEDATA_API_KEY_4,
  process.env.TWELVEDATA_API_KEY_5,
].filter((k, index, arr) => k && k.trim() !== '' && arr.indexOf(k) === index); // deduplicate

if (ALL_KEYS.length === 0) {
  console.error('CRITICAL: No TwelveData API keys found in environment variables.');
}

console.log(`[key-rotator] Loaded ${ALL_KEYS.length} unique TwelveData key(s).`);

// Map of key → timestamp when its cooldown expires (0 = available)
const cooldowns = new Map(ALL_KEYS.map((k) => [k, 0]));

let currentIndex = 0;

/**
 * Returns the next available (non-cooling) API key.
 * Throws if every key is currently cooling down.
 *
 * @returns {string} An active TwelveData API key.
 */
function getKey() {
  const now = Date.now();

  // Try each key starting from the current index (round-robin)
  for (let i = 0; i < ALL_KEYS.length; i++) {
    const idx = (currentIndex + i) % ALL_KEYS.length;
    const key = ALL_KEYS[idx];
    if (now >= cooldowns.get(key)) {
      currentIndex = (idx + 1) % ALL_KEYS.length; // advance for next call
      return key;
    }
  }

  // All keys are cooling — find which one recovers soonest and report the wait
  const soonestReady = Math.min(...ALL_KEYS.map((k) => cooldowns.get(k)));
  const waitMs = soonestReady - now;
  throw new Error(
    `All ${ALL_KEYS.length} TwelveData API key(s) are rate-limited. ` +
    `Next key available in ${(waitMs / 1000).toFixed(1)}s.`
  );
}

/**
 * Marks a key as rate-limited (cooling down for 60 seconds).
 * Call this immediately when you receive a 429 response.
 *
 * @param {string} key - The key that was rejected with 429.
 */
function markKeyRateLimited(key) {
  const readyAt = Date.now() + COOLDOWN_MS;
  cooldowns.set(key, readyAt);
  const maskedKey = key.slice(0, 6) + '...';
  console.warn(
    `[key-rotator] Key ${maskedKey} hit rate limit. ` +
    `Cooling down for ${COOLDOWN_MS / 1000}s. ` +
    `Active keys remaining: ${getAvailableCount()}`
  );
}

/**
 * Returns the number of keys not currently cooling down.
 * @returns {number}
 */
function getAvailableCount() {
  const now = Date.now();
  return ALL_KEYS.filter((k) => now >= cooldowns.get(k)).length;
}

/**
 * Returns a status snapshot — useful for health-check endpoints.
 * @returns {Array<{masked: string, available: boolean, cooldownEndsIn: number}>}
 */
function getStatus() {
  const now = Date.now();
  return ALL_KEYS.map((k) => ({
    masked: k.slice(0, 6) + '...',
    available: now >= cooldowns.get(k),
    cooldownEndsIn: Math.max(0, Math.ceil((cooldowns.get(k) - now) / 1000)),
  }));
}

module.exports = { getKey, markKeyRateLimited, getAvailableCount, getStatus };
