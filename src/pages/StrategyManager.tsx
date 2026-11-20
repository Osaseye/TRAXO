import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PiArrowRight, PiChartBar } from 'react-icons/pi';
import { AutoTraderWidget } from '@/components/shared/AutoTraderWidget';
import { AdaptiveFeedbackWidget } from '@/components/shared/AdaptiveFeedbackWidget';
import { TraxoStrategyVisual } from '@/components/strategies/TraxoStrategyVisual';
import { useStrategyOptimizer } from '@/hooks/useStrategyOptimizer';
import {
  TRAXO_STRATEGIES,
  normalizeTraxoStrategyId,
  type TraxoCatalogStrategyId,
  type TraxoMarketPillar,
  type TraxoStrategyCategory,
} from '@/lib/traxoStrategies';
import { useAnalysisSignalStore } from '@/stores/useAnalysisSignalStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';

function classifySignalOutcome(status?: string): 'win' | 'loss' | 'open' {
  if (!status) return 'open';
  const s = status.toLowerCase();
  if (s === 'win' || s === 'tp_hit' || s === 'tp') return 'win';
  if (s === 'loss' || s === 'sl_hit' || s === 'sl') return 'loss';
  return 'open';
}

function formatSymbolStrip(symbols: string[]): string {
  if (symbols.length <= 5) return symbols.join(' · ');
  return `${symbols.slice(0, 5).join(' · ')} +${symbols.length - 5}`;
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

  const [marketFilter, setMarketFilter] = useState<'ALL' | TraxoMarketPillar>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | TraxoStrategyCategory>('ALL');

  const activeSet = useMemo(() => new Set(selectedStrategyIds), [selectedStrategyIds]);

  const metricsByStrategy = useMemo(() => {
    const map = new Map<
      TraxoCatalogStrategyId,
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

    for (const meta of TRAXO_STRATEGIES) {
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
      const id = normalizeTraxoStrategyId(sig.strategyId || sig.strategyLabel);
      if (!id) continue;
      const bucket = map.get(id);
      if (!bucket) continue;
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
      const id = normalizeTraxoStrategyId(entry.strategy);
      if (!id) continue;
      const bucket = map.get(id);
      if (!bucket) continue;
      if (entry.outcome === 'win') bucket.wins += 1;
      if (entry.outcome === 'loss') bucket.losses += 1;
    }

    for (const meta of TRAXO_STRATEGIES) {
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
    let activeCount = 0;
    let fxActive = 0;
    let goldActive = 0;
    let futuresActive = 0;

    for (const meta of TRAXO_STRATEGIES) {
      if (activeSet.has(meta.id)) {
        activeCount += 1;
        if (meta.market === 'FOREX') fxActive += 1;
        else if (meta.market === 'GOLD') goldActive += 1;
        else futuresActive += 1;
      }
      const m = metricsByStrategy.get(meta.id)!;
      detected += m.detected;
      wins += m.wins;
      losses += m.losses;
      if (m.modifiedParams > 0) tunedEngines += 1;
    }

    const resolved = wins + losses;
    const winRate = resolved > 0 ? (wins / resolved) * 100 : null;

    return {
      activeCount,
      totalCount: TRAXO_STRATEGIES.length,
      fxActive,
      goldActive,
      futuresActive,
      detected,
      resolved,
      wins,
      losses,
      winRate,
      tunedEngines,
    };
  }, [metricsByStrategy, activeSet]);

  const visibleStrategies = useMemo(() => {
    return TRAXO_STRATEGIES.filter((s) => {
      if (marketFilter !== 'ALL' && s.market !== marketFilter) return false;
      if (categoryFilter !== 'ALL' && s.category !== categoryFilter) return false;
      return true;
    });
  }, [marketFilter, categoryFilter]);

  const handleEnableAll = () => {
    setSelectedStrategies(TRAXO_STRATEGIES.map((s) => s.id));
  };

  const handleIsolatePrimary = () => {
    setSelectedStrategies([TRAXO_STRATEGIES[0].id]);
  };

  return (
    <div className="min-h-full bg-[#09090B] text-[#FAFAFA] font-sans overflow-x-hidden">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 sm:space-y-2 min-w-0">
            <p className="text-[12px] font-medium text-[#71717A] tracking-[0.02em]">
              15 TRAXO proprietary engines · Forex · Gold (XAU/USD) · MNQ Futures
            </p>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] leading-[1.15] text-[#FAFAFA]">
              Strategies
            </h1>
            <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA] max-w-[68ch] leading-relaxed">
              Manage all 15 modular TRAXO detection engines, inspect institutional rule specifications, and monitor live adaptive parameter tuning across Forex Majors, Spot Gold, and Micro Nasdaq Futures.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={
                aggregateStats.activeCount === aggregateStats.totalCount
                  ? handleIsolatePrimary
                  : handleEnableAll
              }
              className="h-10 sm:h-9 px-3 sm:px-4 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[12.5px] sm:text-[13px] font-medium text-[#FAFAFA] transition-colors inline-flex items-center justify-center whitespace-nowrap"
            >
              {aggregateStats.activeCount === aggregateStats.totalCount
                ? 'Isolate primary'
                : 'Enable all engines'}
            </button>

            <Link
              to="/backtesting"
              className="h-10 sm:h-9 px-3 sm:px-4 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[12.5px] sm:text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap"
            >
              <PiChartBar size={15} className="shrink-0" />
              <span className="sm:hidden">Backtesting</span>
              <span className="hidden sm:inline">Backtesting workbench</span>
            </Link>
          </div>
        </header>

        {/* Unified Portfolio Summary Bar */}
        <section className="rounded-2xl bg-[#111113] border border-white/[0.07] p-3.5 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-0 lg:divide-x lg:divide-white/[0.06]">
          <div className="rounded-xl bg-[#161619] lg:bg-transparent lg:rounded-none p-3.5 sm:p-4 lg:p-0 lg:pr-6">
            <p className="text-[11.5px] sm:text-[12px] font-medium text-[#71717A]">Active engines</p>
            <p className="text-[22px] sm:text-[26px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1 sm:mt-1.5">
              {aggregateStats.activeCount}
              <span className="text-[13px] sm:text-[14px] text-[#71717A] font-normal ml-1">
                / {aggregateStats.totalCount}
              </span>
            </p>
            <p className="text-[11.5px] sm:text-[12px] text-[#71717A] mt-1 truncate font-mono tabular-nums">
              {aggregateStats.fxActive} FX · {aggregateStats.goldActive} Gold · {aggregateStats.futuresActive} MNQ
            </p>
          </div>

          <div className="rounded-xl bg-[#161619] lg:bg-transparent lg:rounded-none p-3.5 sm:p-4 lg:p-0 lg:px-6">
            <p className="text-[11.5px] sm:text-[12px] font-medium text-[#71717A]">Detected setups</p>
            <p className="text-[22px] sm:text-[26px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1 sm:mt-1.5">
              {aggregateStats.detected}
            </p>
            <p className="text-[11.5px] sm:text-[12px] text-[#71717A] mt-1 truncate">
              {aggregateStats.detected === 0 ? 'Awaiting scanner feed' : 'Live workspace store'}
            </p>
          </div>

          <div className="rounded-xl bg-[#161619] lg:bg-transparent lg:rounded-none p-3.5 sm:p-4 lg:p-0 lg:px-6">
            <p className="text-[11.5px] sm:text-[12px] font-medium text-[#71717A]">Resolved trades</p>
            <p className="text-[22px] sm:text-[26px] leading-tight font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1 sm:mt-1.5">
              {aggregateStats.resolved}
            </p>
            <p className="text-[11.5px] sm:text-[12px] font-mono tabular-nums text-[#71717A] mt-1 truncate">
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

          <div className="rounded-xl bg-[#161619] lg:bg-transparent lg:rounded-none p-3.5 sm:p-4 lg:p-0 lg:pl-6">
            <p className="text-[11.5px] sm:text-[12px] font-medium text-[#71717A]">Portfolio win rate</p>
            <p
              className={`text-[22px] sm:text-[26px] leading-tight font-mono font-semibold tabular-nums mt-1 sm:mt-1.5 ${
                aggregateStats.winRate === null
                  ? 'text-[#71717A]'
                  : aggregateStats.winRate >= 50
                  ? 'text-[#34D399]'
                  : 'text-[#F87171]'
              }`}
            >
              {aggregateStats.winRate !== null ? `${aggregateStats.winRate.toFixed(1)}%` : '—'}
            </p>
            <p className="text-[11.5px] sm:text-[12px] text-[#71717A] mt-1 truncate">
              <span className="font-mono tabular-nums">{aggregateStats.tunedEngines}</span>{' '}
              {aggregateStats.tunedEngines === 1 ? 'engine calibrated' : 'engines calibrated'}
            </p>
          </div>
        </section>

        {/* Market Pillar & Archetype Filter Controls + Grid */}
        <section className="space-y-4 sm:space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.02em] text-[#FAFAFA]">
                Proprietary engines
              </h2>
              <div className="flex items-center gap-1 p-1 rounded-full bg-[#111113] border border-white/[0.07] overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'ALL', label: 'All (15)' },
                    { id: 'FOREX', label: 'Forex Majors (5)' },
                    { id: 'GOLD', label: 'Gold · XAU/USD (5)' },
                    { id: 'FUTURES', label: 'Futures · MNQ (5)' },
                  ] as const
                ).map((pillar) => (
                  <button
                    key={pillar.id}
                    type="button"
                    onClick={() => setMarketFilter(pillar.id)}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] sm:text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                      marketFilter === pillar.id
                        ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                        : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                    }`}
                  >
                    {pillar.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-full bg-[#111113] border border-white/[0.07] overflow-x-auto max-w-full w-full lg:w-auto">
              {(
                [
                  { id: 'ALL', label: 'All archetypes' },
                  { id: 'Reversal', label: 'Reversal' },
                  { id: 'Continuation', label: 'Continuation' },
                  { id: 'Imbalance', label: 'Imbalance' },
                  { id: 'Mean Reversion', label: 'Mean Reversion' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`flex-1 lg:flex-none px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                    categoryFilter === cat.id
                      ? 'bg-[#18181B] text-[#FAFAFA] border border-white/[0.12]'
                      : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {visibleStrategies.length === 0 ? (
            <div className="rounded-2xl bg-[#111113] border border-white/[0.07] p-8 text-center space-y-2">
              <p className="text-[15px] font-medium text-[#FAFAFA]">
                No proprietary engines match the selected market and archetype filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMarketFilter('ALL');
                  setCategoryFilter('ALL');
                }}
                className="text-[13px] font-medium text-[#34D399] hover:underline"
              >
                Reset filters to view all 15 engines
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {visibleStrategies.map((meta) => {
                const isActive = activeSet.has(meta.id);
                const stats = metricsByStrategy.get(meta.id)!;

                return (
                  <article
                    key={meta.id}
                    className="rounded-2xl bg-[#111113] border border-white/[0.07] hover:border-white/[0.14] overflow-hidden transition-colors flex flex-col justify-between group"
                  >
                    <div>
                      {/* 16:9 On-Brand Institutional Candlestick Schematic */}
                      <Link
                        to={`/strategies/${meta.id}`}
                        onClick={() => setSelectedStrategy(meta.id)}
                        className="block relative aspect-video w-full bg-[#09090B] overflow-hidden"
                      >
                        <div
                          className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]"
                          style={{
                            maskImage:
                              'linear-gradient(to bottom, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                            WebkitMaskImage:
                              'linear-gradient(to bottom, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                          }}
                        >
                          <TraxoStrategyVisual strategyId={meta.id} />
                        </div>

                        <div className="absolute top-3 left-3 right-3 sm:top-3.5 sm:left-3.5 sm:right-3.5 flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 sm:py-1 rounded-full bg-[#09090B]/85 backdrop-blur-sm border border-white/[0.08] text-[11.5px] font-medium text-[#A1A1AA]">
                            {meta.marketLabel} · {meta.category}
                          </span>
                          <span className="px-2.5 py-0.5 sm:py-1 rounded-full bg-[#09090B]/85 backdrop-blur-sm border border-white/[0.08] text-[11.5px] font-mono tabular-nums text-[#A1A1AA]">
                            {meta.timeframes}
                          </span>
                        </div>
                      </Link>

                      {/* Card Body */}
                      <div className="px-4 sm:px-6 pb-4 sm:pb-5 pt-2 space-y-3 sm:space-y-3.5">
                        <div className="flex items-start justify-between gap-3 sm:gap-4">
                          <div className="min-w-0">
                            <Link
                              to={`/strategies/${meta.id}`}
                              onClick={() => setSelectedStrategy(meta.id)}
                              className="text-[17px] sm:text-[18px] font-medium tracking-[-0.015em] text-[#FAFAFA] hover:text-[#34D399] transition-colors"
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
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center overflow-hidden rounded-full border p-[3px] transition-colors touch-manipulation mt-0.5 ${
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

                        <p className="text-[13.5px] sm:text-[14px] text-[#A1A1AA] leading-relaxed">
                          {meta.summary}
                        </p>

                        <p className="text-[11.5px] font-mono text-[#71717A] tracking-tight truncate">
                          {formatSymbolStrip(meta.supportedSymbols)}
                        </p>
                      </div>
                    </div>

                    {/* Inline Telemetry & Actions */}
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3.5 sm:space-y-4">
                      <div className="pt-3.5 sm:pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="min-w-0">
                          <p className="text-[11.5px] sm:text-[12px] text-[#71717A]">Signals</p>
                          <p className="text-[14px] sm:text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-0.5 truncate">
                            {stats.detected}
                            {stats.live > 0 && (
                              <span className="text-[11px] sm:text-[12px] font-normal text-[#34D399] ml-1 sm:ml-1.5">
                                {stats.live} live
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="text-[11.5px] sm:text-[12px] text-[#71717A]">Win rate</p>
                          <p
                            className={`text-[14px] sm:text-[15px] font-mono font-semibold tabular-nums mt-0.5 truncate ${
                              stats.winRate === null
                                ? 'text-[#71717A]'
                                : stats.winRate >= 50
                                ? 'text-[#34D399]'
                                : 'text-[#F87171]'
                            }`}
                          >
                            {stats.winRate !== null ? `${stats.winRate.toFixed(1)}%` : `${meta.winRate} est.`}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="text-[11.5px] sm:text-[12px] text-[#71717A]">Multiplier</p>
                          <p
                            className={`text-[14px] sm:text-[15px] font-mono font-semibold tabular-nums mt-0.5 ${
                              stats.modifiedParams > 0 ? 'text-[#34D399]' : 'text-[#FAFAFA]'
                            }`}
                          >
                            {stats.multiplier.toFixed(2)}x
                          </p>
                        </div>
                      </div>

                      <div className="pt-3.5 sm:pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                        <Link
                          to={`/strategies/${meta.id}`}
                          onClick={() => setSelectedStrategy(meta.id)}
                          className="min-h-[36px] text-[13px] font-medium text-[#FAFAFA] hover:text-[#34D399] inline-flex items-center gap-1.5 transition-colors"
                        >
                          Inspect rules
                          <PiArrowRight size={14} />
                        </Link>

                        <Link
                          to={`/backtesting?strategy=${meta.backtestFallbackId}`}
                          className="h-9 sm:h-8 px-3.5 sm:px-3 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[12.5px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
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
          )}
        </section>

        {/* Execution & Adaptive Engine Area */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          <div className="lg:col-span-5 min-w-0">
            <AutoTraderWidget />
          </div>
          <div className="lg:col-span-7 min-w-0">
            <AdaptiveFeedbackWidget />
          </div>
        </section>
      </div>
    </div>
  );
}
