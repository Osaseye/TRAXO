import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  PiArrowLeft,
  PiCaretDown,
  PiCaretUp,
  PiChartBar,
  PiClock,
  PiShieldCheck,
  PiSlidersHorizontal,
  PiTarget,
  PiTrash,
} from 'react-icons/pi';
import { AdaptiveFeedbackWidget } from '@/components/shared/AdaptiveFeedbackWidget';
import { DiagramCarousel, type DiagramItem } from '@/components/strategies/DiagramCarousel';
import { PositionSizeCalculator } from '@/components/strategies/PositionSizeCalculator';
import { SetupScoreEvaluator } from '@/components/strategies/SetupScoreEvaluator';
import { useStrategyOptimizer } from '@/hooks/useStrategyOptimizer';
import { useAnalysisSignalStore, type StoredSignal } from '@/stores/useAnalysisSignalStore';
import { type OnboardingStrategyId, useOnboardingStore } from '@/stores/useOnboardingStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';

interface StrategySpec {
  id: OnboardingStrategyId;
  snakeId: string;
  name: string;
  category: 'Reversal' | 'Continuation' | 'Imbalance';
  tagline: string;
  timeframe: string;
  bannerSrc: string;
  overview: string;
  entryCheckpoints: string[];
  invalidationRules: string[];
  takeProfitLogic: string;
  idealSessions: string;
  riskModel: string;
}

