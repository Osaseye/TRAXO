<div align="center">
  <img src="../../public/logo.png" alt="TRAXO Logo" width="200" />
  <h1>TRAXO Algorithm Specification: Trend Following (V1)</h1>
  <p><b>Author:</b> Adebowale Segun</p>
  <p><b>Date:</b> June 1, 2026</p>
  <p><i>Trade Smart. Execute Precisely.</i></p>
</div>

---

## 1. Executive Summary & Algorithmic Philosophy

The Trend Following Algorithm is a macro-bias engine built on the oldest and most statistically robust principle in trading: **the trend is your friend until it ends**. It identifies the dominant directional flow of an asset, detects structured pullbacks within that flow, and enters continuation positions where institutional momentum is most likely to resume.

The algorithmic philosophy has four pillars:
1. **Trend is structure, not indicators.** A trend is defined as an ordered series of Higher Highs & Higher Lows (uptrend) or Lower Highs & Lower Lows (downtrend). Moving averages and ADX confirm, but structure is primary.
2. **Enter on pullbacks, not momentum.** Chasing momentum is the retail mistake. The engine waits for a structured retracement to a high-probability re-entry zone (OTE, EMA confluence, demand/supply zone) before signaling entry.
3. **Smart Money confirms the pullback depth.** The optimal pullback sweeps *internal liquidity* (equal lows in an uptrend, equal highs in a downtrend) before reversing. This is the institutional accumulation step, and it dramatically elevates signal confidence.
4. **Exit via trailing structure, not fixed levels.** Because trend moves can extend far beyond initial targets, the engine uses a structural trailing stop that moves with each new confirmed swing point — allowing runners to maximize the move.

---

## 2. Core Data Structures & Pre-Processing

### 2.1. Normalization Metrics
```typescript
const ATR_14  = computeATR(candles, 14)       // All distance checks
const VMA_20  = computeSMA(volumes, 20)        // Volume moving average
const EMA_20  = computeEMA(closes, 20)         // Fast trend bias (pullback reference)
const EMA_50  = computeEMA(closes, 50)         // Medium trend confirmation
const EMA_200 = computeEMA(closes, 200)        // Macro trend filter (institutional macro)
const ADX_14  = computeADX(candles, 14)        // Trend strength filter
```

### 2.2. Trend State Machine

```typescript
interface TrendState {
  direction:      'BULLISH' | 'BEARISH' | 'RANGING'
  strength:       'STRONG' | 'MODERATE' | 'WEAK'  // ADX-based
  ema_stack:      'ALIGNED' | 'PARTIAL' | 'MESSY'
  swing_highs:    SwingPoint[]     // Rolling last 10 confirmed swing highs
  swing_lows:     SwingPoint[]     // Rolling last 10 confirmed swing lows
  last_hh:        SwingPoint | null  // Last Higher High (uptrend)
  last_hl:        SwingPoint | null  // Last Higher Low (uptrend)
  last_lh:        SwingPoint | null  // Last Lower High (downtrend)
  last_ll:        SwingPoint | null  // Last Lower Low (downtrend)
  bos_confirmed:  boolean          // Most recent BOS
  choch_active:   boolean          // Potential trend reversal in progress
  phase:          'TRENDING' | 'PULLBACK' | 'REVERSAL_RISK'
}
```

### 2.3. Pullback Object

```typescript
interface PullbackContext {
  direction:           'BULLISH_PULLBACK' | 'BEARISH_PULLBACK'
  pullback_start_price: number
  pullback_low_price:   number    // Current lowest wick in pullback (for bull)
  fib_retracements: {
    r382: number    // 38.2% of prior swing
    r500: number    // 50.0% — equilibrium / OTE anchor
    r618: number    // 61.8% — Golden ratio
    r786: number    // 78.6% — Deep OTE
  }
  ema20_level:         number
  ema50_level:         number
  fvg_in_pullback:     FVGZone | null     // FVG formed during pullback
  ob_in_pullback:      OBZone | null      // Order Block sitting in pullback zone
  demand_zone:         SDZone | null      // Supply/Demand zone in pullback
  internal_liq_swept:  boolean            // Equal lows swept before reversal (bull)
  pullback_candles:    number
  valid:               boolean
}
```

