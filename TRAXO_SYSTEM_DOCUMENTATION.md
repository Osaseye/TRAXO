# TRAXO — Complete System Documentation
### For Internal Review & Trader Partnership Discussion

---

> **How to read this document:**
> Every section explains WHAT it is, WHAT it does in plain English, HOW it is built technically,
> and WHAT the current pain points are. At the end there is guidance on exactly how a trader
> partner can contribute and an optional investment overview.

---

## TABLE OF CONTENTS

1. What is TRAXO? — The Big Picture
2. System Architecture — How Everything Connects
3. Layer 1 — Market Data Pipeline
4. Layer 2 — Signal Detection Algorithms (5 Strategies)
5. Layer 3 — Signal Scanner (The Brain)
6. Layer 4 — Strategy Optimizer (Self-Learning Engine)
7. Layer 5 — Auto-Trade Execution Engine (MetaApi + Exness MT5)
8. Layer 6 — Algorithmic Guardrails (Risk Management)
9. Layer 7 — The Backend Server (API + WebSockets)
10. Layer 8 — The Frontend Application (What You See)
11. Layer 9 — Database & Caching Infrastructure
12. The Trading Journal
13. Notifications & Real-Time Alerts
14. Current Pain Points & Honest Gaps
15. How Your Cousin Can Contribute — Strategy Integration Path
16. Investment Opportunity — Optional Partnership
17. Summary Diagram

---

## 1. WHAT IS TRAXO? — THE BIG PICTURE

**TRAXO** is a professional-grade algorithmic trading assistant platform.

In plain English, it does four things:

1. **WATCHES THE MARKETS 24 HOURS A DAY** across Forex, Gold, Indices, Crypto, and US Stocks.
2. **DETECTS HIGH-QUALITY TRADING SIGNALS** using multiple built-in strategies — the same concepts professional traders use.
3. **ALERTS YOU IN REAL TIME** via in-app toast notifications, sound alerts, and push notifications, so you never miss a setup.
4. **EXECUTES TRADES AUTOMATICALLY** on your connected Exness MT5 broker account through MetaApi when Auto-Trade mode is enabled, using your defined risk rules.

**TRAXO is NOT a black-box robot.** It is a transparent, analyst-grade system where:
- You can see every signal, its reasoning, its confidence level, and its entry/SL/TP.
- You choose which signals to take manually, or you let the auto-trader handle it.
- You control every guardrail, risk parameter, and strategy setting.

The platform is designed for **serious traders who want technology as a co-pilot**, not a replacement for human judgment.

---

## 2. SYSTEM ARCHITECTURE — HOW EVERYTHING CONNECTS

TRAXO is split into two completely separate applications that talk to each other:

```
+-----------------------------------------------------+
|                  FRONTEND (React App)               |
|  Dashboard, Charts, Settings, Journal, Signals      |
|  Port: 5173 (Vite Dev Server)                       |
+---------------------+-------------------------------+
                      |  HTTP API Requests + WebSocket
                      |  (Real-time signal push)
+---------------------v-------------------------------+
|                  BACKEND (Node.js Server)            |
|  Signal scanning, trade execution, news filter       |
|  Port: 8080                                         |
+------+--------------------+-----------+-------------+
       |                    |           |
  TwelveData           Firebase/    MetaApi
  (Market Data)        Firestore    (Broker Bridge)
                       + Upstash     to Exness MT5
                       Redis
                       (Database + Cache)
```

**Technology Stack:**

| Layer            | Technology                      | Purpose                  |
|------------------|---------------------------------|--------------------------|
| Frontend         | React 18, TypeScript, Vite      | UI Application           |
| Styling          | TailwindCSS, custom CSS         | Visual Design            |
| State Management | Zustand + localStorage persist  | UI State                 |
| Backend          | Node.js, Express                | API Server               |
| Real-Time        | Socket.io (WebSockets)          | Live Signal Push         |
| Market Data      | TwelveData API                  | Candle/OHLCV Data        |
| Database         | Firebase Firestore               | Persistent Storage       |
| Cache            | Upstash Redis                   | Speed Layer              |
| Broker Bridge    | MetaApi Cloud SDK               | MT5 Order Execution      |
| Scheduler        | node-cron                       | Automated Scanning       |

---

## 3. LAYER 1 — MARKET DATA PIPELINE

### What it does
The market data pipeline fetches **real-time price candle data** (OHLCV — Open, High, Low, Close, Volume)
from the TwelveData API for every instrument TRAXO monitors.

### Instruments Monitored

**Forex:** EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD, EUR/JPY, GBP/JPY

**Gold/Commodities:** XAUUSD (Gold), XAG (Silver), WTI Oil, Brent Oil, Natural Gas

**Indices:** US30 (Dow Jones), NAS100/USTEC (Nasdaq), SPX500/US500 (S&P 500), GER40 (DAX)

**Crypto:** BTCUSDT, ETHUSD, SOLUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, BNBUSDT

**US Stocks:** AAPL, MSFT, NVDA, TSLA, AMZN, META, GOOGL, NFLX, AMD, COIN, MSTR

### Timeframes Scanned (for every instrument simultaneously)
- `1m`  — 1 Minute
- `5m`  — 5 Minutes
- `15m` — 15 Minutes
- `1H`  — 1 Hour
- `4H`  — 4 Hours

