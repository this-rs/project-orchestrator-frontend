import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ProtocolStateNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { Circle, Play, Square } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const stateTypeIcons: Record<string, typeof Circle> = {
  start: Play,
  intermediate: Circle,
  terminal: Square,
}

const stateTypeColors: Record<string, string> = {
  start: '#22C55E',      // green — entry point
  intermediate: '#FB923C', // orange — regular state
  terminal: '#EF4444',    // red — end state
}

function ProtocolStateNodeComponent({ data, selected }: NodeProps<Node<ProtocolStateNodeData>>) {
  const size = NODE_SIZES.protocol_state
  const color = ENTITY_COLORS.protocol_state
  const stateColor = stateTypeColors[data.stateType] ?? color
  const Icon = stateTypeIcons[data.stateType] ?? Circle
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex flex-col items-center justify-center gap-0.5 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: '50%',
        background: selected ? '#431407' : '#1a0f05',
        border: `2px solid ${selected ? '#FB923C' : stateColor}`,
        boxShadow: selected
          ? `0 0 10px ${color}40`
          : undefined,
      }}
      title={`${data.label} (${data.stateType})`}
    >
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-orange-300 !border-0" />
      <Icon size={12} color={stateColor} />
      <span className="text-[6px] text-orange-200 font-medium truncate max-w-[26px]">
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-orange-300 !border-0" />
    </div>
  )
}

export const ProtocolStateNode = memo(ProtocolStateNodeComponent)
