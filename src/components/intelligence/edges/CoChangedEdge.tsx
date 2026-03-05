import { memo } from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'

/**
 * CO_CHANGED edge — warm orange, thickness scales with co-change count.
 * count drives strokeWidth (1→5px) and opacity (0.3→1.0).
 * A subtle glow layer appears for high-count pairs.
 */
function CoChangedEdgeComponent({
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

  const style = EDGE_STYLES.CO_CHANGED
  const count = data?.count ?? 1
  // Normalize count: 1→0, 10+→1
  const normalized = Math.min(1, Math.max(0, (count - 1) / 9))

  const strokeWidth = 1 + normalized * 4
  const opacity = 0.3 + normalized * 0.7
  const glowWidth = strokeWidth + 2 + normalized * 3
  const glowOpacity = normalized * 0.25

  return (
    <>
      {/* Glow layer for high-count pairs */}
      {normalized > 0.3 && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: style.color,
            strokeWidth: glowWidth,
            opacity: glowOpacity,
            filter: `blur(${3 + normalized * 3}px)`,
          }}
        />
      )}
      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth,
          opacity,
        }}
      />
    </>
  )
}

export const CoChangedEdge = memo(CoChangedEdgeComponent)