### Key Files
- `server/services/marketDataService.js` — HTTP client that fetches candle data from TwelveData
- `server/services/candleCache.js` — Caches candles in Upstash Redis to avoid redundant API calls
- `server/services/keyRotator.js` — Manages 4 TwelveData API keys and rotates automatically on rate limits

### How it works (step by step)
1. The scanner requests candles for a symbol (e.g., EUR/USD on 5min)
2. The system first checks the Redis cache — if data is fresh, it uses that (free, instant)
3. If it is a cache miss, it fetches from TwelveData using one of the 4 rotating API keys
4. The candles are stored as objects: `{ open, high, low, close, volume, timestamp }`
5. These candles are then passed to the Strategy Algorithms for analysis

### Pain Points
- **[!] TwelveData Rate Limits:** With 30+ instruments x 5 timeframes = 150+ possible requests per scan cycle. The 4-key rotation helps but is not a permanent solution at scale.
- **[!] Crypto data unreliability:** Some altcoins (SOLUSDT, DOGEUSDT) are unreliable on TwelveData. A dedicated crypto data source (Binance WebSocket or CoinGecko) would be more reliable.
- **[!] No tick-by-tick data:** TRAXO uses candle-based polling every minute. No millisecond tick streaming, which matters for scalping strategies.

---

## 4. LAYER 2 — SIGNAL DETECTION ALGORITHMS (5 STRATEGIES)

This is the core intelligence of TRAXO. The algorithms analyze candle data and decide whether a valid trading signal exists.

---

### Strategy 1: Wick Rejection
**File:** `server/algorithms/wickRejection.ts`

**What it looks for:**
A candle where price aggressively pushed in one direction but was strongly rejected and closed in the opposite direction.
This is the most reliable price action signal — it shows that institutional buyers or sellers defended a level.

**Entry Conditions:**
- The candle's wick must be at least **2.0x longer** than its body (minWickRatio parameter)
- The candle must appear at a meaningful price level (Support, Resistance, or Moving Average proximity)
- ATR (Average True Range) is used to measure market volatility and size the Stop Loss dynamically
- Confidence is scored based on wick ratio strength, proximity to key levels, and volume confirmation

**Example Setup:**
Gold (XAUUSD) on the 15m chart. Price drops hard and wicks down below support at $2,300 but closes
back above $2,302. This is a Bullish Wick Rejection. TRAXO fires a BUY signal with SL below the wick low.

---

### Strategy 2: Supply & Demand Zones
**File:** `server/algorithms/supplyDemandStrategy.ts`

**What it looks for:**
Price areas where large institutional orders were previously placed that caused a strong directional move.
When price returns to these zones, it is likely to react strongly again.

**Entry Conditions:**
- Identifies **Demand Zones** (where price launched UP from) and **Supply Zones** (where price launched DOWN from)
- Checks that the zone has NOT been violated by subsequent price action (fresh zone = higher quality)
- Scores zone strength by the "displacement ratio" — how fast and far price moved when leaving the zone
- A trade is triggered when current price re-enters a valid zone with momentum confirmation

---

### Strategy 3: Order Block
**File:** `server/algorithms/orderBlockStrategy.ts`

**What it looks for:**
The last opposite-colour candle before a strong breakout move. This is where institutional traders placed
large orders. Smart Money Concepts (SMC) practitioners call these "Order Blocks."

**Entry Conditions:**
- Detects a strong impulsive move (measured by the displacement ratio parameter)
- Identifies the final candle before the impulse as the Order Block
- Fires a signal when price retraces back into the Order Block zone
- Validates with market structure (Higher Highs / Lower Lows confirmation)

---

### Strategy 4: Breakout
**File:** `server/algorithms/breakoutStrategy.ts`

**What it looks for:**
Price breaking above or below a consolidation range (tight sideways price action) with significant volume.
Real breakouts have volume confirmation; fake breakouts (fakeouts) typically do not.

**Entry Conditions:**
- Identifies a consolidation period (consolidationCount candles — default 3)
- Detects when price closes decisively above resistance or below support
- Requires a volume spike of at least **1.5x** the average volume (volumeSpikeMultiplier parameter)
- Confidence increases when multiple timeframes confirm the breakout simultaneously

---

### Strategy 5: Trend Following
**File:** `server/algorithms/trendFollowingStrategy.ts` + sub-engines

**What it looks for:**
Entering a trade in the direction of the established trend after a pullback.
"The trend is your friend" — this is the most statistically consistent strategy in financial markets.

**Sub-Engines:**
- `structureEngine.ts` — Determines overall trend direction by analyzing market structure
  (Higher Highs/Higher Lows for uptrend; Lower Highs/Lower Lows for downtrend)
- `pullbackEngine.ts` — Identifies Fibonacci retracement levels (0.382, 0.5, 0.618) where a pullback is likely to end
- `entryEngine.ts` — Finds the precise entry trigger on the lower timeframe after a pullback

**Example:**
EURUSD is in a clear uptrend on the 1H chart. Price pulls back to the 38.2% Fibonacci level. On the 5m chart,
a bullish engulfing candle forms. TRAXO fires a BUY signal to join the trend continuation.