### 2.4. Equilibrium & Fibonacci OTE Zone
The Optimal Trade Entry zone for trend continuation sits in the `61.8%–78.6%` Fibonacci retracement of the prior impulse swing:

```python
# Bullish trend — measuring the prior impulse swing
prior_swing_low  = last_hl.price   # Prior higher low
prior_swing_high = last_hh.price   # Prior higher high
swing_range      = prior_swing_high - prior_swing_low

ote_zone = {
  upper: prior_swing_high - (0.618 * swing_range),  # 61.8% retrace
  lower: prior_swing_high - (0.786 * swing_range),  # 78.6% retrace
  midpoint: prior_swing_high - (0.500 * swing_range) # 50% equilibrium
}
# Note: if price pulls deeper than 78.6%, the prior swing structure is weakening
# — downgrade confidence or await CHoCH signal
```

### 2.5. Liquidity Pool Mapping
*   **Internal Liquidity** (within the trend pullback): equal lows in an uptrend (stop-loss clusters for retail longs entered early), equal highs in a downtrend. The engine expects the pullback to sweep these before the trend resumes.
*   **External Liquidity** (trend delivery targets): the next BSL pool above recent swing highs (bull) or SSL pool below recent swing lows (bear). These are the TP targets for the continuation trade.

---

## 3. Phase 1: Context Engine — Trend Identification

### 3.1. Structural Trend Definition

```python
FUNCTION determine_trend(candles[], min_swing_count=3):
  swing_highs = detect_swing_highs(candles)   # ordered oldest [0] → newest [-1]
  swing_lows  = detect_swing_lows(candles)

  IF len(swing_highs) < 3 OR len(swing_lows) < 3: return 'RANGING'

  last_3_highs = swing_highs[-3:]  # [oldest, middle, newest]
  last_3_lows  = swing_lows[-3:]

  # ─── MACRO STRUCTURAL CHECK ───────────────────────────────────────────────
  # Compare the OLDEST anchor point to the NEWEST confirmed point.
  # This tolerates complex pullbacks (where an intermediate swing may temporarily
  # dip below the middle point) as long as the macro sequence is intact.
  #
  # STRICT consecutive check would misclassify a valid uptrend during a deep
  # internal correction that creates a lower intermediate high before breaking out.
  # Using macro anchoring avoids flagging live trends as RANGING mid-pullback.

  macro_hh = last_3_highs[-1].price > last_3_highs[0].price  # newest HH > oldest HH
  macro_hl = last_3_lows[-1].price  > last_3_lows[0].price   # newest HL > oldest HL

  # Secondary check: the most recent confirmed high must exceed the middle high.
  # This prevents a single outsized old swing from hiding an emerging downtrend.
  confirm_hh = last_3_highs[-1].price > last_3_highs[-2].price
  confirm_hl = last_3_lows[-1].price  > last_3_lows[-2].price

  IF macro_hh AND macro_hl AND (confirm_hh OR confirm_hl): return 'BULLISH'

  macro_lh = last_3_highs[-1].price < last_3_highs[0].price
  macro_ll = last_3_lows[-1].price  < last_3_lows[0].price
  confirm_lh = last_3_highs[-1].price < last_3_highs[-2].price
  confirm_ll = last_3_lows[-1].price  < last_3_lows[-2].price

  IF macro_lh AND macro_ll AND (confirm_lh OR confirm_ll): return 'BEARISH'

  return 'RANGING'
```

> **Indexing contract:** `detect_swing_highs` always returns points ordered chronologically — index `[0]` is the oldest confirmed swing, index `[-1]` is the most recent. This must be enforced by the swing detection function.

