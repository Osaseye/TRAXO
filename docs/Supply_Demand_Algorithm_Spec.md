<div align="center">
  <img src="../../public/logo.png" alt="TRAXO Logo" width="200" />
  <h1>TRAXO Algorithm Specification: Supply & Demand (V1)</h1>
  <p><b>Author:</b> Adebowale Segun</p>
  <p><b>Date:</b> June 1, 2026</p>
  <p><i>Trade Smart. Execute Precisely.</i></p>
</div>

---

## 1. Executive Summary & Algorithmic Philosophy

The Supply & Demand Algorithm is a zone-identification engine built on the foundational principle that price does not move randomly — it moves from one institutional imbalance to the next. Supply Zones are areas where institutional sellers overwhelmed buyers, creating a surplus of supply that drove price sharply lower. Demand Zones are areas where institutional buyers overwhelmed sellers, creating a surplus of demand that drove price sharply higher.

The philosophical core: **every sharp price move originates from a zone**. The larger the move away from the zone, the greater the institutional commitment, and the more likely price is to return and respect it. Unlike retail-style support and resistance (drawn as lines), this engine treats zones as **three-dimensional price ranges** with a proximal entry edge, a distal invalidation edge, a mitigation level (50% midpoint), and a zone width quality metric.

The engine identifies four zone formation patterns (RBD, DBR, RBR, DBD), scores each zone on a rigorous 10-point rubric, integrates Smart Money stop-hunting logic to confirm institutional intent, and outputs precision-calibrated trade payloads. Zone freshness is continuously tracked: first-touch zones are the highest probability; the probability decay function is factored into every score.

---

## 2. Core Data Structures & Pre-Processing

### 2.1. ATR Normalization
All zone detection thresholds are expressed in `ATR(14)` to maintain cross-asset compatibility:

```typescript
const ATR_14 = computeATR(candles, 14)  // Standard Wilder smoothing
```

### 2.2. Zone Object Schema

```typescript
interface SupplyDemandZone {
  id:              string            // Unique zone ID
  type:            'DEMAND' | 'SUPPLY'
  pattern:         'DBR' | 'RBR' | 'RBD' | 'DBD'
  proximal_line:   number           // Nearest edge to current price (entry trigger)
  distal_line:     number           // Far edge (SL reference)
  mitigation_level: number          // 50% of zone width = OTE / break-even reference
  zone_width:      number           // distal - proximal (in price)
  zone_width_atr:  number           // zone_width / ATR_14
  base_candle_count: number         // Number of base (consolidation) candles
  departure_speed:   number         // Departure candle size in ATR units
  quality_score:   number           // 0–10 rubric score (min 7 to trade)
  fresh:           boolean          // Has price returned to this zone yet?
  tap_count:       number           // Number of retouches
  formed_at:       number           // Timestamp of zone formation
  htf_aligned:     boolean
  fvg_inside:      boolean
}
```

### 2.3. Equilibrium Engine
The mitigation level of each zone defines the 50% midpoint — the Optimal Trade Entry:
```typescript
zone.mitigation_level = (zone.proximal_line + zone.distal_line) / 2
```
Aggressive entry: proximal line touch. Conservative entry: mitigation level fill.

### 2.4. Liquidity Pool Mapping (Internal & External)
The engine maps two tiers of liquidity — identical to the Order Block engine — because Supply & Demand zones form *at* institutional liquidity grabs:

*   **Internal Liquidity** (EQH/EQL within the current range): clustered stop orders forming.
*   **External Liquidity** (BSL above swing highs / SSL below swing lows): next institutional delivery target after zone activation.

---

## 3. Phase 1: Context Engine — Zone Detection & Classification

### 3.1. Base Candle Detection
A "base" candle is a consolidation candle — small-bodied, indicating institutional accumulation or distribution before the departure move.

```python
FUNCTION is_base_candle(candle, ATR_14):
  body = abs(candle.close - candle.open)
  RETURN body < 0.40 * ATR_14  # Body < 40% of ATR = base candle
```

A valid base is `1–4 consecutive` base candles forming the consolidation phase of the zone.

