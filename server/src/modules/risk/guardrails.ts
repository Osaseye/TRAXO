import {
  calculateSpreadPips,
  getInstrumentSpec,
  getUsdExposure,
  normalizeSymbol,
} from '../../config/instruments';
import { newsServiceClient } from '../../services/news/NewsServiceClient';
import redis, { backupRedis } from '../market-data/redisClient';

export type GuardrailCode = 'A.1' | 'A.2' | 'B.4' | 'B.7' | 'C.9' | 'C.10' | 'D.1' | 'D.2' | 'D.3';

export type SessionWindowFilter = 'all' | 'london_ny' | 'ny_only' | 'london_only';

export interface GuardrailConfig {
  guardrailsEnabled: boolean;       // Master switch — when false, bypasses all 9 guardrails (Raw Signal Mode)
  minConfidence: number;            // A.1
  minRR: number;                    // A.2
  maxPositions: number;             // B.4
  correlationEnabled: boolean;      // B.7
  maxCorrelatedUsdPositions: number;// B.7 (default 2)
  maxSpreadPips: number;            // C.9
  sessionFilter: SessionWindowFilter;// C.10
  maxDailyLossPct: number;          // D.1
  cooldownEnabled: boolean;         // D.2
  maxConsecutiveLosses: number;     // D.2
  cooldownMinutes: number;          // D.2
  newsFilterEnabled: boolean;       // D.3
  newsFreezeBeforeMinutes: number;  // D.3
  newsFreezeAfterMinutes: number;   // D.3
  riskAmountUsd: number;
  accountBalance: number;
}

export interface GuardrailSignalInput {
  id?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  strategyId: string;
  timeframe: string;
  entry: number;
  sl: number;
  tp: number;
  rr?: number;
  confidence: number;
}

export interface OpenPositionLike {
  symbol?: string;
  type?: string;
}

export interface QuoteLike {
  bid?: number | null;
  ask?: number | null;
}

export interface GuardrailEvaluationInput {
  signal: GuardrailSignalInput;
  config?: Partial<GuardrailConfig>;
  openPositions?: OpenPositionLike[];
  quote?: QuoteLike | null;
  dailyLossUsd?: number;
  dailyLossPct?: number;
  accountBalance?: number;
  consecutiveLosses?: number;
  cooldownActiveUntil?: number | null;
  newsMinutesAway?: number | null;
  now?: Date;
}

export interface GuardrailCheckResult {
  code: GuardrailCode;
  name: string;
  passed: boolean;
  reason?: string;
  actual?: number | string | boolean | null;
  limit?: number | string | boolean | null;
}

export interface GuardrailEvaluationResult {
  allowed: boolean;
  rejectedBy: GuardrailCheckResult | null;
  failedChecks: GuardrailCheckResult[];
  checks: GuardrailCheckResult[];
  reasons: string[];
  spreadPips: number | null;
  computedRR: number;
  normalizedConfidence: number;
  evaluatedAt: string;
}

export interface RiskRuntimeState {
  dailyLossUsd: number;
  consecutiveLosses: number;
  cooldownUntil: number | null;
  dateKey: string;
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  guardrailsEnabled: true,
  minConfidence: 60,
  minRR: 1.5,
  maxPositions: 5,
  correlationEnabled: true,
  maxCorrelatedUsdPositions: 2,
  maxSpreadPips: 3.5,
  sessionFilter: 'all',
  maxDailyLossPct: 6.0,
  cooldownEnabled: true,
  maxConsecutiveLosses: 3,
  cooldownMinutes: 60,
  newsFilterEnabled: true,
  newsFreezeBeforeMinutes: 30,
  newsFreezeAfterMinutes: 15,
  riskAmountUsd: 500,
  accountBalance: 10000,
};

let runtimeGuardrailOverrides: Partial<GuardrailConfig> = {};

