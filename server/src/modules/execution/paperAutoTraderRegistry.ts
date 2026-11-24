import { firestore } from '../market-data/firebaseAdmin';
import { isValidUserUid } from '../auth/requestAuth';
import {
  DEFAULT_GUARDRAIL_CONFIG,
  type GuardrailConfig,
  type SessionWindowFilter,
} from '../risk/guardrails';
import { ensureUserPaperHydrated } from '../storage/paperCloudBackup';
import {
  getUserPaperSettings,
  listAutoTradeEnabledSettings,
  updateUserRiskRuntime,
  upsertUserPaperSettings,
  type UserPaperSettingsRow,
} from '../storage/sqliteDb';

const memorySettingsByUid = new Map<string, UserPaperSettingsRow>();

function todayUtcKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function normalizeCategories(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const cleaned = raw
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [...fallback];
}

function normalizeSessionFilter(
  raw: unknown,
  fallback: SessionWindowFilter
): SessionWindowFilter {
  if (
    raw === 'all' ||
    raw === 'london_ny' ||
    raw === 'ny_only' ||
    raw === 'london_only'
  ) {
    return raw;
  }
  return fallback;
}

export function createDefaultUserPaperSettings(uid: string): UserPaperSettingsRow {
  return {
    uid,
    autoTradeEnabled: false,
    guardrailsEnabled: true,
    riskMode: 'fixedAmount',
    fixedRiskAmount: 50,
    riskPerTradePct: 0.5,
    maxDailyLossPct: 4.0,
    maxConsecutiveLossCap: 3,
    minConfidence: 60,
    minRR: 1.8,
    maxPositions: 5,
    spreadCapPips: 3.5,
    sessionFilter: 'all',
    correlationShield: true,
    newsFilter: true,
    cooldownOnLoss: true,
    allowedCategories: ['forex', 'metals', 'indices'],
    accountBalance: 10000,
    autoSyncBrokerBalance: true,
    dailyLossUsd: 0,
    dailyLossDate: todayUtcKey(),
    consecutiveLosses: 0,
    cooldownUntil: null,
    updatedAt: Date.now(),
  };
}

