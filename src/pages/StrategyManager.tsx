import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  PiArrowRight,
  PiChartBar,
} from 'react-icons/pi';
import { AutoTraderWidget } from '@/components/shared/AutoTraderWidget';
import { AdaptiveFeedbackWidget } from '@/components/shared/AdaptiveFeedbackWidget';
import { useStrategyOptimizer } from '@/hooks/useStrategyOptimizer';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import {
  ONBOARDING_STRATEGIES,
  type OnboardingStrategyId,
  useOnboardingStore,
} from '@/stores/useOnboardingStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';

interface StrategyCatalogMeta {
  id: OnboardingStrategyId;
  snakeId: string;
  name: string;
  category: 'Reversal' | 'Continuation' | 'Imbalance';
  timeframes: string;
  imageSrc: string;
  summary: string;
  keyRule: string;
}

const STRATEGY_CATALOG: StrategyCatalogMeta[] = [
  {
    id: 'wick-rejection',
    snakeId: 'wick_rejection',
    name: 'Wick Rejection',
    category: 'Reversal',
    timeframes: '1H / 4H',
    imageSrc: '/brand/strategy-wick-rejection.png',
    summary: 'Liquidity sweep rejection wicks at key swing highs and lows filtered by ATR volatility.',
    keyRule: 'Wick >= 2.5x body · Close inside zone',
  },
  {
    id: 'breakout',
    snakeId: 'breakout',
    name: 'Breakout',
    category: 'Continuation',
    timeframes: '1H / 4H / 1D',
    imageSrc: '/brand/strategy-breakout.png',
    summary: 'Range compression breakout backed by volume expansion and higher-timeframe alignment.',
    keyRule: 'Volume >= 1.8x MA · Full body close out',
  },
  {
    id: 'order-block',
    snakeId: 'order_block',
    name: 'Order Block',
    category: 'Reversal',
    timeframes: '1H / 4H',
    imageSrc: '/brand/strategy-order-block.png',
    summary: 'First-touch mitigation of institutional candles prior to fair value gap displacement.',
    keyRule: 'FVG impulse · Proximal or 50% retest',
  },
  {
    id: 'supply-demand',
    snakeId: 'supply_demand',
    name: 'Supply & Demand',
    category: 'Imbalance',
    timeframes: '1H / 4H',
    imageSrc: '/brand/strategy-supply-demand.png',
    summary: 'Fresh unmitigated Drop-Base-Rally and Rally-Base-Drop origin zones.',
    keyRule: 'Fresh zone · Departure >= 2.0x ATR',
  },
  {
    id: 'trend-following',
    snakeId: 'trend_following',
    name: 'Trend Following',
    category: 'Continuation',
    timeframes: '4H / 1D',
    imageSrc: '/brand/strategy-trend-following.png',
    summary: 'EMA 20/50/200 aligned trend pullbacks into the 38.2%–61.8% Fibonacci corridor.',
    keyRule: 'BOS + EMA stack · Trigger candle',
  },
];

function normalizeToCanonicalId(raw?: string): OnboardingStrategyId | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/_/g, '-');
  if (cleaned.includes('wick')) return 'wick-rejection';
  if (cleaned.includes('breakout')) return 'breakout';
  if (cleaned.includes('order')) return 'order-block';
  if (cleaned.includes('supply') || cleaned.includes('demand')) return 'supply-demand';
  if (cleaned.includes('trend')) return 'trend-following';
  return null;
}

function classifySignalOutcome(status?: string): 'win' | 'loss' | 'open' {
  if (!status) return 'open';
  const s = status.toLowerCase();
  if (s === 'win' || s === 'tp_hit' || s === 'tp') return 'win';
  if (s === 'loss' || s === 'sl_hit' || s === 'sl') return 'loss';
  return 'open';
}