### 3.2. EMA Stack Alignment
```python
FUNCTION assess_ema_stack(ema20, ema50, ema200, current_price):
  IF current_price > ema20 > ema50 > ema200: return ('ALIGNED', 'BULLISH')
  IF current_price < ema20 < ema50 < ema200: return ('ALIGNED', 'BEARISH')
  IF ema20 > ema50 OR ema20 < ema50:         return ('PARTIAL', 'AMBIGUOUS')
  return ('MESSY', 'RANGING')
```

The engine only enters trend continuation signals when EMA stack is `ALIGNED`. A `PARTIAL` stack reduces tier to `AGGRESSIVE` maximum.

### 3.3. ADX Trend Strength Filter
```python
# ADX interpretation:
# < 20: No trend (RANGING) — do NOT enter trend following signals
# 20–25: Weak trend forming — AGGRESSIVE tier only
# 25–40: Moderate to strong trend — STANDARD tier allowed
# > 40: Strong trend — PRIME tier, highest conviction
IF ADX_14 < 20: return NO_TRADE  # Hard block on ranging markets
```

### 3.4. CHoCH Detection (Trend Reversal Warning)
```python
# In an uptrend, a CHoCH is the FIRST close below the most recent Higher Low
IF trend_direction == 'BULLISH':
  IF current_candle.close < last_hl.price:
    trend_state.choch_active = True
    # Do NOT enter any new long positions until trend re-confirms with new HH
    # Consider if a bearish OB has formed — reversal trade may be active
```

### 3.5. AMD Pullback Phase Classification

In a trending market, the AMD cycle repeats at smaller scale within each swing:
```python
# UPTREND internal AMD:
# Accumulation: price consolidates after last HH (future HL forming)
# Manipulation: price dips below recent equal lows (sweeps internal liquidity, false breakdown)
# Distribution: price reverses up with BOS above last consolidation high

IF trend_state.direction == 'BULLISH':
  IF abs(pullback.pullback_low - nearest_eql.price) <= 0.20 * ATR_14 AND \
     current_candle.close > nearest_eql.price:
    pullback.internal_liq_swept = True
    # This is the manipulation-to-distribution transition
    # Highest quality trend continuation entry point
```

---

## 4. Phase 2: Live Event Processing — Entry Detection

### 4.1. Pullback Detection
```python
FUNCTION detect_pullback(trend_state, candles[]):
  IF trend_state.direction == 'BULLISH':
    last_hh_price = trend_state.last_hh.price
    last_hl_price = trend_state.last_hl.price
    
    # Calculate current retracement depth from last HH
    current_low = min(c.low for c in candles_since_hh)
    retrace_pct = (last_hh_price - current_low) / (last_hh_price - last_hl_price) * 100
    
    IF 20 <= retrace_pct <= 85:   # 20–85% retracement = valid pullback window
      pullback.valid = True
      pullback.depth = retrace_pct
      
      # Calculate Fibonacci OTE zone
      swing_range       = last_hh_price - last_hl_price
      pullback.fib_r382 = last_hh_price - (0.382 * swing_range)
      pullback.fib_r500 = last_hh_price - (0.500 * swing_range)
      pullback.fib_r618 = last_hh_price - (0.618 * swing_range)
      pullback.fib_r786 = last_hh_price - (0.786 * swing_range)
    
    ELIF retrace_pct > 85:
      # Too deep — prior HH is at risk. Downgrade or consider CHoCH
      pullback.valid = False
      trend_state.choch_active = True
    
    return pullback
```

### 4.2. Entry Trigger Hierarchy
Once a valid pullback is detected, the engine scans for three entry trigger types (in priority order):

