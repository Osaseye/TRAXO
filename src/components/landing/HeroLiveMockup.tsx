import { useEffect, useMemo, useState } from 'react';
import { PiArrowCounterClockwise, PiPause, PiPlay } from 'react-icons/pi';
import { cn } from '@/lib/utils';

export type HeroPairId = 'EURUSD' | 'XAUUSD' | 'MNQ';

interface SimCandle {
  o: number;
  h: number;
  l: number;
  c: number;
}

interface HeroScenario {
  id: HeroPairId;
  label: string;
  timeframe: string;
  engine: string;
  orderLabel: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  digits: number;
  startBalance: number;
  tp1Credit: number;
  tp2Credit: number;
  candles: SimCandle[];
}

const SCENARIOS: Record<HeroPairId, HeroScenario> = {
  EURUSD: {
    id: 'EURUSD',
    label: 'EUR/USD',
    timeframe: '15m',
    engine: 'London Apex',
    orderLabel: 'Buy Limit',
    entry: 1.0842,
    sl: 1.0828,
    tp1: 1.0866,
    tp2: 1.0884,
    digits: 5,
    startBalance: 25000,
    tp1Credit: 360,
    tp2Credit: 630,
    candles: [
      { o: 1.0858, h: 1.0862, l: 1.0853, c: 1.0855 },
      { o: 1.0855, h: 1.0858, l: 1.0849, c: 1.0851 },
      { o: 1.0851, h: 1.0856, l: 1.0848, c: 1.0854 },
      { o: 1.0854, h: 1.0859, l: 1.085, c: 1.0852 },
      { o: 1.0852, h: 1.0854, l: 1.0846, c: 1.0848 },
      { o: 1.0848, h: 1.0852, l: 1.0844, c: 1.085 },
      { o: 1.085, h: 1.0853, l: 1.0845, c: 1.0847 },
      { o: 1.0847, h: 1.0849, l: 1.0841, c: 1.0845 },
      { o: 1.0845, h: 1.0848, l: 1.0835, c: 1.0846 },
      { o: 1.0846, h: 1.0854, l: 1.0844, c: 1.0852 },
      { o: 1.0852, h: 1.0855, l: 1.0847, c: 1.0848 },
      { o: 1.0848, h: 1.085, l: 1.0843, c: 1.0845 },
      { o: 1.0845, h: 1.0849, l: 1.084, c: 1.0848 },
      { o: 1.0848, h: 1.0856, l: 1.0847, c: 1.0855 },
      { o: 1.0855, h: 1.0861, l: 1.0852, c: 1.086 },
      { o: 1.086, h: 1.0864, l: 1.0857, c: 1.0863 },
      { o: 1.0863, h: 1.0869, l: 1.086, c: 1.0867 },
      { o: 1.0867, h: 1.0871, l: 1.0861, c: 1.0864 },
      { o: 1.0864, h: 1.0874, l: 1.0862, c: 1.0873 },
      { o: 1.0873, h: 1.0881, l: 1.087, c: 1.0879 },
      { o: 1.0879, h: 1.0887, l: 1.0876, c: 1.0885 },
      { o: 1.0885, h: 1.089, l: 1.0881, c: 1.0888 },
      { o: 1.0888, h: 1.0891, l: 1.0884, c: 1.0889 },
    ],
  },
  XAUUSD: {
    id: 'XAUUSD',
    label: 'XAU/USD',
    timeframe: '15m',
    engine: 'Aurum Sweep',
    orderLabel: 'Buy Limit',
    entry: 2648.5,
    sl: 2641.0,
    tp1: 2661.0,
    tp2: 2671.0,
    digits: 2,
    startBalance: 25000,
    tp1Credit: 420,
    tp2Credit: 680,
    candles: [
      { o: 2655, h: 2657, l: 2652, c: 2653.5 },
      { o: 2653.5, h: 2655, l: 2650.5, c: 2651.8 },
      { o: 2651.8, h: 2654, l: 2650, c: 2653 },
      { o: 2653, h: 2654.5, l: 2649.8, c: 2651 },
      { o: 2651, h: 2652.5, l: 2648.5, c: 2650.2 },
      { o: 2650.2, h: 2652, l: 2648, c: 2651.4 },
      { o: 2651.4, h: 2653, l: 2649, c: 2649.8 },
      { o: 2649.8, h: 2651, l: 2647.5, c: 2649.2 },
      { o: 2649.2, h: 2650.5, l: 2643.2, c: 2649.6 },
      { o: 2649.6, h: 2654.2, l: 2648.8, c: 2653.5 },
      { o: 2653.5, h: 2654.8, l: 2650.2, c: 2651.2 },
      { o: 2651.2, h: 2652.4, l: 2649.0, c: 2649.9 },
      { o: 2649.9, h: 2652.5, l: 2647.8, c: 2651.8 },
      { o: 2651.8, h: 2656.5, l: 2651.0, c: 2655.9 },
      { o: 2655.9, h: 2659.2, l: 2654.5, c: 2658.4 },
      { o: 2658.4, h: 2660.5, l: 2657.2, c: 2660.1 },
      { o: 2660.1, h: 2662.8, l: 2659.0, c: 2662.1 },
      { o: 2662.1, h: 2664.2, l: 2657.8, c: 2661.5 },
      { o: 2661.5, h: 2667.0, l: 2661.0, c: 2666.4 },
      { o: 2666.4, h: 2669.8, l: 2665.2, c: 2669.1 },
      { o: 2669.1, h: 2673.2, l: 2668.4, c: 2672.4 },
      { o: 2672.4, h: 2674.8, l: 2671.0, c: 2673.9 },
      { o: 2673.9, h: 2675.2, l: 2671.8, c: 2674.2 },
    ],
  },
  MNQ: {
    id: 'MNQ',
    label: 'MNQ',
    timeframe: '5m',
    engine: 'Velocity ORB',
    orderLabel: 'Buy Stop',
    entry: 21418.5,
    sl: 21398.5,
    tp1: 21452.5,
    tp2: 21478.5,
    digits: 2,
    startBalance: 25000,
    tp1Credit: 340,
    tp2Credit: 600,
    candles: [
      { o: 21410, h: 21415, l: 21406, c: 21408 },
      { o: 21408, h: 21413, l: 21404, c: 21411 },
      { o: 21411, h: 21416, l: 21407, c: 21409 },
      { o: 21409, h: 21414, l: 21405, c: 21412 },
      { o: 21412, h: 21417, l: 21408, c: 21410 },
      { o: 21410, h: 21415, l: 21406, c: 21413 },
      { o: 21413, h: 21416, l: 21408, c: 21411 },
      { o: 21411, h: 21415, l: 21405, c: 21409 },
      { o: 21409, h: 21417, l: 21402, c: 21415 },
      { o: 21415, h: 21418, l: 21411, c: 21416 },
      { o: 21416, h: 21418, l: 21412, c: 21414 },
      { o: 21414, h: 21418.2, l: 21413, c: 21417.5 },
      { o: 21417.5, h: 21428, l: 21416, c: 21426.5 },
      { o: 21426.5, h: 21437, l: 21424, c: 21435 },
      { o: 21435, h: 21445, l: 21432, c: 21443.5 },
      { o: 21443.5, h: 21450, l: 21441, c: 21449 },
      { o: 21449, h: 21456, l: 21447, c: 21454 },
      { o: 21454, h: 21458, l: 21445, c: 21451 },
      { o: 21451, h: 21466, l: 21449, c: 21464 },
      { o: 21464, h: 21474, l: 21461, c: 21472 },
      { o: 21472, h: 21483, l: 21470, c: 21480.5 },
      { o: 21480.5, h: 21486, l: 21476, c: 21484 },
      { o: 21484, h: 21488, l: 21479, c: 21486 },
    ],
  },
};

