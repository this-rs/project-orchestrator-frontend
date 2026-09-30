import { Children, Fragment, isValidElement, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { formatAbsolute, formatRelativeShort } from './format'

/** Decorative middle-dot separator. */
export function Sep() {
  return (
    <span aria-hidden="true" className="px-1 text-gray-700 select-none">
      ·
    </span>
  )
}

interface MetaLineProps {
  /** Items to join with `·`. Falsy items (null / false / '' / undefined) are skipped. */
  items?: ReactNode[]
  /** Alternative to `items`: children, each top-level child is one item. */
  children?: ReactNode
  /** `xs` = 11px (rows, default), `sm` = 12px (page headers / key facts). */
  size?: 'xs' | 'sm'
  /**
   * `dots` (default) joins items with `·`. `facts` is the list-card style: no
   * separators, 12px, roomy gaps — pair every item with an icon (`Fact`) so the
   * eye can tell them apart. Items that render nothing (e.g. a `PriorityText`
   * with no priority) collapse instead of leaving a stray gap.
   */
  variant?: 'dots' | 'facts'
  className?: string
}

function isEmpty(node: ReactNode): boolean {
  return node === null || node === undefined || node === false || node === '' || node === true
}

/**
 * One muted metadata line: `scope · 3 tasks · P8 · 2d`. Wraps on small
 * screens instead of truncating (items stay whole); keep each item short.
 */
export function MetaLine({ items, children, size = 'xs', variant = 'dots', className = '' }: MetaLineProps) {
  const list = (items ?? Children.toArray(children)).filter((n) => !isEmpty(n))
  if (list.length === 0) return null
  if (variant === 'facts') {
    return (
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 text-xs leading-4 text-gray-400 ${className}`}>
        {list.map((item, i) => (
          <span
            key={isValidElement(item) && item.key != null ? item.key : i}
            className="inline-flex items-center gap-1 min-w-0 max-w-full empty:hidden"
          >
            {item}
          </span>
        ))}
      </div>
    )
  }
  const text = size === 'sm' ? 'text-xs leading-5' : 'text-[11px] leading-4'
  return (
    <div className={`flex flex-wrap items-center gap-y-0.5 min-w-0 text-gray-500 ${text} ${className}`}>
      {list.map((item, i) => (
        <Fragment key={isValidElement(item) && item.key != null ? item.key : i}>
          {i > 0 && <Sep />}
          <span className="inline-flex items-center gap-1 min-w-0 max-w-full">{item}</span>
        </Fragment>
      ))}
    </div>
  )
}

interface RelativeTimeProps {
  date: string | number | Date | null | undefined
  /** Text before the value, e.g. `updated `. */
  prefix?: string
  className?: string
}

/** `<time>` showing `3h` / `12 Sep`, full date on hover / to screen readers via title. */
export function RelativeTime({ date, prefix = '', className = '' }: RelativeTimeProps) {
  if (date === null || date === undefined || date === '') return null
  const short = formatRelativeShort(date)
  if (!short) return null
  const iso = new Date(date).toISOString()
  return (
    <time dateTime={iso} title={formatAbsolute(date)} className={`tabular-nums whitespace-nowrap ${className}`}>
      {prefix}
      {short}
    </time>
  )
}

interface FactProps {
  /** Leading glyph (decorative) — gives each fact its own visual anchor. */
  icon?: LucideIcon
  /** Tooltip naming the fact (`Project`, `Assignee`…), also read by assistive tech when there is no label. */
  title?: string
  /** Truncate long values (paths, names) at this max width; the full value stays in `title`. */
  truncateAt?: string
  mono?: boolean
  className?: string
  children: ReactNode
}

/**
 * One fact of a list card: `▣ Frontend`, `@ claude`, `⏱ due 12 Oct`. Muted
 * icon, readable value (gray-300), optional truncation for long values.
 */
export function Fact({ icon: Icon, title, truncateAt, mono, className = '', children }: FactProps) {
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 max-w-full ${className}`} title={title}>
      {Icon && <Icon className="w-3 h-3 shrink-0 text-gray-500" aria-hidden="true" />}
      <span
        className={`min-w-0 text-gray-300 ${mono ? 'font-mono' : ''} ${truncateAt ? `truncate ${truncateAt}` : 'break-words'}`}
      >
        {children}
      </span>
    </span>
  )
}
