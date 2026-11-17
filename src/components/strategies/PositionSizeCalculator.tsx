import { useState } from 'react';
import { PiCalculator, PiWarningCircle } from 'react-icons/pi';

export interface PositionSizeCalculatorProps {
  defaultBalance?: number;
}

export function PositionSizeCalculator({ defaultBalance = 10000 }: PositionSizeCalculatorProps = {}) {
  const [balance, setBalance] = useState<number>(defaultBalance);
  const [riskType, setRiskType] = useState<'percent' | 'fixed'>('fixed');
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [fixedRisk, setFixedRisk] = useState<number>(25);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [entryPrice, setEntryPrice] = useState<number>(1.085);
  const [stopLoss, setStopLoss] = useState<number>(1.081);

  const riskAmount = riskType === 'fixed' ? fixedRisk : balance * (riskPercent / 100);

  let stopDistance = 0;
  let isValid = false;
  let errorMsg = '';

  if (direction === 'long') {
    if (stopLoss < entryPrice && stopLoss > 0 && entryPrice > 0) {
      stopDistance = entryPrice - stopLoss;
      isValid = true;
    } else if (stopLoss >= entryPrice) {
      errorMsg = 'Stop loss must sit below entry price for long setups.';
    }
  } else {
    if (stopLoss > entryPrice && stopLoss > 0 && entryPrice > 0) {
      stopDistance = stopLoss - entryPrice;
      isValid = true;
    } else if (stopLoss <= entryPrice) {
      errorMsg = 'Stop loss must sit above entry price for short setups.';
    }
  }

  const units = isValid && stopDistance > 0 ? riskAmount / stopDistance : 0;
  const forexLots = units / 100000;
  const miniLots = units / 10000;
  const effectiveRiskPct = balance > 0 ? (riskAmount / balance) * 100 : 0;

  const tp1 = direction === 'long' ? entryPrice + stopDistance * 1.5 : entryPrice - stopDistance * 1.5;
  const tp2 = direction === 'long' ? entryPrice + stopDistance * 2.5 : entryPrice - stopDistance * 2.5;
  const tp3 = direction === 'long' ? entryPrice + stopDistance * 4.0 : entryPrice - stopDistance * 4.0;

  const formatTargetPrice = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return '0.00';
    if (val < 10) return val.toFixed(5);
    if (val < 500) return val.toFixed(3);
    return val.toFixed(2);
  };

  const handleDirectionChange = (dir: 'long' | 'short') => {
    setDirection(dir);
    if (dir === 'long' && stopLoss >= entryPrice) {
      setStopLoss(Number((entryPrice * 0.996).toFixed(5)));
    } else if (dir === 'short' && stopLoss <= entryPrice) {
      setStopLoss(Number((entryPrice * 1.004).toFixed(5)));
    }
  };

  return (
    <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.06] flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#18181B] flex items-center justify-center text-[#A1A1AA] shrink-0">
          <PiCalculator size={18} />
        </div>
        <div>
          <h3 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
            Position size calculator
          </h3>
          <p className="text-[13px] text-[#71717A] mt-0.5">
            Compute exact lot exposure from invalidation distance
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Direction Selector */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#18181B]">
          <button
            type="button"
            onClick={() => handleDirectionChange('long')}
            className={`py-2 text-[13px] font-medium rounded-lg transition-colors ${
              direction === 'long'
                ? 'bg-[#34D399]/12 text-[#34D399]'
                : 'text-[#71717A] hover:text-[#FAFAFA]'
            }`}
          >
            Buy / Long
          </button>
          <button
            type="button"
            onClick={() => handleDirectionChange('short')}
            className={`py-2 text-[13px] font-medium rounded-lg transition-colors ${
              direction === 'short'
                ? 'bg-[#F87171]/12 text-[#F87171]'
                : 'text-[#71717A] hover:text-[#FAFAFA]'
            }`}
          >
            Sell / Short
          </button>
        </div>

        {/* Numeric Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[#71717A]">
              Account equity ($)
            </label>
            <input
              type="number"
              min={0}
              value={balance}
              onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
              className="w-full h-10 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13.5px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-[#71717A]">
                Risk ({riskType === 'fixed' ? 'USD' : '% equity'})
              </label>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#18181B]">
                <button
                  type="button"
                  onClick={() => setRiskType('fixed')}
                  className={`px-2 py-0.5 rounded-md text-[12px] font-mono transition-colors ${
                    riskType === 'fixed'
                      ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                      : 'text-[#71717A] hover:text-[#FAFAFA]'
                  }`}
                >
                  $
                </button>
                <button
                  type="button"
                  onClick={() => setRiskType('percent')}
                  className={`px-2 py-0.5 rounded-md text-[12px] font-mono transition-colors ${
                    riskType === 'percent'
                      ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                      : 'text-[#71717A] hover:text-[#FAFAFA]'
                  }`}
                >
                  %
                </button>
              </div>
            </div>

            {riskType === 'fixed' ? (
              <div className="space-y-2">
                <input
                  type="number"
                  min={1}
                  step={5}
                  value={fixedRisk || ''}
                  onChange={(e) => setFixedRisk(parseFloat(e.target.value) || 0)}
                  placeholder="25"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13.5px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
                />
                <div className="flex items-center gap-1.5">
                  {[10, 25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFixedRisk(amt)}
                      className={`px-2.5 py-1 rounded-lg text-[12px] font-mono tabular-nums transition-colors ${
                        fixedRisk === amt
                          ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                          : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA]'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={riskPercent}
                onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                className="w-full h-10 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13.5px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[#71717A]">
              Entry price
            </label>
            <input
              type="number"
              step="0.00001"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full h-10 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13.5px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[#71717A]">
              Invalidation stop loss
            </label>
            <input
              type="number"
              step="0.00001"
              value={stopLoss}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="w-full h-10 px-3.5 rounded-xl bg-[#18181B] border border-white/[0.08] focus:border-white/[0.22] focus:outline-none text-[13.5px] font-mono tabular-nums text-[#FAFAFA] transition-colors"
            />
          </div>
        </div>

        {/* Validation Warning */}
        {!isValid && errorMsg && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-[#F87171]/25 bg-[#F87171]/10 text-[#F87171] text-[13px]">
            <PiWarningCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Computed Sizing Output */}
        <div className="rounded-xl bg-[#161619] grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="p-3.5">
            <p className="text-[12px] font-medium text-[#71717A]">Risk capital</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              ${riskAmount.toFixed(2)}
            </p>
            <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-0.5">
              {effectiveRiskPct.toFixed(2)}% eq
            </p>
          </div>

          <div className="p-3.5 !border-t-0">
            <p className="text-[12px] font-medium text-[#71717A]">Std lots</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {isValid ? forexLots.toFixed(2) : '—'}
            </p>
            <p className="text-[12px] font-mono tabular-nums text-[#71717A] mt-0.5">
              {isValid ? `${miniLots.toFixed(2)} mini` : 'Invalid SL'}
            </p>
          </div>

          <div className="p-3.5">
            <p className="text-[12px] font-medium text-[#71717A]">Units</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {isValid ? Math.round(units).toLocaleString('en-US') : '—'}
            </p>
            <p className="text-[12px] text-[#71717A] mt-0.5">Base exposure</p>
          </div>

          <div className="p-3.5">
            <p className="text-[12px] font-medium text-[#71717A]">Stop width</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#F87171] mt-1">
              {isValid ? formatTargetPrice(stopDistance) : '—'}
            </p>
            <p className="text-[12px] text-[#71717A] mt-0.5">Price delta</p>
          </div>
        </div>

        {/* R:R Target Ladder */}
        {isValid && (
          <div className="rounded-xl bg-[#161619] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06]">
              <p className="text-[12px] font-medium text-[#71717A]">
                Projected take-profit benchmarks
              </p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
              <div className="p-3.5">
                <div className="flex items-center justify-between text-[12px] text-[#71717A] font-mono tabular-nums">
                  <span>TP1 · 1.5R</span>
                  <span className="text-[#34D399]">+${(riskAmount * 1.5).toFixed(0)}</span>
                </div>
                <p className="text-[14px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
                  {formatTargetPrice(tp1)}
                </p>
              </div>

              <div className="p-3.5">
                <div className="flex items-center justify-between text-[12px] text-[#71717A] font-mono tabular-nums">
                  <span>TP2 · 2.5R</span>
                  <span className="text-[#34D399]">+${(riskAmount * 2.5).toFixed(0)}</span>
                </div>
                <p className="text-[14px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
                  {formatTargetPrice(tp2)}
                </p>
              </div>

              <div className="p-3.5">
                <div className="flex items-center justify-between text-[12px] text-[#71717A] font-mono tabular-nums">
                  <span>TP3 · 4.0R</span>
                  <span className="text-[#34D399]">+${(riskAmount * 4.0).toFixed(0)}</span>
                </div>
                <p className="text-[14px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
                  {formatTargetPrice(tp3)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
