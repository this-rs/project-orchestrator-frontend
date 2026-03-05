import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { FunctionNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'

function FunctionNodeComponent({ data, selected }: NodeProps<Node<FunctionNodeData>>) {
  const size = NODE_SIZES.function
  const color = ENTITY_COLORS.function

  return (
    <div
      className="flex items-center justify-center rounded-full transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        background: selected ? '#1e3a5f' : '#0f172a',
        border: `1.5px solid ${selected ? '#93C5FD' : color}`,
        boxShadow: selected ? `0 0 8px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-blue-300 !border-0" />
      <span style={{ fontSize: 8, color }} className="font-mono font-bold">ƒ</span>
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-blue-300 !border-0" />
    </div>
  )
}

export const FunctionNode = memo(FunctionNodeComponent)
