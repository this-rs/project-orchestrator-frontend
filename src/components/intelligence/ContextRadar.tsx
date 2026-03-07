/**
 * ContextRadar — Radar chart showing protocol affinity dimensions.
 *
 * Displays the 5 ContextVector dimensions (phase, structure, domain, resource,
 * lifecycle) for a protocol's relevance vector overlaid against the current
 * context. Uses the shared RadarChart component.
 */
import { memo } from 'react'
import { RadarChart } from '@/components/ui/RadarChart'
import type { RadarAxis } from '@/components/ui/RadarChart'
import type { AffinityScore, RelevanceVector } from '@/types/intelligence'

// ============================================================================
// Dimension display names
// ============================================================================

const DIMENSION_LABELS: Record<string, string> = {
  phase: 'Phase',
  structure: 'Structure',
  domain: 'Domain',
  resource: 'Resource',
  lifecycle: 'Lifecycle',
}

// ============================================================================
// Props
// ============================================================================

interface ContextRadarProps {
  /** The affinity score breakdown (from routing response) */
  affinity: AffinityScore
  /** The protocol's relevance vector */
  relevanceVector?: RelevanceVector
  /** Chart size */
  size?: 'sm' | 'md'
}

// ============================================================================
// Component
// ============================================================================

function ContextRadarComponent({ affinity, size = 'sm' }: ContextRadarProps) {
  // Build axes from affinity dimension scores — show the similarity (1 - distance)
  const axes: RadarAxis[] = affinity.dimensions.map((dim) => {
    const similarity = 1 - Math.abs(dim.context_value - dim.relevance_value)
    return {
      name: DIMENSION_LABELS[dim.name] ?? dim.name,
      value: similarity,
    }
  })

  // Color based on overall score
  const color = affinity.score >= 0.7
    ? '#22c55e' // green
    : affinity.score >= 0.4
      ? '#f59e0b' // amber
      : '#ef4444' // red

  return (
    <RadarChart
      axes={axes}
      size={size}
      color={color}
      overallScore={affinity.score}
    />
  )
}

export const ContextRadar = memo(ContextRadarComponent)
