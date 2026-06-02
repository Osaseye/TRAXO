<div align="center">
  <img src="../../public/logo.png" alt="TRAXO Logo" width="200" />
  <h1>TRAXO Algorithm Specification: Breakout (V1)</h1>
  <p><b>Author:</b> Adebowale Segun</p>
  <p><b>Date:</b> June 1, 2026</p>
  <p><i>Trade Smart. Execute Precisely.</i></p>
</div>

---

## 1. Executive Summary & Algorithmic Philosophy

The Breakout Algorithm is a structural compression-and-release engine. It is built on the core premise that markets alternate between **consolidation** (range-bound, energy-accumulating phases) and **expansion** (explosive directional phases). Breakout trading is the discipline of detecting the precise moment that price escapes a defined structure boundary — with institutional-grade confirmation — and riding the expansion to its natural price delivery target.

The algorithmic philosophy has three pillars:
1.  **Structure before signal.** Every valid breakout must originate from a clearly defined, multi-touch consolidation zone. No zone = no trade.
2.  **Body close, not wick.** Price *wicking* beyond a level is the hallmark of institutional stop-hunting (a trap). Only a confirmed **candle body close** beyond the level counts as a breakout.
3.  **Volume confirms commitment.** Without above-average volume expansion, price escaping a level is most likely a false breakout engineered to trap retail participants. Volume `>= 1.5× VMA(20)` is the minimum; `>= 2.0×` is institutional-grade.

This engine classifies five pattern families (flags/pennants, triangles, wedges, rectangles, cup & handle), integrates Smart Money false-breakout detection (stop hunt identification), and outputs retest-entry signals calibrated against the range height as the natural projection target.

---

## 2. Core Data Structures & Pre-Processing

### 2.1. Normalization Metrics
```typescript
const ATR_14  = computeATR(candles, 14)   // Wilder smoothing — all distance checks
const VMA_20  = computeSMA(volumes, 20)   // 20-period volume moving average — confirmation gate
```

### 2.2. Trendline Engine (Regression-Based)
The pattern classifier relies on dynamically fitted trendlines across swing highs and swing lows:

```python
FUNCTION fit_trendline(swing_points[], direction):
  # Least-squares linear regression across N swing points
  x = [point.index for point in swing_points]
  y = [point.price for point in swing_points]
  slope, intercept = linear_regression(x, y)
  
  # Deviation tolerance: point must be within 0.15 × ATR_14 of the fitted line
  tolerance = 0.15 * ATR_14
  
  return Trendline { slope, intercept, touch_count, tolerance, last_touch_index }
```

### 2.3. Consolidation Zone Object

```typescript
interface ConsolidationZone {
  id:                string
  pattern_type:      'FLAG' | 'PENNANT' | 'TRIANGLE' | 'WEDGE' | 'RECTANGLE' | 'CUP_HANDLE'
  triangle_subtype:  'ASCENDING' | 'DESCENDING' | 'SYMMETRICAL' | null
  wedge_direction:   'RISING' | 'FALLING' | null
  resistance_line:   Trendline    // Upper boundary
  support_line:      Trendline    // Lower boundary
  resistance_touches: number      // Min 2 required
  support_touches:    number      // Min 2 required
  range_height:      number       // Max distance between lines at widest point (in price)
  range_height_atr:  number       // range_height / ATR_14
  apex_pct:          number | null // For triangles: 0–100%, ideal breakout 50–75%
  compression_ratio: number        // Current width / initial width (lower = tighter = stronger)
  formation_candles: number       // How many candles the pattern spans
  prior_trend:       'BULLISH' | 'BEARISH' | 'NEUTRAL'
  prev_move_size:    number        // ATR units of the prior impulse (cup depth, prior leg)
  formed_at:         number
  active:            boolean
}
```

### 2.4. Breakout Event Object

```typescript
interface BreakoutEvent {
  zone_id:           string
  direction:         'BULLISH' | 'BEARISH'
  breakout_candle:   Candle
  close_beyond_level: boolean   // CRITICAL: body close, not wick-only
  volume_ratio:      number     // breakout_candle.volume / VMA_20
  retest_pending:    boolean
  retest_triggered:  boolean
  retest_candle:     Candle | null
  false_breakout:    boolean    // Closed beyond then closed back inside within 3 candles
  stop_hunt_detected: boolean   // Wick through level, closed back inside — retail trap
}
```

