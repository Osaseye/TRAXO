import { env } from '../../config/env';

const COOLDOWN_MS = 60 * 1000;
const ALL_KEYS: string[] = env.twelvedataKeys;

if (ALL_KEYS.length === 0) {
  console.error('CRITICAL: No TwelveData API keys found in environment variables.');
}

console.log(`[key-rotator] Loaded ${ALL_KEYS.length} unique TwelveData key(s).`);

const cooldowns = new Map<string, number>(ALL_KEYS.map((k) => [k, 0]));
let currentIndex = 0;

export function getKey(): string {
  if (ALL_KEYS.length === 0) {
    throw new Error('No TwelveData API keys configured.');
  }

  const now = Date.now();
  for (let i = 0; i < ALL_KEYS.length; i++) {
    const idx = (currentIndex + i) % ALL_KEYS.length;
    const key = ALL_KEYS[idx];
    if (now >= (cooldowns.get(key) ?? 0)) {
      currentIndex = (idx + 1) % ALL_KEYS.length;
      return key;
    }
  }

  const soonestReady = Math.min(...ALL_KEYS.map((k) => cooldowns.get(k) ?? 0));
  const waitMs = soonestReady - now;
  throw new Error(
    `All ${ALL_KEYS.length} TwelveData API key(s) are rate-limited. ` +
    `Next key available in ${(waitMs / 1000).toFixed(1)}s.`
  );
}

export function markKeyRateLimited(key: string): void {
  const readyAt = Date.now() + COOLDOWN_MS;
  cooldowns.set(key, readyAt);
  const maskedKey = key.slice(0, 6) + '...';
  console.warn(
    `[key-rotator] Key ${maskedKey} hit rate limit. ` +
    `Cooling down for ${COOLDOWN_MS / 1000}s. ` +
    `Active keys remaining: ${getAvailableCount()}`
  );
}

export function getAvailableCount(): number {
  const now = Date.now();
  return ALL_KEYS.filter((k) => now >= (cooldowns.get(k) ?? 0)).length;
}

export function getStatus(): Array<{ masked: string; available: boolean; cooldownEndsIn: number }> {
  const now = Date.now();
  return ALL_KEYS.map((k) => ({
    masked: k.slice(0, 6) + '...',
    available: now >= (cooldowns.get(k) ?? 0),
    cooldownEndsIn: Math.max(0, Math.ceil(((cooldowns.get(k) ?? 0) - now) / 1000)),
  }));
}
