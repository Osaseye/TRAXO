<div align="center">
  <img src="./logo.png" alt="TRAXO Logo" width="200" />
  <h1>TRAXO Algorithm Specification: Order Block (V2)</h1>
  <p><b>Author:</b> Adebowale Segun</p>
  <p><b>Date:</b> June 1, 2026</p>
  <p><i>Trade Smart. Execute Precisely.</i></p>
</div>

---

## 1. Executive Summary & Algorithmic Philosophy

The Order Block Algorithm is a Smart Money Concepts (SMC) engine built on the foundational work of Michael Huddleston (ICT) and the Interbank Price Delivery Algorithm (IPDA). It is designed to identify the precise candle zones where institutional traders — central banks, prime brokers, and hedge funds — have executed large-scale accumulation or distribution orders before a significant structural move.

The core philosophical premise: **markets are not random**. They follow a systematic three-phase institutional cycle — Accumulation → Manipulation → Distribution (AMD). Order Blocks are the exact price zones where the Manipulation phase terminates and the Distribution phase begins. Trading Order Blocks means trading *with* the algorithm, not against it.

This engine identifies five distinct OB types — Bullish OB, Bearish OB, Breaker Block, Mitigation Block, and Rejection Block — integrates Smart Money liquidity logic (internal/external pools, stop hunting, premium/discount arrays), and outputs precision-scored trade payloads.

---

## 2. Core Data Structures & Pre-Processing (The Indicators)

All signal detection runs on a normalized, pre-processed baseline. The following metrics must be computed and cached before event processing begins.

### 2.1. Normalization Metric: ATR (Average True Range)
*   **Formula:** Standard 14-period True Range Smoothing.
*   **Purpose:** Every distance check, buffer, zone width filter, and risk calculation is denominated in `ATR(14)` units to ensure the algorithm works correctly across Forex (pip-scale), Stocks (dollar-scale), and Crypto (volatile-scale) simultaneously.

> **Volume Note — Decentralized Market Trap:** In Forex and Crypto, tick volume is exchange-siloed and does not represent true institutional liquidity. `volume > N × VMA(20)` measures volatility, not directional intent. The V1 spec uses VMA as a fallback. **V2 roadmap:** integrate **Cumulative Volume Delta (CVD)** — true institutional distribution shows aggressive market buying (positive Delta) absorbing passive limit orders. When CVD data is available, replace the `volume >= 1.5 × VMA(20)` condition with `CVD_delta > 0` (bullish) or `CVD_delta < 0` (bearish). VMA threshold remains as fallback when CVD is unavailable.

### 2.2. Market Structure State Engine
The algorithm must continuously maintain a rolling market structure object for the active timeframe:

```typescript
interface StructureState {
  bias:           'BULLISH' | 'BEARISH' | 'RANGING'
  last_bos:       SwingPoint | null  // Most recent Break of Structure
  last_choch:     SwingPoint | null  // Most recent Change of Character
  swing_highs:    SwingPoint[]       // Rolling array of confirmed swing highs
  swing_lows:     SwingPoint[]       // Rolling array of confirmed swing lows
  current_phase:  'ACCUMULATION' | 'MANIPULATION' | 'DISTRIBUTION'
}

interface SwingPoint {
  price:     number
  timestamp: number
  type:      'HIGH' | 'LOW'
  swept:     boolean  // Has this swing been swept by a liquidity grab?
}
```

### 2.3. Equilibrium Engine (50% Range Calculator)
The 50% midpoint between any two structural swing points defines the **Equilibrium** — the dividing line between Premium (above) and Discount (below) arrays:

```typescript
function getEquilibrium(highPoint: number, lowPoint: number): number {
  return (highPoint + lowPoint) / 2
}

function getPriceLocation(price: number, high: number, low: number): 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' {
  const eq = getEquilibrium(high, low)
  const buffer = (high - low) * 0.05  // 5% tolerance band at midpoint
  if (price > eq + buffer) return 'PREMIUM'
  if (price < eq - buffer) return 'DISCOUNT'
  return 'EQUILIBRIUM'
}
```

*   **Bullish OBs** carry highest weight when they sit in **DISCOUNT** zones.
*   **Bearish OBs** carry highest weight when they sit in **PREMIUM** zones.
*   OBs sitting at EQUILIBRIUM carry reduced probability.

### 2.4. Liquidity Pool Mapping
Liquidity exists wherever stop-loss orders cluster. The engine maps two tiers:

**Internal Liquidity (within the current range):**
*   Equal Highs (EQH): Two or more swing highs within `0.05 × ATR(14)` of each other.
*   Equal Lows (EQL): Two or more swing lows within `0.05 × ATR(14)` of each other.
*   These are high-probability targets for Manipulation-phase sweeps.

**External Liquidity (beyond major structure):**
*   Buy-Side Liquidity (BSL): Cluster above the most recent confirmed swing high — where short-sellers placed stops.
*   Sell-Side Liquidity (SSL): Cluster below the most recent confirmed swing low — where long holders placed stops.
*   BSL/SSL pools are the *destination* for institutional price delivery after OB taps.

```typescript
interface LiquidityPool {
  type:      'BSL' | 'SSL' | 'EQH' | 'EQL'
  price:     number
  strength:  number   // Count of orders contributing to this pool
  swept:     boolean
}
```

### 2.5. Engine Decomposition Architecture

The complete OB pipeline is split into **four independent sub-engines** plus a risk layer. This separation allows each engine to be developed, unit-tested, and tuned in isolation — and prevents the entire algorithm from becoming an untestable monolith.

| Engine | File | Responsibility |
|--------|------|---------------|
| **StructureEngine** | `structureEngine.ts` | `detectBOS()`, `detectCHoCH()`, `detectSwingPoints()`, `monitorProvisionalBOS()`, `scoreBOSQuality()` |
| **LiquidityEngine** | `liquidityEngine.ts` | `detectEQH()`, `detectEQL()`, `detectBSL()`, `detectSSL()` |
| **DisplacementEngine** | `displacementEngine.ts` | `measureDisplacement()`, `classifyDisplacement()` |
| **FVGEngine** | `fvgEngine.ts` | `detectFVG()`, `gradeFVG()`, `isFVGFilled()`, `detectLiquidityVoid()` |
| **OrderBlockEngine** | `orderBlockEngine.ts` | `detectBullishOB()`, `detectBearishOB()`, `detectBreaker()`, `detectMitigation()`, `detectRejectionBlock()` |
| **RegimeEngine** | `regimeEngine.ts` | `detectMarketRegime()` |
| **OBClusterEngine** | `obClusterEngine.ts` | `detectMTFCluster()`, `scoreCluster()` |
| **KillZoneEngine** | `killZoneEngine.ts` | `isInKillZone()`, `detectJudasSwing()` |
| **ConfluenceEngine** | `confluenceEngine.ts` | `scoreSignal()`, `scoreHTFAlignment()`, `scoreSession()`, `scoreKillZone()`, `scoreNews()`, `scoreEquilibrium()` |
| **RiskEngine** | `riskEngine.ts` | `calculatePositionSize()`, `calculateSL()`, `calculateTPs()`, `calculateBreakeven()` |
| **AnalyticsEngine** | `analyticsEngine.ts` | `logTradeOutcome()`, `queryEdgeByContext()` |

Data flows top to bottom: `StructureEngine` + `LiquidityEngine` feed into `OrderBlockEngine`; all three plus `FVGEngine` feed into `ConfluenceEngine`; `RiskEngine` consumes the final scored signal.

> **All numeric thresholds** (multipliers, tolerances, candle lookback counts) are imported from `strategyConfig.ts` — **never hardcoded inside engine logic.** This makes the algorithm tunable without touching engine code.