### 2.5. Liquidity Pool Awareness
The engine maps institutional liquidity to identify where the breakout is *delivering to*:

*   **Internal Liquidity** (EQH/EQL within the consolidation): the range's stop clusters.
*   **External Liquidity** (BSL above pattern high / SSL below pattern low): the destination after breakout.
*   The projected TP is calibrated to the next external liquidity pool, not just a mechanical range extension.

---

## 3. Phase 1: Context Engine — Pattern Detection & Classification

### 3.1. Prior Trend Identification
Breakouts require a prior directional move to be meaningful. The engine measures the pre-consolidation impulse:

```python
FUNCTION get_prior_trend(candles[], consolidation_start_idx):
  lookback = candles[max(0, consolidation_start_idx - 30): consolidation_start_idx]
  net_move = lookback[-1].close - lookback[0].close
  move_size_atr = abs(net_move) / ATR_14
  
  IF move_size_atr < 1.5:  # Prior move too small — no conviction
    return ('NEUTRAL', move_size_atr)
  
  return ('BULLISH' if net_move > 0 else 'BEARISH', move_size_atr)
```

### 3.2. Consolidation Zone Detector

```python
FUNCTION detect_consolidation(candles[], lookback=50):
  swing_highs = detect_swing_highs(candles, lookback)  # Local maxima
  swing_lows  = detect_swing_lows(candles, lookback)   # Local minima
  
  IF len(swing_highs) < 2 OR len(swing_lows) < 2:
    return NULL  # Not enough touches for a valid zone
  
  resistance = fit_trendline(swing_highs, 'RESISTANCE')
  support    = fit_trendline(swing_lows,  'SUPPORT')
  
  IF resistance.touch_count < 2 OR support.touch_count < 2:
    return NULL  # Minimum 2 touches on each boundary required
  
  range_height     = max(resistance.prices) - min(support.prices)
  range_height_atr = range_height / ATR_14
  
  # Pattern must be a meaningful compression (not noise)
  IF range_height_atr < 1.0:
    return NULL  # Too narrow — noise level, skip
  
  return ConsolidationZone { resistance, support, range_height, ... }
```

### 3.3. Pattern Classifier

```python
FUNCTION classify_pattern(zone):
  res_slope = zone.resistance_line.slope  # Normalized per ATR
  sup_slope = zone.support_line.slope

  # FLAGS / PENNANTS: occur after a sharp impulse (prior_move_size >= 2× ATR)
  IF zone.prior_trend != 'NEUTRAL' AND zone.prev_move_size >= 2.0:
    IF abs(res_slope - sup_slope) < 0.001 AND abs(res_slope) > 0.001:
      zone.pattern_type = 'FLAG'  # Parallel channels tilted against prior trend
      return zone
    IF res_slope < 0 AND sup_slope > 0:
      zone.pattern_type = 'PENNANT'  # Converging trendlines after sharp move
      return zone

  # TRIANGLES: converging trendlines
  IF res_slope < 0 AND sup_slope > 0:
    zone.pattern_type  = 'TRIANGLE'
    zone.triangle_sub  = 'SYMMETRICAL'
  ELIF abs(res_slope) < 0.0005 AND sup_slope > 0:  # Flat top, rising bottom
    zone.pattern_type  = 'TRIANGLE'
    zone.triangle_sub  = 'ASCENDING'   # Bullish bias
  ELIF res_slope < 0 AND abs(sup_slope) < 0.0005:  # Declining top, flat bottom
    zone.pattern_type  = 'TRIANGLE'
    zone.triangle_sub  = 'DESCENDING'  # Bearish bias

  # WEDGES: both lines slope same direction, converging
  ELIF res_slope > 0 AND sup_slope > 0 AND sup_slope > res_slope:
    zone.pattern_type  = 'WEDGE'
    zone.wedge_direction = 'RISING'    # Bearish — buyers exhausting
  ELIF res_slope < 0 AND sup_slope < 0 AND res_slope < sup_slope:
    zone.pattern_type  = 'WEDGE'
    zone.wedge_direction = 'FALLING'   # Bullish — sellers exhausting

  # RECTANGLES: both lines near-flat
  ELIF abs(res_slope) < 0.0005 AND abs(sup_slope) < 0.0005:
    zone.pattern_type = 'RECTANGLE'

  # CUP & HANDLE: large rounded base + small handle consolidation
  # (detected separately via U-shape regression)
  
  # Triangle apex position (for apex timing filter)
  IF zone.pattern_type == 'TRIANGLE':
    apex_candle = find_intersection(zone.resistance_line, zone.support_line)
    total_span  = apex_candle.index - zone.formation_start_index
    progress    = current_index - zone.formation_start_index
    zone.apex_pct = (progress / total_span) * 100  # 50–75% is ideal

  return zone
```