const MAX_STEP = 25;

interface HeroLiveMockupProps {
  activePair: HeroPairId;
  onSelectPair: (pair: HeroPairId) => void;
}

export function HeroLiveMockup({ activePair, onSelectPair }: HeroLiveMockupProps) {
  const [step, setStep] = useState(11);
  const [playing, setPlaying] = useState(true);

  const scenario = SCENARIOS[activePair];

  useEffect(() => {
    setStep(6);
  }, [activePair]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStep((prev) => (prev >= MAX_STEP ? 2 : prev + 1));
    }, 300);
    return () => clearInterval(timer);
  }, [playing]);

  const visibleCount = Math.min(scenario.candles.length, Math.max(4, step + 1));
  const visibleCandles = scenario.candles.slice(0, visibleCount);

  const levelsVisible = step >= 9;
  const filled = step >= 12;
  const tp1Hit = step >= 16;
  const tp2Hit = step >= 20;

  const currentBalance = tp2Hit
    ? scenario.startBalance + scenario.tp1Credit + scenario.tp2Credit
    : tp1Hit
    ? scenario.startBalance + scenario.tp1Credit
    : scenario.startBalance;

  const profitDelta = currentBalance - scenario.startBalance;

  const statusLine = tp2Hit
    ? `Target 2 reached · +$${(scenario.tp1Credit + scenario.tp2Credit).toLocaleString()} credited`
    : tp1Hit
    ? `Target 1 banked (+$${scenario.tp1Credit}) · Stop moved to breakeven`
    : filled
    ? `${scenario.orderLabel} filled at ${scenario.entry.toFixed(scenario.digits)}`
    : levelsVisible
    ? `Drawing Entry, Stop Loss & Take Profit`
    : `Scanning ${scenario.label} ${scenario.timeframe} structure`;

  const chartGeom = useMemo(() => {
    const w = 760;
    const h = 320;
    const padL = 8;
    const padR = 112;
    const padT = 24;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let minP = Math.min(scenario.sl, ...scenario.candles.map((c) => c.l));
    let maxP = Math.max(scenario.tp2, ...scenario.candles.map((c) => c.h));
    const padSpan = (maxP - minP) * 0.1;
    minP -= padSpan;
    maxP += padSpan;
    const span = maxP - minP;

    const toY = (p: number) => padT + ((maxP - p) / span) * plotH;
    const colW = plotW / scenario.candles.length;
    const toX = (i: number) => padL + (i + 0.5) * colW;
    const candleW = Math.max(8, Math.min(16, colW * 0.52));

    return { w, h, padL, padR, padT, padB, plotW, plotH, minP, maxP, toY, toX, candleW };
  }, [scenario]);

  const activeSl = tp1Hit ? scenario.entry : scenario.sl;

  return (
    <div className="font-sans text-left space-y-6 sm:space-y-8">
      {/* Top Single-Line Row: Market Switcher Left, Floating Balance Right */}
      <div className="border-t border-white/[0.06] pt-6 sm:pt-8 flex items-end justify-between gap-4">
        <div className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar">
          {(['EURUSD', 'XAUUSD', 'MNQ'] as HeroPairId[]).map((pair) => {
            const isSelected = activePair === pair;
            return (
              <button
                key={pair}
                type="button"
                onClick={() => onSelectPair(pair)}
                className={cn(
                  'relative pb-2 text-[14px] sm:text-[15px] whitespace-nowrap shrink-0 cursor-pointer touch-manipulation transition-colors',
                  isSelected
                    ? 'text-[#FAFAFA] font-semibold'
                    : 'text-[#71717A] hover:text-[#A1A1AA] font-medium'
                )}
              >
                {SCENARIOS[pair].label}
                {isSelected && (
                  <span className="absolute inset-x-0 bottom-0 h-[1.5px] bg-[#FAFAFA]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="text-right shrink-0 whitespace-nowrap tabular-nums">
          <div className="text-[11px] font-medium text-[#71717A]">Balance</div>
          <div className="flex items-baseline justify-end gap-2 mt-0.5">
            <span className="text-[18px] sm:text-[24px] font-bold tracking-tight text-[#FAFAFA]">
              ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {profitDelta > 0 && (
              <span className="text-[13px] sm:text-[14px] font-semibold text-[#34D399]">
                +${profitDelta.toLocaleString('en-US')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Wide Floating Candlestick Sequence */}
      <div className="w-full py-1">
        <svg
          viewBox={`0 0 ${chartGeom.w} ${chartGeom.h}`}
          className="w-full h-auto block select-none"
          role="img"
          aria-label={`Animated ${scenario.label} execution sequence`}
        >
          {[0.25, 0.55, 0.85].map((f) => {
            const y = chartGeom.padT + f * chartGeom.plotH;
            return (
              <line
                key={f}
                x1={chartGeom.padL}
                x2={chartGeom.w - chartGeom.padR}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.035)"
                strokeWidth="1"
              />
            );
          })}

          {levelsVisible && (() => {
            const xStart = chartGeom.toX(9);
            const rightEdge = chartGeom.w - chartGeom.padR;
            const width = Math.max(20, rightEdge - xStart);
            const yEntry = chartGeom.toY(scenario.entry);
            const yInitialSl = chartGeom.toY(scenario.sl);
            const yActiveSl = chartGeom.toY(activeSl);
            const yTp1 = chartGeom.toY(scenario.tp1);
            const yTp2 = chartGeom.toY(scenario.tp2);

            return (
              <g>
                <rect
                  x={xStart}
                  y={Math.min(yEntry, yInitialSl)}
                  width={width}
                  height={Math.max(2, Math.abs(yInitialSl - yEntry))}
                  fill="#F87171"
                  fillOpacity={tp1Hit ? 0.02 : 0.055}
                />
                <rect
                  x={xStart}
                  y={Math.min(yEntry, yTp1)}
                  width={width}
                  height={Math.max(2, Math.abs(yTp1 - yEntry))}
                  fill="#34D399"
                  fillOpacity={tp1Hit ? 0.075 : 0.04}
                />
                <rect
                  x={xStart}
                  y={Math.min(yTp1, yTp2)}
                  width={width}
                  height={Math.max(2, Math.abs(yTp2 - yTp1))}
                  fill="#34D399"
                  fillOpacity={tp2Hit ? 0.085 : 0.03}
                />

                {[
                  {
                    key: 'TP2',
                    label: `TP2  ${scenario.tp2.toFixed(scenario.digits >= 5 ? 4 : 2)}`,
                    y: yTp2,
                    color: '#34D399',
                    dash: '3 4',
                  },
                  {
                    key: 'TP1',
                    label: `TP1  ${scenario.tp1.toFixed(scenario.digits >= 5 ? 4 : 2)}`,
                    y: yTp1,
                    color: '#34D399',
                    dash: '4 4',
                  },
                  {
                    key: 'ENTRY',
                    label: `Entry  ${scenario.entry.toFixed(scenario.digits >= 5 ? 4 : 2)}`,
                    y: yEntry,
                    color: '#A1A1AA',
                    dash: '3 4',
                  },
                  {
                    key: 'SL',
                    label: `${tp1Hit ? 'Breakeven' : 'Stop'}  ${activeSl.toFixed(scenario.digits >= 5 ? 4 : 2)}`,
                    y: yActiveSl,
                    color: tp1Hit ? '#FBBF24' : '#F87171',
                    dash: tp1Hit ? '6 3' : '4 4',
                  },
                ].map((lvl) => (
                  <g key={lvl.key}>
                    <line
                      x1={xStart}
                      x2={rightEdge}
                      y1={lvl.y}
                      y2={lvl.y}
                      stroke={lvl.color}
                      strokeOpacity="0.68"
                      strokeWidth="1.2"
                      strokeDasharray={lvl.dash}
                    />
                    <text
                      x={rightEdge + 10}
                      y={lvl.y + 4}
                      fill={lvl.color}
                      fontSize="12"
                      fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                      fontWeight="500"
                    >
                      {lvl.label}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}

          {visibleCandles.map((c, idx) => {
            const x = chartGeom.toX(idx);
            const yO = chartGeom.toY(c.o);
            const yC = chartGeom.toY(c.c);
            const yH = chartGeom.toY(c.h);
            const yL = chartGeom.toY(c.l);
            const up = c.c >= c.o;
            const col = up ? '#34D399' : '#52525B';
            return (
              <g key={idx}>
                <line x1={x} x2={x} y1={yH} y2={yL} stroke={col} strokeWidth="1.5" />
                <rect
                  x={x - chartGeom.candleW / 2}
                  y={Math.min(yO, yC)}
                  width={chartGeom.candleW}
                  height={Math.max(2.5, Math.abs(yC - yO))}
                  rx="2"
                  fill={col}
                />
              </g>
            );
          })}

          {filled && (
            <g>
              <circle cx={chartGeom.toX(12)} cy={chartGeom.toY(scenario.entry)} r="4.5" fill="#FAFAFA" />
              <text
                x={chartGeom.toX(12)}
                y={chartGeom.toY(scenario.entry) + 19}
                textAnchor="middle"
                fill="#A1A1AA"
                fontSize="11.5"
                fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                fontWeight="600"
              >
                Filled
              </text>
            </g>
          )}

          {tp1Hit && (
            <g>
              <circle cx={chartGeom.toX(16)} cy={chartGeom.toY(scenario.tp1)} r="5" fill="#34D399" />
              <text
                x={chartGeom.toX(16)}
                y={Math.max(15, chartGeom.toY(scenario.tp1) - 13)}
                textAnchor="middle"
                fill="#34D399"
                fontSize="11.5"
                fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                fontWeight="600"
              >
                TP1 +${scenario.tp1Credit}
              </text>
            </g>
          )}

          {tp2Hit && (
            <g>
              <circle cx={chartGeom.toX(20)} cy={chartGeom.toY(scenario.tp2)} r="5.5" fill="#34D399" />
              <text
                x={chartGeom.toX(20)}
                y={Math.max(15, chartGeom.toY(scenario.tp2) - 13)}
                textAnchor="middle"
                fill="#34D399"
                fontSize="12"
                fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                fontWeight="700"
              >
                TP2 +${scenario.tp2Credit}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Clean Status Bar (Single Line, No Cramped Multi-Item Wrapping) */}
      <div className="border-t border-white/[0.06] pt-4 flex items-center justify-between gap-4 text-[13px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] shrink-0" />
          <span className="text-[#A1A1AA] truncate">
            <span className="text-[#FAFAFA] font-medium">{scenario.engine}</span> · {statusLine}
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0 text-[#71717A] whitespace-nowrap">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex items-center gap-1.5 hover:text-[#FAFAFA] transition-colors cursor-pointer touch-manipulation"
          >
            {playing ? <PiPause size={13} /> : <PiPlay size={13} />}
            <span>{playing ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(2);
              setPlaying(true);
            }}
            aria-label="Replay sequence"
            className="inline-flex items-center gap-1 hover:text-[#FAFAFA] transition-colors cursor-pointer touch-manipulation"
          >
            <PiArrowCounterClockwise size={13} />
            <span className="hidden sm:inline">Replay</span>
          </button>
        </div>
      </div>
    </div>
  );
}