### 3.2. Departure Candle Detection
```python
FUNCTION is_departure_candle(candle, ATR_14):
  body = abs(candle.close - candle.open)
  total_range = candle.high - candle.low
  RETURN body > 2.0 * ATR_14  # Departure body > 2× ATR = institutional commitment
  # Strong departure: body > 3.0 * ATR_14 (adds +1 to score)
```

### 3.3. Four Formation Pattern Classifier

| Pattern | Sequence | Zone Type | Interpretation |
|---------|----------|-----------|----------------|
| **DBR** | Drop → Base → Rally | DEMAND | Sellers exhausted, buyers absorb, strong rally departs. |
| **RBD** | Rally → Base → Drop | SUPPLY | Buyers exhausted, sellers absorb, strong drop departs. |
| **RBR** | Rally → Base → Rally | DEMAND (continuation) | Brief pause within uptrend, institutional buy dip. |
| **DBD** | Drop → Base → Drop | SUPPLY (continuation) | Brief pause within downtrend, institutional sell-the-rally. |

```python
FUNCTION classify_zone_pattern(candles[], i):
  # Check window: prior_move(3 candles) + base(1-4 candles) + departure(1-3 candles)
  
  prior_candles = candles[i-3:i]
  base_candles  = []
  j = i
  
  WHILE j < len(candles) AND is_base_candle(candles[j], ATR_14) AND len(base_candles) < 4:
    base_candles.append(candles[j])
    j += 1
  
  IF len(base_candles) == 0: return NULL  # No base = no valid zone
  
  departure = candles[j]
  IF NOT is_departure_candle(departure, ATR_14): return NULL
  
  prior_bullish = count_bullish(prior_candles) >= 2
  prior_bearish = count_bearish(prior_candles) >= 2
  dep_bullish   = departure.close > departure.open
  dep_bearish   = departure.close < departure.open
  
  IF prior_bearish AND dep_bullish: return ('DBR', 'DEMAND')
  IF prior_bullish AND dep_bearish: return ('RBD', 'SUPPLY')
  IF prior_bullish AND dep_bullish: return ('RBR', 'DEMAND')
  IF prior_bearish AND dep_bearish: return ('DBD', 'SUPPLY')
  
  return NULL
```

### 3.4. Zone Boundary Calculation

```python
FUNCTION calculate_zone_boundaries(base_candles, zone_type):
  IF zone_type == 'DEMAND':
    distal_line   = min(c.low for c in base_candles)   # Lowest point of base
    proximal_line = max(c.close for c in base_candles) # Nearest edge to price
  
  IF zone_type == 'SUPPLY':
    distal_line   = max(c.high for c in base_candles)  # Highest point of base
    proximal_line = min(c.close for c in base_candles) # Nearest edge to price
  
  mitigation_level = (proximal_line + distal_line) / 2
  zone_width_atr   = abs(distal_line - proximal_line) / ATR_14
  
  RETURN proximal_line, distal_line, mitigation_level, zone_width_atr
```

### 3.5. Stop Hunt Confirmation (Liquidity Sweep Validator)
Before a zone is elevated to `high_probability`, the engine checks whether price *swept* a nearby liquidity pool before the departure candle:

```python
# Demand zone: did price sweep SSL (equal lows) before the bullish departure?
IF zone_type == 'DEMAND':
  ssl_pool = get_nearest_ssl(base_candles[0].low, liquidity_pools)
  IF ssl_pool AND abs(min(c.low for c in base_candles) - ssl_pool.price) <= 0.2 * ATR_14:
    zone.liquidity_swept = True  # +2 score bonus — institutional stop hunt confirmed
```

---

## 4. Phase 2: Zone Quality Scoring (0–10)

Each detected zone is evaluated against a 10-point rubric. Zones scoring `< 7` are discarded before ever reaching Phase 3.

