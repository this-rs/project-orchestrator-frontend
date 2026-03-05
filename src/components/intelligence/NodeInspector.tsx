import { memo } from 'react'
import { useAtomValue } from 'jotai'
import { selectedNodeAtom } from '@/atoms/intelligence'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceNodeData } from '@/types/intelligence'
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
import { useSetAtom } from 'jotai'
import { selectedNodeIdAtom } from '@/atoms/intelligence'

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

function NodeInspectorComponent() {
  const node = useAtomValue(selectedNodeAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)

  if (!node) return null

  const data = node.data as IntelligenceNodeData & Record<string, unknown>
  const entityType = data.entityType ?? 'file'
  const color = ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
  const Icon = entityIcons[entityType] ?? Box

  // Extract displayable properties
  const properties = Object.entries(data).filter(
    ([key]) => !['label', 'entityType', 'layer', 'entityId'].includes(key),
  )

  return (
    <div className="absolute top-3 right-3 z-10 w-72 max-h-[calc(100%-24px)] overflow-y-auto rounded-lg bg-slate-900/95 backdrop-blur-sm border border-slate-700 shadow-xl">
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

      {/* Properties */}
      <div className="p-3 space-y-2">
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
