import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useT } from '@/i18n'

interface Props {
  children: ReactNode
  /** Optional label for the context (e.g. "Workspace Graph", "Plan Universe") */
  context?: string
}

interface State {
  hasError: boolean
  error: Error | null
  webglLost: boolean
}

/** The fallback is a function component so that it can read the language (a class cannot use a hook). */
function Graph3DFallback({ webglLost, message, onRetry }: { webglLost: boolean; message?: string; onRetry: () => void }) {
  const { t } = useT()
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle size={24} className="text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">
            {webglLost ? t('ui.graph3d.contextLost') : t('ui.graph3d.renderError')}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {webglLost
              ? t('ui.graph3d.contextLostText')
              : message
                ? t('ui.graph3d.renderErrorDetail', { message })
                : t('ui.graph3d.renderErrorText')}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
        >
          <RotateCcw size={14} />
          {t('ui.retry')}
        </button>
      </div>
    </div>
  )
}

/**
 * ErrorBoundary specialized for 3D graph components.
 *
 * Catches:
 * - React render errors from Three.js / react-force-graph-3d
 * - WebGL context lost events (via imperative listener)
 *
 * Provides a retry button that re-mounts the entire 3D subtree.
 */
export class Graph3DErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, webglLost: false }

  private canvasObserver: MutationObserver | null = null
  private contextLostHandler: ((e: Event) => void) | null = null
  private containerRef: HTMLDivElement | null = null

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[Graph3DErrorBoundary${this.props.context ? ` (${this.props.context})` : ''}] Caught error:`, error, info)
  }

  componentDidMount(): void {
    this.observeWebGLContext()
  }

  componentWillUnmount(): void {
    this.cleanupObserver()
  }

  /**
   * Watch for <canvas> elements being added to the DOM inside our subtree,
   * then attach a webglcontextlost listener.
   */
  private observeWebGLContext(): void {
    if (!this.containerRef) return

    this.contextLostHandler = (e: Event) => {
      e.preventDefault() // Prevents default browser behavior
      console.warn('[Graph3DErrorBoundary] WebGL context lost')
      this.setState({ hasError: true, webglLost: true, error: new Error('WebGL context lost') })
    }

    // Attach to any existing canvas
    const existingCanvases = this.containerRef.querySelectorAll('canvas')
    existingCanvases.forEach((c) => c.addEventListener('webglcontextlost', this.contextLostHandler!))

    // Watch for dynamically added canvases (react-force-graph-3d creates them lazily)
    this.canvasObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLCanvasElement) {
            node.addEventListener('webglcontextlost', this.contextLostHandler!)
          }
          // Also check descendants
          if (node instanceof HTMLElement) {
            node.querySelectorAll('canvas').forEach((c) =>
              c.addEventListener('webglcontextlost', this.contextLostHandler!)
            )
          }
        }
      }
    })

    this.canvasObserver.observe(this.containerRef, { childList: true, subtree: true })
  }

  private cleanupObserver(): void {
    this.canvasObserver?.disconnect()
    this.canvasObserver = null
    // Clean up context lost listeners
    if (this.containerRef && this.contextLostHandler) {
      this.containerRef.querySelectorAll('canvas').forEach((c) =>
        c.removeEventListener('webglcontextlost', this.contextLostHandler!)
      )
    }
  }

  private handleRetry = (): void => {
    this.cleanupObserver()
    this.setState({ hasError: false, error: null, webglLost: false }, () => {
      // Re-observe after state reset triggers re-mount of children
      requestAnimationFrame(() => this.observeWebGLContext())
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <Graph3DFallback webglLost={this.state.webglLost} message={this.state.error?.message} onRetry={this.handleRetry} />
    }

    return (
      <div ref={(el) => { this.containerRef = el }} className="contents">
        {this.props.children}
      </div>
    )
  }
}
