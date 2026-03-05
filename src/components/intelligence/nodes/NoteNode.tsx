import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { NoteNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { StickyNote, AlertTriangle, Lightbulb, BookOpen } from 'lucide-react'

const noteIcons: Record<string, typeof StickyNote> = {
  gotcha: AlertTriangle,
  tip: Lightbulb,
  guideline: BookOpen,
}

const importanceOpacity: Record<string, number> = {
  critical: 1,
  high: 0.9,
  medium: 0.7,
  low: 0.5,
}

function NoteNodeComponent({ data, selected }: NodeProps<Node<NoteNodeData>>) {
  const size = NODE_SIZES.note
  const color = ENTITY_COLORS.note
  const Icon = noteIcons[data.noteType] ?? StickyNote
  const opacity = importanceOpacity[data.importance] ?? 0.7
  const energyGlow = data.energy > 0.7

  return (
    <div
      className="flex items-center justify-center transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: '50%',
        background: selected ? '#422006' : '#1a1400',
        border: `2px solid ${selected ? '#FBBF24' : color}`,
        opacity,
        boxShadow: energyGlow
          ? `0 0 14px ${color}60`
          : selected
            ? `0 0 8px ${color}40`
            : undefined,
      }}
      title={`[${data.noteType}] ${data.label}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-amber-400 !border-0" />
      <Icon size={14} color={color} />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-amber-400 !border-0" />
    </div>
  )
}

export const NoteNode = memo(NoteNodeComponent)
