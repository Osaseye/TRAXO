import express from 'express';
import { firestore } from '../modules/market-data/firebaseAdmin';
import redis from '../modules/market-data/redisClient';
import {
  updateRuntimeGuardrailConfig,
  type SessionWindowFilter,
} from '../modules/risk/guardrails';

const router = express.Router();

const DEFAULT_TRADING_CONTEXT = {
  accountBalance: 10000,
  accountCurrency: 'USD',
  accountType: 'Funded Challenge',
  dailyLossLimitPct: 3.0,
  maxDailyLossPct: 4.0,
  maxDrawdownPct: 8.0,
  riskPerTradePct: 0.5,
  fixedRiskAmount: 50,
  riskMode: 'fixedAmount',
  maxOpenTrades: 3,
  maxConsecutiveLossCap: 3,
  preferredSession: 'Both',
  tradingStyle: 'Intraday',
  allowedDirections: 'Both',
  experienceLevel: 'Intermediate',
  avoidHighImpactNews: true,
  requireChecklistBeforeTrade: false,
  autoTradeGuardrailsEnabled: true,
  autoTradeMinConfidence: 60,
  autoTradeMinRR: 1.8,
  autoTradeMaxPositions: 5,
  autoTradeSpreadCapPips: 3.5,
  autoTradeCorrelationShield: true,
  autoTradeNewsFilter: true,
  autoTradeCooldownOnLoss: true,
  autoTradeAllowedCategories: ['forex', 'metals', 'indices'],
  autoSyncBrokerBalance: true,
  autoTradeSessionFilter: 'all',
  updatedAt: null as number | null,
};

type TradingContextRecord = typeof DEFAULT_TRADING_CONTEXT;

// In-memory store per UID so partial updates never wipe existing settings
// and live guardrails stay synced even if Redis/Firestore is unavailable.
const memoryContextByUid = new Map<string, TradingContextRecord>();

function resolveUid(req: any): string {
  const fromBody = req?.body?.uid;
  const fromQuery = req?.query?.uid;
  const fromHeader = req?.headers?.['x-traxo-uid'];
  const raw = fromBody || fromQuery || fromHeader || 'default_trader';
  return String(raw).trim() || 'default_trader';
}

async function loadExistingContext(uid: string): Promise<TradingContextRecord> {
  const inMemory = memoryContextByUid.get(uid);
  if (inMemory) {
    return { ...DEFAULT_TRADING_CONTEXT, ...inMemory };
  }

  try {
    const docRef = firestore
      .collection('users')
      .doc(uid)
      .collection('settings')
      .doc('tradingContext');
    const snap = await docRef.get();
    if (snap && snap.exists) {
      const merged = { ...DEFAULT_TRADING_CONTEXT, ...(snap.data() as Partial<TradingContextRecord>) };
      memoryContextByUid.set(uid, merged);
      return merged;
    }
  } catch {
    // Fall through to Redis
  }

  const cached = await redis.get(`trading_context:${uid}`).catch(() => null);
  if (cached) {
    try {
      const merged = { ...DEFAULT_TRADING_CONTEXT, ...JSON.parse(cached) };
      memoryContextByUid.set(uid, merged);
      return merged;
    } catch {
      // ignore parse error
    }
  }

  return { ...DEFAULT_TRADING_CONTEXT };
}

// GET /api/trading-context?uid=...
router.get('/', async (req: any, res: any) => {
  try {
    const uid = resolveUid(req);
    const context = await loadExistingContext(uid);
    res.json(context);
  } catch (err: any) {
    console.error('[trading-context GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load trading context' });
  }
});

