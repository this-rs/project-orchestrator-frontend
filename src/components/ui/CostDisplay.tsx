import type { ReactNode } from 'react'
import { costEstimatedBadge, describeCost, formatCache, type CostReport, type DescribeCostOptions } from '@/utils/cost'

interface CostDisplayProps extends DescribeCostOptions {
  cost: CostReport | null | undefined
  /** Rendered before the cost, only when there is one to show (a separator, a label). */
  before?: ReactNode
  className?: string
  /** Also show the turn's prompt-cache reads and writes (a turn's result line). */
  showCache?: boolean
}

/**
 * A cost with where it comes from.
 *
 * `reported` is the amount as it has always been shown; `priced` adds an
 * "est." badge; `free` reads "local"; `subscription` reads "subscription";
 * an unknown cost shows its tokens or nothing — never "$0". The explanation is
 * a tooltip AND screen-reader text, so the badge is not the only carrier.
 */
export function CostDisplay({ cost, before, className = '', format, hideZero, showCache = false }: CostDisplayProps) {
  const described = describeCost(cost, { format, hideZero })
  if (described.text === null) return null
  // The prompt cache of the turn (CTX0-FE): what was read from it, its share, and what was
  // written — "unknown" when not reported, never 0.
  const cache = showCache ? formatCache(cost?.tokens) : null
  return (
    <>
      {before}
      <span
        data-testid="cost-display"
        data-cost-basis={described.basis ?? undefined}
        title={described.help ?? undefined}
        className={className || undefined}
      >
        {described.text}
        {described.estimated && (
          <span className="ml-1 rounded border border-white/20 px-0.5 text-[0.85em] opacity-80">{costEstimatedBadge()}</span>
        )}
        {described.help && <span className="sr-only"> ({described.help})</span>}
      </span>
      {cache && (
        <span data-testid="cost-cache" className="text-gray-500">
          · {cache}
        </span>
      )}
    </>
  )
}
