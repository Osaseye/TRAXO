const fs = require('fs');
const file = 'c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const hoverReplacement = fs.readFileSync('hover_replacement.txt', 'utf8');
const lockReplacement = fs.readFileSync('lock_replacement.txt', 'utf8');
const manualReplacement = fs.readFileSync('manual_replacement.txt', 'utf8');

const hoverRegex = /\{hoveredSignal && !lockedSignal && !loading && \([\s\S]*?\}\)/;
content = content.replace(hoverRegex, hoverReplacement);

const lockRegex = /\{lockedSignal && !loading && \([\s\S]*?\}\)/;
content = content.replace(lockRegex, lockReplacement);

const manualOrig = "        {manualSetup && (\n          <div\n            className=\"absolute z-30 w-[420px] max-w-[95vw] rounded-xl bg-[#0d1117]/95 border border-white/[0.12] shadow-2xl p-4 cursor-move pointer-events-auto\"\n            style={{\n              left: manualPos.x,\n              top: manualPos.y,\n            }}\n            onMouseDown={handleManualMouseDown}\n          >\n            <div className=\"flex items-start justify-between gap-2 mb-3\">\n              <div>\n                <div className=\"text-[10px] uppercase tracking-wider text-[#64748b] font-semibold\">Entry Analysis</div>\n                <div className=\"text-[10px] text-[#64748b] mt-1\">Drag this header to move</div>\n              </div>\n              <button\n                onClick={() => setManualSetup(null)}\n                className=\"text-[11px] text-[#6b7280] hover:text-white transition-colors\"\n                onMouseDown={(e) => e.stopPropagation()}\n              >\n                Close\n              </button>\n            </div>";

content = content.replace(manualOrig, manualReplacement);

fs.writeFileSync(file, content);
console.log('done');