**Trigger T1 — FVG Fill (Highest Priority)**
```python
# DEPTH GATE: Only accept FVGs that sit at or below the 50% equilibrium level.
# An FVG near the top of the prior impulse (e.g., 23.6%–38.2% retrace) produces
# a shallow entry with a SL still anchored at the pullback low — creating a massive
# Risk_Distance that either triggers the 2.5× ATR SL gate or forces position size
# to near zero. Shallow FVGs are not trend-following confluences; they are momentum
# breakout plays. This engine only uses FVGs that are deep enough to be genuine
# institutional rebalancing during a healthy pullback.

FVG_MIN_DEPTH_FIB = 0.50  # FVG top must be AT or BELOW the 50% equilibrium

IF fvg_in_pullback AND fvg.top <= pullback.fib_r500:
  IF current_price <= fvg.top AND current_price >= fvg.bottom:
    entry_trigger = 'FVG_FILL'
    entry_quality = 'PRIME'
    score += 3
ELSE:
  # FVG exists but is too shallow — skip T1, fall through to T2/T3 evaluation
  # Do not discard the signal; a valid T2 or T3 entry may still be in range
  pass
```

**Trigger T2 — Order Block at Pullback (High Priority)**
```python
IF ob_in_pullback AND current_price INSIDE ob_zone:
  entry_trigger = 'OB_AT_PULLBACK'
  entry_quality = 'HIGH'
  score += 2
```

**Trigger T3 — EMA + Fibonacci OTE Zone (Standard)**
```python
IF current_price INSIDE ote_zone AND (ema20_level or ema50_level INSIDE ote_zone):
  entry_trigger = 'EMA_OTE_CONFLUENCE'
  entry_quality = 'STANDARD'
  score += 1
```

### 4.3. Lower-Timeframe Confirmation
Regardless of trigger type, an LTF confirmation is required before entry:
```python
FUNCTION ltf_confirm(pullback_zone, ltf_candles[]):
  FOR candle in ltf_candles:
    IF candle closes ABOVE pullback zone top (bull) WITH:
      body > 0.6 * candle_range AND       # Strong body
      volume > 1.2 * VMA_20:              # Volume returning
      return 'MSS_CONFIRMED'
    IF is_bullish_pin_bar(candle) AT zone:
      return 'PIN_BAR_CONFIRMED'
  return 'NO_CONFIRMATION'
```

### 4.4. Volume Behavior During Pullback
A healthy trend pullback has a characteristic volume signature:
*   **Contraction:** Volume decreases during the pullback phase (sellers not aggressive — trend is healthy).
*   **Expansion:** Volume *increases* on the entry trigger candle (buyers returning with conviction).

```python
avg_pullback_volume = mean(c.volume for c in pullback_candles)
entry_volume        = trigger_candle.volume

IF avg_pullback_volume > VMA_20 * 0.8:  # Pullback has elevated volume
  score -= 1  # Sellers are aggressive — weaker continuation signal

IF entry_volume > VMA_20 * 1.5:  # Entry candle has strong volume
  score += 1  # Buyers confirmed returning
```

---

## 5. Phase 3: The Validation Middlewares

### 5.1. Asset-Type Override Engine
*   **STOCKS:** Trend following is strongest on Weekly/Daily charts. Intraday TF signals on stocks require `ADX > 30` minimum.
*   **CRYPTO:** EMAs must be `ALIGNED` (no partial alignment allowed — crypto trends violently but reverses equally violently). Minimum 24h trend confirmation.
*   **FOREX:** Dual-session trend continuation preferred: trend established in London, continuation in NY overlap.
*   **FUTURES:** Trend must be confirmed on the primary contract (not continuous — check rollover dates). ORB continuation gets `+1` bonus.

### 5.2. Dynamic HTF Anchoring (Trend-on-Trend)

| Signal Timeframe | HTF Reference |
|-----------------|---------------|
| `5m / 15m`      | 1H trend |
| `30m / 1H`      | 4H trend |
| `4H / Daily`    | Weekly trend |

The entry timeframe trend must be in the **same direction** as the HTF trend. Counter-trend continuation signals are permanently blocked unless a CHoCH at the HTF has been confirmed.

### 5.3. Trend Exhaustion Guard
```python
# Count consecutive trend candles without a pullback
trend_candles_since_last_hl = len(candles_from_last_hl_to_now)
ATR_expansion_ratio = current_atr / atr_avg_last_20_swings

IF trend_candles_since_last_hl > 30 OR ATR_expansion_ratio > 2.5:
  # Trend may be overextended — late-cycle entry risk
  score -= 2
  reason.append("-2 Trend exhaustion: extended run without pullback")
```

