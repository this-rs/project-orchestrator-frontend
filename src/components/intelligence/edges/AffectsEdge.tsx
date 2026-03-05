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

  const style = EDGE_STYLES.AFFECTS

  // Hover highlighting from propagation paths
  const hasHover = (data as Record<string, unknown>)?._hasHover === true
  const isHighlighted = (data as Record<string, unknown>)?._highlighted === true
  const dimmed = hasHover && !isHighlighted

  const baseOpacity = 0.8
  const opacity = dimmed ? 0.08 : baseOpacity
  const sw = isHighlighted ? style.strokeWidth * 1.4 : style.strokeWidth

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
            opacity={opacity}
          />
        </marker>
      </defs>
      {/* Glow layer */}
      {!dimmed && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: style.color,
            strokeWidth: sw + 3,
            opacity: 0.12,
            filter: 'blur(4px)',
          }}
        />
      )}
      {/* Main edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.color}
        strokeWidth={sw}
        opacity={opacity}
        markerEnd={`url(#affects-arrow-${id})`}
        className="react-flow__edge-path"
        style={{ transition: 'opacity 200ms, stroke-width 200ms' }}
      />
    </>
  )
}

export const AffectsEdge = memo(AffectsEdgeComponent)
