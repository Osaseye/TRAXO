import { Link, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, ShieldAlert, BookOpen, Compass, Code, Settings as SettingsIcon, Layers } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DiagramCarousel } from '@/components/strategies/DiagramCarousel'
import { PositionSizeCalculator } from '@/components/strategies/PositionSizeCalculator'
import { SetupScoreEvaluator } from '@/components/strategies/SetupScoreEvaluator'

const STRATEGY_DETAILS: Record<string, {
  name: string
  overview: string
  entry: string[]
  avoid: string[]
  risk: string
}> = {
  'wick-rejection': {
    name: 'Wick Rejection',
    overview:
      'A price-action reversal framework where a long wick at a key level reveals failed continuation and aggressive counter-order flow.',
    entry: [
      'Require wick-to-body ratio >= 2:1 (3:1 is strongest).',
      'Wick must test support or resistance, liquidity sweep, or major psychological level.',
      'Wait for confirmation candle close in reversal direction.',
    ],
    avoid: [
      'Do not trade isolated wicks in middle-of-range chop.',
      'Avoid pre-news and low-liquidity sessions where wicks are unreliable.',
    ],
    risk: 'Stops must be beyond wick tip plus volatility buffer (ATR-based), with fixed risk sizing and multi-target exits.',
  },
  breakout: {
    name: 'Breakout',
    overview: 'Designed for compressed ranges that release into expansion with directional conviction.',
    entry: [
      'Identify at least 3 touches in a clean compression range.',
      'Require body close beyond boundary with momentum candle.',
      'Use retest entry if first break is over-extended.',
    ],
    avoid: ['Avoid first fake break in choppy sessions.', 'Skip if breakout happens directly into weekly level.'],
    risk: 'Risk performs best with reduced size after two failed breakouts in a row.',
  },
  'order-block': {
    name: 'Order Block',
    overview: 'Finds institutional footprints and re-entry points around the last opposing candle before impulsive move.',
    entry: [
      'Anchor order block on clean impulse displacement candle sequence.',
      'Wait for revisit plus rejection confirmation candle.',
      'Use structure break to validate directional bias.',
    ],
    avoid: ['Do not force entries in broad noisy consolidation.', 'Avoid blocks that are too old and repeatedly tapped.'],
    risk: 'Keep risk fixed and reduce frequency; this strategy is quality over quantity.',
  },
  'supply-demand': {
    name: 'Supply & Demand',
    overview: 'Uses imbalance zones where large participation likely remains unfilled for reaction trades.',
    entry: [
      'Mark fresh zones with clean departure and imbalance.',
      'Wait for first return to zone with momentum slowdown.',
      'Only take entries aligned with higher timeframe bias.',
    ],
    avoid: ['Skip second or third revisit to same zone.', 'Avoid zones formed during thin liquidity periods.'],
    risk: 'Favors asymmetric targets with strict invalidation just beyond zone edge.',
  },
  'trend-following': {
    name: 'Trend Following',
    overview: 'Built for continuation opportunities by entering pullbacks in established directional structure.',
    entry: [
      'Confirm trend with sequence of higher highs/lows or lower highs/lows.',
      'Wait for pullback into dynamic support/resistance.',
      'Trigger entry only after momentum re-acceleration candle.',
    ],
    avoid: ['Avoid late entries far from pullback zone.', 'Skip if market is transitioning to range.'],
    risk: 'Use scaling model: partial at 1R and trail stop using structure.',
  },
}

