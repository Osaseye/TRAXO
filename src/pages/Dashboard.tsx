import { useEffect, useMemo, useRef, useState } from 'react';
import type { Time, UTCTimestamp } from 'lightweight-charts';
import { ChevronDown, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// --- NEW IMPORTS ---
import { getCandleData, getLiveSignals, getHistoricalSignals } from '@/lib/api';
import webSocketService from '@/lib/websocket';
import SignalTracker from '@/components/SignalTracker';

// Legacy store imports (should be phased out or adapted)
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTradingContextStore } from '@/stores/useTradingContextStore';

// Component imports
import { ChartPanel, type ChartPanelMarker, type ChartPanelActiveSignal, type ChartPanelManualSetup } from '@/components/dashboard/ChartPanel';
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav';

// Type definitions (might need to be centralized)
interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface AnalysisSignal {
  id: string;
  time: UTCTimestamp;
  symbol: string;
  timeframe: string;
  strategy: { id: string; name: string };
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  confidence: number;
  risk: RiskLabel;
  status: 'live' | 'expired';
  reason: string[];
  strategyLabel: string;
}

// Dummy type definitions to avoid breaking the UI
type RiskLabel = 'Low' | 'Medium' | 'High';
const priceDigits = (symbol: string) => 2;

// ... (rest of the component, with old logic removed and new logic added)

export default function Dashboard() {
  const [signals, setSignals] = useState<AnalysisSignal[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const { chartSymbol, setChartSymbol, chartTimeframe, setChartTimeframe } = useTradingContextStore();

  useEffect(() => {
    setLoading(true);

    // Fetch initial data
    const fetchData = async () => {
      try {
        const [candleData, liveSignals] = await Promise.all([
          getCandleData(chartSymbol, chartTimeframe),
          getLiveSignals(),
        ]);

        setCandles(candleData.candles || []);
        setSignals(liveSignals || []);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to WebSocket updates
    const unsubscribeCandle = webSocketService.subscribe('new-candle', (candle) => {
        if (candle.symbol === chartSymbol && candle.timeframe === chartTimeframe) {
            setCandles(prev => [...prev, candle]);
        }
    });
    
    const unsubscribeSignal = webSocketService.subscribe('new-signal', (signal) => {
      setSignals(prev => [signal, ...prev]);
    });

    // Clean up subscriptions on component unmount or when dependencies change
    return () => {
      unsubscribeCandle();
      unsubscribeSignal();
    };
  }, [chartSymbol, chartTimeframe]);

  // Return a simplified layout with the SignalTracker for now.
  // The full UI can be re-integrated with the new data flow.
  return (
    <div className="min-h-screen bg-[#070709] text-white">
      <header className="h-14 border-b border-white/[0.05] px-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">TRAXO Dashboard</h1>
        <div>
          <span>{chartSymbol}</span> | <span>{chartTimeframe}</span>
        </div>
      </header>
      <main className="p-4">
        {loading ? (
          <p>Loading data...</p>
        ) : (
          <SignalTracker />
        )}
      </main>
    </div>
  );
}