### 3.4. Triangle Apex Timing Filter
*   Breakout is only valid if `50% <= apex_pct <= 90%`.
*   Breaking before 50%: pattern is undeveloped — reject.
*   Breaking after 90%: pattern has lost energy — reject.

---

## 4. Phase 2: Live Event Processing — Breakout Validation

### 4.1. Breakout Detection Engine

```python
FUNCTION detect_breakout(candle, zone):
  current_resistance = get_trendline_price(zone.resistance_line, candle.index)
  current_support    = get_trendline_price(zone.support_line,    candle.index)
  
  # === BULLISH BREAKOUT ===
  IF candle.close > current_resistance + (0.5 * ATR_14):  # Body close clearly beyond level
    IF candle.close == candle.high:  # No upper wick — full commitment
      close_conviction = 'STRONG'
    ELSE:
      close_conviction = 'STANDARD'
    
    volume_ratio = candle.volume / VMA_20
    
    breakout = BreakoutEvent {
      direction:          'BULLISH',
      close_beyond_level: True,
      volume_ratio:       volume_ratio,
      stop_hunt_detected: False
    }
    return breakout
  
  # === STOP HUNT DETECTION (False Breakout) ===
  # Wick pierced beyond level but candle CLOSED BACK INSIDE
  IF candle.high > current_resistance AND candle.close < current_resistance:
    # This is a stop hunt — retail longs above resistance were flushed
    breakout = BreakoutEvent {
      stop_hunt_detected: True,
      false_breakout:     True,
      direction:          'BULLISH'  # The hunt direction
    }
    # Flag the zone as having a recent stop hunt — this is actually bullish context
    # If price reverses UP after this, treat as a HIGH QUALITY continuation setup
    zone.last_stop_hunt_timestamp = candle.timestamp
    return breakout
```

### 4.2. Volume Expansion Gate
```python
# Volume gate is non-negotiable for breakout confirmation
IF breakout.volume_ratio < 1.5:
  breakout.quality_tier = 'WEAK'   # Below minimum — flag, do not enter
  score -= 2  # Volume deficit penalty

IF breakout.volume_ratio >= 2.0:
  score += 2  # Institutional-grade volume bonus

IF breakout.volume_ratio >= 3.0:
  score += 3  # PRIME volume — very rare, highest weight
```

### 4.3. Retest Entry Logic (Post-Breakout)
The retest is the *most reliable entry* — broken resistance becomes new support (and vice versa for shorts). The engine monitors for a pullback after the initial breakout:

```python
FUNCTION monitor_retest(breakout_event, candles[]):
  broken_level = breakout_event.resistance_at_breakout  # For bullish breakout
  
  # Wait for price to retrace back to the broken level
  FOR candle in post_breakout_candles:
    IF candle.low <= broken_level <= candle.high:  # Price touched the old resistance
      # Confirm: did the candle CLOSE ABOVE the level? (validation of polarity flip)
      IF candle.close > broken_level:
        breakout_event.retest_triggered = True
        breakout_event.retest_candle    = candle
        # Bonus: +2 score for retest entry vs chase entry
        return RETEST_CONFIRMED
      ELIF candle.close < broken_level:
        # Retest failed — false breakout confirmed
        breakout_event.false_breakout = True
        return RETEST_FAILED
  
  # Retest window: max 20 candles after breakout. After that, zone expires.
  IF candles_since_breakout > 20:
    breakout_event.retest_pending = False  # Window closed
```