| Factor | Points | Criteria |
|--------|--------|---------|
| **Freshness** | `0–2` | First touch = 2, Second touch = 1, Third+ = 0 |
| **Departure Speed** | `0–2` | Departure body `> 3× ATR` = 2, `2–3× ATR` = 1, below = 0 |
| **Base Candle Quality** | `0–2` | 1–2 base candles = 2, 3–4 = 1, 5+ = 0 (wide base is weaker) |
| **HTF Alignment** | `0–1` | Zone aligns with Daily/Weekly trend = 1, counter-trend = 0 |
| **Departure Candle Size** | `0–1` | Body `> 3× ATR` = 1 bonus (overlap with Departure Speed) |
| **Pattern Purity** | `0–1` | DBR / RBD (reversal) = 1, RBR / DBD (continuation) = 0.5 |
| **RR Availability** | `0–1` | If minimum 2:1 RR available to next opposing zone = 1 |

Zones scoring `7–8` → `STANDARD`. Zones scoring `9–10` → `PRIME`.

```python
def score_zone(zone, htf_bias, liquidity_pools, ATR_14):
  score = 0
  
  # Freshness
  if zone.tap_count == 0:   score += 2
  elif zone.tap_count == 1: score += 1
  
  # Departure speed
  dep_body_atr = zone.departure_speed  # Pre-computed departure body / ATR_14
  if dep_body_atr >= 3.0:   score += 2
  elif dep_body_atr >= 2.0: score += 1
  
  # Base candle count
  if zone.base_candle_count <= 2:   score += 2
  elif zone.base_candle_count <= 4: score += 1
  
  # HTF alignment
  if (zone.type == 'DEMAND' and htf_bias == 'BULLISH') or \
     (zone.type == 'SUPPLY' and htf_bias == 'BEARISH'):
    score += 1
  
  # Pattern quality
  if zone.pattern in ('DBR', 'RBD'):  score += 1  # Reversal patterns are highest quality
  else:                                score += 0.5
  
  # RR availability
  opposing_zone_distance = get_opposing_zone_distance(zone, zones[])
  risk_distance = abs(zone.proximal_line - zone.distal_line)
  if opposing_zone_distance >= 2 * risk_distance:
    score += 1
  
  zone.quality_score = min(score, 10)
  return zone
```

---

## 5. Phase 3: The Validation Middlewares

### 5.1. Asset-Type Override Engine
*   **FOREX:** Session filter applied. Zones forming and triggering in Asian session carry `-1` penalty. London/NY overlap is the premium window.
*   **STOCKS:** Gap zones (zone formed overnight due to gap) receive `-1` penalty — gaps fill unpredictably.
*   **CRYPTO:** Volume threshold elevated. Confirmation candle (LTF pin bar or engulfing at zone) required.
*   **FUTURES:** Opening Range (first 30-min OR) zones receive `+1` bonus — institutional participation is highest.

### 5.2. Dynamic HTF Anchoring

| Signal Timeframe | HTF Reference |
|-----------------|---------------|
| `1m / 5m`       | 1-Hour zones  |
| `15m / 30m`     | 4-Hour zones  |
| `1H / 4H`       | Daily zones   |
| `Daily`         | Weekly zones  |

When a lower-TF zone sits **inside** an HTF zone of the same type, it receives a `+2` "nesting bonus." This is the highest-conviction Supply & Demand setup.

### 5.3. Maximum Zone Width Gate
```python
IF zone.zone_width_atr > 2.0:  # Zone wider than 2× ATR(14)
  DISCARD zone
  reason = "Zone too wide — risk would exceed 2× ATR maximum. Skip trade."
```

### 5.4. Macro-Economic News Defense
*   If a high-impact news event is within 30 minutes of a zone trigger: `-3` score penalty.
*   Signal is fully suppressed (`NO_TRADE`) if post-penalty score `< 6`.

---

## 6. Phase 4: Confidence Scoring Matrix (14 Points)

The 10-point zone quality score is the *foundation* of the full 14-point confidence matrix. Additional runtime confluence is layered on top.

**Additive:**
*   `+3`: Zone score 9–10 (prime zone, fresh, fast departure)
*   `+2`: Zone score 7–8 (standard quality)
*   `+2`: HTF zone confluence (LTF zone nested inside HTF zone of same type)
*   `+2`: Departure in 1–2 candles only (fastest institutional execution — highest quality)
*   `+1`: Session active (London or NY open)
*   `+1`: Equilibrium (mitigation level) at a round number or HTF structure level
*   `+1`: FVG exists inside zone boundaries (imbalance embedded in zone)
*   `+1`: Liquidity sweep confirmed before zone departure (stop hunt validated)

