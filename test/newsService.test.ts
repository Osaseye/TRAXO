import http from 'http';
import assert from 'node:assert/strict';

process.env.TRAXO_NO_LISTEN = 'true';

async function runTests() {
  const { NewsEngine } = await import('../server/src/services/news/newsEngine');
  const { createNewsApp } = await import('../server/src/services/news/newsRoutes');
  const { NewsServiceClient } = await import('../server/src/services/news/NewsServiceClient');
  const { evaluatePreTradeGuardrailsAsync } = await import('../server/src/modules/risk/guardrails');
  const { createApp } = await import('../server/src/index');
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  // 1. NewsEngine: fetch, cache, poll, freeze-status, and calendar filtering
  const engine = new NewsEngine({
    redisClient: null, // Force in-memory cache path for isolated unit test
    interCategoryDelayMs: 0,
    fetcher: async (category: string) => {
      if (category === 'forex') {
        return [
          {
            id: 101,
            category: 'forex',
            datetime: nowSec + 10 * 60, // +10m (inside 30m freeze window)
            headline: 'US FOMC Rate Decision and USD CPI Release',
            summary: 'Federal Reserve policy decision impacting USD and EUR pairs',
            source: 'Reuters',
            url: 'https://example.com/fomc',
            image: '',
            related: 'EURUSD',
          },
          {
            id: 102,
            category: 'forex',
            datetime: nowSec + 90 * 60, // +90m (outside 30m freeze window, inside calendar)
            headline: 'ECB GDP Growth Forecast Update for EUR',
            summary: 'European Central Bank outlook',
            source: 'Bloomberg',
            url: 'https://example.com/ecb',
            image: '',
            related: 'EURUSD',
          },
          {
            id: 103,
            category: 'forex',
            datetime: nowSec + 5 * 60, // +5m, but MEDIUM severity (should NOT freeze)
            headline: 'GBP Minor Technical Flow Commentary',
            summary: 'Intraday liquidity notes for GBP',
            source: 'FXStreet',
            url: 'https://example.com/gbp',
            image: '',
            related: 'GBPUSD',
          },
        ];
      }
      if (category === 'general') {
        return [
          {
            id: 201,
            category: 'general',
            datetime: nowSec - 120 * 60, // -120m (past, excluded from upcoming calendar)
            headline: 'US NFP Payrolls Earlier Today',
            summary: 'USD labor report',
            source: 'CNBC',
            url: 'https://example.com/nfp',
            image: '',
            related: 'USD',
          },
        ];
      }
      if (category === 'merger') {
        throw new Error('Simulated Finnhub merger category failure');
      }
      return [];
    },
  });

  // Poll coalescing & partial-failure resilience
  const [pollA, pollB] = await Promise.all([
    engine.pollAllCategories(),
    engine.pollAllCategories(),
  ]);
  assert.equal(pollA.ok, true, 'poll should succeed when at least one category succeeds');
  assert.equal(pollB.polledAt, pollA.polledAt, 'concurrent polls should coalesce');
  assert.equal(pollA.categories.forex.ok, true);
  assert.equal(pollA.categories.forex.count, 3);
  assert.equal(pollA.categories.merger.ok, false);

  // Freeze status: EURUSD should be frozen due to FOMC (+10m)
  const eurFreeze = await engine.getFreezeStatus('EUR/USD', { nowMs });
  assert.equal(eurFreeze.symbol, 'EURUSD');
  assert.equal(eurFreeze.isFrozen, true);
  assert.equal(eurFreeze.minutesToImpact, 10);
  assert.equal(eurFreeze.activeEvents.length, 1);
  assert.equal(eurFreeze.activeEvents[0].severity, 'CRITICAL');
  assert.ok(eurFreeze.reason && eurFreeze.reason.includes('CRITICAL'));

  // Freeze status: non-matching symbol should not be frozen
  const btcFreeze = await engine.getFreezeStatus('BTCUSD', { nowMs });
  assert.equal(btcFreeze.symbol, 'BTCUSD');
  assert.equal(btcFreeze.isFrozen, false);
  assert.equal(btcFreeze.activeEvents.length, 0);

  // Calendar: returns upcoming HIGH/CRITICAL events only, sorted ascending
  const calendar = await engine.getCalendar({ nowMs });
  assert.equal(calendar.count, 2, 'should include FOMC (+10m) and ECB GDP (+90m), exclude MEDIUM and past');
  assert.equal(calendar.events[0].id, 101);
  assert.equal(calendar.events[1].id, 102);

  // 2. NewsServiceClient: local fallback, non-blocking timeout, and circuit breaker
  const localClient = new NewsServiceClient({ engine, timeoutMs: 300 });
  const clientFreeze = await localClient.getFreezeStatus('EURUSD');
  assert.equal(clientFreeze.isFrozen, true);

  const clientCtx = await localClient.getUpcomingNewsContext('EURUSD');
  assert.equal(clientCtx.minutesAway, 10);
  assert.ok(clientCtx.newsEvents.length >= 1);

  // Slow hanging engine should never block past timeoutMs
  const slowEngine = new NewsEngine({
    redisClient: {
      async get() {
        return await new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 5_000);
          if (typeof t.unref === 'function') t.unref();
        });
      },
      async set() {},
      async del() {},
    },
  });
  const nonBlockingClient = new NewsServiceClient({ engine: slowEngine, timeoutMs: 80 });
  const t0 = Date.now();
  const slowStatus = await nonBlockingClient.getFreezeStatus('EURUSD');
  const elapsed = Date.now() - t0;
  assert.equal(slowStatus.isFrozen, false, 'slow engine must fail open');
  assert.equal(slowStatus.source, 'fallback');
  assert.ok(elapsed < 500, `expected non-blocking fallback (<500ms), took ${elapsed}ms`);

  // Remote HTTP failure -> trips circuit breaker & falls back locally
  const remoteFailingClient = new NewsServiceClient({
    baseUrl: 'http://127.0.0.1:1', // unreachable port
    timeoutMs: 120,
    failureThreshold: 2,
    cooldownMs: 30_000,
    engine,
  });
  const f1 = await remoteFailingClient.getFreezeStatus('EURUSD');
  assert.equal(f1.isFrozen, true, 'falls back to local engine on remote error #1');
  const f2 = await remoteFailingClient.getFreezeStatus('EURUSD');
  assert.equal(f2.isFrozen, true, 'falls back to local engine on remote error #2');
  assert.equal(remoteFailingClient.getCircuitState().state, 'OPEN', 'circuit opens after threshold');

  // 3. Guardrails async integration (D.3)
  const guardrailBlocked = await evaluatePreTradeGuardrailsAsync({
    signal: {
      symbol: 'EURUSD',
      direction: 'BUY',
      strategyId: 'order_block',
      timeframe: '15m',
      entry: 1.1,
      sl: 1.098,
      tp: 1.105,
      confidence: 85,
    },
    newsMinutesAway: clientCtx.minutesAway,
    now: new Date(Date.UTC(2026, 10, 17, 14, 0, 0)),
  });
  assert.equal(guardrailBlocked.allowed, false);
  assert.equal(guardrailBlocked.rejectedBy?.code, 'D.3');

  // 4. Express routes mounted at /api/v1/news (isolated engine router + full createApp mount check)
  const testApp = createNewsApp(engine);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const freezeRes = await fetch(`${baseUrl}/api/v1/news/freeze-status/EURUSD`);
    assert.equal(freezeRes.status, 200);
    const freezeBody = (await freezeRes.json()) as any;
    assert.equal(freezeBody.symbol, 'EURUSD');
    assert.equal(typeof freezeBody.isFrozen, 'boolean');
    assert.ok('reason' in freezeBody);
    assert.ok('minutesToImpact' in freezeBody);
    assert.ok(Array.isArray(freezeBody.activeEvents));

    const calRes = await fetch(`${baseUrl}/api/v1/news/calendar?symbol=EURUSD`);
    assert.equal(calRes.status, 200);
    const calBody = (await calRes.json()) as any;
    assert.equal(calBody.ok, true);
    assert.equal(calBody.count, 2);

    const pollRes = await fetch(`${baseUrl}/api/v1/news/poll`, { method: 'POST' });
    assert.equal(pollRes.status, 200);
    const pollBody = (await pollRes.json()) as any;
    assert.equal(pollBody.ok, true);
    assert.equal(pollBody.totalItems, 4);

    // Also verify NewsServiceClient over live HTTP against newsRoutes
    const httpClient = new NewsServiceClient({ baseUrl, timeoutMs: 1000, engine: slowEngine });
    const httpFreeze = await httpClient.getFreezeStatus('EURUSD');
    assert.equal(httpFreeze.isFrozen, true);
    assert.equal(httpFreeze.source, 'remote');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // 5. Verify main Express createApp() mounts /api/v1/news routes cleanly
  const mainApp = createApp();
  const mainServer = http.createServer(mainApp);
  await new Promise<void>((resolve) => mainServer.listen(0, '127.0.0.1', resolve));
  const mainAddr = mainServer.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${mainAddr.port}/api/v1/news/freeze-status/EURUSD`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.symbol, 'EURUSD');
    assert.equal(typeof body.isFrozen, 'boolean');
    assert.ok(Array.isArray(body.activeEvents));
  } finally {
    await new Promise<void>((resolve) => mainServer.close(() => resolve()));
  }

  console.log('All newsService tests passed!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