export function updateRuntimeGuardrailConfig(partial: Partial<GuardrailConfig>): void {
  const cleaned: Partial<GuardrailConfig> = {};
  for (const [key, val] of Object.entries(partial)) {
    if (val !== undefined && val !== null && !(typeof val === 'number' && Number.isNaN(val))) {
      (cleaned as Record<string, unknown>)[key] = val;
    }
  }
  runtimeGuardrailOverrides = {
    ...runtimeGuardrailOverrides,
    ...cleaned,
  };
}

function todayUtcKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function normalizeConfidencePct(confidence: number): number {
  const num = Number(confidence) || 0;
  return num <= 1 && num > 0 ? Math.round(num * 100) : Math.round(num);
}

export function computeSignalRR(signal: GuardrailSignalInput): number {
  const risk = Math.abs(Number(signal.entry) - Number(signal.sl));
  const reward = Math.abs(Number(signal.tp) - Number(signal.entry));
  if (risk > 0 && Number.isFinite(reward)) {
    return Number((reward / risk).toFixed(2));
  }
  return Number((signal.rr ?? 0).toFixed(2));
}

export function checkCorrelationShield(
  newSymbol: string,
  newDirection: string,
  openPositions: OpenPositionLike[] = [],
  maxCorrelated = 2
): { passed: boolean; exposure: string | null; sameExposureCount: number } {
  const newExposure = getUsdExposure(newSymbol, newDirection);
  if (!newExposure || openPositions.length === 0) {
    return { passed: true, exposure: newExposure, sameExposureCount: 0 };
  }
  const sameExposureCount = openPositions.filter(
    (p) => getUsdExposure(p.symbol || '', p.type || '') === newExposure
  ).length;
  return {
    passed: sameExposureCount < maxCorrelated,
    exposure: newExposure,
    sameExposureCount,
  };
}

export function checkSessionWindow(
  sessionFilter: SessionWindowFilter = 'all',
  now: Date = new Date()
): boolean {
  if (!sessionFilter || sessionFilter === 'all') return true;
  const hour = now.getUTCHours();
  if (sessionFilter === 'london_ny') return hour >= 7 && hour < 20;
  if (sessionFilter === 'ny_only') return hour >= 12 && hour < 21;
  if (sessionFilter === 'london_only') return hour >= 7 && hour < 16;
  return true;
}

/**
 * Pure, atomic evaluator for all 9 pre-trade execution guardrails.
 */
