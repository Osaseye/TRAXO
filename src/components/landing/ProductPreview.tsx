import { useState } from 'react';
import { motion } from 'framer-motion';
import { PiCheck } from 'react-icons/pi';
import { cn } from '@/lib/utils';

type TabId = 'terminal' | 'signals' | 'journal';

interface PreviewTab {
  id: TabId;
  label: string;
  shortLabel: string;
  caption: string;
}

const PREVIEW_TABS: PreviewTab[] = [
  {
    id: 'terminal',
    label: 'Execution Desk',
    shortLabel: 'Desk',
    caption: 'Every trade passes pre-trade risk verification before reaching your broker.',
  },
  {
    id: 'signals',
    label: 'Signal Radar',
    shortLabel: 'Radar',
    caption: 'Clear structural setups across Forex, Gold, and MNQ with mapped invalidation and targets.',
  },
  {
    id: 'journal',
    label: 'Execution Ledger',
    shortLabel: 'Ledger',
    caption: 'Automatic tracking of partial take-profits, breakeven stops, and net account growth.',
  },
];

const RISK_CHECKS = [
  { name: 'Setup Confidence', status: '92% verified above minimum threshold' },
  { name: 'Risk to Reward', status: '1 : 3.0 asymmetric structure' },
  { name: 'Live Broker Spread', status: '0.6 pips within instrument cap' },
  { name: 'USD Correlation Shield', status: 'Clean directional exposure' },
  { name: 'Session & Rollover Window', status: 'London Open active liquidity' },
  { name: 'Daily Drawdown Ceiling', status: '0.0% used of 4.0% daily cap' },
  { name: 'Economic Calendar Window', status: 'ForexFactory clear for next 3h 40m' },
];

interface RadarSignal {
  id: string;
  symbol: string;
  market: 'Forex' | 'Gold' | 'MNQ';
  tf: string;
  strategy: string;
  direction: 'Buy' | 'Sell';
  confluence: string;
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
  management: string;
  reasons: string[];
}

const RADAR_SIGNALS: RadarSignal[] = [
  {
    id: 's1',
    symbol: 'XAU/USD',
    market: 'Gold',
    tf: '15m',
    strategy: 'Aurum Sweep',
    direction: 'Buy',
    confluence: '9 / 9 Prime',
    entry: '2,648.50',
    sl: '2,641.00',
    tp1: '2,661.00',
    tp2: '2,671.00',
    management: 'Half off at TP1, stop to breakeven',
    reasons: [
      'Swept Asian session low before closing firmly back inside range',
      '1.35x ATR protective stop buffer with expanding buy volume',
      'Higher timeframe structure aligned bullish with news calendar clear',
    ],
  },
  {
    id: 's2',
    symbol: 'EUR/USD',
    market: 'Forex',
    tf: '15m',
    strategy: 'London Apex',
    direction: 'Buy',
    confluence: '8 / 9 Prime',
    entry: '1.08420',
    sl: '1.08280',
    tp1: '1.08660',
    tp2: '1.08840',
    management: 'Half off at TP1, stop to breakeven',
    reasons: [
      'London Open sweep below overnight lows followed by clean displacement',
      'Break of short-term bearish structure on strong momentum candle',
      'Live spread 0.6 pips well below EUR/USD limit',
    ],
  },
  {
    id: 's3',
    symbol: 'MNQ',
    market: 'MNQ',
    tf: '5m',
    strategy: 'Velocity ORB',
    direction: 'Buy',
    confluence: '9 / 9 Prime',
    entry: '21,418.50',
    sl: '21,398.50',
    tp1: '21,452.50',
    tp2: '21,478.50',
    management: 'Half off at TP1, stop to breakeven',
    reasons: [
      'New York 09:30 opening range breakout on 2.4x relative volume',
      'Price holding firmly above VWAP with overnight highs targeted above',
      'Sized automatically to 4 Micro Nasdaq contracts for $400 risk',
    ],
  },
  {
    id: 's4',
    symbol: 'USD/JPY',
    market: 'Forex',
    tf: '15m',
    strategy: 'Sovereign Fix',
    direction: 'Sell',
    confluence: '7 / 9 Standard',
    entry: '153.840',
    sl: '154.090',
    tp1: '153.390',
    tp2: '153.390',
    management: 'Full exit at Take Profit 1',
    reasons: [
      'London 16:00 Fix benchmark mean-reversion deviation',
      'Exhaustion rejection off intraday resistance band',
      'Single-target high-probability snapback profile active',
    ],
  },
];