---

## 5. Phase 3: The Validation Middlewares

### 5.1. Asset-Type Override Engine
*   **STOCKS:** Volume threshold elevated to `>= 2.5× VMA(20)` — institutional participation is measurably higher on stock breakouts. Earnings-proximity block (24h window).
*   **CRYPTO:** Weekend breakout penalty `-1` (low liquidity, frequent fakeouts). Funding rate check: negative/neutral funding on bullish breakout = bonus `+1`.
*   **FOREX:** Session filter strictly applied — breakouts outside London (08:00–17:00 UTC) or NY (13:00–22:00 UTC) carry `-1` penalty. Asian-session breakouts almost always false.
*   **FUTURES:** ORB (Opening Range Breakout) at session open: `+1` bonus for breakouts occurring in the first 60 minutes of the primary futures session.

### 5.2. Dynamic HTF Trend Alignment

| Signal Timeframe | HTF Reference |
|-----------------|---------------|
| `1m / 5m`       | 1-Hour trend  |
| `15m / 30m`     | 4-Hour trend  |
| `1H / 4H`       | Daily trend   |
| `Daily`         | Weekly trend  |

*   Bullish breakout aligned with bullish HTF: `+2`.
*   Bullish breakout against bearish HTF: `-2` (counter-trend breakout — low conviction unless HTF CHoCH confirmed).
*   Bearish ascending wedge breaking down in bullish HTF: `-1` (fade trade, risky).

### 5.3. Macro-Economic News Defense
*   High-impact event within 30 minutes of signal: `-3` penalty.
*   Reason logged: `"-3 News event: [Name] in [N] minutes"`.
*   If post-penalty score `< 6`: `NO_TRADE` hard-kill.

---

## 6. Phase 4: Confidence Scoring Matrix (14 Points)

### 6.1. The Point Matrix

**Additive:**
*   `+3`: Flag / Pennant pattern (highest reliability, clear prior trend, lowest noise)
*   `+2`: Ascending / Descending Triangle (directional bias confirmed by structure)
*   `+2`: Volume expansion `>= 2.0× VMA(20)` on breakout candle
*   `+2`: HTF trend alignment with breakout direction
*   `+2`: Retest entry triggered (broken level held as new support/resistance)
*   `+1`: Session timing premium (London/NY open within 2 hours)
*   `+1`: Pattern formation `>= 10 candles` (mature structure, more reliable)
*   `+1`: Triangle apex at `50–75%` of apex distance (optimal compression window)
*   `+1`: Prior impulse `>= 2× ATR_14` (strong trend context behind the pattern)

**Subtractive:**
*   `-3`: High-impact news within `<= 30 min` *(Hard kill)*
*   `-2`: Wick-only penetration of level (body did not close beyond) — stop hunt, not breakout
*   `-2`: Counter-HTF breakout without CHoCH confirmation
*   `-2`: Volume `< 1.5× VMA(20)` — institutional confirmation absent
*   `-1`: Asian session breakout (no overlap bonus)
*   `-1`: No prior trend (NEUTRAL — symmetrical patterns in ranging market, lower conviction)
*   `-1`: Chase entry (more than 0.5× ATR_14 above the broken level, no retest waited)

### 6.2. Tier Output Mapping
*   `PRIME` **(10–14 pts):** Confidence `85%–99%`. Risk `1.5%`.
*   `STANDARD` **(8–9 pts):** Confidence `70%–84%`. Risk `1.0%`.
*   `AGGRESSIVE` **(6–7 pts):** Confidence `50%–69%`. Risk `0.5%`. Red flag shown.
*   `DISCARD` **(`< 6 pts`):** Terminated.

---

## 7. Phase 5: Dynamic Risk Sizing & Circuit Breakers

### 7.1. Global Circuit Breakers
*   **Daily Kill Switch:** `Rolling_Drawdown >= 4.0%` → `NO_TRADE`. Resets 00:00 UTC.
*   **Streak Mitigation:** `Consecutive_Losses >= 3` → `0.5× risk multiplier` until next win.

### 7.2. Timeframe-Specific Risk Bands