export function evaluatePreTradeGuardrails(
  input: GuardrailEvaluationInput
): GuardrailEvaluationResult {
  const cfg: GuardrailConfig = { ...DEFAULT_GUARDRAIL_CONFIG, ...(input.config || {}) };
  const now = input.now ?? new Date();
  const openPositions = input.openPositions ?? [];
  const normConf = normalizeConfidencePct(input.signal.confidence);
  const computedRR = computeSignalRR(input.signal);

  let spreadPips: number | null = null;
  if (
    input.quote &&
    typeof input.quote.bid === 'number' &&
    typeof input.quote.ask === 'number' &&
    input.quote.bid > 0 &&
    input.quote.ask > 0
  ) {
    spreadPips = calculateSpreadPips(input.signal.symbol, input.quote.bid, input.quote.ask);
  }

  if (cfg.guardrailsEnabled === false) {
    const bypassedCodes: Array<{ code: GuardrailCode; name: string }> = [
      { code: 'A.1', name: 'Min Confidence' },
      { code: 'A.2', name: 'Min Risk:Reward' },
      { code: 'B.4', name: 'Max Concurrent Positions' },
      { code: 'B.7', name: 'USD Correlation Shield' },
      { code: 'C.9', name: 'Max Spread Cap' },
      { code: 'C.10', name: 'Session Window' },
      { code: 'D.1', name: 'Daily Loss Cap' },
      { code: 'D.2', name: 'Consecutive Loss Cooldown' },
      { code: 'D.3', name: 'News Freeze Window' },
    ];
    return {
      allowed: true,
      rejectedBy: null,
      failedChecks: [],
      checks: bypassedCodes.map((c) => ({
        code: c.code,
        name: c.name,
        passed: true,
        actual: null,
        limit: 'bypassed',
      })),
      reasons: [],
      spreadPips,
      computedRR,
      normalizedConfidence: normConf,
      evaluatedAt: now.toISOString(),
    };
  }

  const checks: GuardrailCheckResult[] = [];

  // A.1 Min Confidence threshold
  const passA1 = normConf >= cfg.minConfidence;
  checks.push({
    code: 'A.1',
    name: 'Min Confidence',
    passed: passA1,
    actual: normConf,
    limit: cfg.minConfidence,
    reason: passA1 ? undefined : `[A.1] Confidence ${normConf}% below minimum ${cfg.minConfidence}%`,
  });

  // A.2 Min Risk:Reward ratio
  const passA2 = computedRR >= cfg.minRR;
  checks.push({
    code: 'A.2',
    name: 'Min Risk:Reward',
    passed: passA2,
    actual: computedRR,
    limit: cfg.minRR,
    reason: passA2 ? undefined : `[A.2] R:R ${computedRR.toFixed(2)} below minimum ${cfg.minRR.toFixed(2)}`,
  });

  // B.4 Max Concurrent Open Positions
  const passB4 = openPositions.length < cfg.maxPositions;
  checks.push({
    code: 'B.4',
    name: 'Max Concurrent Positions',
    passed: passB4,
    actual: openPositions.length,
    limit: cfg.maxPositions,
    reason: passB4
      ? undefined
      : `[B.4] Concurrent open positions (${openPositions.length}/${cfg.maxPositions}) at cap`,
  });

  // B.7 USD Correlation Shield
  const corr = checkCorrelationShield(
    input.signal.symbol,
    input.signal.direction,
    openPositions,
    cfg.maxCorrelatedUsdPositions
  );
  const passB7 = !cfg.correlationEnabled || corr.passed;
  checks.push({
    code: 'B.7',
    name: 'USD Correlation Shield',
    passed: passB7,
    actual: corr.exposure ? `${corr.exposure} (${corr.sameExposureCount})` : 'NONE',
    limit: cfg.correlationEnabled ? cfg.maxCorrelatedUsdPositions : 'disabled',
    reason: passB7
      ? undefined
      : `[B.7] USD Correlation Shield active: ${corr.sameExposureCount} open ${corr.exposure} positions`,
  });

  // C.9 Spread Cap
  const spec = getInstrumentSpec(input.signal.symbol);
  const callerSpreadCap = input.config?.maxSpreadPips;
  const effectiveSpreadCap =
    typeof callerSpreadCap === 'number' && Number.isFinite(callerSpreadCap)
      ? callerSpreadCap
      : spec.maxAllowedSpreadPips;
  const passC9 = spreadPips === null || spreadPips <= effectiveSpreadCap;
  checks.push({
    code: 'C.9',
    name: 'Spread Cap',
    passed: passC9,
    actual: spreadPips,
    limit: effectiveSpreadCap,
    reason: passC9
      ? undefined
      : `[C.9] Live spread ${spreadPips?.toFixed(2)} pips exceeds cap ${effectiveSpreadCap} pips`,
  });

  // C.10 Session Window (+ XAUUSD 21:00-23:00 UTC Rollover Quarantine)
  const utcHour = now.getUTCHours();
  const inGoldRolloverQuarantine =
    spec.symbol === 'XAUUSD' && utcHour >= 21 && utcHour < 23;
  const passSessionFilter = checkSessionWindow(cfg.sessionFilter, now);
  const passC10 = passSessionFilter && !inGoldRolloverQuarantine;
  checks.push({
    code: 'C.10',
    name: 'Session Window',
    passed: passC10,
    actual: `${utcHour}:00 UTC`,
    limit: inGoldRolloverQuarantine ? 'XAUUSD rollover quarantine (21:00-23:00 UTC)' : cfg.sessionFilter,
    reason: passC10
      ? undefined
      : inGoldRolloverQuarantine
        ? `[C.10] XAUUSD rollover quarantine active (21:00-23:00 UTC) at ${utcHour}:00 UTC`
        : `[C.10] Outside allowed trading session (${cfg.sessionFilter}) at ${utcHour}:00 UTC`,
  });

  // D.1 Daily Loss Cap
  const acctBal = input.accountBalance ?? cfg.accountBalance;
  const dailyLossUsd = input.dailyLossUsd ?? 0;
  const effectiveDailyLossPct =
    input.dailyLossPct !== undefined
      ? input.dailyLossPct
      : acctBal > 0
        ? Number(((dailyLossUsd / acctBal) * 100).toFixed(2))
        : 0;
  const passD1 = effectiveDailyLossPct < cfg.maxDailyLossPct;
  checks.push({
    code: 'D.1',
    name: 'Daily Loss Cap',
    passed: passD1,
    actual: effectiveDailyLossPct,
    limit: cfg.maxDailyLossPct,
    reason: passD1
      ? undefined
      : `[D.1] Daily loss ${effectiveDailyLossPct.toFixed(2)}% reached cap ${cfg.maxDailyLossPct}%`,
  });

  // D.2 Consecutive Loss Cooldown
  const consecLosses = input.consecutiveLosses ?? 0;
  const cooldownUntil = input.cooldownActiveUntil ?? null;
  const inCooldownWindow = Boolean(cooldownUntil && now.getTime() < cooldownUntil);
  const streakExceeded = consecLosses >= cfg.maxConsecutiveLosses && cooldownUntil === null;
  const passD2 = !cfg.cooldownEnabled || (!inCooldownWindow && !streakExceeded);
  checks.push({
    code: 'D.2',
    name: 'Consecutive Loss Cooldown',
    passed: passD2,
    actual: inCooldownWindow ? `cooldown until ${new Date(cooldownUntil!).toISOString()}` : consecLosses,
    limit: cfg.cooldownEnabled ? cfg.maxConsecutiveLosses : 'disabled',
    reason: passD2
      ? undefined
      : `[D.2] Consecutive loss cooldown active (${consecLosses}/${cfg.maxConsecutiveLosses} losses)`,
  });

  // D.3 News Freeze window
  const newsMins = input.newsMinutesAway;
  const inNewsFreeze =
    typeof newsMins === 'number' &&
    newsMins >= -cfg.newsFreezeAfterMinutes &&
    newsMins <= cfg.newsFreezeBeforeMinutes;
  const passD3 = !cfg.newsFilterEnabled || !inNewsFreeze;
  checks.push({
    code: 'D.3',
    name: 'News Freeze Window',
    passed: passD3,
    actual: newsMins ?? null,
    limit: cfg.newsFilterEnabled
      ? `[-${cfg.newsFreezeAfterMinutes}m, +${cfg.newsFreezeBeforeMinutes}m]`
      : 'disabled',
    reason: passD3
      ? undefined
      : `[D.3] High-impact news freeze active (${newsMins}m away)`,
  });

  const failedChecks = checks.filter((c) => !c.passed);
  const reasons = failedChecks.map((c) => c.reason!).filter(Boolean);

  return {
    allowed: failedChecks.length === 0,
    rejectedBy: failedChecks[0] ?? null,
    failedChecks,
    checks,
    reasons,
    spreadPips,
    computedRR,
    normalizedConfidence: normConf,
    evaluatedAt: now.toISOString(),
  };
}