function mergeUserPaperSettings(
  base: UserPaperSettingsRow,
  patch?: Partial<UserPaperSettingsRow> | Record<string, any> | null
): UserPaperSettingsRow {
  if (!patch || typeof patch !== 'object') {
    return {
      ...base,
      allowedCategories: [...base.allowedCategories],
    };
  }

  const pickNum = (val: unknown, fallback: number): number => {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const pickBool = (val: unknown, fallback: boolean): boolean => {
    if (val === undefined || val === null) return fallback;
    return Boolean(val);
  };

  const riskModeRaw = patch.riskMode ?? base.riskMode;
  const riskMode: 'fixedAmount' | 'percentage' =
    riskModeRaw === 'percentage' ? 'percentage' : 'fixedAmount';

  const cooldownRaw = patch.cooldownUntil;
  let cooldownUntil = base.cooldownUntil;
  if (cooldownRaw === null) {
    cooldownUntil = null;
  } else if (cooldownRaw !== undefined && Number.isFinite(Number(cooldownRaw))) {
    cooldownUntil = Number(cooldownRaw);
  }

  const dailyLossDate =
    typeof patch.dailyLossDate === 'string' && patch.dailyLossDate.trim()
      ? patch.dailyLossDate.trim()
      : base.dailyLossDate || todayUtcKey();

  return {
    uid: base.uid,
    autoTradeEnabled: pickBool(patch.autoTradeEnabled, base.autoTradeEnabled),
    guardrailsEnabled: pickBool(patch.guardrailsEnabled, base.guardrailsEnabled),
    riskMode,
    fixedRiskAmount: pickNum(patch.fixedRiskAmount, base.fixedRiskAmount),
    riskPerTradePct: pickNum(patch.riskPerTradePct, base.riskPerTradePct),
    maxDailyLossPct: pickNum(patch.maxDailyLossPct, base.maxDailyLossPct),
    maxConsecutiveLossCap: pickNum(patch.maxConsecutiveLossCap, base.maxConsecutiveLossCap),
    minConfidence: pickNum(patch.minConfidence, base.minConfidence),
    minRR: pickNum(patch.minRR, base.minRR),
    maxPositions: pickNum(patch.maxPositions, base.maxPositions),
    spreadCapPips: pickNum(patch.spreadCapPips, base.spreadCapPips),
    sessionFilter: normalizeSessionFilter(patch.sessionFilter, base.sessionFilter),
    correlationShield: pickBool(patch.correlationShield, base.correlationShield),
    newsFilter: pickBool(patch.newsFilter, base.newsFilter),
    cooldownOnLoss: pickBool(patch.cooldownOnLoss, base.cooldownOnLoss),
    allowedCategories: normalizeCategories(patch.allowedCategories, base.allowedCategories),
    accountBalance: pickNum(patch.accountBalance, base.accountBalance),
    autoSyncBrokerBalance: pickBool(patch.autoSyncBrokerBalance, base.autoSyncBrokerBalance),
    dailyLossUsd: pickNum(patch.dailyLossUsd, base.dailyLossUsd),
    dailyLossDate,
    consecutiveLosses: pickNum(patch.consecutiveLosses, base.consecutiveLosses),
    cooldownUntil,
    updatedAt: pickNum(patch.updatedAt, base.updatedAt),
  };
}

function cloneSettings(row: UserPaperSettingsRow): UserPaperSettingsRow {
  return {
    ...row,
    allowedCategories: [...row.allowedCategories],
  };
}

export async function getUserTradingConfig(uid: string): Promise<UserPaperSettingsRow> {
  if (!isValidUserUid(uid)) {
    throw new Error('Valid user UID is required to load trading configuration');
  }

  const cached = memorySettingsByUid.get(uid);
  if (cached) {
    return cloneSettings(cached);
  }

  try {
    const sqliteRow = getUserPaperSettings(uid);
    if (sqliteRow) {
      const normalized = mergeUserPaperSettings(createDefaultUserPaperSettings(uid), sqliteRow);
      memorySettingsByUid.set(uid, normalized);
      return cloneSettings(normalized);
    }
  } catch {
    // Fall through to Firestore / default initialization
  }

  try {
    const snap = await firestore
      .collection('users')
      .doc(uid)
      .collection('settings')
      .doc('paperContextV2')
      .get()
      .catch(() => null);

    if (snap && snap.exists) {
      const fsData = snap.data() as Partial<UserPaperSettingsRow> | undefined;
      const hydrated = mergeUserPaperSettings(createDefaultUserPaperSettings(uid), fsData);
      memorySettingsByUid.set(uid, hydrated);
      try {
        upsertUserPaperSettings(hydrated);
      } catch {}
      return cloneSettings(hydrated);
    }
  } catch {
    // Fall through to default settings
  }

  const defaults = createDefaultUserPaperSettings(uid);
  memorySettingsByUid.set(uid, defaults);
  try {
    upsertUserPaperSettings(defaults);
  } catch {}
  return cloneSettings(defaults);
}

export async function saveUserTradingConfig(
  uid: string,
  patch: Partial<UserPaperSettingsRow>
): Promise<UserPaperSettingsRow> {
  if (!isValidUserUid(uid)) {
    throw new Error('Valid user UID is required to save trading configuration');
  }

  const existing = await getUserTradingConfig(uid);
  const next = mergeUserPaperSettings(existing, {
    ...patch,
    uid,
    updatedAt: Date.now(),
  });

  memorySettingsByUid.set(uid, next);
  try {
    upsertUserPaperSettings(next);
  } catch (err: any) {
    console.warn(`[PaperAutoTraderRegistry] SQLite upsert notice for ${uid}:`, err?.message || err);
  }

  await Promise.all([
    firestore
      .collection('users')
      .doc(uid)
      .collection('settings')
      .doc('paperContextV2')
      .set(next, { merge: true })
      .catch(() => {}),
    firestore
      .collection('system')
      .doc('paper_v2_traders')
      .set(
        {
          activeUids: { [uid]: next.autoTradeEnabled },
          updatedAt: Date.now(),
        },
        { merge: true }
      )
      .catch(() => {}),
  ]);

  return cloneSettings(next);
}

export async function setUserAutoTradeEnabled(
  uid: string,
  enabled: boolean
): Promise<UserPaperSettingsRow> {
  return saveUserTradingConfig(uid, { autoTradeEnabled: Boolean(enabled) });
}

export async function getAutoTradeEnabledUsers(): Promise<UserPaperSettingsRow[]> {
  const byUid = new Map<string, UserPaperSettingsRow>();

  try {
    const sqliteEnabled = listAutoTradeEnabledSettings();
    for (const row of sqliteEnabled) {
      if (!row || !isValidUserUid(row.uid) || row.autoTradeEnabled !== true) continue;
      const normalized = mergeUserPaperSettings(createDefaultUserPaperSettings(row.uid), row);
      byUid.set(row.uid, normalized);
      if (!memorySettingsByUid.has(row.uid)) {
        memorySettingsByUid.set(row.uid, normalized);
      }
    }
  } catch {
    // Fall back to in-memory active configs
  }

  for (const [uid, cfg] of memorySettingsByUid.entries()) {
    if (!isValidUserUid(uid)) continue;
    const existing = byUid.get(uid);
    if (cfg.autoTradeEnabled === true) {
      if (!existing || cfg.updatedAt >= existing.updatedAt) {
        byUid.set(uid, cloneSettings(cfg));
      }
    } else if (existing && cfg.updatedAt >= existing.updatedAt) {
      byUid.delete(uid);
    }
  }

  return Array.from(byUid.values());
}

export async function hydrateAllActiveTraders(): Promise<string[]> {
  const hydratedUids: string[] = [];

  try {
    const snap = await firestore
      .collection('system')
      .doc('paper_v2_traders')
      .get()
      .catch(() => null);

    const data = snap?.exists ? snap.data() : null;
    const activeMap =
      data && typeof data.activeUids === 'object' && data.activeUids !== null
        ? (data.activeUids as Record<string, unknown>)
        : {};

    const candidateUids = Object.entries(activeMap)
      .filter(([uid, enabled]) => enabled === true && isValidUserUid(uid))
      .map(([uid]) => uid);

    for (const uid of candidateUids) {
      try {
        await getUserTradingConfig(uid);
        await ensureUserPaperHydrated(uid);
        hydratedUids.push(uid);
      } catch (err: any) {
        console.warn(`[PaperAutoTraderRegistry] Hydration notice for ${uid}:`, err?.message || err);
      }
    }
  } catch (err: any) {
    console.warn('[PaperAutoTraderRegistry] Failed hydrating active traders:', err?.message || err);
  }

  return hydratedUids;
}

export async function recordUserTradeResolutionForRisk(
  uid: string,
  outcome: 'WIN' | 'LOSS',
  pnlDeltaUsd = 0
): Promise<void> {
  if (!isValidUserUid(uid)) return;

  const cfg = await getUserTradingConfig(uid);
  const today = todayUtcKey();
  const baseDailyLoss = cfg.dailyLossDate === today ? Number(cfg.dailyLossUsd) || 0 : 0;

  const lossIncrement = Math.abs(pnlDeltaUsd || cfg.fixedRiskAmount || 50);
  const nextDailyLoss =
    outcome === 'LOSS' ? Number((baseDailyLoss + lossIncrement).toFixed(2)) : baseDailyLoss;

  const nextConsec = outcome === 'LOSS' ? (Number(cfg.consecutiveLosses) || 0) + 1 : 0;
  const now = Date.now();
  const lossCap = Number(cfg.maxConsecutiveLossCap) > 0 ? Number(cfg.maxConsecutiveLossCap) : 3;

  let nextCooldown: number | null = cfg.cooldownUntil ?? null;
  if (outcome === 'WIN') {
    nextCooldown = null;
  } else if (nextConsec >= lossCap) {
    nextCooldown = now + 60 * 60 * 1000;
  }

  try {
    updateUserRiskRuntime(uid, {
      dailyLossUsd: nextDailyLoss,
      dailyLossDate: today,
      consecutiveLosses: nextConsec,
      cooldownUntil: nextCooldown,
    });
  } catch (err: any) {
    console.warn(`[PaperAutoTraderRegistry] Risk runtime SQLite update notice for ${uid}:`, err?.message || err);
  }

  memorySettingsByUid.set(uid, {
    ...cfg,
    dailyLossUsd: nextDailyLoss,
    dailyLossDate: today,
    consecutiveLosses: nextConsec,
    cooldownUntil: nextCooldown,
    updatedAt: now,
  });
}

export function resolveEffectiveRiskUsd(cfg: UserPaperSettingsRow): number {
  const bal = Number(cfg.accountBalance);
  const pct = Number(cfg.riskPerTradePct);
  if (
    cfg.riskMode === 'percentage' &&
    Number.isFinite(bal) &&
    bal > 0 &&
    Number.isFinite(pct) &&
    pct > 0
  ) {
    return Math.max(1, Number(((bal * pct) / 100).toFixed(2)));
  }
  const fixed = Number(cfg.fixedRiskAmount);
  return Number.isFinite(fixed) && fixed > 0 ? fixed : 50;
}

export function toGuardrailConfig(cfg: UserPaperSettingsRow): GuardrailConfig {
  const sessionFilter: SessionWindowFilter =
    cfg.sessionFilter === 'london_ny' ||
    cfg.sessionFilter === 'ny_only' ||
    cfg.sessionFilter === 'london_only' ||
    cfg.sessionFilter === 'all'
      ? cfg.sessionFilter
      : 'all';

  return {
    guardrailsEnabled: cfg.guardrailsEnabled !== false,
    minConfidence: Number.isFinite(Number(cfg.minConfidence))
      ? Number(cfg.minConfidence)
      : DEFAULT_GUARDRAIL_CONFIG.minConfidence,
    minRR: Number.isFinite(Number(cfg.minRR))
      ? Number(cfg.minRR)
      : DEFAULT_GUARDRAIL_CONFIG.minRR,
    maxPositions: Number.isFinite(Number(cfg.maxPositions))
      ? Number(cfg.maxPositions)
      : DEFAULT_GUARDRAIL_CONFIG.maxPositions,
    correlationEnabled: cfg.correlationShield !== false,
    maxCorrelatedUsdPositions: DEFAULT_GUARDRAIL_CONFIG.maxCorrelatedUsdPositions,
    maxSpreadPips: Number.isFinite(Number(cfg.spreadCapPips))
      ? Number(cfg.spreadCapPips)
      : DEFAULT_GUARDRAIL_CONFIG.maxSpreadPips,
    sessionFilter,
    maxDailyLossPct: Number.isFinite(Number(cfg.maxDailyLossPct))
      ? Number(cfg.maxDailyLossPct)
      : DEFAULT_GUARDRAIL_CONFIG.maxDailyLossPct,
    cooldownEnabled: cfg.cooldownOnLoss !== false,
    maxConsecutiveLosses: Number.isFinite(Number(cfg.maxConsecutiveLossCap))
      ? Number(cfg.maxConsecutiveLossCap)
      : DEFAULT_GUARDRAIL_CONFIG.maxConsecutiveLosses,
    cooldownMinutes: DEFAULT_GUARDRAIL_CONFIG.cooldownMinutes,
    newsFilterEnabled: cfg.newsFilter !== false,
    newsFreezeBeforeMinutes: DEFAULT_GUARDRAIL_CONFIG.newsFreezeBeforeMinutes,
    newsFreezeAfterMinutes: DEFAULT_GUARDRAIL_CONFIG.newsFreezeAfterMinutes,
    riskAmountUsd: resolveEffectiveRiskUsd(cfg),
    accountBalance:
      Number.isFinite(Number(cfg.accountBalance)) && Number(cfg.accountBalance) > 0
        ? Number(cfg.accountBalance)
        : DEFAULT_GUARDRAIL_CONFIG.accountBalance,
  };
}