```
StrategyConfig
     │
     ├──▶ StructureEngine
     │         │ SwingPoints, BOS/CHoCH
     ├──▶ LiquidityEngine
     │         │ EQH/EQL/BSL/SSL
     │         └───────────────▶ OrderBlockEngine
     │                                  │ OB Zones
     ├──▶ FVGEngine ──────────────────▶ ConfluenceEngine ──▶ ScoredSignal
     │                                                              │
     └──▶ RiskEngine ◀─────────────────────────────────────────────┘
                │
         OrderBlockSignal ──▶ common TradeSignal
```

> **Future marketplace pattern:** Each strategy outputs its own typed signal (`OrderBlockSignal`, `WickRejectionSignal`, `SupplyDemandSignal`) which is transformed into a common `TradeSignal` interface. This is how a multi-strategy marketplace is built.

---

## 3. Phase 1: Context Engine (AMD Cycle & Structure Mapping)

Order Blocks are only valid within a correctly identified AMD context. The Context Engine runs on every closed candle.

### 3.1. Structure Break Detection

**Break of Structure (BOS):**
```python
# BOS Bullish: New high above the last confirmed swing high
IF current_candle.high > last_swing_high.price AND candle.close > last_swing_high.price:
  BOS = BULLISH_CONFIRMED
  structure_bias = BULLISH

# BOS Bearish: New low below the last confirmed swing low
IF current_candle.low < last_swing_low.price AND candle.close < last_swing_low.price:
  BOS = BEARISH_CONFIRMED
  structure_bias = BEARISH
```

**Change of Character (CHoCH):**
A CHoCH is a BOS *against* the prevailing bias — the first structural break in the opposite direction. It signals a potential trend reversal and is the trigger to begin watching for Breaker Blocks.

```python
IF structure_bias == BULLISH AND current_candle.close < last_swing_low.price:
  CHoCH = REVERSAL_SIGNAL
  # Downgrade confidence of any active bullish OBs
  # Begin scanning for Bearish OB / Breaker Block
```

#### 3.1.1. BOS Quality Scoring

A bare close above a swing high is technically a BOS but is often a stop-hunt liquidity grab. **BOS Quality** categorizes each confirmed BOS so the scoring matrix can weight it proportionally.

```python
FUNCTION score_bos_quality(bos_candle, ATR_14):
  displacement = abs(bos_candle.close - bos_candle.open)  # body size only — wicks excluded

  IF displacement > CONFIG.BOS_STRONG_DISPLACEMENT_ATR * ATR_14:
    RETURN BosQuality.STRONG   # +2 to confluence score

  IF displacement > CONFIG.BOS_MEDIUM_DISPLACEMENT_ATR * ATR_14:
    RETURN BosQuality.MEDIUM   # +1 to confluence score

  RETURN BosQuality.WEAK       # +0 — no bonus, no penalty
```

| BOS Quality | Body Displacement | Score Modifier |
|-------------|------------------|----------------|
| **STRONG** | `> 1.2 × ATR(14)` | `+2` |
| **MEDIUM** | `> 0.6 × ATR(14)` | `+1` |
| **WEAK** | `≤ 0.6 × ATR(14)` | `+0` |

> A weak BOS alone cannot produce a PRIME-tier signal. This single filter eliminates an estimated 20–30% of false OBs in ranging conditions and during low-liquidity hours.

#### 3.1.2. Provisional BOS (Intra-Candle Early-Entry Sub-Routine)

Waiting for a candle *close* beyond structure is safe but introduces lag. On 15M or 1H charts, an explosive move can travel 2R–3R before the candle officially closes, making the close-confirmed entry a poor RR trade.

```python
# Fires intra-candle when live price pierces structure by > 0.5 × ATR_14
# Does NOT update the confirmed StructureState — opens a separate "aggressive window"
FUNCTION monitor_provisional_bos(live_price, structure_state):

  bullish_pierce = live_price > last_swing_high.price + (CONFIG.PROVISIONAL_BOS_ATR_THRESHOLD * ATR_14)
  bearish_pierce = live_price < last_swing_low.price  - (CONFIG.PROVISIONAL_BOS_ATR_THRESHOLD * ATR_14)

  IF bullish_pierce AND NOT confirmed_bos:
    EMIT ProvisionalBOS(direction='BULLISH', level=last_swing_high.price)
    # Entry capped at AGGRESSIVE tier regardless of confluence score
    # Position size limited to 30% of normal (partial entry only)

  IF bearish_pierce AND NOT confirmed_bos:
    EMIT ProvisionalBOS(direction='BEARISH', level=last_swing_low.price)
```

**Provisional BOS rules:**
*   Score is capped at `AGGRESSIVE` tier regardless of total confluence score.
*   Only 30% of the intended position is deployed until candle close confirms the BOS.
*   **Auto-cancel:** If the candle closes back *inside* the structure level (trap), the provisional position is immediately stopped at the structure level. This is the stop-hunt trap — expected at low frequency.
*   On close confirmation, the remaining 70% position may be added at the OTE zone on the next retest.

### 3.2. AMD Phase Detection

> **Config Note:** All threshold multipliers in this section are injected from `strategyConfig.ts`. The values shown are calibrated defaults — they will require per-instrument tuning. Move them to config before writing engine code.

```python
function detectAMDPhase(candles[], structure_state):

  # All thresholds sourced from strategyConfig.ts — never hardcode
  # CONFIG.AMD_ACCUMULATION_RANGE_MULTIPLIER  default: 1.5  (tune per instrument)
  # CONFIG.AMD_MANIPULATION_PROXIMITY_ATR     default: 0.15 (tune per instrument)
  # CONFIG.AMD_NO_BOS_LOOKBACK                default: 20   (candles)
  # CONFIG.AMD_DISTRIBUTION_VOLUME_MULTIPLIER default: 1.5  (1.5x VMA fallback; CVD preferred)

  # ACCUMULATION: Price oscillating in tight range, no clear BOS
  if range_width < CONFIG.AMD_ACCUMULATION_RANGE_MULTIPLIER * ATR(14) AND no_bos_in_last_N_candles(CONFIG.AMD_NO_BOS_LOOKBACK):
    return 'ACCUMULATION'
    # Mark equal highs and equal lows forming — liquidity is building

  # MANIPULATION: Price spikes beyond equal highs/lows with immediate reversal
  if abs(candle.high - EQH.price) <= CONFIG.AMD_MANIPULATION_PROXIMITY_ATR * ATR(14) AND candle.close < EQH.price:
    return 'MANIPULATION'  # Stop hunt confirmed — sweep of BSL without close above
  if abs(candle.low - EQL.price) <= CONFIG.AMD_MANIPULATION_PROXIMITY_ATR * ATR(14) AND candle.close > EQL.price:
    return 'MANIPULATION'  # Stop hunt confirmed — sweep of SSL without close below

  # DISTRIBUTION: Strong directional BOS after manipulation
  # V1 fallback: VMA multiplier | V2 preferred: CVD delta direction
  volume_confirmed = CVD_delta > 0 IF cvd_available ELSE volume > CONFIG.AMD_DISTRIBUTION_VOLUME_MULTIPLIER * VMA(20)
  if BOS_confirmed AND volume_confirmed:
    return 'DISTRIBUTION'
```

### 3.3. Fair Value Gap (FVG) Detection
FVGs are 3-candle imbalances that accompany valid Order Blocks. The V1 spec accepted any gap — institutions only care about **meaningful** imbalances. A minimum size gate and grade system are now enforced.

