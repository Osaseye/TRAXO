import React, { useState, useEffect, useCallback } from 'react';
import { getHistoricalSignals, getLiveSignals } from '../lib/api';
import webSocketService from '../lib/websocket';

// A simple display component for a single signal
const Signal = ({ signal }) => (
  <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', margin: '8px 0' }}>
    <p><strong>{signal.symbol}</strong> - {signal.timeframe}</p>
    <p>Strategy: {signal.strategy.name}</p>
    <p>Direction: {signal.direction}</p>
    <p>Date: {new Date(signal.timestamp).toLocaleString()}</p>
  </div>
);

// The main component to track and display signals
const SignalTracker = () => {
  const [liveSignals, setLiveSignals] = useState([]);
  const [historicalSignals, setHistoricalSignals] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch initial data
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [live, historical] = await Promise.all([
          getLiveSignals(),
          getHistoricalSignals(),
        ]);
        setLiveSignals(live);
        setHistoricalSignals(historical.signals || []);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Subscribe to real-time updates
    const unsubscribe = webSocketService.subscribe('new-signal', (newSignal) => {
      console.log('Received new signal via WebSocket:', newSignal);
      // Add to live signals and update historical list
      setLiveSignals(prev => [newSignal, ...prev]);
      setHistoricalSignals(prev => [newSignal, ...prev]);
    });

    // Clean up the subscription on component unmount
    return () => {
      unsubscribe();
    };
  }, []);

  if (isLoading) {
    return <div>Loading signals...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div>
      <h2>Live Signals</h2>
      {liveSignals.length > 0 ? (
        liveSignals.map(signal => <Signal key={signal.id} signal={signal} />)
      ) : (
        <p>No live signals at the moment.</p>
      )}

      <h2>Historical Signals</h2>
      {historicalSignals.length > 0 ? (
        historicalSignals.map(signal => <Signal key={signal.id} signal={signal} />)
      ) : (
        <p>No historical signals found.</p>
      )}
    </div>
  );
};

export default SignalTracker;
