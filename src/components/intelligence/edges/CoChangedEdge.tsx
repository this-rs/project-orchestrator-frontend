import { memo } from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import { useAtomValue } from 'jotai'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'
import { hoveredNodeIdAtom, selectedNodeIdAtom } from '@/atoms/intelligence'

/**
 * CO_CHANGED edge — warm orange, thickness scales with co-change count.
 * count drives strokeWidth (1→5px) and opacity (0.3→1.0).
 * A subtle glow layer appears for high-count pairs.
 */
function CoChangedEdgeComponent({
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

  const style = EDGE_STYLES.CO_CHANGED
  const count = data?.count ?? 1
  // Normalize count: 1→0, 10+→1
  const normalized = Math.min(1, Math.max(0, (count - 1) / 9))

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

  const strokeWidth = 1 + normalized * 4
  const baseOpacity = 0.3 + normalized * 0.7
  const opacity = isFadeOut ? 0 : dimmed ? 0.08 : baseOpacity
  const glowWidth = strokeWidth + 2 + normalized * 3
  const glowOpacity = dimmed ? 0 : normalized * 0.25

  return (
    <>
      {/* Glow layer for high-count pairs */}
      {normalized > 0.3 && !dimmed && (
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
          strokeWidth: isHighlighted ? strokeWidth * 1.5 : strokeWidth,
          opacity,
          strokeDasharray: isDrawIn ? '200' : undefined,
          strokeDashoffset: isDrawIn ? '200' : undefined,
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

export const CoChangedEdge = memo(CoChangedEdgeComponent)