```python
# Bullish FVG: C1 high does not overlap C3 low
IF candle[i+2].low > candle[i].high:
  fvg_size = candle[i+2].low - candle[i].high

  IF fvg_size < CONFIG.FVG_MIN_SIZE_ATR * ATR_14:
    CONTINUE  # Discard noise-level gap

  fvg = {
    type:         'BULLISH',
    top:          candle[i+2].low,
    bottom:       candle[i].high,
    size_atr:     fvg_size / ATR_14,
    grade:        grade_fvg(fvg_size, ATR_14),
    candle_index: i+1
  }

# Bearish FVG: C1 low does not overlap C3 high
IF candle[i+2].high < candle[i].low:
  fvg_size = candle[i].low - candle[i+2].high

  IF fvg_size < CONFIG.FVG_MIN_SIZE_ATR * ATR_14:
    CONTINUE

  fvg = {
    type:         'BEARISH',
    top:          candle[i].low,
    bottom:       candle[i+2].high,
    size_atr:     fvg_size / ATR_14,
    grade:        grade_fvg(fvg_size, ATR_14),
    candle_index: i+1
  }

FUNCTION grade_fvg(size, ATR_14):
  IF size >= CONFIG.FVG_INSTITUTIONAL_ATR * ATR_14: return 'INSTITUTIONAL'  # +3
  IF size >= CONFIG.FVG_NORMAL_ATR        * ATR_14: return 'NORMAL'         # +2
  return 'MICRO'                                                             # +1
```

**FVG Grade → Score Contribution:**

| Grade | Size Threshold | Confluence Bonus |
|-------|---------------|------------------|
| `INSTITUTIONAL` | `≥ 1.0 × ATR(14)` | `+3` |
| `NORMAL` | `≥ 0.25 × ATR(14)` | `+2` |
| `MICRO` | `≥ 0.1 × ATR(14)` (min) | `+1` |

> `CONFIG.FVG_MIN_SIZE_ATR = 0.1` is the minimum gate. Institutional FVGs (`≥ 1.0 × ATR`) represent the strongest imbalance signal and are rare — treat them as high-priority confluence.

### 3.4. Displacement Engine

ICT Order Blocks without displacement are weak. **Displacement** is the violent, directional move that follows a liquidity sweep — the evidence that institutions stepped in with size. Without it, the OB is just a random candle near a swing level.

```python
FUNCTION measure_displacement(candles[], impulse_idx, ATR_14):
  c          = candles[impulse_idx]
  body_size  = abs(c.close - c.open)
  wick_ratio = body_size / (c.high - c.low)  # Body dominance (1.0 = full body, 0.5 = half wick)
  size_atr   = body_size / ATR_14

  # Count consecutive same-direction candles following the impulse
  consecutive = 1
  FOR j in range(impulse_idx + 1, min(impulse_idx + 5, len(candles))):
    IF same_direction(candles[j], c): consecutive += 1
    ELSE: BREAK

  RETURN Displacement(
    direction:       'BULLISH' IF c.close > c.open ELSE 'BEARISH',
    size_atr:        size_atr,
    body_dominance:  wick_ratio,
    consecutive:     consecutive,
    quality:         classify_displacement(size_atr, wick_ratio)
  )

FUNCTION classify_displacement(size_atr, body_dominance):
  IF size_atr >= CONFIG.DISPLACEMENT_STRONG_ATR AND body_dominance >= 0.7:
    return 'STRONG'   # +3
  IF size_atr >= CONFIG.DISPLACEMENT_MEDIUM_ATR AND body_dominance >= 0.5:
    return 'MEDIUM'   # +2
  return 'WEAK'       # +0
```

**Displacement Quality → Score Contribution:**

| Quality | Criteria | Confluence Bonus |
|---------|----------|------------------|
| `STRONG` | `size ≥ 1.5 × ATR` AND `body dominance ≥ 70%` | `+3` |
| `MEDIUM` | `size ≥ 0.8 × ATR` AND `body dominance ≥ 50%` | `+2` |
| `WEAK` | Below medium thresholds | `+0` |

> Most institutional traders consider displacement quality **more important** than the OB itself. A Bullish OB with strong displacement at a swept SSL in the NY Kill Zone is the highest-probability setup in this system.

### 3.5. Liquidity Void Detection

A Liquidity Void is a chain of consecutive non-overlapping candles — stacked FVGs. Price explodes through this zone leaving no mechanism for institutions to exit, creating an irresistible pull for price to return and fill the void.

```python
FUNCTION detect_liquidity_void(candles[], start_idx, direction, ATR_14):
  void_candles = [candles[start_idx]]

  FOR j in range(start_idx + 1, start_idx + 10):
    IF j >= len(candles): BREAK
    prev = candles[j-1]
    curr = candles[j]

    # No-overlap check between consecutive candles
    IF direction == 'BULLISH' AND curr.low > prev.high:
      void_candles.append(curr)
    ELIF direction == 'BEARISH' AND curr.high < prev.low:
      void_candles.append(curr)
    ELSE:
      BREAK  # First overlap terminates the void

  IF len(void_candles) < CONFIG.LIQUIDITY_VOID_MIN_CANDLES:  # Default: 3
    RETURN NULL

  total_gap = sum(gap between consecutive void candles)

  RETURN LiquidityVoid(
    depth_atr:      total_gap / ATR_14,
    length_candles: len(void_candles),
    direction:      direction
  )  # +2 bonus applied in ConfluenceEngine when OB impulse creates a void
```

> **Score bonus:** `+2` when the OB impulse creates or is immediately adjacent to a Liquidity Void. Applied inside `ConfluenceEngine.scoreSignal()`.

---

## 4. Phase 2: Live Event Processing — OB Identification & Classification

On every closed candle, the engine executes the OB scan. Five distinct OB types are detected.

### 4.1. The Four-Condition Validation Framework (C1–C4)

All four conditions must be satisfied simultaneously for a high-probability OB:

| Condition | Name | Pseudocode Check |
|-----------|------|-----------------|
| **C1** | Body & Wick Engulf | `impulse.low <= OB_candle.low AND impulse.high >= OB_candle.high` |
| **C2** | Market Structure Shift | `BOS or CHoCH confirmed in impulse direction` |
| **C3** | Imbalance Created | `FVG exists between OB_candle and post-impulse candle` |
| **C4** | Structural Origin | `OB formed at or near a swept swing high/low (liquidity grab point)` |

### 4.2. Bullish Order Block Detection

```python
FUNCTION detect_bullish_ob(candles[], structure_state):
  IF structure_state.bias != 'BULLISH': return NULL

  FOR i in range(len(candles) - 4):
    IF candles[i].close < candles[i].open:  # Bearish/red candle
      impulse = candles[i+1]
      
      # C1: Engulf check
      IF NOT (impulse.low <= candles[i].low AND impulse.high >= candles[i].high):
        CONTINUE
      
      # C2: BOS check — impulse closes above previous swing high
      IF NOT impulse.close > structure_state.last_swing_high.price:
        CONTINUE
      
      # C3: FVG check
      IF NOT has_fvg(candles[i], candles[i+1], candles[i+2]):
        CONTINUE
      
      # C4: Structural origin — was there a liquidity sweep nearby?
      ssl_proximity = abs(candles[i].low - nearest_ssl.price) <= 0.3 * ATR_14
      
      ob_zone = {
        type:       'BULLISH_OB',
        open:       candles[i].open,
        close:      candles[i].close,
        high:       candles[i].high,
        low:        candles[i].low,
        equilibrium: (candles[i].open + candles[i].close) / 2,  # OTE level
        formed_at:  candles[i].timestamp,
        tapped:     False,
        invalidated: False,
        structural_origin: ssl_proximity,
        fvg:        adjacent_fvg
      }
      RETURN ob_zone
```

### 4.3. Bearish Order Block Detection
Mirror of bullish: last **bullish (green)** candle before a bearish impulse that creates a bearish BOS. Zone defined by Open (top) and Close (bottom) of the bullish candle.

### 4.4. Breaker Block Detection
A Breaker Block is a **failed** Order Block — the most powerful reversal signal in the OB family.

