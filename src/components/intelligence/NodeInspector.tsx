import { memo, type ReactNode } from 'react'
import { useT } from '@/i18n'
import { statusLabel } from './statusLabel'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { costReport, hasCost } from '@/utils/cost'
import { useAtomValue, useSetAtom } from 'jotai'
import { selectedNodeAtom, selectedNodeIdAtom } from '@/atoms/intelligence'
import { entityColor } from '@/constants/graphPalette'
import type { IntelligenceNodeData, FileNodeData, NoteNodeData, DecisionNodeData, SkillNodeData, ProtocolNodeData, PlanNodeData, TaskNodeData, ChatSessionNodeData } from '@/types/intelligence'
import { FileContextCard } from './cards/FileContextCard'
import { NoteContextCard } from './cards/NoteContextCard'
import { SkillContextCard } from './cards/SkillContextCard'
import { ProtocolContextCard } from './cards/ProtocolContextCard'
import { graphFloat, graphFieldLabel, graphField, graphValue, graphControl } from './graphSurface'
import {
  FileCode2,
  Box,
  StickyNote,
  Scale,
  LayoutList,
  CheckSquare,
  Brain,
  Workflow,
  Circle,
  X,
  ListChecks,
  Milestone,
  Package,
  GitCommitHorizontal,
  MessageSquare,
  Target,
} from 'lucide-react'

// ============================================================================
// ICONS
// ============================================================================

const entityIcons: Record<string, typeof Box> = {
  file: FileCode2,
  function: Box,
  struct: Box,
  note: StickyNote,
  decision: Scale,
  plan: LayoutList,
  task: CheckSquare,
  step: ListChecks,
  milestone: Milestone,
  release: Package,
  commit: GitCommitHorizontal,
  skill: Brain,
  protocol: Workflow,
  protocol_state: Circle,
  chat_session: MessageSquare,
}

// ============================================================================
// STATUS BADGE
// ============================================================================

type Tone = { bg: string; text: string; border: string }

/** Neutral states (draft, pending, archived…) take the PO surface and text tokens, not a grey hex. */
const NEUTRAL_TONE: Tone = { bg: 'var(--color-surface-highlight)', text: 'var(--text-secondary)', border: 'var(--border-default)' }
const DIM_TONE: Tone = { ...NEUTRAL_TONE, text: 'var(--text-tertiary)' }
/** Semantic tones: a status is its tone (green = done, amber = in motion, red = stopped). */
const GOOD: Tone = { bg: '#052e16', text: '#4ade80', border: '#166534' }
const WARN: Tone = { bg: '#422006', text: '#fbbf24', border: '#854d0e' }
const BAD: Tone = { bg: '#450a0a', text: '#f87171', border: '#991b1b' }
const REVIEW: Tone = { bg: '#431407', text: '#fb923c', border: '#9a3412' }
const INFO: Tone = { bg: '#1e3a5f', text: '#60a5fa', border: '#1e40af' }

const statusColors: Record<string, Tone> = {
  active: GOOD,
  accepted: GOOD,
  proposed: WARN,
  emerging: WARN,
  deprecated: BAD,
  superseded: { bg: '#1e1b4b', text: '#a5b4fc', border: '#3730a3' },
  dormant: NEUTRAL_TONE,
  archived: DIM_TONE,
  needs_review: REVIEW,
  stale: REVIEW,
  // PM statuses
  draft: NEUTRAL_TONE,
  approved: INFO,
  in_progress: WARN,
  completed: GOOD,
  cancelled: BAD,
  pending: NEUTRAL_TONE,
  blocked: BAD,
  failed: BAD,
  skipped: DIM_TONE,
  planned: NEUTRAL_TONE,
  released: GOOD,
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT()
  const colors = statusColors[status] ?? NEUTRAL_TONE
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {statusLabel(t, status)}
    </span>
  )
}

// ============================================================================
// SHARED FIELD — one hierarchy for every detail: label (level 3) then value (level 4)
// ============================================================================

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={graphField}>
      <p className={`${graphFieldLabel} mb-1`}>{label}</p>
      <div className={`${graphValue} whitespace-pre-wrap`}>{children}</div>
    </div>
  )
}

