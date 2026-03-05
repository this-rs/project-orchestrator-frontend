import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { PlanNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { LayoutList } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const planStatusColors: Record<string, { bg: string; border: string }> = {
  draft: { bg: '#1f2937', border: '#4B5563' },
  approved: { bg: '#052e16', border: '#22C55E' },
  in_progress: { bg: '#1e1b4b', border: '#6366F1' },
  completed: { bg: '#052e16', border: '#10B981' },
  cancelled: { bg: '#450a0a', border: '#6B7280' },
}

function PlanNodeComponent({ data, selected }: NodeProps<Node<PlanNodeData>>) {
  const size = NODE_SIZES.plan
  const color = ENTITY_COLORS.plan
  const status = planStatusColors[data.status] ?? planStatusColors.draft
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex items-center gap-2 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 8,
        padding: '0 10px',
        background: selected ? '#064e3b' : status.bg,
        border: `2px solid ${selected ? '#34D399' : status.border}`,
        boxShadow: selected ? `0 0 12px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-emerald-400 !border-0" />
      <LayoutList size={14} color={color} className="shrink-0" />
      <span className="text-[10px] text-emerald-300 font-medium truncate">
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-emerald-400 !border-0" />
    </div>
  )
}

export const PlanNode = memo(PlanNodeComponent)
