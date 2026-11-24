import express from 'express';
import { requireAuthenticatedUid } from '../modules/auth/requestAuth';
import {
  getUserTradingConfig,
  saveUserTradingConfig,
} from '../modules/execution/paperAutoTraderRegistry';
import type { UserPaperSettingsRow } from '../modules/storage/sqliteDb';

const router = express.Router();

function toApiTradingContext(cfg: UserPaperSettingsRow) {
  return {
    accountBalance: cfg.accountBalance,
    accountCurrency: 'USD',
    accountType: 'Paper Account',
    dailyLossLimitPct: cfg.maxDailyLossPct,
    maxDailyLossPct: cfg.maxDailyLossPct,
    maxDrawdownPct: 8.0,
    riskPerTradePct: cfg.riskPerTradePct,
    fixedRiskAmount: cfg.fixedRiskAmount,
    riskMode: cfg.riskMode,
    maxOpenTrades: cfg.maxPositions,
    maxConsecutiveLossCap: cfg.maxConsecutiveLossCap,
    preferredSession: 'Both',
    tradingStyle: 'Intraday',
    allowedDirections: 'Both',
    experienceLevel: 'Intermediate',
    avoidHighImpactNews: cfg.newsFilter,
    requireChecklistBeforeTrade: false,
    autoTradeEnabled: cfg.autoTradeEnabled,
    autoTradeGuardrailsEnabled: cfg.guardrailsEnabled,
    autoTradeMinConfidence: cfg.minConfidence,
    autoTradeMinRR: cfg.minRR,
    autoTradeMaxPositions: cfg.maxPositions,
    autoTradeSpreadCapPips: cfg.spreadCapPips,
    autoTradeSessionFilter: cfg.sessionFilter,
    autoTradeCorrelationShield: cfg.correlationShield,
    autoTradeNewsFilter: cfg.newsFilter,
    autoTradeCooldownOnLoss: cfg.cooldownOnLoss,
    autoTradeAllowedCategories: [...cfg.allowedCategories],
    autoSyncBrokerBalance: cfg.autoSyncBrokerBalance,
    updatedAt: cfg.updatedAt,
  };
}

// GET /api/trading-context
router.get('/', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;
    const cfg = await getUserTradingConfig(uid);
    res.json(toApiTradingContext(cfg));
  } catch (err: any) {
    console.error('[trading-context GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load trading context' });
  }
});

// POST /api/trading-context
router.post('/', async (req: any, res: any) => {
  try {
    const uid = await requireAuthenticatedUid(req, res);
    if (!uid) return;

    const body = req.body || {};
    const patch: Partial<UserPaperSettingsRow> = {};

    const optNum = (val: unknown): number | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      const n = Number(val);
      return Number.isFinite(n) ? n : undefined;
    };

    const optBool = (val: unknown): boolean | undefined => {
      if (val === undefined || val === null) return undefined;
      return Boolean(val);
    };

    const autoTradeEnabled = optBool(body.autoTradeEnabled);
    if (autoTradeEnabled !== undefined) patch.autoTradeEnabled = autoTradeEnabled;

    const guardrailsEnabled = optBool(
      body.autoTradeGuardrailsEnabled !== undefined
        ? body.autoTradeGuardrailsEnabled
        : body.guardrailsEnabled
    );
    if (guardrailsEnabled !== undefined) patch.guardrailsEnabled = guardrailsEnabled;

    const minConfidence = optNum(body.autoTradeMinConfidence ?? body.minConfidence);
    if (minConfidence !== undefined) patch.minConfidence = minConfidence;

    const minRR = optNum(body.autoTradeMinRR ?? body.minRR);
    if (minRR !== undefined) patch.minRR = minRR;

    const maxPositions = optNum(body.autoTradeMaxPositions ?? body.maxPositions);
    if (maxPositions !== undefined) patch.maxPositions = maxPositions;

    const spreadCapPips = optNum(body.autoTradeSpreadCapPips ?? body.spreadCapPips);
    if (spreadCapPips !== undefined) patch.spreadCapPips = spreadCapPips;

    const rawSession = body.autoTradeSessionFilter ?? body.sessionFilter;
    if (
      rawSession === 'all' ||
      rawSession === 'london_ny' ||
      rawSession === 'ny_only' ||
      rawSession === 'london_only'
    ) {
      patch.sessionFilter = rawSession;
    }

    const correlationShield = optBool(
      body.autoTradeCorrelationShield !== undefined
        ? body.autoTradeCorrelationShield
        : body.correlationShield
    );
    if (correlationShield !== undefined) patch.correlationShield = correlationShield;

    const newsFilter = optBool(
      body.autoTradeNewsFilter !== undefined ? body.autoTradeNewsFilter : body.newsFilter
    );
    if (newsFilter !== undefined) patch.newsFilter = newsFilter;

    const cooldownOnLoss = optBool(
      body.autoTradeCooldownOnLoss !== undefined
        ? body.autoTradeCooldownOnLoss
        : body.cooldownOnLoss
    );
    if (cooldownOnLoss !== undefined) patch.cooldownOnLoss = cooldownOnLoss;

    const rawCategories = body.autoTradeAllowedCategories ?? body.allowedCategories;
    if (Array.isArray(rawCategories)) {
      patch.allowedCategories = rawCategories
        .map((c: any) => String(c || '').trim().toLowerCase())
        .filter(Boolean);
    }

    const fixedRiskAmount = optNum(body.fixedRiskAmount);
    if (fixedRiskAmount !== undefined) patch.fixedRiskAmount = fixedRiskAmount;

    if (body.riskMode === 'percentage' || body.riskMode === 'fixedAmount') {
      patch.riskMode = body.riskMode;
    }

    const riskPerTradePct = optNum(body.riskPerTradePct);
    if (riskPerTradePct !== undefined) patch.riskPerTradePct = riskPerTradePct;

    const maxDailyLossPct = optNum(body.maxDailyLossPct);
    if (maxDailyLossPct !== undefined) patch.maxDailyLossPct = maxDailyLossPct;

    const maxConsecutiveLossCap = optNum(body.maxConsecutiveLossCap);
    if (maxConsecutiveLossCap !== undefined) patch.maxConsecutiveLossCap = maxConsecutiveLossCap;

    const accountBalance = optNum(body.accountBalance);
    if (accountBalance !== undefined && accountBalance > 0) {
      patch.accountBalance = accountBalance;
    }

    const autoSyncBrokerBalance = optBool(body.autoSyncBrokerBalance);
    if (autoSyncBrokerBalance !== undefined) {
      patch.autoSyncBrokerBalance = autoSyncBrokerBalance;
    }

    const saved = await saveUserTradingConfig(uid, patch);
    res.json({ success: true, context: toApiTradingContext(saved) });
  } catch (err: any) {
    console.error('[trading-context POST] Error:', err.message);
    res.status(500).json({ error: 'Failed to save trading context' });
  }
});

export default router;