/**
 * Asynchronously resolves minutes-to-impact for a symbol via NewsServiceClient
 * with non-blocking local fallback (fails open to null if news service fails/times out).
 */
export async function resolveNewsMinutesAway(
  symbol: string,
  config?: Partial<GuardrailConfig>
): Promise<number | null> {
  const cfg: GuardrailConfig = { ...DEFAULT_GUARDRAIL_CONFIG, ...(config || {}) };
  if (cfg.guardrailsEnabled === false || !cfg.newsFilterEnabled) return null;

  try {
    const status = await newsServiceClient.getFreezeStatus(symbol, {
      beforeMinutes: cfg.newsFreezeBeforeMinutes,
      afterMinutes: cfg.newsFreezeAfterMinutes,
    });
    return status.minutesToImpact;
  } catch (err: any) {
    console.warn('[Guardrails] NewsServiceClient fallback to null:', err?.message || err);
    return null;
  }
}

/**
 * Asynchronous guardrail evaluation that queries NewsServiceClient for D.3
 * when `newsMinutesAway` is not already supplied by the caller.
 */
export async function evaluatePreTradeGuardrailsAsync(
  input: GuardrailEvaluationInput
): Promise<GuardrailEvaluationResult> {
  const cfg: GuardrailConfig = { ...DEFAULT_GUARDRAIL_CONFIG, ...(input.config || {}) };
  const newsMinutesAway =
    input.newsMinutesAway !== undefined
      ? input.newsMinutesAway
      : await resolveNewsMinutesAway(input.signal.symbol, cfg);

  return evaluatePreTradeGuardrails({
    ...input,
    config: cfg,
    newsMinutesAway,
  });
}

