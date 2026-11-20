import express from 'express';
import { firestore } from '../modules/market-data/firebaseAdmin';
import redis from '../modules/market-data/redisClient';

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
  maxOpenTrades: 3,
  maxConsecutiveLossCap: 3,
  preferredSession: 'Both',
  tradingStyle: 'Intraday',
  allowedDirections: 'Both',
  experienceLevel: 'Intermediate',
  avoidHighImpactNews: true,
  requireChecklistBeforeTrade: false,
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

// GET /api/trading-context?uid=...
router.get('/', async (req: any, res: any) => {
  try {
    const uid = String(req.query.uid || 'default_trader');
    const docRef = firestore
      .collection('users')
      .doc(uid)
      .collection('settings')
      .doc('tradingContext');
    const snap = await docRef.get();

    if (snap && snap.exists) {
      res.json({ ...DEFAULT_TRADING_CONTEXT, ...snap.data() });
      return;
    }

    const cached = await redis.get(`trading_context:${uid}`).catch(() => null);
    if (cached) {
      res.json({ ...DEFAULT_TRADING_CONTEXT, ...JSON.parse(cached) });
      return;
    }

    res.json(DEFAULT_TRADING_CONTEXT);
  } catch (err: any) {
    console.error('[trading-context GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load trading context' });
  }
});

// POST /api/trading-context
router.post('/', async (req: any, res: any) => {
  try {
    const body = req.body || {};
    const {
      uid = 'default_trader',
      accountBalance,
      accountCurrency,
      accountType,
      dailyLossLimitPct,
      maxDailyLossPct,
      maxDrawdownPct,
      riskPerTradePct,
      fixedRiskAmount,
      maxOpenTrades,
      maxConsecutiveLossCap,
      preferredSession,
      tradingStyle,
      allowedDirections,
      experienceLevel,
      avoidHighImpactNews,
      requireChecklistBeforeTrade,
      autoTradeMinConfidence,
      autoTradeMinRR,
      autoTradeMaxPositions,
      autoTradeSpreadCapPips,
      autoTradeCorrelationShield,
      autoTradeNewsFilter,
      autoTradeCooldownOnLoss,
      autoTradeAllowedCategories,
      autoSyncBrokerBalance,
      autoTradeSessionFilter,
    } = body;

    const payload = {
      accountBalance: Number(accountBalance ?? DEFAULT_TRADING_CONTEXT.accountBalance),
      accountCurrency: String(accountCurrency || DEFAULT_TRADING_CONTEXT.accountCurrency),
      accountType: String(accountType || DEFAULT_TRADING_CONTEXT.accountType),
      dailyLossLimitPct: Number(dailyLossLimitPct ?? DEFAULT_TRADING_CONTEXT.dailyLossLimitPct),
      maxDailyLossPct: Number(maxDailyLossPct ?? DEFAULT_TRADING_CONTEXT.maxDailyLossPct),
      maxDrawdownPct: Number(maxDrawdownPct ?? DEFAULT_TRADING_CONTEXT.maxDrawdownPct),
      riskPerTradePct: Number(riskPerTradePct ?? DEFAULT_TRADING_CONTEXT.riskPerTradePct),
      fixedRiskAmount: Number(fixedRiskAmount ?? DEFAULT_TRADING_CONTEXT.fixedRiskAmount),
      maxOpenTrades: Number(maxOpenTrades ?? DEFAULT_TRADING_CONTEXT.maxOpenTrades),
      maxConsecutiveLossCap: Number(
        maxConsecutiveLossCap ?? DEFAULT_TRADING_CONTEXT.maxConsecutiveLossCap
      ),
      preferredSession: String(preferredSession || DEFAULT_TRADING_CONTEXT.preferredSession),
      tradingStyle: String(tradingStyle || DEFAULT_TRADING_CONTEXT.tradingStyle),
      allowedDirections: String(allowedDirections || DEFAULT_TRADING_CONTEXT.allowedDirections),
      experienceLevel: String(experienceLevel || DEFAULT_TRADING_CONTEXT.experienceLevel),
      avoidHighImpactNews: Boolean(avoidHighImpactNews),
      requireChecklistBeforeTrade: Boolean(requireChecklistBeforeTrade),
      autoTradeMinConfidence: Number(
        autoTradeMinConfidence ?? DEFAULT_TRADING_CONTEXT.autoTradeMinConfidence
      ),
      autoTradeMinRR: Number(autoTradeMinRR ?? DEFAULT_TRADING_CONTEXT.autoTradeMinRR),
      autoTradeMaxPositions: Number(
        autoTradeMaxPositions ?? DEFAULT_TRADING_CONTEXT.autoTradeMaxPositions
      ),
      autoTradeSpreadCapPips: Number(
        autoTradeSpreadCapPips ?? DEFAULT_TRADING_CONTEXT.autoTradeSpreadCapPips
      ),
      autoTradeCorrelationShield:
        autoTradeCorrelationShield !== undefined
          ? Boolean(autoTradeCorrelationShield)
          : DEFAULT_TRADING_CONTEXT.autoTradeCorrelationShield,
      autoTradeNewsFilter:
        autoTradeNewsFilter !== undefined
          ? Boolean(autoTradeNewsFilter)
          : DEFAULT_TRADING_CONTEXT.autoTradeNewsFilter,
      autoTradeCooldownOnLoss:
        autoTradeCooldownOnLoss !== undefined
          ? Boolean(autoTradeCooldownOnLoss)
          : DEFAULT_TRADING_CONTEXT.autoTradeCooldownOnLoss,
      autoTradeAllowedCategories: Array.isArray(autoTradeAllowedCategories)
        ? autoTradeAllowedCategories.map((c: any) => String(c).toLowerCase())
        : DEFAULT_TRADING_CONTEXT.autoTradeAllowedCategories,
      autoSyncBrokerBalance:
        autoSyncBrokerBalance !== undefined
          ? Boolean(autoSyncBrokerBalance)
          : DEFAULT_TRADING_CONTEXT.autoSyncBrokerBalance,
      autoTradeSessionFilter: String(
        autoTradeSessionFilter || DEFAULT_TRADING_CONTEXT.autoTradeSessionFilter
      ),
      updatedAt: Date.now(),
    };

    const docRef = firestore
      .collection('users')
      .doc(uid)
      .collection('settings')
      .doc('tradingContext');
    await docRef.set(payload, { merge: true });

    await Promise.all([
      redis.set(`trading_context:${uid}`, JSON.stringify(payload)),
      redis.set('metaapi:auto_trade_min_conf', String(payload.autoTradeMinConfidence)),
      redis.set('metaapi:auto_trade_min_rr', String(payload.autoTradeMinRR)),
      redis.set('metaapi:auto_trade_max_pos', String(payload.autoTradeMaxPositions)),
      redis.set('metaapi:auto_trade_risk_amt', String(payload.fixedRiskAmount)),
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