| Timeframe | Max Risk Per Trade | SL Range |
|-----------|-------------------|---------|
| `1M / 5M` (Scalp) | `0.25–0.5%` | 3–8 pips |
| `15M / 1H` (Intraday) | `0.5–1.0%` | 10–40 pips |
| `4H / Daily` (Swing) | `1.0–2.0%` | 40–200 pips |
| `Weekly / Monthly` (Position) | `2.0–5.0%` | 200+ pips |

### 7.3. Position Sizing
```python
Risk_Distance = abs(Entry_Price - SL_Price)  # SL placed below pattern low
Dollar_Risk   = Account_Balance * Risk_Pct
Quantity      = Dollar_Risk / Risk_Distance

# Entry options:
# 1. Chase entry: market order on breakout candle close
# 2. Retest entry: limit order at broken level ± (0.1 × ATR_14) tolerance
# 3. Pullback to 50% of breakout candle (compromise between 1 and 2)
```

---

## 8. Phase 6: Trade Lifecycle & State Management

### 8.1. Stop Loss Placement
```python
# Bullish breakout:
sl_price = zone.support_line_price_at_breakout - (0.15 * ATR_14)
# = Below the pattern low (swing low of the consolidation zone)
# ATR buffer protects against stop hunts at the obvious level

# Maximum SL width check:
IF abs(entry - sl_price) > 2.0 * ATR_14:
  return NO_TRADE  # Risk too wide — skip

# Bearish breakout:
sl_price = zone.resistance_line_price_at_breakout + (0.15 * ATR_14)
```

### 8.2. Take Profit Geometry (Range Height Projection)
The natural target of a breakout is the **height of the prior range projected from the breakout point**:

```python
# Bullish breakout:
range_height = zone.range_height
tp1 = breakout_level + (range_height * 0.5)  # 1R area — breakeven trigger target
tp2 = breakout_level + range_height           # Full range projection
tp3 = breakout_level + (range_height * 1.618) # Fibonacci extension — runner target

# Liquidity pool override: if BSL pool exists before the geometric TP, use it instead
IF bsl_pool AND bsl_pool.price < tp2:
  tp2 = bsl_pool.price  # Institutional delivery target takes precedence
```

### 8.3. Break-Even Logic
```typescript
const commission_cost = calculateCommission(entry_price, quantity, broker_settings)
const slippage_buffer = 0.10 * ATR_14
const tolerance       = (commission_cost / quantity) + slippage_buffer

// Trigger: price reaches TP1 (1R area)
breakeven_price = entry_price + tolerance  // for longs
```

### 8.4. Partial Scale-Out Protocol
*   **At TP1 (50% of range height):** Close `50%` of position. SL auto-moves to break-even.
*   **At TP2 (full range projection):** Close `30%` of position.
*   **Remaining 20%:** Trail behind each new swing low (bull) / swing high (bear). Runner targets the Fibonacci extension / next external liquidity pool.

### 8.5. False Breakout State Machine & Exit
```
CONSOLIDATING → BREAKOUT_DETECTED → CONFIRMED (body close + volume) → MANAGED
                       ↓                           ↓
              FALSE_BREAKOUT (wick only,      INVALIDATED (3 candles close
               or close back inside)           back inside the zone)
```

When `FALSE_BREAKOUT` is detected:
*   Any open position is exited immediately (market order).
*   Zone's false breakout count incremented — if `>= 2`, zone is tagged `STRUCTURAL_RESISTANCE` (harder to break, needs even higher volume next attempt).

### 8.6. Time-Decay Exit
*   If trade is open `>= N candles` (per-timeframe) without reaching TP1:
*   Exit at best available price. Zone re-evaluated as potentially failed.

---

## 9. Developer Output Schema