```python
FUNCTION detect_breaker_block(ob_zone, candles[]):
  # A previously valid OB that price has now closed THROUGH
  FOR recent_candle in candles:
    IF ob_zone.type == 'BULLISH_OB':
      IF recent_candle.close < ob_zone.low:  # Price closed through OB low
        # Confirm CHoCH in same candle sequence
        IF CHoCH_confirmed:
          ob_zone.type = 'BEARISH_BREAKER'   # Flip polarity
          ob_zone.new_resistance_zone = { top: ob_zone.high, bottom: ob_zone.low }
          RETURN ob_zone  # Now trades as resistance/short setup on retest
    
    IF ob_zone.type == 'BEARISH_OB':
      IF recent_candle.close > ob_zone.high:
        IF CHoCH_confirmed:
          ob_zone.type = 'BULLISH_BREAKER'   # Flip polarity
          RETURN ob_zone  # Now trades as support/long setup on retest
```

### 4.5. Mitigation Block Detection
An OB that has been **tapped once** but not invalidated. The engine marks the first touch timestamp and reduces quality score by 2 points. The zone continues to be monitored for a second approach.

### 4.6. Rejection Block Detection
A Rejection Block forms at the tip of a long wick at a swing high or low — typically after a stop hunt sweep:

```python
# Wick overshoot cap is MARKET-ADAPTIVE — sourced from strategyConfig.ts
# A fixed 0.2 × ATR cap would filter out the most valid stop-hunt sweeps in crypto,
# where liquidation cascades routinely push wicks 1.0–2.0 × ATR beyond swing levels.
#
# CONFIG.REJECTION_BLOCK_MAX_OVERSHOOT_ATR defaults:
#   FOREX   → 0.5   (pips are small, overshoots are tight)
#   STOCKS  → 1.0   (moderate gap/spread-driven overshoots)
#   CRYPTO  → 2.5   (liquidation cascades — no hard cap in practice)
#   FUTURES → 2.0

overshoot      = candle.high - EQH.price
max_overshoot  = CONFIG.REJECTION_BLOCK_MAX_OVERSHOOT_ATR[asset_type] * ATR_14
wick_body_size = candle.high - max(candle.open, candle.close)

IF candle.high > EQH.price AND overshoot <= max_overshoot:
  IF wick_body_size > CONFIG.REJECTION_BLOCK_MIN_WICK_ATR * ATR_14:  # Default 1.5
    IF candle.close < EQH.price:  # Closed back below the swept level
      rejection_block = {
        type:          'REJECTION_BLOCK',
        price:         EQH.price,
        wick_tip:      candle.high,
        overshoot_atr: overshoot / ATR_14,  # Logged for post-trade analytics
        direction:     'BEARISH'
      }
```

---

## 5. Phase 3: The Validation Middlewares

Passing OB candidates are routed through three interceptors.

### 5.1. Asset-Type Override Engine

*   **STOCKS:** Hard block 09:30–10:00 AM EST (opening volatility creates false OBs). Earnings block within 24h.
*   **CRYPTO:** OTE entry at 50% of OB zone required (no aggressive entries). Volume threshold elevated to `>= 2.0x VMA(20)`. Rejection Block max overshoot cap raised to `2.5 × ATR` (liquidation cascades).
*   **FOREX:** Session filter applied per the upgraded weighting below. OBs forming in the Asian session carry a `-1` structural penalty due to low institutional participation.

**Session Scoring Weights (all asset types):**

| Session | UTC Window | Score Modifier | Rationale |
|---------|-----------|---------------|----------|
| London Open | 07:00–09:00 | `+2` | Major institutional flow begins |
| NY Open | 12:00–14:00 | `+2` | Second major institutional session |
| London/NY Overlap | 12:00–16:00 | `+3` | Highest institutional volume of the day |
| Asia | 00:00–07:00 | `-1` | Low liquidity, thin spreads, manipulation-prone |
| Off-session | All other | `0` | Neutral |

> These weights supersede the previous flat `+1 London or NY` entry. The overlap bonus is the strongest positive session modifier in the scoring matrix.

### 5.2. Premium/Discount Filter (Equilibrium Block)
```python
htf_high = last_htf_swing_high.price
htf_low  = last_htf_swing_low.price
eq = getEquilibrium(htf_high, htf_low)

IF ob_zone.type == 'BULLISH_OB' AND ob_zone.equilibrium > eq:
  score -= 2  # Bullish OB in premium — institutional buyers wouldn't accumulate here
  reason.append("OB in premium zone — discount preferred for longs")

IF ob_zone.type == 'BEARISH_OB' AND ob_zone.equilibrium < eq:
  score -= 2  # Bearish OB in discount — institutional sellers wouldn't distribute here
  reason.append("OB in discount zone — premium preferred for shorts")
```

### 5.3. Dynamic HTF Anchoring

| Signal Timeframe | HTF Reference |
|-----------------|---------------|
| `1m / 3m / 5m`  | 1-Hour bias   |
| `15m / 30m`     | 4-Hour bias   |
| `1H / 4H`       | Daily bias    |
| `Daily`         | Weekly bias   |

HTF bias (Bullish/Bearish/Neutral) is cached by a background worker every candle period. Counter-HTF OBs receive a `-2` penalty. HTF-aligned OBs receive a `+2` bonus.

### 5.4. Macro-Economic News Defense

Not all news is equal. NFP and FOMC can distort price delivery for hours, not minutes. A flat 30-minute block is insufficient for critical events.

```typescript
enum NewsSeverity {
  CRITICAL = 'CRITICAL',  // NFP, FOMC, CPI, PCE, BOE Rate, ECB Rate
  HIGH     = 'HIGH',      // ADP, ISM, PPI, Retail Sales, GDP
  MEDIUM   = 'MEDIUM',    // PMI, Consumer Confidence, Building Permits
}
```

| Severity | Block Window | Score Penalty |
|----------|-------------|---------------|
| `CRITICAL` | 2h before event, 1h after event | `-3` (hard kill) |
| `HIGH` | 30 min before, 30 min after | `-3` (hard kill) |
| `MEDIUM` | 15 min before, 15 min after | `-2` |

*   Midnight cron fetches 48h of events and classifies them by severity.
*   CRITICAL events include: NFP, FOMC rate decisions, CPI, PCE, BOE/ECB/BOJ rate decisions.
*   Reason logged: `"-3 News: [Event Name] ([Severity]) in [N] min"`.
*   **Post-event volatility guard:** For CRITICAL events, a `+1` bonus is applied 2–4 hours *after* the event when structural clarity returns — institutions re-establish positions then.

### 5.5. Market Regime Engine

OB systems are specifically designed for trending/expanding markets. In ranging conditions they generate excessive false setups. This is the most dangerous edge case — instruments can range for weeks.

```python
FUNCTION detect_market_regime(candles[], ATR_14):

  # ADX proxy: measure structure progression
  recent_highs_ascending = all swing highs are higher than previous (last N swings)
  recent_lows_ascending  = all swing lows are higher than previous (last N swings)
  atr_expanding          = ATR_14 > SMA(ATR_14, 10)  # Current ATR above its average

  IF recent_highs_ascending AND recent_lows_ascending AND atr_expanding:
    RETURN 'TRENDING'

  IF NOT recent_highs_ascending AND NOT recent_lows_ascending:
    range_width = max(highs) - min(lows)  # Last 30 candles
    IF range_width < CONFIG.AMD_ACCUMULATION_RANGE_MULTIPLIER * ATR_14:
      RETURN 'RANGING'  # -2 score penalty

  IF atr_expanding AND (recent_highs_ascending OR recent_lows_ascending):
    RETURN 'EXPANDING'

  RETURN 'CONTRACTING'
```

**Regime → Score Modifier:**

| Regime | Modifier | Rationale |
|--------|----------|----------|
| `TRENDING` | `+0` | Neutral — baseline expected condition |
| `EXPANDING` | `+1` | ATR expanding — institutional activity increasing |
| `RANGING` | `-2` | OBs have high failure rate in ranges |
| `CONTRACTING` | `-1` | ATR compressing — low-conviction moves |

