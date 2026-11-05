/**
 * DiscussionNodeRow — a single node in the discussion tree.
 *
 * Shows title, status icon, cost, duration, message count.
 * Expandable/collapsible if it has children.
 * Clickable to select and view the inline conversation.
 */

import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'
import { ProviderBadge } from '@/components/chat/ProviderBadge'
import { describeSessionProvider, shouldShowProviderBadge } from '@/constants/providers'
import { subtreeCost } from '@/utils/discussionTree'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { StopSubtreeButton } from './StopSubtreeButton'
import { costReport, costToText } from '@/utils/cost'
import { useState, type ReactNode } from 'react'
import { focusRing, pressFeedback } from '@/components/ui/classes'
import {
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Clock,
  DollarSign,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import type { DiscussionNode } from '@/services/discussions'
import { activeTranslator, useT, type MessageKey } from '@/i18n'

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

// Shape + colour + a word (sr-only in the row): never colour alone.
const statusConfig: Record<DiscussionNode['status'], { icon: typeof Circle; color: string; labelKey: MessageKey }> = {
  streaming: { icon: Loader2, color: 'text-blue-400', labelKey: 'siteRest.discussion.status.streaming' },
  completed: { icon: CheckCircle2, color: 'text-green-400', labelKey: 'siteRest.discussion.status.completed' },
  failed: { icon: XCircle, color: 'text-red-400', labelKey: 'siteRest.discussion.status.failed' },
  idle: { icon: Circle, color: 'text-gray-500', labelKey: 'siteRest.discussion.status.idle' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Indent per depth: 14 px (capped at 5 levels) so a deep node still has room for its title on a 360 px screen. */
function indentStep(depth: number): number {
  return Math.min(depth, 5) * 14
}

function formatDuration(secs: number): string {
  const t = activeTranslator().t
  const [unitS, unitM] = [t('siteRest.units.s'), t('siteRest.units.m')]
  if (secs < 60) return `${Math.round(secs)}${unitS}`
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}${unitM}${s > 0 ? ` ${s}${unitS}` : ''}`
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DiscussionNodeRowProps {
  node: DiscussionNode
  depth: number
  selectedSessionId: string | null
  onSelectNode: (sessionId: string) => void
  /** Buttons shown under the node (attach, resume...). Return null for none. */
  renderActions?: (node: DiscussionNode) => ReactNode
  /** Re-read the tree after a "Stop subtree". */
  onTreeChanged?: () => void
}

export function DiscussionNodeRow({
  node,
  depth,
  selectedSessionId,
  onSelectNode,
  renderActions,
  onTreeChanged,
}: DiscussionNodeRowProps) {
  const instances = useAtomValue(providersAtom)?.providers ?? null
  const { t } = useT()
  const [expanded, setExpanded] = useState(true)
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const isSelected = selectedSessionId === node.session_id
  const cfg = statusConfig[node.status] ?? statusConfig.idle
  const StatusIcon = cfg.icon
  const cost = costReport(node.cost_usd, node.cost_basis)
  const costText = costToText(cost, { format: formatCost })
  // A node without `provider_id` is Claude Code (a session from before providers).
  const provider = describeSessionProvider({ id: node.provider_id }, instances)
  const showBadge = shouldShowProviderBadge(provider, instances)
  const subtree = hasChildren ? subtreeCost(node) : null

  const title = node.title || node.metadata?.task_id || t('siteRest.discussion.untitled')
  const actions = renderActions?.(node)
  const { source, detail } = node.metadata ?? {}
  const indent = { paddingLeft: `${4 + indentStep(depth) + 36}px` }

  return (
    <div>
      {/* Node row. Wraps: on a phone the figures drop under the title instead of hiding. */}
      <div
        className={`
          flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 py-1 rounded-md cursor-pointer
          transition-colors duration-150
          ${isSelected
            ? 'bg-indigo-500/[0.08] border border-indigo-500/30'
            : 'hover:bg-white/[0.04] border border-transparent'
          }
        `}
        style={{ paddingLeft: `${4 + indentStep(depth)}px` }}
        onClick={() => onSelectNode(node.session_id)}
        data-testid="node-row"
        data-status={node.status}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          aria-label={expanded ? t('siteRest.discussion.collapse') : t('siteRest.discussion.expand')}
          aria-expanded={hasChildren ? expanded : undefined}
          className={`inline-flex h-9 w-7 items-center justify-center rounded flex-shrink-0 ${pressFeedback} ${focusRing} ${
            hasChildren
              ? 'text-gray-400 hover:text-gray-200 cursor-pointer'
              : 'text-transparent pointer-events-none'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setExpanded(!expanded)
          }}
          tabIndex={hasChildren ? 0 : -1}
          disabled={!hasChildren}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Status icon: colour AND a word for screen readers */}
        <StatusIcon
          aria-hidden="true"
          className={`w-4 h-4 flex-shrink-0 ${cfg.color} ${
            node.status === 'streaming' ? 'animate-spin motion-reduce:animate-none' : ''
          }`}
        />
        <span className="sr-only">{t(cfg.labelKey)}</span>

        {/* Title: wraps over two lines rather than being cut by the indentation */}
        <button
          type="button"
          aria-pressed={isSelected}
          className={`min-h-9 min-w-0 flex-1 basis-32 text-left text-sm line-clamp-2 break-words ${focusRing} ${
            isSelected ? 'text-gray-100 font-medium' : 'text-gray-300'
          }`}
          title={title}
        >
          {title}
        </button>

        {/* Figures: always visible (no hover-only information) */}
        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-400 pl-9 sm:pl-0 basis-full sm:basis-auto">
          <span
            className="flex items-center gap-1"
            aria-label={t(node.message_count === 1 ? 'siteRest.discussion.messages.one' : 'siteRest.discussion.messages.other', { count: node.message_count })}
          >
            <MessageSquare className="w-3 h-3" aria-hidden="true" />
            {node.message_count}
          </span>
          <span className="flex items-center gap-1 font-mono tabular-nums" aria-label={t('siteRest.discussion.duration', { value: formatDuration(node.duration_secs) })}>
            <Clock className="w-3 h-3" aria-hidden="true" />
            {formatDuration(node.duration_secs)}
          </span>
          {showBadge && <ProviderBadge description={provider} model={node.model} />}
          {/* No figure, no cost shown — never a `$0.00` nobody reported. */}
          {costText !== null && (
            <span className="flex items-center gap-1 font-mono tabular-nums" aria-label={t('siteRest.discussion.cost', { value: costText })}>
              <DollarSign className="w-3 h-3" aria-hidden="true" />
              <CostDisplay cost={cost} format={formatCost} />
            </span>
          )}
          {subtree?.text && (
            <span
              data-testid="node-subtree-cost"
              className="flex items-center gap-1 font-mono tabular-nums"
              aria-label={t('siteRest.discussion.subtreeCost', { value: subtree.text })}
            >
              Σ {subtree.text}
            </span>
          )}
        </div>
      </div>

      {(source || detail) && (
        <p className="pr-3 text-xs leading-4 text-gray-400 break-words" style={indent} data-testid="node-detail">
          {source && <span className="mr-2 text-gray-400">{source}</span>}
          {detail}
        </p>
      )}
      {actions && (
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1 pb-1 pr-3" style={indent} data-testid="node-actions">
          {actions}
        </div>
      )}

      <div className="pr-3" style={indent}>
        <StopSubtreeButton node={node} onStopped={onTreeChanged} />
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <DiscussionNodeRow
              key={child.session_id}
              node={child}
              depth={depth + 1}
              selectedSessionId={selectedSessionId}
              onSelectNode={onSelectNode}
              renderActions={renderActions}
              onTreeChanged={onTreeChanged}
            />
          ))}
        </div>
      )}
    </div>
  )
}
