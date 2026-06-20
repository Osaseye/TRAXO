const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/Dashboard.tsx');
let c = fs.readFileSync(filePath, 'utf8');

c = c.replace(/import \{ useEffect, useMemo, useRef, useState \} from 'react';/, "import { useEffect, useState } from 'react';");
c = c.replace(/import type \{ Time, UTCTimestamp \} from 'lightweight-charts';/, "import type { UTCTimestamp } from 'lightweight-charts';");
c = c.replace(/import \{ ChevronDown, X \} from 'lucide-react';\r?\n/, "");
c = c.replace(/import \{ useSearchParams \} from 'react-router-dom';\r?\n/, "");
c = c.replace(/import \{ getCandleData, getLiveSignals, getHistoricalSignals \} from '@\/lib\/api';/, "import { getCandleData, getLiveSignals } from '@/lib/api';");
c = c.replace(/import \{ useOnboardingStore \} from '@\/stores\/useOnboardingStore';\r?\n/, "");
c = c.replace(/import \{ useAuthStore \} from '@\/stores\/useAuthStore';\r?\n/, "");
c = c.replace(/import \{ ChartPanel, type ChartPanelMarker, type ChartPanelActiveSignal, type ChartPanelManualSetup \} from '@\/components\/dashboard\/ChartPanel';\r?\n/, "");
c = c.replace(/import \{ DesktopWorkspaceNav, MobileFloatingWorkspaceNav \} from '@\/components\/layout\/WorkspaceNav';\r?\n/, "");
c = c.replace(/const priceDigits = \(symbol: string\) => 2;\r?\n/, "");
c = c.replace(/const \{ chartSymbol, setChartSymbol, chartTimeframe, setChartTimeframe \} = useTradingContextStore\(\);/, "const { chartSymbol, chartTimeframe } = useTradingContextStore();");
c = c.replace(/subscribe\('new-candle', \(candle\)/, "subscribe('new-candle', (candle: any)");
c = c.replace(/subscribe\('new-signal', \(signal\)/, "subscribe('new-signal', (signal: any)");

fs.writeFileSync(filePath, c);
console.log('Fixed Dashboard.tsx');
