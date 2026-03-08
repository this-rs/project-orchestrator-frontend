import { memo } from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { EdgeProps, Edge } from '@xyflow/react'
import type { IntelligenceEdgeData } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'
import { useAtomValue } from 'jotai'
import { hoveredNodeIdAtom, selectedNodeIdAtom } from '@/atoms/intelligence'
import { activationStateAtom } from '../SpreadingActivation'

/**
 * Animated synapse edge — cyan pulsing edge for neural connections.
 * Weight controls both opacity (0.3–1.0) and stroke width (0.5–4px).
 * Glow layer intensity scales with weight for strong synapses.
 * During spreading activation, edges between activated nodes pulse brighter.
 */
function SynapseEdgeComponent({
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

  const style = EDGE_STYLES.SYNAPSE
  const weight = data?.weight ?? 0.5

  // Spreading activation state
  const activation = useAtomValue(activationStateAtom)
  const hasActiveSearch = activation.phase !== 'idle'
  const sourceActivated = activation.directIds.has(source) || activation.propagatedIds.has(source)
  const targetActivated = activation.directIds.has(target) || activation.propagatedIds.has(target)
  const bothActivated = sourceActivated && targetActivated
  const eitherActivated = sourceActivated || targetActivated

  // Hover/selection highlighting — read atoms directly (avoids edge object recreation on hover)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const isHoverConnected = !!hoveredNodeId && (source === hoveredNodeId || target === hoveredNodeId)
  const isSelectConnected = !!selectedNodeId && (source === selectedNodeId || target === selectedNodeId)
  const isHighlighted = isHoverConnected || isSelectConnected
  const hasAnyHighlight = !!hoveredNodeId || !!selectedNodeId
  const hoverDimmed = hasAnyHighlight && !isHighlighted && !hasActiveSearch

  // WebSocket animation hints
  const wsAnim = (data as Record<string, unknown>)?._wsAnimation as string | undefined
  const isDrawIn = wsAnim === 'draw-in'
  const isPulse = wsAnim === 'pulse'
  const isFadeOut = wsAnim === 'fade-out'

  // Determine visual mode
  let edgeColor = style.color     // cyan default
  let opacity = 0.3 + weight * 0.7
  let strokeWidth = 0.5 + weight * 3.5
  let glowWidth = strokeWidth + 2 + weight * 2
  let glowOpacity = opacity * (0.2 + weight * 0.3)
  let animSpeed = 3 - weight * 1.5

  if (hasActiveSearch) {
    if (bothActivated) {
      // Both endpoints activated — bright pulse, thicker
      edgeColor = '#22d3ee' // cyan-400
      opacity = 0.9
      strokeWidth = 2 + weight * 3
      glowWidth = strokeWidth + 4
      glowOpacity = 0.6
      animSpeed = 0.8 // very fast pulse
    } else if (eitherActivated) {
      // Partial activation — slightly visible
      opacity = 0.15
      glowOpacity = 0.05
    } else {
      // Not activated at all — dim
      opacity = 0.05
      glowOpacity = 0.01
    }
  } else if (hoverDimmed) {
    // Hover propagation: dim non-connected synapses
    opacity = 0.06
    glowOpacity = 0.01
  } else if (hasAnyHighlight && isHighlighted) {
    // Highlighted on hover — boost
    strokeWidth = strokeWidth * 1.5
    glowWidth = glowWidth * 1.3
  }

  return (
    <>
      {/* Glow layer */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth: glowWidth,
          opacity: glowOpacity,
          filter: `blur(${bothActivated ? 5 : 3 + weight * 2}px)`,
        }}
      />
      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth: isPulse ? strokeWidth * 1.8 : strokeWidth,
          opacity: isFadeOut ? 0 : opacity,
          strokeDasharray: isDrawIn ? '200' : '6 4',
          strokeDashoffset: isDrawIn ? '200' : undefined,
          animation: isDrawIn
            ? 'ws-edge-draw-in 0.6s ease-out forwards'
            : isPulse
              ? `ws-edge-pulse 0.6s ease-out, synapse-flow ${animSpeed}s linear infinite`
              : isFadeOut
                ? 'ws-edge-fade-out 0.4s ease-out forwards'
                : `synapse-flow ${animSpeed}s linear infinite`,
          transition: isFadeOut ? 'none' : undefined,
        }}
      />
    </>
  )
}

export const SynapseEdge = memo(SynapseEdgeComponent)
