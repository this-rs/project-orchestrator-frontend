/**
 * DiscussionTreeView — renders the full discussion tree with an inline
 * conversation panel for the selected node.
 *
 * Layout: tree on the left, conversation panel on the right (when a node
 * is selected).
 */

import { useState, type ReactNode } from 'react'
import { GitBranch, RefreshCw, Loader2 } from 'lucide-react'
import { useDiscussionTree } from '@/hooks/useDiscussionTree'
import { Button } from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import { DiscussionNodeRow } from './DiscussionNode'
import { InlineConversationPanel } from './InlineConversationPanel'
import { SubtreeBreakdown } from './SubtreeBreakdown'

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

  if (isLoading && !tree) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-400">Chargement de l'arbre de discussions…</span>
      </div>
    )
  }

  if (error && !tree) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-6 text-center">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <Button size="sm" variant="secondary" onClick={refresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    )
  }

  if (!tree) return null

  return <DiscussionForestView roots={[tree]} isLoading={isLoading} onRefresh={refresh} onNavigate={onNavigate} />
}

// ---------------------------------------------------------------------------
// Forest view: one or several roots, same rows, same inline panel
// ---------------------------------------------------------------------------

interface DiscussionForestViewProps {
  roots: import('@/services/discussions').DiscussionNode[]
  isLoading?: boolean
  onRefresh: () => void
  onNavigate?: (sessionId: string) => void
  /** Buttons under each node (attach, resume...) */
  renderActions?: (node: import('@/services/discussions').DiscussionNode) => ReactNode
  /** Extra header content (counts, hints) */
  headerExtra?: ReactNode
  /** The panel sits under the tree on a phone: no fixed height needed */
  title?: string
}

export function DiscussionForestView({
  roots,
  isLoading = false,
  onRefresh,
  onNavigate,
  renderActions,
  headerExtra,
  title = 'Arbre de discussions',
}: DiscussionForestViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const selectedTitle = selectedNodeId ? roots.map((r) => findNodeTitle(r, selectedNodeId)).find(Boolean) ?? null : null

  const handleSelectNode = (nodeSessionId: string) => {
    if (onNavigate) {
      onNavigate(nodeSessionId)
      return
    }
    setSelectedNodeId((prev) => (prev === nodeSessionId ? null : nodeSessionId))
  }

  return (
    <div className="@container flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <GitBranch className="w-4 h-4 text-gray-400" aria-hidden="true" />
          <span className="font-medium text-gray-300">{title}</span>
          {headerExtra}
        </div>
        <button
          onClick={onRefresh}
          type="button"
          className={`${iconButton('ghost', 'w-9 h-9 md:w-8 md:h-8')} ${glassFlat} shrink-0`}
          aria-label="Actualiser l'arbre"
          title="Actualiser l'arbre"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {/* Content: tree + panel */}
      <div className="flex flex-1 min-h-0 gap-0 flex-col @xl:flex-row">
        {/* Tree */}
        <div
          className={`overflow-y-auto overscroll-contain space-y-0.5 pb-4 ${
            selectedNodeId ? '@xl:w-1/2 flex-shrink-0' : 'flex-1'
          }`}
        >
          {roots.map((root) => (
            <SubtreeBreakdown key={`breakdown-${root.session_id}`} root={root} />
          ))}
          {roots.map((root) => (
            <DiscussionNodeRow
              key={root.session_id}
              node={root}
              depth={0}
              selectedSessionId={selectedNodeId}
              onSelectNode={handleSelectNode}
              renderActions={renderActions}
              onTreeChanged={onRefresh}
            />
          ))}
        </div>

        {/* Inline conversation panel */}
        {selectedNodeId && (
          <div className="w-full h-[60dvh] @xl:h-auto @xl:w-1/2 flex-shrink-0 border-t @xl:border-t-0 @xl:border-l border-border-subtle @xl:ml-2 mt-2 @xl:mt-0">
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
