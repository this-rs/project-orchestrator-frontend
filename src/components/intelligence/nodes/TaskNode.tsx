import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { TaskNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { CheckSquare } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

const taskStatusColors: Record<string, string> = {
  pending: '#4B5563',
  in_progress: '#6366F1',
  blocked: '#D97706',
  completed: '#22C55E',
  failed: '#EF4444',
}

function TaskNodeComponent({ data, selected }: NodeProps<Node<TaskNodeData>>) {
  const size = NODE_SIZES.task
  const color = ENTITY_COLORS.task
  const statusColor = taskStatusColors[data.status] ?? color
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex flex-col items-center justify-center gap-1 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 10,
        background: selected ? '#052e16' : '#0f1f0f',
        border: `2px solid ${selected ? '#4ADE80' : statusColor}`,
        boxShadow: selected ? `0 0 10px ${color}40` : undefined,
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-green-400 !border-0" />
      <CheckSquare size={14} color={statusColor} />
      <span className="text-[8px] text-green-300 truncate max-w-[40px]">
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-green-400 !border-0" />
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