### 5.6. Multi-Timeframe OB Cluster Engine

Institutional setups occur when Order Blocks across multiple timeframes align at the same price level. A 15m OB sitting inside a 4H OB sitting inside a Daily OB is one of the highest-probability entries in SMC.

```python
FUNCTION detect_mtf_cluster(symbol, base_tf_ob, all_tf_obs):
  cluster = [base_tf_ob]

  FOR htf_ob in all_tf_obs:
    IF htf_ob.timeframe == base_tf_ob.timeframe: CONTINUE

    # Check if the higher-TF OB zone overlaps with the base OB
    overlap = (
      htf_ob.low <= base_tf_ob.high AND
      htf_ob.high >= base_tf_ob.low
    )

    IF overlap AND htf_ob.timeframe > base_tf_ob.timeframe:
      cluster.append(htf_ob)

  RETURN OBCluster(
    count:            len(cluster),
    highest_timeframe: max(ob.timeframe for ob in cluster),
    zone_overlap:     intersection of all cluster zones
  )
```

**Cluster Score:**

| Aligned Timeframes | Score Bonus | Example |
|--------------------|------------|--------|
| 1 (base TF only) | `+0` | 15m OB alone |
| 2 TFs aligned | `+2` | 15m OB inside 4H OB |
| 3+ TFs aligned | `+4` | 15m inside 4H inside Daily |

> 3-TF alignment is one of the rarest and highest-conviction setups in the system. Combined with strong displacement and kill zone timing, a 3-TF cluster is typically a PRIME signal.

### 5.7. Kill Zone Engine

Not every London or NY candle carries equal institutional weight. ICT specifically identified narrow windows — **Kill Zones** — within which the Judas Swing manipulation occurs before institutional price delivery begins.

```python
FUNCTION is_in_kill_zone(utc_timestamp):
  hour = utc_timestamp.hour
  minute = utc_timestamp.minute
  time  = hour + (minute / 60)

  IF 7.0 <= time <= 10.0: return KillZone.LONDON   # London Kill Zone: 07:00-10:00 UTC
  IF 12.0 <= time <= 15.0: return KillZone.NY       # NY Kill Zone: 12:00-15:00 UTC
  RETURN NULL

FUNCTION detect_judas_swing(candles[], kill_zone, structure_state):
  # Judas Swing = false move against true direction at kill zone open
  # London KZ: first 30-60 min often sweeps Asian range before true direction
  # NY KZ: first 30-60 min often sweeps London range before true direction
  ...
```

**Kill Zone → Score Bonus:** `+2` when OB forms or price reaches OB during an active Kill Zone window. This stacks with the broader session bonus.

---

## 6. Phase 4: Confidence Scoring Matrix

### 6.1. Score Normalization

The raw score can theoretically exceed any fixed maximum as new confluence factors are added. Rather than hardcoding a cap (e.g. 16) that becomes outdated, scores are **normalized to a 0–100% confidence percentage:**

```typescript
export const MAX_POSSIBLE_SCORE = 32  // Sum of all additive factors at theoretical max
export const SCORE_CAP = MAX_POSSIBLE_SCORE  // Subtractive factors can still reduce to 0

const rawScore       = additive_total - subtractive_total
const clampedScore   = Math.max(0, rawScore)
const confidence_pct = Math.min(100, Math.round((clampedScore / MAX_POSSIBLE_SCORE) * 100))
```

**Tier thresholds are now based on `confidence_pct`:**

| Tier | `confidence_pct` | Risk % |
|------|-----------------|--------|
| `PRIME` | `≥ 75%` | `1.5%` |
| `STANDARD` | `≥ 55%` | `1.0%` |
| `AGGRESSIVE` | `≥ 40%` | `0.5%` |
| `DISCARD` | `< 40%` | Signal terminated |

### 6.2. The Point Matrix

**Additive (Confluence):**
*   `+3`: Fresh OB — first approach, zero taps
*   `+3`: HTF structural origin (C4 — formed at swept liquidity pool)
*   `+3`: Strong displacement (impulse `≥ 1.5 × ATR`, body dominance `≥ 70%`)
*   `+3`: Institutional FVG adjacent to OB (`≥ 1.0 × ATR`)
*   `+4`: 3+ timeframe OB cluster alignment
*   `+2`: All four conditions C1–C4 satisfied
*   `+2`: HTF trend alignment confirmed
*   `+2`: Medium displacement (impulse `≥ 0.8 × ATR`, body dominance `≥ 50%`)
*   `+2`: Normal FVG adjacent to OB (`≥ 0.25 × ATR`)
*   `+2`: Liquidity Void created by OB impulse
*   `+2`: Volume expansion `≥ 1.5× VMA(20)` **or** positive CVD delta
*   `+2`: Strong BOS (displacement `> 1.2 × ATR`)
*   `+2`: 2 timeframe OB cluster alignment
*   `+1`: OB in correct premium/discount zone
*   `+1`: AMD manipulation phase confirmed (stop hunt sweep before OB)
*   `+1`: Medium BOS (displacement `> 0.6 × ATR`)
*   `+1`: Micro FVG adjacent to OB (`≥ 0.1 × ATR`)
*   `+1`: EXPANDING market regime

**Session & Kill Zone (stackable — independent scorers):**
*   `+3`: London/NY Overlap active (12:00–16:00 UTC)
*   `+2`: London Open only (07:00–09:00 UTC) or NY Open only (12:00–14:00 UTC)
*   `+2`: Active Kill Zone (London 07:00–10:00 or NY 12:00–15:00 UTC)

**Freshness Decay:**
*   `0 taps` = `+3` (included in additive above)
*   `1 tap` = `+0`
*   `2 taps` = `-2`
*   `3+ taps` = **Auto-discard before scoring**

**Subtractive (Guillotines):**
*   `-3`: CRITICAL news event in block window (NFP/FOMC — hard kill)
*   `-3`: HIGH news event in block window (hard kill)
*   `-2`: MEDIUM news event in block window
*   `-2`: RANGING market regime
*   `-2`: Counter HTF trend (no CHoCH confirmation)
*   `-2`: OB in wrong premium/discount zone
*   `-1`: CONTRACTING market regime
*   `-1`: Volume below average (or negative CVD delta)
*   `-1`: Asia session (00:00–07:00 UTC)

### 6.3. Tier Output Mapping

*   `PRIME` **(`confidence_pct ≥ 75%`):** Risk `1.5%`. All systems green.
*   `STANDARD` **(`confidence_pct ≥ 55%`):** Risk `1.0%`. Proceed with standard sizing.
*   `AGGRESSIVE` **(`confidence_pct ≥ 40%`):** Risk `0.5%`. Red flag shown in UI.
*   `DISCARD` **(`confidence_pct < 40%`):** Terminated. Never reaches UI.

---

## 7. Phase 5: Dynamic Risk Sizing & Circuit Breakers

### 7.1. Global Circuit Breakers
*   **Daily Kill Switch:** `Rolling_Drawdown >= 4.0%` → `NO_TRADE`. Locks until 00:00 UTC.
*   **Streak Mitigation:** `Consecutive_Losses >= 3` → Risk multiplier `0.5x` until PnL positive.

### 7.2. Position Sizing & Split Entry Payload

Order Blocks form during Manipulation — a period of extreme spread widening and thin liquidity. The most explosive setups often wick the **50% equilibrium of the OB** and reverse immediately, before a deep OTE limit order can be filled. To capture both scenarios, entries are split:

**Two-Tier Entry:**

| Tier | Entry Level | Position Fraction | Type |
|------|------------|------------------|---------|
| Proximal (aggressive) | OB candle `Open` — first touch of zone | 30% | Limit |
| OTE (conservative) | 61.8%–78.6% Fibonacci retracement of OB range | 70% | Limit |

