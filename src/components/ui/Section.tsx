import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { focusRing } from './classes'

interface SectionProps {
  title: ReactNode
  /** Muted count after the title. */
  count?: number
  /** Right-aligned header actions: one small <Button size="sm" variant="ghost">, or an OverflowMenu. */
  action?: ReactNode
  /** Short muted line under the title. */
  description?: ReactNode
  /** Header becomes a toggle. */
  collapsible?: boolean
  defaultOpen?: boolean
  /** Anchor id (SectionNav target). */
  id?: string
  children: ReactNode
  className?: string
}

/**
 * Detail-page section: small header (title · count · action) + content.
 * No card chrome of its own — put an EntityList, Facts or a Card inside.
 */
export function Section({
  title,
  count,
  action,
  description,
  collapsible,
  defaultOpen = true,
  id,
  children,
  className = '',
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const headingId = useId()
  const isOpen = !collapsible || open

  const heading = (
    <>
      {collapsible && (
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
      )}
      <span className="truncate">{title}</span>
      {count !== undefined && <span className="tabular-nums font-normal text-gray-500">{count}</span>}
    </>
  )

  return (
    <section id={id} aria-labelledby={headingId} className={`scroll-mt-16 ${className}`}>
      <div className="flex items-center gap-2 min-h-9 mb-2">
        <div className="flex-1 min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-gray-200">
            {collapsible ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={isOpen}
                className={`inline-flex items-center gap-1.5 max-w-full rounded -mx-1 px-1 py-1 hover:text-white ${focusRing}`}
              >
                {heading}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 max-w-full">{heading}</span>
            )}
          </h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {action && <div className="shrink-0 flex items-center gap-1">{action}</div>}
      </div>
      {isOpen && children}
    </section>
  )
}

interface FactsProps {
  items: { label: string; value: ReactNode; hidden?: boolean }[]
  /** Columns on ≥ sm screens (always 1 label/value pair per line on phones). */
  columns?: 1 | 2 | 3
  className?: string
}

/**
 * Label / value list for properties on detail pages. On phones each pair is a
 * row (label left, value right, value wraps); on wider screens a grid.
 */
export function Facts({ items, columns = 2, className = '' }: FactsProps) {
  const visible = items.filter((i) => !i.hidden && i.value !== null && i.value !== undefined && i.value !== '')
  if (visible.length === 0) return null
  const cols = columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : ''
  return (
    <dl className={`grid grid-cols-1 ${cols} gap-x-6 ${className}`}>
      {visible.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between sm:justify-start gap-3 py-1.5 border-b border-white/[0.04] min-w-0">
          <dt className="shrink-0 text-xs text-gray-500 sm:w-28">{item.label}</dt>
          <dd className="min-w-0 text-sm text-gray-200 text-right sm:text-left break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