```typescript
export interface BreakoutSignal {
  id:                   string
  strategy_id:          'breakout'
  signal:               'BUY' | 'SELL' | 'NO_TRADE'
  symbol:               string
  asset_type:           'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'

  // Pattern
  pattern_type:         'FLAG' | 'PENNANT' | 'TRIANGLE' | 'WEDGE' | 'RECTANGLE' | 'CUP_HANDLE'
  triangle_subtype:     'ASCENDING' | 'DESCENDING' | 'SYMMETRICAL' | null
  wedge_direction:      'RISING' | 'FALLING' | null
  resistance_level:     number            // Upper trendline price at breakout
  support_level:        number            // Lower trendline price at breakout
  range_height:         number            // Height of consolidation zone
  pattern_candles:      number            // Duration of pattern in candles
  apex_pct:             number | null     // Triangle compression progress (50–75% ideal)

  // Breakout
  breakout_direction:   'BULLISH' | 'BEARISH'
  body_close_confirmed: boolean           // CRITICAL: true = valid, false = wick-only
  volume_ratio:         number            // candle volume / VMA_20
  stop_hunt_detected:   boolean           // Wick-through then reversal = trap
  false_breakout:       boolean
  retest_entry:         boolean           // True if entry is on retest vs chase

  // Score & UI
  score:                number            // 0–14
  confidence_pct:       number
  tier:                 'prime' | 'standard' | 'aggressive' | 'discard'

  // Execution Levels
  entry_type:           'limit' | 'market'
  entry_price:          number
  sl_price:             number            // Below pattern low ± ATR buffer
  tp1_price:            number            // 50% range height / 1R
  tp2_price:            number            // Full range height projection
  tp3_trailing:         boolean           // Fibonacci extension runner
  suggested_risk_pct:   number

  // Breakeven
  breakeven_price:      number
  breakeven_triggered:  boolean

  // Lifecycle
  expiry_candles:       number
  time_decay_limit:     number
  false_breakout_count: number

  // Confluence Trace
  htf_aligned:          boolean
  prior_trend:          'BULLISH' | 'BEARISH' | 'NEUTRAL'
  prior_move_atr:       number
  session_active:       boolean
  bsl_pool_target:      number | null     // External liquidity pool (delivery target)
  reason:               string[]
  timestamp:            string            // ISO 8601
}
```

---

## 10. Systems Architecture & Edge Cases

### 10.1. Pattern Registry (Active Zone Cache)
All active consolidation zones are stored in a Redis hash keyed by `breakout_registry:{symbol}:{timeframe}`. Zones are pruned when:
*   Breakout occurs (zone promoted to active trade management).
*   Pattern fails (price breaks the *wrong* boundary of the pattern — zone invalidated).
*   Pattern expires without breakout (after `max_pattern_candles` without a close beyond either boundary).

### 10.2. Parallel Pattern Detection (Multi-Pattern Guard)
On some charts, multiple overlapping patterns may be detected simultaneously (e.g., a flag inside a larger rectangle). The engine maintains a priority hierarchy: `FLAG > TRIANGLE > WEDGE > RECTANGLE`. Only the highest-priority valid pattern is acted upon; lower-priority patterns are cached but not executed.

### 10.3. Trendline Slope Drift Tolerance
Linear regression trendlines shift with every new candle. The engine recalculates `resistance_level` and `support_level` at the time of each new candle — a breakout that was valid 3 candles ago may not be valid now if the trendline has drifted. This prevents stale breakout entries.

### 10.4. Stop Hunt → Reversal Flip Protocol
When `stop_hunt_detected = true` (wick through level, close back inside), the engine does not fire a breakout signal. However, it tags the zone as `stop_hunt_zone`. If on the *next* 1–3 candles price closes **strongly in the stop-hunt direction** with volume `>= 1.5× VMA(20)`, the engine fires a new, high-quality signal in that direction — the institutional move that the stop hunt was engineered to create.

### 10.5. Slippage & Commission Model
Breakout entries on fast-moving candles often execute beyond the indicated level. The engine adjusts the effective entry price using:
```typescript
effective_entry = actual_fill_price
slippage = abs(effective_entry - intended_entry)
if slippage > 0.5 * ATR_14:
  // Recalculate SL and TP from actual fill — do not use pre-signal values
  recompute_risk_from_fill(effective_entry, sl_price, tp1_price)
```

### 10.6. Crash Recovery
Active pattern states are flushed to Redis AOF on every candle. On node reboot, the engine reloads all `ACTIVE` patterns, recalculates trendline prices at the current candle, and continues monitoring without re-scanning the full history.

---
*Generated by Adebowale Segun | TRAXO Internal Systems Reference V1.0*
