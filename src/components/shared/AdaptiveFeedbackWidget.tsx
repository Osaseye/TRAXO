import { useState } from 'react';
import {
  PiArrowsClockwise,
  PiClockCounterClockwise,
  PiPower,
  PiSlidersHorizontal,
} from 'react-icons/pi';
import { useStrategyOptimizer } from '@/hooks/useStrategyOptimizer';

export interface AdaptiveFeedbackWidgetProps {
  /** Optional strategy key (kebab-case or snake_case) to scope parameter readout */
  strategyId?: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  wick_rejection: 'Wick Rejection',
  breakout: 'Breakout',
  order_block: 'Order Block',
  supply_demand: 'Supply & Demand',
  trend_following: 'Trend Following',
  traxo_london_apex: 'TRAXO London Apex',
  traxo_tokyo_yield: 'TRAXO Tokyo Yield',
  traxo_sovereign_fix: 'TRAXO Sovereign Fix',
  traxo_barrier_grid: 'TRAXO Barrier Grid',
  traxo_macro_vector: 'TRAXO Macro Vector',
  traxo_aurum_sweep: 'TRAXO Aurum Sweep',
  traxo_bullion_strike: 'TRAXO Bullion Strike',
  traxo_ny_bullet: 'TRAXO NY Bullet',
  traxo_aurum_fix: 'TRAXO Aurum Fix',
  traxo_kinetic_nr7: 'TRAXO Kinetic NR7',
  traxo_globex_sweep: 'TRAXO Globex Sweep',
  traxo_velocity_orb: 'TRAXO Velocity ORB',
  traxo_initial_balance: 'TRAXO Initial Balance',
  traxo_mean_equilibrium: 'TRAXO Mean Equilibrium',
  traxo_power_hour_moc: 'TRAXO Power Hour MOC',
};

const PARAM_LABELS: Record<string, string> = {
  minWickRatio: 'Min Wick Ratio',
  atrSlPadding: 'ATR SL Buffer',
  minConfidence: 'Min Confidence',
  volumeSpikeMultiplier: 'Volume Spike Mult',
  consolidationCount: 'Consolidation Bars',
  displacementRatio: 'Displacement Ratio',
  zoneFlipStrength: 'Zone Flip Strength',
  pullbackDepth: 'Pullback Depth',
};

function normalizeStrategyKey(id: string): string {
  return id.replace(/-/g, '_');
}

function formatParamValue(val: number): string {
  return Number.isInteger(val) ? String(val) : val.toFixed(2);
}

