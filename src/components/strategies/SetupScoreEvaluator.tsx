import { useState } from 'react'
import { ShieldAlert, Sparkles, Trophy, Info } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SetupScoreEvaluator() {
  // Checklist states
  const [wickRatio2, setWickRatio2] = useState<boolean>(true)
  const [wickRatio3, setWickRatio3] = useState<boolean>(false)
  const [keyLevel, setKeyLevel] = useState<boolean>(true)
  const [htfAlignment, setHtfAlignment] = useState<'aligned' | 'neutral' | 'opposed'>('aligned')
  const [volumeSpike, setVolumeSpike] = useState<boolean>(false)
  const [confirmation, setConfirmation] = useState<boolean>(true)
  const [fibConfluence, setFibConfluence] = useState<boolean>(false)
  const [sessionConfluence, setSessionConfluence] = useState<boolean>(true)
  const [liquiditySweep, setLiquiditySweep] = useState<boolean>(false)

  // Scoring logic
  let score = 0
  if (wickRatio2) score += 2
  if (wickRatio3) score += 1
  if (keyLevel) score += 2
  
  if (htfAlignment === 'aligned') score += 2
  if (htfAlignment === 'opposed') score -= 1

  if (volumeSpike) score += 2
  if (confirmation) score += 2
  if (fibConfluence) score += 1
  if (sessionConfluence) score += 1
  if (liquiditySweep) score += 1

  // Bracket assessment
  let bracketColor = 'text-danger bg-danger/10 border-danger/20'
  let progressColor = 'bg-danger'
  let label = 'Do Not Trade'
  let advice = 'Score is too low. Pass on this setup or track it in paper-trading only.'

  if (score >= 8) {
    bracketColor = 'text-success bg-success/15 border-success/30'
    progressColor = 'bg-success'
    label = 'High Confidence Setup'
    advice = 'Ideal setup. Recommended position sizing: 1.0% to 1.5% account risk.'
  } else if (score >= 6) {
    bracketColor = 'text-warning bg-warning/15 border-warning/30'
    progressColor = 'bg-warning'
    label = 'Moderate Confidence Setup'
    advice = 'Valid setup with minor gaps. Recommended risk: 0.5% to 1.0% account risk.'
  } else if (score >= 4) {
    bracketColor = 'text-text-muted bg-border/40 border-border'
    progressColor = 'bg-text-muted'
    label = 'Low Confidence Setup'
    advice = 'Higher risk setup. Scale down size significantly (0.25% risk) or trade in paper mode.'
  }

  const progressPercent = Math.max(0, Math.min((score / 14) * 100, 100))

  return (
    <Card className="border border-white/[0.08] bg-[#0d1117]/80 backdrop-blur-md shadow-xl">
      <CardHeader className="border-b border-white/[0.05] pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-success">
            <Trophy size={16} />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Setup Quality Evaluator</CardTitle>
            <CardDescription className="text-xs">Grade setups objectively prior to order submission.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Checklist Inputs */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Core Pattern Signals</h4>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-2 rounded-lg bg-black/10 border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={wickRatio2}
                  onChange={(e) => {
                    setWickRatio2(e.target.checked)
                    if (!e.target.checked) setWickRatio3(false)
                  }}
                  className="mt-0.5 rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                />
                <div className="text-xs">
                  <p className="font-semibold text-white">Wick-to-Body Ratio &gt;= 2:1 <span className="text-[10px] text-success-light font-mono ml-1">(+2 pts)</span></p>
                  <p className="text-text-muted text-[11px]">Rejection wick must be at least double the size of the candle body.</p>
                </div>
              </label>

              {wickRatio2 && (
                <label className="flex items-start gap-2.5 p-2 rounded-lg bg-black/15 border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-colors ml-4">
                  <input
                    type="checkbox"
                    checked={wickRatio3}
                    onChange={(e) => setWickRatio3(e.target.checked)}
                    className="mt-0.5 rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-white">Ideal Wick-to-Body Ratio &gt;= 3:1 <span className="text-[10px] text-success-light font-mono ml-1">(+1 pt bonus)</span></p>
                    <p className="text-text-muted text-[11px]">Extra long wick indicating extreme localized exhaustion.</p>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2.5 p-2 rounded-lg bg-black/10 border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={keyLevel}
                  onChange={(e) => setKeyLevel(e.target.checked)}
                  className="mt-0.5 rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                />
                <div className="text-xs">
                  <p className="font-semibold text-white">Key Structural Location <span className="text-[10px] text-success-light font-mono ml-1">(+2 pts)</span></p>
                  <p className="text-text-muted text-[11px]">Wick tip sweeps major support/resistance, prior daily extreme, or round number.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2 rounded-lg bg-black/10 border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={confirmation}
                  onChange={(e) => setConfirmation(e.target.checked)}
                  className="mt-0.5 rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                />
                <div className="text-xs">
                  <p className="font-semibold text-white">Directional Confirmation Close <span className="text-[10px] text-success-light font-mono ml-1">(+2 pts)</span></p>
                  <p className="text-text-muted text-[11px]">The subsequent candle closes in the direction of the expected reversal.</p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Trend & Volume Context</h4>
            <div className="space-y-3 p-3 rounded-lg bg-black/10 border border-white/[0.03]">
              {/* HTF Trend Radio Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Higher Timeframe Trend Bias</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['aligned', 'neutral', 'opposed'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setHtfAlignment(mode)}
                      className={`py-1 text-xs rounded border capitalize transition-all ${
                        htfAlignment === mode
                          ? mode === 'aligned'
                            ? 'bg-success/20 text-success border-success/30'
                            : mode === 'opposed'
                            ? 'bg-danger/20 text-danger border-danger/30'
                            : 'bg-white/10 text-white border-white/20'
                          : 'bg-[#0b0f17] text-text-muted border-white/[0.06] hover:text-white'
                      }`}
                    >
                      {mode === 'aligned' ? 'Aligned (+2)' : mode === 'opposed' ? 'Opposed (-1)' : 'Neutral (0)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume & Sweep Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/[0.04]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={volumeSpike}
                    onChange={(e) => setVolumeSpike(e.target.checked)}
                    className="rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                  />
                  <span className="text-[11px] text-text-primary">Volume Spike &gt;1.5x <span className="text-[10px] text-success-light font-mono">(+2)</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liquiditySweep}
                    onChange={(e) => setLiquiditySweep(e.target.checked)}
                    className="rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                  />
                  <span className="text-[11px] text-text-primary">Liquidity Sweep <span className="text-[10px] text-success-light font-mono">(+1)</span></span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Technical Confluences</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2 rounded-lg bg-black/10 border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={fibConfluence}
                  onChange={(e) => setFibConfluence(e.target.checked)}
                  className="rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                />
                <span className="text-xs text-text-primary">Fibonacci 0.618/0.786 <span className="text-[10px] text-success-light font-mono">(+1)</span></span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-lg bg-black/10 border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={sessionConfluence}
                  onChange={(e) => setSessionConfluence(e.target.checked)}
                  className="rounded border-white/[0.1] bg-[#0b0f17] text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                />
                <span className="text-xs text-text-primary">Session Open Window <span className="text-[10px] text-success-light font-mono">(+1)</span></span>
              </label>
            </div>
          </div>
        </div>

        {/* Score Display Card */}
        <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-xl border border-white/[0.06] bg-[#0b0f17] space-y-4">
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Evaluation Score</h4>
            
            {/* Score Number and Radial Indicator */}
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-white tabular font-mono">{score}</span>
                <span className="text-sm text-text-muted">/ 14</span>
              </div>
              <Badge className={`border uppercase tracking-wider text-[9px] px-2 py-0.5 ${bracketColor}`}>
                {label}
              </Badge>
            </div>

            {/* Custom Progress Bar */}
            <div className="h-2 w-full rounded-full bg-border overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${progressColor}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Advice/Tip Box */}
          <div className="p-3.5 rounded-lg border border-white/[0.04] bg-[#0d1117] flex items-start gap-2.5">
            <div className="mt-0.5 text-primary">
              {score >= 8 ? (
                <Sparkles size={14} className="text-success" />
              ) : score >= 4 ? (
                <Info size={14} className="text-warning" />
              ) : (
                <ShieldAlert size={14} className="text-danger" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-white uppercase tracking-wider">Risk Advice</p>
              <p className="text-[11px] text-text-primary leading-normal">{advice}</p>
            </div>
          </div>

          {/* Points Breakdown Footer */}
          <div className="border-t border-white/[0.05] pt-3 text-[10px] text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Core Rejection Signal:</span>
              <span className="font-mono text-white">
                {((wickRatio2 ? 2 : 0) + (wickRatio3 ? 1 : 0) + (keyLevel ? 2 : 0) + (confirmation ? 2 : 0))} pts
              </span>
            </div>
            <div className="flex justify-between">
              <span>Trend & Volume:</span>
              <span className="font-mono text-white">
                {((htfAlignment === 'aligned' ? 2 : htfAlignment === 'opposed' ? -1 : 0) + (volumeSpike ? 2 : 0) + (liquiditySweep ? 1 : 0))} pts
              </span>
            </div>
            <div className="flex justify-between">
              <span>Confluences:</span>
              <span className="font-mono text-white">
                {((fibConfluence ? 1 : 0) + (sessionConfluence ? 1 : 0))} pts
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
