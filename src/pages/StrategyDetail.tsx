import { Link, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'

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

const WICK_IMAGES = {
  cover: '/strategies/wick-rejection/wick-rejection.png',
  anatomy: '/strategies/wick-rejection/1.png',
  bullish: '/strategies/wick-rejection/2.png',
  bearish: '/strategies/wick-rejection/3.png',
  mtf: '/strategies/wick-rejection/4.png',
  ratio: '/strategies/wick-rejection/5.png',
  flow: '/strategies/wick-rejection/6.png',
} as const

function WickRejectionLongForm() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
        <img src={WICK_IMAGES.cover} alt="Wick Rejection strategy cover" className="w-full h-[240px] sm:h-[340px] object-cover" />
        <div className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Wick Rejection Research Framework</p>
          <h2 className="text-[clamp(1.35rem,3vw,2rem)] font-extrabold mt-2">Trade the rejection. Ride the reversal.</h2>
          <p className="text-[13px] text-[#94a3b8] mt-2 max-w-4xl">
            Wick rejection identifies failed price expansion at critical levels. A long wick shows aggressive testing of liquidity, then immediate rejection by stronger participants. The setup is highest quality when level location, trend bias, wick ratio, confirmation, and volume align.
          </p>
        </div>
      </section>

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
            <p className="mt-1">Forex, Crypto, Stocks, Futures, Commodities</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Timeframes Covered</p>
            <p className="mt-1">1m, 3m, 5m, 15m, 30m, 1H, 4H, Daily, Weekly</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Core Definition</p>
            <p className="mt-1">A wick rejection forms when price aggressively tests a key level, then closes far from the extreme due to opposing force dominance.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-[#e5e7eb]">Candlestick Components (Complete)</p>
          <div className="mt-3 space-y-2 text-[12px] text-[#cbd5e1]">
            <p><span className="text-white font-semibold">Open:</span> starting price of the period.</p>
            <p><span className="text-white font-semibold">Close:</span> ending price of the period (most important).</p>
            <p><span className="text-white font-semibold">High:</span> highest traded price in the period.</p>
            <p><span className="text-white font-semibold">Low:</span> lowest traded price in the period.</p>
            <p><span className="text-white font-semibold">Body:</span> distance between open and close.</p>
            <p><span className="text-white font-semibold">Upper Wick:</span> rejection from higher prices.</p>
            <p><span className="text-white font-semibold">Lower Wick:</span> rejection from lower prices.</p>
          </div>
          <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
            The wick is market memory: a failed directional attempt where one side was overpowered.
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-[#e5e7eb]">Market Psychology and Liquidity Sweep</p>
          <div className="mt-3 space-y-2 text-[12px] text-[#cbd5e1]">
            <p>Institutions seek liquidity pools to fill large size without excessive slippage.</p>
            <p>Typical sequence: sweep support/resistance, trigger stops and breakout entries, absorb flow, reverse price.</p>
            <p>Trapped participants (breakout traders and stop-hunted traders) provide reversal fuel.</p>
            <p>Liquidity sweep context converts a wick from random candle noise to institutional footprint evidence.</p>
          </div>
          <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
            Trading wick rejection means aligning with post-sweep order flow rather than chasing the failed breakout leg.
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-[#e5e7eb]">Core Identification Rules</p>
          <div className="mt-3 space-y-2.5 text-[13px] text-[#cbd5e1]">
            {[
              'Wick-to-body ratio must be at least 2:1, ideally 3:1 or more.',
              'Wick tip must test a meaningful level: support/resistance, supply/demand, prior highs/lows, or round number.',
              'Candle close must snap back away from wick extreme, proving rejection.',
              'Direction context: lower wick at support for longs, upper wick at resistance for shorts.',
              'Higher timeframe bias should align with expected reversal direction.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 text-[#86efac] shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-[#e5e7eb]">Disqualifying Conditions</p>
          <div className="mt-3 space-y-2.5 text-[13px] text-[#fca5a5]">
            {[
              'Wick forms in low-volume, dead session conditions.',
              'Pattern appears in center of noisy range with no level significance.',
              'Major news release is imminent (15 to 30 minutes).',
              'Wick ratio is below 1.5:1 or level has been repeatedly weakened.',
              'Setup strongly contradicts higher timeframe structure without shift confirmation.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white">Bullish Rejection Pattern Set</p>
          <div className="mt-3 space-y-2 text-[12px] text-[#cbd5e1]">
            <p>Hammer</p>
            <p>Bullish Pin Bar</p>
            <p>Bullish Engulfing with Rejection Wick</p>
            <p>Dragonfly Doji</p>
            <p>Long Lower Wick Candle</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
          <p className="text-[12px] font-semibold text-white">Bearish Rejection Pattern Set</p>
          <div className="mt-3 space-y-2 text-[12px] text-[#cbd5e1]">
            <p>Shooting Star</p>
            <p>Bearish Pin Bar</p>
            <p>Inverted Hammer at Resistance</p>
            <p>Gravestone Doji</p>
            <p>Long Upper Wick Candle</p>
          </div>
          <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
            ICT Rejection Block: after liquidity sweep and rejection, zone between close/body and wick tip acts as re-entry area.
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <figure className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
          <img src={WICK_IMAGES.anatomy} alt="Candlestick anatomy for wick rejection" className="w-full h-auto" />
          <figcaption className="px-4 py-3 text-[12px] text-[#94a3b8]">Candlestick anatomy: body, upper wick, lower wick, and why the wick represents failed directional intent.</figcaption>
        </figure>
        <figure className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
          <img src={WICK_IMAGES.ratio} alt="Wick to body ratio strength model" className="w-full h-auto" />
          <figcaption className="px-4 py-3 text-[12px] text-[#94a3b8]">Ratio classifier: weak (1:1), moderate (1.5:1), strong (2:1), and ideal (3:1+).</figcaption>
        </figure>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <figure className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
          <img src={WICK_IMAGES.bullish} alt="Bullish wick rejection setup" className="w-full h-auto" />
          <figcaption className="px-4 py-3 text-[12px] text-[#94a3b8]">Bullish setup sequence: support sweep, confirmation close, SL below wick, and upside target ladder.</figcaption>
        </figure>
        <figure className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
          <img src={WICK_IMAGES.bearish} alt="Bearish wick rejection setup" className="w-full h-auto" />
          <figcaption className="px-4 py-3 text-[12px] text-[#94a3b8]">Bearish setup sequence: resistance sweep, confirmation close, SL above wick, and downside target ladder.</figcaption>
        </figure>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Wick-to-Body Ratio Classification</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">&lt; 1:1: weak, skip</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">1.0-1.5: marginal, needs heavy confluence</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">1.5-2.0: moderate, selective</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">2.0-3.0: strong, high probability</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">3.0+: ideal, institutional-grade signal</div>
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
          Formula: Wick-to-Body Ratio = Wick Length / Body Length. Baseline rule: require ratio &gt;= 2.
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Algorithmic Decision Rules</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          {[
            'Measure candle: body, upper wick, lower wick, dominant wick.',
            'Filter 1: reject if wick ratio < 2.0.',
            'Filter 2: reject if wick tip is farther than 0.3 x ATR from nearest key level.',
            'Bias check: downgrade if setup fights HTF trend; upgrade if aligned.',
            'Volume check: boost confidence if volume > 1.5x 20-period average.',
            'Confirmation: next candle must close in reversal direction.',
            'Score setup using objective points before execution.',
            'Trade only if score threshold is met and risk constraints permit.',
          ].map((line) => (
            <div key={line} className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">{line}</div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Algorithm Inputs (Engineering Spec)</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Price Data</p>
            <p>OHLCV current candle</p>
            <p>OHLCV lookback (50-200)</p>
            <p>HTF OHLCV context</p>
            <p>ATR(14)</p>
            <p>Volume MA(20)</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Key Levels</p>
            <p>Support and resistance swings</p>
            <p>Supply and demand zones</p>
            <p>Psychological round numbers</p>
            <p>EMA/SMA dynamic levels</p>
            <p>Fibonacci 0.618 and 0.786</p>
            <p>Prior day/week highs and lows</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Context Filters</p>
            <p>HTF trend direction</p>
            <p>Session timing (Asia/London/NY)</p>
            <p>News proximity</p>
            <p>Market type: trend/range/volatile</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Processing Logic and Formula Layer</p>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1] space-y-1.5">
          <p>Body_Size = |Close - Open|</p>
          <p>Upper_Wick = High - max(Open, Close)</p>
          <p>Lower_Wick = min(Open, Close) - Low</p>
          <p>Wick_Ratio = max(Upper_Wick, Lower_Wick) / Body_Size</p>
          <p>Dominant_Wick = LOWER if Lower_Wick &gt; Upper_Wick else UPPER</p>
          <p>Level_Distance = |Wick_Tip - Nearest_Key_Level|</p>
          <p>Reject signal if Wick_Ratio &lt; 2.0</p>
          <p>Reject signal if Level_Distance &gt; 0.3 x ATR(14)</p>
          <p>Volume confluence if Volume[current] &gt; 1.5 x Volume_MA(20)</p>
          <p>Require next candle directional confirmation to validate setup</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Confidence Scoring and Thresholds</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Wick ratio &gt;= 2:1: +2 (otherwise disqualify)</p>
            <p>Wick ratio &gt;= 3:1: +1 bonus</p>
            <p>Key S/R location: +2 (otherwise disqualify)</p>
            <p>HTF alignment: +2 (or -1 if opposed)</p>
            <p>Volume spike: +2</p>
            <p>Confirmation candle: +2 (or skip)</p>
            <p>Fibonacci confluence: +1</p>
            <p>Session quality (London/NY): +1</p>
            <p>Liquidity sweep present: +1</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Score 8+: high confidence, full size, up to 1.5% risk</p>
            <p>Score 6-7: moderate confidence, 0.5% to 1.0% risk</p>
            <p>Score 4-5: low confidence, avoid or paper mode</p>
            <p>Score &lt; 4: do not trade</p>
            <p>Signal validity window: 3 to 5 candles</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Algorithm Outputs</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-[12px] text-[#cbd5e1]">
          {[
            'Direction: LONG at lower wick support rejection, SHORT at upper wick resistance rejection',
            'Entry: aggressive (rejection close) or conservative (confirmation close)',
            'Stop: wick extreme +/- 0.1 x ATR buffer (wider for high-vol markets)',
            'Risk amount based on stop distance',
            'TP1 at minimum 1.5R',
            'TP2 at minimum 2.5R',
            'TP3 at 4R+ structural objective',
            'Position size = (Account x Risk%) / Stop distance',
            'Signal quality score output for execution gating',
          ].map((row) => (
            <div key={row} className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">{row}</div>
          ))}
        </div>
      </section>

      <figure className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
        <img src={WICK_IMAGES.flow} alt="Wick rejection algorithmic flowchart" className="w-full h-auto" />
        <figcaption className="px-4 py-3 text-[12px] text-[#94a3b8]">Flowchart logic: from candle close through ratio, location, HTF, volume, confirmation, then execution.</figcaption>
      </figure>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Entry, Stop, and Target Framework</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white mb-1">Entry Styles</p>
            <p>Aggressive: close of rejection candle.</p>
            <p>Standard: close of confirmation candle.</p>
            <p>Limit: retrace into rejection block (50 to 75 percent of wick).</p>
            <p>Conservative: break of local structure in reversal direction.</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white mb-1">Risk & Exits</p>
            <p>Stop must be beyond wick tip with ATR buffer.</p>
            <p>TP1 at 1.5R, TP2 at 2.5R, TP3 at 4R+ where structure allows.</p>
            <p>Move stop to breakeven after TP1, then trail by structure.</p>
            <p>If price stalls for 3 to 5 candles, reduce or exit.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Stop Placement Scenarios</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p>Long setup: stop = wick low - buffer</p>
            <p>Short setup: stop = wick high + buffer</p>
            <p>Default buffer: 0.1 x ATR (or 5-10 pips/points minimum)</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p>ICT rejection block re-entry: stop beyond original wick extreme</p>
            <p>High volatility markets: use wider buffer (for example 0.25 x ATR)</p>
            <p>Never place stop exactly at wick tip or obvious round number</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Profit Target Framework</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">TP1: 1.5R at nearest logical level, take partial and move stop to breakeven</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">TP2: 2.5R at second structure, take additional partial</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">TP3: 4R+ at major structure, trail remaining size</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">Time-based fail exit: if no progress in 3-5 candles, reduce or exit</div>
        </div>
      </section>

      <figure className="rounded-2xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
        <img src={WICK_IMAGES.mtf} alt="Multi timeframe confluence model" className="w-full h-auto" />
        <figcaption className="px-4 py-3 text-[12px] text-[#94a3b8]">Top-down model: higher timeframe defines bias, mid timeframe provides structure, entry timeframe provides trigger.</figcaption>
      </figure>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Timeframe Application Guide</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">Weekly: major bias and macro turns</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">Daily: bias and major levels for lower timeframe execution</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">4H: core swing execution framework</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">1H: core intraday setup and management</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">15m/30m: refined entry with HTF confirmation</div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">1m/3m/5m: execution-only layer, never standalone bias</div>
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
          Top-down rule: HTF is the judge, entry timeframe is the trigger. Do not invert this order.
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Cross-Market Notes</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white mb-1">Forex</p>
            <p>Best quality appears around London and New York opens at major levels and round numbers.</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white mb-1">Crypto</p>
            <p>Wicks can be extreme from leverage cascades. Use wider ATR buffers and exchange confirmation.</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white mb-1">Stocks</p>
            <p>Opening range rejections can be high quality; avoid low-liquidity pre/post-market patterns.</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white mb-1">Futures</p>
            <p>Combine wick rejection with VWAP/POC and order-flow context for strongest institutional read.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Market-Specific Data (Detailed)</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Forex</p>
            <p>Best pairs: EURUSD, GBPUSD, USDJPY, AUDUSD</p>
            <p>Best sessions: London open and New York open windows</p>
            <p>Key levels: round numbers, prior day highs/lows, session extremes</p>
            <p>Volume note: use tick volume proxy</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Crypto</p>
            <p>24/7 market with volatile sweep behavior</p>
            <p>Use wider stop buffers and confirm volume quality</p>
            <p>Watch ATH/ATL and liquidation-cluster zones</p>
            <p>Confirm behavior across multiple exchanges</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Stocks</p>
            <p>Most reliable in regular trading hours</p>
            <p>Opening range often creates high-quality rejections</p>
            <p>Avoid earnings event windows and thin after-hours liquidity</p>
            <p>Prefer liquid large caps</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p className="font-semibold text-white">Futures</p>
            <p>Useful instruments: ES, NQ, GC, CL, ZB, 6E</p>
            <p>Use RTH for cleaner structure</p>
            <p>Confluence with VWAP, POC, overnight high/low is strong</p>
            <p>Order-flow tools can improve confirmation quality</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Risk Management Framework</p>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
          Position Size = (Account Balance x Risk%) / (Entry - Stop Distance)
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>High confidence (10+): 1.0% to 1.5% risk</p>
            <p>Moderate (7-9): 0.5% to 1.0% risk</p>
            <p>Low (4-6): 0.25% or skip</p>
            <p>Below threshold: no trade</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Max single-trade risk cap: 2%</p>
            <p>Max aggregate open risk: 5% to 6%</p>
            <p>After 3 losses: reduce size by 50% for next 5 trades</p>
            <p>Daily stop: pause around 3% to 4% drawdown</p>
            <p>Weekly review trigger: around 6% to 8% drawdown</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Expectancy and Performance Envelope</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p>Typical strict-execution win rate: 55% to 65%</p>
            <p>Typical average RR: 1:2 to 1:3</p>
            <p>Expected drawdown phases: 5% to 15%</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">
            <p>Expectancy = (Win Rate x Avg Win) - (Loss Rate x Avg Loss)</p>
            <p>Example: 60% win, 1:2 RR =&gt; (0.60 x 2) - (0.40 x 1) = +0.80R/trade</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">False Signals and Failure Modes</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Low-liquidity random wicks</p>
            <p>Counter-momentum wicks during major macro/news impulse</p>
            <p>Overtested levels with decaying reaction quality</p>
            <p>Pre-news stop-hunt noise</p>
            <p>Range chop with no structural context</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Psychological pitfalls: FOMO, revenge, overtrading, stop widening</p>
            <p>Most common execution error: skipping higher timeframe bias filter</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Advanced Confluence Stack</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-[12px] text-[#cbd5e1]">
          {[
            'Fibonacci 0.618/0.786 overlap',
            'Fair Value Gap mitigation at rejection zone',
            'VWAP/POC rejection alignment',
            'EMA confluence with static level',
            'Fresh demand/supply first retest',
            'Liquidity sweep of equal highs/lows',
            'Previous day high/low sweep and reclaim',
            'Session and volume alignment',
          ].map((item) => (
            <div key={item} className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3">{item}</div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
          Ideal model: HTF trend support + Fib confluence + FVG + liquidity sweep + volume spike + confirmation close, producing a top-tier score.
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Backtesting and Implementation Protocol</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Choose one market and one timeframe first.</p>
            <p>Review 6 to 12 months of chart history.</p>
            <p>Mark key levels and isolate ratio &gt;= 2 rejection events.</p>
            <p>Track MAE, TP outcomes, win rate, RR, drawdown, and loss streaks.</p>
            <p>Compare full data set vs. score-filtered data (for example score &gt;= 8).</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>Suggested tools: TradingView, NinjaTrader, MetaTrader, Bookmap/Sierra, spreadsheets, Python+Pandas.</p>
            <p>Implementation focus: convert narrative rules into deterministic filters and score gates.</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
          Pseudocode logic: measure candle -&gt; ratio filter -&gt; key-level distance filter -&gt; HTF check -&gt; volume check -&gt; confirmation -&gt; score gate -&gt; signal emit.
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Quick Reference Checklist</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>[ ] Ratio &gt;= 2:1 (prefer 3:1+)</p>
            <p>[ ] Wick tip near key level (&lt;= 0.3 x ATR)</p>
            <p>[ ] HTF bias aligned</p>
            <p>[ ] Volume &gt;= 1.5x moving average</p>
            <p>[ ] Confirmation candle closed in reversal direction</p>
            <p>[ ] No high-impact news risk nearby</p>
            <p>[ ] Score &gt;= 8</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0b0f17] p-3 space-y-1.5">
            <p>[ ] Position size calculated from stop distance</p>
            <p>[ ] Stop beyond wick with buffer</p>
            <p>[ ] TP1, TP2, TP3 mapped before entry</p>
            <p>[ ] Avoid common mistakes: low-liquidity wicks, no HTF check, no confirmation, stop widening</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
        <p className="text-[12px] font-semibold text-white">Conclusion</p>
        <p className="mt-2 text-[13px] text-[#94a3b8] max-w-5xl">
          Wick rejection is a complete execution framework, not a single candle pattern. The edge depends on structured context, deterministic filtering, and disciplined risk operations. Master one market and timeframe first, validate with backtesting, then scale systematically.
        </p>
      </section>
    </div>
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

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/strategies" className="w-8 h-8 rounded-lg border border-white/[0.12] flex items-center justify-center text-[#cbd5e1] hover:text-white">
            <ArrowLeft size={14} />
          </Link>
          <h1 className="text-[14px] font-semibold">{details.name}</h1>
        </div>
        <DesktopWorkspaceNav />
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Framework Summary</p>
          <h2 className="text-[clamp(1.3rem,3vw,1.9rem)] font-extrabold mt-2">{details.name}</h2>
          <p className="text-[13px] text-[#94a3b8] mt-2 max-w-4xl">{details.overview}</p>
        </section>

        {strategyId === 'wick-rejection' ? (
          <WickRejectionLongForm />
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <p className="text-[12px] font-semibold text-[#e5e7eb]">Execution Checklist</p>
              <div className="mt-3 space-y-2.5">
                {details.entry.map((step) => (
                  <div key={step} className="flex items-start gap-2 text-[13px] text-[#cbd5e1]">
                    <CheckCircle2 size={14} className="text-[#86efac] mt-0.5 shrink-0" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
              <p className="text-[12px] font-semibold text-[#e5e7eb]">Avoid Conditions</p>
              <div className="mt-3 space-y-2.5">
                {details.avoid.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-[13px] text-[#fca5a5]">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0b0f17] p-3 text-[12px] text-[#cbd5e1]">
                <span className="font-semibold text-white">Risk Profile:</span> {details.risk}
              </div>
            </div>
          </section>
        )}
      </div>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
