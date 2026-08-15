import { useState } from 'react';
import { useMetaApi } from '@/hooks/useMetaApi';
import {
  Zap,
  Activity,
  ShieldCheck,
  Power,
  RefreshCw,
  XCircle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AutoTraderWidget() {
  const {
    account,
    positions,
    autoTradeEnabled,
    loading,
    toggleAutoTrade,
    closeOpenPosition,
    refreshAccount,
    refreshPositions,
  } = useMetaApi();

  const [expanded, setExpanded] = useState<boolean>(true);

  return (
    <div className="rounded-xl border border-blue-500/20 bg-[#090d14]/95 backdrop-blur-xl overflow-hidden shadow-2xl transition-all">
      {/* Header Bar */}
      <div className="p-4 bg-gradient-to-r from-blue-950/40 via-[#070b12] to-[#090d14] flex items-center justify-between gap-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Zap size={18} className={cn(autoTradeEnabled && "animate-pulse text-emerald-400")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">Exness Auto Trader</h2>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
                  account?.connected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : account?.state === 'UNDEPLOYED'
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                )}
              >
                {account?.connected ? "Connected" : account?.state === 'UNDEPLOYED' ? "Standby / Undeployed" : "Connecting..."}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">MetaApi Cloud MT5 Bridge • Real-Time Execution</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={() => {
              void refreshAccount();
              void refreshPositions();
            }}
            className="p-1.5 rounded-lg border border-white/[0.08] bg-[#070b12] text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            title="Refresh Account Data"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>

          {/* Toggle Switch */}
          <button
            onClick={() => void toggleAutoTrade(!autoTradeEnabled)}
            disabled={loading}
            className={cn(
              "h-8 px-3 rounded-lg border font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-md",
              autoTradeEnabled
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
            )}
          >
            <Power size={13} />
            <span>{autoTradeEnabled ? "Auto-Trade ON" : "Auto-Trade OFF"}</span>
          </button>

          {/* Expand/Collapse */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg border border-white/[0.08] bg-[#070b12] text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Account Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Balance</span>
              <span className="text-base font-bold text-white tabular-nums mt-0.5 block">
                ${(account?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Equity</span>
              <span className={cn(
                "text-base font-bold tabular-nums mt-0.5 block",
                (account?.equity || 0) >= (account?.balance || 0) ? "text-emerald-400" : "text-rose-400"
              )}>
                ${(account?.equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Used Margin</span>
              <span className="text-base font-bold text-slate-300 tabular-nums mt-0.5 block">
                ${(account?.margin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#05080f] border border-white/[0.06]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Free Margin</span>
              <span className="text-base font-bold text-blue-400 tabular-nums mt-0.5 block">
                ${(account?.freeMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Active MT5 Positions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="text-blue-400" />
                Active MT5 Positions ({positions.length})
              </span>
              <span className="text-[10px] text-slate-500">Live Exness Broker Execution</span>
            </div>

            {positions.length > 0 ? (
              <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-[#05080f] overflow-hidden">
                {positions.map((pos) => (
                  <div key={pos.id} className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.01] transition-colors">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border",
                          pos.type.includes("BUY")
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        )}
                      >
                        {pos.type.replace("POSITION_TYPE_", "")}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{pos.symbol}</span>
                          <span className="text-[10px] text-slate-400">{pos.volume} lots</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Open: {pos.openPrice} • Price: {pos.currentPrice}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span
                          className={cn(
                            "text-xs font-bold tabular-nums block",
                            pos.profit >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {pos.profit >= 0 ? "+" : ""}${pos.profit.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-slate-500">P/L</span>
                      </div>

                      <button
                        onClick={() => void closeOpenPosition(pos.id)}
                        className="p-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors"
                        title="Close Position Now"
                      >
                        <XCircle size={13} />
                        <span className="hidden sm:inline">Close</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-white/[0.08] bg-[#05080f]/50">
                <ShieldCheck size={18} className="mx-auto text-slate-500 mb-1" />
                <p className="text-[11px] font-medium text-slate-400">No active positions on Exness MT5</p>
                <p className="text-[10px] text-slate-500 mt-0.5">New high-confidence signals will automatically enter trades here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
