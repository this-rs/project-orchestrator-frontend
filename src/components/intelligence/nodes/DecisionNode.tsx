import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DecisionNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { Scale } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const decisionStatusColors: Record<string, string> = {
  accepted: '#22C55E',
  proposed: '#F59E0B',
  deprecated: '#EF4444',
  superseded: '#6B7280',
}

function DecisionNodeComponent({ data, selected }: NodeProps<Node<DecisionNodeData>>) {
  const size = NODE_SIZES.decision
  const color = ENTITY_COLORS.decision
  const statusColor = decisionStatusColors[data.status] ?? color
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex items-center justify-center transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        // Diamond shape via rotation
        transform: 'rotate(45deg)',
        borderRadius: 6,
        background: selected ? '#2e1065' : '#0f0a2a',
        border: `2px solid ${selected ? '#A78BFA' : statusColor}`,
        boxShadow: selected ? `0 0 12px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-violet-400 !border-0" />
      <div style={{ transform: 'rotate(-45deg)' }}>
        <Scale size={16} color={color} />
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-violet-400 !border-0" />
    </div>
  )
}

export const DecisionNode = memo(DecisionNodeComponent)