---

### Common Signal Output Format (all 5 strategies produce this)

```json
{
  "symbol": "XAUUSD",
  "timeframe": "15m",
  "direction": "BUY",
  "strategyId": "wick_rejection",
  "strategyLabel": "Wick Rejection",
  "confidence": 74,
  "entry": 2308.50,
  "sl": 2304.20,
  "tp": 2318.90,
  "rr": 2.42,
  "reasoning": ["Long lower wick 3.2x body", "ATR SL 1.2x below rejection low", "Near key support"],
  "timestamp": "2026-08-26T17:14:56Z"
}
```

### Pain Points
- **[!] Only 5 strategies coded** — There is an entire universe of proven strategies (VWAP, Ichimoku, ICT concepts, RSI divergence, EMA systems) not yet implemented.
- **[!] No volume profile analysis** — Volume Profile (identifying where the most trading occurred at which price level) is a powerful tool not yet included.
- **[!] Single-timeframe signals only** — Each signal is detected on one timeframe independently. A "multi-timeframe confluence" filter would dramatically increase win rates.
- **[!] Confidence scoring is heuristic** — The confidence % is calculated mathematically but is not backtested against historical win rates. It needs calibration against real data.

---

## 5. LAYER 3 — SIGNAL SCANNER (THE BRAIN)

**File:** `server/services/signalScanner.js`

### What it does
The Signal Scanner is the master coordinator. It runs every 60 seconds on a cron schedule and orchestrates the entire scanning process:
1. Loops through every configured symbol (30+ instruments)
2. For each symbol, fetches candles across all 5 timeframes
3. Runs all 5 strategy algorithms on the candle data
4. Filters out duplicate or stale signals
5. Saves new signals to storage
6. Pushes new signals to all connected browser clients via WebSocket in real time
7. If Auto-Trade is enabled, triggers trade execution

### The Scanning Cycle (step by step)

```
Every 60 seconds:
  For each SYMBOL in watchlist:
    For each TIMEFRAME [1m, 5m, 15m, 1H, 4H]:
      1. Get candles (from cache or API)
      2. Run WickRejection strategy    -> collect any signals
      3. Run SupplyDemand strategy     -> collect any signals
      4. Run OrderBlock strategy       -> collect any signals
      5. Run Breakout strategy         -> collect any signals
      6. Run TrendFollowing strategy   -> collect any signals
      7. For each new signal found:
         a. Check it is not already active (de-duplicate)
         b. Save to Redis (live 4h) + Firestore (historical)
         c. Broadcast via WebSocket to all browser clients
         d. If AutoTrade ON -> run Guardrails -> execute trade
```

### Signal Storage
- **Live Signals:** Stored in Redis with a 4-hour expiry. These are the signals currently active.
- **Historical Signals:** Stored permanently in Firebase Firestore. Every signal ever generated is kept for journaling and performance analysis.

### Pain Points
- **[!] 60-second polling is slow for scalping:** The scanner takes 20-40 seconds to process 30+ symbols, so 1-minute signals can arrive late.
- **[!] Sequential scanning:** Currently scans symbols one by one. Parallel batch scanning (Promise.all) would cut time from 40s to ~5s.
- **[!] "Scan already in progress" collisions:** When the cron fires while the previous scan hasn't finished, it skips. Signals can be missed during heavy market hours.
- **[!] No adaptive scan rate:** During London/NY overlap (7:00-17:00 UTC), scanning should run every 15-30 seconds. During off-hours, every 5 minutes is sufficient.

---

## 6. LAYER 4 — STRATEGY OPTIMIZER (SELF-LEARNING ENGINE)

**File:** `server/services/strategyOptimizer.js`

### What it does
The Strategy Optimizer is TRAXO's self-improvement engine. When a trade signal is later resolved as a **LOSS**, the optimizer automatically analyses the loss and adjusts the algorithm parameters to reduce similar losses in the future.

### How the Learning Loop Works

```
Signal fires -> You trade it -> Signal resolves as LOSS
                                        |
                          processResolvedLoss() is called
                                        |
                    Algorithm-specific adjustments are made:

  Wick Rejection loss:
  -> minConfidence raised by +2% (up to max 75%)
  -> minWickRatio raised by +0.15 (up to max 3.5x)
  -> atrSlPadding raised by +0.10 (up to max 1.8x)

  Breakout loss:
  -> volumeSpikeMultiplier raised by +0.20 (up to max 2.5x)

  Supply & Demand / Order Block / Trend loss:
  -> minConfidence raised by +2%
                                        |
                    Parameters saved to Redis (persists across restarts)
                    Parameters applied to ALL future signals of that strategy
```

### Factory Defaults (Starting Parameters)

| Strategy        | Key Parameter            | Default Value   |
|-----------------|--------------------------|-----------------|
| Wick Rejection  | Min Wick Ratio           | 2.0x body       |
| Wick Rejection  | ATR SL Padding           | 1.0x ATR        |
| Wick Rejection  | Min Confidence           | 50%             |
| Breakout        | Volume Spike Multiplier  | 1.5x average    |
| Breakout        | Consolidation Candles    | 3 candles       |
| Order Block     | Displacement Ratio       | 1.5x            |
| Supply & Demand | Zone Flip Strength       | 1.2x            |
| Trend Following | Pullback Depth           | 0.382 Fibonacci |