const WICK_IMAGES = [
  {
    id: 'anatomy',
    label: 'Candlestick Anatomy',
    src: '/strategies/wick-rejection/1.png',
    caption: 'Candlestick components: open, close, high, low, body, and rejection wicks signifying failed price expansion.',
  },
  {
    id: 'ratio',
    label: 'Ratio Strength Classifier',
    src: '/strategies/wick-rejection/5.png',
    caption: 'Wick-to-body classification: weak (<1:1), moderate (1.5:1), strong (2:1), and ideal (3:1+) indicating institutional presence.',
  },
  {
    id: 'bullish',
    label: 'Bullish Setup Sequence',
    src: '/strategies/wick-rejection/2.png',
    caption: 'Bullish wick rejection setup at support/liquidity sweep. Includes confirmation candle, stop loss buffer, and profit targets.',
  },
  {
    id: 'bearish',
    label: 'Bearish Setup Sequence',
    src: '/strategies/wick-rejection/3.png',
    caption: 'Bearish wick rejection setup at resistance/liquidity sweep. Includes confirmation candle, stop loss buffer, and profit targets.',
  },
  {
    id: 'flowchart',
    label: 'Algorithmic Flowchart',
    src: '/strategies/wick-rejection/6.png',
    caption: 'Algorithmic processing flow: measuring wick ratio, testing levels, trend alignment, volume confirmation, and risk execution gates.',
  },
  {
    id: 'mtf',
    label: 'Multi-Timeframe Structure',
    src: '/strategies/wick-rejection/4.png',
    caption: 'Top-down timeframe alignment: Daily defines macro bias, 4H structures provide key levels, 15m/1H charts capture trigger signals.',
  },
]