export async function loadGuardrailConfig(): Promise<GuardrailConfig> {
  const [
    cachedGuardrailsEnabled,
    cachedMinConf,
    cachedMinRR,
    cachedMaxPos,
    cachedRiskAmt,
    cachedSession,
    cachedSpreadCap,
    cachedCorrelation,
    cachedNewsFilter,
    cachedCooldownEnabled,
    cachedMaxDailyLossPct,
    cachedMaxConsecLosses,
    cachedTradingCtx,
  ] = await Promise.all([
    redis.get('metaapi:auto_trade_guardrails_enabled').catch(() => null),
    redis.get('metaapi:auto_trade_min_conf').catch(() => null),
    redis.get('metaapi:auto_trade_min_rr').catch(() => null),
    redis.get('metaapi:auto_trade_max_pos').catch(() => null),
    redis.get('metaapi:auto_trade_risk_amt').catch(() => null),
    redis.get('metaapi:auto_trade_session').catch(() => null),
    redis.get('metaapi:auto_trade_spread_cap').catch(() => null),
    redis.get('metaapi:auto_trade_correlation').catch(() => null),
    redis.get('metaapi:auto_trade_news_filter').catch(() => null),
    redis.get('metaapi:auto_trade_cooldown_on_loss').catch(() => null),
    redis.get('metaapi:auto_trade_max_daily_loss_pct').catch(() => null),
    redis.get('metaapi:auto_trade_max_consec_losses').catch(() => null),
    redis.get('trading_context:default_trader').catch(() => null),
  ]);

  let ctxObj: Record<string, any> = {};
  if (cachedTradingCtx) {
    try {
      ctxObj = JSON.parse(cachedTradingCtx);
    } catch {}
  }

  const numOr = (val: string | null, fallback: number): number =>
    val !== null && !Number.isNaN(Number(val)) ? Number(val) : fallback;

  return {
    guardrailsEnabled:
      runtimeGuardrailOverrides.guardrailsEnabled ??
      (cachedGuardrailsEnabled !== null
        ? cachedGuardrailsEnabled !== 'false'
        : (ctxObj.autoTradeGuardrailsEnabled ?? DEFAULT_GUARDRAIL_CONFIG.guardrailsEnabled)),
    minConfidence:
      runtimeGuardrailOverrides.minConfidence ??
      numOr(cachedMinConf, ctxObj.autoTradeMinConfidence ?? DEFAULT_GUARDRAIL_CONFIG.minConfidence),
    minRR:
      runtimeGuardrailOverrides.minRR ??
      numOr(cachedMinRR, ctxObj.autoTradeMinRR ?? DEFAULT_GUARDRAIL_CONFIG.minRR),
    maxPositions:
      runtimeGuardrailOverrides.maxPositions ??
      numOr(cachedMaxPos, ctxObj.autoTradeMaxPositions ?? DEFAULT_GUARDRAIL_CONFIG.maxPositions),
    correlationEnabled:
      runtimeGuardrailOverrides.correlationEnabled ??
      (cachedCorrelation !== null
        ? cachedCorrelation === 'true'
        : (ctxObj.autoTradeCorrelationShield ?? DEFAULT_GUARDRAIL_CONFIG.correlationEnabled)),
    maxCorrelatedUsdPositions:
      runtimeGuardrailOverrides.maxCorrelatedUsdPositions ??
      DEFAULT_GUARDRAIL_CONFIG.maxCorrelatedUsdPositions,
    maxSpreadPips:
      runtimeGuardrailOverrides.maxSpreadPips ??
      numOr(cachedSpreadCap, ctxObj.autoTradeSpreadCapPips ?? DEFAULT_GUARDRAIL_CONFIG.maxSpreadPips),
    sessionFilter:
      runtimeGuardrailOverrides.sessionFilter ??
      ((cachedSession || ctxObj.autoTradeSessionFilter || 'all') as SessionWindowFilter),
    maxDailyLossPct:
      runtimeGuardrailOverrides.maxDailyLossPct ??
      numOr(
        cachedMaxDailyLossPct,
        ctxObj.maxDailyLossPct ?? DEFAULT_GUARDRAIL_CONFIG.maxDailyLossPct
      ),
    cooldownEnabled:
      runtimeGuardrailOverrides.cooldownEnabled ??
      (cachedCooldownEnabled !== null
        ? cachedCooldownEnabled === 'true'
        : (ctxObj.autoTradeCooldownOnLoss ?? DEFAULT_GUARDRAIL_CONFIG.cooldownEnabled)),
    maxConsecutiveLosses:
      runtimeGuardrailOverrides.maxConsecutiveLosses ??
      numOr(
        cachedMaxConsecLosses,
        ctxObj.maxConsecutiveLossCap ?? DEFAULT_GUARDRAIL_CONFIG.maxConsecutiveLosses
      ),
    cooldownMinutes:
      runtimeGuardrailOverrides.cooldownMinutes ?? DEFAULT_GUARDRAIL_CONFIG.cooldownMinutes,
    newsFilterEnabled:
      runtimeGuardrailOverrides.newsFilterEnabled ??
      (cachedNewsFilter !== null
        ? cachedNewsFilter === 'true'
        : (ctxObj.autoTradeNewsFilter ?? DEFAULT_GUARDRAIL_CONFIG.newsFilterEnabled)),
    newsFreezeBeforeMinutes: DEFAULT_GUARDRAIL_CONFIG.newsFreezeBeforeMinutes,
    newsFreezeAfterMinutes: DEFAULT_GUARDRAIL_CONFIG.newsFreezeAfterMinutes,
    riskAmountUsd:
      runtimeGuardrailOverrides.riskAmountUsd ??
      numOr(cachedRiskAmt, ctxObj.fixedRiskAmount ?? DEFAULT_GUARDRAIL_CONFIG.riskAmountUsd),
    accountBalance:
      runtimeGuardrailOverrides.accountBalance ??
      (Number(ctxObj.accountBalance) || DEFAULT_GUARDRAIL_CONFIG.accountBalance),
  };
}

