import { memo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { selectedNodeAtom, selectedNodeIdAtom } from '@/atoms/intelligence'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceNodeData, FileNodeData, NoteNodeData, DecisionNodeData, SkillNodeData } from '@/types/intelligence'
import { FileContextCard } from './cards/FileContextCard'
import { NoteContextCard } from './cards/NoteContextCard'
import { SkillContextCard } from './cards/SkillContextCard'
import {
  FileCode2,
  Box,
  StickyNote,
  Scale,
  LayoutList,
  CheckSquare,
  Brain,
  X,
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
  skill: Brain,
}

// ============================================================================
// STATUS BADGE
// ============================================================================

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: '#052e16', text: '#4ade80', border: '#166534' },
  accepted: { bg: '#052e16', text: '#4ade80', border: '#166534' },
  proposed: { bg: '#422006', text: '#fbbf24', border: '#854d0e' },
  emerging: { bg: '#422006', text: '#fbbf24', border: '#854d0e' },
  deprecated: { bg: '#450a0a', text: '#f87171', border: '#991b1b' },
  superseded: { bg: '#1e1b4b', text: '#a5b4fc', border: '#3730a3' },
  dormant: { bg: '#1e293b', text: '#94a3b8', border: '#334155' },
  archived: { bg: '#1e293b', text: '#64748b', border: '#334155' },
  needs_review: { bg: '#431407', text: '#fb923c', border: '#9a3412' },
  stale: { bg: '#431407', text: '#fb923c', border: '#9a3412' },
}

function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] ?? { bg: '#1e293b', text: '#94a3b8', border: '#334155' }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {status}
    </span>
  )
}

// ============================================================================
// DECISION DETAIL PANEL
// ============================================================================

function DecisionDetailPanel({ data }: { data: DecisionNodeData }) {
  const decisionStatusColors: Record<string, string> = {
    accepted: '#22C55E',
    proposed: '#F59E0B',
    deprecated: '#EF4444',
    superseded: '#6B7280',
  }
  const statusColor = decisionStatusColors[data.status] ?? '#8B5CF6'

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

      {/* Chosen option */}
      {data.chosenOption && (
        <div className="bg-violet-950/30 rounded-md p-2 border border-violet-800/40">
          <p className="text-[10px] text-violet-400 mb-1 font-medium uppercase tracking-wider">Chosen Option</p>
          <p className="text-xs text-slate-300 leading-relaxed">{data.chosenOption}</p>
        </div>
      )}

      {/* Description (from label) */}
      <div className="bg-slate-800/50 rounded-md p-2 border border-slate-700/50">
        <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Description</p>
        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
          {data.label}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// GENERIC PROPERTIES PANEL (fallback)
// ============================================================================

function GenericPropertiesPanel({ data }: { data: Record<string, unknown> }) {
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
            <span className="text-[10px] font-mono text-slate-500 shrink-0 pt-0.5 min-w-[80px]">
              {key}
            </span>
            <span className="text-xs text-slate-300 break-all">
              {displayValue}
            </span>
          </div>
        )
      })}

      {properties.length === 0 && (
        <p className="text-xs text-slate-500 italic">No additional properties</p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN NODE INSPECTOR
// ============================================================================

function NodeInspectorComponent() {
  const node = useAtomValue(selectedNodeAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)

  if (!node) return null

  const data = node.data as IntelligenceNodeData & Record<string, unknown>
  const entityType = data.entityType ?? 'file'
  const color = ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
  const Icon = entityIcons[entityType] ?? Box

  return (
    <div className="absolute top-3 right-3 z-10 w-80 max-h-[calc(100%-24px)] overflow-y-auto rounded-lg bg-slate-900/95 backdrop-blur-sm border border-slate-700 shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-700">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon size={16} color={color} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-200 truncate" title={data.label}>
            {data.label}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            {entityType} · {data.layer}
          </p>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
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
        ) : (
          <GenericPropertiesPanel data={data} />
        )}
      </div>

      {/* Entity ID (footer) */}
      <div className="px-3 py-2 border-t border-slate-700">
        <p className="text-[9px] font-mono text-slate-600 truncate" title={data.entityId}>
          {data.entityId}
        </p>
      </div>
    </div>
  )
}

export const NodeInspector = memo(NodeInspectorComponent)