```python
# Proximal line — OB candle open (first touch of zone)
entry_proximal = ob_zone.open  # For bullish OB: bottom of candle body

# OTE band
ote_low  = ob_zone.high - 0.786 * (ob_zone.high - ob_zone.low)
ote_high = ob_zone.high - 0.618 * (ob_zone.high - ob_zone.low)

# Position split
qty_proximal = total_quantity * 0.30  # 30% filled at proximal line
qty_ote      = total_quantity * 0.70  # 70% filled deeper in OTE zone

# Risk distance calculated from BLENDED average entry for SL sizing
blended_entry    = (entry_proximal * 0.30) + (ote_midpoint * 0.70)
Risk_Distance    = abs(blended_entry - Stop_Loss_Price)
Dollar_Risk      = Account_Balance × Risk_Pct
total_quantity   = Dollar_Risk / Risk_Distance
```

**Partial Fill Handling:** If only the proximal tier fills (OTE never reached — setup reversed from 50% equilibrium), the 30% position carries its own SL at the full OB wick low. The un-filled OTE order is automatically cancelled when the OB is invalidated or the proximal position hits SL.

---

## 8. Phase 6: Trade Lifecycle & State Management

### 8.1. Stop Loss Placement
SL is placed **beyond the full wick** of the OB candle (not just the body), with an ATR buffer:
*   **Bullish OB:** `SL = ob_zone.low - (0.15 * ATR_14)` — beyond the wick low with spread + slippage buffer
*   **Bearish OB:** `SL = ob_zone.high + (0.15 * ATR_14)` — beyond the wick high
*   **Invalidation Rule:** If price closes (not wicks) through the full OB candle wick, zone is permanently invalidated, any pending orders cancelled.

### 8.2. Take Profit Geometry (Liquidity Targeting)
TPs are placed at the next institutional liquidity pool — not arbitrary RR levels:

```python
# R = abs(Entry - SL)
tp1 = next_internal_liquidity_pool   # First swing high/FVG above (longs)
tp2 = next_external_bsl_pool         # BSL pool above major structure (longs)
tp3 = runner_to_htf_target           # Major HTF equal high / PDH / yearly high

# Fallback if liquidity pools not detected:
tp1 = entry + (1.5 * R)
tp2 = entry + (2.5 * R)
tp3 = trailing runner
```

### 8.3. Break-Even Logic
*   **Trigger:** Price moves `1.0 × R` in favor.
*   **Action:** SL auto-locked to entry price `± tolerance_buffer`.
*   **Tolerance Buffer** (prevents commission-induced losses at breakeven):
```typescript
const commission_cost = calculateCommission(entry_price, quantity, broker_settings)
const slippage_buffer = 0.1 * ATR_14
const tolerance = (commission_cost / quantity) + slippage_buffer
breakeven_price = entry_price + tolerance  // for longs
```

### 8.4. Partial Scale-Out Protocol
*   At **TP1** (first liquidity pool): Close 50% of position. SL auto-moves to break-even.
*   At **TP2** (major BSL/SSL pool): Close 30% of position.
*   **Remaining 20%**: Trail stop behind new structural swing points. Runner captures extended distribution.

### 8.5. OB Invalidation State Machine
```
PENDING_TAP → TAPPED → MANAGED → CLOSED
                    ↓
              INVALIDATED (price closes through full wick)
              EXPIRED (N candles without tap — default 50 candles per HTF)
```

### 8.6. Time-Decay Exit
If trade has been open `>= N` candles (configurable per timeframe) with PnL near `$0`:
*   **Action:** Force exit at breakeven (with tolerance buffer from §8.3).

---

## 9. Developer Output Schema

```typescript
export interface OrderBlockSignal {
  id:                   string
  strategy_id:          'order_block'
  signal:               'BUY' | 'SELL' | 'NO_TRADE'
  symbol:               string
  asset_type:           'STOCKS' | 'CRYPTO' | 'FOREX' | 'FUTURES' | 'COMMODITY'

  // OB Classification
  ob_type:              'BULLISH_OB' | 'BEARISH_OB' | 'BREAKER_BLOCK' | 'MITIGATION_BLOCK' | 'REJECTION_BLOCK'
  ob_zone_high:         number
  ob_zone_low:          number
  ob_equilibrium:       number           // 50% of zone — OTE starting reference
  ote_entry_low:        number           // 61.8% Fib retracement of zone
  ote_entry_high:       number           // 78.6% Fib retracement of zone
  price_location:       'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'

  // Score & UI
  score:                number           // raw score
  confidence_pct:       number           // normalized (score / MAX_POSSIBLE_SCORE) * 100
  tier:                 'prime' | 'standard' | 'aggressive' | 'discard'

  // BOS & Displacement
  bos_quality:          'STRONG' | 'MEDIUM' | 'WEAK'
  displacement_quality: 'STRONG' | 'MEDIUM' | 'WEAK'
  displacement_size_atr: number

  // FVG & Void
  fvg_confluence:       boolean
  fvg_grade:            'INSTITUTIONAL' | 'NORMAL' | 'MICRO' | null
  liquidity_void:       boolean

  // Execution Levels
  entry_type:           'limit' | 'market'
  entry_price:          number           // OTE midpoint for limit, proximal for market
  sl_price:             number           // ATR-buffered beyond full OB wick
  tp1_price:            number           // First internal liquidity pool / 1.5R fallback
  tp2_price:            number           // External BSL/SSL pool / 2.5R fallback
  tp3_trailing:         boolean          // Runner active on remaining 20%

  // Breakeven
  breakeven_price:      number           // Entry + commission/slippage tolerance
  breakeven_triggered:  boolean

  // Lifecycle
  ob_fresh:             boolean          // Has this OB been tapped before?
  ob_tap_count:         number
  expiry_candles:       number           // Cancel if not tapped within N candles
  time_decay_limit:     number           // Force BE exit after N candles in trade
  suggested_risk_pct:   number

  // Confluence Trace
  amd_phase:            'ACCUMULATION' | 'MANIPULATION' | 'DISTRIBUTION'
  bos_confirmed:        boolean
  choch_confirmed:      boolean
  liquidity_sweep:      boolean          // Stop hunt (SSL/BSL swept before OB formed)
  market_regime:        'TRENDING' | 'RANGING' | 'EXPANDING' | 'CONTRACTING'
  ob_cluster_count:     number           // How many TFs have aligned OBs
  ob_cluster_htf:       string | null    // Highest aligned TF e.g. '1D'
  kill_zone_active:     boolean
  kill_zone:            'LONDON' | 'NY' | null
  htf_aligned:          boolean
  session_active:       boolean
  reason:               string[]         // e.g., ["+3 Institutional FVG", "-2 Ranging regime"]
  timestamp:            string           // ISO 8601
}
```

---

## 10. Systems Architecture & Edge Cases

### 10.1. OB Registry (Persistent Zone Cache)
Active OBs are stored in a Redis hash keyed by `ob_registry:{symbol}:{timeframe}`. Each entry includes a `last_evaluated` timestamp, `tap_count`, and `invalidated` flag. The registry is pruned on every candle: invalidated or expired OBs are removed, ensuring the live event loop only touches active zones.

### 10.2. Breaker Block Flip Detection (Race Condition Guard)
When an OB is invalidated and flipped to a Breaker Block, the engine must atomically:
1. Mark old OB as `INVALIDATED`
2. Create new Breaker Block entry
3. Discard any pending limit orders at the original OB
4. Set new entry zone at the Breaker's retest level

A mutex lock prevents double-processing of the same candle sequence during this flip event.

### 10.3. Multi-OB Confluence (Stacked Zones)
If a Bullish OB's zone overlaps with an HTF FVG or a Supply/Demand zone within `0.2 × ATR(14)`, they are merged into a single "Confluence Zone" with a `+2` bonus to the base score. This is the highest-probability single entry setup in the strategy.