export async function getRiskRuntimeState(now = new Date()): Promise<RiskRuntimeState> {
  const dateKey = todayUtcKey(now);
  const [lossVal, consecVal, cooldownVal] = await Promise.all([
    redis.get(`risk:daily_loss:${dateKey}`).catch(() => null),
    redis.get('risk:consec_losses').catch(() => null),
    redis.get('risk:cooldown_until').catch(() => null),
  ]);

  return {
    dailyLossUsd: lossVal ? Number(lossVal) || 0 : 0,
    consecutiveLosses: consecVal ? Number(consecVal) || 0 : 0,
    cooldownUntil: cooldownVal ? Number(cooldownVal) || null : null,
    dateKey,
  };
}

export async function recordTradeResolutionForRisk(
  outcome: 'WIN' | 'LOSS',
  pnlDeltaUsd = 0,
  config?: Partial<GuardrailConfig>,
  now = new Date()
): Promise<RiskRuntimeState> {
  const cfg = { ...DEFAULT_GUARDRAIL_CONFIG, ...(config || {}) };
  const state = await getRiskRuntimeState(now);
  const nextDailyLoss =
    outcome === 'LOSS'
      ? Math.max(0, state.dailyLossUsd + Math.abs(pnlDeltaUsd || cfg.riskAmountUsd))
      : state.dailyLossUsd;

  const nextConsec = outcome === 'LOSS' ? state.consecutiveLosses + 1 : 0;
  let nextCooldown: number | null = state.cooldownUntil;

  if (outcome === 'WIN') {
    nextCooldown = null;
  } else if (nextConsec >= cfg.maxConsecutiveLosses) {
    nextCooldown = now.getTime() + cfg.cooldownMinutes * 60 * 1000;
  }

  await Promise.all([
    redis.set(`risk:daily_loss:${state.dateKey}`, String(nextDailyLoss), 'EX', 172800).catch(() => {}),
    redis.set('risk:consec_losses', String(nextConsec)).catch(() => {}),
    nextCooldown
      ? redis.set('risk:cooldown_until', String(nextCooldown), 'EX', cfg.cooldownMinutes * 60).catch(() => {})
      : redis.del('risk:cooldown_until').catch(() => {}),
  ]);

  return {
    dailyLossUsd: nextDailyLoss,
    consecutiveLosses: nextConsec,
    cooldownUntil: nextCooldown,
    dateKey: state.dateKey,
  };
}

