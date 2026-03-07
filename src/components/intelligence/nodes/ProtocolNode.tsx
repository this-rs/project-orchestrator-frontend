import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ProtocolNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { Workflow } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const categoryColors: Record<string, string> = {
  system: '#3B82F6',   // blue — auto-triggered
  business: '#F97316', // orange — agent-driven
}

function ProtocolNodeComponent({ data, selected }: NodeProps<Node<ProtocolNodeData>>) {
  const size = NODE_SIZES.protocol
  const color = ENTITY_COLORS.protocol
  const catColor = categoryColors[data.category] ?? color
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex flex-col items-center justify-center gap-0.5 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 10,
        background: selected ? '#431407' : '#1a0f05',
        border: `2px solid ${selected ? '#FB923C' : catColor}`,
        boxShadow: selected
          ? `0 0 12px ${color}40`
          : data.skillId
            ? `0 0 8px ${color}25`
            : undefined,
      }}
      title={`${data.label} (${data.category})`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-orange-400 !border-0" />
      <Workflow size={16} color={catColor} />
      <span className="text-[7px] text-orange-300 font-medium truncate max-w-[56px]">
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-orange-400 !border-0" />
    </div>
  )
}

export const ProtocolNode = memo(ProtocolNodeComponent)