### How to Enable It
Go to **Strategy Manager** in the TRAXO app -> Toggle "Feedback Engine" to ON.

**Important:** The engine only learns from signals that are properly resolved in the Journal (marked as WIN/LOSS).
This requires user discipline in journaling outcomes.

### Pain Points
- **[!] Only adjusts on losses, not wins:** A proper learning engine should also reinforce conditions that led to wins.
- **[!] Heuristic adjustments, not statistical:** The +2% confidence and +0.15 wick ratio adjustments are manually coded guesses. True ML would calculate optimal adjustments from historical data.
- **[!] No cross-strategy learning:** A loss on EUR/USD Wick Rejection should teach the optimizer about EUR/USD in general, not just wick rejection in isolation.
- **[!] No reset mechanism:** If parameters max out (e.g., minConfidence at 75%), the engine stops adapting. An annealing reset mechanism is needed.

---

## 7. LAYER 5 — AUTO-TRADE EXECUTION ENGINE (METAAPI + EXNESS MT5)

**File:** `server/services/metaApiService.js`

### What it does
The Auto-Trade Execution Engine is the bridge between TRAXO's signal detection and your actual broker (Exness MT5).
When the signal scanner detects a new high-quality signal and the Auto-Trade switch is ON, this engine:
1. Calculates the correct lot size based on your risk amount ($500 by default)
2. Normalizes the instrument symbol to Exness MT5's exact naming format
3. Submits a Market Order to your MT5 terminal via MetaApi's cloud bridge
4. Sets Stop Loss and Take Profit levels automatically

### Symbol Normalization (TRAXO -> Exness MT5)

| TRAXO / TwelveData Symbol | Exness MT5 Symbol |
|---------------------------|-------------------|
| XRPUSDT                   | XRPUSD            |
| BTCUSDT                   | BTCUSD            |
| SOLUSDT                   | SOLUSD            |
| WTI                       | USOIL             |
| BRENT                     | UKOIL             |
| NAS100                    | USTEC             |
| SPX500                    | US500             |
| DE40                      | GER40             |

### Lot Size Calculation

| Instrument Type | Formula                                               |
|-----------------|-------------------------------------------------------|
| Forex (non-JPY) | riskAmount / (pipDistance x 100,000)                  |
| JPY pairs       | riskAmount / (pipDistance x 650)                      |
| Gold (XAUUSD)   | riskAmount / (pipDistance x 100)                      |
| US Stocks       | riskAmount / (pipDistance x 100), capped at 2.0 lots  |
| Crypto          | riskAmount / (pipDistance x 1,000) for low-price coins|

### Symbol Fallback Retry System
If Exness MT5 rejects a symbol with "Unknown symbol" or "Trade disabled", TRAXO automatically retries:
1. First tries: `XRPUSD`
2. Then tries: `XRPUSDm` (broker mini-suffix for Standard accounts)
3. Then tries: `XRPUSDT` (original raw symbol as last resort)

### Stop Loss Validation
Before submitting the order, TRAXO:
1. Rounds SL/TP to the instrument's correct decimal precision
2. Checks that the SL is not "inside" the current spread (which would cause "Invalid Stops" error)
3. If "Invalid Stops" still occurs, submits the market order first, then modifies the SL/TP afterwards

### Pain Points
- **[!] MetaApi websocket instability:** MetaApi uses a cloud relay that occasionally drops and reconnects. This causes the "Failed to subscribe TimeoutError" messages in logs. Trade execution can be delayed by 10-30 seconds during reconnection.
- **[!] Demo account limitations:** On Exness Trial accounts, many instruments are disabled (XRP, SOL, SMCI). This is a broker restriction, not a TRAXO bug. A live account removes most of these restrictions.
- **[!] Single broker only:** TRAXO currently only supports Exness MT5. Supporting multiple brokers (IC Markets, Pepperstone, FxPro) via MetaApi would be straightforward to add.
- **[!] No partial position management:** TRAXO can open and close positions, but cannot do partial take-profits (e.g., "close 50% at 1:1 RR, let the rest run"). This is a major feature gap.

---

## 8. LAYER 6 — ALGORITHMIC GUARDRAILS (RISK MANAGEMENT)

**Files:** `server/services/signalScanner.js` + `server/routes/tradingContext.js`

### What it does
Before the Auto-Trader places any order, it must pass a series of risk management filters.
These guardrails are fully configurable from the Settings page and stored in Redis for real-time hot-updates (no server restart needed).

### The Guardrails

---

**Rule A.1 — Minimum Confidence Filter**
- What it does: Only executes signals above a minimum confidence percentage.
- Why it matters: Low confidence signals (50-55%) have a lower probability of success. A threshold of 65-75% filters out borderline setups.
- Your setting: Configurable via number input in Settings -> Auto-Trading Guardrails -> Rule A.1.
- Default: 60%

---

**Rule B.4 — Maximum Concurrent Positions**
- What it does: Prevents the auto-trader from opening a new trade if current open positions equal or exceed the maximum allowed.
- Why it matters: Without this, a strong signal run could open 10-15 positions simultaneously, over-leveraging the account.
- Your setting: Configurable number input (1 to 500).
- Default: 5 positions

