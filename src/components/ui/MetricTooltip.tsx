import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'
import { getGlossaryEntry } from '../../lib/glossary'
import type { GlossaryTerm } from '../../lib/glossary'

interface MetricTooltipProps {
  /** Glossary term key (e.g. "energy", "cohesion", "synapse") */
  term: GlossaryTerm
  /** Override the tooltip text (uses glossary description by default) */
  description?: string
  /** Content to wrap with the tooltip */
  children: ReactNode
  /** Show a dotted underline to indicate the term is hoverable */
  showIndicator?: boolean
  /** Tooltip position */
  position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * Wrapper that adds an explanatory tooltip for any technical term from the glossary.
 * Use this around any jargon or metric label to make it accessible to all users.
 *
 * @example
 * <MetricTooltip term="energy">
 *   <span>Energy: 0.85</span>
 * </MetricTooltip>
 *
 * @example
 * <MetricTooltip term="cohesion" showIndicator>
 *   Cohésion
 * </MetricTooltip>
 */
export function MetricTooltip({
  term,
  description,
  children,
  showIndicator = false,
  position = 'top',
}: MetricTooltipProps) {
  const entry = getGlossaryEntry(term)
  const tooltipText = description ?? entry?.description ?? term

  if (showIndicator) {
    return (
      <Tooltip content={tooltipText} position={position}>
        <span className="decoration-dotted decoration-gray-500 underline underline-offset-2 cursor-help">
          {children}
        </span>
      </Tooltip>
    )
  }

  return (
    <Tooltip content={tooltipText} position={position}>
      {children}
    </Tooltip>
  )
}
