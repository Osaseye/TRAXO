import React from 'react'
import { Logo } from '@/components/shared/Logo'

interface State {
  hasError: boolean
  error?: Error | null
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  componentDidCatch(_error: Error, _info: unknown) {
    // TODO: send to analytics
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#07090f]">
          <div className="max-w-md text-center bg-[#0b0f17] border border-white/[0.04] rounded-2xl p-8">
            <div className="inline-flex items-center gap-3 justify-center mb-4">
              <Logo variant="icon" size="sm" className="h-8 w-8" />
              <p className="text-sm font-semibold text-white/80">TRAXO</p>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-white/80 mb-6">An unexpected error occurred. Try refreshing the page or contact support.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                className="px-4 py-2 rounded bg-white text-[#0b0f17] font-medium"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children as React.ReactNode
  }
}

export default ErrorBoundary