---

**Rule B.7 — Correlation Shield**
- What it does: Prevents stacking too many trades that are correlated (all betting against the USD at the same time).
- How it works: Checks whether the new signal would create a 3rd+ position in the same "USD direction."
  Example: Buying EUR/USD, GBP/USD, and then AUD/USD are all essentially the same bet (USD bearish). The shield blocks the 3rd trade.
- Why it matters: If USD suddenly strengthens (surprise positive news), all correlated positions lose simultaneously.
- Your setting: ON/OFF toggle in Settings.
- Default: ON (enabled)

---

**Rule C.9 — Spread Cap Guard**
- What it does: Before executing a trade, checks the live bid/ask spread from the broker. If too wide, the trade is blocked.
- Why it matters: Wide spreads are an immediate cost against your trade. Entering when EURUSD has a 5-pip spread instead of 1.2 pips means you start the trade already significantly down.
- Your setting: Configurable maximum pips in Settings (e.g., 3.5 pips max).
- Default: 3.5 pips

---

**Rule C.10 — Session Window Filter**
- What it does: Restricts auto-trading to specific market sessions.
- Options:
  - `All sessions`     — Trade 24 hours
  - `London + NY Only` — 07:00-20:00 UTC (highest liquidity)
  - `New York Only`    — 12:00-21:00 UTC
  - `London Only`      — 07:00-16:00 UTC
- Why it matters: Asian session markets (00:00-07:00 UTC) are typically low-volume and choppy. Most institutional order flow happens during London and New York sessions.
- Default: All sessions

---

### Pain Points
- **[!] No Daily Loss Cap enforcement in auto-trade:** The daily maximum loss % setting exists in the UI and Firestore, but the auto-trader does not yet check it before placing trades.
- **[!] No consecutive loss circuit breaker:** If the account takes 3 losses in a row, auto-trading should pause and alert the user. Not yet implemented.
- **[!] No news event freeze in auto-trade:** The news filter reads from the news cache, but does not yet block auto-trade execution during a live 30-minute high-impact news window (NFP, CPI, FOMC).
- **[!] No drawdown-based position sizing:** When the account is in drawdown, position sizes should automatically scale down. TRAXO uses fixed dollar risk regardless of drawdown.

---

## 9. LAYER 7 — THE BACKEND SERVER (API + WEBSOCKETS)

**File:** `server/index.js` + `server/routes/`

### What it does
The backend server is the central hub that:
- Serves all API endpoints (HTTP REST APIs) for the frontend
- Manages the WebSocket connection for real-time signal broadcasting
- Hosts all background processes (scanning cron, news fetcher)

### API Routes (Endpoints)

| Route                           | File                     | Purpose                                             |
|---------------------------------|--------------------------|-----------------------------------------------------|
| GET /health                     | index.js                 | Server health check — shows API key status          |
| GET /api/candles                | candles.js               | Returns OHLCV candle data for a symbol              |
| GET /api/signals                | signals.js               | Returns active and historical signals               |
| POST /api/scanner               | scanner.js               | Manually triggers a scan cycle                     |
| GET /api/news                   | news.js                  | Returns latest high-impact financial news           |
| GET /api/global-signals         | globalSignals.js         | Aggregated signal view across all instruments       |
| GET/POST /api/trading-context   | tradingContext.js        | Read/update all risk settings and guardrails        |
| GET/POST /api/journal           | journal.js               | Read/write trading journal entries                  |
| GET /api/metaapi                | metaApi.js               | Connect/disconnect MT5, check account status        |
| POST /api/strategy-optimization | strategyOptimization.js  | Strategy optimizer controls and diagnostics         |

### WebSocket (Real-Time Push)
The server uses **Socket.io** for real-time communication. When a new signal is detected, it is immediately
broadcast to ALL connected browser tabs/clients. If you have TRAXO open on your laptop and your phone,
both receive the signal at the same time.

### Pain Points
- **[!] No authentication on the API:** All API endpoints are currently unprotected. This is a significant security issue for production deployment.
- **[!] No rate limiting:** No protection against API abuse or excessive requests from the frontend.
- **[!] Single-server architecture:** TRAXO runs as a single Node.js process. If it crashes, the entire system stops. Production needs process management (PM2) and possibly clustering.
- **[!] No deployment automation:** Deployment is manual (start npm run dev in two terminals). A proper CI/CD pipeline (GitHub Actions -> auto-deploy to cloud VM) is needed.

---

## 10. LAYER 8 — THE FRONTEND APPLICATION (WHAT YOU SEE)

**Directory:** `src/`

### Pages

| Page             | File                | Purpose                                                      |
|------------------|---------------------|--------------------------------------------------------------|
| Dashboard        | Dashboard.tsx       | Main trading workspace — charts, signals, active trades dock |
| Settings         | Settings.tsx        | All configuration: risk, guardrails, broker, notifications   |
| Strategy Manager | StrategyManager.tsx | Per-strategy on/off toggle, parameters view, feedback engine |
| Strategy Detail  | StrategyDetail.tsx  | Deep dive into a specific strategy's performance and signals |
| Trading Journal  | TradingJournal.tsx  | Log of all trades taken or skipped with outcome tracking     |
| Backtesting      | Backtesting.tsx     | Historical testing of strategies against past data           |
| Notifications    | Notifications.tsx   | Notification history and preference settings                 |
| Onboarding       | Onboarding.tsx      | First-time setup wizard for new users                        |
| Admin Panel      | AdminPanel.tsx      | Internal admin view — all signals, user data, system stats   |

