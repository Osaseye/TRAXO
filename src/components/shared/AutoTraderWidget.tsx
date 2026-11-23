import { useState } from 'react';
import {
  PiArrowsClockwise,
  PiCoins,
  PiFastForward,
  PiLightning,
  PiPause,
  PiPlay,
  PiPower,
  PiShieldCheck,
  PiWarningCircle,
  PiX,
} from 'react-icons/pi';
import { useMetaApi } from '@/hooks/useMetaApi';

export function AutoTraderWidget() {
  const {
    account,
    positions,
    replayStatus,
    autoTradeEnabled,
    loading,
    toggleAutoTrade,
    resetPaperBalance,
    startOfflineReplay,
    pauseOfflineReplay,
    resumeOfflineReplay,
    stepOfflineReplay,
    refreshAccount,
    refreshPositions,
    closeOpenPosition,
  } = useMetaApi();

  const [showResetForm, setShowResetForm] = useState(false);
  const [balanceInput, setBalanceInput] = useState('10000');
  const [clearTrades, setClearTrades] = useState(false);

  const isConnected = account?.connected ?? false;
  const isPaperMode = account?.mode === 'paper';
  const totalFloatingPnl =
    typeof account?.floatingPnl === 'number'
      ? account.floatingPnl
      : positions.reduce((acc, p) => acc + (p.profit || 0), 0);

  const handleToggle = () => {
    void toggleAutoTrade(!autoTradeEnabled);
  };

  const handleRefresh = () => {
    void refreshAccount();
    void refreshPositions();
  };

  const handleApplyBalance = async () => {
    const val = Number(balanceInput);
    if (!Number.isFinite(val) || val < 100) return;
    await resetPaperBalance(val, clearTrades);
    setShowResetForm(false);
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
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-[16px] font-medium tracking-[-0.015em] text-[#FAFAFA]">
                Auto-execution router
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#18181B] border border-white/[0.08] text-[#A1A1AA]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-[#34D399]' : 'bg-[#71717A]'
                  }`}
                />
                {isPaperMode
                  ? 'PAPER ENGINE · ACTIVE'
                  : isConnected
                  ? account?.platform?.toUpperCase() || 'MT5'
                  : 'Offline'}
              </span>
            </div>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              {isPaperMode
                ? 'Internal SQLite Paper Broker · Dynamic TP1/BE/TP2 Exit Engine & 1m Tie-Breaker'
                : 'MetaApi execution bridge and live exposure monitor'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPaperMode && (
            <button
              type="button"
              onClick={() => {
                setBalanceInput(String(account?.balance ?? 10000));
                setShowResetForm((v) => !v);
              }}
              className="h-9 px-3 rounded-xl bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] text-[#A1A1AA] hover:text-[#FAFAFA] text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <PiCoins size={14} />
              Set Balance
            </button>
          )}

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
        {/* Inline Paper Balance Configurator */}
        {isPaperMode && showResetForm && (
          <div className="rounded-xl bg-[#161619] border border-white/[0.08] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[#FAFAFA]">
                Configure Internal Paper Capital (USD)
              </span>
              <div className="flex items-center gap-1.5">
                {[10000, 25000, 50000, 100000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBalanceInput(String(preset))}
                    className="px-2 py-1 rounded-md bg-[#18181B] hover:bg-[#222227] border border-white/[0.07] text-[11px] font-mono text-[#A1A1AA] hover:text-[#FAFAFA]"
                  >
                    ${(preset / 1000).toFixed(0)}k
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={100}
                step={500}
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="h-9 w-40 px-3 rounded-lg bg-[#111113] border border-white/[0.1] text-[13px] font-mono text-[#FAFAFA] focus:outline-none"
              />
              <label className="inline-flex items-center gap-2 text-[12px] text-[#A1A1AA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearTrades}
                  onChange={(e) => setClearTrades(e.target.checked)}
                  className="rounded border-white/20 bg-[#111113]"
                />
                Reset Paper Ledger trades too
              </label>
              <button
                type="button"
                onClick={() => void handleApplyBalance()}
                disabled={loading}
                className="h-9 px-3.5 rounded-lg bg-[#FAFAFA] text-[#09090B] text-[12.5px] font-semibold hover:bg-[#E4E4E7] disabled:opacity-50"
              >
                Apply Capital
              </button>
            </div>
          </div>
        )}

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
            <p className="text-[12px] font-medium text-[#71717A]">Floating / Realized P&amp;L</p>
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
              {isPaperMode && typeof account?.realizedPnl === 'number' && (
                <span className="ml-1.5 text-[11px] text-[#71717A]">
                  ({account.realizedPnl >= 0 ? '+' : ''}${account.realizedPnl.toFixed(0)} real.)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Offline Bar-by-Bar Replay Tester Control */}
        {isPaperMode && (
          <div className="rounded-xl bg-[#161619] border border-white/[0.05] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium text-[#FAFAFA]">Offline Candle Replay</span>
                <span className="px-2 py-0.5 rounded bg-[#18181B] text-[10.5px] font-mono text-[#A1A1AA]">
                  {replayStatus?.state || 'IDLE'}
                </span>
              </div>
              <p className="text-[11.5px] font-mono text-[#71717A] truncate">
                Bar {replayStatus?.cursorIndex ?? 0}/{replayStatus?.totalBars ?? 0} ·{' '}
                {replayStatus?.signalsGenerated ?? 0} signals · {replayStatus?.tradesExecuted ?? 0} filled ·{' '}
                {replayStatus?.tradesResolved ?? 0} resolved
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void stepOfflineReplay(1)}
                disabled={loading}
                className="h-8 px-2.5 rounded-lg bg-[#18181B] hover:bg-[#222227] border border-white/[0.08] text-[12px] text-[#FAFAFA] inline-flex items-center gap-1"
              >
                <PiFastForward size={13} />
                Step +1
              </button>
              {replayStatus?.state === 'RUNNING' ? (
                <button
                  type="button"
                  onClick={() => void pauseOfflineReplay()}
                  className="h-8 px-2.5 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/25 text-[#FBBF24] text-[12px] inline-flex items-center gap-1"
                >
                  <PiPause size={13} />
                  Pause
                </button>
              ) : replayStatus?.state === 'PAUSED' ? (
                <button
                  type="button"
                  onClick={() => void resumeOfflineReplay()}
                  className="h-8 px-2.5 rounded-lg bg-[#34D399]/10 border border-[#34D399]/25 text-[#34D399] text-[12px] inline-flex items-center gap-1"
                >
                  <PiPlay size={13} />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startOfflineReplay({ speedMs: 650 })}
                  disabled={loading}
                  className="h-8 px-2.5 rounded-lg bg-[#34D399]/10 border border-[#34D399]/25 text-[#34D399] text-[12px] inline-flex items-center gap-1"
                >
                  <PiPlay size={13} />
                  Run Replay
                </button>
              )}
            </div>
          </div>
        )}

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
                Open {isPaperMode ? 'paper' : 'broker'} positions ({positions.length})
              </span>
              <span className="text-[12px] font-mono text-[#71717A] tabular-nums">
                {account?.leverage ? `1:${account.leverage}` : 'MT5'}
              </span>
            </div>

            {positions.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-[#71717A]">
                No open {isPaperMode ? 'paper' : 'broker'} positions.
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[#FAFAFA]">{pos.symbol}</span>
                            <span className="text-[12px] font-mono text-[#71717A] tabular-nums">
                              {pos.volume} lots
                            </span>
                            {pos.exitMode && (
                              <span className="px-1.5 py-0.5 rounded bg-[#18181B] border border-white/[0.07] text-[10px] font-mono text-[#A1A1AA]">
                                {pos.exitMode === 'SCALE_50_TP1_BE_TP2' ? '50/50 Scale → BE' : '100% TP1'}
                              </span>
                            )}
                            {pos.status === 'PARTIAL_TP1' && (
                              <span className="px-1.5 py-0.5 rounded bg-[#34D399]/15 text-[10px] font-mono text-[#34D399]">
                                TP1 HIT · SL @ BE
                              </span>
                            )}
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
              Autonomous orders enforce 9-point guardrails, spread asymmetry, and dynamic TP1/TP2 exit management.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
