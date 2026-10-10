import { memo } from 'react'
import { useT } from '@/i18n'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { FunctionNodeData } from '@/types/intelligence'
import { ENTITY_COLORS, NODE_SIZES } from '@/constants/intelligence'
import { MessageCircle } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

function FunctionNodeComponent({ data, selected }: NodeProps<Node<FunctionNodeData>>) {
  const { t } = useT()
  const size = NODE_SIZES.function
  const color = ENTITY_COLORS.function
  const animRef = useWsAnimation(data as Record<string, unknown>)

  // DISCUSSED marker: backend sends `discussed: true` in attributes
  const isDiscussed = (data as Record<string, unknown>).discussed === true

  return (
    <div
      ref={animRef}
      className="relative flex items-center justify-center rounded-full transition-[background-color,border-color,box-shadow,transform,opacity] duration-(--duration-instant)"
      style={{
        width: size.width,
        height: size.height,
        background: selected ? '#1e3a5f' : '#0f172a',
        border: `1.5px solid ${selected ? '#93C5FD' : color}`,
        boxShadow: selected ? `0 0 8px ${color}40` : undefined,
      }}
      title={`${data.label}${isDiscussed ? ` ${t('intelGraph.node.discussed')}` : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-blue-300 !border-0" />
      <span style={{ fontSize: 8, color }} className="font-mono font-bold">f</span>
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-blue-300 !border-0" />

      {/* DISCUSSED badge */}
      {isDiscussed && (
        <div
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
          style={{
            width: 10,
            height: 10,
            background: '#1e293b',
            border: '1px solid #D1D5DB',
            boxShadow: '0 0 3px rgba(209, 213, 219, 0.3)',
          }}
          title={t('intelGraph.node.discussedTitle')}
        >
          <MessageCircle size={6} color="#D1D5DB" />
        </div>
      )}
    </div>
  )
}

export const FunctionNode = memo(FunctionNodeComponent)
