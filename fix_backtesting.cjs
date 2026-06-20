const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/Backtesting.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix imports
content = content.replace(
  `import { runBacktest, runOrderBlockBacktest, runTrendFollowingBacktest, runBreakoutBacktest, runSDBacktest } from '@/lib/algorithms/backtesting'`,
  `import { runBacktest, runOrderBlockBacktest, runTrendFollowingBacktest, runBreakoutBacktest, runSDBacktest } from '../../server/algorithms/backtesting'`
);
content = content.replace(
  `import type { BacktestSummary, BacktestSignalResult } from '@/lib/algorithms/backtesting'`,
  `import type { BacktestSummary, BacktestSignalResult } from '../../server/algorithms/backtesting'`
);
content = content.replace(
  `import type { WickRejectionAssetType } from '@/lib/algorithms/wickRejection'`,
  `import type { WickRejectionAssetType } from '../../server/algorithms/wickRejection'`
);

// Fix any types
content = content.replace(
  `sig.reason.map((r, i) => (`,
  `sig.reason.map((r: string, i: number) => (`
);
content = content.replace(
  `const mapped = candles.map((c) => ({`,
  `const mapped = candles.map((c: any) => ({`
);
content = content.replace(
  `? filter === 'all' ? result.signals : result.signals.filter((s) => s.outcome === filter)`,
  `? filter === 'all' ? result.signals : result.signals.filter((s: any) => s.outcome === filter)`
);
content = content.replace(
  `const tierSigs = result.signals.filter((s) => s.tier === tier)`,
  `const tierSigs = result.signals.filter((s: any) => s.tier === tier)`
);
content = content.replace(
  `const tierWins = tierSigs.filter((s) => s.outcome === 'win').length`,
  `const tierWins = tierSigs.filter((s: any) => s.outcome === 'win').length`
);
content = content.replace(
  `const tierSettled = tierSigs.filter((s) => s.outcome !== 'pending').length`,
  `const tierSettled = tierSigs.filter((s: any) => s.outcome !== 'pending').length`
);
content = content.replace(
  `{result.signals.filter((s) => s.order_block_confluence).length}`,
  `{result.signals.filter((s: any) => s.order_block_confluence).length}`
);
content = content.replace(
  `{result.signals.filter((s) => s.tp1_source === 'structure').length}`,
  `{result.signals.filter((s: any) => s.tp1_source === 'structure').length}`
);
content = content.replace(
  `{result.signals.filter((s) => s.liquidity_sweep).length}`,
  `{result.signals.filter((s: any) => s.liquidity_sweep).length}`
);
content = content.replace(
  `filtered.map((sig, i) => <SignalRow key={sig.id} sig={sig} idx={i} />)`,
  `filtered.map((sig: any, i: number) => <SignalRow key={sig.id} sig={sig} idx={i} />)`
);

fs.writeFileSync(filePath, content);
console.log('Fixed Backtesting.tsx');