### Key Components

**ChartPanel** (`src/components/dashboard/ChartPanel.tsx`)
- The main price chart in the dashboard
- Renders candlestick charts using TradingView's Lightweight Charts library
- Supports all timeframes (1m to 4H)
- Overlays signal markers (entry, SL, TP levels) directly on the chart

**SignalCard** (`src/components/dashboard/SignalCard.tsx`)
- Shows each detected signal with full details
- Displays: direction, symbol, confidence %, entry/SL/TP, R:R ratio, reasoning bullets
- Action buttons: Execute on MT5, Log as Taken/Skipped, Copy details

**Active Trades Dock** (Dashboard.tsx)
- Bottom dock showing all currently open Exness MT5 positions in real time
- Shows: direction, symbol, open price, current price, live P&L, unrealized profit/loss
- Click any trade to jump to that instrument's chart instantly
- Close button to close a trade directly from the dashboard

**AutoTrader Widget** (`src/components/shared/AutoTraderWidget.tsx`)
- The master on/off switch for the automated trading engine
- Shows current status, last trade executed, and guardrail health

### State Management (Zustand Stores)

| Store            | File                       | What it manages                                                  |
|------------------|----------------------------|------------------------------------------------------------------|
| Trading Context  | useTradingContextStore.ts  | Account balance, risk settings, guardrails, journal, notif prefs |
| Auth             | useAuthStore.ts            | User login state, Firebase user object                           |
| Signals          | useSignalStore.ts          | Live signals from WebSocket                                      |
| Analysis Signals | useAnalysisSignalStore.ts  | Chart-overlaid analysis signals                                  |
| Notifications    | useNotificationStore.ts    | In-app notification history                                      |
| Onboarding       | useOnboardingStore.ts      | Onboarding wizard progress                                       |
| Strategies       | useStrategyStore.ts        | Strategy selection state                                         |

**All critical settings persist to localStorage** via Zustand's persist middleware.
This means your risk settings, guardrail configuration, and journal survive page reloads.

---

## 11. LAYER 9 — DATABASE & CACHING INFRASTRUCTURE

### Firebase Firestore (Persistent Database)
**Purpose:** Long-term permanent storage of all data that must survive server restarts.

**Collections stored:**
- `users/{uid}/settings/tradingContext` — All risk and guardrail settings per user
- `signals/historical/` — Every signal ever detected (for journaling and backtesting)
- `users/{uid}/journal/` — All journal entries (trade logs, outcomes)
- `users/{uid}/profile/` — User profile information

### Upstash Redis (Speed Cache)
**Purpose:** Ultra-fast temporary storage for data that changes frequently and needs to be read many times per second.

| Redis Key                       | What it stores                           | TTL (Expiry)  |
|---------------------------------|------------------------------------------|---------------|
| candles:{symbol}:{timeframe}    | Cached OHLCV candle data                 | 60 seconds    |
| live_signal:{id}                | Currently active signals                 | 4 hours       |
| metaapi:auto_trade_enabled      | Auto-trade master switch                 | Never         |
| metaapi:auto_trade_min_conf     | Min confidence threshold                 | Never         |
| metaapi:auto_trade_max_pos      | Max open positions limit                 | Never         |
| metaapi:auto_trade_risk_amt     | Fixed dollar risk per trade              | Never         |
| metaapi:auto_trade_spread_cap   | Max spread in pips                       | Never         |
| metaapi:auto_trade_session      | Session filter setting                   | Never         |
| metaapi:auto_trade_correlation  | Correlation shield on/off                | Never         |
| optimizer:parameters            | Strategy optimizer learned parameters    | Never         |
| optimizer:enabled               | Feedback engine on/off                   | Never         |
| trading_context:{uid}           | Cached trading context per user          | 10 minutes    |
| news:cache                      | Cached financial news headlines          | 15 minutes    |

**Why Redis is critical:**
Without Redis, every scan cycle would require 150+ database reads from Firestore.
Redis keeps data in memory (nanosecond access) so the scanner can run in seconds instead of minutes.

---

## 12. THE TRADING JOURNAL

**File:** `src/pages/TradingJournal.tsx` + `server/routes/journal.js`

### What it does
The Trading Journal is a complete record of every trade decision made through TRAXO.

Every time you interact with a signal, TRAXO logs:
- The signal details (symbol, direction, entry, SL, TP, confidence)
- Your decision ("Took It" or "Skipped")
- Risk amount committed
- Outcome (WIN / LOSS / Breakeven — you update this later)
- Notes and screenshots (attachable)

### How the Journal Connects to the Optimizer
When you mark a trade as a LOSS in the Journal, the system automatically calls the Strategy Optimizer
to process that loss and refine the algorithm that generated it (if the Feedback Engine is ON).