### 5.4. Macro-Economic News Defense
*   High-impact event within 30 minutes: `-3` penalty. Signal hard-killed if post-penalty score `< 6`.

---

## 6. Phase 4: Confidence Scoring Matrix (14 Points)

### 6.1. The Point Matrix

**Additive:**
*   `+3`: Internal liquidity swept before entry trigger (equal lows swept in uptrend — manipulation confirmed)
*   `+2`: FVG fill as entry trigger (imbalance fill — institutional rebalancing)
*   `+2`: Full EMA stack alignment (`EMA20 > EMA50 > EMA200` for bull, price above all three)
*   `+2`: HTF trend fully aligned and strong (`ADX > 30` on HTF)
*   `+2`: Order Block at pullback zone (institutional demand/supply embedded in pullback)
*   `+1`: ADX `> 40` on signal timeframe (very strong trend)
*   `+1`: Volume contraction during pullback + expansion on entry candle
*   `+1`: Session optimal (London open or NY open continuation)

**Subtractive:**
*   `-3`: News event `<= 30 min` *(Hard kill)*
*   `-2`: CHoCH active on signal timeframe (trend integrity compromised)
*   `-2`: Counter-HTF entry direction
*   `-2`: Trend exhaustion flagged (extended without pullback OR overexpanded ATR)
*   `-1`: EMA stack only partially aligned
*   `-1`: ADX `< 25` on signal TF (weak trend — continuation probability lower)
*   `-1`: Pullback retraced `>= 78.6%` (too deep — trend structure weakening)

### 6.2. Tier Output Mapping
*   `PRIME` **(10–14 pts):** Confidence `85%–99%`. Risk `1.5%`.
*   `STANDARD` **(8–9 pts):** Confidence `70%–84%`. Risk `1.0%`.
*   `AGGRESSIVE` **(6–7 pts):** Confidence `50%–69%`. Risk `0.5%`. Red flag shown.
*   `DISCARD` **(`< 6 pts`):** Terminated.

---

## 7. Phase 5: Dynamic Risk Sizing & Circuit Breakers

### 7.1. Global Circuit Breakers
*   **Daily Kill Switch:** `Rolling_Drawdown >= 4.0%` → `NO_TRADE`. Resets 00:00 UTC.
*   **Streak Mitigation:** `Consecutive_Losses >= 3` → `0.5× risk` multiplier until next win.
*   **Trend-Reversal Lock:** If CHoCH confirmed on HTF: no new trend entries until trend re-establishes (`>= 2 new HH/HLs`).

### 7.2. Position Sizing
```python
# SL placed below the pullback low (uptrend) / above pullback high (downtrend)
# with ATR buffer
sl_price    = pullback_low - (0.15 * ATR_14)   # Bullish
Risk_Distance = abs(entry_price - sl_price)

# Maximum SL gate
IF Risk_Distance > 2.5 * ATR_14:
  return NO_TRADE  # Pullback too deep — risk unacceptable

Dollar_Risk = Account_Balance * Risk_Pct
Quantity    = Dollar_Risk / Risk_Distance
```

---

## 8. Phase 6: Trade Lifecycle & State Management

### 8.1. Stop Loss Placement
```python
# Bullish trend continuation:
sl_price = pullback_low - (0.15 * ATR_14)
# Places SL just below the pullback's structural low — the point where the
# trend is definitively broken if reached. ATR buffer prevents spread-induced stops.

# The pullback low is also the key invalidation level:
# If price closes below it on the signal timeframe, the HL sequence is broken → exit.
```

### 8.2. Take Profit Geometry (Liquidity-Targeted Extension)
Trend following TPs target the next institutional liquidity pool ahead:

