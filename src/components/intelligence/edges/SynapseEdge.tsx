import { memo } from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'

/**
 * Animated synapse edge — cyan pulsing edge for neural connections.
 * Weight controls opacity and stroke width.
 */
function SynapseEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<IntelligenceEdgeData>>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const style = EDGE_STYLES.SYNAPSE
  const weight = data?.weight ?? 0.5
  const opacity = 0.3 + weight * 0.7

  return (
    <>
      {/* Glow layer */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth: style.strokeWidth + 2,
          opacity: opacity * 0.3,
          filter: 'blur(3px)',
        }}
      />
      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth: style.strokeWidth,
          opacity,
          strokeDasharray: '6 4',
          animation: 'synapse-flow 2s linear infinite',
        }}
      />
    </>
  )
}

export const SynapseEdge = memo(SynapseEdgeComponent)
