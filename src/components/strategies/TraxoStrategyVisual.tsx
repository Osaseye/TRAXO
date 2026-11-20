import type { TraxoCatalogStrategyId } from '@/lib/traxoStrategies';

export interface TraxoStrategyVisualProps {
  strategyId: string;
  annotated?: boolean;
  className?: string;
}

interface CandleSpec {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  w?: number;
}

const BULL = '#34D399';
const BEAR = '#F87171';

function Candles({ items, barWidth = 10 }: { items: CandleSpec[]; barWidth?: number }) {
  return (
    <g>
      {items.map((item, idx) => {
        const isBull = item.c <= item.o; // SVG y grows downward (lower y = higher price)
        const color = isBull ? BULL : BEAR;
        const w = item.w ?? barWidth;
        const top = Math.min(item.o, item.c);
        const height = Math.max(4, Math.abs(item.c - item.o));
        const cx = item.x + w / 2;

        return (
          <g key={idx}>
            <line x1={cx} y1={item.h} x2={cx} y2={item.l} stroke={color} strokeWidth="1.5" />
            <rect x={item.x} y={top} width={w} height={height} rx="1" fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function Annotation({
  x,
  y,
  text,
  color = '#A1A1AA',
  anchor = 'start',
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontSize="11"
      fontFamily="Plus Jakarta Sans, sans-serif"
      fontWeight="600"
      textAnchor={anchor}
      letterSpacing="0.03em"
    >
      {text}
    </text>
  );
}

function renderStrategyScene(strategyId: string, annotated: boolean) {
  switch (strategyId as TraxoCatalogStrategyId | string) {
    case 'traxo-london-apex':
      return (
        <>
          {/* Asian Session Consolidation Box */}
          <rect x="44" y="156" width="236" height="84" fill="rgba(255,255,255,0.04)" stroke="#27272A" strokeWidth="1" />
          <line x1="44" y1="156" x2="600" y2="156" stroke="#52525B" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="44" y1="240" x2="600" y2="240" stroke="#3F3F46" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              { x: 58, o: 206, h: 186, l: 222, c: 192 },
              { x: 80, o: 192, h: 174, l: 214, c: 204 },
              { x: 102, o: 204, h: 180, l: 226, c: 186 },
              { x: 124, o: 186, h: 168, l: 218, c: 212 },
              { x: 146, o: 212, h: 184, l: 230, c: 194 },
              { x: 168, o: 194, h: 172, l: 212, c: 202 },
              { x: 190, o: 202, h: 178, l: 224, c: 184 },
              { x: 212, o: 184, h: 164, l: 206, c: 198 },
              { x: 234, o: 198, h: 174, l: 220, c: 188 },
              { x: 256, o: 188, h: 166, l: 210, c: 194 },
              // London Open Judas Swing fakeout sweeping above 156, closing back inside
              { x: 288, o: 192, h: 150, l: 200, c: 158 },
              { x: 312, o: 158, h: 92, l: 186, c: 176 },
              // Reversal drop through Asian range
              { x: 336, o: 176, h: 168, l: 218, c: 210 },
              { x: 360, o: 210, h: 198, l: 246, c: 234 },
              { x: 384, o: 234, h: 220, l: 274, c: 264 },
              { x: 408, o: 264, h: 252, l: 298, c: 288 },
              { x: 432, o: 288, h: 266, l: 296, c: 274 },
              { x: 456, o: 274, h: 268, l: 318, c: 310 },
              { x: 480, o: 310, h: 296, l: 336, c: 326 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={54} y={144} text="ASIAN RANGE (00:00–06:00 UTC)" color="#71717A" />
              <Annotation x={326} y={84} text="LONDON JUDAS SWEEP" color={BEAR} />
              <Annotation x={476} y={252} text="OPPOSITE LIQUIDITY TARGET" color={BULL} anchor="end" />
            </>
          )}
        </>
      );

    case 'traxo-tokyo-yield':
      return (
        <>
          <line x1="414" y1="36" x2="414" y2="324" stroke="#71717A" strokeWidth="1.2" strokeDasharray="4 4" />
          <line x1="60" y1="278" x2="580" y2="278" stroke="#27272A" strokeWidth="1" strokeDasharray="3 4" />
          <Candles
            items={[
              { x: 64, o: 276, h: 264, l: 290, c: 272 },
              { x: 88, o: 272, h: 258, l: 284, c: 264 },
              { x: 112, o: 264, h: 256, l: 276, c: 270 },
              { x: 136, o: 270, h: 248, l: 276, c: 252 },
              { x: 160, o: 252, h: 236, l: 262, c: 240 },
              { x: 184, o: 240, h: 224, l: 248, c: 230 },
              { x: 208, o: 230, h: 218, l: 242, c: 236 },
              { x: 232, o: 236, h: 210, l: 240, c: 214 },
              { x: 256, o: 214, h: 190, l: 222, c: 196 },
              { x: 280, o: 196, h: 174, l: 206, c: 180 },
              { x: 304, o: 180, h: 154, l: 188, c: 160 },
              { x: 328, o: 160, h: 138, l: 170, c: 146 },
              { x: 352, o: 146, h: 120, l: 152, c: 126 },
              { x: 376, o: 126, h: 98, l: 132, c: 106 },
              // Post-09:55 JST inventory squaring
              { x: 408, o: 106, h: 88, l: 124, c: 118 },
              { x: 432, o: 118, h: 112, l: 150, c: 142 },
              { x: 456, o: 142, h: 134, l: 170, c: 162 },
              { x: 480, o: 162, h: 144, l: 174, c: 150 },
              { x: 504, o: 150, h: 136, l: 168, c: 156 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={70} y={220} text="GOTOBI USD/JPY FIX BUYING" color={BULL} />
              <Annotation x={422} y={54} text="09:55 JST FIX (00:55 UTC)" color="#FAFAFA" />
            </>
          )}
        </>
      );

    case 'traxo-sovereign-fix':
      return (
        <>
          <line x1="40" y1="138" x2="600" y2="138" stroke="#A1A1AA" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1="336" y1="36" x2="336" y2="324" stroke="#52525B" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              { x: 58, o: 142, h: 126, l: 154, c: 134 },
              { x: 82, o: 134, h: 124, l: 148, c: 142 },
              { x: 106, o: 142, h: 130, l: 156, c: 136 },
              { x: 130, o: 136, h: 128, l: 152, c: 146 },
              // Pre-fix 15:00-16:00 stretch away from equilibrium
              { x: 162, o: 146, h: 140, l: 176, c: 170 },
              { x: 186, o: 170, h: 164, l: 202, c: 196 },
              { x: 210, o: 196, h: 188, l: 230, c: 224 },
              { x: 234, o: 224, h: 216, l: 256, c: 248 },
              { x: 258, o: 248, h: 240, l: 282, c: 274 },
              { x: 282, o: 274, h: 266, l: 304, c: 294 },
              // 16:00 UTC Fix extreme & snapback
              { x: 326, o: 294, h: 264, l: 324, c: 270 },
              { x: 354, o: 270, h: 234, l: 276, c: 240 },
              { x: 378, o: 240, h: 204, l: 246, c: 210 },
              { x: 402, o: 210, h: 174, l: 218, c: 182 },
              { x: 426, o: 182, h: 146, l: 190, c: 152 },
              { x: 450, o: 152, h: 128, l: 160, c: 138 },
              { x: 474, o: 138, h: 122, l: 150, c: 134 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={56} y={124} text="PRE-FIX EQUILIBRIUM (VWAP)" color="#A1A1AA" />
              <Annotation x={346} y={54} text="16:00 UTC WMR FIX" color="#FAFAFA" />
              <Annotation x={402} y={292} text="SNAPBACK REBALANCE" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-barrier-grid':
      return (
        <>
          <line x1="40" y1="104" x2="600" y2="104" stroke="#71717A" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1="40" y1="252" x2="600" y2="252" stroke="#A1A1AA" strokeWidth="1.2" strokeDasharray="5 4" />
          <Candles
            items={[
              { x: 64, o: 112, h: 98, l: 136, c: 130 },
              { x: 88, o: 130, h: 122, l: 156, c: 148 },
              { x: 112, o: 148, h: 140, l: 178, c: 170 },
              { x: 136, o: 170, h: 156, l: 188, c: 162 },
              { x: 160, o: 162, h: 154, l: 202, c: 194 },
              { x: 184, o: 194, h: 186, l: 226, c: 218 },
              { x: 208, o: 218, h: 210, l: 244, c: 238 },
              // Barrier sweep pinbar at .00 / .50 line (252)
              { x: 236, o: 238, h: 214, l: 298, c: 222 },
              // Bullish rebound toward upper barrier
              { x: 266, o: 222, h: 194, l: 230, c: 200 },
              { x: 290, o: 200, h: 172, l: 208, c: 178 },
              { x: 314, o: 178, h: 164, l: 190, c: 184 },
              { x: 338, o: 184, h: 148, l: 190, c: 154 },
              { x: 362, o: 154, h: 124, l: 160, c: 130 },
              { x: 386, o: 130, h: 102, l: 138, c: 110 },
              { x: 410, o: 110, h: 98, l: 124, c: 116 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={56} y={92} text=".50 / NEXT INSTITUTIONAL HANDLE" color="#71717A" />
              <Annotation x={56} y={242} text=".00 FIGURE BARRIER" color="#FAFAFA" />
              <Annotation x={254} y={310} text="WICK SWEEP & RECLAIM" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-macro-vector':
      return (
        <>
          <path d="M 30 298 Q 310 264 610 198" fill="none" stroke="#52525B" strokeWidth="1.4" strokeDasharray="5 4" />
          <path d="M 30 270 Q 300 220 610 132" fill="none" stroke="#A1A1AA" strokeWidth="1.5" />
          <path d="M 30 242 Q 290 182 610 86" fill="none" stroke="#FAFAFA" strokeWidth="1.6" />
          <Candles
            items={[
              { x: 56, o: 236, h: 214, l: 244, c: 220 },
              { x: 80, o: 220, h: 196, l: 228, c: 204 },
              { x: 104, o: 204, h: 182, l: 212, c: 188 },
              { x: 128, o: 188, h: 164, l: 196, c: 170 },
              { x: 152, o: 170, h: 152, l: 180, c: 158 },
              // Pullback into EMA 21/50 pocket
              { x: 180, o: 158, h: 150, l: 182, c: 174 },
              { x: 204, o: 174, h: 168, l: 200, c: 192 },
              { x: 228, o: 192, h: 182, l: 216, c: 206 },
              // M15 resumption candle
              { x: 256, o: 204, h: 166, l: 212, c: 172 },
              { x: 280, o: 172, h: 142, l: 180, c: 148 },
              { x: 304, o: 148, h: 120, l: 156, c: 126 },
              { x: 328, o: 126, h: 100, l: 136, c: 108 },
              { x: 352, o: 108, h: 86, l: 118, c: 92 },
              { x: 376, o: 92, h: 68, l: 100, c: 74 },
              { x: 400, o: 74, h: 52, l: 84, c: 60 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={515} y={76} text="EMA 21" color="#FAFAFA" />
              <Annotation x={515} y={122} text="EMA 50" color="#A1A1AA" />
              <Annotation x={515} y={190} text="EMA 200" color="#71717A" />
              <Annotation x={215} y={236} text="EMA 21/50 PULLBACK ENTRY" color={BULL} anchor="middle" />
            </>
          )}
        </>
      );

    case 'traxo-aurum-sweep':
      return (
        <>
          <rect x="44" y="128" width="218" height="92" fill="rgba(255,255,255,0.04)" stroke="#27272A" strokeWidth="1" />
          <line x1="44" y1="128" x2="600" y2="128" stroke="#52525B" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="44" y1="220" x2="600" y2="220" stroke="#3F3F46" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              { x: 58, o: 174, h: 148, l: 194, c: 162 },
              { x: 82, o: 162, h: 140, l: 186, c: 178 },
              { x: 106, o: 178, h: 152, l: 204, c: 164 },
              { x: 130, o: 164, h: 136, l: 196, c: 188 },
              { x: 154, o: 188, h: 162, l: 212, c: 172 },
              { x: 178, o: 172, h: 146, l: 198, c: 184 },
              { x: 202, o: 184, h: 160, l: 210, c: 176 },
              { x: 226, o: 176, h: 158, l: 204, c: 194 },
              // Liquidity grab below Asian low (220)
              { x: 266, o: 196, h: 190, l: 294, c: 262 },
              // M15 Displacement back inside range (>= 2.5 RR)
              { x: 296, o: 260, h: 182, l: 270, c: 190 },
              { x: 326, o: 190, h: 154, l: 198, c: 162 },
              { x: 356, o: 162, h: 122, l: 170, c: 130 },
              { x: 386, o: 130, h: 92, l: 138, c: 100 },
              { x: 416, o: 100, h: 66, l: 108, c: 76 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={52} y={118} text="ASIAN GOLD LIQUIDITY TARGET" color="#71717A" />
              <Annotation x={274} y={310} text="SSL SWEEP PURGE" color={BEAR} />
              <Annotation x={346} y={214} text="M15 DISPLACEMENT (>= 2.5R)" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-bullion-strike':
      return (
        <>
          <line x1="40" y1="214" x2="600" y2="214" stroke="#A1A1AA" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1="40" y1="306" x2="600" y2="306" stroke="#F87171" strokeWidth="1" strokeDasharray="3 5" opacity="0.65" />
          <Candles
            items={[
              { x: 60, o: 132, h: 118, l: 152, c: 144 },
              { x: 86, o: 144, h: 134, l: 170, c: 162 },
              { x: 112, o: 162, h: 150, l: 186, c: 178 },
              { x: 138, o: 178, h: 166, l: 202, c: 192 },
              { x: 164, o: 192, h: 184, l: 212, c: 204 },
              // Aggressive $50 Strike pinbar piercing 214, stopping well above 1.35x ATR SL buffer
              { x: 202, o: 204, h: 176, l: 274, c: 184, w: 12 },
              // Bullish reaction above strike
              { x: 236, o: 184, h: 152, l: 192, c: 160 },
              { x: 262, o: 160, h: 132, l: 170, c: 140 },
              { x: 288, o: 140, h: 112, l: 150, c: 120 },
              { x: 314, o: 120, h: 108, l: 138, c: 128 },
              { x: 340, o: 128, h: 92, l: 136, c: 98 },
              { x: 366, o: 98, h: 66, l: 108, c: 74 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={56} y={204} text="$50 / $10 INSTITUTIONAL STRIKE" color="#FAFAFA" />
              <Annotation x={56} y={324} text="MANDATORY 1.35x ATR GOLD SL BUFFER" color={BEAR} />
            </>
          )}
        </>
      );

    case 'traxo-ny-bullet':
      return (
        <>
          <line x1="44" y1="254" x2="210" y2="254" stroke="#52525B" strokeWidth="1" strokeDasharray="3 4" />
          {/* FVG Imbalance Zone between candle i-1 high (212) and candle i+1 low (154) */}
          <rect x="206" y="156" width="320" height="52" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.35)" strokeWidth="1" />
          <Candles
            items={[
              { x: 64, o: 222, h: 206, l: 254, c: 236 },
              { x: 90, o: 236, h: 214, l: 244, c: 220 },
              { x: 116, o: 220, h: 208, l: 246, c: 238 },
              // Liquidity Sweep below 254
              { x: 148, o: 238, h: 228, l: 286, c: 260 },
              // FVG Leg 1 (high = 208)
              { x: 180, o: 260, h: 208, l: 268, c: 216 },
              // Displacement candle forming FVG
              { x: 208, o: 216, h: 136, l: 222, c: 142, w: 12 },
              // FVG Leg 3 (low = 156)
              { x: 238, o: 142, h: 118, l: 156, c: 126 },
              // Retrace into FVG midpoint
              { x: 270, o: 126, h: 122, l: 160, c: 152 },
              { x: 296, o: 152, h: 146, l: 188, c: 180 },
              { x: 324, o: 180, h: 140, l: 186, c: 148 },
              // Expansion higher
              { x: 356, o: 148, h: 110, l: 154, c: 118 },
              { x: 384, o: 118, h: 82, l: 126, c: 90 },
              { x: 412, o: 90, h: 58, l: 98, c: 66 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={60} y={272} text="PRIOR SSL SWEEP" color={BEAR} />
              <Annotation x={436} y={185} text="M15 SILVER BULLET FVG RETEST" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-aurum-fix':
      return (
        <>
          {/* Central VWAP & +/-2 Sigma curves */}
          <path d="M 36 226 Q 320 220 604 206" fill="none" stroke="#FAFAFA" strokeWidth="1.5" />
          <path d="M 36 144 Q 320 138 604 126" fill="none" stroke="#71717A" strokeWidth="1.1" strokeDasharray="5 4" />
          <path d="M 36 308 Q 320 302 604 288" fill="none" stroke="#52525B" strokeWidth="1.1" strokeDasharray="5 4" />
          <line x1="352" y1="32" x2="352" y2="328" stroke="#3F3F46" strokeWidth="1" strokeDasharray="3 4" />
          <Candles
            items={[
              { x: 56, o: 230, h: 212, l: 244, c: 218 },
              { x: 82, o: 218, h: 206, l: 234, c: 226 },
              { x: 108, o: 226, h: 204, l: 236, c: 210 },
              { x: 134, o: 210, h: 186, l: 218, c: 194 },
              { x: 160, o: 194, h: 164, l: 202, c: 170 },
              { x: 186, o: 170, h: 136, l: 178, c: 142 },
              // Stretch > +2.0 sigma
              { x: 220, o: 142, h: 98, l: 148, c: 104 },
              { x: 256, o: 104, h: 66, l: 112, c: 82 },
              // 15:00 UTC LBMA PM Fix snapback
              { x: 296, o: 82, h: 56, l: 118, c: 110 },
              { x: 344, o: 110, h: 102, l: 158, c: 148 },
              { x: 378, o: 148, h: 140, l: 188, c: 180 },
              { x: 408, o: 180, h: 172, l: 216, c: 206 },
              { x: 438, o: 206, h: 192, l: 224, c: 212 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={46} y={134} text="+2.0σ VWAP BAND" color="#71717A" />
              <Annotation x={46} y={216} text="SESSION VWAP MEAN" color="#FAFAFA" />
              <Annotation x={364} y={54} text="15:00 UTC PM FIX" color={BEAR} />
            </>
          )}
        </>
      );

    case 'traxo-kinetic-nr7':
      return (
        <>
          <rect x="272" y="168" width="38" height="44" fill="rgba(255,255,255,0.05)" stroke="#71717A" strokeWidth="1" />
          <Candles
            items={[
              { x: 64, o: 230, h: 110, l: 280, c: 160, w: 12 },
              { x: 100, o: 160, h: 124, l: 262, c: 218, w: 12 },
              { x: 136, o: 218, h: 140, l: 248, c: 168, w: 12 },
              { x: 172, o: 168, h: 148, l: 232, c: 208, w: 12 },
              { x: 208, o: 208, h: 158, l: 224, c: 178, w: 12 },
              { x: 244, o: 178, h: 164, l: 218, c: 198, w: 12 },
              // Tiny Day 7 NR7 + Inside Bar compression
              { x: 285, o: 194, h: 176, l: 204, c: 184, w: 12 },
              // Explosive NR7 breakout
              { x: 334, o: 184, h: 112, l: 190, c: 120, w: 14 },
              { x: 374, o: 120, h: 64, l: 128, c: 74, w: 14 },
              { x: 414, o: 74, h: 36, l: 84, c: 46, w: 14 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={291} y={156} text="NR7 COIL" color="#FAFAFA" anchor="middle" />
              <Annotation x={436} y={76} text="ATR VOLATILITY EXPANSION" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-globex-sweep':
      return (
        <>
          <line x1="40" y1="126" x2="600" y2="126" stroke="#71717A" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1="40" y1="264" x2="600" y2="264" stroke="#52525B" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1="306" y1="36" x2="306" y2="324" stroke="#52525B" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              { x: 58, o: 212, h: 184, l: 244, c: 196 },
              { x: 86, o: 196, h: 162, l: 224, c: 178 },
              { x: 114, o: 178, h: 148, l: 210, c: 198 },
              { x: 142, o: 198, h: 160, l: 234, c: 170 },
              { x: 170, o: 170, h: 136, l: 204, c: 148 },
              { x: 198, o: 148, h: 130, l: 196, c: 186 },
              { x: 226, o: 186, h: 150, l: 214, c: 162 },
              { x: 254, o: 162, h: 140, l: 192, c: 152 },
              // 09:30 ET Cash Open Sweep above ONH (126) closing back inside
              { x: 300, o: 150, h: 72, l: 170, c: 162, w: 12 },
              { x: 332, o: 162, h: 152, l: 214, c: 204 },
              { x: 360, o: 204, h: 194, l: 248, c: 238 },
              { x: 388, o: 238, h: 222, l: 278, c: 268 },
              { x: 416, o: 268, h: 254, l: 304, c: 294 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={50} y={116} text="OVERNIGHT HIGH (ONH)" color="#A1A1AA" />
              <Annotation x={50} y={282} text="OVERNIGHT LOW (ONL)" color="#71717A" />
              <Annotation x={318} y={64} text="09:30 ET ONH SWEEP + RVOL" color={BEAR} />
            </>
          )}
        </>
      );

    case 'traxo-velocity-orb':
      return (
        <>
          <rect x="76" y="176" width="112" height="96" fill="rgba(255,255,255,0.05)" stroke="#3F3F46" strokeWidth="1" />
          <line x1="76" y1="224" x2="360" y2="224" stroke="#F87171" strokeWidth="1.1" strokeDasharray="4 4" />
          <line x1="76" y1="176" x2="580" y2="176" stroke="#71717A" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              { x: 88, o: 246, h: 212, l: 268, c: 226 },
              { x: 112, o: 226, h: 194, l: 242, c: 204 },
              { x: 136, o: 204, h: 178, l: 230, c: 190 },
              { x: 160, o: 190, h: 176, l: 220, c: 180 },
              // High RVOL 5m ORB breakout
              { x: 196, o: 180, h: 140, l: 188, c: 148, w: 12 },
              { x: 224, o: 148, h: 112, l: 158, c: 120, w: 12 },
              { x: 252, o: 120, h: 90, l: 130, c: 98, w: 12 },
              { x: 280, o: 98, h: 86, l: 116, c: 108, w: 12 },
              { x: 308, o: 108, h: 66, l: 116, c: 74, w: 12 },
              { x: 336, o: 74, h: 42, l: 84, c: 50, w: 12 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={80} y={166} text="5M ORB (09:30–09:35 ET)" color="#FAFAFA" />
              <Annotation x={212} y={240} text="50% ORB MIDPOINT SL" color={BEAR} />
              <Annotation x={364} y={76} text="RVOL >= 1.5x EXPANSION" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-initial-balance':
      return (
        <>
          <rect x="46" y="182" width="194" height="106" fill="rgba(255,255,255,0.04)" stroke="#27272A" strokeWidth="1" />
          <line x1="46" y1="182" x2="600" y2="182" stroke="#A1A1AA" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1="46" y1="288" x2="600" y2="288" stroke="#3F3F46" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              { x: 60, o: 254, h: 224, l: 280, c: 236 },
              { x: 86, o: 236, h: 204, l: 252, c: 214 },
              { x: 112, o: 214, h: 186, l: 234, c: 222 },
              { x: 138, o: 222, h: 192, l: 246, c: 202 },
              { x: 164, o: 202, h: 184, l: 228, c: 196 },
              { x: 190, o: 196, h: 182, l: 220, c: 190 },
              // Clean breakout above IB High (182)
              { x: 226, o: 190, h: 140, l: 196, c: 148 },
              { x: 254, o: 148, h: 120, l: 156, c: 128 },
              // First pullback touching broken IB High
              { x: 282, o: 128, h: 122, l: 158, c: 150 },
              { x: 310, o: 150, h: 144, l: 184, c: 168 },
              // Continuation trend leg
              { x: 342, o: 168, h: 126, l: 174, c: 132 },
              { x: 370, o: 132, h: 98, l: 140, c: 106 },
              { x: 398, o: 106, h: 72, l: 114, c: 80 },
              { x: 426, o: 80, h: 48, l: 88, c: 56 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={56} y={172} text="INITIAL BALANCE HIGH (09:30–10:30 ET)" color="#A1A1AA" />
              <Annotation x={324} y={208} text="FIRST IB RETEST" color={BULL} anchor="middle" />
            </>
          )}
        </>
      );

    case 'traxo-mean-equilibrium':
      return (
        <>
          <line x1="36" y1="146" x2="604" y2="146" stroke="#FAFAFA" strokeWidth="1.5" />
          <line x1="36" y1="74" x2="604" y2="74" stroke="#52525B" strokeWidth="1.1" strokeDasharray="5 4" />
          <line x1="36" y1="218" x2="604" y2="218" stroke="#71717A" strokeWidth="1.2" strokeDasharray="5 4" />
          <Candles
            items={[
              { x: 64, o: 152, h: 134, l: 164, c: 142 },
              { x: 90, o: 142, h: 132, l: 160, c: 154 },
              { x: 116, o: 154, h: 144, l: 178, c: 170 },
              { x: 142, o: 170, h: 162, l: 204, c: 196 },
              { x: 168, o: 196, h: 188, l: 230, c: 224 },
              // > 2.0 sigma downside extreme with exhaustion wick
              { x: 198, o: 224, h: 214, l: 298, c: 242, w: 12 },
              // Steady mean-reversion back to VWAP
              { x: 232, o: 242, h: 210, l: 250, c: 218 },
              { x: 260, o: 218, h: 186, l: 226, c: 194 },
              { x: 288, o: 194, h: 166, l: 204, c: 172 },
              { x: 316, o: 172, h: 144, l: 180, c: 152 },
              { x: 344, o: 152, h: 130, l: 160, c: 142 },
              { x: 372, o: 142, h: 124, l: 154, c: 148 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={48} y={136} text="RTH SESSION VWAP (MIDDAY EQUILIBRIUM)" color="#FAFAFA" />
              <Annotation x={48} y={234} text="-2.0σ DISPERSION EXHAUSTION" color="#71717A" />
              <Annotation x={218} y={314} text="VWAP FADE ENTRY" color={BULL} />
            </>
          )}
        </>
      );

    case 'traxo-power-hour-moc':
    default:
      return (
        <>
          <path d="M 36 286 Q 320 220 604 128" fill="none" stroke="#FAFAFA" strokeWidth="1.4" />
          <path d="M 36 306 Q 320 250 604 166" fill="none" stroke="#71717A" strokeWidth="1.2" strokeDasharray="4 4" />
          <line x1="406" y1="36" x2="406" y2="324" stroke="#52525B" strokeWidth="1" strokeDasharray="4 4" />
          <Candles
            items={[
              // Morning opening impulse
              { x: 60, o: 282, h: 236, l: 288, c: 244 },
              { x: 86, o: 244, h: 204, l: 252, c: 212 },
              { x: 112, o: 212, h: 180, l: 220, c: 188 },
              // Constructive midday hold above VWAP/EMA stack
              { x: 142, o: 188, h: 176, l: 206, c: 198 },
              { x: 168, o: 198, h: 180, l: 214, c: 186 },
              { x: 194, o: 186, h: 172, l: 202, c: 192 },
              { x: 220, o: 192, h: 168, l: 204, c: 176 },
              { x: 246, o: 176, h: 162, l: 194, c: 184 },
              { x: 272, o: 184, h: 158, l: 192, c: 164 },
              { x: 298, o: 164, h: 148, l: 178, c: 154 },
              { x: 324, o: 154, h: 138, l: 166, c: 146 },
              { x: 350, o: 146, h: 130, l: 158, c: 138 },
              // 15:30-16:00 ET Power Hour vertical surge
              { x: 398, o: 138, h: 102, l: 144, c: 108, w: 12 },
              { x: 430, o: 108, h: 74, l: 114, c: 82, w: 12 },
              { x: 462, o: 82, h: 48, l: 90, c: 54, w: 12 },
              { x: 494, o: 54, h: 30, l: 62, c: 38, w: 12 },
            ]}
          />
          {annotated && (
            <>
              <Annotation x={72} y={168} text="09:30 ET OPEN TREND" color="#A1A1AA" />
              <Annotation x={416} y={54} text="15:30–16:00 ET MOC SURGE" color={BULL} />
            </>
          )}
        </>
      );
  }
}

export function TraxoStrategyVisual({
  strategyId,
  annotated = false,
  className = '',
}: TraxoStrategyVisualProps) {
  return (
    <svg
      viewBox="0 0 640 360"
      className={`w-full h-full bg-[#09090B] select-none ${className}`}
      role="img"
      aria-label={`${strategyId} institutional chart schematic`}
    >
      <rect x="0" y="0" width="640" height="360" fill="#09090B" />

      {/* Subtle #18181B Obsidian Coordinate Grid */}
      <g stroke="#18181B" strokeWidth="1">
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={`h-${y}`} x1="0" y1={y} x2="640" y2={y} />
        ))}
        {[80, 160, 240, 320, 400, 480, 560].map((x) => (
          <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="360" />
        ))}
      </g>

      {renderStrategyScene(strategyId, annotated)}
    </svg>
  );
}