```python
# Bullish continuation:
tp1 = last_hh_price                    # Prior swing high (first resistance reference)
tp2 = next_bsl_pool.price              # Buy-Side Liquidity pool (external)
tp3 = fib_extension_161_8              # 1.618× extension of prior impulse swing (runner)

R = abs(entry_price - sl_price)

# Fallback RR targets:
tp1_fallback = entry_price + (1.5 * R)  # 1.5:1 minimum
tp2_fallback = entry_price + (3.0 * R)  # 3:1 extended target
tp3_fallback = entry_price + (5.0 * R)  # 5:1 runner (only for strong PRIME tier)
```

### 8.3. Break-Even Logic
```typescript
const commission_cost = calculateCommission(entry_price, quantity, broker_settings)
const slippage_buffer = 0.10 * ATR_14
const tolerance       = (commission_cost / quantity) + slippage_buffer

// Trigger: price reaches TP1 (prior swing high / 1.5R)
breakeven_price = entry_price + tolerance  // for longs
```

> **⚠️ Break-Even Execution Constraint — Do NOT move SL to break-even blindly at TP1.**
>
> When price breaks through the prior swing high (TP1), breakout buyers flood in and the
> broken level frequently gets immediately retested (breaker block mechanics). Moving the
> stop to exact break-even at the moment TP1 is hit will reliably get the runner stopped
> out on this macro retest before a new Higher Low has time to form.
>
> **Rule:** After TP1 is hit, the SL does **not** move until ONE of the following conditions
> is true:
> 1. A new confirmed lower-timeframe structural swing low forms **above** the original SL
>    (i.e., the pullback/retest printed a new HL on the LTF — trend continuation confirmed).
> 2. The entry OB / FVG that launched the breakout has been identified — trail the SL to
>    the **bottom of that zone** (`ob_zone.low - 0.15 × ATR_14`) instead of to entry price.
>
> Only after condition 1 or 2 is met should the SL be promoted. This gives the runner
> room to survive the post-TP1 structural retest without sacrificing the remaining 60%.

### 8.4. Structural Trailing Stop (The Core of Trend Following Risk)
```python
# After TP1 hit and SL promoted per Section 8.3 rule:
# The trailing stop then follows each new confirmed structural swing low (bull)

FUNCTION trail_stop(trade, new_swing_lows[], atr14):
  IF trade.direction == 'BUY':
    newest_hl = get_latest_confirmed_swing_low(new_swing_lows)
    IF newest_hl IS None: return  # No confirmed swing yet — hold original SL

    new_trailing_sl = newest_hl.price - (0.15 * atr14)

    IF new_trailing_sl > trade.current_sl:  # Only trail UP — never trail DOWN
      trade.current_sl = new_trailing_sl
      trade.trailing_active = True
      log_trail("Trail SL → " + new_trailing_sl + " at new HL: " + newest_hl.price)
    # else: new swing low is BELOW current SL (unusual) — do not degrade protection
```

### 8.5. Partial Scale-Out Protocol
*   **At TP1 (prior swing high / 1.5R):** Close `40%` of position. SL held at original level — **not** moved to break-even yet (see Section 8.3 constraint above).
*   **At TP2 (BSL pool / 3R):** Close `40%` of position. SL is now promoted to break-even (or OB bottom per 8.3 rule). Structural trailing stop becomes active.
*   **Remaining 20%:** Full runner — trail structurally on each new confirmed HL until trend definitively reverses (CHoCH on signal TF or price closes below trailing SL).

### 8.6. Trend Reversal Exit (CHoCH-Based Full Exit)
```python
# In a running trade, if a CHoCH triggers on the signal timeframe:
IF trend_direction == 'BULLISH' AND current_candle.close < last_hl.price:
  IF trade.choch_exit_triggered: return  # Already exiting — guard against re-entry

  trade.choch_exit_triggered = True

  # ── CRITICAL: Cancel synthetic trailing stop BEFORE sending market close ──
  # The trailing stop engine evaluates on every tick (Section 10.5).
  # If both the CHoCH and the trailing-stop breach fire simultaneously during a
  # rapid distribution, two concurrent execute_market_close() calls would be sent,
  # resulting in a double-clear or redundant broker API orders.
  #
  # The flag must be set and the local synthetic order cancelled ATOMICALLY
  # before the market close request is dispatched.
  cancel_synthetic_trailing_stop(trade.id)  # Removes local trailing order from tick loop

  execute_market_close(trade)  # Single market close — broker receives exactly one order
  log("CHoCH detected — synthetic trail cancelled, runner exited to protect capital")
```