export default function StrategyManager() {
  const {
    selectedStrategyIds,
    toggleSelectedStrategy,
    setSelectedStrategies,
    setSelectedStrategy,
  } = useOnboardingStore();
  const signals = useAnalysisSignalStore((s) => s.signals);
  const journal = useTradingContextStore((s) => s.journal);
  const { status: optimizerStatus } = useStrategyOptimizer();

  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | 'Reversal' | 'Continuation' | 'Imbalance'
  >('ALL');

  const activeSet = useMemo(() => new Set(selectedStrategyIds), [selectedStrategyIds]);

  const metricsByStrategy = useMemo(() => {
    const map = new Map<
      OnboardingStrategyId,
      {
        detected: number;
        live: number;
        wins: number;
        losses: number;
        resolved: number;
        winRate: number | null;
        multiplier: number;
        modifiedParams: number;
        totalParams: number;
      }
    >();

    for (const meta of STRATEGY_CATALOG) {
      map.set(meta.id, {
        detected: 0,
        live: 0,
        wins: 0,
        losses: 0,
        resolved: 0,
        winRate: null,
        multiplier: 1,
        modifiedParams: 0,
        totalParams: 0,
      });
    }

    const seenResolvedKeys = new Set<string>();

    for (const sig of signals) {
      const id = normalizeToCanonicalId(sig.strategyId || sig.strategyLabel);
      if (!id) continue;
      const bucket = map.get(id)!;
      bucket.detected += 1;
      const outcome = classifySignalOutcome(sig.status);
      if (outcome === 'win') {
        bucket.wins += 1;
        seenResolvedKeys.add(sig.id);
      } else if (outcome === 'loss') {
        bucket.losses += 1;
        seenResolvedKeys.add(sig.id);
      } else if (sig.status === 'live' || !sig.status) {
        bucket.live += 1;
      }
    }

    for (const entry of journal) {
      if (entry.outcome !== 'win' && entry.outcome !== 'loss') continue;
      if (entry.suggestionKey && seenResolvedKeys.has(entry.suggestionKey)) continue;
      const id = normalizeToCanonicalId(entry.strategy);
      if (!id) continue;
      const bucket = map.get(id)!;
      if (entry.outcome === 'win') bucket.wins += 1;
      if (entry.outcome === 'loss') bucket.losses += 1;
    }

    for (const meta of STRATEGY_CATALOG) {
      const bucket = map.get(meta.id)!;
      bucket.resolved = bucket.wins + bucket.losses;
      bucket.winRate = bucket.resolved > 0 ? (bucket.wins / bucket.resolved) * 100 : null;

      const factory = optimizerStatus?.factoryDefaults?.[meta.snakeId];
      const learned = optimizerStatus?.learnedParameters?.[meta.snakeId];
      if (factory) {
        const entries = Object.entries(factory);
        bucket.totalParams = entries.length;
        let ratioSum = 0;
        let count = 0;
        let modCount = 0;
        for (const [param, defVal] of entries) {
          const liveVal = learned && typeof learned[param] === 'number' ? learned[param] : defVal;
          if (Math.abs(liveVal - defVal) > 0.001) modCount += 1;
          if (defVal !== 0) {
            ratioSum += liveVal / defVal;
            count += 1;
          }
        }
        bucket.modifiedParams = modCount;
        bucket.multiplier = count > 0 ? ratioSum / count : 1;
      }
    }

    return map;
  }, [signals, journal, optimizerStatus]);

  const aggregateStats = useMemo(() => {
    let detected = 0;
    let wins = 0;
    let losses = 0;
    let tunedEngines = 0;
    for (const m of metricsByStrategy.values()) {
      detected += m.detected;
      wins += m.wins;
      losses += m.losses;
      if (m.modifiedParams > 0) tunedEngines += 1;
    }
    const resolved = wins + losses;
    const winRate = resolved > 0 ? (wins / resolved) * 100 : null;
    return {
      activeCount: activeSet.size,
      totalCount: ONBOARDING_STRATEGIES.length,
      detected,
      resolved,
      wins,
      losses,
      winRate,
      tunedEngines,
    };
  }, [metricsByStrategy, activeSet]);

  const visibleStrategies = useMemo(() => {
    if (categoryFilter === 'ALL') return STRATEGY_CATALOG;
    return STRATEGY_CATALOG.filter((s) => s.category === categoryFilter);
  }, [categoryFilter]);

  const handleEnableAll = () => {
    setSelectedStrategies(STRATEGY_CATALOG.map((s) => s.id));
  };

  const handlePauseExtras = () => {
    setSelectedStrategies([]);
  };

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Page Header */}
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[12px] font-medium text-[#71717A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              <span>5 of 5 algorithmic engines unlocked</span>
            </div>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] leading-[1.15] text-[#FAFAFA]">
              Strategies
            </h1>
            <p className="text-[14px] text-[#A1A1AA] max-w-[65ch] leading-relaxed">
              Configure active detection engines, inspect rule specifications, and monitor live adaptive parameter tuning.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={
                aggregateStats.activeCount === aggregateStats.totalCount
                  ? handlePauseExtras
                  : handleEnableAll
              }
              className="h-9 px-4 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[13px] font-medium text-[#FAFAFA] transition-colors"
            >
              {aggregateStats.activeCount === aggregateStats.totalCount
                ? 'Isolate primary'
                : 'Enable all engines'}
            </button>

            <Link
              to="/backtesting"
              className="h-9 px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13px] font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <PiChartBar size={15} />
              Backtesting workbench
            </Link>
          </div>
        </header>

        {/* Unified Portfolio Summary Bar */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-6 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
          <div className="pb-4 lg:pb-0 lg:pr-6">
            <p className="text-[12px] font-medium text-[#71717A]">Active strategies</p>
            <p className="text-[26px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1.5">
              {aggregateStats.activeCount}
              <span className="text-[14px] text-[#71717A] font-normal ml-1">
                / {aggregateStats.totalCount}
              </span>
            </p>
            <p className="text-[12px] text-[#71717A] mt-1">All core engines unlocked</p>
          </div>

          <div className="pb-4 lg:pb-0 pl-4 sm:pl-6 lg:px-6 !border-t-0">
            <p className="text-[12px] font-medium text-[#71717A]">Detected setups</p>
            <p className="text-[26px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1.5">
              {aggregateStats.detected}
            </p>
            <p className="text-[12px] text-[#71717A] mt-1">
              {aggregateStats.detected === 0 ? 'Awaiting scanner feed' : 'Live workspace store'}
            </p>
          </div>

          <div className="pt-4 lg:pt-0 pr-4 lg:px-6">
            <p className="text-[12px] font-medium text-[#71717A]">Resolved trades</p>
            <p className="text-[26px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1.5">
              {aggregateStats.resolved}
            </p>
            <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-1">
              {aggregateStats.resolved > 0 ? (
                <>
                  <span className="text-[#34D399]">{aggregateStats.wins}W</span>
                  {' / '}
                  <span className="text-[#F87171]">{aggregateStats.losses}L</span>
                </>
              ) : (
                '0 trades resolved yet'
              )}
            </p>
          </div>

          <div className="pt-4 lg:pt-0 pl-4 sm:pl-6">
            <p className="text-[12px] font-medium text-[#71717A]">Portfolio win rate</p>
            <p
              className={`text-[26px] leading-tight font-mono font-semibold tabular-nums mt-1.5 ${
                aggregateStats.winRate === null
                  ? 'text-[#71717A]'
                  : aggregateStats.winRate >= 50
                  ? 'text-[#34D399]'
                  : 'text-[#F87171]'
              }`}
            >
              {aggregateStats.winRate !== null ? `${aggregateStats.winRate.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[12px] text-[#71717A] mt-1">
              <span className="font-mono tabular-nums">{aggregateStats.tunedEngines}</span>{' '}
              {aggregateStats.tunedEngines === 1 ? 'engine calibrated' : 'engines calibrated'}
            </p>
          </div>
        </section>

        {/* Strategy Cards Grid */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
              Detection engines
            </h2>

            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#111113] border border-white/[0.07]">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'Reversal', label: 'Reversal' },
                  { id: 'Continuation', label: 'Continuation' },
                  { id: 'Imbalance', label: 'Imbalance' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                    categoryFilter === cat.id
                      ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleStrategies.map((meta) => {
              const isActive = activeSet.has(meta.id);
              const stats = metricsByStrategy.get(meta.id)!;

              return (
                <article
                  key={meta.id}
                  className="rounded-2xl bg-[#111113] border border-white/[0.07] hover:border-white/[0.14] overflow-hidden transition-colors flex flex-col justify-between group"
                >
                  <div>
                    {/* 16:9 Visual Showcase Strip */}
                    <Link
                      to={`/strategies/${meta.id}`}
                      onClick={() => setSelectedStrategy(meta.id)}
                      className="block relative aspect-video w-full bg-[#111113] overflow-hidden"
                    >
                      <img
                        src={meta.imageSrc}
                        alt={`${meta.name} schematic`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        style={{
                          maskImage:
                            'linear-gradient(to bottom, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 100%)',
                          WebkitMaskImage:
                            'linear-gradient(to bottom, rgba(0,0,0,1) 58%, rgba(0,0,0,0) 100%)',
                        }}
                      />

                      <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-[#09090B]/80 backdrop-blur-sm border border-white/[0.08] text-[12px] font-medium text-[#A1A1AA]">
                          {meta.category}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-[#09090B]/80 backdrop-blur-sm border border-white/[0.08] text-[12px] font-mono tabular-nums text-[#A1A1AA]">
                          {meta.timeframes}
                        </span>
                      </div>
                    </Link>

                    {/* Card Body */}
                    <div className="px-6 pb-5 pt-2 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link
                            to={`/strategies/${meta.id}`}
                            onClick={() => setSelectedStrategy(meta.id)}
                            className="text-[18px] font-medium tracking-[-0.015em] text-[#FAFAFA] hover:text-[#34D399] transition-colors"
                          >
                            {meta.name}
                          </Link>
                          <p className="text-[12px] text-[#71717A] mt-0.5">{meta.keyRule}</p>
                        </div>

                        {/* Tactile Enable/Disable Switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          aria-label={`Toggle ${meta.name}`}
                          onClick={() => toggleSelectedStrategy(meta.id)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center overflow-hidden rounded-full border p-[3px] transition-colors ${
                            isActive
                              ? 'bg-[#34D399]/20 border-[#34D399]/40'
                              : 'bg-[#18181B] border-white/[0.1]'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-full transition-transform duration-150 ${
                              isActive
                                ? 'translate-x-5 bg-[#34D399]'
                                : 'translate-x-0 bg-[#71717A]'
                            }`}
                          />
                        </button>
                      </div>

                      <p className="text-[14px] text-[#A1A1AA] leading-relaxed">
                        {meta.summary}
                      </p>
                    </div>
                  </div>

                  {/* Inline Telemetry & Actions */}
                  <div className="px-6 pb-6 space-y-4">
                    <div className="pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[12px] text-[#71717A]">Signals</p>
                        <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-0.5">
                          {stats.detected}
                          {stats.live > 0 && (
                            <span className="text-[12px] font-normal text-[#34D399] ml-1.5">
                              {stats.live} live
                            </span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[12px] text-[#71717A]">Win rate</p>
                        <p
                          className={`text-[15px] font-mono font-semibold tabular-nums mt-0.5 ${
                            stats.winRate === null
                              ? 'text-[#71717A]'
                              : stats.winRate >= 50
                              ? 'text-[#34D399]'
                              : 'text-[#F87171]'
                          }`}
                        >
                          {stats.winRate !== null ? `${stats.winRate.toFixed(1)}%` : '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-[12px] text-[#71717A]">Multiplier</p>
                        <p
                          className={`text-[15px] font-mono font-semibold tabular-nums mt-0.5 ${
                            stats.modifiedParams > 0 ? 'text-[#34D399]' : 'text-[#FAFAFA]'
                          }`}
                        >
                          {stats.multiplier.toFixed(2)}x
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                      <Link
                        to={`/strategies/${meta.id}`}
                        onClick={() => setSelectedStrategy(meta.id)}
                        className="text-[13px] font-medium text-[#FAFAFA] hover:text-[#34D399] inline-flex items-center gap-1.5 transition-colors"
                      >
                        Inspect rules
                        <PiArrowRight size={14} />
                      </Link>

                      <Link
                        to={`/backtesting?strategy=${meta.id}`}
                        className="h-8 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[12.5px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
                      >
                        <PiChartBar size={13} />
                        Backtest
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Execution & Adaptive Engine Area */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <AutoTraderWidget />
          </div>
          <div className="lg:col-span-7">
            <AdaptiveFeedbackWidget />
          </div>
        </section>
      </div>
    </div>
  );
}
