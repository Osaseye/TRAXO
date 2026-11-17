import React from 'react'
import { PiArrowClockwise, PiHouse, PiWarningCircle } from 'react-icons/pi'

interface State {
  hasError: boolean
  error?: Error | null
  errorInfo?: React.ErrorInfo | null
  showDetails?: boolean
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null, errorInfo: null, showDetails: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    // Log exception safely to console in development
    if (import.meta.env.DEV) {
      console.error('[TRAXO ErrorBoundary Intercept]', error, errorInfo)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative min-h-[100dvh] w-full bg-[#09090B] text-[#FAFAFA] flex flex-col justify-between overflow-x-hidden font-sans select-none">
          {/* Subtle ambient coordinate dot grid */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.14]"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
            {/* Subtle horizontal session bias line */}
            <svg
              className="absolute inset-0 w-full h-full opacity-15"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line
                x1="0"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="rgba(248,113,113,0.2)"
                strokeDasharray="4 8"
              />
            </svg>
          </div>

          {/* Top Wordmark — sitting directly on canvas without a box */}
          <header className="relative z-10 pt-8 sm:pt-12 px-6 flex justify-center">
            <a
              href="/"
              className="inline-flex items-center gap-2.5 group focus:outline-none"
            >
              <img
                src="/brand/traxo-mark.png"
                onError={(e) => {
                  e.currentTarget.src = '/TRAXO.png'
                }}
                className="w-7 h-7 object-contain"
                alt="TRAXO"
              />
              <span className="text-[12px] font-bold tracking-[0.24em] uppercase text-[#FAFAFA]">
                TRAXO
              </span>
            </a>
          </header>

          {/* Center Open-Canvas Message — NO BOXED CARD CONTAINER */}
          <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-12 w-full max-w-lg mx-auto text-center">
            <div className="space-y-6">
              {/* Status Header */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-[#F87171] uppercase">
                  <PiWarningCircle size={14} />
                  <span>State Interruption</span>
                </div>
                <h1 className="text-[28px] sm:text-[34px] font-semibold text-[#FAFAFA] tracking-tight">
                  Session interrupted
                </h1>
                <p className="text-[14px] text-[#A1A1AA] leading-relaxed max-w-md mx-auto">
                  An unexpected render anomaly occurred. Your state has been preserved safely. Reload to resume your live terminal station.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#FAFAFA] text-[#09090B] text-[13px] font-semibold hover:bg-[#E4E4E7] active:scale-[0.99] transition-all shadow-[0_0_24px_rgba(255,255,255,0.1)] cursor-pointer"
                >
                  <PiArrowClockwise size={15} />
                  <span>Reload station</span>
                </button>
                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[13px] font-medium text-[#FAFAFA] transition-colors cursor-pointer"
                >
                  <PiHouse size={15} />
                  <span>Return home</span>
                </button>
              </div>

              {/* Diagnostic detail fold (discreet) */}
              {this.state.error && (
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                    className="text-[11.5px] text-[#71717A] hover:text-[#A1A1AA] transition-colors cursor-pointer underline underline-offset-4"
                  >
                    {this.state.showDetails ? 'Hide diagnostics' : 'Show diagnostics'}
                  </button>
                  {this.state.showDetails && (
                    <div className="mt-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-left max-h-48 overflow-auto">
                      <p className="text-[11.5px] font-mono text-[#F87171] break-all">
                        {this.state.error.toString()}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* Calm Footer Telemetry */}
          <footer className="relative z-10 pb-8 px-6 flex justify-center text-[11px] text-[#52525B]">
            <span>TRAXO QUANTITATIVE TERMINAL · RECOVERY ENGINE</span>
          </footer>
        </div>
      )
    }

    return this.props.children as React.ReactNode
  }
}

export default ErrorBoundary