### 8.7. Time-Decay Exit
If trade has been open `>= N candles` with PnL near `$0`:
*   Exit at best available price. Flag the entry point as a weak trend context.

---

## 9. Developer Output Schema

```typescript
export interface TrendFollowingSignal {
  id:                   string
  strategy_id:          'trend_following'
  signal:               'BUY' | 'SELL' | 'NO_TRADE'
  symbol:               string
  asset_type:           'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'

  // Trend Context
  trend_direction:      'BULLISH' | 'BEARISH' | 'RANGING'
  trend_strength:       'STRONG' | 'MODERATE' | 'WEAK'
  adx_value:            number
  ema_stack:            'ALIGNED' | 'PARTIAL' | 'MESSY'
  ema20:                number
  ema50:                number
  ema200:               number
  last_hh_price:        number | null
  last_hl_price:        number | null
  choch_active:         boolean

  // Pullback
  pullback_depth_pct:   number           // Retracement % of prior swing
  fib_r382:             number
  fib_r500:             number           // Equilibrium
  fib_r618:             number
  fib_r786:             number
  ote_zone_low:         number           // 61.8% retracement
  ote_zone_high:        number           // 78.6% retracement
  internal_liq_swept:   boolean          // Equal lows swept in uptrend before reversal

  // Entry Trigger
  entry_trigger:        'FVG_FILL' | 'OB_AT_PULLBACK' | 'EMA_OTE_CONFLUENCE'
  ltf_confirmation:     'MSS_CONFIRMED' | 'PIN_BAR_CONFIRMED' | 'NO_CONFIRMATION'
  volume_during_pullback: number         // Avg pullback candle volume / VMA_20
  volume_at_trigger:    number           // Entry candle volume / VMA_20

  // Score & UI
  score:                number           // 0–14
  confidence_pct:       number
  tier:                 'prime' | 'standard' | 'aggressive' | 'discard'

  // Execution Levels
  entry_type:           'limit' | 'market'
  entry_price:          number
  sl_price:             number           // Below pullback low ± ATR buffer
  tp1_price:            number           // Prior swing high / 1.5R
  tp2_price:            number           // BSL/SSL pool / 3R
  tp3_trailing:         boolean          // Structural trail runner active
  fib_161_8_extension:  number           // 1.618× extension (runner target)
  suggested_risk_pct:   number

  // Breakeven & Trail
  breakeven_price:      number
  breakeven_triggered:  boolean
  trailing_sl_price:    number | null    // Current trailing SL level (runner)

  // Lifecycle
  expiry_candles:       number
  time_decay_limit:     number
  choch_exit_triggered: boolean
  trend_exhaustion_flag: boolean

  // Confluence Trace
  htf_aligned:          boolean
  htf_trend_direction:  'BULLISH' | 'BEARISH' | 'RANGING'
  fvg_confluence:       boolean
  ob_confluence:        boolean
  session_active:       boolean
  bsl_pool_target:      number | null   // External BSL/SSL delivery target
  reason:               string[]
  timestamp:            string           // ISO 8601
}
```

---

## 10. Systems Architecture & Edge Cases

### 10.1. EMA Computation (Efficiency Note)
EMAs are computed incrementally on each new candle close — not recalculated from scratch:
```typescript
newEMA = (close - prevEMA) * multiplier + prevEMA
// multiplier = 2 / (period + 1)
```
The three EMA values (20, 50, 200) and ADX(14) are cached and updated in `O(1)` per candle.

