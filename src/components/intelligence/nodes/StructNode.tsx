import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { StructNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { Box } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

function StructNodeComponent({ data, selected }: NodeProps<Node<StructNodeData>>) {
  const size = NODE_SIZES.struct
  const color = ENTITY_COLORS.struct
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex items-center justify-center transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 4,
        background: selected ? '#1e2a5f' : '#0f172a',
        border: `2px solid ${selected ? '#818CF8' : color}`,
        boxShadow: selected ? `0 0 10px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-blue-500 !border-0" />
      <Box size={14} color={color} />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-blue-500 !border-0" />
    </div>
  )
}

export const StructNode = memo(StructNodeComponent)
