/**
 * KnowledgeCardViz — Inline card for displaying a knowledge note or decision.
 *
 * Shows type icon, importance badge, content preview, tags, and linked entities.
 *
 * Data schema (from backend build_knowledge_card_viz):
 * {
 *   entity_type: "note" | "decision",
 *   entity_id: string,
 *   kind: string,         // note_type or "decision"
 *   content: string,
 *   importance: string,    // critical, high, medium, low
 *   tags: string[],
 *   linked_entities: string[]
 * }
 */
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Lightbulb,
  AlertTriangle,
  BookOpen,
  Puzzle,
  FileText,
  Tag,
  Link2,
  ChevronDown,
  ChevronRight,
  Zap,
  Eye,
  MessageSquare,
} from 'lucide-react'
import type { VizBlockProps } from './registry'

// ============================================================================
// Helpers
// ============================================================================

const KIND_CONFIG: Record<string, { icon: typeof Lightbulb; color: string; borderColor: string; bgColor: string }> = {
  guideline: { icon: BookOpen, color: 'text-blue-400', borderColor: 'border-l-blue-500/40', bgColor: 'bg-blue-500/5' },
  gotcha: { icon: AlertTriangle, color: 'text-amber-400', borderColor: 'border-l-amber-500/40', bgColor: 'bg-amber-500/5' },
  pattern: { icon: Puzzle, color: 'text-purple-400', borderColor: 'border-l-purple-500/40', bgColor: 'bg-purple-500/5' },
  context: { icon: Eye, color: 'text-cyan-400', borderColor: 'border-l-cyan-500/40', bgColor: 'bg-cyan-500/5' },
  tip: { icon: Lightbulb, color: 'text-emerald-400', borderColor: 'border-l-emerald-500/40', bgColor: 'bg-emerald-500/5' },
  observation: { icon: MessageSquare, color: 'text-gray-400', borderColor: 'border-l-gray-500/40', bgColor: 'bg-gray-500/5' },
  assertion: { icon: Zap, color: 'text-yellow-400', borderColor: 'border-l-yellow-500/40', bgColor: 'bg-yellow-500/5' },
  decision: { icon: BookOpen, color: 'text-indigo-400', borderColor: 'border-l-indigo-500/40', bgColor: 'bg-indigo-500/5' },
}

const IMPORTANCE_BADGES: Record<string, { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: 'bg-red-900/50 text-red-400 ring-red-500/20' },
  high: { label: 'HIGH', color: 'bg-yellow-900/50 text-yellow-400 ring-yellow-500/20' },
  medium: { label: 'MEDIUM', color: 'bg-blue-900/50 text-blue-400 ring-blue-500/20' },
  low: { label: 'LOW', color: 'bg-white/[0.08] text-gray-400 ring-gray-500/20' },
}

function getKindConfig(kind: string) {
  return KIND_CONFIG[kind] ?? { icon: FileText, color: 'text-gray-400', borderColor: 'border-l-gray-500/30', bgColor: 'bg-white/[0.02]' }
}

// ============================================================================
// Main component
// ============================================================================

export function KnowledgeCardViz({ data, expanded = false }: VizBlockProps) {
  const [isExpanded, setIsExpanded] = useState(expanded)

  const kind = (data.kind as string) ?? 'note'
  const content = (data.content as string) ?? ''
  const importance = (data.importance as string) ?? 'medium'
  const tags = (data.tags as string[]) ?? []
  const linkedEntities = (data.linked_entities as string[]) ?? []

  const cfg = getKindConfig(kind)
  const Icon = cfg.icon
  const impBadge = IMPORTANCE_BADGES[importance]

  // Truncate content in compact mode
  const MAX_COMPACT_LENGTH = 200
  const isLong = content.length > MAX_COMPACT_LENGTH
  const displayContent = !isExpanded && isLong
    ? content.slice(0, MAX_COMPACT_LENGTH) + '…'
    : content

  return (
    <div className={`rounded-lg border-l-2 ${cfg.borderColor} ${cfg.bgColor} border border-white/[0.06] overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${cfg.color}`}>
          {kind}
        </span>

        {impBadge && (
          <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-bold ring-1 ring-inset ${impBadge.color}`}>
            {impBadge.label}
          </span>
        )}

        {isLong && !expanded && (
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Content */}
      <div className={`px-3 py-2 text-xs text-gray-300 ${!isExpanded ? 'max-h-[160px] overflow-y-auto' : ''}`}>
        <div className="prose prose-invert prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayContent}
          </ReactMarkdown>
        </div>
      </div>

      {/* Footer: tags + linked entities */}
      {(tags.length > 0 || linkedEntities.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-1.5 border-t border-white/[0.04] text-[10px] text-gray-500">
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag className="w-2.5 h-2.5 shrink-0" />
              {tags.map((tag, i) => (
                <span key={i} className="bg-white/[0.06] px-1.5 py-0 rounded text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {linkedEntities.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap ml-auto">
              <Link2 className="w-2.5 h-2.5 shrink-0" />
              {linkedEntities.slice(0, expanded ? linkedEntities.length : 3).map((entity, i) => (
                <span key={i} className="text-indigo-400/70 truncate max-w-[120px]" title={entity}>
                  {entity.split('/').pop()}
                </span>
              ))}
              {!expanded && linkedEntities.length > 3 && (
                <span className="text-gray-600">+{linkedEntities.length - 3}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