### Balance Tracking
- Every WIN adjusts your tracked account balance upward by the profit amount
- Every LOSS reduces it by the risk amount
- This creates a running P&L curve visible in the Journal and Dashboard

---

## 13. NOTIFICATIONS & REAL-TIME ALERTS

**Files:** `src/stores/useNotificationStore.ts`, `src/hooks/useSignalNotification.ts`

### Notification Types
1. **In-App Toast Popups** — Small pop-up cards in the bottom-right corner showing new signals in real time.
2. **Sound Alerts** — An audio chime plays when a new signal arrives (can be turned off).
3. **Push Notifications** — Browser push notifications (requires permission grant) — partially implemented.

### Notification Filters
You can configure which signals trigger notifications:
- **Minimum Confidence %** — Only notify if signal confidence is above your threshold
- **Symbol Filter** — Only receive alerts for specific instruments (e.g., only XAUUSD and EURUSD)
- **Timeframe Filter** — Only receive alerts for specific timeframes (e.g., only 15m and 1H signals)
- **Strategy Filter** — Only receive alerts from specific strategies

---

## 14. CURRENT PAIN POINTS & HONEST GAPS

This is a complete and honest assessment of where TRAXO is strong and where it needs work.

### What is Working Well
- Real-time signal broadcasting via WebSocket — signals appear in the browser within 1-2 seconds of detection
- Multi-strategy, multi-timeframe, multi-asset scanning — the breadth is impressive
- Live MT5 trade execution with proper lot sizing — actual orders execute on Exness
- Guardrail system — actively protecting the account from over-trading
- Settings persistence — all configuration survives page reloads
- Self-learning optimizer — parameters improve automatically over time
- Active trades dock with live P&L — excellent visibility of open positions

### Critical Missing Features
1. **No win rate tracking per strategy** — TRAXO does not yet calculate and display "This strategy wins 63% of the time on EURUSD 15m." This is the most important data for a trader.
2. **No daily loss circuit breaker** — Auto-trader does not stop if daily loss limit is hit.
3. **No news event auto-pause** — Auto-trader does not pause 30 minutes before/after NFP, CPI, FOMC.
4. **No partial take-profit** — Cannot close 50% of position at 1:1 RR and trail the rest.
5. **No multi-timeframe confluence filter** — Signals are single-timeframe only.
6. **No API authentication** — The backend has no security layer.
7. **Strategy parameters are not backtested** — The default values are educated guesses, not historically validated.

### Quality of Life Improvements Needed
- Faster scanning (parallel processing instead of sequential)
- Better crypto data source (Binance WebSocket or CoinGecko)
- Position sizing that adapts to drawdown
- More instruments (more Forex pairs, more crypto, more stocks)
- Mobile-responsive layout (currently desktop-focused)

---

## 15. HOW YOUR COUSIN CAN CONTRIBUTE — STRATEGY INTEGRATION PATH

This section outlines exactly where a skilled trader's input would have the highest impact on TRAXO.

---

### Contribution Area 1: Strategy Validation & Calibration (Highest Impact)

**The Problem:**
TRAXO's 5 strategies are built from publicly documented concepts, but the parameter values
(e.g., "minimum wick ratio of 2.0x") are not calibrated against historical data.
We do not know their true win rates across different instruments and timeframes.

**How he can help:**
- Go through historical charts and identify which TRAXO signals would have been valid entries and which would have been losers
- Help calibrate the confidence scoring to match real-world probability
- Identify which pairs and timeframes each strategy performs best on
- Document "invalidation conditions" — what makes a setup void

**Output needed:**
A spreadsheet or document with: strategy name, pair, timeframe, conditions, historical win rate estimate, and what to adjust.

---

### Contribution Area 2: Adding His Custom Strategy

**The Problem:**
We only have 5 strategies. A consistently profitable 6th strategy would be enormously valuable.

**What we need from him:**
1. **Entry Rules** — Exact conditions that must all be true before entering.
   Example: "EMA 20 is above EMA 50, RSI is below 45, price has formed a bullish engulfing candle on the 5m chart within a support zone"
2. **Stop Loss Rule** — Where exactly the SL goes.
   Example: "3 pips below the swing low"
3. **Take Profit Rule** — Where TP goes or what R:R is used.
   Example: "2x the SL distance" or "next key resistance"
4. **Filter Conditions** — What disqualifies a setup.
   Example: "Don't trade within 30 minutes of news"
5. **Best Pairs/Timeframes** — Which instruments and timeframes the strategy works on

Once documented, we can build it into TRAXO as a new algorithm module (`server/algorithms/customStrategy.ts`)
that plugs into the same scanner framework automatically.

---

### Contribution Area 3: Trading Psychology & Risk Rules Review

**The Problem:**
TRAXO's guardrails are technically functional but were defined by a developer, not a risk manager or
experienced trader. The thresholds may not reflect real-world best practice.

**How he can help:**
- Review the guardrail settings and suggest better default values
- Suggest additional guardrails that haven't been thought of
- Help define the "daily loss cap" and "consecutive loss pause" rules from experience

---

### Contribution Area 4: Daily Signal Quality Review

**The Problem:**
We need a trader to regularly review the signals TRAXO generates and give feedback on their quality.

