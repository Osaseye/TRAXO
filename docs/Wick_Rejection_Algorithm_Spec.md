<div align="center">
  <!-- Note: Update the src path to your actual logo image path in the public folder -->
  <img src="../../public/logo.png" alt="TRAXO Logo" width="200" />
  <h1>TRAXO Algorithm Specification: Wick Rejection (V2)</h1>
  <p><b>Author:</b> Adebowale Segun</p>
  <p><b>Date:</b> May 26, 2026</p>
  <p><i>Trade Smart. Execute Precisely.</i></p>
</div>

---

## 1. Executive Summary & Algorithmic Philosophy

The Wick Rejection Algorithm is an institutional-grade, fully automated trading engine designed to read and execute upon "Liquidity Sweeps." In technical terms, it detects periods where algorithmic market makers push asset prices slightly beyond known support/resistance zones to sweep retail stop-loss orders, only to aggressively reverse the price back in the dominant direction.

The outcome of this battle leaves a structural fingerprint on an OHLCV (Open, High, Low, Close, Volume) chart known as a **Wick Rejection**.

This document outlines the deepest mathematical intricacies, data logic, middlewares, circuit breakers, and state mechanics required to build this as an automated trading entity inside Traxo.

---

## 2. Core Data Structures & Pre-Processing (The Indicators)

Before detecting anomaly candles, Traxo must constantly ingest and cache baseline volatility and volume data.

### 2.1. Normalization Metric: ATR (Average True Range)
Because Traxo trades across Stocks, Forex, and Crypto, static prices (e.g., "$0.50 offset") do not work. Volatility is measured dynamically using a 14-period Average True Range `ATR(14)`.
*   **Purpose:** Normalizes target distances and stop-loss buffers across all assets.
*   **Formula:** Standard 14-period True Range Smoothing.

### 2.2. Validation Metric: Volume Moving Average (VMA)
An explosive price wick without explosive volume is retail noise, not institutional footprint.
*   **Metric:** `Volume_MA(20)` (20-period simple moving average of volume).
*   **Purpose:** Ensures any valid signal represents a meaningful standard deviation in asset exchange throughput.

---

## 3. Phase 1: Context Engine (Strategic Battlefield Mapping)

A wick floating in the middle of nowhere is meaningless. The algorithm must first map "Magnetic Zones." Because mathematical FVG calculation is heavy, this is rolled out in three phases:

### V1 (Launch): Static Swing Analysis
*   **Logic:** The system scans the last $N$ candles (e.g., $N=50$) to identify Pivot Highs (a candle whose high is higher than the 2 candles before and after it) and Pivot Lows.
*   **Zoning:** Saves these distinct price clusters as support and resistance arrays.

### V2 (Refinement): Liquidity Pool Detection
*   **Equal Highs/Lows:** If Pivot High $A$ and Pivot High $B$ form within a tight variance threshold of each other (e.g., `abs(High_A - High_B) <= 0.05 * ATR`), they are grouped as an *Equal High Liquidity Pool*.
*   **PDH/PDL:** The engine stores the exact values of the Previous Daily High and Low, as institutional algorithms specifically target these values daily.

### V3 (Advanced): SMC Fair Value Gaps (FVG)
*   **Logic:** Tracks massive momentum spikes that leave mathematical "gaps" between candles.
*   **Detection:** Given three sequential candles (1, 2, 3), if Candle 1's High does not overlap with Candle 3's Low, the gap in Candle 2 is cached as a magnetic reversal zone (FVG).

---

## 4. Phase 2: Live Event Processing & Anatomy Verification

Every time a timeframe candle finishes rendering, the engine executes $O(1)$ runtime math to detect an anomaly.

### 4.1. Anatomic Mathematics
```python
# Raw Extraction
Body = abs(Open - Close)
Upper_Wick = High - max(Open, Close)
Lower_Wick = min(Open, Close) - Low

# Determine Dominant Wick
Wick_Max = max(Upper_Wick, Lower_Wick)
if Body == 0: return DISCARD  # Prevent division by zero errors

# Calculate Ratio Base
Ratio = Wick_Max / Body
if Ratio < 2.0: return DISCARD # Fails baseline anatomy test
```

### 4.2. Liquidity Sweep Validation
If the candle anatomy is valid, it is cross-referenced with Phase 1's Context Engine:
*   **The Check:** `abs(Wick_Tip - Nearest_Zone)` must be `<= 0.3 * ATR(14)`.
*   **The Sweep Condition:** The Wick must pierce the zone boundary, but the `Close` price must return inside or close completely away from the boundary. If the candle closes *through* the zone, it is a breakout, not a rejection. Discard.