const STRATEGY_SPECS: Record<OnboardingStrategyId, StrategySpec> = {
  'wick-rejection': {
    id: 'wick-rejection',
    snakeId: 'wick_rejection',
    name: 'Wick Rejection',
    category: 'Reversal',
    tagline: 'Institutional liquidity sweep reversals & wick exhaustion at key levels',
    timeframe: '1H / 4H',
    bannerSrc: '/brand/strategy-wick-rejection.png',
    overview:
      'Captures sharp counter-market rejections when price probes past key support or resistance swings to trigger stop liquidity, then reverses aggressively before candle close. Setups qualify through wick-to-body asymmetry, ATR range expansion, and volume confirmation.',
    entryCheckpoints: [
      'Liquidity Sweep: Candle low or high pierces a verified swing support/resistance level or session extreme.',
      'Wick-to-Body Ratio: Rejection wick exceeds minWickRatio (factory 2.5x) relative to net candle body.',
      'ATR Volatility Gate: Candle range satisfies 14-period ATR expansion thresholds without extreme overextension.',
      'Volume Confluence: Signal candle volume meets or exceeds 20-period Volume Moving Average.',
      'Inside-Zone Close: Candle closes cleanly back inside structural territory prior to signal emission.',
    ],
    invalidationRules: [
      'Stop Loss is pinned at wick tip +/- atrSlPadding * ATR14 (factory 1.5x ATR buffer against secondary sweeps).',
      'Trade thesis invalidates immediately if a higher-timeframe candle closes cleanly beyond the wick extreme.',
      'Discard setups where opposing Higher-Timeframe trend score drops confidence below minConfidence (factory 68%).',
    ],
    takeProfitLogic:
      'TP1 targets internal-to-external swing liquidity (minimum 1.8x R:R structural or fallback target). TP2 scales toward opposing HTF structural boundaries.',
    idealSessions: 'London Open & New York Overlap (08:00 – 17:00 UTC)',
    riskModel: 'Dynamic 1.0% – 1.5% risk allocation scaled by setup confidence score.',
  },
  breakout: {
    id: 'breakout',
    snakeId: 'breakout',
    name: 'Breakout Momentum',
    category: 'Continuation',
    tagline: 'Volatility compression expansion with confirmed volume surge',
    timeframe: '1H / 4H / 1D',
    bannerSrc: '/brand/strategy-breakout.png',
    overview:
      'Detects multi-bar consolidation compression where ATR and range narrow tightly around horizontal boundaries, then enters on high-volume candle body closes outside the range box.',
    entryCheckpoints: [
      'Compression Window: Minimum consolidationCount bars (factory 8 candles) confined inside compressed range bounds.',
      'Confirmed Boundary Close: Full candle body closes cleanly outside consolidation high or low.',
      'Volume Surge: Breakout bar volume >= volumeSpikeMultiplier * Volume MA20 (factory 1.8x).',
      'Momentum Alignment: Breakout candle closes in upper/lower 30% of bar range without heavy fade wick.',
    ],
    invalidationRules: [
      'Stop Loss placed at consolidation midpoint (50% equilibrium) or 0.8x ATR behind breakout candle open.',
      'Immediate invalidation on rapid re-acceptance (candle closing back inside the broken range box).',
      'Suppress breakouts failing minConfidence (factory 65%) or lacking HTF momentum confirmation.',
    ],
    takeProfitLogic:
      'TP1 projects 1.5x consolidation box height from breakout edge; TP2 projects 2.5x box height toward clean range liquidity.',
    idealSessions: 'London Open, New York Open & Macro Volatility Windows',
    riskModel: 'Fixed 1.0% account risk with break-even stop trail once TP1 structural milestone is tagged.',
  },
  'order-block': {
    id: 'order-block',
    snakeId: 'order_block',
    name: 'Order Block Retest',
    category: 'Reversal',
    tagline: 'Institutional footprint mitigation & Fair Value Gap displacement entry',
    timeframe: '1H / 4H',
    bannerSrc: '/brand/strategy-order-block.png',
    overview:
      'Identifies the final opposing candle preceding an institutional displacement impulse (validated by displacementRatio and Fair Value Gap creation), then enters on first-touch mitigation retest.',
    entryCheckpoints: [
      'Displacement Impulse: 3-candle expansion satisfying displacementRatio >= 1.8x ATR and leaving an FVG imbalance.',
      'Order Block Anchoring: Last opposing candle before displacement defines proximal and distal boundaries.',
      'First-Touch Mitigation: Price retraces to mitigate the proximal edge or 50% midpoint of the OB zone.',
      'Market Structure Bias: Trade direction aligns with BOS / HTF institutional order flow.',
    ],
    invalidationRules: [
      'Stop Loss anchored beyond the distal OB edge + atrSlPadding * ATR (factory 0.5x ATR).',
      'Zone flips to Breaker / Invalidated immediately on clean candle body close through the distal boundary.',
      'Mitigated zones (already touched prior) are excluded from fresh signal generation.',
    ],
    takeProfitLogic:
      'TP1 targets unmitigated opposing equal highs/lows or FVG voids; TP2 targets major HTF external swing liquidity.',
    idealSessions: 'London & New York Core Killzones',
    riskModel: '1.0% – 1.5% risk capped strictly outside distal institutional OB boundary.',
  },
  'supply-demand': {
    id: 'supply-demand',
    snakeId: 'supply_demand',
    name: 'Supply & Demand',
    category: 'Imbalance',
    tagline: 'Fresh unmitigated origin zones from RBD / DBR / RBR / DBD structures',
    timeframe: '1H / 4H',
    bannerSrc: '/brand/strategy-supply-demand.png',
    overview:
      'Maps institutional resting order imbalances formed by tight basing followed by explosive departure candles, entering upon the first return into an unmitigated zone.',
    entryCheckpoints: [
      'Zone Freshness: Origin Demand or Supply zone has zero prior mitigation touches.',
      'Departure Velocity: Departure leg meets zoneFlipStrength (factory 2.0x ATR) with minimal base overlap.',
      'Imbalance Ratio: Clear >3:1 departure displacement compared to base zone height.',
      'Proximal Touch Trigger: Price re-enters proximal edge with clean rejection reaction.',
    ],
    invalidationRules: [
      'Stop Loss positioned atrSlPadding * ATR (factory 0.3x ATR) beyond the distal base extreme.',
      'Any full body close beyond distal boundary invalidates remaining resting order thesis.',
      'Skip retests when opposing zone sits within < 1.5R of proximal entry level.',
    ],
    takeProfitLogic:
      'TP1 locks at nearest opposing unmitigated Supply/Demand zone (minimum 2.0x R:R); TP2 runs to major HTF origin.',
    idealSessions: 'London & New York Overlap',
    riskModel: '1.25% account risk with automatic partial de-risk at opposing first-trouble-area.',
  },
  'trend-following': {
    id: 'trend-following',
    snakeId: 'trend_following',
    name: 'Trend Following',
    category: 'Continuation',
    tagline: 'EMA 20/50/200 alignment with Break of Structure & Fibonacci pullback triggers',
    timeframe: '4H / 1D',
    bannerSrc: '/brand/strategy-trend-following.png',
    overview:
      'Filters for clean directional regimes via EMA 20/50/200 stack alignment and verified Breaks of Structure (BOS), executing pullbacks into the 38.2%–61.8% Fibonacci retracement corridor.',
    entryCheckpoints: [
      'EMA Regime Filter: Strict EMA 20 > EMA 50 > EMA 200 stack (or bearish inverse).',
      'Verified BOS: Recent structural swing high/low broken by impulse close.',
      'Pullback Corridor: Retracement stays shallower than pullbackDepth cap (factory 0.618 / 61.8%).',
      'Continuation Trigger: Rejection or engulfing confirmation candle printing inside pullback zone.',
    ],
    invalidationRules: [
      'Stop Loss placed beyond the structural swing anchor or atrSlPadding * ATR buffer.',
      'Setup invalidates if pullback breaks prior BOS origin swing (structure failure / CHoCH).',
      'Suppress counter-trend entries whenever EMA 20/50 spread compresses flat.',
    ],
    takeProfitLogic:
      'TP1 targets the active BOS swing extreme; TP2 projects 1.272 and 1.618 Fibonacci trend extensions.',
    idealSessions: 'All Major Liquid Sessions (Tokyo / London / New York)',
    riskModel: '1.0% fixed risk with trailing stop tracked behind structural swing points.',
  },
};

