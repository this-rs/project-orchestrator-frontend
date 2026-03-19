/**
 * DiscussionTreeView — renders the full discussion tree with an inline
 * conversation panel for the selected node.
 *
 * Layout: tree on the left, conversation panel on the right (when a node
 * is selected).
 */

import { useState } from 'react'
import { GitBranch, RefreshCw, Loader2 } from 'lucide-react'
import { useDiscussionTree } from '@/hooks/useDiscussionTree'
import { DiscussionNodeRow } from './DiscussionNode'
import { InlineConversationPanel } from './InlineConversationPanel'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DiscussionTreeViewProps {
  /** Root session ID whose tree to display */
  sessionId: string
  /** When provided, clicking a node navigates to that session instead of showing the inline panel */
  onNavigate?: (sessionId: string) => void
}

export function DiscussionTreeView({ sessionId, onNavigate }: DiscussionTreeViewProps) {
  const { tree, isLoading, error, refresh } = useDiscussionTree(sessionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Resolve selected node title for the panel header
  const selectedTitle = selectedNodeId ? findNodeTitle(tree, selectedNodeId) : null

  const handleSelectNode = (nodeSessionId: string) => {
    if (onNavigate) {
      onNavigate(nodeSessionId)
      return
    }
    setSelectedNodeId((prev) => (prev === nodeSessionId ? null : nodeSessionId))
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading && !tree) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading discussion tree...</span>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error && !tree) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-6 text-center">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                     bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-gray-200
                     transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (!tree) return null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <GitBranch className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-300">Discussion Tree</span>
        </div>
        <button
          onClick={refresh}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]
                     transition-colors cursor-pointer"
          title="Refresh tree"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content: tree + panel */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Tree */}
        <div
          className={`overflow-y-auto space-y-0.5 pb-4 ${
            selectedNodeId ? 'w-1/2 flex-shrink-0' : 'flex-1'
          }`}
        >
          <DiscussionNodeRow
            node={tree}
            depth={0}
            selectedSessionId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        </div>

        {/* Inline conversation panel */}
        {selectedNodeId && (
          <div className="w-1/2 flex-shrink-0 border-l border-border-subtle ml-2">
            <InlineConversationPanel
              sessionId={selectedNodeId}
              title={selectedTitle || 'Session'}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNodeTitle(
  node: import('@/services/discussions').DiscussionNode | null,
  sessionId: string,
): string | null {
  if (!node) return null
  if (node.session_id === sessionId) return node.title
  for (const child of node.children ?? []) {
    const found = findNodeTitle(child, sessionId)
    if (found) return found
  }
  return null
}