### 10.4. Trailing Stop Synthetic Orders (API Rate Defense)
Post-breakeven, the trailing logic on the TP3 runner is maintained locally. On each websocket tick, the engine checks if the price has retraced to the trailing threshold. Only a single `Market Close` API call is sent to the broker — no `modify_order` spam.

---

## 11. Configuration Reference (`strategyConfig.ts`)

All tunable thresholds are exported from `src/lib/algorithms/strategyConfig.ts`. Engine code **imports from this file only** — no hardcoded numbers in engine logic.

```typescript
// AMD Phase Detection
export const AMD_ACCUMULATION_RANGE_MULTIPLIER   = 1.5   // range_width < N × ATR triggers ACCUMULATION
export const AMD_MANIPULATION_PROXIMITY_ATR      = 0.15  // Max distance from EQH/EQL for stop hunt
export const AMD_NO_BOS_LOOKBACK                 = 20    // Candles with no BOS = ACCUMULATION
export const AMD_DISTRIBUTION_VOLUME_MULTIPLIER  = 1.5   // VMA fallback multiplier

// Provisional BOS
export const PROVISIONAL_BOS_ATR_THRESHOLD       = 0.5   // Price pierce > N × ATR triggers provisional

// Structure
export const SWING_LOOKBACK                      = 5     // N-candle swing high/low lookback
export const EQ_TOLERANCE_PCT                    = 0.05  // 5% tolerance band at equilibrium midpoint
export const EQH_EQL_PROXIMITY_ATR               = 0.05  // Max distance for equal highs/lows
export const C4_SSL_PROXIMITY_ATR                = 0.3   // OB proximity to swept swing for C4

// Rejection Block (per asset type)
export const REJECTION_BLOCK_MIN_WICK_ATR        = 1.5   // Min wick size above body
export const REJECTION_BLOCK_MAX_OVERSHOOT_ATR: Record<AssetType, number> = {
  FOREX:     0.5,
  STOCKS:    1.0,
  CRYPTO:    2.5,
  FUTURES:   2.0,
  COMMODITY: 1.5,
}

// Scoring
export const HTF_ALIGNMENT_BONUS                 = 2
export const HTF_COUNTER_PENALTY                 = -2
export const NEWS_KILL_PENALTY                   = -3
export const NEWS_KILL_WINDOW_MINUTES            = 30
export const WRONG_ZONE_PENALTY                  = -2
export const VOLUME_BELOW_AVERAGE_PENALTY        = -1

// OB Lifecycle
export const OB_EXPIRY_CANDLES_DEFAULT           = 50    // Cancel if not tapped in N candles
export const OB_MAX_TAP_COUNT                    = 2     // Discard at 3+ taps
export const TIME_DECAY_CANDLES                  = 30    // Force BE exit after N candles near $0

// Risk
export const DAILY_DRAWDOWN_KILL_PCT             = 4.0   // % drawdown triggers daily kill switch
export const STREAK_MITIGATION_LOSSES            = 3     // Consecutive losses → 0.5× risk
export const SL_ATR_BUFFER                       = 0.15  // Beyond wick low/high
export const BREAKEVEN_SLIPPAGE_ATR              = 0.1   // Slippage buffer at breakeven
export const PARTIAL_EXIT_TP1_PCT                = 0.50  // Close 50% at TP1
export const PARTIAL_EXIT_TP2_PCT                = 0.30  // Close 30% at TP2

// Entry Split
export const ENTRY_PROXIMAL_FRACTION             = 0.30  // 30% at proximal line
export const ENTRY_OTE_FRACTION                  = 0.70  // 70% at OTE zone
export const OTE_LOW_FIB                         = 0.786 // Deeper OTE limit
export const OTE_HIGH_FIB                        = 0.618 // Shallow OTE limit
```

---

## 12. Analytics Engine

Not for signal generation — for **optimization**. Every executed trade produces a data record that feeds a growing edge database. Over time, the system discovers which confluence combinations actually win and which produce false positives on specific instruments.

### 12.1. Trade Outcome Record

```typescript
export interface TradeOutcomeRecord {
  // Signal metadata
  signal_id:          string
  symbol:             string
  asset_type:         AssetType
  timeframe:          string
  timestamp_signal:   string     // When signal fired
  timestamp_entry:    string     // When position opened
  timestamp_exit:     string     // When position closed

  // Signal context (snapshot at signal time)
  ob_type:            string
  bos_quality:        'STRONG' | 'MEDIUM' | 'WEAK'
  displacement_quality: 'STRONG' | 'MEDIUM' | 'WEAK'
  fvg_grade:          'INSTITUTIONAL' | 'NORMAL' | 'MICRO' | null
  liquidity_void:     boolean
  market_regime:      string
  session:            string
  kill_zone:          string | null
  ob_cluster_count:   number
  htf_aligned:        boolean
  amd_phase:          string
  confidence_pct:     number
  tier:               string
  score:              number

  // Outcome
  outcome:            'WIN' | 'LOSS' | 'BREAKEVEN'
  pnl_r:              number     // Result in R multiples (e.g. 2.3 = 2.3R win)
  exit_reason:        'TP1' | 'TP2' | 'TP3' | 'SL' | 'BREAKEVEN' | 'TIME_DECAY' | 'MANUAL'
  max_favorable_r:    number     // Best R reached before exit
  max_adverse_r:      number     // Worst drawdown before recovery
}
```

### 12.2. Edge Query Examples

Once sufficient records accumulate, the `AnalyticsEngine` can answer queries like:

```typescript
// Which OB types perform best on GBPUSD during London Kill Zone?
queryEdgeByContext({ symbol: 'GBPUSD', kill_zone: 'LONDON', min_records: 50 })
// → { win_rate: 0.74, avg_r: 1.8, best_ob_type: 'BREAKER_BLOCK', best_score_min: 22 }

// What score threshold actually predicts PRIME outcomes on BTCUSD?
queryScoreThreshold({ symbol: 'BTCUSD', target_win_rate: 0.70 })
// → { recommended_min_score: 26, actual_win_rate: 0.72 at that threshold }
```

These discoveries become **instrument-specific score multipliers** in a future config version — the algorithm tunes itself.

### 12.3. Storage

*   Records stored in `IndexedDB` (client) or a lightweight backend table.
*   Minimum 100 records per `(symbol, timeframe)` pair before edge queries are considered statistically significant.
*   Never used to override real-time signal logic — analytics inform config tuning only.

---

## 13. Liquidity Sweep Quality Scoring

### 13.1. Problem

The current sweep detection treats all sweeps as binary: price takes EQH/EQL and closes back inside. Not all sweeps are equal. A 2.0 ATR sweep that reverses immediately is structurally far stronger than a 0.2 ATR drift that barely touches the level.

### 13.2. `LiquiditySweep` Interface

```typescript
interface LiquiditySweep {
  // How far price penetrated beyond the swept level (in ATR units)
  depth_atr: number

  // How many candles the sweep leg consumed before reversal
  duration_candles: number

  // Number of equal highs/lows (EQH/EQL clusters) taken in the sweep
  liquidity_taken: number

  // Composite quality classification
  sweep_quality: 'WEAK' | 'MEDIUM' | 'STRONG'
}
```

### 13.3. Scoring Model

| Factor | Weight | Notes |
|---|---|---|
| Sweep depth (ATR) | High | Deeper sweeps attract more trapped liquidity |
| Equal highs/lows taken | High | Multiple EQH/EQL swept = stronger pool cleared |
| Immediate rejection speed | High | Fast reversal = institutional absorption present |
| Displacement size after sweep | Very High | Large displacement = commitment from smart money |

### 13.4. Classification Thresholds

```
STRONG  → depth_atr ≥ 1.0  AND  displacement ≥ 1.5 ATR  AND  reversal within 3 candles
MEDIUM  → depth_atr ≥ 0.5  OR   displacement ≥ 0.75 ATR
WEAK    → everything else
```

