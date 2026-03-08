import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { IntelligenceNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { useWsAnimation } from '../useWsAnimation'

function EnumNodeComponent({ data, selected }: NodeProps<Node<IntelligenceNodeData>>) {
  const size = NODE_SIZES.enum
  const color = ENTITY_COLORS.enum
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="relative flex items-center justify-center transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        background: selected ? '#1e2030' : '#0f172a',
        border: `1.5px solid ${selected ? '#94A3B8' : color}`,
        borderRadius: 6,
        boxShadow: selected ? `0 0 8px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-slate-400 !border-0" />
      <span style={{ fontSize: 8, color }} className="font-mono font-bold">E</span>
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-slate-400 !border-0" />
    </div>
  )
}

export const EnumNode = memo(EnumNodeComponent)