**Subtractive:**
*   `-3`: High-impact news event `<= 30 min` *(Hard kill)*
*   `-2`: Zone already tapped twice (significantly weaker — third-touch failure risk high)
*   `-2`: Counter-HTF without CHoCH confirmation
*   `-1`: Wide base (3–4 candles — institutional indecision)
*   `-1`: Asian session trigger with no LTF confirmation candle

**Tier Mapping:**
*   `PRIME` **(10–14 pts):** Confidence `85%–99%`. Risk `1.5%`.
*   `STANDARD` **(8–9 pts):** Confidence `70%–84%`. Risk `1.0%`.
*   `AGGRESSIVE` **(6–7 pts):** Confidence `50%–69%`. Risk `0.5%`. Red flag shown.
*   `DISCARD` **(`< 6 pts`):** Terminated.

---

## 7. Phase 5: Dynamic Risk Sizing & Circuit Breakers

### 7.1. Global Circuit Breakers
*   **Daily Kill Switch:** `Rolling_Drawdown >= 4.0%` → `NO_TRADE`. Resets at 00:00 UTC.
*   **Streak Mitigation:** `Consecutive_Losses >= 3` → Risk multiplier `0.5x` until next winning trade.

### 7.2. Zone Width Gate (Position Sizing Limiter)
```python
# Max SL = 2× ATR(14) — if zone is wider, skip the trade
max_sl_distance = 2.0 * ATR_14
actual_sl_distance = abs(entry_price - sl_price)

IF actual_sl_distance > max_sl_distance:
  return NO_TRADE  # Zone too wide — risk unacceptable

Dollar_Risk = Account_Balance * Risk_Pct_for_Tier
Quantity    = Dollar_Risk / actual_sl_distance
```

### 7.3. Entry Modes
*   **Aggressive Entry:** Limit order at proximal line touch (immediate zone edge).
*   **Conservative Entry:** Limit order at mitigation level (50% zone fill) — requires LTF confirmation candle (pin bar, engulfing, or rejection wick at zone).
*   **Best Practice:** Always use conservative entry for `STANDARD` tier zones; aggressive only permitted for `PRIME` tier with full confluence.

---

## 8. Phase 6: Trade Lifecycle & State Management

### 8.1. Stop Loss Placement
```python
IF zone_type == 'DEMAND':
  # SL beyond the distal line (below the lowest base wick)
  sl_price = distal_line - (0.10 * ATR_14)  # ATR buffer + spread protection

IF zone_type == 'SUPPLY':
  sl_price = distal_line + (0.10 * ATR_14)  # Above the highest base wick
```

### 8.2. Take Profit Targets (Zone-to-Zone Targeting)
Supply & Demand TPs are never arbitrary RR multiples — they target the next opposing zone, because that is the next institutional barrier:

```python
# Long (Demand zone entry):
tp1 = next_supply_zone.proximal_line         # First opposing supply zone above
tp2 = second_supply_zone.proximal_line       # Second supply zone or major swing high

# Short (Supply zone entry):
tp1 = next_demand_zone.proximal_line         # First opposing demand zone below
tp2 = second_demand_zone.proximal_line       # Second demand zone or major swing low

# Fallback (if no opposing zones found):
tp1 = entry + (1.5 * R)
tp2 = entry + (3.0 * R)
```

### 8.3. Partial Scale-Out Protocol
*   **At TP1 (first opposing zone):** Close `50%` of position.
*   **Break-even trigger:** `SL → entry_price ± tolerance_buffer` immediately on TP1 close.
*   **Remaining 50%:** Trail behind newly forming base candles as price advances.
*   **At TP2:** Close all remaining position.

### 8.4. Break-Even Logic
```typescript
const commission_cost  = calculateCommission(entry_price, quantity, broker_settings)
const slippage_buffer  = 0.10 * ATR_14
const tolerance        = (commission_cost / quantity) + slippage_buffer

// Trigger: 1R move in favor
breakeven_price = zone_type === 'DEMAND'
  ? entry_price + tolerance
  : entry_price - tolerance
```

