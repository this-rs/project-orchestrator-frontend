import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { IntelligenceNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { useWsAnimation } from '../useWsAnimation'

function TraitNodeComponent({ data, selected }: NodeProps<Node<IntelligenceNodeData>>) {
  const size = NODE_SIZES.trait
  const color = ENTITY_COLORS.trait
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="relative flex items-center justify-center transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        background: selected ? '#1e1a2e' : '#0f172a',
        border: `2px solid ${selected ? '#F87171' : color}`,
        borderRadius: '50%',
        boxShadow: selected ? `0 0 10px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-red-400 !border-0" />
      <span style={{ fontSize: 9, color }} className="font-mono font-bold">T</span>
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-red-400 !border-0" />
    </div>
  )
}

export const TraitNode = memo(TraitNodeComponent)