const LEDGER_ROWS = [
  { id: 'l1', pair: 'XAU/USD', tf: '15m', strategy: 'Aurum Sweep', management: 'TP1 scaled + TP2 hit', pnl: '+$1,100.00', positive: true },
  { id: 'l2', pair: 'EUR/USD', tf: '15m', strategy: 'London Apex', management: 'TP1 scaled + Breakeven exit', pnl: '+$365.00', positive: true },
  { id: 'l3', pair: 'MNQ', tf: '5m', strategy: 'Velocity ORB', management: 'TP1 scaled + TP2 hit', pnl: '+$940.00', positive: true },
  { id: 'l4', pair: 'USD/JPY', tf: '15m', strategy: 'Sovereign Fix', management: 'Full Take Profit 1', pnl: '+$720.00', positive: true },
  { id: 'l5', pair: 'GBP/USD', tf: '15m', strategy: 'Kinetic NR7', management: 'Stopped out cleanly', pnl: '-$400.00', positive: false },
];

export function ProductPreview() {
  const [activeTab, setActiveTab] = useState<TabId>('terminal');
  const [executionRoute, setExecutionRoute] = useState<'paper' | 'mt5'>('paper');
  const [radarFilter, setRadarFilter] = useState<'All' | 'Forex' | 'Gold' | 'MNQ'>('All');
  const [selectedSignalId, setSelectedSignalId] = useState<string>('s1');

  const current = PREVIEW_TABS.find((t) => t.id === activeTab) ?? PREVIEW_TABS[0];
  const filteredRadar = RADAR_SIGNALS.filter(
    (s) => radarFilter === 'All' || s.market === radarFilter
  );
  const activeSignal =
    filteredRadar.find((s) => s.id === selectedSignalId) ?? filteredRadar[0] ?? RADAR_SIGNALS[0];

  return (
    <section
      id="terminal"
      className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 bg-[#09090B] overflow-x-clip font-sans"
    >
      <div className="relative max-w-6xl mx-auto space-y-12 sm:space-y-16">
        {/* Header with Sleek Underline Tab Selector (Zero Boxed Chrome) */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-5 border-b border-white/[0.06]">
          <div className="max-w-xl space-y-2">
            <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Terminal Architecture
            </p>
            <h2 className="text-[28px] sm:text-4xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12]">
              Obsidian surfaces built for long focus.
            </h2>
            <p className="text-[14.5px] text-[#71717A] font-normal leading-relaxed">
              {current.caption}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Workspace modules"
            className="flex items-center gap-6 sm:gap-8 shrink-0 overflow-x-auto no-scrollbar"
          >
            {PREVIEW_TABS.map((tab) => {
              const isSelected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative pb-2 text-[13.5px] sm:text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer touch-manipulation',
                    isSelected ? 'text-[#FAFAFA]' : 'text-[#71717A] hover:text-[#A1A1AA]'
                  )}
                >
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {isSelected && (
                    <motion.span
                      layoutId="product-preview-underline"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#FAFAFA]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Floating Open-Canvas Workspace Views (Zero Cards / Zero Colored Boxes) */}
        {activeTab === 'terminal' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            {/* Left 7 Cols: Open Pre-Trade Checklist */}
            <div className="lg:col-span-7 space-y-4">
              <div className="text-[12px] uppercase tracking-wider font-semibold text-[#71717A]">
                Pre-Trade Risk Verification
              </div>
              <div className="divide-y divide-white/[0.06]">
                {RISK_CHECKS.map((item) => (
                  <div
                    key={item.name}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4"
                  >
                    <div className="flex items-center gap-3 text-[14px] font-medium text-[#FAFAFA]">
                      <PiCheck size={14} className="text-[#34D399] shrink-0" />
                      <span>{item.name}</span>
                    </div>
                    <span className="text-[13px] text-[#71717A] pl-6 sm:pl-0 tabular-nums">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: Floating Execution Summary */}
            <div className="lg:col-span-5 space-y-6 lg:border-l lg:border-white/[0.06] lg:pl-12">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] uppercase tracking-wider font-semibold text-[#71717A]">
                  Execution Routing
                </span>
                <div className="flex items-center gap-4 text-[13px] font-medium">
                  <button
                    type="button"
                    onClick={() => setExecutionRoute('paper')}
                    className={cn(
                      'cursor-pointer touch-manipulation transition-colors',
                      executionRoute === 'paper' ? 'text-[#FAFAFA] font-semibold' : 'text-[#71717A] hover:text-[#A1A1AA]'
                    )}
                  >
                    Paper Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecutionRoute('mt5')}
                    className={cn(
                      'cursor-pointer touch-manipulation transition-colors',
                      executionRoute === 'mt5' ? 'text-[#FAFAFA] font-semibold' : 'text-[#71717A] hover:text-[#A1A1AA]'
                    )}
                  >
                    Exness MT5
                  </button>
                </div>
              </div>

              <div className="divide-y divide-white/[0.06] text-[13.5px]">
                <div className="py-3 flex items-center justify-between">
                  <span className="text-[#71717A]">Active Mode</span>
                  <span className="font-medium text-[#34D399]">
                    {executionRoute === 'paper' ? 'Internal Paper Broker' : 'Direct Exness MT5 Bridge'}
                  </span>
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-[#71717A]">Instrument</span>
                  <span className="font-semibold text-[#FAFAFA]">XAU/USD · Aurum Sweep</span>
                </div>
                <div className="py-3 flex items-center justify-between tabular-nums">
                  <span className="text-[#71717A]">Entry / Stop / Targets</span>
                  <span className="font-semibold text-[#FAFAFA]">2,648.50 · 2,641.00 · 2,671.00</span>
                </div>
                <div className="py-3 flex items-center justify-between tabular-nums">
                  <span className="text-[#71717A]">Position Size</span>
                  <span className="font-semibold text-[#FAFAFA]">0.40 Lots ($400 Risk)</span>
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-[#71717A]">Exit Management</span>
                  <span className="font-medium text-[#FAFAFA]">50% at TP1, move stop to breakeven</span>
                </div>
              </div>

              <p className="text-[13px] text-[#71717A] leading-relaxed">
                {executionRoute === 'paper'
                  ? 'Trades resolve across real historical candles using 1-minute tie-breaking and credit your paper balance automatically.'
                  : 'Validated orders route directly to MetaTrader 5 with bracketed Stop Loss and Take Profit protection.'}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'signals' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            {/* Left 7 Cols: Clean Hairline Setup Stream */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-[12px] uppercase tracking-wider font-semibold text-[#71717A]">
                  Active Setups
                </span>
                <div className="flex items-center gap-5 text-[13px]">
                  {(['All', 'Forex', 'Gold', 'MNQ'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setRadarFilter(cat)}
                      className={cn(
                        'cursor-pointer touch-manipulation transition-colors',
                        radarFilter === cat
                          ? 'text-[#FAFAFA] font-semibold'
                          : 'text-[#71717A] hover:text-[#A1A1AA]'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {filteredRadar.map((sig) => {
                  const selected = activeSignal.id === sig.id;
                  return (
                    <button
                      key={sig.id}
                      type="button"
                      onClick={() => setSelectedSignalId(sig.id)}
                      className={cn(
                        'w-full text-left py-4 flex items-center justify-between gap-4 cursor-pointer touch-manipulation transition-opacity',
                        selected ? 'opacity-100' : 'opacity-65 hover:opacity-95'
                      )}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2.5 text-[15px] font-semibold text-[#FAFAFA]">
                          <span
                            className={
                              sig.direction === 'Buy' ? 'text-[#34D399]' : 'text-[#F87171]'
                            }
                          >
                            {sig.direction}
                          </span>
                          <span>{sig.symbol}</span>
                          <span className="text-[12.5px] font-normal text-[#71717A]">{sig.tf}</span>
                        </div>
                        <div className="text-[13px] text-[#A1A1AA] truncate">{sig.strategy}</div>
                      </div>

                      <div className="text-right tabular-nums shrink-0">
                        <div className="text-[13.5px] font-semibold text-[#FAFAFA]">
                          {sig.confluence}
                        </div>
                        <div className="text-[12.5px] text-[#71717A]">{sig.entry}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right 5 Cols: Open Setup Details */}
            <div className="lg:col-span-5 space-y-6 lg:border-l lg:border-white/[0.06] lg:pl-12">
              <div className="space-y-1">
                <div className="text-[12px] uppercase tracking-wider font-semibold text-[#34D399]">
                  {activeSignal.confluence}
                </div>
                <h3 className="text-[20px] font-bold text-[#FAFAFA]">
                  {activeSignal.symbol} · {activeSignal.strategy}
                </h3>
                <p className="text-[13px] text-[#71717A]">{activeSignal.management}</p>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-8 pt-2 border-t border-white/[0.06] tabular-nums text-[14px]">
                <div>
                  <div className="text-[11.5px] text-[#71717A]">Entry</div>
                  <div className="font-semibold text-[#FAFAFA] mt-0.5">{activeSignal.entry}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-[#71717A]">Stop Loss</div>
                  <div className="font-semibold text-[#F87171] mt-0.5">{activeSignal.sl}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-[#71717A]">Take Profit 1</div>
                  <div className="font-semibold text-[#34D399] mt-0.5">{activeSignal.tp1}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-[#71717A]">Take Profit 2</div>
                  <div className="font-semibold text-[#34D399] mt-0.5">{activeSignal.tp2}</div>
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                {activeSignal.reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-[13px] text-[#A1A1AA] leading-relaxed">
                    <PiCheck size={14} className="text-[#34D399] shrink-0 mt-1" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="space-y-10">
            {/* Open 4-Metric Floating Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 pb-6 border-b border-white/[0.06] tabular-nums">
              <div>
                <div className="text-[12px] text-[#71717A]">Paper Balance</div>
                <div className="text-[24px] sm:text-[28px] font-bold text-[#FAFAFA] mt-1">$28,460.00</div>
              </div>
              <div>
                <div className="text-[12px] text-[#71717A]">Net Return</div>
                <div className="text-[24px] sm:text-[28px] font-bold text-[#34D399] mt-1">+13.84%</div>
              </div>
              <div>
                <div className="text-[12px] text-[#71717A]">Win Rate</div>
                <div className="text-[24px] sm:text-[28px] font-bold text-[#FAFAFA] mt-1">72.4%</div>
              </div>
              <div>
                <div className="text-[12px] text-[#71717A]">Profit Factor</div>
                <div className="text-[24px] sm:text-[28px] font-bold text-[#FAFAFA] mt-1">2.48</div>
              </div>
            </div>

            {/* Minimal Floating Equity Line directly on Canvas */}
            <div className="w-full">
              <svg viewBox="0 0 800 130" className="w-full h-auto block select-none">
                <defs>
                  <linearGradient id="floatingEquityFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 10 105 L 110 98 L 210 76 L 300 84 L 410 54 L 510 46 L 610 50 L 710 26 L 790 14 L 790 125 L 10 125 Z"
                  fill="url(#floatingEquityFade)"
                />
                <path
                  d="M 10 105 L 110 98 L 210 76 L 300 84 L 410 54 L 510 46 L 610 50 L 710 26 L 790 14"
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {[
                  [110, 98, '#34D399'],
                  [210, 76, '#34D399'],
                  [300, 84, '#F87171'],
                  [410, 54, '#34D399'],
                  [510, 46, '#34D399'],
                  [610, 50, '#FBBF24'],
                  [710, 26, '#34D399'],
                  [790, 14, '#34D399'],
                ].map(([cx, cy, col], idx) => (
                  <circle
                    key={idx}
                    cx={cx as number}
                    cy={cy as number}
                    r="3.5"
                    fill={col as string}
                    stroke="#09090B"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>
            </div>

            {/* Clean Hairline-Divided Ledger Rows */}
            <div className="divide-y divide-white/[0.06]">
              {LEDGER_ROWS.map((row) => (
                <div
                  key={row.id}
                  className="py-4 flex items-center justify-between gap-4 text-[13.5px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-[#FAFAFA] shrink-0">{row.pair}</span>
                    <span className="text-[#71717A] shrink-0">{row.tf}</span>
                    <span className="text-[#A1A1AA] truncate">{row.strategy}</span>
                  </div>

                  <div className="flex items-center gap-6 tabular-nums shrink-0 whitespace-nowrap">
                    <span className="hidden sm:inline text-[#71717A]">{row.management}</span>
                    <span
                      className={cn(
                        'font-semibold',
                        row.positive ? 'text-[#34D399]' : 'text-[#F87171]'
                      )}
                    >
                      {row.pnl}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
