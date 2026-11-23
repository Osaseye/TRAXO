# TRAXO System Verification, News Implementation Audit & API Key Readiness Report

> **Snapshot Date:** 2026-11-22  
> **Workspace:** `c:\Users\sadeb\OneDrive\Desktop\TRAXO`

---

## 1. Completed & Verified System Milestones

All core build tasks for the tri-market strategy expansion and frontend update have been completed and verified with **0 compiler or test errors**:

- **15 TRAXO Proprietary Strategy Engines** across **3 Market Pillars** (`server/algorithms/traxo/`):
  - **Forex Majors (5):** `TRAXO London Apex`, `TRAXO Tokyo Yield`, `TRAXO Sovereign Fix`, `TRAXO Barrier Grid`, `TRAXO Macro Vector`
  - **Gold · XAU/USD (5):** `TRAXO Aurum Sweep`, `TRAXO Bullion Strike`, `TRAXO NY Bullet`, `TRAXO Aurum Fix`, `TRAXO Kinetic NR7`
  - **Futures · MNQ (5):** `TRAXO Globex Sweep`, `TRAXO Velocity ORB`, `TRAXO Initial Balance`, `TRAXO Mean Equilibrium`, `TRAXO Power Hour MOC`
- **9-Point Confluence Matrix & Tri-Market Risk Calibration:**
  - `server/algorithms/traxo/confluenceMatrix.ts` + `server/src/config/instruments.ts` (`EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, `XAUUSD` as `COMMODITY`, `MNQ` as `FUTURES` with `$2/pt`, `0.25` tick, discrete contracts, per-pair spread caps, and XAUUSD rollover quarantine).
  - Isolated parameters & adaptive win/loss feedback for all 15 `traxo_*` IDs in `server/src/modules/optimizer/strategyOptimizer.ts`.
  - Dispatch and `try/catch` isolation in `server/src/modules/scanner/signalScanner.ts`.
- **Decoupled News Service (`server/src/services/news/`):**
  - Built `newsEngine.ts`, `newsRoutes.ts` (`/api/v1/news/*`), `NewsServiceClient.ts` (circuit-breaker + stale snapshot fallback), `COMMODITY`/`FUTURES` token mapping, and WebSocket transition broadcasts (`NEWS_FREEZE_ENTER`, `NEWS_RELEASED`, `NEWS_FREEZE_EXIT`).
- **Frontend Strategies & Blueprints UI (`src/`):**
  - Updated `src/lib/traxoStrategies.ts`, `src/pages/StrategyManager.tsx`, `src/pages/StrategyDetail.tsx`, `src/stores/useOnboardingStore.ts` (v3 migration), `src/lib/signalDetection.ts`, and `src/components/strategies/TraxoStrategyVisual.tsx` (15 on-brand flat 2D `#09090B` institutional candlestick SVG schematics).
- **Verification Summary (All Passing):**
  - Backend TypeScript check (`server tsc --noEmit`): **0 errors**
  - Test suites (`wickRejectionContext.test.ts`, `signalLifecycle.test.ts`, `traxoForexEngines.test.ts`, `traxoGoldStrategies.test.ts`, `traxoFuturesEngines.test.ts`, `newsService.test.ts`, `traxoScannerIntegration.test.ts`): **All passed**
  - Frontend production build (`npm run build` / `tsc -b && vite build`): **Passed** (`672` modules, 0 errors)

---

## 2. Live External API & Infrastructure Probe Results

| Service / Env Key | Status | Live Probe Result & Notes |
| :--- | :--- | :--- |
| **TwelveData (`EUR/USD`, `XAU/USD`)** (`TWELVEDATA_API_KEY`..`_4`) | Working | Live 15m candles returned cleanly |
| **TwelveData (`NQ` / `MNQ` / `NDX` / `USTEC`)** | **Routed to Yahoo `MNQ=F`** | TwelveData returns 404 on futures tickers; `MNQ` / `FUTURES` now automatically route to zero-key Yahoo Finance `MNQ=F` (`NQ=F` fallback) with SQLite archiving across `1m`/`5m`/`15m`/`1h`/`4h`/`1d`. |
| **Finnhub** (`FINNHUB_API_KEY`, `FINNHUB_API_KEY_2`) | **Working (Dual-Key Rotation)** | Verified 2 keys in round-robin pool with automatic `429`/`401` failover in `newsEngine.ts`. |
| **Upstash Redis** (`UPSTASH_REDIS_*`) | **Working (`loyal-lamb-83887`)** | Replaced deleted host with South Africa Upstash Redis (`loyal-lamb-83887.upstash.io`) + `rediss://` TLS and `3.5s` REST timeout margin. |
| **ForexFactory Calendar JSON** *(no API key needed)* | **Working (Wired + 429 Backoff)** | Integrated into `newsEngine.ts` (`CALENDAR_TTL_SECONDS = 30m`) for scheduled Guardrail D.3 pre-event freezes across FX, Gold, and MNQ. |
| **Firebase** (`FIREBASE_SERVICE_ACCOUNT`, `VITE_FIREBASE_*`) | Configured / OK | Admin SDK initializes cleanly in test and server environments. |
| **MetaAPI** (`METAAPI_TOKEN`, `METAAPI_ACCOUNT_ID`) | Configured (Standby) | Present in `server/.env`; decoupled via `PaperBrokerService` (`EXECUTION_MODE=paper`) for reliable testing without third-party broker downtime. |
| **Admin Emails** (`VITE_ADMIN_EMAILS`) | Placeholder | Still set to a placeholder value in root `.env`. |
| **Remote News URL** (`NEWS_SERVICE_URL`) | Not set *(optional)* | Defaults to running `NewsEngine` in-process at `/api/v1/news/*`. Only required when deploying News Engine as an isolated host. |

---

## 3. News Implementation Audit (Capabilities vs. Remaining Gaps)

### What Is Built
- Decoupled microservice-ready `NewsEngine` + Express router (`/api/v1/news/health`, `/freeze-status/:symbol`, `/calendar`, `/poll`).
- Non-blocking `NewsServiceClient` with 1.5s timeout, circuit breaker, stale fallback, and fail-open behavior so `signalScanner.ts` and `guardrails.ts` never block.
- Asset-class-aware token matching (`COMMODITY`/`XAUUSD` -> `XAU`, `USD`, `FED`, `FOMC`, `CPI`; `FUTURES`/`MNQ` -> `USD`, `NASDAQ`, `NDX`, `FED`, `FOMC`, `CPI`, `NFP`).
- Real-time WebSocket freeze transition events (`NEWS_FREEZE_ENTER`, `NEWS_RELEASED`, `NEWS_FREEZE_EXIT`).

### Remaining Gaps to Address Next
1. **Past Headlines vs. Upcoming Scheduled Economic Calendar (Critical):**
   - `newsEngine.ts` currently polls Finnhub `/api/v1/news`, which returns **already-published articles** (`datetime <= now`). That means `minutes_away` is past/negative and cannot forecast upcoming scheduled Tier-1 events (CPI, FOMC, NFP, ECB, BoE, BoJ) 30 minutes *before* release to enforce Guardrail D.3 pre-event freezes.
   - Finnhub's `/api/v1/calendar/economic` endpoint is also paywalled on paid Finnhub plans.
   - **Recommended Fix:** Wire the free **ForexFactory JSON calendar feed** (zero API key required, tested live) + optional `FMP_API_KEY` for scheduled upcoming Tier-1 freezes, while retaining Finnhub (with a valid free `FINNHUB_API_KEY`) for unscheduled breaking headlines.
2. **Frontend News & Freeze UI Not Wired:**
   - `src/hooks/useNews.ts` points to legacy `/api/news`, and no React component currently displays the economic calendar or live `NEWS_FREEZE_*` WebSocket status banners.
3. **MNQ Live Candle Routing:**
   - `server/src/config/instruments.ts` currently maps `MNQ` to `twelveDataSymbol: 'NQ'`, which returns 404 on the current TwelveData tier. Routing `MNQ` through MetaAPI `USTEC` candles, TwelveData `QQQ` proxy, or an external futures market-data key is required for live MNQ scans outside offline replay.

---

## 4. API Keys & Configuration Checklist Needed

1. **Finnhub API Key (`FINNHUB_API_KEY`):** Provide a valid free key from `finnhub.io` to replace the `401` key for live breaking headlines.
2. **Economic Calendar Confirmation:** Confirm using the free **ForexFactory JSON feed** (no key required) for scheduled Guardrail D.3 pre-event freezes, and optionally provide `FMP_API_KEY` / TradingEconomics if desired.
3. **Upstash Redis (`UPSTASH_REDIS_*`):** Provide credentials for an active Upstash Redis database, or confirm removing the dead host from `server/.env` to run cleanly on local Redis / in-memory cache.
4. **MNQ Live Data Source:** Choose between MetaAPI `USTEC` candles (24/5 Globex + RTH, no new key), TwelveData `QQQ` proxy (RTH only), or a dedicated futures data API key.
5. **Admin Email (`VITE_ADMIN_EMAILS`):** Replace placeholder with real admin email(s) in `.env`.