### 10.2. Multi-Swing Point Memory (Structural Cache)
The engine maintains a rolling cache of the last 10 confirmed swing highs and 10 confirmed swing lows per symbol/timeframe. Swing confirmation uses a 3-candle lookback (a high is confirmed when two subsequent candles print lower highs). This cache is persisted to Redis on every candle to survive crash recovery.

### 10.3. HTF Cascade (Trend-on-Trend Architecture)
Trend state is computed independently for each timeframe in the HTF routing table (1H, 4H, Daily, Weekly). The signal TF checks the cached HTF bias before allowing any signal to proceed. If the Daily and 4H are in conflict, a `PARTIAL` alignment flag is set and the signal tier is capped at `AGGRESSIVE`.

### 10.4. FVG & OB Integration (Cross-Strategy Confluence)
The Trend Following engine shares the Order Block and Supply & Demand zone caches. A pullback that aligns with a simultaneously active Demand Zone (from the S&D engine) or Bullish OB (from the OB engine) receives an automatic `+2` "multi-strategy confluence bonus" added to the score. This is the highest-probability setup in the system — trend continuation, OB/zone confluence, AND Fibonacci OTE alignment.

### 10.5. Trailing Stop Synthetic Orders (API Rate Defense)
The structural trailing stop is maintained locally in memory. Only a single `market_close` or `modify_stop` API call is sent to the broker — never a polling loop.

**Evaluation vs. Modification — Two Separate Loops:**

The debounce applies **only** to upward stop modifications (moving the trailing SL higher as new swing lows form). It does **not** apply to breach detection:

```typescript
// ── Tick-level evaluation (fires on EVERY WebSocket price tick — O(1) memory check) ──
onPriceTick(price: number, trade: ActiveTrade): void {
  if (!trade.trailing_active) return

  // BREACH CHECK — no debounce, no delay
  const isBreached =
    trade.direction === 'BUY'
      ? price <= trade.current_sl
      : price >= trade.current_sl

  if (isBreached) {
    // Bypass all debounce logic — immediate kill order
    cancel_synthetic_trailing_stop(trade.id)  // prevent CHoCH from also firing
    execute_market_close(trade)
    return
  }
}

// ── Modification loop (fires on each CANDLE CLOSE — 5-second minimum debounce) ──
onCandleClose(candles: Candle[], trade: ActiveTrade): void {
  if (!trade.trailing_active) return
  if (Date.now() - trade.last_trail_update_ms < 5000) return  // debounce gate

  const new_sl = computeNewTrailingSL(candles, trade)
  if (new_sl > trade.current_sl) {
    trade.current_sl = new_sl
    trade.last_trail_update_ms = Date.now()
    // Single broker API call to register the updated hard stop
    brokerApi.modifyStop(trade.broker_order_id, new_sl)
  }
}
```

> In fast markets (NY open, high-volume crypto events), price can cascade through a trailing
> stop level within 1–2 seconds. The 5-second debounce on the modification loop is safe
> because it only delays moving the stop **higher**. Breach detection fires instantaneously
> on every tick with zero debounce — it never "looks away" during a crash.

### 10.6. Slippage & Commission Model
```typescript
const commission_cost = calculateCommission(entry_price, quantity, broker_settings)
const slippage_est    = 0.10 * ATR_14  // Conservative slippage estimate
const total_cost_pips = commission_cost + slippage_est

// Minimum RR gate after costs:
const net_r = (tp1_price - entry_price) - total_cost_pips
if (net_r < 1.0 * R) {
  // After costs, TP1 delivers less than 1:1 net — reject trade
  return NO_TRADE
}
```

### 10.7. State Hydration & Disaster Recovery
On node reboot, the engine loads all active trend-following trades from Redis:
1. Re-reads EMA/ADX values from the last persisted state.
2. Checks the broker API for actual open positions.
3. Verifies that the trend direction is still valid at the current candle.
4. If a CHoCH occurred during downtime and an open runner trade exists, immediately exits the runner.

---
*Generated by Adebowale Segun | TRAXO Internal Systems Reference V1.0*