// ============================================================================
// DECISION DETAIL PANEL
// ============================================================================

function DecisionDetailPanel({ data }: { data: DecisionNodeData }) {
  const { t } = useT()
  /** Status dot: semantic for the four decision states, the decision hue for an unknown one. */
  const decisionStatusColors: Record<string, string> = {
    accepted: '#22C55E',
    proposed: '#F59E0B',
    deprecated: '#EF4444',
    superseded: 'var(--text-tertiary)',
  }
  const statusColor = decisionStatusColors[data.status] ?? entityColor('decision')
  const decisionHue = entityColor('decision')

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center gap-2">
        <StatusBadge status={data.status} />
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* Chosen option — the decision's own hue, so it reads as the decision */}
      {data.chosenOption && (
        <div
          className="rounded-lg border p-2.5"
          style={{ backgroundColor: `${decisionHue}14`, borderColor: `${decisionHue}55` }}
        >
          <p className={`${graphFieldLabel} mb-1`} style={{ color: decisionHue }}>{t('intelGraph.inspector.chosenOption')}</p>
          <p className={graphValue}>{data.chosenOption}</p>
        </div>
      )}

      {/* Description (from label) */}
      <Field label={t('intelGraph.inspector.description')}>
        <span className="block line-clamp-6">{data.label}</span>
      </Field>
    </div>
  )
}

// ============================================================================
// PM DETAIL PANELS
// ============================================================================

function PlanDetailPanel({ data }: { data: PlanNodeData }) {
  const { t } = useT()
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={data.status} />
        <span className="text-[10px] text-[var(--text-tertiary)]">{t('intelGraph.inspector.priority', { value: data.priority })}</span>
      </div>
      {data.taskCount !== undefined && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Target size={12} />
          <span>{t(data.taskCount === 1 ? 'intelGraph.inspector.tasksOne' : 'intelGraph.inspector.tasksOther', { n: data.taskCount })}</span>
        </div>
      )}
      <Field label={t('intelGraph.inspector.title')}>{data.label}</Field>
    </div>
  )
}

function TaskDetailPanel({ data }: { data: TaskNodeData }) {
  const { t } = useT()
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={data.status} />
        {data.priority !== undefined && (
          <span className="text-[10px] text-[var(--text-tertiary)]">{t('intelGraph.inspector.priority', { value: data.priority })}</span>
        )}
      </div>
      <Field label={t('intelGraph.inspector.title')}>{data.label}</Field>
    </div>
  )
}

// ============================================================================
// CHAT DETAIL PANEL
// ============================================================================

/** Four decimals: a session's cost is often under a cent. */
const SESSION_COST_FORMAT = { format: (usd: number) => `$${usd.toFixed(4)}` } as const

function ChatSessionDetailPanel({ data }: { data: ChatSessionNodeData }) {
  const { t } = useT()
  const sessionCost = costReport(data.totalCostUsd, data.costBasis)
  return (
    <div className="space-y-3">
      {/* Key figures — two tiles, the label above the value */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[var(--color-primary-muted)] border border-[var(--color-primary)]/30 p-2.5">
          <p className={`${graphFieldLabel} text-[var(--color-primary-light)]`}>{t('intelGraph.inspector.messages')}</p>
          <p className="text-sm text-[var(--text-primary)] font-semibold">{data.messageCount}</p>
        </div>
        <div className="rounded-lg bg-[var(--color-primary-muted)] border border-[var(--color-primary)]/30 p-2.5">
          <p className={`${graphFieldLabel} text-[var(--color-primary-light)]`}>{t('intelGraph.inspector.cost')}</p>
          <p className="text-sm text-[var(--text-primary)] font-semibold">
            {hasCost(sessionCost, SESSION_COST_FORMAT) ? (
              <CostDisplay cost={sessionCost} {...SESSION_COST_FORMAT} />
            ) : (
              // No figure for this session: said as such, not as $0.0000.
              <span title={t('intelGraph.inspector.costUnknown')}>—</span>
            )}
          </p>
        </div>
      </div>
      {data.model && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className={graphFieldLabel}>{t('intelGraph.inspector.model')}</span>
          <span className="font-mono text-[var(--text-secondary)]">{data.model}</span>
        </div>
      )}
      <Field label={t('intelGraph.inspector.title')}>{data.label}</Field>
    </div>
  )
}

