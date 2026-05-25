import { useState } from 'react'
import { Calculator, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function PositionSizeCalculator() {
  const [balance, setBalance] = useState<number>(10000)
  const [riskPercent, setRiskPercent] = useState<number>(1.0)
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [entryPrice, setEntryPrice] = useState<number>(1.2000)
  const [stopLoss, setStopLoss] = useState<number>(1.1950)

  // Calculations
  const riskAmount = balance * (riskPercent / 100)
  
  let stopDistance = 0
  let isValid = false
  let errorMsg = ''

  if (direction === 'long') {
    if (stopLoss < entryPrice && stopLoss > 0 && entryPrice > 0) {
      stopDistance = entryPrice - stopLoss
      isValid = true
    } else if (stopLoss >= entryPrice) {
      errorMsg = 'Stop loss must be BELOW entry price for Longs'
    }
  } else {
    if (stopLoss > entryPrice && stopLoss > 0 && entryPrice > 0) {
      stopDistance = stopLoss - entryPrice
      isValid = true
    } else if (stopLoss <= entryPrice) {
      errorMsg = 'Stop loss must be ABOVE entry price for Shorts'
    }
  }

  const units = isValid && stopDistance > 0 ? riskAmount / stopDistance : 0
  const forexLots = units / 100000

  // Take Profit Targets
  const tp1 = direction === 'long' ? entryPrice + stopDistance * 1.5 : entryPrice - stopDistance * 1.5
  const tp2 = direction === 'long' ? entryPrice + stopDistance * 2.5 : entryPrice - stopDistance * 2.5
  const tp3 = direction === 'long' ? entryPrice + stopDistance * 4.0 : entryPrice - stopDistance * 4.0

  // Format utility
  const formatPrice = (val: number) => {
    if (val === 0) return '0.00'
    // Auto-detect decimal places
    if (val < 10) return val.toFixed(5)
    if (val < 500) return val.toFixed(3)
    return val.toFixed(2)
  }

  // Pre-fill helper when switching direction
  const handleDirectionChange = (dir: 'long' | 'short') => {
    setDirection(dir)
    if (dir === 'long') {
      if (stopLoss >= entryPrice) {
        setStopLoss(entryPrice * 0.99)
      }
    } else {
      if (stopLoss <= entryPrice) {
        setStopLoss(entryPrice * 1.01)
      }
    }
  }

  return (
    <Card className="border border-white/[0.08] bg-[#0d1117]/80 backdrop-blur-md shadow-xl">
      <CardHeader className="border-b border-white/[0.05] pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Calculator size={16} />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Position Size & Risk Calculator</CardTitle>
            <CardDescription className="text-xs">Compute parameters instantly based on invalidation points.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Direction Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-black/20 rounded-lg border border-white/[0.05]">
          <button
            onClick={() => handleDirectionChange('long')}
            className={`py-1.5 text-xs font-semibold rounded transition-all ${
              direction === 'long'
                ? 'bg-success/20 text-success border border-success/30 shadow'
                : 'text-text-muted hover:text-white border border-transparent'
            }`}
          >
            BUY / LONG
          </button>
          <button
            onClick={() => handleDirectionChange('short')}
            className={`py-1.5 text-xs font-semibold rounded transition-all ${
              direction === 'short'
                ? 'bg-danger/20 text-danger border border-danger/30 shadow'
                : 'text-text-muted hover:text-white border border-transparent'
            }`}
          >
            SELL / SHORT
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Account Balance ($)</label>
            <Input
              type="number"
              value={balance}
              onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
              className="h-9 tabular font-medium bg-[#0b0f17] border-white/[0.06]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Risk Amount (%)</label>
            <Input
              type="number"
              step="0.1"
              value={riskPercent}
              onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
              className="h-9 tabular font-medium bg-[#0b0f17] border-white/[0.06]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Entry Price</label>
            <Input
              type="number"
              step="0.00001"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="h-9 tabular font-medium bg-[#0b0f17] border-white/[0.06]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Stop Loss</label>
            <Input
              type="number"
              step="0.00001"
              value={stopLoss}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="h-9 tabular font-medium bg-[#0b0f17] border-white/[0.06]"
            />
          </div>
        </div>

        {/* Error State */}
        {!isValid && errorMsg && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-danger/20 bg-danger/10 text-danger text-[11px]">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Outputs Summary */}
        <div className="grid grid-cols-3 gap-2 bg-black/15 p-3 rounded-lg border border-white/[0.04]">
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-text-muted">Total Risk</p>
            <p className="text-[14px] font-bold text-white mt-0.5 tabular font-mono">${riskAmount.toFixed(2)}</p>
          </div>
          <div className="text-center border-x border-white/[0.06]">
            <p className="text-[9px] uppercase tracking-wider text-text-muted">Position Size</p>
            <p className="text-[14px] font-bold text-primary mt-0.5 tabular font-mono">
              {isValid ? units.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-text-muted">Forex Lots</p>
            <p className="text-[14px] font-bold text-primary-light mt-0.5 tabular font-mono">
              {isValid ? forexLots.toFixed(2) : '—'}
            </p>
          </div>
        </div>

        {/* Trade Target Roadmap */}
        {isValid && (
          <div className="space-y-2 border-t border-white/[0.05] pt-3">
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Calculated Exit Plan</h4>
            <div className="space-y-1.5 text-xs">
              {/* SL */}
              <div className="flex items-center justify-between p-2 rounded bg-danger/10 border border-danger/15 font-mono tabular text-danger">
                <span className="font-sans font-semibold text-[10px] uppercase">Stop Loss</span>
                <span className="font-bold">{formatPrice(stopLoss)}</span>
              </div>
              
              {/* Entry */}
              <div className="flex items-center justify-between p-2 rounded bg-primary/10 border border-primary/15 font-mono tabular text-primary">
                <span className="font-sans font-semibold text-[10px] uppercase">Entry Trigger</span>
                <span className="font-bold">{formatPrice(entryPrice)}</span>
              </div>

              {/* TP1 */}
              <div className="flex items-center justify-between p-2 rounded bg-success/5 border border-success/15 font-mono tabular text-success">
                <span className="font-sans font-semibold text-[10px] uppercase">TP1 (+1.5R)</span>
                <span className="font-bold">{formatPrice(tp1)}</span>
              </div>

              {/* TP2 */}
              <div className="flex items-center justify-between p-2 rounded bg-success/10 border border-success/20 font-mono tabular text-success">
                <span className="font-sans font-semibold text-[10px] uppercase">TP2 (+2.5R)</span>
                <span className="font-bold">{formatPrice(tp2)}</span>
              </div>

              {/* TP3 */}
              <div className="flex items-center justify-between p-2 rounded bg-success/20 border border-success/30 font-mono tabular text-success">
                <span className="font-sans font-semibold text-[10px] uppercase">TP3 (+4.0R)</span>
                <span className="font-bold">{formatPrice(tp3)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
