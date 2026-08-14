const fs = require('fs');
const file = 'c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const hoverReplacement = \        {hoveredSignal && !lockedSignal && !loading && (
          <div
            className={cn(
              "absolute z-20 w-[320px] max-w-[calc(100vw-0.9rem)] bg-[#090d14]/95 border rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.6)] backdrop-blur-xl p-3.5 pointer-events-none transition-all duration-200",
              hoveredSignal.direction === 'BUY' ? 'border-emerald-500/30' : 'border-rose-500/30'
            )}
            style={{
              left: Math.max(6, Math.min(mouse.x + 16, window.innerWidth - 336)),
              top: Math.max(66, Math.min(mouse.y - 10, window.innerHeight - 320)),
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'h-5 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 border shrink-0',
                    hoveredSignal.direction === 'BUY'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  )}
                >
                  {hoveredSignal.direction === 'BUY' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {hoveredSignal.direction}
                </span>
                <span className="text-[13px] font-extrabold text-white tracking-wide shrink-0">{symbol}</span>
                <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] shrink-0">
                  {timeframe}
                </span>
              </div>
              <span className={cn('text-[12px] font-bold shrink-0', hoveredSignal.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400')}>
                {hoveredSignal.confidence}%
              </span>
            </div>

            <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
              {hoveredSignal.status !== 'live' && (
                <span 
                  className={cn("text-[10px] items-center gap-1 inline-flex px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider shrink-0", 
                    hoveredSignal.status === 'WIN' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 
                    hoveredSignal.status === 'LOSS' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 
                    'text-slate-400 border-slate-500/30 bg-slate-500/10'
                  )}
                >
                  OUTCOME: {hoveredSignal.status === 'WIN' ? 'HIT TP' : hoveredSignal.status === 'LOSS' ? 'HIT SL' : 'EXPIRED'}
                </span>
              )}

              {hoveredSignal.confidence >= 85 && (
                <span className="text-[10px] items-center gap-1 inline-flex px-2 py-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold uppercase tracking-wider shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  High Quality
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-white/[0.14] bg-[#0b0f17] text-[#cbd5e1] truncate">
                {hoveredSignal.strategyLabel}
              </span>
              <span
                className={cn("text-[10px] px-2 py-0.5 rounded-md border shrink-0 font-bold", 
                  hoveredSignal.risk === 'Low' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 
                  hoveredSignal.risk === 'Medium' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 
                  'text-rose-400 border-rose-500/30 bg-rose-500/10'
                )}
              >
                {hoveredSignal.risk} Risk
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-[#06090e] border border-white/[0.06] mb-2.5 text-center">
              {[
                ['Entry', hoveredSignal.entry, '#e5e7eb'],
                ['SL', hoveredSignal.sl, '#ef4444'],
                ['TP', hoveredSignal.tp, '#22c55e'],
                ['R:R', hoveredSignal.rr, '#3b82f6'],
              ].map(([k, v, color]) => (
                <div key={String(k)}>
                  <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{k}</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: String(color) }}>
                    {typeof v === 'number' && String(k) !== 'R:R' ? formatPrice(v) : typeof v === 'number' ? v.toFixed(1) + 'x' : String(v)}
                  </span>
                </div>
              ))}
            </div>

            {hoveredMoneyContext && (
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2.5">
                <span>Suggested amount</span>
                <span className="text-white font-bold">{fmtUSD(hoveredMoneyContext.suggestedPosition)}</span>
              </div>
            )}

            <div>
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Why we flagged this for you, {displayName.split(' ')[0]}
              </div>
              <div className="space-y-1">
                {hoveredSignal.reason.map((r, i) => (
                  <p key={i} className="text-[11px] text-slate-400 leading-relaxed">
                    • {r}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}\;

// function to replace block
function replaceBlock(content, startString, endStringPattern, replacement) {
  const startIndex = content.indexOf(startString);
  if (startIndex === -1) {
    console.log("Start string not found:", startString.slice(0, 30));
    return content;
  }
  
  // To find the true end, we can parse manually or just look for the first matching end string AFTER the start
  const lines = content.split('\n');
  const startLine = lines.findIndex(l => l.includes(startString));
  if (startLine === -1) return content;
  
  let endLine = -1;
  let braceCount = 0;
  let started = false;
  
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for(let char of line) {
        if(char === '{') braceCount++;
        if(char === '}') braceCount--;
    }
    if (line.includes('{') || line.includes('}')) {
        started = true;
    }
    
    // We are looking for the closing )} of the modal
    if (started && braceCount === 0 && line.trim() === ')}') {
      endLine = i;
      break;
    }
  }
  
  if (endLine !== -1) {
    console.log("Found block from", startLine, "to", endLine);
    const before = lines.slice(0, startLine).join('\n');
    const after = lines.slice(endLine + 1).join('\n');
    return before + '\n' + replacement + '\n' + after;
  } else {
    console.log("Could not find end of block for", startString.slice(0, 30));
    return content;
  }
}

content = replaceBlock(content, '{hoveredSignal && !lockedSignal && !loading && (', ')}', hoverReplacement);

const lockReplacement = \        {lockedSignal && !loading && (
          <div className="absolute z-30 left-3 top-16 sm:left-4 sm:top-20 w-[320px] sm:w-[360px] max-w-[calc(100vw-0.9rem)] rounded-2xl bg-[#090d14]/95 border border-white/[0.25] shadow-[0_16px_36px_rgba(0,0,0,0.6)] backdrop-blur-xl p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Locked Suggestion</div>
                <div className="text-[14px] font-extrabold text-white mt-1 tracking-wide">{lockedSignal.direction} • {symbol}</div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {lockedSignal.confidence >= 85 && (
                    <span className="text-[10px] items-center gap-1 inline-flex px-2 py-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold uppercase tracking-wider shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      High Quality
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-md border border-white/[0.14] bg-[#0b0f17] text-[#cbd5e1] truncate font-semibold">
                    {lockedSignal.strategyLabel}
                  </span>
                  <span
                    className={cn("text-[10px] px-2 py-0.5 rounded-md border shrink-0 font-bold", 
                      lockedSignal.risk === 'Low' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 
                      lockedSignal.risk === 'Medium' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 
                      'text-rose-400 border-rose-500/30 bg-rose-500/10'
                    )}
                  >
                    {lockedSignal.risk} Risk
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setLockedSignalId(null)
                  setHoveredSignalId(null)
                }}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-[#06090e] border border-white/[0.06] text-center">
              {[
                ['Entry', lockedSignal.entry, '#e5e7eb'],
                ['SL', lockedSignal.sl, '#ef4444'],
                ['TP', lockedSignal.tp, '#22c55e'],
                ['R:R', lockedSignal.rr, '#3b82f6'],
              ].map(([k, v, color]) => (
                <div key={String(k)}>
                  <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{k}</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: String(color) }}>
                    {typeof v === 'number' && String(k) !== 'R:R' ? formatPrice(v) : typeof v === 'number' ? v.toFixed(1) + 'x' : String(v)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-slate-400 font-semibold">Confidence</span>
              <span className="text-[11px] font-bold text-blue-400">{lockedSignal.confidence}%</span>
            </div>

            {lockedMoneyContext && (
              <div className="rounded-xl border border-white/[0.06] bg-[#06090e] p-3 space-y-2">
                <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">Money Context</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Suggested trade amount</span>
                  <span className="text-white font-bold">{fmtUSD(lockedMoneyContext.suggestedPosition)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Loss at SL</span>
                  <span className="text-rose-400 font-bold">{fmtUSD(lockedMoneyContext.maxLossAtSL)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Remaining daily loss budget</span>
                  <span className="text-white font-bold">{fmtUSD(lockedMoneyContext.remainingDailyLoss)}</span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1">
                  Capital risk: <span className="text-slate-300 font-bold">{lockedMoneyContext.capitalRisk}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Why we flagged this for you, {displayName.split(' ')[0]}
              </div>
              {lockedSignal.reason.map((line, i) => (
                <p key={i} className="text-[11px] text-slate-400 leading-relaxed">• {line}</p>
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-[#06090e] p-3 space-y-2.5 mt-2">
              <p className="text-[11px] font-bold text-slate-300">Did you take this trade?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveLockedFeedback(true)}
                  className="flex-1 h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  Yes, took it
                </button>
                <button
                  onClick={() => saveLockedFeedback(false)}
                  className="flex-1 h-8 px-3 rounded-lg border border-slate-500/30 bg-slate-500/10 text-[11px] font-bold text-slate-400 hover:bg-slate-500/20 hover:text-white transition-colors"
                >
                  No, skipped
                </button>
              </div>

              {lockedJournal?.taken && lockedSuggestionKey && (
                <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-2">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Journal Outcome</p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'win')} className={cn("flex-1 h-7 rounded-md border text-[10px] font-bold transition-colors", lockedJournal.outcome === 'win' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/10')}>Win</button>
                    <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'loss')} className={cn("flex-1 h-7 rounded-md border text-[10px] font-bold transition-colors", lockedJournal.outcome === 'loss' ? 'border-rose-500 bg-rose-500/20 text-rose-400' : 'border-rose-500/30 text-rose-400/50 hover:bg-rose-500/10')}>Loss</button>
                    <button onClick={() => setJournalOutcome(lockedSuggestionKey, 'breakeven')} className={cn("flex-1 h-7 rounded-md border text-[10px] font-bold transition-colors", lockedJournal.outcome === 'breakeven' ? 'border-slate-400 bg-slate-500/20 text-slate-300' : 'border-slate-500/30 text-slate-400/50 hover:bg-slate-500/10')}>BE</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}\;

content = replaceBlock(content, '{lockedSignal && !loading && (', ')}', lockReplacement);

fs.writeFileSync(file, content);
console.log('done replacing lock and hover modals');
