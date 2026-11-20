export type TraxoMarketPillar = 'FOREX' | 'GOLD' | 'FUTURES';
export type TraxoStrategyCategory = 'Reversal' | 'Continuation' | 'Imbalance' | 'Mean Reversion';

export type LegacyStrategyCatalogId =
  | 'wick-rejection'
  | 'breakout'
  | 'order-block'
  | 'supply-demand'
  | 'trend-following';

export type TraxoCatalogStrategyId =
  | 'traxo-london-apex'
  | 'traxo-tokyo-yield'
  | 'traxo-sovereign-fix'
  | 'traxo-barrier-grid'
  | 'traxo-macro-vector'
  | 'traxo-aurum-sweep'
  | 'traxo-bullion-strike'
  | 'traxo-ny-bullet'
  | 'traxo-aurum-fix'
  | 'traxo-kinetic-nr7'
  | 'traxo-globex-sweep'
  | 'traxo-velocity-orb'
  | 'traxo-initial-balance'
  | 'traxo-mean-equilibrium'
  | 'traxo-power-hour-moc';

export interface TraxoStrategySpec {
  id: TraxoCatalogStrategyId;
  snakeId: string;
  name: string;
  shortName: string;
  market: TraxoMarketPillar;
  marketLabel: string;
  category: TraxoStrategyCategory;
  timeframes: string;
  supportedSymbols: string[];
  winRate: string;
  avgRR: string;
  signalsPerDay: number;
  keyRule: string;
  tagline: string;
  summary: string;
  overview: string;
  entryCheckpoints: string[];
  invalidationRules: string[];
  takeProfitLogic: string;
  idealSessions: string;
  riskModel: string;
  backtestFallbackId: LegacyStrategyCatalogId;
}

export const TRAXO_MARKET_PILLARS: ReadonlyArray<{
  id: TraxoMarketPillar;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'FOREX',
    label: 'Forex Majors',
    shortLabel: 'Forex',
    description: 'EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD benchmark fix and session-sweep engines.',
  },
  {
    id: 'GOLD',
    label: 'Gold · XAU/USD',
    shortLabel: 'Gold',
    description: 'Spot bullion engines calibrated with 1.35x ATR stop protection and London/COMEX fix timing.',
  },
  {
    id: 'FUTURES',
    label: 'Futures · MNQ',
    shortLabel: 'MNQ',
    description: 'Micro E-mini Nasdaq-100 engines synchronized to America/New_York RTH cash open and VWAP sessions.',
  },
];

