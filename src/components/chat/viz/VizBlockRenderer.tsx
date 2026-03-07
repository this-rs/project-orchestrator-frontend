/**
 * VizBlockRenderer — Main dispatcher for rendering VizBlock ContentBlocks.
 *
 * Receives a ContentBlock with type='viz' and dispatches to the appropriate
 * visualization component via the vizRegistry. Handles:
 * - Registry lookup by viz_type
 * - Fallback rendering when no component is registered
 * - Error boundaries for failed viz components
 * - Compact mode with expand button → VizExpandDialog
 *
 * Integration point: imported by ChatMessageBubble for the 'viz' block type.
 */
import { useState, useCallback, Component, type ReactNode } from 'react'
import { Maximize2, AlertTriangle, BarChart3 } from 'lucide-react'
import type { ContentBlock } from '@/types'
import { vizRegistry, type VizBlockProps } from './registry'
import { VizExpandDialog } from './VizExpandDialog'

// ============================================================================
// Error Boundary
// ============================================================================

interface ErrorBoundaryProps {
  fallbackText: string
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class VizErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <VizFallback text={this.props.fallbackText} error={this.state.error?.message} />
    }
    return this.props.children
  }
}

// ============================================================================
// Fallback component
// ============================================================================

function VizFallback({ text, error }: { text: string; error?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70 mb-1.5">
          <AlertTriangle className="w-3 h-3" />
          <span>Visualization failed to render</span>
        </div>
      )}
      <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

// ============================================================================
// Main renderer
// ============================================================================

interface VizBlockRendererProps {
  block: ContentBlock
}

export function VizBlockRenderer({ block }: VizBlockRendererProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const vizType = (block.metadata?.viz_type as string) ?? ''
  const vizData = (block.metadata?.viz_data as Record<string, unknown>) ?? {}
  const fallbackText = block.content || 'No visualization data available.'
  const title = block.metadata?.viz_title as string | undefined
  const interactive = (block.metadata?.viz_interactive as boolean) ?? false
  const maxHeight = (block.metadata?.viz_max_height as number) ?? 300

  const openExpanded = useCallback(() => setIsExpanded(true), [])
  const closeExpanded = useCallback(() => setIsExpanded(false), [])

  // Lookup the registered component
  const VizComponent = vizRegistry.get(vizType)

  // If no component registered, show fallback
  if (!VizComponent) {
    return <VizFallback text={fallbackText} />
  }

  const vizProps: VizBlockProps = {
    data: vizData,
    fallbackText,
    title,
    interactive,
    maxHeight,
  }

  return (
    <>
      {/* Compact mode */}
      <div className="my-2 rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05] bg-white/[0.02]">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-indigo-400" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              {title ?? vizType.replace(/_/g, ' ')}
            </span>
          </div>
          <button
            onClick={openExpanded}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Expand visualization"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Expand</span>
          </button>
        </div>

        {/* Viz content (compact) */}
        <div className="p-3" style={{ maxHeight: `${maxHeight}px`, overflow: 'auto' }}>
          <VizErrorBoundary fallbackText={fallbackText}>
            <VizComponent {...vizProps} expanded={false} />
          </VizErrorBoundary>
        </div>
      </div>

      {/* Expanded modal */}
      <VizExpandDialog
        open={isExpanded}
        onClose={closeExpanded}
        title={title ?? vizType.replace(/_/g, ' ')}
      >
        <VizErrorBoundary fallbackText={fallbackText}>
          <VizComponent {...vizProps} expanded={true} />
        </VizErrorBoundary>
      </VizExpandDialog>
    </>
  )
}