export async function recordGuardrailRejection(
  signal: GuardrailSignalInput,
  evaluation: GuardrailEvaluationResult
): Promise<void> {
  const cleanSymbol = normalizeSymbol(signal.symbol);
  const key = `scan_rejects:${cleanSymbol}:${signal.timeframe}`;
  const eventRecord = {
    timestamp: evaluation.evaluatedAt,
    symbol: cleanSymbol,
    timeframe: signal.timeframe,
    strategyId: signal.strategyId,
    direction: signal.direction,
    confidence: evaluation.normalizedConfidence,
    rr: evaluation.computedRR,
    spreadPips: evaluation.spreadPips,
    code: evaluation.rejectedBy?.code || 'GUARDRAIL',
    reasons: evaluation.reasons,
    failedChecks: evaluation.failedChecks,
  };

  try {
    const existingRaw = await backupRedis.get(key).catch(() => null);
    let existingObj: Record<string, any> = {};
    if (existingRaw) {
      try {
        existingObj = JSON.parse(existingRaw);
      } catch {}
    }

    const guardrailKey = `guardrail:${signal.strategyId}`;
    existingObj[guardrailKey] = evaluation.reasons;
    const prevEvents = Array.isArray(existingObj._guardrailEvents) ? existingObj._guardrailEvents : [];
    existingObj._guardrailEvents = [eventRecord, ...prevEvents].slice(0, 20);

    await Promise.all([
      backupRedis.set(key, JSON.stringify(existingObj), 'EX', 7200).catch(() => {}),
      backupRedis.lpush('scan_rejects:guardrails', JSON.stringify(eventRecord)).catch(() => {}),
      backupRedis.ltrim('scan_rejects:guardrails', 0, 99).catch(() => {}),
    ]);
  } catch (err: any) {
    console.error('[Guardrails] Failed to log scan_rejects to backup Redis:', err.message);
  }
}