export function AdaptiveFeedbackWidget({ strategyId }: AdaptiveFeedbackWidgetProps = {}) {
  const { status, loading, toggleFeedbackEngine, resetToFactory } = useStrategyOptimizer();
  const [showAllStrategies, setShowAllStrategies] = useState(false);

  const isEnabled = status?.isFeedbackEngineEnabled ?? true;
  const totalLosses = status?.totalLossesAnalyzed ?? 0;
  const totalWins = (status as { totalWinsAnalyzed?: number } | null)?.totalWinsAnalyzed ?? 0;
  const factoryDefaults = status?.factoryDefaults ?? {};
  const learnedParameters = status?.learnedParameters ?? {};
  const history = status?.history ?? [];

  const targetKey = strategyId ? normalizeStrategyKey(strategyId) : null;
  const allStrategyKeys = Object.keys(factoryDefaults);
  const visibleStrategyKeys =
    targetKey && !showAllStrategies && allStrategyKeys.includes(targetKey)
      ? [targetKey]
      : allStrategyKeys;

  const parameterRows = visibleStrategyKeys.flatMap((stratKey) => {
    const defaults = factoryDefaults[stratKey] || {};
    const learned = learnedParameters[stratKey] || {};
    return Object.entries(defaults).map(([param, factoryVal]) => {
      const liveVal = typeof learned[param] === 'number' ? learned[param] : factoryVal;
      const multiplier = factoryVal !== 0 ? liveVal / factoryVal : 1;
      const delta = liveVal - factoryVal;
      const isModified = Math.abs(delta) > 0.001;
      return {
        stratKey,
        stratLabel: STRATEGY_LABELS[stratKey] || stratKey,
        param,
        paramLabel: PARAM_LABELS[param] || param,
        factoryVal,
        liveVal,
        multiplier,
        delta,
        isModified,
      };
    });
  });

  const modifiedCount = parameterRows.filter((r) => r.isModified).length;

  const filteredHistory =
    targetKey && !showAllStrategies
      ? history.filter((h) => normalizeStrategyKey(h.strategyId) === targetKey)
      : history;

  return (
    <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
      {/* Header Bar */}
      <div className="p-6 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] flex items-center justify-center shrink-0">
            <PiSlidersHorizontal
              size={18}
              className={isEnabled ? 'text-[#34D399]' : 'text-[#A1A1AA]'}
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
                Adaptive parameter optimizer
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#A1A1AA]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isEnabled ? 'bg-[#34D399]' : 'bg-[#71717A]'
                  }`}
                />
                {isEnabled ? 'Active' : 'Standby'}
              </span>
            </div>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              Closed-loop calibration from resolved outcomes against factory defaults
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {targetKey && allStrategyKeys.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllStrategies((v) => !v)}
              className="h-9 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              {showAllStrategies ? 'Selected only' : 'All engines'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void resetToFactory()}
            disabled={loading}
            title="Restore all optimizer parameters to factory defaults"
            className="h-9 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <PiArrowsClockwise size={14} />
            Reset to defaults
          </button>

          <button
            type="button"
            onClick={() => void toggleFeedbackEngine(!isEnabled)}
            disabled={loading}
            className={`h-9 px-3.5 rounded-xl text-[13px] font-medium inline-flex items-center gap-1.5 border transition-colors disabled:opacity-50 ${
              isEnabled
                ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/25 hover:bg-[#34D399]/15'
                : 'bg-[#18181B] text-[#A1A1AA] border-white/[0.08] hover:text-[#FAFAFA] hover:border-white/[0.16]'
            }`}
          >
            <PiPower size={14} />
            {isEnabled ? 'Engine on' : 'Engine off'}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Summary Metrics Row */}
        <div className="rounded-xl bg-[#161619] grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="p-4">
            <p className="text-[12px] font-medium text-[#71717A]">Outcomes analyzed</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {totalLosses + totalWins}
              <span className="text-[12px] text-[#71717A] font-normal ml-1.5">
                ({totalWins}W / {totalLosses}L)
              </span>
            </p>
          </div>

          <div className="p-4 !border-t-0">
            <p className="text-[12px] font-medium text-[#71717A]">Calibrated params</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {modifiedCount}
              <span className="text-[12px] text-[#71717A] font-normal ml-1">
                / {parameterRows.length}
              </span>
            </p>
          </div>

          <div className="p-4">
            <p className="text-[12px] font-medium text-[#71717A]">Adjustments logged</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {filteredHistory.length}
            </p>
          </div>

          <div className="p-4">
            <p className="text-[12px] font-medium text-[#71717A]">Calibration scope</p>
            <p className="text-[14px] font-medium text-[#FAFAFA] mt-1 truncate">
              {targetKey && !showAllStrategies
                ? STRATEGY_LABELS[targetKey] || targetKey
                : `${allStrategyKeys.length} engines`}
            </p>
          </div>
        </div>

        {/* Live vs Factory Parameter Readout */}
        <div className="rounded-xl bg-[#161619] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#FAFAFA]">
              Parameter calibration matrix
            </span>
            <span className="text-[12px] text-[#71717A]">
              Factory vs. live multiplier
            </span>
          </div>

          {parameterRows.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-[#71717A] text-center">
              Waiting for strategy optimizer telemetry...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[12px] text-[#71717A]">
                    {!targetKey || showAllStrategies ? (
                      <th className="py-2.5 px-4 font-medium">Engine</th>
                    ) : null}
                    <th className="py-2.5 px-4 font-medium">Parameter</th>
                    <th className="py-2.5 px-4 font-medium text-right">Factory</th>
                    <th className="py-2.5 px-4 font-medium text-right">Live</th>
                    <th className="py-2.5 px-4 font-medium text-right">Multiplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-[13px]">
                  {parameterRows.map((row) => (
                    <tr
                      key={`${row.stratKey}-${row.param}`}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      {!targetKey || showAllStrategies ? (
                        <td className="py-2.5 px-4 text-[#A1A1AA] font-medium whitespace-nowrap">
                          {row.stratLabel}
                        </td>
                      ) : null}
                      <td className="py-2.5 px-4 text-[#FAFAFA] whitespace-nowrap">
                        {row.paramLabel}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#71717A]">
                        {formatParamValue(row.factoryVal)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                          row.isModified ? 'text-[#FAFAFA]' : 'text-[#A1A1AA]'
                        }`}
                      >
                        {formatParamValue(row.liveVal)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[12px] ${
                            !row.isModified
                              ? 'bg-[#111113] text-[#71717A]'
                              : row.multiplier > 1
                              ? 'bg-[#34D399]/10 text-[#34D399]'
                              : 'bg-[#F87171]/10 text-[#F87171]'
                          }`}
                        >
                          {row.multiplier.toFixed(2)}x
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Calibration Log */}
        <div className="rounded-xl bg-[#161619] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <PiClockCounterClockwise size={14} className="text-[#71717A]" />
            <span className="text-[13px] font-medium text-[#FAFAFA]">
              Recent calibration events
            </span>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-[#71717A] text-center">
              All parameters are running at factory defaults. Adjustments appear here as resolved trades tune thresholds.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {filteredHistory.slice(0, 5).map((item, idx) => (
                <div key={`${item.timestamp}-${idx}`} className="px-4 py-3.5 text-[13px] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#FAFAFA]">
                      {STRATEGY_LABELS[normalizeStrategyKey(item.strategyId)] || item.strategyId}
                      {item.symbol ? ` · ${item.symbol}` : ''}
                    </span>
                    <span className="text-[12px] font-mono tabular-nums text-[#71717A]">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {item.changes.map((c, cIdx) => (
                      <div key={cIdx} className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#A1A1AA]">
                        <span className="font-medium text-[#FAFAFA]">
                          {PARAM_LABELS[c.param] || c.param}:
                        </span>
                        <span className="font-mono tabular-nums text-[#FAFAFA]">
                          {formatParamValue(c.from)} → {formatParamValue(c.to)}
                        </span>
                        <span className="text-[#71717A]">— {c.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