### 8.5. Zone Lifecycle State Machine
```
DETECTED → SCORED (>= 7) → LIVE → TRIGGERED → MANAGED → CLOSED
                 ↓                      ↓
            DISCARDED (<7)         INVALIDATED (price closes through distal line)
                                   EXPIRED (no trigger in N candles)
```
Default expiry window: `50 candles` at the signal's native timeframe.

### 8.6. Time-Decay Exit
If trade has been open `>= N candles` (per-timeframe config) with PnL `< $0`:
*   Action: Exit at best available price (market exit). Zone marked as `FAILED`.

---

## 9. Developer Output Schema

```typescript
export interface SupplyDemandSignal {
  id:                   string
  strategy_id:          'supply_demand'
  signal:               'BUY' | 'SELL' | 'NO_TRADE'
  symbol:               string
  asset_type:           'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'

  // Zone Properties
  zone_type:            'DEMAND' | 'SUPPLY'
  pattern:              'DBR' | 'RBR' | 'RBD' | 'DBD'
  proximal_line:        number
  distal_line:          number
  mitigation_level:     number           // 50% of zone — OTE / breakeven reference
  zone_width_atr:       number           // Zone width relative to ATR

  // Quality
  zone_quality_score:   number           // 0–10
  score:                number           // 0–14 (full matrix)
  confidence_pct:       number
  tier:                 'prime' | 'standard' | 'aggressive' | 'discard'
  fresh:                boolean
  tap_count:            number

  // Execution Levels
  entry_type:           'limit' | 'market'
  entry_price:          number           // proximal or mitigation level
  sl_price:             number           // distal ± ATR buffer
  tp1_price:            number           // First opposing zone
  tp2_price:            number           // Second opposing zone / fallback 3R
  suggested_risk_pct:   number

  // Breakeven
  breakeven_price:      number
  breakeven_triggered:  boolean

  // Lifecycle
  expiry_candles:       number
  time_decay_limit:     number
  zone_invalidated:     boolean

  // Confluence Trace
  htf_aligned:          boolean
  htf_zone_nested:      boolean          // Zone sits inside HTF zone of same type
  fvg_inside:           boolean
  liquidity_swept:      boolean          // Stop hunt confirmed before departure
  departure_candles:    number           // 1–2 = strongest
  session_active:       boolean
  reason:               string[]         // Score trace for UI display
  timestamp:            string           // ISO 8601
}
```

---

## 10. Systems Architecture & Edge Cases

### 10.1. Zone Registry (Persistent Cache)
All active zones are stored in a Redis hash keyed by `sd_zone_registry:{symbol}:{timeframe}`. On every candle close, the engine:
1. Updates `tap_count` on zones that were touched.
2. Marks zones as `INVALIDATED` if price closed through `distal_line`.
3. Expires zones that have exceeded the candle limit without triggering.

### 10.2. Zone Overlap Merge Logic
If two zones of the same type overlap by `> 50%` of their shared range, they are merged into a single higher-confidence "Confluence Zone" with the outer boundaries of both zones. The `departure_speed` of the faster departure is retained.

### 10.3. Top-Down Analysis Cascade
The engine runs on the following TF stack in order, and lower-TF zones can only fire if they align with the current HTF zone map:

```
Monthly → Weekly → Daily → 4H → 1H → 15M → 5M → 1M
```
A 15M zone firing counter to a Daily supply zone is suppressed unless a CHoCH on the Daily confirms a trend change.

### 10.4. Slippage & Commission Model
Zone entries almost always use limit orders. However, fast news-driven events can result in gap fills beyond the proximal line. The engine monitors for "gap fill entries" — cases where price gaps through the proximal line directly to the mitigation level or beyond. In such cases, entry is adjusted to the mitigation level, and SL is recalculated accordingly.

### 10.5. Crash Recovery (Boot Hydration)
Active zone states (tap counts, triggered, managed) are flushed to Redis AOF persistence on every candle. On reboot, the engine re-reads the zone registry, syncs with the broker for open positions, and resumes trailing/management logic immediately without re-scanning historical data.

---
*Generated by Adebowale Segun | TRAXO Internal Systems Reference V1.0*
