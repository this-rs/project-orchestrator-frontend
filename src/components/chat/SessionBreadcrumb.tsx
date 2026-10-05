/**
 * SessionBreadcrumb — shows the parent chain for spawned sessions.
 *
 * Displays: Root Session > Agent Task X > Sub-agent Y
 * Each segment is clickable to navigate to that session.
 * Only visible when the current session has `spawned_by`.
 */

import { ChevronRight } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'
import { describeSessionProvider, shouldShowProviderBadge } from '@/constants/providers'
import { useSessionTree } from '@/hooks'
import { ProviderBadge } from './ProviderBadge'
import type { SessionTreeNode } from '@/types'

interface SessionBreadcrumbProps {
  /** Current session ID */
  sessionId: string
  /** Root session ID to fetch the tree from */
  rootSessionId: string
  /** Called when a breadcrumb segment is clicked */
  onNavigate: (sessionId: string) => void
  /** Changes when chat activity starts/stops, to refresh the tree */
  isStreaming?: boolean
}

/**
 * Build the path from root to `targetId` using the flat tree array.
 * Returns an array of nodes from root down to the target.
 */
function buildPath(tree: SessionTreeNode[], targetId: string): SessionTreeNode[] {
  // Build a map of sessionId -> node for quick lookup
  const nodeMap = new Map<string, SessionTreeNode>()
  for (const node of tree) {
    nodeMap.set(node.session_id, node)
  }

  // Walk up from target to root via parent_session_id
  const path: SessionTreeNode[] = []
  let current = nodeMap.get(targetId)
  while (current) {
    path.unshift(current)
    if (current.parent_session_id) {
      current = nodeMap.get(current.parent_session_id)
    } else {
      break
    }
  }

  return path
}

export function SessionBreadcrumb({ sessionId, rootSessionId, onNavigate, isStreaming }: SessionBreadcrumbProps) {
  const { tree } = useSessionTree(rootSessionId, isStreaming)
  const instances = useAtomValue(providersAtom)?.providers ?? null

  if (tree.length === 0) return null

  const path = buildPath(tree, sessionId)

  // Don't show breadcrumb if we're at the root (path length <= 1)
  if (path.length <= 1) return null

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs overflow-x-auto">
      {path.map((node, i) => {
        const isLast = i === path.length - 1
        const label = node.title || `Session ${node.session_id.slice(0, 8)}`
        // Which provider each hop of the chain runs on; a node without one is Claude Code.
        const provider = describeSessionProvider({ id: node.provider_id }, instances)
        const badge = shouldShowProviderBadge(provider, instances) ? (
          <ProviderBadge description={provider} model={node.model} />
        ) : null

        return (
          <span key={node.session_id} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
            {isLast ? (
              <span className="text-gray-300 font-medium truncate max-w-[140px]">{label}</span>
            ) : (
              <button
                onClick={() => onNavigate(node.session_id)}
                className="text-indigo-400 hover:text-indigo-300 truncate max-w-[140px] transition-colors"
              >
                {label}
              </button>
            )}
            {badge}
          </span>
        )
      })}
    </div>
  )
}
