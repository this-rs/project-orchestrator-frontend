import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { FileNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { FileCode2 } from 'lucide-react'

const riskColors: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#6B7280',
}

function FileNodeComponent({ data, selected }: NodeProps<Node<FileNodeData>>) {
  const size = NODE_SIZES.file
  const color = ENTITY_COLORS.file
  const riskBorder = data.riskLevel ? riskColors[data.riskLevel] : color
  return (
    <div
      className="relative flex flex-col items-center justify-center transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 6,
        background: selected ? '#1e3a5f' : '#0f172a',
        border: `2px solid ${selected ? '#60A5FA' : riskBorder}`,
        boxShadow: selected ? `0 0 12px ${color}40` : undefined,
      }}
      title={data.path ?? data.label}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-blue-400 !border-0" />
      <FileCode2 size={16} color={color} />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-blue-400 !border-0" />
    </div>
  )
}

export const FileNode = memo(FileNodeComponent)