export const TRAXO_STRATEGIES: readonly TraxoStrategySpec[] = [
  // ── Forex Majors (5) ───────────────────────────────────────────────────────
  {
    id: 'traxo-london-apex',
    snakeId: 'traxo_london_apex',
    name: 'TRAXO London Apex',
    shortName: 'London Apex',
    market: 'FOREX',
    marketLabel: 'Forex',
    category: 'Reversal',
    timeframes: '5m / 15m',
    supportedSymbols: ['EURUSD', 'GBPUSD', 'EURGBP', 'USDCHF', 'EURJPY', 'GBPJPY', 'AUDUSD', 'USDCAD'],
    winRate: '61%',
    avgRR: '1:2.4',
    signalsPerDay: 3,
    keyRule: '00:00–06:00 Asian sweep · Close inside range',
    tagline: 'London Open Judas Swing fakeout beyond Asian extremes with reversal confirmation',
    summary:
      'Maps the 00:00–06:00 UTC Asian box and fades deceptive London Open sweeps when price closes decisively back inside range.',
    overview:
      'Captures the classic European dealer stop-run at the London Open (07:00–10:00 UTC). Once an overnight Asian range is established across 00:00–06:00 UTC, TRAXO London Apex monitors false expansions beyond the Asian High or Low, triggering counter-entries when an M5/M15 candle rejects back inside the box with strong wick asymmetry or engulfing follow-through.',
    entryCheckpoints: [
      'Asian Box Extraction: Minimum 3 intraday candles forming a bounded 00:00–06:00 UTC session range.',
      'London Killzone Active: Trigger executes strictly inside 07:00–10:00 UTC liquidity injection.',
      'Qualified Fakeout Sweep: Price pierces Asian High/Low by >= max(1.5 pips, 0.05x ATR) without exceeding 2.5x ATR runaway extension.',
      'Range Re-Acceptance & Reversal: Closing candle settles back inside Asian boundaries with valid rejection wick or engulfing structure.',
    ],
    invalidationRules: [
      'Stop Loss pinned max(3 pips, 0.25x ATR) beyond the extreme London Judas sweep wick.',
      'News blackout within +/-30m/15m suppresses signals to prevent UK/EU data runaway traps.',
      'Confidence below optimizer minConfidence threshold is filtered automatically before dispatch.',
    ],
    takeProfitLogic:
      'TP1 targets opposing Asian range liquidity (minimum 1.4x R:R); TP2 extends 0.5x Asian range beyond the opposite boundary (minimum 2.4x R:R).',
    idealSessions: 'London Open Killzone (07:00 – 10:00 UTC)',
    riskModel: '1.25% Prime / 0.75% Standard allocation with spread caps tuned per major FX pair.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-tokyo-yield',
    snakeId: 'traxo_tokyo_yield',
    name: 'TRAXO Tokyo Yield',
    shortName: 'Tokyo Yield',
    market: 'FOREX',
    marketLabel: 'Forex',
    category: 'Continuation',
    timeframes: '5m / 15m',
    supportedSymbols: ['USDJPY'],
    winRate: '63%',
    avgRR: '1:2.0',
    signalsPerDay: 2,
    keyRule: 'Gotobi dates (5/0) · 00:00–00:55 UTC JST fix flow',
    tagline: 'Tokyo Gotobi commercial USD settlement accumulation engine on USD/JPY',
    summary:
      'Exploits recurring Japanese corporate import settlement flows into the 09:55 JST Gotobi fix window on 5th/10th multiples.',
    overview:
      'Grounded in empirical Tokyo FX microstructure research. On Gotobi settlement dates (calendar days 5, 10, 15, 20, 25, 30—rolling automatically to the preceding Friday when falling on a weekend), Japanese importers systematically buy US Dollars prior to the 09:55 JST bank fixing (00:00–00:55 UTC). TRAXO Tokyo Yield scores early Asian USD/JPY accumulation dips and momentum alignment into the fix.',
    entryCheckpoints: [
      'Calendar Qualification: Confirms JST Gotobi settlement date or weekend-rolled Friday settlement session.',
      'Tokyo Pre-Fix Window: Strictly evaluates setups inside 00:00–00:55 UTC prior to 09:55 JST benchmark lock.',
      'Orderly Accumulation Structure: Verifies tight Asian spread conditions and constructive higher-low progression on USD/JPY.',
      'Volume & Momentum Participation: Validates buyer pressure without overextended spike exhaustion.',
    ],
    invalidationRules: [
      'Stop Loss placed below the Tokyo morning accumulation swing low plus ATR volatility buffer.',
      'Suppressed automatically on non-Gotobi sessions, weekends, or active high-impact BOJ/USD news freezes.',
      'Discarded if pre-fix rally has already overstretched past optimal reward headroom.',
    ],
    takeProfitLogic:
      'TP1 locks profits ahead of 09:55 JST dealer inventory squaring (>= 1.6x R:R); TP2 trails post-fix expansion toward 2.4x R:R.',
    idealSessions: 'Tokyo Morning Fix (00:00 – 00:55 UTC / 09:00 – 09:55 JST)',
    riskModel: '1.25% Prime allocation calibrated for USD/JPY 3-digit pip precision and 1.8 pip spread ceiling.',
    backtestFallbackId: 'trend-following',
  },
  {
    id: 'traxo-sovereign-fix',
    snakeId: 'traxo_sovereign_fix',
    name: 'TRAXO Sovereign Fix',
    shortName: 'Sovereign Fix',
    market: 'FOREX',
    marketLabel: 'Forex',
    category: 'Mean Reversion',
    timeframes: '5m / 15m',
    supportedSymbols: ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'EURGBP'],
    winRate: '66%',
    avgRR: '1:1.8',
    signalsPerDay: 2,
    keyRule: '16:00 UTC WMR Fix · Stretch >= 0.75x ATR snapback',
    tagline: 'WM/Reuters 4:00 PM London Fix institutional rebalancing mean-reversion engine',
    summary:
      'Captures post-fix snapbacks during 16:00–16:30 UTC after mandatory passive hedge flow stretches price away from pre-fix VWAP.',
    overview:
      'Built around global pension and equity index currency hedging flows at the 16:00 UTC WM/Reuters London Benchmark Fix. TRAXO Sovereign Fix measures the 15:00–16:00 UTC pre-fix equilibrium (VWAP/midpoint blend), detects >= 0.75x ATR unidirectional extensions, and enters the dealer inventory unwind during 16:00–16:30 UTC—boosting confidence on the final 2 business days of the calendar month.',
    entryCheckpoints: [
      'Post-Fix Rebalancing Window: Trigger window operates strictly between 16:00 and 16:30 UTC after fix lock.',
      'Qualified Pre-Fix Stretch: Price displaces >= 0.75x ATR(14) away from 15:00–16:00 UTC VWAP/midpoint equilibrium.',
      'Snapback Confirmation: Trigger candle closes in reversal direction or leaves a strong exhaustion wick.',
      'Month-End Flow Multiplier: Automatic +18 confluence weighting during final 2 weekday business days of month.',
    ],
    invalidationRules: [
      'Stop Loss anchored >= max(10 pips, 0.9x ATR) beyond the 16:00 fix extreme bar.',
      'Suppressed when Tier-1 US/EUR macro catalysts overlap the fix window.',
      'Requires clean R:R headroom back toward pre-fix equilibrium.',
    ],
    takeProfitLogic:
      'TP1 targets the 15:00–16:00 UTC pre-fix VWAP/midpoint equilibrium (minimum 1.6x R:R); TP2 projects 2.4x R:R mean continuation.',
    idealSessions: 'WM/Reuters London 4 PM Fix (16:00 – 16:30 UTC)',
    riskModel: '1.25% Prime / 0.75% Standard risk with institutional spread guardrails enforced pre-fill.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-barrier-grid',
    snakeId: 'traxo_barrier_grid',
    name: 'TRAXO Barrier Grid',
    shortName: 'Barrier Grid',
    market: 'FOREX',
    marketLabel: 'Forex',
    category: 'Reversal',
    timeframes: '5m / 15m / 1H',
    supportedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'],
    winRate: '59%',
    avgRR: '1:2.2',
    signalsPerDay: 4,
    keyRule: '.00 / .50 strikes · Rejection wick >= 45% range',
    tagline: 'OTC institutional double-zero & fifty-pip option barrier defense engine',
    summary:
      'Detects sharp liquidity sweeps and pinbar rejections off mathematical .00 and .50 institutional figure handles.',
    overview:
      'OTC FX barrier options and commercial resting limit books concentrate heavily around double-zero big figures (.00) and half-figure handles (.50). TRAXO Barrier Grid calculates exact modular proximity across 5-digit and 3-digit JPY feeds, validating sweeps past the psychological barrier followed by an asymmetric rejection wick closing safely back on the defended side.',
    entryCheckpoints: [
      'Mathematical Barrier Proximity: Rejection wick sweeps or taps within ATR tolerance of a .00 or .50 handle.',
      'Clean Side Reclamation: Candle body closes cleanly back across the defended barrier line.',
      'Wick Dominance: Rejection tail occupies >= 45% of total candle range and exceeds 1.25x body height.',
      'Participation Filter: Elevated RVOL or London/NY overlap timing adds prime confluence score.',
    ],
    invalidationRules: [
      'Tight invalidation buffer placed max(2 pips, 0.12x ATR) beyond the sweep wick extreme.',
      'Immediate signal suppression if candidate geometry fails strict >= 2.0x Risk:Reward clearance.',
      'Suppressed during high-impact news blackouts to avoid barrier-cascade stop runs.',
    ],
    takeProfitLogic:
      'TP1 targets >= 2.0x R:R or the next adjacent structural liquidity shelf; TP2 extends to >= 3.2x R:R.',
    idealSessions: 'London Morning & NY Overlap (07:00 – 16:30 UTC)',
    riskModel: 'Tight wick-anchored invalidation maximizes contract efficiency under 1.0% max risk per setup.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-macro-vector',
    snakeId: 'traxo_macro_vector',
    name: 'TRAXO Macro Vector',
    shortName: 'Macro Vector',
    market: 'FOREX',
    marketLabel: 'Forex',
    category: 'Continuation',
    timeframes: '15m (HTF 1H/4H)',
    supportedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'],
    winRate: '54%',
    avgRR: '1:2.5',
    signalsPerDay: 3,
    keyRule: 'HTF EMA 21>50>200 · M15 pullback resumption',
    tagline: 'Higher-timeframe EMA 21/50/200 alignment with M15 dynamic value pullback triggers',
    summary:
      'Synchronizes 200-bar HTF institutional trend stacks with precision M15 pullbacks into the dynamic EMA 21–50 pocket.',
    overview:
      'Eliminates choppy counter-trend traps by requiring strict Higher-Timeframe EMA 21 / 50 / 200 ribbon ordering across at least 200 HTF bars. On M15, TRAXO Macro Vector waits for an orderly multi-bar retracement into the M15 EMA 21–50 value corridor before firing upon confirmed directional resumption.',
    entryCheckpoints: [
      'HTF Macro Stack: Requires >= 200 HTF bars with EMA 21 > EMA 50 > EMA 200 (or bearish inverse).',
      'M15 Value Pullback: Price dips cleanly into M15 EMA 21–50 pocket without invalidating EMA 50 support.',
      'Trend Resumption Trigger: Latest M15 bar closes beyond EMA 21 and prior bar extreme with body strength >= 45%.',
      'Ribbon Expansion: Expanding HTF EMA spread and LTF stack alignment boost signal tier to Prime.',
    ],
    invalidationRules: [
      'Stop Loss placed beyond the recent pullback extreme / EMA 50 boundary with minimum max(8 pips, 0.8x ATR) distance.',
      'Signal withheld if M15 candle closes through EMA 50 structural trend floor.',
      'Suppressed whenever HTF feed lacks full 200-bar EMA 200 warm-up depth.',
    ],
    takeProfitLogic:
      'TP1 sets a clean 1.8x R:R structural target; TP2 projects 3.0x R:R macro trend continuation.',
    idealSessions: 'Continuous 24/5 FX Sessions (Prime weight during London/NY Overlap)',
    riskModel: '1.25% Prime / 0.75% Standard risk paired with DXY USD-exposure correlation shield.',
    backtestFallbackId: 'trend-following',
  },

  // ── Gold · XAU/USD (5) ─────────────────────────────────────────────────────
  {
    id: 'traxo-aurum-sweep',
    snakeId: 'traxo_aurum_sweep',
    name: 'TRAXO Aurum Sweep',
    shortName: 'Aurum Sweep',
    market: 'GOLD',
    marketLabel: 'Gold · XAU/USD',
    category: 'Reversal',
    timeframes: '15m',
    supportedSymbols: ['XAU/USD'],
    winRate: '59%',
    avgRR: '1:2.6',
    signalsPerDay: 2,
    keyRule: '00:00–06:30 Asian box · London M15 sweep >= 2.5R',
    tagline: 'Spot Gold Asian range liquidity purge & M15 London displacement reversal',
    summary:
      'Detects London dealer stop-hunts beyond Asia XAU/USD highs or lows and targets opposite range liquidity at >= 2.5x R:R.',
    overview:
      'Spot Gold routinely builds a compressed Asian range across 00:00–06:30 UTC before London bullion desks sweep stops beyond one edge to fuel the day’s primary trend. TRAXO Aurum Sweep isolates the Asian extreme, validates an M15 displacement close back inside the range, and projects directly toward opposing Asian liquidity with mandatory >= 1:2.5 Risk:Reward filtering.',
    entryCheckpoints: [
      'Asian Gold Range: Maps exact XAU/USD 00:00–06:30 UTC high, low, and range envelope.',
      'Bullion Stop-Hunt Purge: Post-Asia candle sweeps beyond Asian High or Low into resting liquidity pools.',
      'M15 Displacement Close: Trigger candle closes firmly back inside Asian boundaries on strong body/volume.',
      'Asymmetric Headroom Gate: Setup fires ONLY if distance to opposite Asian boundary yields >= 2.5x R:R.',
    ],
    invalidationRules: [
      'Stop Loss buffered beyond the liquidity sweep extreme with ATR stop-hunt protection.',
      'Setup is rejected automatically if opposite boundary headroom offers < 2.5x R:R.',
      'Gold rollover quarantine freezes all execution from 21:00–23:00 UTC.',
    ],
    takeProfitLogic:
      'TP1 targets the exact opposing Asian High/Low liquidity boundary (>= 2.5x R:R guaranteed); TP2 scales to 1.5x Asian box extension.',
    idealSessions: 'London Bullion Open (06:45 – 10:30 UTC)',
    riskModel: '1.0% Prime risk allocation calibrated for XAU/USD 100-oz contract pip economics ($10/pip per lot).',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-bullion-strike',
    snakeId: 'traxo_bullion_strike',
    name: 'TRAXO Bullion Strike',
    shortName: 'Bullion Strike',
    market: 'GOLD',
    marketLabel: 'Gold · XAU/USD',
    category: 'Reversal',
    timeframes: '15m / 1H / 4H',
    supportedSymbols: ['XAU/USD'],
    winRate: '60%',
    avgRR: '1:2.1',
    signalsPerDay: 2,
    keyRule: '$10 / $50 strikes · Mandatory 1.35x ATR SL buffer',
    tagline: 'COMEX $10 & $50 psychological strike pinbar rejection with 1.35x ATR Gold buffer',
    summary:
      'Captures high-conviction Gold pinbars rejecting $10 and $50 handles with hardened 1.35x ATR stop protection.',
    overview:
      'COMEX Gold options market-makers aggressively delta-hedge around $10 and major $50 psychological price handles ($2,650, $2,700, etc.). TRAXO Bullion Strike identifies qualified institutional pinbars (>= 55% rejection tail, close in outer 40% of range) piercing and rejecting a $10 or $50 strike, while enforcing Gold’s non-negotiable 1.35x ATR(14) stop-loss buffer to survive secondary wicks.',
    entryCheckpoints: [
      'Psychological Strike Hit: Pinbar wick tags or pierces a $10 handle (bonus confluence at major $50 strikes).',
      'Pinbar Anatomy Gate: Rejection wick >= 55% of bar range, >= 2.0x candle body, and >= 0.45x ATR(14).',
      'Close Reclamation: Candle closes decisively on the defended side of the strike handle.',
      'Volume & Killzone Weighting: RVOL >= 1.25x and London/NY liquidity windows boost confidence tier.',
    ],
    invalidationRules: [
      'Mandatory GOLD_MIN_SL_ATR_BUFFER >= 1.35x ATR(14) applied strictly beyond pinbar tail extreme.',
      'Off-strike pinbars away from $10/$50 levels are discarded cleanly.',
      'Blocked automatically during USD tier-1 CPI/NFP/FOMC freeze windows.',
    ],
    takeProfitLogic:
      'TP1 targets nearest opposing structural swing level >= 2.0x R:R; TP2 extends to 3.0x+ R:R swing liquidity.',
    idealSessions: 'London Morning & COMEX NY Overlap (07:00 – 17:00 UTC)',
    riskModel: '1.0% Prime allocation with 4.5 pip XAUUSD spread cap and rollover freeze guard.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-ny-bullet',
    snakeId: 'traxo_ny_bullet',
    name: 'TRAXO NY Bullet',
    shortName: 'NY Bullet',
    market: 'GOLD',
    marketLabel: 'Gold · XAU/USD',
    category: 'Imbalance',
    timeframes: '5m / 15m',
    supportedSymbols: ['XAU/USD'],
    winRate: '54%',
    avgRR: '1:2.3',
    signalsPerDay: 1,
    keyRule: '10:00–11:00 EST · Sweep + M15 FVG retest',
    tagline: '10:00 AM EST COMEX/LBMA PM Fix Silver Bullet Fair Value Gap retest engine',
    summary:
      'Executes during the 15:00–16:00 UTC Gold overlap when an M15 liquidity sweep creates and retests an active FVG imbalance.',
    overview:
      'Timed precisely to the 10:00–11:00 AM EST (15:00–16:00 UTC) COMEX equity-open digestion and LBMA PM Fix hour. TRAXO NY Bullet searches for a prior swing Buy-Side or Sell-Side liquidity sweep followed by energetic displacement leaving an unmitigated 3-candle Fair Value Gap (>= 0.10x ATR). Entries trigger cleanly as price pulls back into the active FVG and prints rejection.',
    entryCheckpoints: [
      'Silver Bullet Killzone: Fires exclusively inside 15:00–16:00 UTC (10:00–11:00 AM EST).',
      'Confirmed Liquidity Sweep: Prior swing high/low purged immediately prior to displacement leg.',
      'Valid 3-Candle FVG: Institutional gap >= 0.10x ATR remains unviolated until current retest bar.',
      'Active Mitigation Reaction: Current bar touches FVG corridor and holds/rejects in displacement direction.',
    ],
    invalidationRules: [
      'Stop Loss positioned max(0.35x ATR, $0.50) beyond the sweep extreme / distal FVG boundary.',
      'Prior full candle closes cleanly breaking through the distal FVG boundary invalidate the setup.',
      'Zero signals permitted outside the strict 60-minute window.',
    ],
    takeProfitLogic:
      'TP1 targets structural swing liquidity at minimum 2.0x R:R; TP2 extends to 3.0x R:R external targets.',
    idealSessions: 'New York AM Silver Bullet Window (15:00 – 16:00 UTC / 10:00 – 11:00 EST)',
    riskModel: '1.0% Prime risk with FVG size-to-ATR grading and RVOL surge weighting.',
    backtestFallbackId: 'order-block',
  },
  {
    id: 'traxo-aurum-fix',
    snakeId: 'traxo_aurum_fix',
    name: 'TRAXO Aurum Fix',
    shortName: 'Aurum Fix',
    market: 'GOLD',
    marketLabel: 'Gold · XAU/USD',
    category: 'Mean Reversion',
    timeframes: '5m / 15m',
    supportedSymbols: ['XAU/USD'],
    winRate: '65%',
    avgRR: '1:1.7',
    signalsPerDay: 1,
    keyRule: '14:30–15:30 UTC PM Fix · VWAP >= 2.0σ snapback',
    tagline: 'LBMA 15:00 UTC London PM Benchmark Fix >= 2.0σ session VWAP snapback engine',
    summary:
      'Fades >= 2.0σ Gold extensions around the 15:00 UTC LBMA PM auction back toward intraday VWAP equilibrium.',
    overview:
      'During the 14:30–15:30 UTC window surrounding the LBMA London PM Gold Fix auction, physical settlement orders frequently push Spot Gold >= 2.0 standard deviations away from intraday session VWAP. As the auction clears, TRAXO Aurum Fix catches the reversal snapback toward session VWAP while enforcing Gold’s mandatory 1.35x ATR stop buffer.',
    entryCheckpoints: [
      'LBMA PM Fix Window: Operates exclusively between 14:30 and 15:30 UTC.',
      'Statistical Outlier Extension: Prior or current bar stretches >= 2.0 standard deviations from intraday VWAP.',
      'Reversal Confirmation: Latest candle closes back toward session VWAP with lower/upper rejection tail.',
      'Auction Flow Participation: Extra weighting for >= 2.5σ extremes, high RVOL, and post-15:00 release timing.',
    ],
    invalidationRules: [
      'Mandatory GOLD_MIN_SL_ATR_BUFFER >= 1.35x ATR(14) placed beyond the auction sweep extreme.',
      'Signals are withheld if current price has already crossed past the VWAP equilibrium line.',
      'News blackout suppresses entries during simultaneous US macro releases.',
    ],
    takeProfitLogic:
      'TP1 targets intraday session VWAP (or 1.6x R:R minimum if VWAP is nearer than 1.5R); TP2 targets 2.4x R:R.',
    idealSessions: 'LBMA PM Gold Fix Window (14:30 – 15:30 UTC)',
    riskModel: '1.0% Prime / 0.75% Standard risk capped behind 1.35x ATR physical sweep protection.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-kinetic-nr7',
    snakeId: 'traxo_kinetic_nr7',
    name: 'TRAXO Kinetic NR7',
    shortName: 'Kinetic NR7',
    market: 'GOLD',
    marketLabel: 'Gold · XAU/USD',
    category: 'Continuation',
    timeframes: '1H / 4H / 1D',
    supportedSymbols: ['XAU/USD'],
    winRate: '47%',
    avgRR: '1:3.4',
    signalsPerDay: 1,
    keyRule: 'Smallest 7-day range (NR7 / ID) · Volatility breakout',
    tagline: 'Toby Crabel Narrow Range 7 (NR7) Gold volatility contraction breakout engine',
    summary:
      'Identifies extreme 7-day daily range compression on XAU/USD (including ID/NR7 inside days) and rides explosive breakouts.',
    overview:
      'Implements Toby Crabel’s volatility-contraction principle tailored for Spot Gold. When Gold prints an NR7 day (a full daily high-low range strictly tighter than the previous 6 trading days—often forming an Inside-Day NR7 double compression), directional energy coils rapidly. TRAXO Kinetic NR7 monitors daily or intraday breakout thrusts through the NR7 boundary.',
    entryCheckpoints: [
      '7-Day Contraction Audit: Builds complete UTC daily bars (directly or from HTF/intraday feed) to confirm strict NR7 tightness.',
      'ID/NR7 Bonus Detection: Flags rare Inside Day + NR7 dual-compression coils for highest expansion weight.',
      'Clean Boundary Breakout: Price breaks cleanly above the NR7 high or below the NR7 low with active range momentum.',
      'Live & Daily Dispatch: Supports both daily bar close triggers and intraday 1H breakout tracking.',
    ],
    invalidationRules: [
      'Stop Loss positioned cleanly beyond the opposite side / ATR-scaled midpoint of the compressed NR7 bar.',
      'Suppressed whenever prior completed day fails strict smallest-of-7 range verification.',
      'Avoids chasing exhausted breakouts if expansion range already consumes daily ADR budget.',
    ],
    takeProfitLogic:
      'TP1 targets 2.0x–2.5x R:R structural volatility expansion; TP2 trails toward 3.5x–4.5x R:R multi-day Gold runs.',
    idealSessions: 'London & NY Expansion Windows (07:00 – 16:00 UTC)',
    riskModel: 'High asymmetric R:R (1:3.0+) compensates for ~47% breakout win rate with low risk-of-ruin.',
    backtestFallbackId: 'breakout',
  },

  // ── Futures · MNQ (5) ──────────────────────────────────────────────────────
  {
    id: 'traxo-globex-sweep',
    snakeId: 'traxo_globex_sweep',
    name: 'TRAXO Globex Sweep',
    shortName: 'Globex Sweep',
    market: 'FUTURES',
    marketLabel: 'Futures · MNQ',
    category: 'Reversal',
    timeframes: '1m / 5m',
    supportedSymbols: ['MNQ', 'NQ', 'USTEC'],
    winRate: '59%',
    avgRR: '1:2.6',
    signalsPerDay: 2,
    keyRule: 'ONH/ONL sweep · 09:30–09:45 ET RVOL >= 1.25x',
    tagline: 'CME Overnight Globex High/Low (ONH/ONL) NY Cash Open stop-run reversal engine',
    summary:
      'Catches opening-bell fades during 09:30–09:45 ET when MNQ sweeps Overnight High or Low on high RVOL and reclaims range.',
    overview:
      'Using DST-aware America/New_York clock logic, TRAXO Globex Sweep maps the full overnight Globex session (18:00 ET prior day through 09:29 ET). At the 09:30 ET cash equities bell, retail stops resting just past ONH or ONL are routinely flushed within the first 15 minutes; when RVOL spikes >= 1.25x and price rejects back inside the overnight box, the engine fires toward the overnight midpoint and opposite boundary.',
    entryCheckpoints: [
      'Globex Envelope Extracted: Computes exact ONH and ONL across 18:00 ET – 09:29 ET overnight session.',
      'Opening Bell Window: Evaluates exclusively inside 09:30 – 09:45 ET (DST-adjusted automatically).',
      'Qualified ONH/ONL Purge: Candle pierces overnight extreme and closes back inside with rejection wick.',
      'RVOL Participation Gate: Requires minimum RVOL >= 1.25x confirming institutional liquidity turn.',
    ],
    invalidationRules: [
      'Stop Loss placed cleanly past the cash-open sweep wick extreme using MNQ 0.25-tick precision.',
      'Suppressed if price closes strongly outside overnight range (trend drive rejection).',
      'Discrete integer MNQ contract sizing ($2.00/point multiplier, minimum 1 contract).',
    ],
    takeProfitLogic:
      'TP1 targets overnight midpoint / VWAP mean (>= 1.8x R:R); TP2 targets opposing ONL/ONH overnight boundary.',
    idealSessions: 'US Cash Open First 15 Minutes (09:30 – 09:45 ET)',
    riskModel: 'Discrete integer MNQ contracts computed from stop points x $2.00/pt within prop drawdown caps.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-velocity-orb',
    snakeId: 'traxo_velocity_orb',
    name: 'TRAXO Velocity ORB',
    shortName: 'Velocity ORB',
    market: 'FUTURES',
    marketLabel: 'Futures · MNQ',
    category: 'Continuation',
    timeframes: '1m / 5m',
    supportedSymbols: ['MNQ', 'NQ', 'USTEC'],
    winRate: '52%',
    avgRR: '1:2.0',
    signalsPerDay: 2,
    keyRule: '09:30–09:35 ET 5m ORB · RVOL >= 1.5x · 1:2 RR',
    tagline: 'Zarattini-Aziz 5-Minute Opening Range Breakout with institutional RVOL gate',
    summary:
      'Validates high-relative-volume (>= 1.5x) 09:30–09:35 ET opening bars to arm STOP or trigger MARKET breakouts at 1:2 R:R.',
    overview:
      'Derived from quantitative Opening Range Breakout research for Nasdaq futures. TRAXO Velocity ORB isolates the first 5-minute RTH candle (09:30–09:35 ET) and requires Relative Volume >= 1.5x against the 20-period average to filter dead-volume chops. At ORB close it arms a directional STOP order above/below the 5m range, or enters MARKET on post-ORB breakout candles with stop anchored at the 50% ORB midpoint.',
    entryCheckpoints: [
      '5-Minute ORB Construction: Captures exact 09:30–09:35 ET range from 1m or 5m Nasdaq futures bars.',
      'RVOL >= 1.5x Institutional Filter: Rejects low-conviction openings below 1.5x relative volume.',
      'Directional Impulse Alignment: ORB bar direction or post-09:35 breakout close confirms directional bias.',
      '50% ORB Midpoint Stop: Tightens stop distance to half the opening range for superior R:R efficiency.',
    ],
    invalidationRules: [
      'Stop Loss placed at the 50% midpoint of the 09:30–09:35 ET 5-minute range (beyond opposite tail on ultra-tight bars).',
      'Zero trades armed outside 09:30 – 10:15 ET opening volatility regime.',
      'Tier-1 US 08:30/10:00 ET news freezes suspend automated execution safely.',
    ],
    takeProfitLogic:
      'TP1 enforces exact 1:2.0 Risk:Reward projection from entry-to-midpoint risk; TP2 extends to 3.0x R:R trend targets.',
    idealSessions: 'US Equity Cash Open (09:30 – 10:15 ET)',
    riskModel: 'Integer MNQ contract allocation ($2.00/pt) protecting tight midpoint stop spacing.',
    backtestFallbackId: 'breakout',
  },
  {
    id: 'traxo-initial-balance',
    snakeId: 'traxo_initial_balance',
    name: 'TRAXO Initial Balance',
    shortName: 'Initial Balance',
    market: 'FUTURES',
    marketLabel: 'Futures · MNQ',
    category: 'Continuation',
    timeframes: '5m / 15m',
    supportedSymbols: ['MNQ', 'NQ', 'USTEC'],
    winRate: '58%',
    avgRR: '1:2.4',
    signalsPerDay: 2,
    keyRule: '09:30–10:30 ET IB break · First boundary retest',
    tagline: 'Market Profile 60-minute Initial Balance breakout & boundary retest engine',
    summary:
      'Maps the 09:30–10:30 ET Initial Balance box, waits for directional expansion out, and buys/sells the first defense of the broken boundary.',
    overview:
      'Grounded in Auction Market Theory and CME Market Profile structure. The opening 60 minutes (09:30–10:30 ET) define institutional fair-value boundaries (IB High / IB Low). After price expands cleanly out of the IB box, TRAXO Initial Balance waits patiently for the first pullback touching and defending the broken boundary from the exterior side to join higher-conviction trend-day extensions.',
    entryCheckpoints: [
      '60-Minute IB Range: Extracts verified IB High, IB Low, and midpoint across 09:30–10:30 ET bars.',
      'True Exterior Expansion: Requires clear directional breakout close outside IB boundary.',
      'First Pullback Defense: Pullback bar wicks back to test broken IB High/Low and closes holding outside.',
      'Continuation Volume: Confirms defender volume supporting boundary flip from resistance-to-support (or inverse).',
    ],
    invalidationRules: [
      'Stop Loss tucked cleanly inside the broken IB boundary beyond ATR/point buffer.',
      'Re-acceptance (candle closing decisively back inside the 60m IB box) voids trend continuation.',
      'Requires clean reward headroom to 1.0x–1.5x IB range width extension.',
    ],
    takeProfitLogic:
      'TP1 projects 1.0x Initial Balance width (minimum 2.0x R:R); TP2 targets 1.5x IB extension.',
    idealSessions: 'Post-IB Trend Window (10:30 – 13:00 ET)',
    riskModel: 'Integer MNQ contracts sized against IB boundary pullback risk distance at $2/point.',
    backtestFallbackId: 'supply-demand',
  },
  {
    id: 'traxo-mean-equilibrium',
    snakeId: 'traxo_mean_equilibrium',
    name: 'TRAXO Mean Equilibrium',
    shortName: 'Mean Equilibrium',
    market: 'FUTURES',
    marketLabel: 'Futures · MNQ',
    category: 'Mean Reversion',
    timeframes: '1m / 5m / 15m',
    supportedSymbols: ['MNQ', 'NQ', 'USTEC'],
    winRate: '68%',
    avgRR: '1:1.5',
    signalsPerDay: 3,
    keyRule: '11:30–13:30 ET midday lull · > 2.0σ VWAP fade',
    tagline: 'Wall Street midday lull RTH session-VWAP > 2.0σ statistical exhaustion fade',
    summary:
      'Exploits low-volume midday mean-reversion regimes when MNQ overextends beyond 2.0 standard deviations from session VWAP.',
    overview:
      'Between 11:30 AM and 1:30 PM ET, institutional cash-desk participation dips significantly and Nasdaq futures typically oscillate in a stationary Gaussian distribution anchored to RTH Session VWAP. TRAXO Mean Equilibrium continuously computes intraday session VWAP & standard deviation (sigma), fading statistical outliers exceeding > 2.0σ back toward VWAP fair value.',
    entryCheckpoints: [
      'Midday Lull Active: Triggers exclusively during 11:30 – 13:30 ET New York lunch regime.',
      'RTH Session VWAP Anchor: Calculates volume-weighted price and rolling standard deviation anchored to 09:30 ET.',
      'Extreme > 2.0σ Outlier: Price stretches strictly past +/-2.0σ (bonus weight past 2.5σ).',
      'Exhaustion Wick / Muted RVOL: Presence of rejection wick and calm midday RVOL <= 1.35x confirm non-trending mean reversion.',
    ],
    invalidationRules: [
      'Stop Loss placed beyond extreme bar tail or max(1.1x σ, 0.85x ATR) safety band.',
      'Suppressed outside 11:30–13:30 ET to prevent fading genuine opening or afternoon trend drives.',
      'Aborted on tier-1 intraday Fed/macro headlines.',
    ],
    takeProfitLogic:
      'TP1 locks directly at Session VWAP equilibrium; TP2 captures modest overshoot to +/-0.5σ across VWAP.',
    idealSessions: 'New York Midday Lull (11:30 – 13:30 ET)',
    riskModel: 'Conservative midday size using discrete MNQ contracts sized against sigma band stop.',
    backtestFallbackId: 'wick-rejection',
  },
  {
    id: 'traxo-power-hour-moc',
    snakeId: 'traxo_power_hour_moc',
    name: 'TRAXO Power Hour MOC',
    shortName: 'Power Hour MOC',
    market: 'FUTURES',
    marketLabel: 'Futures · MNQ',
    category: 'Continuation',
    timeframes: '5m / 15m',
    supportedSymbols: ['MNQ', 'NQ', 'USTEC'],
    winRate: '59%',
    avgRR: '1:1.7',
    signalsPerDay: 1,
    keyRule: '15:30–16:00 ET MOC flow · Daily RTH trend aligned',
    tagline: 'Gao-Zhou Market-on-Close late-day institutional momentum extension engine',
    summary:
      'Trades final-30-minute (15:30–16:00 ET) institutional closing imbalance aligned with RTH trend and VWAP/EMA stack.',
    overview:
      'Inspired by Gao-Han-Li-Zhou intraday momentum findings on US equity index futures. Late-day mutual fund, ETF, and leveraged rebalancing creates persistent directional flow into the 16:00 ET closing bell. TRAXO Power Hour MOC assesses prevailing daily RTH return bias from the 09:30 ET open alongside VWAP and EMA 21/50 positioning before executing 15:30–16:00 ET continuations.',
    entryCheckpoints: [
      'Power Hour Closing Window: Active strictly from 15:30 – 16:00 ET into the cash close.',
      'Intraday RTH Trend Alignment: Measures net day trend from 09:30 ET cash open and intraday structure.',
      'VWAP & EMA 21/50 Stack: Confirms price holding constructively on the trend side of VWAP and EMA ribbon.',
      'Closing Volume Surge: Late-day participation boost raises setup confidence into Prime tier.',
    ],
    invalidationRules: [
      'Stop Loss placed behind latest Power Hour swing anchor / VWAP structural defense level.',
      'Counter-trend setups fighting RTH VWAP & EMA 21/50 are filtered automatically.',
      'Signals terminate ahead of 16:00 ET CME cash close.',
    ],
    takeProfitLogic:
      'TP1 captures closing auction extension (>= 1.5x R:R); TP2 runs to 2.2x+ R:R or session closing high/low.',
    idealSessions: 'US Closing Bell / Power Hour (15:30 – 16:00 ET)',
    riskModel: 'Discrete integer MNQ contracts sized against late-session swing stop distance.',
    backtestFallbackId: 'trend-following',
  },
];

export const TRAXO_STRATEGY_MAP: Record<TraxoCatalogStrategyId, TraxoStrategySpec> = Object.fromEntries(
  TRAXO_STRATEGIES.map((spec) => [spec.id, spec])
) as Record<TraxoCatalogStrategyId, TraxoStrategySpec>;

export function normalizeTraxoStrategyId(raw?: string): TraxoCatalogStrategyId | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');

  for (const spec of TRAXO_STRATEGIES) {
    if (
      cleaned === spec.id ||
      cleaned === spec.snakeId.replace(/_/g, '-') ||
      cleaned === spec.name.toLowerCase().replace(/[\s_]+/g, '-') ||
      cleaned === spec.shortName.toLowerCase().replace(/[\s_]+/g, '-')
    ) {
      return spec.id;
    }
  }

  for (const spec of TRAXO_STRATEGIES) {
    const shortSlug = spec.shortName.toLowerCase().replace(/\s+/g, '-');
    if (cleaned.includes(shortSlug)) {
      return spec.id;
    }
  }

  return null;
}