**How he can help:**
- Spend 30 minutes per day reviewing the Admin Panel -> Signals view
- Mark which signals were "A+ setups" vs "low quality" and why
- This feedback directly trains the self-learning optimizer

---

## 16. INVESTMENT OPPORTUNITY — OPTIONAL PARTNERSHIP

This section is for discussion purposes only. It outlines how a trader partner could participate
in TRAXO not just as a strategy contributor, but as a financial stakeholder.

---

### The Current Stage
TRAXO is a **working, functional prototype**. It can:
- Detect signals across 30+ instruments in real time (WORKING)
- Execute real trades on a live MT5 broker account (WORKING)
- Apply risk guardrails automatically (WORKING)
- Learn and self-improve from outcomes (WORKING)

**What it is not yet:** A polished, publicly distributed product.
It is a highly advanced personal trading tool currently used by one person.

---

### What Investment Would Fund

| Priority | Feature                                                | Impact                                                       |
|----------|--------------------------------------------------------|--------------------------------------------------------------|
| 1        | Better market data API (paid TwelveData or Polygon.io) | More instruments, faster data, no rate limits                |
| 2        | VPS / Cloud server hosting                             | TRAXO runs 24/7 — no need for a laptop to always be on       |
| 3        | Live MetaApi subscription upgrade                      | More robust broker connection, faster execution              |
| 4        | Strategy backtesting computation                       | Validate all 5 strategies against 2-5 years of historical data |
| 5        | Mobile app development                                 | TRAXO on iOS/Android with push notifications                 |

---

### Partnership Models (Discussion Points)

**Model A: Strategy Contributor (Non-Financial)**
- Contribute: Time, trading expertise, strategy documentation
- Receive: Revenue share on any future monetization of TRAXO

**Model B: Technical + Financial Partner**
- Contribute: Capital for infrastructure + ongoing trading expertise
- Receive: Equity stake in TRAXO platform + revenue share
- Use case: Fund server infrastructure ($50-$200/month) and premium API access

**Model C: Managed Account Testing**
- Contribute: A test trading account (can be small — $500-$2,000)
- TRAXO auto-trades the account using his validated strategy
- Both parties monitor, analyze, and improve performance together
- Ideal for proving the system's viability before any larger commitment

---

### What Returns Would Look Like (Realistic Expectations)

> **IMPORTANT DISCLAIMER:** No trading system guarantees profits.
> Past performance does not guarantee future results. These are illustrations, not promises.

If TRAXO's auto-trader achieves:
- **Win rate:** 60% (reasonable for a quality signal system)
- **Average R:R:** 1:2 (risk $500, target $1,000)
- **Trades per day:** 2-4 (with strict guardrails)
- **Account size:** $10,000

Mathematical expectation per 10 trades:
- 6 wins x $1,000 = $6,000
- 4 losses x $500 = -$2,000
- **Net expected profit: $4,000 per 10 trades** (before any fees or slippage)

**Reality check:** Achieving 60% win rate consistently requires a well-calibrated strategy.
Current TRAXO strategies are not yet validated to this standard.
This is exactly why trader input is critical.

---

## 17. SUMMARY DIAGRAM

How data flows from the outside world all the way to a live trade on your broker account:

```
    +---------------------------+
    |   EXTERNAL DATA SOURCES   |
    |  TwelveData API (OHLCV)   |
    |  News APIs                |
    +------------+--------------+
                 | Candle Data
    +------------v--------------+
    |   MARKET DATA SERVICE     |
    |   Key Rotation (4 keys)   |
    |   Candle Cache (Redis)    |
    +------------+--------------+
                 |
    +------------v--------------+
    |     SIGNAL SCANNER        |
    |   (Every 60 seconds)      |
    |   30+ instruments          |
    |   5 timeframes each        |
    +------+----------+---------+
           |          |
    +------v------+  +v------------------------+
    | STRATEGY    |  | SIGNAL STORAGE           |
    | ENGINES     |  | Redis (live 4h)          |
    | 1. Wick Rej |  | Firestore (forever)      |
    | 2. S&D      |  +---+---------------------+
    | 3. OrderBlk |      |
    | 4. Breakout |  +---v---------------------+
    | 5. Trend    |  | WEBSOCKET BROADCAST      |
    +------+------+  | Push to all browsers     |
           |         +-------------------------+
    +------v--------------------------------------+
    |            AUTO-TRADE ENGINE               |
    |                                            |
    |  Rule A.1:  Min Confidence >= 60%          |
    |  Rule B.4:  Max Positions < 5              |
    |  Rule B.7:  Correlation Shield ON          |
    |  Rule C.9:  Spread < 3.5 pips             |
    |  Rule C.10: Session Window filter          |
    |                                            |
    |  -> calculateLots(symbol, entry, sl, $500) |
    |  -> normalizeExnessSymbol(symbol)          |
    |  -> conn.createMarketBuyOrder(...)         |
    +------+--------------------------------------+
           |
    +------v--------------------------------------+
    |      EXNESS MT5 BROKER (via MetaApi)        |
    |      Live order execution                  |
    +--------------------------------------------+
```

---

*Document prepared: August 2026*
*TRAXO Version: 0.1.0 (Active Development)*
*Prepared by: TRAXO Development*
*For: Internal Review & Partnership Discussion*

---