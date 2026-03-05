import { memo } from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'

/**
 * Animated synapse edge — cyan pulsing edge for neural connections.
 * Weight controls both opacity (0.3–1.0) and stroke width (0.5–4px).
 * Glow layer intensity scales with weight for strong synapses.
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

  // Weight → visual mapping
  const opacity = 0.3 + weight * 0.7                  // 0.3 → 1.0
  const strokeWidth = 0.5 + weight * 3.5              // 0.5px → 4px
  const glowWidth = strokeWidth + 2 + weight * 2      // extra glow for strong synapses
  const glowOpacity = opacity * (0.2 + weight * 0.3)  // stronger glow at high weight
  const animSpeed = 3 - weight * 1.5                   // faster animation for stronger synapses (1.5s → 3s)

  return (
    <>
      {/* Glow layer — stronger for high-weight synapses */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth: glowWidth,
          opacity: glowOpacity,
          filter: `blur(${3 + weight * 2}px)`,
        }}
      />
      {/* Main edge — weight drives thickness */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth,
          opacity,
          strokeDasharray: '6 4',
          animation: `synapse-flow ${animSpeed}s linear infinite`,
        }}
      />
    </>
  )
}

export const SynapseEdge = memo(SynapseEdgeComponent)