// ============================================================================
// GENERIC PROPERTIES PANEL (fallback)
// ============================================================================

function GenericPropertiesPanel({ data }: { data: Record<string, unknown> }) {
  const { t } = useT()
  const properties = Object.entries(data).filter(
    ([key]) => !['label', 'entityType', 'layer', 'entityId'].includes(key),
  )

  return (
    <div className="space-y-2">
      {properties.map(([key, value]) => {
        if (value === undefined || value === null) return null
        const displayValue =
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        return (
          <div key={key} className="flex items-start gap-2">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] shrink-0 pt-0.5 min-w-[80px]">
              {key}
            </span>
            <span className="text-xs text-[var(--text-secondary)] break-all">
              {displayValue}
            </span>
          </div>
        )
      })}

      {properties.length === 0 && (
        <p className="text-xs text-[var(--text-tertiary)] italic">{t('intelGraph.inspector.noProperties')}</p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN NODE INSPECTOR
// ============================================================================

interface NodeInspectorProps {
  isFullscreen?: boolean
}

function NodeInspectorComponent({ isFullscreen }: NodeInspectorProps) {
  const { t } = useT()
  const node = useAtomValue(selectedNodeAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)

  if (!node) return null

  const data = node.data as IntelligenceNodeData & Record<string, unknown>
  const entityType = data.entityType ?? 'file'
  const color = entityColor(entityType)
  const Icon = entityIcons[entityType] ?? Box

  return (
    <div className={`absolute top-14 right-3 z-30 overflow-y-auto ${graphFloat} shadow-[var(--shadow-xl)] max-w-[calc(100vw-1.5rem)] ${
      isFullscreen ? 'w-96 max-h-[calc(100%-120px)]' : 'w-80 max-h-[calc(100%-124px)]'
    }`}>
      {/* Header — title (level 1), then the kind · layer line (level 2) */}
      <div className="flex items-center gap-2 p-3 border-b border-border-default">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon size={16} color={color} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate" title={data.label}>
            {data.label}
          </p>
          <p className="text-[11px] text-[var(--text-tertiary)] truncate">
            {entityType} · {data.layer}
          </p>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          aria-label={t('intelGraph.inspector.close')}
          className={`p-1.5 rounded-md text-[var(--text-secondary)] ${graphControl}`}
        >
          <X size={14} />
        </button>
      </div>

      {/* Detail Panel — type-specific */}
      <div className="p-3">
        {entityType === 'file' ? (
          <FileContextCard data={data as FileNodeData} entityId={data.entityId} />
        ) : entityType === 'note' ? (
          <NoteContextCard data={data as NoteNodeData} entityId={data.entityId} />
        ) : entityType === 'decision' ? (
          <DecisionDetailPanel data={data as DecisionNodeData} />
        ) : entityType === 'skill' ? (
          <SkillContextCard data={data as SkillNodeData} entityId={data.entityId} />
        ) : entityType === 'protocol' ? (
          <ProtocolContextCard data={data as ProtocolNodeData} entityId={data.entityId} />
        ) : entityType === 'plan' ? (
          <PlanDetailPanel data={data as PlanNodeData} />
        ) : entityType === 'task' ? (
          <TaskDetailPanel data={data as TaskNodeData} />
        ) : entityType === 'chat_session' ? (
          <ChatSessionDetailPanel data={data as ChatSessionNodeData} />
        ) : (
          <GenericPropertiesPanel data={data} />
        )}
      </div>

      {/* Entity ID (footer) */}
      <div className="px-3 py-2 border-t border-border-default">
        <p className="text-[10px] font-mono text-[var(--text-tertiary)] truncate" title={data.entityId}>
          {data.entityId}
        </p>
      </div>
    </div>
  )
}

export const NodeInspector = memo(NodeInspectorComponent)
