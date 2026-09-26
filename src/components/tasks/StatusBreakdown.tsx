/**
 * Compact status breakdown for a collection (tasks of a plan, steps…):
 * a static segmented hairline + one meta line of `● 3 in progress` items.
 *
 * Replaces the row of big stat cards on detail pages (DESIGN.md §3/§4 — a
 * status is a dot + text in its tone colour, never a filled surface). Not a
 * `ui/` primitive yet — composed here from StatusText / TONE_CLASSES.
 */
import { MetaLine, StatusText, TONE_CLASSES, getStatusMeta, type StatusKind } from '@/components/ui'

export interface StatusCount {
  status: string
  count: number
}

interface StatusBreakdownProps {
  kind: StatusKind
  /** Ordered counts; zero counts are skipped in the text line but keep the order. */
  counts: StatusCount[]
  className?: string
}

export function StatusBreakdown({ kind, counts, className = '' }: StatusBreakdownProps) {
  const total = counts.reduce((acc, c) => acc + c.count, 0)
  if (total === 0) return null
  const nonZero = counts.filter((c) => c.count > 0)
  const summary = nonZero.map((c) => `${c.count} ${getStatusMeta(kind, c.status).label.toLowerCase()}`).join(', ')

  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <div
        role="img"
        aria-label={summary}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
      >
        {nonZero.map((c) => (
          <span
            key={c.status}
            className={`h-full ${TONE_CLASSES[getStatusMeta(kind, c.status).tone].dot}`}
            style={{ width: `${(c.count / total) * 100}%` }}
          />
        ))}
      </div>
      <MetaLine
        items={nonZero.map((c) => (
          <StatusText
            key={c.status}
            kind={kind}
            status={c.status}
            label={`${c.count} ${getStatusMeta(kind, c.status).label.toLowerCase()}`}
          />
        ))}
      />
    </div>
  )
}