const STRATEGY_DIAGRAMS: Record<OnboardingStrategyId, DiagramItem[]> = {
  'wick-rejection': [
    {
      id: 'wr-bull',
      label: 'Bullish Support',
      src: '/strategies/wick-rejection/1.png',
      caption:
        'Price sweeps below key support to harvest stop liquidity, then closes strongly above with a prominent lower rejection tail.',
    },
    {
      id: 'wr-bear',
      label: 'Bearish Resistance',
      src: '/strategies/wick-rejection/4.png',
      caption:
        'Price pierces overhead resistance, triggers trapped buyers, and rejects sharply below resistance with an elongated upper wick.',
    },
    {
      id: 'wr-anatomy',
      label: 'Candle Anatomy',
      src: '/strategies/wick-rejection/2.png',
      caption:
        'Quantitative breakdown of candle body, rejection wick height, and invalidation buffer placement.',
    },
    {
      id: 'wr-ratio',
      label: 'Wick Ratios',
      src: '/strategies/wick-rejection/6.png',
      caption:
        'Strength classification across 2:1 minimum, 3:1 optimal, and 4:1+ institutional exhaustion tails.',
    },
    {
      id: 'wr-flow',
      label: 'Decision Flow',
      src: '/strategies/wick-rejection/3.png',
      caption:
        'Sequential algorithmic gate sequence from level proximity through volume and ATR filtering.',
    },
    {
      id: 'wr-mtf',
      label: 'MTF Confluence',
      src: '/strategies/wick-rejection/5.png',
      caption:
        'Aligning HTF structural bias with LTF execution triggers for asymmetric R:R.',
    },
  ],
  breakout: [
    {
      id: 'bk-anatomy',
      label: 'Breakout Anatomy',
      src: '/strategies/breakout/b92a89fc36b141a255783a6ef896f30f8014d739.png',
      caption: 'Compression range detection followed by decisive body expansion and volume surge.',
    },
    {
      id: 'bk-flow',
      label: 'Decision Flow',
      src: '/strategies/breakout/37c28fdbf815474d262a94b4cf03ce16e88842a6.png',
      caption:
        'Algorithmic checklist verifying volatility compression, boundary break, and volume confirmation.',
    },
    {
      id: 'bk-fake',
      label: 'Fakeout Filter',
      src: '/strategies/breakout/90b03a0a1d00f905e856878146c3d2f9f91331a4.png',
      caption: 'Separating genuine institutional expansions from low-volume liquidity grabs.',
    },
    {
      id: 'bk-rr',
      label: 'Sizing & R:R',
      src: '/strategies/breakout/8a1b4f205b2960673975ae10dfb7d789a2a9f1d9.png',
      caption: 'Stop placement at range equilibrium and projected 1.5x–2.5x box height targets.',
    },
    {
      id: 'bk-mtf',
      label: 'Timeframe Matrix',
      src: '/strategies/breakout/2d8366ed11cf01de79452064ed43ca12fc628280.png',
      caption: 'Reliability expectations across 15m, 1H, 4H, and Daily structural breakouts.',
    },
    {
      id: 'bk-markets',
      label: 'Cross-Market',
      src: '/strategies/breakout/effb747e9fa5208e7d5f07b1e6d13e2da377f10d.png',
      caption: 'Adapting consolidation bar counts and volatility bands across FX, metals, and equities.',
    },
  ],
  'order-block': [
    {
      id: 'ob-bull',
      label: 'Bullish OB',
      src: '/strategies/order-block/960bd822f0e042d4b790c86b4a562a1fd387b8db.png',
      caption:
        'Last bearish candle prior to bullish FVG displacement acting as proximal/midpoint mitigation demand.',
    },
    {
      id: 'ob-bear',
      label: 'Bearish OB',
      src: '/strategies/order-block/383a2f588b1ae6d090a75a94e70b67bcdf8a561d.png',
      caption: 'Last bullish candle before bearish impulse expansion creating institutional supply mitigation.',
    },
    {
      id: 'ob-amd',
      label: 'AMD Cycle',
      src: '/strategies/order-block/80e73af6530f2338b0216f8665b537785e0e4f81.png',
      caption: 'Accumulation, Manipulation sweep, and Distribution phases driving Order Block relevance.',
    },
    {
      id: 'ob-breaker',
      label: 'Breaker Flip',
      src: '/strategies/order-block/8e58ed183755a17988294ed3200e5ae00e6ba881.png',
      caption: 'When an Order Block closes through its distal edge, it flips into a Breaker invalidation zone.',
    },
    {
      id: 'ob-flow',
      label: 'Decision Flow',
      src: '/strategies/order-block/16280acb567b07cedc695d76e2e1ec48ec4bacb1.png',
      caption: 'Scoring displacement velocity, FVG presence, and mitigation freshness.',
    },
    {
      id: 'ob-mtf',
      label: 'MTF Analysis',
      src: '/strategies/order-block/da91ec163fe28920be173719aca2e866ced1d0a0.png',
      caption: 'Refining 4H institutional footprints inside 15m/1H execution windows.',
    },
    {
      id: 'ob-tf',
      label: 'Timeframe Guide',
      src: '/strategies/order-block/08809ed464284f61f5bcaab7d11a5523a4a7f5d2.png',
      caption: 'Optimal holding horizons and ATR padding multiples per chart interval.',
    },
    {
      id: 'ob-scope',
      label: 'Applicability',
      src: '/strategies/order-block/67929160b0347ea0d8b021888ac076e64a9bf322.png',
      caption: 'Asset-class calibration rules across Forex pairs, Gold, and Equities.',
    },
  ],
  'supply-demand': [
    {
      id: 'sd-anatomy',
      label: 'Zone Anatomy',
      src: '/strategies/supply-demand/ddb8f6331ad0c52206dac638da150260cd1cfc54.png',
      caption: 'Proximal entry line, distal invalidation boundary, and imbalance departure leg.',
    },
    {
      id: 'sd-types',
      label: 'RBD / DBR / RBR',
      src: '/strategies/supply-demand/9aa055db6909a932d1a125d710034a64a8be2f3c.png',
      caption:
        'Reversal and continuation base archetypes formed during institutional accumulation/distribution.',
    },
    {
      id: 'sd-entries',
      label: 'Entry Models',
      src: '/strategies/supply-demand/66471629f2f08ee8f9e7385d20268cd1643df450.png',
      caption: 'Comparing immediate proximal limit fills vs confirmation close entries.',
    },
    {
      id: 'sd-score',
      label: 'Strength Scoring',
      src: '/strategies/supply-demand/b4af9ea2d7206c3ea4d5cd28b6f4921e98c8ae11.png',
      caption: 'Grading freshness, departure speed, time-at-level, and risk-to-reward headroom.',
    },
    {
      id: 'sd-flow',
      label: 'Decision Flow',
      src: '/strategies/supply-demand/90f51a0cc6407576a755d45169a863a800828da0.png',
      caption: 'Algorithmic validation before alerting an unmitigated zone reaction.',
    },
    {
      id: 'sd-tf',
      label: 'TF Hierarchy',
      src: '/strategies/supply-demand/eac7cd0e59acf8042137f25df2d43adcd76c4c5b.png',
      caption: 'Nested curve analysis aligning HTF supply/demand walls with LTF execution.',
    },
    {
      id: 'sd-risk',
      label: 'Risk & Sizing',
      src: '/strategies/supply-demand/f33fb6f4a14fc65230f0b0adb3af21507ab37864.png',
      caption: 'Calculating stop width beyond distal boundaries with opposing target clearance.',
    },
    {
      id: 'sd-markets',
      label: 'Cross-Market',
      src: '/strategies/supply-demand/5f540dc34820adb571f5829c740537e39eb3a0a4.png',
      caption: 'Session liquidity nuances across major Forex crosses, XAUUSD, and large-cap equities.',
    },
  ],
  'trend-following': [],
};

