import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { BaseNodeData } from '@/types/intelligence'
import { NODE_SIZES } from '@/constants/intelligence'
import { Boxes } from 'lucide-react'
import { useWsAnimation } from '../useWsAnimation'

interface FeatureGraphNodeData extends BaseNodeData {
  entityType: 'feature_graph'
  layer: 'code'
  description?: string
  entity_count?: number
  entry_function?: string
}

const COLOR = '#818CF8' // indigo-400 — distinct from file (blue) and function (cyan)

function FeatureGraphNodeComponent({ data, selected }: NodeProps<Node<FeatureGraphNodeData>>) {
  const size = NODE_SIZES.feature_graph ?? { width: 56, height: 40 }
  const animRef = useWsAnimation(data as Record<string, unknown>)

  return (
    <div
      ref={animRef}
      className="flex flex-col items-center justify-center gap-0.5 transition-all duration-150"
      style={{
        width: size.width,
        height: size.height,
        borderRadius: 8,
        background: selected ? '#1e1b4b' : '#0f0d2e',
        border: `2px solid ${selected ? '#A5B4FC' : COLOR}`,
        boxShadow: selected
          ? `0 0 14px ${COLOR}50`
          : data.entity_count && data.entity_count > 5
            ? `0 0 8px ${COLOR}25`
            : undefined,
      }}
      title={`${data.label}${data.entity_count ? ` (${data.entity_count} entities)` : ''}${data.entry_function ? ` — entry: ${data.entry_function}` : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-indigo-400 !border-0" />
      <Boxes size={14} color={COLOR} />
      <span
        className="text-[7px] font-medium truncate max-w-[48px]"
        style={{ color: '#C7D2FE' }}
      >
        {data.label}
      </span>
      {data.entity_count != null && (
        <span className="text-[6px] text-indigo-400/60 font-mono">{data.entity_count}e</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-indigo-400 !border-0" />
    </div>
  )
}

export const FeatureGraphNode = memo(FeatureGraphNodeComponent)