Only `STRONG` and `MEDIUM` sweeps qualify as C3 (Manipulation) confirmation. `WEAK` sweeps require an additional confluence to proceed. A `WEAK` sweep with no displacement applies a score penalty of `−2`.

---

## 14. Order Flow Confirmation Layer

### 14.1. Motivation

Volume > 1.5× VMA captures elevated activity but not *directionality*. Many OBs form under elevated volume. Few form with genuine institutional absorption. That is where the real edge lives.

### 14.2. `OrderFlowEngine` Interface

```typescript
interface OrderFlowSnapshot {
  cvd_delta: number            // Cumulative Volume Delta at candle close
  delta: number                // Single-candle buy volume minus sell volume
  bid_ask_imbalance: number    // Ratio: (bid_vol - ask_vol) / total_vol  (−1 to +1)
  iceberg_detected: boolean    // Large hidden order absorbing flow
  absorption_confirmed: boolean
  exhaustion_confirmed: boolean
  delta_divergence: boolean    // Price makes new extreme but delta does not
}

class OrderFlowEngine {
  /** Large passive limit orders absorbing market orders against the move */
  detectAbsorption(candles: Candle[], ob: OrderBlock): boolean

  /** Aggressive side losing momentum — volume present but delta collapsing */
  detectExhaustion(candles: Candle[], ob: OrderBlock): boolean

  /** Price extends but CVD diverges — institutional distribution/accumulation */
  detectDeltaDivergence(candles: Candle[], lookback: number): boolean

  /** Repeated prints at same price with size inconsistent with visible book depth */
  detectIcebergOrders(candles: Candle[], priceLevel: number): boolean
}
```

### 14.3. Score Modifiers

| Condition | Score Modifier |
|---|---|
| Absorption confirmed at OB | +3 |
| Delta divergence at sweep | +2 |
| Iceberg detected near OB | +2 |
| Exhaustion on retest | +1 |
| CVD contradicts direction | −2 |

### 14.4. Fallback

When tick/delta data is unavailable (REST-only feeds), the engine falls back to V1 volume comparison (`volume > VMA × multiplier`) and applies no positive order flow bonus — it simply does not penalise.

---

## 15. OB Strength Decay Curve

### 15.1. Problem

The current tap-count table is too binary:

```
0 taps → +3
1 tap  →  0
2 taps → −2
3 taps → discard
```

An OB that is 30 days old should not carry the same base strength as one that formed 2 candles ago. Time is a decay dimension just like tap count.

### 15.2. Composite Decay Formula

```
strength = base_strength × time_decay × tap_decay × distance_decay
```

#### `time_decay`

```
time_decay = max(0.2,  1 − (age_candles / OB_EXPIRY_CANDLES_DEFAULT))
```

OB is 50% decayed at half its expiry window. Floor of 0.2 ensures it never fully drops to zero before the expiry candle count is reached.

#### `tap_decay`

```typescript
const TAP_DECAY: Record<number, number> = {
  0: 1.0,   // fresh
  1: 0.7,   // one tap
  2: 0.4,   // two taps — significantly weakened
  // 3+ → discard before scoring
}
```

#### `distance_decay`

```
distance_decay = max(0.5,  1 − (price_distance_atr / 5.0))
```

OBs far from current price have reduced relevance; price needs to travel further to reach them, increasing time and volatility exposure.

### 15.3. Net Score Contribution

The decay-adjusted OB freshness score replaces the flat `OB_FRESHNESS_SCORES` table:

```
freshness_score = round(3 × tap_decay × time_decay)
```

This is capped to a maximum of `+3` (fresh, recent OB) and a minimum of `0` (tap_decay or time_decay has compressed it fully).

---

## 16. Liquidity Target Probability Model

### 16.1. Problem

The current take-profit model selects the nearest BSL/SSL. Some liquidity pools are structurally more significant and more likely to be targeted.

### 16.2. `LiquidityTarget` Interface

```typescript
interface LiquidityTarget {
  price_level: number
  type: 'BSL' | 'SSL' | 'EQH' | 'EQL' | 'HTF_HIGH' | 'HTF_LOW' | 'SWING_HIGH' | 'SWING_LOW'
  touch_count: number         // Times price approached without breaking
  eqh_eql_count: number       // Number of clustered equal levels at this pool
  htf_significant: boolean    // Pool also visible on HTF (4H / Daily)
  age_candles: number         // How long the pool has been forming
  probability: number         // 0.0 – 1.0 composite probability score
}
```

### 16.3. Probability Scoring

```
probability =
  (touch_count_score × 0.30) +
  (eqh_eql_score     × 0.25) +
  (htf_significance  × 0.25) +
  (age_score         × 0.20)
```

| Factor | Score |
|---|---|
| `touch_count` ≥ 3 | 1.0 |
| `touch_count` = 2 | 0.6 |
| `touch_count` = 1 | 0.3 |
| `eqh_eql_count` ≥ 3 | 1.0 |
| `eqh_eql_count` = 2 | 0.6 |
| `htf_significant` = true | 1.0 |
| `age_candles` ≥ 50 | 1.0 (mature pool) |

### 16.4. TP Selection Logic

```
TP1 = LiquidityTarget with highest probability score
TP2 = next highest probability target beyond TP1
```

This replaces the previous "nearest pool" heuristic. A nearby pool with `probability = 0.3` is skipped in favour of a slightly farther pool at `probability = 0.8`.

---

## 17. Narrative Engine

### 17.1. Purpose

Signals without context are noise. The Narrative Engine constructs a human-readable trade rationale from the structured detection results — so TRAXO can explain *why* a signal was issued, not just *that* it was issued.

### 17.2. `TradeNarrative` Interface

```typescript
interface TradeNarrative {
  // Ordered list of observed market events leading to the signal
  events: string[]

  // Single synthesised sentence the UI can display
  summary: string

  // Confidence label derived from tier + narrative completeness
  confidence: 'HIGH' | 'MODERATE' | 'SPECULATIVE'
}
```

### 17.3. Example Output

```json
{
  "events": [
    "SSL swept below 1.0820 equal lows (STRONG sweep, 1.4 ATR depth)",
    "Bullish CHoCH confirmed on 15m with strong displacement candle",
    "Institutional FVG formed between 1.0831 – 1.0844",
    "15m Order Block aligns with 4H Order Block at 1.0828",
    "Delta divergence detected at sweep low",
    "London Kill Zone active (07:23 UTC)"
  ],
  "summary": "Institutions swept sell-side liquidity below equal lows, reversed with strong displacement, and returned price into a fresh bullish order block supported by 4H confluence and order flow absorption.",
  "confidence": "HIGH"
}
```

### 17.4. Event Generation Rules

| Detection Result | Narrative Fragment |
|---|---|
| SSL/BSL swept | `"SSL/BSL swept below/above {level} ({sweep_quality} sweep, {depth_atr} ATR depth)"` |
| CHoCH confirmed | `"Bullish/Bearish CHoCH confirmed on {timeframe} with {displacement size} displacement"` |
| FVG formed | `"Institutional FVG formed between {low} – {high}"` |
| MTF alignment | `"{lower_tf} OB aligns with {higher_tf} OB at {price}"` |
| Order flow signal | `"Delta divergence / Absorption / Iceberg detected at {location}"` |
| Kill zone active | `"{session} Kill Zone active ({utc_time} UTC)"` |
| HTF trend | `"HTF trend is {BULLISH/BEARISH} — trade is {WITH/COUNTER} trend"` |

### 17.5. Confidence Mapping

```
HIGH        → PRIME tier  + sweep_quality STRONG  + at least one order flow signal
MODERATE    → STANDARD tier  OR  sweep_quality MEDIUM
SPECULATIVE → AGGRESSIVE tier  OR  sweep_quality WEAK
```

The narrative `confidence` field is displayed in the UI signal card alongside tier and score.

---

*Generated by Adebowale Segun | TRAXO Internal Systems Reference V2.0*
