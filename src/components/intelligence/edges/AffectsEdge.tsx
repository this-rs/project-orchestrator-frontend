import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'
import { useAtomValue } from 'jotai'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'
import { hoveredNodeIdAtom, selectedNodeIdAtom } from '@/atoms/intelligence'

/**
 * AFFECTS edge — violet arrow showing architectural decisions impacting code.
 * Thicker and more prominent than regular edges, with a glow to emphasize importance.
 * Uses an SVG marker for the arrowhead.
 */
function AffectsEdgeComponent({
  id,
  source,
  target,
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

  // Hover/selection highlighting — read atoms directly (avoids edge object recreation on hover)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const isHoverConnected = !!hoveredNodeId && (source === hoveredNodeId || target === hoveredNodeId)
  const isSelectConnected = !!selectedNodeId && (source === selectedNodeId || target === selectedNodeId)
  const isHighlighted = isHoverConnected || isSelectConnected
  const hasAnyHighlight = !!hoveredNodeId || !!selectedNodeId
  const dimmed = hasAnyHighlight && !isHighlighted

  // WebSocket animation hints
  const wsAnim = (data as Record<string, unknown>)?._wsAnimation as string | undefined
  const isDrawIn = wsAnim === 'draw-in'
  const isFadeOut = wsAnim === 'fade-out'

  const baseOpacity = 0.8
  const opacity = isFadeOut ? 0 : dimmed ? 0.08 : baseOpacity
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
        strokeDasharray={isDrawIn ? '200' : undefined}
        strokeDashoffset={isDrawIn ? '200' : undefined}
        markerEnd={`url(#affects-arrow-${id})`}
        className="react-flow__edge-path"
        style={{
          animation: isDrawIn
            ? 'ws-edge-draw-in 0.6s ease-out forwards'
            : isFadeOut
              ? 'ws-edge-fade-out 0.4s ease-out forwards'
              : undefined,
          transition: isDrawIn || isFadeOut ? 'none' : 'opacity 200ms, stroke-width 200ms',
        }}
      />
    </>
  )
}

export const AffectsEdge = memo(AffectsEdgeComponent)