function WickRejectionTabs() {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid grid-cols-5 w-full bg-[#0d1117] border border-white/[0.08] p-1 rounded-xl">
        <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2">
          <BookOpen size={12} className="shrink-0" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="rules" className="flex items-center gap-1.5 py-2">
          <Compass size={12} className="shrink-0" />
          <span className="hidden sm:inline">Technical Rules</span>
        </TabsTrigger>
        <TabsTrigger value="execution" className="flex items-center gap-1.5 py-2">
          <Layers size={12} className="shrink-0" />
          <span className="hidden sm:inline">Execution Guide</span>
        </TabsTrigger>
        <TabsTrigger value="risk" className="flex items-center gap-1.5 py-2">
          <Code size={12} className="shrink-0" />
          <span className="hidden sm:inline">Risk & Math</span>
        </TabsTrigger>
        <TabsTrigger value="planner" className="flex items-center gap-1.5 py-2 text-primary data-[state=active]:bg-primary/20">
          <SettingsIcon size={12} className="shrink-0 text-primary" />
          <span className="hidden sm:inline font-bold">Trade Planner</span>
        </TabsTrigger>
      </TabsList>

      {/* OVERVIEW TAB */}
      <TabsContent value="overview" className="space-y-4 focus-visible:ring-0">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">In Plain English</p>
          <p className="mt-2 text-[13px] text-[#cbd5e1] leading-relaxed">
            Wick Rejection is a way to spot when price tries to break through an important level but fails quickly, leaving a long wick behind. That long wick often means bigger traders stepped in and pushed price back the other way, so instead of chasing the fake breakout, the strategy waits for a confirmation candle and then enters in the reversal direction with a stop just beyond the wick and targets at the next key levels.
          </p>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Document Scope</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] text-[#cbd5e1]">
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white">Markets Covered</p>
              <p className="mt-1 text-text-muted">Forex, Crypto, Stocks, Futures, Commodities</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white">Timeframes Covered</p>
              <p className="mt-1 text-text-muted">1m, 3m, 5m, 15m, 30m, 1H, 4H, Daily, Weekly</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white">Core Definition</p>
              <p className="mt-1 text-text-muted">A wick rejection forms when price aggressively tests a key level, then closes far from the extreme due to opposing force dominance.</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-[#e5e7eb] mb-3">Candlestick Components (Complete)</p>
            <div className="space-y-2 text-[12px] text-[#cbd5e1]">
              <p><span className="text-white font-semibold">Open:</span> starting price of the period.</p>
              <p><span className="text-white font-semibold">Close:</span> ending price of the period (most important).</p>
              <p><span className="text-white font-semibold">High:</span> highest traded price in the period.</p>
              <p><span className="text-white font-semibold">Low:</span> lowest traded price in the period.</p>
              <p><span className="text-white font-semibold">Body:</span> distance between open and close.</p>
              <p><span className="text-white font-semibold">Upper Wick:</span> rejection from higher prices.</p>
              <p><span className="text-white font-semibold">Lower Wick:</span> rejection from lower prices.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 flex flex-col justify-between">
            <div>
              <p className="text-[12px] font-semibold text-[#e5e7eb] mb-3">Market Psychology and Liquidity Sweep</p>
              <div className="space-y-2 text-[12px] text-[#cbd5e1]">
                <p>Institutions seek liquidity pools to fill large size without excessive slippage.</p>
                <p>Typical sequence: sweep support/resistance, trigger stops and breakout entries, absorb flow, reverse price.</p>
                <p>Trapped participants (breakout traders and stop-hunted traders) provide reversal fuel.</p>
                <p>Liquidity sweep context converts a wick from random candle noise to institutional footprint evidence.</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-text-muted">
              Trading wick rejection means aligning with post-sweep order flow rather than chasing the failed breakout leg.
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-success mb-2">Bullish Rejection Pattern Set</p>
            <div className="space-y-2 text-[12px] text-[#cbd5e1]">
              <p>• Hammer</p>
              <p>• Bullish Pin Bar</p>
              <p>• Bullish Engulfing with Rejection Wick</p>
              <p>• Dragonfly Doji</p>
              <p>• Long Lower Wick Candle</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-danger mb-2">Bearish Rejection Pattern Set</p>
            <div className="space-y-2 text-[12px] text-[#cbd5e1]">
              <p>• Shooting Star</p>
              <p>• Bearish Pin Bar</p>
              <p>• Inverted Hammer at Resistance</p>
              <p>• Gravestone Doji</p>
              <p>• Long Upper Wick Candle</p>
            </div>
          </div>
        </section>
      </TabsContent>

      {/* TECHNICAL RULES TAB */}
      <TabsContent value="rules" className="space-y-4 focus-visible:ring-0">
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-[#e5e7eb] mb-3">Core Identification Rules</p>
            <div className="space-y-2.5 text-[13px] text-[#cbd5e1]">
              {[
                'Wick-to-body ratio must be at least 2:1, ideally 3:1 or more.',
                'Wick tip must test a meaningful level: support/resistance, supply/demand, prior highs/lows, or round number.',
                'Candle close must snap back away from wick extreme, proving rejection.',
                'Direction context: lower wick at support for longs, upper wick at resistance for shorts.',
                'Higher timeframe bias should align with expected reversal direction.',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 text-success shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-[#fca5a5] mb-3">Disqualifying Conditions</p>
            <div className="space-y-2.5 text-[13px] text-[#fca5a5]">
              {[
                'Wick forms in low-volume, dead session conditions.',
                'Pattern appears in center of noisy range with no level significance.',
                'Major news release is imminent (15 to 30 minutes).',
                'Wick ratio is below 1.5:1 or level has been repeatedly weakened.',
                'Setup strongly contradicts higher timeframe structure without shift confirmation.',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <ShieldAlert size={14} className="mt-0.5 text-danger shrink-0 animate-pulse" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-3">Wick-to-Body Ratio Classification</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 text-[12px] text-[#cbd5e1]">
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-center">
              <span className="block font-bold text-text-muted">&lt; 1:1</span>
              <span className="text-[11px] text-text-muted">Weak, skip</span>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-center">
              <span className="block font-bold text-warning">1.0 - 1.5</span>
              <span className="text-[11px] text-text-muted">Marginal, needs heavy confluence</span>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-center">
              <span className="block font-bold text-primary-light">1.5 - 2.0</span>
              <span className="text-[11px] text-text-muted">Moderate, selective</span>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-center">
              <span className="block font-bold text-success">2.0 - 3.0</span>
              <span className="text-[11px] text-text-muted">Strong, high probability</span>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-center bg-success/5 border-success/20">
              <span className="block font-bold text-success font-mono">3.0+</span>
              <span className="text-[11px] text-success-light">Ideal, institutional-grade</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-2">Algorithmic Decision Rules</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
            {[
              'Measure candle: body, upper wick, lower wick, dominant wick.',
              'Filter 1: reject if wick ratio < 2.0.',
              'Filter 2: reject if wick tip is farther than 0.3 x ATR from nearest key level.',
              'Bias check: downgrade if setup fights HTF trend; upgrade if aligned.',
              'Volume check: boost confidence if volume > 1.5x 20-period average.',
              'Confirmation: next candle must close in reversal direction.',
              'Score setup using objective points before execution.',
              'Trade only if score threshold is met and risk constraints permit.',
            ].map((line, idx) => (
              <div key={idx} className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 flex gap-2">
                <span className="font-mono text-primary font-bold">{idx + 1}.</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-3">Algorithm Inputs (Engineering Spec)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] text-[#cbd5e1]">
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1">
              <p className="font-semibold text-white mb-1 pb-1 border-b border-white/[0.05]">Price Data</p>
              <p className="text-text-muted">• OHLCV current candle</p>
              <p className="text-text-muted">• OHLCV lookback (50-200)</p>
              <p className="text-text-muted">• HTF OHLCV context</p>
              <p className="text-text-muted">• ATR(14) volatility</p>
              <p className="text-text-muted">• Volume MA(20)</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1">
              <p className="font-semibold text-white mb-1 pb-1 border-b border-white/[0.05]">Key Levels</p>
              <p className="text-text-muted">• Support/Resistance pivots</p>
              <p className="text-text-muted">• Supply/Demand zones</p>
              <p className="text-text-muted">• Round numbers / Psychological</p>
              <p className="text-text-muted">• EMA/SMA dynamic levels</p>
              <p className="text-text-muted">• Fibonacci 0.618 / 0.786</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1">
              <p className="font-semibold text-white mb-1 pb-1 border-b border-white/[0.05]">Context Filters</p>
              <p className="text-text-muted">• HTF trend direction</p>
              <p className="text-text-muted">• Session timing (London/NY)</p>
              <p className="text-text-muted">• High-impact news proximity</p>
              <p className="text-text-muted">• Market state: range vs. trend</p>
            </div>
          </div>
        </section>
      </TabsContent>

      {/* EXECUTION TAB */}
      <TabsContent value="execution" className="space-y-4 focus-visible:ring-0">
        {/* DIAGRAM CAROUSEL */}
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Visual Library</p>
          <DiagramCarousel items={WICK_IMAGES} />
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-3">Entry, Stop, and Target Framework</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white mb-1">Entry Styles</p>
              <p className="text-text-muted"><span className="text-white font-bold">Aggressive:</span> close of rejection candle.</p>
              <p className="text-text-muted"><span className="text-white font-bold">Standard:</span> close of confirmation candle.</p>
              <p className="text-text-muted"><span className="text-white font-bold">Limit:</span> retrace into rejection block (50 to 75% of wick).</p>
              <p className="text-text-muted"><span className="text-white font-bold">Conservative:</span> break of local structure in reversal direction.</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white mb-1">Risk & Exits</p>
              <p className="text-text-muted">• Stop must be beyond wick tip with ATR buffer.</p>
              <p className="text-text-muted">• TP1 at 1.5R, TP2 at 2.5R, TP3 at 4R+ structural levels.</p>
              <p className="text-text-muted">• Move stop to breakeven after TP1, then trail by structure.</p>
              <p className="text-text-muted">• Time Exit: if price stalls for 3 to 5 candles, reduce or exit.</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-white mb-3">Stop Placement Scenarios</p>
            <div className="space-y-2 text-[12px] text-[#cbd5e1]">
              <p>• <span className="font-semibold text-white">Long Setup:</span> stop = wick low - buffer</p>
              <p>• <span className="font-semibold text-white">Short Setup:</span> stop = wick high + buffer</p>
              <p>• <span className="font-semibold text-white">Default Buffer:</span> 0.1 x ATR (or 5-10 pips minimum)</p>
              <p>• <span className="font-semibold text-white">ICT Rejection Block:</span> stop beyond original wick extreme</p>
              <p>• <span className="font-semibold text-white">High Volatility:</span> use wider buffer (e.g. 0.25 x ATR)</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-white mb-3">Timeframe Application Guide</p>
            <div className="space-y-1.5 text-[12px] text-[#cbd5e1]">
              <p><span className="font-semibold text-white">Weekly/Daily:</span> major structural bias and level validation.</p>
              <p><span className="font-semibold text-white">4H / 1H:</span> core swing structure and local trend definition.</p>
              <p><span className="font-semibold text-white">15m / 30m:</span> refined execution trigger setups.</p>
              <p><span className="font-semibold text-white">1m / 3m / 5m:</span> execution-only trigger layer, never standalone bias.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-3">Cross-Market Application Notes</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white mb-1">Forex</p>
              <p className="text-text-muted">Best quality appears around London and New York opens at major levels and round numbers. Standard ATR parameters are stable.</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white mb-1">Crypto</p>
              <p className="text-text-muted">Wicks are frequently stretched by leverage cascades. Requires larger stop-loss buffers and exchange-aggregate level sweeps.</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white mb-1">Stocks & Futures</p>
              <p className="text-text-muted">Best during regular trading hours (RTH). Rejection of opening range high/low is a highly reliable intraday playbook.</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
              <p className="font-semibold text-white mb-1">Order Flow Overlap</p>
              <p className="text-text-muted">Combine candle wicks with Volume Profile Point of Control (POC), VWAP taps, or order book delta imbalances.</p>
            </div>
          </div>
        </section>
      </TabsContent>

      {/* RISK & MATH TAB */}
      <TabsContent value="risk" className="space-y-4 focus-visible:ring-0">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-2">Processing Logic and Formula Layer</p>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-4 text-[12px] text-primary-light space-y-1.5 font-mono">
            <p>Body_Size = |Close - Open|</p>
            <p>Upper_Wick = High - max(Open, Close)</p>
            <p>Lower_Wick = min(Open, Close) - Low</p>
            <p>Wick_Ratio = max(Upper_Wick, Lower_Wick) / Body_Size</p>
            <p>Dominant_Wick = LOWER if Lower_Wick &gt; Upper_Wick else UPPER</p>
            <p>Level_Distance = |Wick_Tip - Nearest_Key_Level|</p>
            <p className="text-text-muted pt-1 border-t border-white/[0.05]">// Filter criteria</p>
            <p>Reject if Wick_Ratio &lt; 2.0</p>
            <p>Reject if Level_Distance &gt; 0.3 x ATR(14)</p>
            <p>Volume_Spike = Volume[current] &gt; 1.5 x Volume_MA(20)</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white mb-3">Risk Management Protocols</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1">
              <p className="font-semibold text-white mb-1">Risk Allocation Caps</p>
              <p className="text-text-muted">• High confidence (8+): up to 1.5% account size</p>
              <p className="text-text-muted">• Moderate confidence (6-7): 0.5% to 1.0% size</p>
              <p className="text-text-muted">• Low confidence (4-5): 0.25% size or skip</p>
              <p className="text-text-muted">• Maximum aggregate trade risk limit: 5% to 6%</p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1">
              <p className="font-semibold text-white mb-1">Drawdown Mitigation Rules</p>
              <p className="text-text-muted">• Daily Drawdown Stop: pause trading at 3%</p>
              <p className="text-text-muted">• Weekly Drawdown Review: pause at 6%</p>
              <p className="text-text-muted">• Deficit Scaling: reduce risk by 50% after 3 consecutive losses</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <p className="text-[12px] font-semibold text-white mb-2">Expectancy and Performance Envelope</p>
            <div className="space-y-2 text-[12px] text-[#cbd5e1]">
              <p>• <span className="font-semibold text-white">Expected Win Rate:</span> 55% to 65% under strict rules.</p>
              <p>• <span className="font-semibold text-white">Average Risk-to-Reward:</span> 1:2 to 1:3.</p>
              <p className="mt-3 p-2 bg-[#0b0f17] rounded border border-white/[0.04] text-[11px] font-mono leading-relaxed">
                Expectancy = (Win Rate x Avg Win) - (Loss Rate x Avg Loss)
                <span className="block text-primary-light mt-1">Example: 60% Win, 1:2 RR =&gt; (0.60 x 2) - (0.40 x 1) = +0.80R expectancy per trade.</span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 flex flex-col justify-between">
            <div>
              <p className="text-[12px] font-semibold text-white mb-2">Backtesting Protocol</p>
              <div className="space-y-1 text-[12px] text-[#cbd5e1]">
                <p>1. Isolate one asset and trade session (e.g., EURUSD NY RTH).</p>
                <p>2. Catalog 100 consecutive setup occurrences.</p>
                <p>3. Log maximum adverse excursion (MAE) and win/loss tags.</p>
                <p>4. Factor in execution spreads and commissions.</p>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-text-muted">
              Suggested validation tools: TradingView Pine Script, Python Backtrader/Pandas.
            </div>
          </div>
        </section>
      </TabsContent>

      {/* PLANNER TAB */}
      <TabsContent value="planner" className="space-y-4 focus-visible:ring-0">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-6">
            <SetupScoreEvaluator />
          </div>
          <div className="xl:col-span-6">
            <PositionSizeCalculator />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}

export default function StrategyDetail() {
  const { strategyId } = useParams()
  const details = strategyId ? STRATEGY_DETAILS[strategyId] : undefined

  if (!details) {
    return (
      <div className="min-h-screen bg-[#070709] text-white p-6">
        <p className="text-[#cbd5e1]">Strategy not found.</p>
        <Link to="/strategies" className="inline-flex items-center gap-2 text-[13px] text-[#93c5fd] mt-3">
          <ArrowLeft size={14} /> Back to strategies
        </Link>
      </div>
    )
  }

  const isWickRejection = strategyId === 'wick-rejection'

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/strategies" className="w-8 h-8 rounded-lg border border-white/[0.12] flex items-center justify-center text-[#cbd5e1] hover:text-white transition-colors">
            <ArrowLeft size={14} />
          </Link>
          <h1 className="text-[14px] font-semibold">{details.name}</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {/* Header Hero Card */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6 relative overflow-hidden shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_45%)]" />
          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-[0.16em] text-primary-light font-bold">Framework Summary</p>
            <h2 className="text-[clamp(1.3rem,3vw,1.9rem)] font-extrabold mt-1.5">{details.name}</h2>
            <p className="text-[13px] text-[#cbd5e1] mt-2 max-w-4xl leading-relaxed">{details.overview}</p>
          </div>
        </section>

        {isWickRejection ? (
          <WickRejectionTabs />
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="inline-flex bg-[#0d1117] border border-white/[0.08] p-1 rounded-xl">
              <TabsTrigger value="overview" className="py-1.5">Overview</TabsTrigger>
              <TabsTrigger value="planner" className="py-1.5 text-primary data-[state=active]:bg-primary/20">Position Size Planner</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-2 gap-4 focus-visible:ring-0">
              <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
                <p className="text-[12px] font-semibold text-[#e5e7eb] mb-3">Execution Checklist</p>
                <div className="space-y-2.5">
                  {details.entry.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[13px] text-[#cbd5e1]">
                      <CheckCircle2 size={14} className="text-[#86efac] mt-0.5 shrink-0" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
                <p className="text-[12px] font-semibold text-[#e5e7eb] mb-3">Avoid Conditions</p>
                <div className="space-y-2.5">
                  {details.avoid.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[13px] text-[#fca5a5]">
                      <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
                  <span className="font-semibold text-white">Risk Profile:</span> {details.risk}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="planner" className="max-w-xl focus-visible:ring-0">
              <PositionSizeCalculator />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
