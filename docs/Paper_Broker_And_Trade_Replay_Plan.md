# TRAXO Internal Paper Broker, Deterministic Win/Loss Resolution & Visual Trade Replay Plan

> [!IMPORTANT]
> **Scope & Architectural Goal:** Decouple TRAXO's auto-execution from third-party broker dependencies (`MetaAPI`) during testing by introducing a self-contained **Internal Paper Broker (`PaperBrokerService`)** backed by an embedded **SQLite** database (`server/data/traxo_market.db`), a **Deterministic Multi-Stage Win/Loss Resolver** with dynamic `100% TP1` vs. `50% TP1 + Breakeven + TP2` exit management, **TwelveData Live + Offline Candle Replay**, and an interactive **Visual Trade Proof & Replay UI** under a dedicated **Paper Ledger** tab.

---

## 1. Current Root-Cause Deficiencies Audited in Codebase

1. **Hard MetaAPI Coupling:** [metaApiService.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/execution/metaApiService.ts#L123-L404) directly calls `metaapi.cloud-sdk`. When unconnected, `getAccountInfo()` returns `balance: 0, connected: false`, `getSymbolQuote()` fails, `executeTrade()` throws, and [AutoTraderWidget.tsx](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/components/shared/AutoTraderWidget.tsx#L96-L160) displays `Offline` despite user-configured balances existing in [tradingContext.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/routes/tradingContext.ts#L7-L35).
2. **Flimsy Win/Loss Evaluation:**
   - **Single-Candle Blind Spot:** `resolveActiveSignalsForCandle` in [signalScanner.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/scanner/signalScanner.ts#L254-L295) only checks `latestCandle`, missing hits that occur between scans or across server restarts.
   - **Phantom Limit Fills:** Pending `LIMIT` and `STOP` orders are evaluated against TP/SL without verifying that price actually touched and filled the entry level first.
   - **Same-Bar SL/TP Ambiguity:** Both [signalScanner.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/scanner/signalScanner.ts#L270-L276) and [signalLifecycle.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/lib/signalLifecycle.ts#L63-L82) blindly mark same-bar touches as `LOSS` instead of inspecting 1-minute sub-candles.
   - **No Spread Asymmetry or True Dollar P&L:** Exits ignore Bid/Ask spread (`SELL` stops trigger on Ask = `high + spread`), and `signalScanner.ts` passes `0` on wins and flat `riskAmountUsd` on losses instead of real contract/lot P&L.
3. **Ephemeral Candle Storage:** [candleCache.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/market-data/candleCache.ts#L40-L59) caches a single rolling 200-bar array with a `2 × interval` TTL. Historical candles from prior days disappear, making it impossible to click an older win or loss and visually inspect how price cleared TP or breached SL.

---

## 2. Target System Architecture

```mermaid
flowchart TD
    subgraph Market_Data["Market Data & Replay Layer"]
        TD["TwelveData API (Live & Backfill)"]
        SQLiteCandles[("SQLite: candles\n(Persistent OHLCV Archive)")]
        OfflineReplay["Offline Bar-by-Bar Replay Controller\n(1x / 5x / 15x / Step)"]
        TD -->|Upsert on every fetch| SQLiteCandles
        SQLiteCandles --> OfflineReplay
    end

    subgraph Core_Pipeline["TRAXO Scanner & Guardrails"]
        Scanner["Signal Scanner (15 Proprietary Engines)"]
        Guardrails["9-Point Guardrail Evaluator"]
        Scanner --> Guardrails
    end

    subgraph Execution_Layer["Swappable Execution Broker (IExecutionBroker)"]
        Router{"EXECUTION_MODE\n(paper | metaapi)"}
        PaperBroker["PaperBrokerService\n(Internal Wallet, Orders & Margin)"]
        MetaBroker["MetaApiBrokerService\n(Standby Live MT5)"]
        Resolver["Deterministic Trade Resolver\n(Fill -> Dynamic TP1/TP2 -> 1m Tie-Break)"]
        Guardrails --> Router
        Router -->|paper (default)| PaperBroker
        Router -->|metaapi| MetaBroker
        PaperBroker <--> Resolver
    end

    subgraph Persistence_And_UI["SQLite Ledger & Visual Proof UI"]
        SQLiteLedger[("SQLite: paper_accounts,\npaper_trades,\ntrade_replay_snapshots")]
        PaperTab["TradingJournal: 'Paper Ledger' Tab"]
        ReplayDrawer["Visual Trade Replay Modal / ChartPanel\n(Entry -> TP1 Scale -> BE -> TP2 / SL)"]
        Resolver -->|Freeze 60 Pre + Trade + 20 Post Bars| SQLiteLedger
        SQLiteLedger --> PaperTab
        PaperTab -->|Click Win / Loss| ReplayDrawer
    end

    TD --> Scanner
    OfflineReplay --> Scanner
    SQLiteCandles --> Resolver
```

---

## 3. Pillar 1: Embedded SQLite Persistence (`server/src/modules/storage/sqliteDb.ts`)

Create a self-contained SQLite database at `server/data/traxo_market.db` (using WAL mode for sub-millisecond concurrent reads/writes).

### Database Schema

```sql
-- 1. Persistent Multi-Timeframe OHLCV Archive
CREATE TABLE IF NOT EXISTS candles (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  time INTEGER NOT NULL,          -- Unix timestamp (seconds, UTC)
  timestamp TEXT NOT NULL,        -- ISO-8601 UTC string
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, timeframe, time)
);
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, timeframe, time DESC);

-- 2. Internal Paper Trading Wallet & Account State
CREATE TABLE IF NOT EXISTS paper_accounts (
  uid TEXT PRIMARY KEY,
  starting_balance REAL NOT NULL DEFAULT 10000,
  balance REAL NOT NULL DEFAULT 10000,
  equity REAL NOT NULL DEFAULT 10000,
  used_margin REAL NOT NULL DEFAULT 0,
  free_margin REAL NOT NULL DEFAULT 10000,
  floating_pnl REAL NOT NULL DEFAULT 0,
  realized_pnl REAL NOT NULL DEFAULT 0,
  peak_equity REAL NOT NULL DEFAULT 10000,
  max_drawdown_pct REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  leverage INTEGER NOT NULL DEFAULT 100,
  updated_at INTEGER NOT NULL
);

-- 3. Paper Trades & Order Lifecycle Ledger
CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL DEFAULT 'default_trader',
  signal_id TEXT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  market TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  strategy_label TEXT NOT NULL,
  tier TEXT NOT NULL,
  direction TEXT NOT NULL,        -- 'BUY' | 'SELL'
  entry_type TEXT NOT NULL,       -- 'MARKET' | 'LIMIT' | 'STOP'
  exit_mode TEXT NOT NULL,        -- 'FULL_TP1' | 'SCALE_50_TP1_BE_TP2'
  status TEXT NOT NULL,           -- 'PENDING' | 'OPEN' | 'PARTIAL_TP1' | 'WIN_TP1' | 'WIN_TP2' | 'WIN_TP1_BE' | 'LOSS_SL' | 'CLOSED_MANUAL' | 'EXPIRED' | 'CANCELLED'
  requested_entry REAL NOT NULL,
  fill_price REAL,
  sl_price REAL NOT NULL,
  current_sl REAL NOT NULL,
  tp1_price REAL NOT NULL,
  tp2_price REAL,
  initial_volume REAL NOT NULL,
  open_volume REAL NOT NULL,
  risk_amount_usd REAL NOT NULL,
  planned_rr REAL NOT NULL,
  confidence REAL NOT NULL,
  spread_pips_at_entry REAL,
  created_at INTEGER NOT NULL,
  filled_at INTEGER,
  tp1_hit_at INTEGER,
  tp1_fill_price REAL,
  tp1_pnl_usd REAL NOT NULL DEFAULT 0,
  closed_at INTEGER,
  exit_price REAL,
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  floating_pnl_usd REAL NOT NULL DEFAULT 0,
  realized_r REAL NOT NULL DEFAULT 0,
  mfe_price REAL,
  mae_price REAL,
  mfe_r REAL NOT NULL DEFAULT 0,
  mae_r REAL NOT NULL DEFAULT 0,
  bars_held INTEGER NOT NULL DEFAULT 0,
  balance_before REAL,
  balance_after REAL,
  resolution_method TEXT,         -- 'exact_1m' | 'candle_ohlc' | 'conservative_tiebreak' | 'manual'
  last_evaluated_time INTEGER,
  reasons_json TEXT,
  confluence_json TEXT,
  events_json TEXT                -- Chronological audit trail of fill, TP1 scale, BE move, final close
);
CREATE INDEX IF NOT EXISTS idx_paper_trades_uid_status ON paper_trades(uid, status, created_at DESC);

-- 4. Frozen Trade Replay Snapshots (Visual Proof Archive)
CREATE TABLE IF NOT EXISTS trade_replay_snapshots (
  trade_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  pre_entry_bars INTEGER NOT NULL,
  trade_bars INTEGER NOT NULL,
  post_exit_bars INTEGER NOT NULL,
  candles_json TEXT NOT NULL,     -- Array of OHLCV bars spanning [entry - 60 bars .. exit + 20 bars]
  markers_json TEXT NOT NULL,     -- Chart markers: SIGNAL -> FILL -> TP1_SCALE / BE_MOVE -> EXIT
  price_lines_json TEXT NOT NULL, -- Entry, Initial SL, Breakeven SL, TP1, TP2 coordinates
  created_at INTEGER NOT NULL
);
```

---

## 4. Pillar 2: Swappable Broker Adapter & Internal `PaperBrokerService`

### 4.1 `IExecutionBroker` Contract (`server/src/modules/execution/executionBroker.ts`)
- Defines a single interface implemented by both `PaperBrokerService` (`EXECUTION_MODE=paper`, default) and `MetaApiBrokerService` (`EXECUTION_MODE=metaapi`, standby):
  - `getAccountInfo(uid?: string)`
  - `resetOrSetPaperBalance(uid: string, balanceUsd: number)`
  - `getSymbolQuote(symbol: string)`
  - `executeTrade(params: ExecuteTradeParams)`
  - `getOpenPositions(uid?: string)`
  - `getOpenOrders(uid?: string)`
  - `closePosition(positionId: string, exitPriceOverride?: number)`
  - `cancelOrder(orderId: string)`
  - `getClosedTrades(uid?: string, limit?: number)`
  - `getTradeReplay(tradeId: string)`

### 4.2 Quote & Balance Mechanics in `PaperBrokerService`
- **User-Configured Balance Sync:** Reads the user's configured `accountBalance` from [tradingContext.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/routes/tradingContext.ts) on initialization and provides `POST /api/execution/paper/reset-account` (and `/api/metaapi/account/reset`) so the user can set, top up, or reset their virtual capital at any time.
- **Synthetic Bid/Ask Quotes from Live/Replay Candles:** Uses the latest archived or live candle close for the symbol and applies a realistic typical spread derived from [instruments.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/config/instruments.ts) (e.g. `0.6 pips` on `EURUSD`, `1.8 pips` on `XAUUSD`, `0.50 pt` = 2 ticks on `MNQ`) so Guardrail `C.9` (Spread Cap) and mark-to-market equity calculations run identically to live broker conditions.

---

## 5. Pillar 3: Dynamic TP1/TP2 Exit Policy & Deterministic Win/Loss Resolver

### 5.1 Dynamic Exit Policy Assignment (`assignDynamicExitMode`)
At order creation, TRAXO inspects position size, strategy archetype, and 9-point confluence tier to assign `exit_mode`:

1. **Position Splittability Gate (`FULL_TP1`):**
   - If `market === 'FUTURES'` and `contracts < 2`, OR `market !== 'FUTURES'` and `lots < 0.02`, assign **`FULL_TP1`** (cannot split 1 contract or 0.01 micro-lot).
2. **Mean-Reversion & Benchmark Fix Snapback Archetypes (`FULL_TP1`):**
   - If `strategyId` is one of `traxo_mean_equilibrium`, `traxo_sovereign_fix`, `traxo_aurum_fix`, `traxo_barrier_grid`, `traxo_power_hour_moc`, OR confluence tier is **`AGGRESSIVE`** (`< 6` confluence points), assign **`FULL_TP1`** (100% exit at `tp1Price`).
3. **Expansion, Sweep-to-Trend & Breakout Archetypes (`SCALE_50_TP1_BE_TP2`):**
   - If `strategyId` is one of `traxo_london_apex`, `traxo_aurum_sweep`, `traxo_ny_bullet`, `traxo_kinetic_nr7`, `traxo_velocity_orb`, `traxo_globex_sweep`, `traxo_initial_balance`, `traxo_macro_vector`, `traxo_bullion_strike`, `traxo_tokyo_yield` **AND** tier is **`PRIME` or `STANDARD`** (>= 6 confluence points) **AND** `tp2Price` is defined, assign **`SCALE_50_TP1_BE_TP2`**:
     - **Stage 1 (TP1 Hit):** Close 50% of volume (`Math.floor(contracts / 2)` for futures, `round(lots / 2, 2)` for FX/Gold), book realized USD profit immediately to account balance, transition status to `PARTIAL_TP1`, and move `current_sl` to **Breakeven (`fill_price` +/- spread buffer)**.
     - **Stage 2 (Runner to TP2 or BE):** Remaining 50% runs until `tp2_price` is cleared (`WIN_TP2`) or retraces to `current_sl` (`WIN_TP1_BE` — net positive Partial Win).

### 5.2 Deterministic Multi-Candle Resolution (`TradeResolutionEngine.ts`)
On every scan cycle (or replay tick), for each active `PENDING`, `OPEN`, or `PARTIAL_TP1` trade:
1. **Chronological Candle Replay:** Query all candles from SQLite for `(symbol, timeframe)` with `time > lastEvaluatedTime` in ascending order.
2. **Pending Order Fill Verification:**
   - `LIMIT BUY`: fills only when `candle.low + spread <= requested_entry`.
   - `LIMIT SELL`: fills only when `candle.high >= requested_entry`.
   - `STOP BUY`: fills only when `candle.high + spread >= requested_entry`.
   - `STOP SELL`: fills only when `candle.low <= requested_entry`.
   - If `barsSinceCreated > maxExpiryBars` (default 12 bars for intraday, 20 for swing) without filling, transition to `EXPIRED`.
3. **Intrabar 1m Tie-Breaker:**
   - If an `OPEN` or `PARTIAL_TP1` trade's active SL and active TP are both spanned by a single candle (`candle.low <= levelA` and `candle.high >= levelB`), query `candles` for `(symbol, '1m', [candle.time, candle.time + tfSeconds))` from SQLite:
     - Step through the 1m sub-candles in chronological order to determine whether SL or TP was touched first (`resolution_method = 'exact_1m'`).
     - If 1m bars are not cached for that window, resolve conservatively (`SL_FIRST`, `resolution_method = 'conservative_tiebreak'`).
4. **MFE / MAE & Realized Dollar P&L Tracking:**
   - Update `mfe_price`, `mae_price`, `mfe_r`, `mae_r`, and `bars_held` on every bar while open.
   - Calculate exact dollar P&L using `InstrumentSpec.riskPerUnitFactor`:
     `PnL_USD = (ExitPrice - FillPrice) * DirectionSign * VolumeClosed * riskPerUnitFactor`
   - Update `paper_accounts` (`balance`, `equity`, `realized_pnl`, `peak_equity`, `max_drawdown_pct`) and dispatch accurate USD delta to `guardrails` (`recordTradeResolutionForRisk`) and `strategyOptimizer` (`processResolvedWin` / `processResolvedLoss`).
5. **Freeze Visual Replay Snapshot on Close:**
   - When a trade reaches any terminal state (`WIN_TP1`, `WIN_TP2`, `WIN_TP1_BE`, `LOSS_SL`, `CLOSED_MANUAL`), capture `60` candles prior to `created_at`, all candles during the trade, and up to `20` candles after `closed_at` (updating post-exit bars as they arrive until +20 bars are collected) into `trade_replay_snapshots`.

---

## 6. Pillar 4: TwelveData Historical Backfill & Offline Candle Replay Mode

1. **Persistent Candle Archiving ([candleCache.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/market-data/candleCache.ts) & [marketDataService.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/market-data/marketDataService.ts)):**
   - Every TwelveData response is written to both Redis (hot cache) and SQLite `candles` (permanent archive).
   - Extend `fetchCandles` in [marketDataService.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/modules/market-data/marketDataService.ts) to accept optional `{ startDate, endDate, outputsize }` so TRAXO can fetch specific historical windows when backfilling.
   - Extend `GET /api/candles` in [candles.ts](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/server/src/routes/candles.ts) to support `?symbol=XAUUSD&timeframe=15m&from=<unix>&to=<unix>&limit=300`, querying SQLite directly when historical ranges are requested.
2. **Offline Candle Replay Controller (`server/src/modules/replay/offlineReplayController.ts` & `/api/replay/*`):**
   - Allows testing Auto-Trader 24/7 (including weekends or offline) by replaying archived SQLite candles bar-by-bar through `runAllStrategies` -> `evaluatePreTradeGuardrailsAsync` -> `PaperBrokerService` -> `TradeResolutionEngine` -> WebSocket broadcast:
     - `POST /api/replay/start`: `{ symbols, timeframe, startTime, endTime, speedMs }`
     - `POST /api/replay/pause` & `POST /api/replay/resume`
     - `POST /api/replay/step`: advances exactly 1 historical bar across selected symbols
     - `GET /api/replay/status`: returns current replay cursor timestamp, active speed, and progress

---

## 7. Pillar 5: Frontend "Paper Ledger" Tab & Visual Trade Replay UI

1. **Auto-Trader Widget & Settings Enhancement ([AutoTraderWidget.tsx](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/components/shared/AutoTraderWidget.tsx)):**
   - Displays `PAPER ENGINE · ACTIVE` badge when in paper mode, live virtual Balance, Equity, Used/Free Margin, Floating P&L, active `exitMode` pill (`50/50 Scale -> BE` vs `100% TP1`), and an inline **"Set / Reset Paper Balance"** control + **"Offline Replay Mode"** toggle.
2. **Dedicated "Paper Ledger" Tab in [TradingJournal.tsx](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/pages/TradingJournal.tsx):**
   - Adds a top-level tab switcher: **`Manual Journal`** | **`Paper Ledger (Auto-Trader)`**.
   - The **Paper Ledger** tab displays:
     - Paper Account Summary Strip (Starting Capital, Current Balance, Net Realized P&L, Win Rate, Partial-BE Win Count, Profit Factor, Max Drawdown).
     - Filterable table/cards of all paper trades (`OPEN`, `PARTIAL_TP1`, `WIN_TP2`, `WIN_TP1`, `WIN_TP1_BE`, `LOSS_SL`, `EXPIRED`) showing Strategy (`TRAXO London Apex`, etc.), Exit Mode, Fill -> Exit prices, Realized `$` & `R`, and MFE/MAE.
3. **Interactive Visual Trade Replay Drawer (`src/components/journal/TradeReplayDrawer.tsx`):**
   - Triggered whenever the user clicks any win or loss row in the **Paper Ledger**, [JournalDateDetail.tsx](file:///c:/Users/sadeb/OneDrive/Desktop/TRAXO/src/pages/JournalDateDetail.tsx), or Signal Feed.
   - Renders the trade's frozen candlestick series from `GET /api/execution/trades/:id/replay`:
     - **Shaded Risk/Reward Overlays:** Red SL zone, Green TP1 zone, and Extended Emerald TP2 runner zone between `filled_at` and `closed_at`, plus the Breakeven SL step-up line when TP1 was scaled.
     - **Chronological Markers on Candles:**
       1. `SIGNAL` (Candle that triggered the TRAXO engine)
       2. `ENTRY FILLED @ price`
       3. `TP1 HIT (+50% banked, SL -> BE)` (for scaled trades)
       4. `TP2 CLEARED (+$X / +Y.YR)` or `SL HIT (-$X / -1.0R)` or `BE EXIT (+$X)`
     - **Bar-by-Bar Playback Bar:** `Play / Pause`, `Step -1 Bar`, `Step +1 Bar`, `Jump to Entry`, `Jump to TP1`, `Jump to Exit`, and speed selector (`1x`, `2x`, `5x`) so the user can visually watch the candles play out into TP or SL.
     - **Forensics Sidebar:** 9-Point Confluence scorecard from entry time, MFE/MAE excursion bars, resolution method (`1m Exact` vs `OHLC`), and wallet balance before -> after.

---

## 8. Phased Implementation Sequence

| Phase | Deliverables | Key Files Created / Updated |
| :--- | :--- | :--- |
| **Phase 1: SQLite Storage & Candle Archive** | Embedded SQLite schema (`candles`, `paper_accounts`, `paper_trades`, `trade_replay_snapshots`), wire automatic candle archiving into `candleCache.ts` and `marketDataService.ts`, add historical range queries to `GET /api/candles`. | `server/src/modules/storage/sqliteDb.ts`, `server/src/modules/market-data/candleCache.ts`, `server/src/modules/market-data/marketDataService.ts`, `server/src/routes/candles.ts` |
| **Phase 2: Paper Broker & Dynamic Exit Resolver** | Implement `IExecutionBroker`, `PaperBrokerService`, `assignDynamicExitMode` (`FULL_TP1` vs `SCALE_50_TP1_BE_TP2`), `TradeResolutionEngine` (limit fill check, spread-aware exits, 1m intrabar tie-breaker, MFE/MAE, frozen replay snapshot builder), and wire into `signalScanner.ts` and `/api/metaapi/*` + `/api/execution/*`. | `server/src/modules/execution/executionBroker.ts`, `server/src/modules/execution/paperBrokerService.ts`, `server/src/modules/execution/tradeResolutionEngine.ts`, `server/src/modules/scanner/signalScanner.ts`, `server/src/routes/metaApi.ts` |
| **Phase 3: Offline Historical Replay Controller** | Build bar-by-bar historical replay engine streaming archived SQLite candles through the live scanner + paper broker pipeline for 24/7 container/weekend testing. | `server/src/modules/replay/offlineReplayController.ts`, `server/src/routes/replay.ts`, `server/src/routes/index.ts` |
| **Phase 4: Paper Ledger Tab & Visual Trade Replay UI** | Add Paper Balance configurator & Replay controls to `AutoTraderWidget.tsx`, add the **Paper Ledger** tab to `TradingJournal.tsx`, and build `TradeReplayDrawer.tsx` with bar-by-bar candle playback and TP1/BE/TP2/SL visual overlays. | `src/components/shared/AutoTraderWidget.tsx`, `src/pages/TradingJournal.tsx`, `src/components/journal/TradeReplayDrawer.tsx`, `src/hooks/useMetaApi.ts` |
| **Phase 5: End-to-End Verification** | Unit & integration tests verifying `FULL_TP1` vs `SCALE_50_TP1_BE_TP2`, pending limit expiry, 1m tie-breaking, SQLite candle archiving, snapshot freezing, and frontend `npm run build`. | `test/paperBrokerAndReplay.test.ts` |
