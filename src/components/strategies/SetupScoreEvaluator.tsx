import { useState } from 'react';
import { PiCheckSquare, PiArrowsClockwise } from 'react-icons/pi';

export function SetupScoreEvaluator() {
  const [wickRatio2, setWickRatio2] = useState<boolean>(true);
  const [wickRatio3, setWickRatio3] = useState<boolean>(false);
  const [keyLevel, setKeyLevel] = useState<boolean>(true);
  const [htfAlignment, setHtfAlignment] = useState<'aligned' | 'neutral' | 'opposed'>('aligned');
  const [volumeSpike, setVolumeSpike] = useState<boolean>(false);
  const [confirmation, setConfirmation] = useState<boolean>(true);
  const [fibConfluence, setFibConfluence] = useState<boolean>(false);
  const [sessionConfluence, setSessionConfluence] = useState<boolean>(true);
  const [liquiditySweep, setLiquiditySweep] = useState<boolean>(false);

  let score = 0;
  if (wickRatio2) score += 2;
  if (wickRatio3) score += 1;
  if (keyLevel) score += 2;
  if (htfAlignment === 'aligned') score += 2;
  if (htfAlignment === 'opposed') score -= 1;
  if (volumeSpike) score += 2;
  if (confirmation) score += 2;
  if (fibConfluence) score += 1;
  if (sessionConfluence) score += 1;
  if (liquiditySweep) score += 1;

  const clampedScore = Math.max(0, score);
  const progressPercent = Math.max(0, Math.min((clampedScore / 14) * 100, 100));

  let badgeClass = 'text-[#F87171] bg-[#F87171]/10';
  let barClass = 'bg-[#F87171]';
  let label = 'Pass / No trade';
  let advice = 'Confluence threshold unmet. Skip entry or log in observation mode only.';
  let sizingCap = '0.00% risk';

  if (score >= 8) {
    badgeClass = 'text-[#34D399] bg-[#34D399]/10';
    barClass = 'bg-[#34D399]';
    label = 'High confidence';
    advice = 'Full institutional alignment confirmed. Standard risk allocation approved.';
    sizingCap = '1.0% – 1.5% risk';
  } else if (score >= 6) {
    badgeClass = 'text-[#FAFAFA] bg-white/[0.08]';
    barClass = 'bg-[#FAFAFA]';
    label = 'Moderate confidence';
    advice = 'Valid structure with secondary gaps. Keep position sizing conservative.';
    sizingCap = '0.5% – 1.0% risk';
  } else if (score >= 4) {
    badgeClass = 'text-[#A1A1AA] bg-white/[0.05]';
    barClass = 'bg-[#71717A]';
    label = 'Low confidence';
    advice = 'Marginal edge. Use quarter-size only or wait for a cleaner confirmation close.';
    sizingCap = '0.25% risk';
  }

  const handleReset = () => {
    setWickRatio2(true);
    setWickRatio3(false);
    setKeyLevel(true);
    setHtfAlignment('aligned');
    setVolumeSpike(false);
    setConfirmation(true);
    setFibConfluence(false);
    setSessionConfluence(true);
    setLiquiditySweep(false);
  };

  return (
    <div className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] flex items-center justify-center text-[#34D399] shrink-0">
            <PiCheckSquare size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
              Setup confluence scorer
            </h3>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              14-point pre-execution qualification matrix
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="h-8 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[12.5px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 transition-colors"
        >
          <PiArrowsClockwise size={13} />
          Reset
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Checklist */}
        <div className="lg:col-span-7 space-y-5">
          <div className="space-y-2.5">
            <h4 className="text-[12px] font-medium text-[#71717A]">
              Core signal rules
            </h4>

            <div className="rounded-xl bg-[#161619] divide-y divide-white/[0.06] overflow-hidden">
              <label className="flex items-start gap-3 p-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={wickRatio2}
                  onChange={(e) => {
                    setWickRatio2(e.target.checked);
                    if (!e.target.checked) setWickRatio3(false);
                  }}
                  className="mt-1 accent-[#34D399]"
                />
                <div className="text-[13px]">
                  <p className="font-medium text-[#FAFAFA]">
                    Primary trigger ratio &gt;= 2:1{' '}
                    <span className="font-mono tabular-nums text-[12px] text-[#34D399] ml-1.5">
                      +2
                    </span>
                  </p>
                  <p className="text-[#71717A] text-[12px] mt-0.5 leading-relaxed">
                    Dominant rejection wick or displacement body &gt;= 2x opposing candle structure.
                  </p>
                </div>
              </label>

              {wickRatio2 && (
                <label className="flex items-start gap-3 p-3.5 pl-8 hover:bg-white/[0.02] cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={wickRatio3}
                    onChange={(e) => setWickRatio3(e.target.checked)}
                    className="mt-1 accent-[#34D399]"
                  />
                  <div className="text-[13px]">
                    <p className="font-medium text-[#FAFAFA]">
                      Extreme exhaustion ratio &gt;= 3:1{' '}
                      <span className="font-mono tabular-nums text-[12px] text-[#34D399] ml-1.5">
                        +1
                      </span>
                    </p>
                    <p className="text-[#71717A] text-[12px] mt-0.5 leading-relaxed">
                      High-velocity rejection tail indicating acute liquidity absorption.
                    </p>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-3 p-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={keyLevel}
                  onChange={(e) => setKeyLevel(e.target.checked)}
                  className="mt-1 accent-[#34D399]"
                />
                <div className="text-[13px]">
                  <p className="font-medium text-[#FAFAFA]">
                    Key structural level{' '}
                    <span className="font-mono tabular-nums text-[12px] text-[#34D399] ml-1.5">
                      +2
                    </span>
                  </p>
                  <p className="text-[#71717A] text-[12px] mt-0.5 leading-relaxed">
                    Setup triggers directly at prior swing S/R, unmitigated OB, or S&amp;D boundary.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={confirmation}
                  onChange={(e) => setConfirmation(e.target.checked)}
                  className="mt-1 accent-[#34D399]"
                />
                <div className="text-[13px]">
                  <p className="font-medium text-[#FAFAFA]">
                    Directional confirmation close{' '}
                    <span className="font-mono tabular-nums text-[12px] text-[#34D399] ml-1.5">
                      +2
                    </span>
                  </p>
                  <p className="text-[#71717A] text-[12px] mt-0.5 leading-relaxed">
                    Signal candle closes cleanly in projected trade direction.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-[12px] font-medium text-[#71717A]">
              Higher-timeframe &amp; order flow context
            </h4>
            <div className="p-4 rounded-xl bg-[#161619] space-y-4">
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#111113]">
                {(['aligned', 'neutral', 'opposed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setHtfAlignment(mode)}
                    className={`py-1.5 px-2 text-[12px] font-medium rounded-lg transition-colors ${
                      htfAlignment === mode
                        ? mode === 'aligned'
                          ? 'bg-[#34D399]/12 text-[#34D399]'
                          : mode === 'opposed'
                          ? 'bg-[#F87171]/12 text-[#F87171]'
                          : 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                        : 'text-[#71717A] hover:text-[#FAFAFA]'
                    }`}
                  >
                    {mode === 'aligned'
                      ? 'HTF aligned (+2)'
                      : mode === 'opposed'
                      ? 'Opposed (-1)'
                      : 'Neutral (0)'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/[0.06]">
                <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-[#FAFAFA]">
                  <input
                    type="checkbox"
                    checked={volumeSpike}
                    onChange={(e) => setVolumeSpike(e.target.checked)}
                    className="accent-[#34D399]"
                  />
                  <span>Volume &gt; 1.5x MA</span>
                  <span className="font-mono tabular-nums text-[12px] text-[#34D399]">+2</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-[#FAFAFA]">
                  <input
                    type="checkbox"
                    checked={liquiditySweep}
                    onChange={(e) => setLiquiditySweep(e.target.checked)}
                    className="accent-[#34D399]"
                  />
                  <span>Liquidity sweep</span>
                  <span className="font-mono tabular-nums text-[12px] text-[#34D399]">+1</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-[#FAFAFA]">
                  <input
                    type="checkbox"
                    checked={fibConfluence}
                    onChange={(e) => setFibConfluence(e.target.checked)}
                    className="accent-[#34D399]"
                  />
                  <span>Fib 0.618 / 0.786</span>
                  <span className="font-mono tabular-nums text-[12px] text-[#34D399]">+1</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-[#FAFAFA]">
                  <input
                    type="checkbox"
                    checked={sessionConfluence}
                    onChange={(e) => setSessionConfluence(e.target.checked)}
                    className="accent-[#34D399]"
                  />
                  <span>LDN / NY killzone</span>
                  <span className="font-mono tabular-nums text-[12px] text-[#34D399]">+1</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Score Telemetry */}
        <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-xl bg-[#161619] space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-[#71717A]">
                Aggregate score
              </span>
              <span className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${badgeClass}`}>
                {label}
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-mono font-semibold tabular-nums text-[#FAFAFA]">
                {clampedScore}
              </span>
              <span className="text-[14px] font-mono tabular-nums text-[#71717A]">/ 14 pts</span>
            </div>

            <div className="mt-4 h-1.5 w-full rounded-full bg-[#09090B] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${barClass}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-3 pt-5 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#71717A]">Recommended allocation</span>
              <span className="font-mono font-semibold tabular-nums text-[#FAFAFA]">
                {sizingCap}
              </span>
            </div>
            <p className="text-[13px] text-[#A1A1AA] leading-relaxed">{advice}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
