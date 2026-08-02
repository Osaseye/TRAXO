/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import webSocketService from '@/lib/websocket';
import type { Candle } from '@/lib/signalDetection';
import type { ChartSymbol, ChartTimeframe } from '@/stores/useTradingContextStore';

interface UseMarketWebSocketProps {
  symbol: ChartSymbol;
  timeframe: ChartTimeframe;
  candles: Candle[];
  enabled: boolean;
  onCandleUpdate: (nextCandles: Candle[]) => void;
}

export function useMarketWebSocket({ symbol, timeframe, candles, enabled, onCandleUpdate }: UseMarketWebSocketProps) {
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = webSocketService.subscribe('new-candle', (newCandle: any) => {
      if (newCandle.symbol === symbol && newCandle.timeframe === timeframe) {
        onCandleUpdate([...candles, newCandle]);
      }
    });

    return () => unsubscribe();
  }, [symbol, timeframe, candles, enabled, onCandleUpdate]);
}
