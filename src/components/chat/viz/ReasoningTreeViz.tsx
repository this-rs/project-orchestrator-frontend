/**
 * ReasoningTreeViz — Interactive tree visualization for reasoning chains.
 *
 * Renders a tree of knowledge graph entities (notes, decisions, files, etc.)
 * with expand/collapse, relevance scores, and entity type icons.
 *
 * Data schema (from backend ReasoningTree):
 * {
 *   tree: { roots: ReasoningNode[] },
 *   confidence: number,
 *   node_count: number,
 *   depth: number,
 *   request?: string
 * }
 *
 * ReasoningNode:
 * {
 *   entity_type: string,
 *   entity_id: string,
 *   reasoning: string,
 *   relevance: number,
 *   children: ReasoningNode[]
 * }
 */
import { useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Lightbulb,
  BookOpen,
  Code,
  Puzzle,
  CircleDot,
  Brain,
  Zap,
} from 'lucide-react'
import type { VizBlockProps } from './registry'

// ============================================================================
// Types
// ============================================================================

interface ReasoningNode {
  entity_type: string
  entity_id: string
  reasoning: string
  relevance: number
  children: ReasoningNode[]
}

// ============================================================================
// Helpers
// ============================================================================

const ENTITY_ICONS: Record<string, typeof FileText> = {
  note: Lightbulb,
  decision: BookOpen,
  file: Code,
  function: Puzzle,
  struct: CircleDot,
  skill: Brain,
  trait: Zap,
}

function getEntityIcon(type: string) {
  return ENTITY_ICONS[type] ?? FileText
}

function relevanceColor(r: number): string {
  if (r >= 0.8) return 'text-emerald-400'
  if (r >= 0.6) return 'text-yellow-400'
  if (r >= 0.4) return 'text-orange-400'
  return 'text-gray-500'
}

function relevanceBg(r: number): string {
  if (r >= 0.8) return 'bg-emerald-500/10 border-emerald-500/20'
  if (r >= 0.6) return 'bg-yellow-500/10 border-yellow-500/20'
  if (r >= 0.4) return 'bg-orange-500/10 border-orange-500/20'
  return 'bg-white/[0.04] border-white/[0.06]'
}

// ============================================================================
// TreeNode component
// ============================================================================

function TreeNodeItem({
  node,
  depth,
  expanded: expandedProp,
}: {
  node: ReasoningNode
  depth: number
  expanded: boolean
}) {
  const [isOpen, setIsOpen] = useState(expandedProp || depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const Icon = getEntityIcon(node.entity_type)

  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-white/[0.06]' : ''}>
      <div
        className={`flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors cursor-default ${depth > 0 ? 'ml-2' : ''}`}
        onClick={hasChildren ? toggle : undefined}
      >
        {/* Expand/collapse toggle */}
        <span className="mt-0.5 shrink-0 w-4">
          {hasChildren ? (
            <button onClick={toggle} className="text-gray-500 hover:text-gray-300" aria-label={isOpen ? 'Collapse' : 'Expand'}>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </span>

        {/* Entity icon */}
        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${relevanceColor(node.relevance)}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-300 truncate">{node.reasoning}</span>
            <span className={`text-[10px] font-mono shrink-0 ${relevanceColor(node.relevance)}`}>
              {(node.relevance * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            [{node.entity_type}] {node.entity_id}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child, i) => (
            <TreeNodeItem
              key={`${child.entity_id}-${i}`}
              node={child}
              depth={depth + 1}
              expanded={expandedProp}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

export function ReasoningTreeViz({ data, expanded = false }: VizBlockProps) {
  const tree = data.tree as { roots?: ReasoningNode[] } | undefined
  const confidence = (data.confidence as number) ?? 0
  const nodeCount = (data.node_count as number) ?? 0
  const treeDepth = (data.depth as number) ?? 0
  const request = data.request as string | undefined
  const roots = tree?.roots ?? []

  return (
    <div className="space-y-2">
      {/* Header stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${relevanceBg(confidence)}`}>
          <Brain className="w-3 h-3" />
          <span>Confidence: {(confidence * 100).toFixed(0)}%</span>
        </div>
        <span className="text-[10px] text-gray-500">{nodeCount} nodes · depth {treeDepth}</span>
      </div>

      {/* Query */}
      {request && (
        <div className="text-xs text-gray-400 italic px-1">
          &ldquo;{request}&rdquo;
        </div>
      )}

      {/* Tree */}
      <div className={`${!expanded ? 'max-h-[250px] overflow-y-auto' : ''}`}>
        {roots.length > 0 ? (
          roots.map((root, i) => (
            <TreeNodeItem key={`${root.entity_id}-${i}`} node={root} depth={0} expanded={expanded} />
          ))
        ) : (
          <div className="text-xs text-gray-600 italic px-2 py-4">No reasoning nodes available.</div>
        )}
      </div>
    </div>
  )
}
