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
        const newTime = typeof newCandle.time === 'string' ? Math.floor(new Date(newCandle.time).getTime() / 1000) : Number(newCandle.time);
        if (Number.isNaN(newTime)) return;

        const lastCandle = candles[candles.length - 1];
        const lastTime = lastCandle
          ? typeof lastCandle.time === 'string'
            ? Math.floor(new Date(lastCandle.time).getTime() / 1000)
            : Number(lastCandle.time)
          : null;

        if (lastTime === newTime) {
          // Replace existing candle in place for real-time tick updates
          const updated = [...candles];
          updated[updated.length - 1] = { ...newCandle, time: newTime };
          onCandleUpdate(updated);
        } else {
          // Append new candle for a new interval
          onCandleUpdate([...candles, { ...newCandle, time: newTime }]);
        }
      }
    });

    return () => unsubscribe();
  }, [symbol, timeframe, candles, enabled, onCandleUpdate]);
}