const ALL_ENGINE_TABS: Array<{ id: OnboardingStrategyId; shortName: string }> = [
  { id: 'wick-rejection', shortName: 'Wick Rejection' },
  { id: 'breakout', shortName: 'Breakout' },
  { id: 'order-block', shortName: 'Order Block' },
  { id: 'supply-demand', shortName: 'Supply & Demand' },
  { id: 'trend-following', shortName: 'Trend Following' },
];

function classifySignalOutcome(status?: string): 'win' | 'loss' | 'open' {
  if (!status) return 'open';
  const s = status.toLowerCase();
  if (s === 'win' || s === 'tp_hit' || s === 'tp') return 'win';
  if (s === 'loss' || s === 'sl_hit' || s === 'sl') return 'loss';
  return 'open';
}

function normalizeJournalToId(raw?: string): OnboardingStrategyId | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/_/g, '-');
  if (cleaned.includes('wick')) return 'wick-rejection';
  if (cleaned.includes('breakout')) return 'breakout';
  if (cleaned.includes('order')) return 'order-block';
  if (cleaned.includes('supply') || cleaned.includes('demand')) return 'supply-demand';
  if (cleaned.includes('trend')) return 'trend-following';
  return null;
}

function SignalItemCard({ signal }: { signal: StoredSignal }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = signal.direction === 'BUY';
  const outcome = classifySignalOutcome(signal.status);

  return (
    <div className="bg-[#111113]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`px-2 py-0.5 rounded-md text-[12px] font-medium ${
              isBuy ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#F87171]/10 text-[#F87171]'
            }`}
          >
            {signal.direction}
          </span>
          <span className="font-medium text-[14px] text-[#FAFAFA]">{signal.symbol}</span>
          <span className="px-2 py-0.5 rounded-md bg-[#18181B] text-[12px] font-mono text-[#A1A1AA]">
            {signal.timeframe}
          </span>
          <span className="text-[12px] font-mono text-[#71717A] tabular-nums hidden sm:inline">
            {new Date(signal.time * 1000).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[13px] font-mono tabular-nums">
          <div className="hidden md:flex items-center gap-4 text-[#A1A1AA]">
            <span>
              E <strong className="text-[#FAFAFA] font-medium">{signal.entry}</strong>
            </span>
            <span>
              SL <strong className="text-[#F87171] font-medium">{signal.sl}</strong>
            </span>
            <span>
              TP <strong className="text-[#34D399] font-medium">{signal.tp}</strong>
            </span>
            <span>
              RR <strong className="text-[#FAFAFA] font-medium">{signal.rr?.toFixed(2) || '—'}x</strong>
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[12px] font-sans font-medium capitalize ${
              outcome === 'win'
                ? 'bg-[#34D399]/10 text-[#34D399]'
                : outcome === 'loss'
                ? 'bg-[#F87171]/10 text-[#F87171]'
                : 'bg-[#18181B] text-[#A1A1AA]'
            }`}
          >
            {signal.status || 'live'}
          </span>

          {expanded ? (
            <PiCaretUp size={16} className="text-[#71717A]" />
          ) : (
            <PiCaretDown size={16} className="text-[#71717A]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 py-4 border-t border-white/[0.06] bg-[#161619] space-y-3 text-[13px]">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div>
              <span className="text-[#71717A] block text-[12px]">Entry</span>
              <span className="font-mono tabular-nums text-[#FAFAFA]">{signal.entry}</span>
            </div>
            <div>
              <span className="text-[#71717A] block text-[12px]">Stop loss</span>
              <span className="font-mono tabular-nums text-[#F87171]">{signal.sl}</span>
            </div>
            <div>
              <span className="text-[#71717A] block text-[12px]">Take profit</span>
              <span className="font-mono tabular-nums text-[#34D399]">{signal.tp}</span>
            </div>
            <div>
              <span className="text-[#71717A] block text-[12px]">Confidence</span>
              <span className="font-mono tabular-nums text-[#FAFAFA]">{signal.confidence}%</span>
            </div>
            <div>
              <span className="text-[#71717A] block text-[12px]">Risk tier</span>
              <span className="text-[#A1A1AA]">{signal.risk}</span>
            </div>
          </div>

          {signal.reason && signal.reason.length > 0 && (
            <div className="pt-3 border-t border-white/[0.06] space-y-1 text-[#A1A1AA] max-w-[65ch]">
              {signal.reason.map((item, idx) => (
                <p key={idx} className="text-[13px] leading-relaxed">
                  • {item}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrendFollowingSchematic() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111113] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-[#FAFAFA]">
          EMA Stack &amp; Break of Structure Pullback Architecture
        </span>
        <span className="text-[12px] text-[#71717A]">Schematic model</span>
      </div>
      <div className="p-6 bg-[#09090B]">
        <svg
          viewBox="0 0 760 240"
          className="w-full h-auto"
          role="img"
          aria-label="Trend Following Architecture Diagram"
        >
          {[48, 96, 144, 192].map((y) => (
            <line key={y} x1="20" y1={y} x2="740" y2={y} stroke="#18181B" strokeWidth="1" />
          ))}

          <rect
            x="330"
            y="96"
            width="210"
            height="58"
            fill="#161619"
            stroke="#27272A"
            strokeDasharray="4 4"
          />
          <text x="342" y="114" fill="#71717A" fontSize="11" fontFamily="monospace">
            FIB 38.2% - 61.8% CORRIDOR
          </text>

          <path
            d="M 30 212 Q 360 194 730 156"
            fill="none"
            stroke="#52525B"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
          <text x="645" y="176" fill="#71717A" fontSize="11" fontFamily="monospace">
            EMA 200
          </text>

          <path d="M 30 192 Q 350 154 730 108" fill="none" stroke="#A1A1AA" strokeWidth="1.5" />
          <text x="645" y="102" fill="#A1A1AA" fontSize="11" fontFamily="monospace">
            EMA 50
          </text>

          <path d="M 30 174 Q 320 122 730 68" fill="none" stroke="#FAFAFA" strokeWidth="1.5" />
          <text x="645" y="60" fill="#FAFAFA" fontSize="11" fontFamily="monospace">
            EMA 20
          </text>

          <line
            x1="210"
            y1="88"
            x2="540"
            y2="88"
            stroke="#34D399"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text x="215" y="80" fill="#34D399" fontSize="11" fontFamily="monospace">
            BOS (BREAK OF STRUCTURE)
          </text>

          <polyline
            points="40,185 130,132 185,152 290,74 375,112 430,138 515,92 670,38"
            fill="none"
            stroke="#34D399"
            strokeWidth="2.5"
          />

          <circle cx="430" cy="138" r="5" fill="#34D399" />
          <text x="442" y="142" fill="#34D399" fontSize="11" fontFamily="monospace" fontWeight="600">
            PULLBACK TRIGGER
          </text>

          <line
            x1="360"
            y1="168"
            x2="510"
            y2="168"
            stroke="#F87171"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text x="364" y="182" fill="#F87171" fontSize="11" fontFamily="monospace">
            SL BELOW SWING ORIGIN
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const resolvedId: OnboardingStrategyId =
    strategyId && strategyId in STRATEGY_SPECS
      ? (strategyId as OnboardingStrategyId)
      : 'wick-rejection';

  const spec = STRATEGY_SPECS[resolvedId];
  const diagrams = STRATEGY_DIAGRAMS[resolvedId] ?? [];

  const [activeTab, setActiveTab] = useState<'blueprint' | 'tuning' | 'signals'>('blueprint');

  const { selectedStrategyIds, toggleSelectedStrategy } = useOnboardingStore();
  const isEngineEnabled = selectedStrategyIds.includes(resolvedId);

  const signals = useAnalysisSignalStore((s) => s.signals);
  const clearSignals = useAnalysisSignalStore((s) => s.clearSignals);
  const journal = useTradingContextStore((s) => s.journal);
  const { status: optimizerStatus } = useStrategyOptimizer();

  const strategySignals = useMemo(
    () =>
      signals.filter((sig) => normalizeJournalToId(sig.strategyId || sig.strategyLabel) === resolvedId),
    [signals, resolvedId]
  );

  const telemetry = useMemo(() => {
    let wins = 0;
    let losses = 0;
    const seen = new Set<string>();

    for (const s of strategySignals) {
      const outcome = classifySignalOutcome(s.status);
      if (outcome === 'win') {
        wins += 1;
        seen.add(s.id);
      } else if (outcome === 'loss') {
        losses += 1;
        seen.add(s.id);
      }
    }

    for (const j of journal) {
      if (j.outcome !== 'win' && j.outcome !== 'loss') continue;
      if (j.suggestionKey && seen.has(j.suggestionKey)) continue;
      if (normalizeJournalToId(j.strategy) !== resolvedId) continue;
      if (j.outcome === 'win') wins += 1;
      if (j.outcome === 'loss') losses += 1;
    }

    const resolved = wins + losses;
    const winRate = resolved > 0 ? (wins / resolved) * 100 : null;

    const factory = optimizerStatus?.factoryDefaults?.[spec.snakeId] ?? {};
    const learned = optimizerStatus?.learnedParameters?.[spec.snakeId] ?? {};
    const paramEntries = Object.entries(factory);
    let ratioSum = 0;
    let ratioCount = 0;
    let modified = 0;
    for (const [k, defVal] of paramEntries) {
      const liveVal = typeof learned[k] === 'number' ? learned[k] : defVal;
      if (Math.abs(liveVal - defVal) > 0.001) modified += 1;
      if (defVal !== 0) {
        ratioSum += liveVal / defVal;
        ratioCount += 1;
      }
    }

    return {
      detected: strategySignals.length,
      wins,
      losses,
      resolved,
      winRate,
      multiplier: ratioCount > 0 ? ratioSum / ratioCount : 1,
      modifiedParams: modified,
      totalParams: paramEntries.length,
    };
  }, [strategySignals, journal, resolvedId, optimizerStatus, spec]);

  const clearCurrentStrategySignals = () => {
    clearSignals();
  };

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Top Engine Switcher & Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 min-w-0 max-w-full">
            <Link
              to="/strategies"
              className="h-9 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
            >
              <PiArrowLeft size={14} />
              Strategies
            </Link>

            <div className="inline-flex max-w-full items-center gap-1 p-1 rounded-full bg-[#111113] border border-white/[0.07] overflow-x-auto">
              {ALL_ENGINE_TABS.map((item) => {
                const active = item.id === resolvedId;
                return (
                  <Link
                    key={item.id}
                    to={`/strategies/${item.id}`}
                    className={`px-3 py-1 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                        : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                    }`}
                  >
                    {item.shortName}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={isEngineEnabled}
              onClick={() => toggleSelectedStrategy(resolvedId)}
              className={`h-9 px-3.5 rounded-xl text-[13px] font-medium border inline-flex items-center gap-2 transition-colors ${
                isEngineEnabled
                  ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/25 hover:bg-[#34D399]/15'
                  : 'bg-[#18181B] text-[#A1A1AA] border-white/[0.08] hover:text-[#FAFAFA]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isEngineEnabled ? 'bg-[#34D399]' : 'bg-[#71717A]'
                }`}
              />
              {isEngineEnabled ? 'Engine active' : 'Engine paused'}
            </button>

            <Link
              to={`/backtesting?strategy=${resolvedId}`}
              className="h-9 px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <PiChartBar size={14} />
              Backtest
            </Link>
          </div>
        </div>

        {/* Visual Banner + Telemetry Card */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-[12px] font-medium text-[#71717A]">
                  <span>{spec.category}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <PiClock size={13} />
                    {spec.timeframe}
                  </span>
                </div>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] leading-[1.15] text-[#FAFAFA]">
                  {spec.name}
                </h1>
                <p className="text-[14px] text-[#A1A1AA] max-w-[65ch] leading-relaxed">
                  {spec.tagline}
                </p>
              </div>

              <p className="text-[12.5px] text-[#71717A]">
                Optimal killzones: <span className="text-[#A1A1AA]">{spec.idealSessions}</span>
              </p>
            </div>

            <div className="lg:col-span-5 relative aspect-video lg:aspect-auto min-h-[210px] bg-[#111113] overflow-hidden">
              <img
                src={spec.bannerSrc}
                alt={`${spec.name} visual architecture`}
                className="w-full h-full object-cover [mask-image:linear-gradient(to_bottom,transparent_0%,black_26%,black_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_26%,black_100%)] lg:[mask-image:linear-gradient(to_left,black_62%,transparent_100%)] lg:[-webkit-mask-image:linear-gradient(to_left,black_62%,transparent_100%)]"
              />
            </div>
          </div>

          <div className="border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
            <div className="p-5">
              <span className="text-[12px] font-medium text-[#71717A]">Detected signals</span>
              <p className="text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
                {telemetry.detected}
              </p>
            </div>

            <div className="p-5 !border-t-0">
              <span className="text-[12px] font-medium text-[#71717A]">Resolved trades</span>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-[22px] font-mono font-semibold tabular-nums text-[#FAFAFA]">
                  {telemetry.resolved}
                </p>
                <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                  {telemetry.wins}W / {telemetry.losses}L
                </span>
              </div>
            </div>

            <div className="p-5">
              <span className="text-[12px] font-medium text-[#71717A]">Win rate</span>
              <p
                className={`text-[22px] font-mono font-semibold tabular-nums mt-1 ${
                  telemetry.winRate === null
                    ? 'text-[#71717A]'
                    : telemetry.winRate >= 50
                    ? 'text-[#34D399]'
                    : 'text-[#F87171]'
                }`}
              >
                {telemetry.winRate !== null ? `${telemetry.winRate.toFixed(1)}%` : '—'}
              </p>
            </div>

            <div className="p-5">
              <span className="text-[12px] font-medium text-[#71717A]">Adaptive multiplier</span>
              <div className="flex items-baseline gap-2 mt-1">
                <p
                  className={`text-[22px] font-mono font-semibold tabular-nums ${
                    telemetry.modifiedParams > 0 ? 'text-[#34D399]' : 'text-[#FAFAFA]'
                  }`}
                >
                  {telemetry.multiplier.toFixed(2)}x
                </p>
                <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                  {telemetry.modifiedParams}/{telemetry.totalParams} tuned
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace Mode Tabs */}
        <div className="inline-flex max-w-full items-center gap-1 p-1 rounded-full bg-[#111113] border border-white/[0.07] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('blueprint')}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
              activeTab === 'blueprint'
                ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
            }`}
          >
            Specification &amp; rules
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tuning')}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'tuning'
                ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
            }`}
          >
            <PiSlidersHorizontal size={14} />
            Tuning &amp; calculators
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('signals')}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-2 transition-colors ${
              activeTab === 'signals'
                ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
            }`}
          >
            Signal stream
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-mono tabular-nums ${
                activeTab === 'signals'
                  ? 'bg-[#09090B]/15 text-[#09090B]'
                  : 'bg-[#18181B] text-[#A1A1AA]'
              }`}
            >
              {strategySignals.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Specification, Entry/Invalidation Rules & Diagrams */}
        {activeTab === 'blueprint' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Overview & Entry Checkpoints */}
              <div className="lg:col-span-7 rounded-2xl bg-[#111113] border border-white/[0.07] p-6 sm:p-8 space-y-6">
                <div className="space-y-2.5">
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                    Algorithmic architecture
                  </h2>
                  <p className="text-[14px] text-[#A1A1AA] leading-relaxed max-w-[65ch]">
                    {spec.overview}
                  </p>
                </div>

                <div className="pt-6 border-t border-white/[0.06] space-y-3">
                  <h3 className="text-[14px] font-medium text-[#34D399] inline-flex items-center gap-2">
                    <PiTarget size={15} />
                    Entry qualification gates
                  </h3>
                  <ul className="divide-y divide-white/[0.06]">
                    {spec.entryCheckpoints.map((rule, idx) => (
                      <li key={idx} className="py-3.5 first:pt-1 last:pb-0 flex items-start gap-3.5">
                        <span className="font-mono tabular-nums text-[12px] text-[#34D399] mt-0.5 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[14px] leading-relaxed text-[#FAFAFA]/90 max-w-[65ch]">
                          {rule}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Invalidation & Target Specification */}
              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 space-y-3">
                  <h3 className="text-[16px] font-medium text-[#F87171] inline-flex items-center gap-2">
                    <PiShieldCheck size={16} />
                    Invalidation &amp; stop-loss rules
                  </h3>
                  <ul className="divide-y divide-white/[0.06]">
                    {spec.invalidationRules.map((rule, idx) => (
                      <li
                        key={idx}
                        className="py-3 first:pt-1 last:pb-0 text-[14px] text-[#A1A1AA] leading-relaxed max-w-[65ch]"
                      >
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 space-y-4">
                  <h3 className="text-[16px] font-medium text-[#FAFAFA]">
                    Take-profit &amp; risk envelope
                  </h3>
                  <div className="rounded-xl bg-[#161619] p-4 space-y-1.5">
                    <p className="text-[12px] font-medium text-[#34D399]">Target architecture</p>
                    <p className="text-[14px] text-[#A1A1AA] leading-relaxed max-w-[65ch]">
                      {spec.takeProfitLogic}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#161619] p-4 space-y-1.5">
                    <p className="text-[12px] font-medium text-[#71717A]">Allocation guideline</p>
                    <p className="text-[14px] text-[#FAFAFA] leading-relaxed max-w-[65ch]">
                      {spec.riskModel}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Diagrams / Schematic Reference */}
            <div className="space-y-4">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                Structural visual reference
              </h2>
              {diagrams.length > 0 ? (
                <DiagramCarousel key={resolvedId} items={diagrams} />
              ) : (
                <TrendFollowingSchematic />
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Optimizer Parameter Readout, Calculators & Scorer */}
        {activeTab === 'tuning' && (
          <div className="space-y-6">
            <AdaptiveFeedbackWidget strategyId={resolvedId} />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-5">
                <PositionSizeCalculator />
              </div>
              <div className="xl:col-span-7">
                <SetupScoreEvaluator />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Live Strategy Signal Telemetry */}
        {activeTab === 'signals' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                  Detected {spec.name} signals
                </h2>
                <p className="text-[13px] text-[#71717A] mt-0.5">
                  Setups recorded during live scanner cycles in this workspace session.
                </p>
              </div>

              {strategySignals.length > 0 && (
                <button
                  type="button"
                  onClick={clearCurrentStrategySignals}
                  className="h-9 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-[#F87171]/40 hover:text-[#F87171] text-[13px] font-medium text-[#A1A1AA] inline-flex items-center gap-1.5 transition-colors"
                >
                  <PiTrash size={14} />
                  Clear signal cache
                </button>
              )}
            </div>

            {strategySignals.length === 0 ? (
              <div className="py-14 px-6 rounded-2xl bg-[#111113] border border-white/[0.07] text-center space-y-4">
                <img
                  src="/brand/empty-signals.png"
                  alt="No active strategy signals"
                  className="w-full max-w-[300px] mx-auto rounded-xl opacity-90"
                />
                <div className="space-y-1.5">
                  <p className="text-[16px] font-medium text-[#FAFAFA]">
                    No {spec.name} signals detected yet
                  </p>
                  <p className="text-[14px] text-[#71717A] max-w-[50ch] mx-auto leading-relaxed">
                    Keep this engine active while the live scanner runs, or simulate historical setups in the Backtesting Workbench.
                  </p>
                </div>
                <Link
                  to={`/backtesting?strategy=${resolvedId}`}
                  className="inline-flex h-9 px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-semibold items-center gap-1.5 transition-colors"
                >
                  <PiChartBar size={14} />
                  Run historical simulation
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden divide-y divide-white/[0.05]">
                {strategySignals.map((sig) => (
                  <SignalItemCard key={sig.id} signal={sig} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
