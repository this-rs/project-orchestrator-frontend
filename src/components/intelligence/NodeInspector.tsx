import { memo, useState, useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { selectedNodeAtom, selectedNodeIdAtom } from '@/atoms/intelligence'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceNodeData, NoteNodeData, DecisionNodeData, SkillNodeData } from '@/types/intelligence'
import { notesApi } from '@/services/notes'
import {
  FileCode2,
  Box,
  StickyNote,
  Scale,
  LayoutList,
  CheckSquare,
  Brain,
  X,
  Check,
  XCircle,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  Zap,
  Eye,
  Activity,
  Tag,
  Hash,
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

const noteTypeIcons: Record<string, typeof StickyNote> = {
  gotcha: AlertTriangle,
  tip: Lightbulb,
  guideline: BookOpen,
  pattern: Zap,
  context: Eye,
  observation: Activity,
}

// ============================================================================
// MINI GAUGE
// ============================================================================

function MiniGauge({ label, value, color, max = 1 }: { label: string; value: number; color: string; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 min-w-[60px] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 min-w-[32px] text-right">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
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
// NOTE DETAIL PANEL
// ============================================================================

function NoteDetailPanel({ data, entityId }: { data: NoteNodeData; entityId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [invalidating, setInvalidating] = useState(false)
  const [actionDone, setActionDone] = useState<'confirmed' | 'invalidated' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const NoteIcon = noteTypeIcons[data.noteType] ?? StickyNote

  const handleConfirm = useCallback(async () => {
    setConfirming(true)
    setActionError(null)
    try {
      await notesApi.confirm(entityId)
      setActionDone('confirmed')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to confirm')
    } finally {
      setConfirming(false)
    }
  }, [entityId])

  const handleInvalidate = useCallback(async () => {
    setInvalidating(true)
    setActionError(null)
    try {
      await notesApi.invalidate(entityId, 'Invalidated from graph inspector')
      setActionDone('invalidated')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to invalidate')
    } finally {
      setInvalidating(false)
    }
  }, [entityId])

  return (
    <div className="space-y-3">
      {/* Type & importance row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border"
          style={{ backgroundColor: '#422006', color: '#fbbf24', borderColor: '#854d0e' }}
        >
          <NoteIcon size={10} />
          {data.noteType}
        </div>
        <StatusBadge status={data.status} />
        {data.importance && (
          <span className="text-[10px] text-slate-500">
            importance: <span className="text-slate-400 font-medium">{data.importance}</span>
          </span>
        )}
      </div>

      {/* Energy & Staleness gauges */}
      <div className="space-y-1.5">
        <MiniGauge label="Energy" value={data.energy} color="#22d3ee" />
        <MiniGauge label="Staleness" value={data.staleness} color={data.staleness > 0.7 ? '#f87171' : data.staleness > 0.4 ? '#fb923c' : '#4ade80'} />
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Tag size={10} className="text-slate-500 shrink-0" />
          {data.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Content preview */}
      <div className="bg-slate-800/50 rounded-md p-2 border border-slate-700/50">
        <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Content</p>
        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
          {data.label}
        </p>
      </div>

      {/* Action buttons */}
      {!actionDone && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            disabled={confirming || invalidating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors
              bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60 hover:text-emerald-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={12} />
            {confirming ? 'Confirming...' : 'Confirm'}
          </button>
          <button
            onClick={handleInvalidate}
            disabled={confirming || invalidating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors
              bg-red-950/60 border-red-800 text-red-400 hover:bg-red-900/60 hover:text-red-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={12} />
            {invalidating ? 'Invalidating...' : 'Invalidate'}
          </button>
        </div>
      )}

      {/* Action result */}
      {actionDone && (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border ${
          actionDone === 'confirmed'
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
            : 'bg-red-950/40 border-red-800 text-red-400'
        }`}>
          {actionDone === 'confirmed' ? <Check size={12} /> : <XCircle size={12} />}
          Note {actionDone} successfully
        </div>
      )}

      {actionError && (
        <p className="text-[10px] text-red-400 px-1">{actionError}</p>
      )}
    </div>
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
// SKILL DETAIL PANEL
// ============================================================================

function SkillDetailPanel({ data }: { data: SkillNodeData }) {
  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center gap-2">
        <StatusBadge status={data.status} />
        <span className="text-[10px] text-slate-500">
          <Hash size={9} className="inline mr-0.5" />{data.noteCount} notes
        </span>
        <span className="text-[10px] text-slate-500">
          <Zap size={9} className="inline mr-0.5" />{data.activationCount} activations
        </span>
      </div>

      {/* Energy & Cohesion */}
      <div className="space-y-1.5">
        <MiniGauge label="Energy" value={data.energy} color="#ec4899" />
        <MiniGauge label="Cohesion" value={data.cohesion} color="#a78bfa" />
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
        {entityType === 'note' ? (
          <NoteDetailPanel data={data as NoteNodeData} entityId={data.entityId} />
        ) : entityType === 'decision' ? (
          <DecisionDetailPanel data={data as DecisionNodeData} />
        ) : entityType === 'skill' ? (
          <SkillDetailPanel data={data as SkillNodeData} />
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
