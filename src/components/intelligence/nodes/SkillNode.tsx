import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { SkillNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { Brain } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const skillStatusColors: Record<string, string> = {
  emerging: '#FBBF24',
  active: '#EC4899',
  dormant: '#6B7280',
  archived: '#374151',
}

function SkillNodeComponent({ data, selected }: NodeProps<Node<SkillNodeData>>) {
  const size = NODE_SIZES.skill
  const color = ENTITY_COLORS.skill
  const statusColor = skillStatusColors[data.status] ?? color
  const energyScale = 0.8 + data.energy * 0.4 // 0.8 → 1.2
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex flex-col items-center justify-center gap-1 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: '50%',
        background: selected ? '#500724' : '#1a0a14',
        border: `2.5px solid ${selected ? '#F472B6' : statusColor}`,
        transform: `scale(${energyScale})`,
        boxShadow: data.energy > 0.7
          ? `0 0 18px ${color}50, inset 0 0 8px ${color}20`
          : selected
            ? `0 0 12px ${color}40`
            : undefined,
      }}
      title={`${data.label} (energy: ${(data.energy * 100).toFixed(0)}%)`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-pink-400 !border-0" />
      <Brain size={18} color={color} />
      <span className="text-[8px] text-pink-300 font-medium truncate max-w-[48px]">
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-pink-400 !border-0" />
    </div>
  )
}

export const SkillNode = memo(SkillNodeComponent)