// POST /api/trading-context
router.post('/', async (req: any, res: any) => {
  try {
    const body = req.body || {};
    const uid = resolveUid(req);
    const existing = await loadExistingContext(uid);

    const pickNum = (val: unknown, fallback: number): number => {
      if (val === undefined || val === null || val === '') return fallback;
      const n = Number(val);
      return Number.isFinite(n) ? n : fallback;
    };

    const pickStr = (val: unknown, fallback: string): string => {
      if (val === undefined || val === null || val === '') return fallback;
      return String(val);
    };

    const pickBool = (val: unknown, fallback: boolean): boolean => {
      if (val === undefined || val === null) return fallback;
      return Boolean(val);
    };

    const payload: TradingContextRecord = {
      accountBalance: pickNum(body.accountBalance, existing.accountBalance),
      accountCurrency: pickStr(body.accountCurrency, existing.accountCurrency),
      accountType: pickStr(body.accountType, existing.accountType),
      dailyLossLimitPct: pickNum(body.dailyLossLimitPct, existing.dailyLossLimitPct),
      maxDailyLossPct: pickNum(body.maxDailyLossPct, existing.maxDailyLossPct),
      maxDrawdownPct: pickNum(body.maxDrawdownPct, existing.maxDrawdownPct),
      riskPerTradePct: pickNum(body.riskPerTradePct, existing.riskPerTradePct),
      fixedRiskAmount: pickNum(body.fixedRiskAmount, existing.fixedRiskAmount),
      riskMode: pickStr(body.riskMode, existing.riskMode),
      maxOpenTrades: pickNum(body.maxOpenTrades, existing.maxOpenTrades),
      maxConsecutiveLossCap: pickNum(body.maxConsecutiveLossCap, existing.maxConsecutiveLossCap),
      preferredSession: pickStr(body.preferredSession, existing.preferredSession),
      tradingStyle: pickStr(body.tradingStyle, existing.tradingStyle),
      allowedDirections: pickStr(body.allowedDirections, existing.allowedDirections),
      experienceLevel: pickStr(body.experienceLevel, existing.experienceLevel),
      avoidHighImpactNews: pickBool(body.avoidHighImpactNews, existing.avoidHighImpactNews),
      requireChecklistBeforeTrade: pickBool(
        body.requireChecklistBeforeTrade,
        existing.requireChecklistBeforeTrade
      ),
      autoTradeGuardrailsEnabled: pickBool(
        body.autoTradeGuardrailsEnabled,
        existing.autoTradeGuardrailsEnabled
      ),
      autoTradeMinConfidence: pickNum(body.autoTradeMinConfidence, existing.autoTradeMinConfidence),
      autoTradeMinRR: pickNum(body.autoTradeMinRR, existing.autoTradeMinRR),
      autoTradeMaxPositions: pickNum(body.autoTradeMaxPositions, existing.autoTradeMaxPositions),
      autoTradeSpreadCapPips: pickNum(body.autoTradeSpreadCapPips, existing.autoTradeSpreadCapPips),
      autoTradeCorrelationShield: pickBool(
        body.autoTradeCorrelationShield,
        existing.autoTradeCorrelationShield
      ),
      autoTradeNewsFilter: pickBool(body.autoTradeNewsFilter, existing.autoTradeNewsFilter),
      autoTradeCooldownOnLoss: pickBool(
        body.autoTradeCooldownOnLoss,
        existing.autoTradeCooldownOnLoss
      ),
      autoTradeAllowedCategories: Array.isArray(body.autoTradeAllowedCategories)
        ? body.autoTradeAllowedCategories.map((c: any) => String(c).toLowerCase())
        : existing.autoTradeAllowedCategories,
      autoSyncBrokerBalance: pickBool(body.autoSyncBrokerBalance, existing.autoSyncBrokerBalance),
      autoTradeSessionFilter: pickStr(body.autoTradeSessionFilter, existing.autoTradeSessionFilter),
      updatedAt: Date.now(),
    };

    // Update in-memory context and live guardrail runtime immediately
    memoryContextByUid.set(uid, payload);
    memoryContextByUid.set('default_trader', payload);

    const effectiveRiskUsd =
      payload.riskMode === 'percentage' && payload.accountBalance > 0 && payload.riskPerTradePct > 0
        ? Math.max(1, Number(((payload.accountBalance * payload.riskPerTradePct) / 100).toFixed(2)))
        : (payload.fixedRiskAmount > 0 ? payload.fixedRiskAmount : 50);

    updateRuntimeGuardrailConfig({
      guardrailsEnabled: payload.autoTradeGuardrailsEnabled,
      minConfidence: payload.autoTradeMinConfidence,
      minRR: payload.autoTradeMinRR,
      maxPositions: payload.autoTradeMaxPositions,
      correlationEnabled: payload.autoTradeCorrelationShield,
      maxSpreadPips: payload.autoTradeSpreadCapPips,
      sessionFilter: payload.autoTradeSessionFilter as SessionWindowFilter,
      maxDailyLossPct: payload.maxDailyLossPct,
      cooldownEnabled: payload.autoTradeCooldownOnLoss,
      maxConsecutiveLosses: payload.maxConsecutiveLossCap,
      newsFilterEnabled: payload.autoTradeNewsFilter,
      riskAmountUsd: effectiveRiskUsd,
      accountBalance: payload.accountBalance,
    });

    const docRef = firestore
      .collection('users')
      .doc(uid)
      .collection('settings')
      .doc('tradingContext');
    const firestoreWrites: Promise<unknown>[] = [docRef.set(payload, { merge: true }).catch(() => {})];
    if (uid !== 'default_trader') {
      firestoreWrites.push(
        firestore
          .collection('users')
          .doc('default_trader')
          .collection('settings')
          .doc('tradingContext')
          .set(payload, { merge: true })
          .catch(() => {})
      );
    }
    await Promise.all(firestoreWrites);

    await Promise.all([
      redis.set(`trading_context:${uid}`, JSON.stringify(payload)),
      redis.set('trading_context:default_trader', JSON.stringify(payload)),
      redis.set(
        'metaapi:auto_trade_guardrails_enabled',
        String(payload.autoTradeGuardrailsEnabled)
      ),
      redis.set('metaapi:auto_trade_min_conf', String(payload.autoTradeMinConfidence)),
      redis.set('metaapi:auto_trade_min_rr', String(payload.autoTradeMinRR)),
      redis.set('metaapi:auto_trade_max_pos', String(payload.autoTradeMaxPositions)),
      redis.set('metaapi:auto_trade_risk_amt', String(effectiveRiskUsd)),
      redis.set('metaapi:auto_trade_session', String(payload.autoTradeSessionFilter)),
      redis.set('metaapi:auto_trade_spread_cap', String(payload.autoTradeSpreadCapPips)),
      redis.set('metaapi:auto_trade_correlation', String(payload.autoTradeCorrelationShield)),
      redis.set('metaapi:auto_trade_news_filter', String(payload.autoTradeNewsFilter)),
      redis.set('metaapi:auto_trade_cooldown_on_loss', String(payload.autoTradeCooldownOnLoss)),
      redis.set('metaapi:auto_trade_max_daily_loss_pct', String(payload.maxDailyLossPct)),
      redis.set('metaapi:auto_trade_max_consec_losses', String(payload.maxConsecutiveLossCap)),
      redis.set(
        'metaapi:auto_trade_allowed_categories',
        JSON.stringify(payload.autoTradeAllowedCategories)
      ),
    ]).catch(() => {});

    res.json({ success: true, context: payload });
  } catch (err: any) {
    console.error('[trading-context POST] Error:', err.message);
    res.status(500).json({ error: 'Failed to save trading context' });
  }
});

export default router;