---

## 5. Phase 3: The Validation Middlewares

Passing signals are routed through three interceptors to filter out mathematically correct but structurally dangerous environments.

### 5.1. Asset-Type Override Engine
Asset types behave wildly differently. Rigid rule overrides are applied:
*   **STOCKS (`symbol_type = 'STOCKS'`):** 
    *   *Hard Block:* Reject any signal between `09:30 AM – 10:00 AM EST`. Opening bell volatility fills retail gaps and acts as false institutional footprint.
    *   *Earnings Block:* Do not trade within 24 hours of earnings calls.
*   **CRYPTO (`symbol_type = 'CRYPTO'`):** 
    *   *Volume Strictness:* Standard signals require a 1.5x volume spike. Crypto requires `>= 2.0x Volume_MA(20)`. Extreme fake-outs are common and require deeper institutional proof.
*   **FOREX (`symbol_type = 'FOREX'`):**
    *   *Time-Zone Strictness:* Only proceed if GMT block is within London or NY overlap (08:00 – 16:00 UTC). Outside of this window, trigger a steep scoring penalty.

### 5.2. Dynamic HTF Anchoring (Top-Down Router)
Trading a 5m rejection against a 1-Hour downtrend is financial suicide. Traxo uses dynamic timeframe routing.
*   `Signal Timeframe` → `Reference HTF Anchor`
*   `1m / 3m / 5m` → `1-Hour Chart Check`
*   `15m / 30m` → `4-Hour Chart Check`
*   `1-Hour / 4-Hour` → `Daily (1D) Chart Check`
*   **Execution (Async Cache):** Traxo does not fetch HTF data on-demand during event loops. A background worker caches the moving average bias (`bullish | bearish | neutral`) of the anchor timeframe into Redis on a rolling schedule. The $O(1)$ live event requests this data immediately. 
*   **Fail-Safe Resolution:** If the HTF cache is `fresh` (<1 candle old), standard scoring applies. If the cache is `stale`, reduced bonus points apply. If the HTF fetch `fails`, a conservative `-2` counter-trend penalty is automatically applied to protect the user from blind entry.

### 5.3. Macro-Economic News Defense (The Decoupled Cache)
To avoid real-time API latency and catastrophic slippage:
1.  **Midnight Cron:** Fetches 48 hours of Medium/High impact news data.
2.  **Local Memory (Redis/DB):** Caches events (e.g., `Currency: USD | Time: 18:00 UTC | Impact: HIGH`).
3.  **Local Event Check:** The engine queries `NOW + 30m`. If a high-impact news drop is approaching, it penalizes the signal by `-3` (hard kill), avoiding institutional pre-news manipulation sweeps.

---

## 6. Phase 4: Confidence Scoring Matrix & Penalties

To transition signal strength into human UI and risk amounts, the algorithm processes a `[Base + Confluence - Penalties]` schema out of 14 points.

### 6.1. The Point Matrix
**Additive (Positive Factors):**
*   `+3`: Elite Wick Ratio (`>= 3:1`)
*   `+2`: Standard Wick Ratio (`>= 2:1`)
*   `+2`: Perfect Key Level / Zone touch
*   `+2`: HTF Trend Alignment perfectly matches
*   `+2`: Volume Expansion confirmed (`> 1.5x / > 2.0x crypto`)
*   `+2`: Confirmation Candle closed in reversal direction
*   `+1`: Explicit Liquidity Sweep tracked
*   `+1`: Optimal trading session

**Subtractive (The Guillotines):**
*   `-3`: High-impact news event <= 30 mins *(Deadly)*
*   `-3`: Dead liquidity session *(Noise)*
*   `-2`: Counter HTF trend with NO structure break *(Wall block)*
*   `-2`: Floating in space (No identifiable zone) *(Randomness)*
*   `-1`: Volume failed to validate.

### 6.2. Mapping Tier Output to UI
*   `PRIME` **(10-14 pts):** UI renders `85% - 99%` Confidence.
*   `STANDARD` **(8-9 pts):** UI renders `70% - 84%` Confidence.
*   `AGGRESSIVE` **(6-7 pts):** UI renders `50% - 69%` Confidence. (Red flag shown).
*   `DISCARD` **(<6 pts):** Terminated in background. Never reaches UI.

---

## 7. Phase 5: Dynamic Risk Sizing & The Circuit Breakers

