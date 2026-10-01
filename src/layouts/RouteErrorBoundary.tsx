import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** When this value changes (e.g. the pathname), a previous error is cleared. */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Contains render errors thrown by a routed page so the surrounding layout
 * (sidebar, header, chat) stays usable instead of the whole app going blank.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[RouteErrorBoundary] Page crashed:', error, info)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex flex-col items-center gap-4 text-center max-w-md mx-auto py-16">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle size={24} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Something went wrong</h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            {this.state.error.message || 'This page failed to render.'}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-white/[0.06] border border-white/10 text-gray-300 hover:text-gray-100 transition-colors"
        >
          <RotateCcw size={14} />
          Try again
        </button>
      </div>
    )
  }
}
