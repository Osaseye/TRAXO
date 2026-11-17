import {
  PiArrowsClockwise,
  PiPower,
  PiLightning,
  PiShieldCheck,
  PiWarningCircle,
  PiX,
} from 'react-icons/pi';
import { useMetaApi } from '@/hooks/useMetaApi';

export function AutoTraderWidget() {
  const {
    account,
    positions,
    autoTradeEnabled,
    loading,
    toggleAutoTrade,
    refreshAccount,
    refreshPositions,
    closeOpenPosition,
  } = useMetaApi();

  const isConnected = account?.connected ?? false;
  const totalFloatingPnl = positions.reduce((acc, p) => acc + (p.profit || 0), 0);

  const handleToggle = () => {
    void toggleAutoTrade(!autoTradeEnabled);
  };

  const handleRefresh = () => {
    void refreshAccount();
    void refreshPositions();
  };

  return (
    <section className="rounded-2xl bg-[#111113] border border-white/[0.07] overflow-hidden">
      {/* Header Bar */}
      <div className="p-6 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#18181B] flex items-center justify-center shrink-0">
            <PiLightning
              size={18}
              className={isConnected && autoTradeEnabled ? 'text-[#34D399]' : 'text-[#A1A1AA]'}
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
                Auto-execution router
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#A1A1AA]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-[#34D399]' : 'bg-[#71717A]'
                  }`}
                />
                {isConnected ? account?.platform?.toUpperCase() || 'MT5' : 'Offline'}
              </span>
            </div>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              MetaApi execution bridge and live exposure monitor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="Sync broker account & positions"
            aria-label="Sync broker account and positions"
            className="h-9 w-9 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[#A1A1AA] hover:text-[#FAFAFA] flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <PiArrowsClockwise size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className={`h-9 px-3.5 rounded-xl text-[13px] font-medium inline-flex items-center gap-1.5 border transition-colors disabled:opacity-50 ${
              autoTradeEnabled
                ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/25 hover:bg-[#34D399]/15'
                : 'bg-[#18181B] text-[#A1A1AA] border-white/[0.08] hover:text-[#FAFAFA] hover:border-white/[0.16]'
            }`}
          >
            <PiPower size={14} />
            {autoTradeEnabled ? 'Auto-trade on' : 'Auto-trade off'}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Account Telemetry Strip */}
        <div className="rounded-xl bg-[#161619] grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <div className="p-4">
            <p className="text-[12px] font-medium text-[#71717A]">Balance</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {isConnected && typeof account?.balance === 'number'
                ? `$${account.balance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '—'}
            </p>
          </div>

          <div className="p-4 !border-t-0">
            <p className="text-[12px] font-medium text-[#71717A]">Equity</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {isConnected && typeof account?.equity === 'number'
                ? `$${account.equity.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '—'}
            </p>
          </div>

          <div className="p-4">
            <p className="text-[12px] font-medium text-[#71717A]">Free margin</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums text-[#FAFAFA] mt-1">
              {isConnected && typeof account?.freeMargin === 'number'
                ? `$${account.freeMargin.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '—'}
            </p>
          </div>

          <div className="p-4">
            <p className="text-[12px] font-medium text-[#71717A]">Floating P&amp;L</p>
            <p
              className={`text-[15px] font-mono font-semibold tabular-nums mt-1 ${
                !isConnected
                  ? 'text-[#71717A]'
                  : totalFloatingPnl >= 0
                  ? 'text-[#34D399]'
                  : 'text-[#F87171]'
              }`}
            >
              {isConnected
                ? `${totalFloatingPnl >= 0 ? '+' : ''}$${totalFloatingPnl.toFixed(2)}`
                : '—'}
            </p>
          </div>
        </div>

        {/* Standby / Disconnected Notice */}
        {!isConnected && (
          <div className="px-4 py-3.5 rounded-xl bg-[#161619] flex items-start gap-2.5 text-[13px] text-[#A1A1AA]">
            <PiWarningCircle size={16} className="text-[#71717A] shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              {account?.error ||
                'MetaApi bridge standby. Configure broker credentials on the backend to enable live MT4/MT5 order routing.'}
            </span>
          </div>
        )}

        {/* Active Positions List */}
        {isConnected && (
          <div className="rounded-xl bg-[#161619] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#71717A]">
                Open broker positions ({positions.length})
              </span>
              <span className="text-[12px] font-mono text-[#71717A] tabular-nums">
                {account?.leverage ? `1:${account.leverage}` : 'MT5'}
              </span>
            </div>

            {positions.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-[#71717A]">
                No open broker positions.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {positions.map((pos) => {
                  const isBuy = pos.type.includes('BUY');
                  const isProfit = pos.profit >= 0;

                  return (
                    <div
                      key={pos.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-[13px] hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                            isBuy
                              ? 'bg-[#34D399]/10 text-[#34D399]'
                              : 'bg-[#F87171]/10 text-[#F87171]'
                          }`}
                        >
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#FAFAFA]">{pos.symbol}</span>
                            <span className="text-[12px] font-mono text-[#71717A] tabular-nums">
                              {pos.volume} lots
                            </span>
                          </div>
                          <div className="text-[12px] font-mono text-[#71717A] tabular-nums truncate">
                            {pos.openPrice} → {pos.currentPrice}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`font-mono font-semibold tabular-nums ${
                            isProfit ? 'text-[#34D399]' : 'text-[#F87171]'
                          }`}
                        >
                          {isProfit ? '+' : ''}${pos.profit.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void closeOpenPosition(pos.id)}
                          disabled={loading}
                          title="Close position at market"
                          className="h-7 px-2.5 rounded-lg bg-[#111113] border border-white/[0.08] hover:border-[#F87171]/40 hover:text-[#F87171] text-[#A1A1AA] text-[12px] font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <PiX size={13} />
                          Close
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Protection Note */}
        {isConnected && autoTradeEnabled && (
          <div className="px-4 py-3 rounded-xl bg-[#161619] flex items-center gap-2.5 text-[12px] text-[#A1A1AA]">
            <PiShieldCheck size={15} className="text-[#34D399] shrink-0" />
            <span>
              Autonomous orders enforce strategy SL/TP levels and account risk caps automatically.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