### 7.1. Global User State (Circuit Breakers)
Before providing an Entry payload, Traxo queries the user's trading logs for the rolling 24 hours.
*   **Daily Kill Switch:** If `Rolling_Drawdown >= 4.0%` of margin, `Signal = NO_TRADE`. Locks user out until 00:00 UTC.
*   **Drawdown Streak Mitigation:** If `Consecutive_Losses >= 3`, exact risk is globally halved (`multiplier: 0.5x`) until PnL becomes positive again to protect capital from tilting users.

### 7.2. Calculating the Position Size (Risk Math)
Instead of arbitrary sizes (e.g., "$100 on Apple"), the quantity is mathematically extrapolated based on ATR failure distance.
1.  **Allowed Account Risk:** 
    *   PRIME Tier = 1.5% | STANDARD Tier = 1.0% | AGGRESSIVE = 0.5%.
    *   *(Apply Circuit Breaker 0.5x multiplier to the above if active).*
2.  **Dollar Risk Conversion:** `$10,000 account * 1.0% = $100 Risk_Amount`.
3.  **Risk Distance (Per Unit):** `abs(Entry_Price - Stop_Loss_Price)`
4.  **Buy Quantity:** `$100 / Risk Distance`. *(Ensures the trader only loses exactly $100 if the stop loss hits).*

---

## 8. Phase 6: Trade Lifecycle & State Management

Signals are not fire-and-forget. The output engine enforces structural lifecycles.

### 8.1. Stop Loss (SL) Buffering
To prevent Stop Hunts, stops are never exactly at the tip of the wick.
*   **FX & Equities:** `SL = Tip_of_Wick +/- (0.10 * ATR_14)`
*   **Crypto:** `SL = Tip_of_Wick +/- (0.25 * ATR_14)`

### 8.2. Take Profit (TP) Geometry
Instead of guessing resistance caps, structural Risk/Reward (RR) enforces mathematical long-term profitability. Let $R$ = `Risk_Distance (Entry - SL)`.
*   **TP1 (1.5 R):** `Entry +/- (1.5 * R)`. Scale out 50% of the trade. Autolock Stop Loss to entry price (Breakeven).
*   **TP2 (2.5 R):** `Entry +/- (2.5 * R)`. Scale out 30% of the trade.
*   **TP3 / Runner:** Trail remaining 20% to capture massive structural moves.

### 8.3. The Limit Order State Machine (ICT Mode)
For setups utilizing the 50% wick-retracement limit entry, the signal is managed using a strict four-stage transition architecture (`PENDING → FILLED → MANAGED → CLOSED`) to prevent abandoned hanging orders.
*   **PENDING → FILLED:** Price intersects the limit trigger before expiration.
*   **PENDING → CANCELLED:** Trade is voided if the price fails to fill within $N$ candles (`expiry_candles`), or if the price diverges > 1.0 ATR from the entry (breaking setup integrity).
*   **Fallback Re-Evaluation:** Upon cancellation, Traxo re-scores the setup. If the score remains >= 8, it downgrades to a standard Market Entry; otherwise, the trade is terminated entirely.

### 8.4. The Time-Decay Exit
Rejection setups represent volatile trapping. If the momentum fails rapidly, the premise was incorrect.
*   **Rule:** If a trade remains open for $N$ candles and has not breached TP1 or PnL is stalling near `$0`, the engine forces an exit at **Breakeven** (adjusted by the section 10.2 tolerance buffer).

---

## 9. Developer Output Schema Implementation

The culmination of Phase 1-6 exports a highly structured, machine-parsable object to the front-end or automated broker connector.

```typescript
export interface WickRejectionSignal {
  id:                 string;
  strategy_id:        "wick_rejection";
  signal:             "BUY" | "SELL" | "NO_TRADE";
  symbol:             string;          // e.g., "AAPL" or "EURUSD"
  asset_type:         "STOCKS" | "CRYPTO" | "FOREX";

  // Score Metrics & UI
  score:              number;          // Integer 0-14
  confidence_pct:     number;          // Human UI readable % (e.g., 85%)
  tier:               "prime" | "standard" | "aggressive" | "discard";
  
  // Execution Geography
  entry_type:         "market" | "limit"; // Limit outputs 50% deep wick re-entry 
  entry_price:        number;
  limit_entry_price:  number | null; 
  sl_price:           number;          // ATR Buffered kill-switch
  tp1_price:          number;          // Calculated at 1:1.5 RR
  tp2_price:          number;          // Calculated at 1:2.5 RR
  
  // Suggested Autopilot Params
  time_decay_limit:   number;          // E.g., Expiration threshold at 5 candles
  suggested_risk_pct: number;          // Evaluated against user drawdowns

  // Log Trace (Database / User debugging transparency)
  liquidity_sweep:    boolean;
  fvg_confluence:     boolean;
  htf_aligned:        boolean;
  session_override:   boolean;
  reason:             string[];        // Dev-trace array of modifications (e.g., ["-3 News Event: NFP in 15min", "Volume Expansion Noted 1.6x"])
  timestamp:          string;          // ISO 8601
}
```

