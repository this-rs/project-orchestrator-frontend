import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'

/**
 * AFFECTS edge — violet arrow showing architectural decisions impacting code.
 * Thicker and more prominent than regular edges, with a glow to emphasize importance.
 * Uses an SVG marker for the arrowhead.
 */
function AffectsEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<Edge<IntelligenceEdgeData>>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const style = EDGE_STYLES.AFFECTS

  return (
    <>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={`affects-arrow-${id}`}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill={style.color}
            opacity={0.8}
          />
        </marker>
      </defs>
      {/* Glow layer */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth: style.strokeWidth + 3,
          opacity: 0.12,
          filter: 'blur(4px)',
        }}
      />
      {/* Main edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.color}
        strokeWidth={style.strokeWidth}
        opacity={0.8}
        markerEnd={`url(#affects-arrow-${id})`}
        className="react-flow__edge-path"
      />
    </>
  )
}

export const AffectsEdge = memo(AffectsEdgeComponent)