---

## 10. Systems Architecture & Execution Edge Cases

To ensure the engine can scale without introducing latency or network bans in a live production environment, Traxo implements specific edge-case mitigations.

### 10.1. V3 Context Computation (Decoupled Architecture)
Calculating Fair Value Gaps (FVG) and Liquidity Pools historically across thousands of assets introduces massive computational overhead.
*   **The Microservice Model:** The Phase 1 "Context Engine" runs on a dedicated WebWorker (or separate microservice). It never blocks the $O(1)$ live event loop.
*   **Delta Updates:** It evaluates only the newest closed 3-candle triplets to detect FVGs. Old, mitigated FVGs are pruned.
*   **Redis Tracking:** Active Magnetic Zones are pushed to an ultra-fast in-memory store. Phase 2 simply executes a `GET` request (`active_zones:EURUSD:15m`) instantly upon receiving a signal.

### 10.2. Time-Decay Tolerance Buffer (Slippage & Commission Mitigation)
Phase 6.3 forces an exit at "Breakeven" if a trade stalls for $N$ candles. However, simple entry-price exits result in net losses due to exchange fees.
*   **The Commission Model:** The user's broker `Connection` record defines their cost structure (`percentage`, `flat`, or `spread_only`). 
*   **The Tolerance Target:** 
    ```typescript
    // Example Calculation for Tolerance Target
    let cost = 0;
    if (commission.type === "percentage") cost = entry * quantity * commission.value * 2;
    if (commission.type === "flat") cost = commission.value * 2;
    
    // Add minor spread buffer
    const slippage_buffer = 0.5 * ATR_14 * 0.1;
    const tolerance = (cost / quantity) + slippage_buffer;
    
    Exit_Price = Entry_Price +/- tolerance;
    ```
*   *Implementation:* The algorithm guarantees true capital preservation by pricing the exact exchange friction directly into the Time-Decay exit limit.

### 10.3. Trailing Stop Synthetic Orders (API Rate Limit Defense)
Autolocking stops and trailing the TP3 "Runner" (Phase 6.2) requires constant parameter updates as the live asset price fluctuates. Sending these as live `modify_order` requests to external brokers (e.g., Binance, OANDA) will trigger API rate bans.
*   **Local State Management:** The trailing logic is maintained synthetically in Traxo's local memory.
*   **Execution:** Traxo monitors websocket price feeds. When a mathematical trailing limit is breached, Traxo triggers a single `Market Close` API call. The exchange only ever handles the static predefined hard SL and the final exit command.

### 10.4. State Hydration & Disaster Recovery (Crash Mitigation)
Because Trailing Stops and synthetic TP brackets are managed locally (Section 10.3), a node crash or WebSocket disconnect introduces severe exposure risk. Traxo implements a High-Water Mark hydration protocol to ensure state is recovered instantly upon reboot:
*   **Write-Ahead Persistence (Redis AOF):** All synthetic trailing thresholds and "High-Water Marks" (the extreme price reached during a trade) are continuously synced to a Redis datastore. Redis must be configured with **AOF (Append-Only File) persistence** set to `appendfsync everysec` to ensure maximum 1-second data loss during full server hardware failures.
*   **Boot Sync & Partial Fill Handling:** Upon node reboot, Traxo suspends live processing and fetches all open positions directly from the broker API (the source of truth). If the catastrophic hard-stop was partially triggered during downtime (a Ghost Fill), Traxo dynamically updates the internal `buy_quantity` to reflect the actual remaining position size rather than assuming the full position remains open.
*   **Blind-Spot Recalculation (Staggered Batches):** Traxo fetches historical ticker data to check if a new High-Water Mark was achieved during the downtime. To avoid triggering API rate bans when syncing dozens of assets simultaneously, these requests are queued in **staggered batches**, strictly prioritizing assets closest to their `synthetic_sl` margin. If the current live price violates the recovered stop, a Market Close is executed immediately.

---
*Generated by Adebowale Segun | Internal Systems Reference V2.0*
