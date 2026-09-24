import { Children, Fragment, isValidElement, type ReactNode } from 'react'
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
  className?: string
}

function isEmpty(node: ReactNode): boolean {
  return node === null || node === undefined || node === false || node === '' || node === true
}

/**
 * One muted metadata line: `scope · 3 tasks · P8 · 2d`. Wraps on small
 * screens instead of truncating (items stay whole); keep each item short.
 */
export function MetaLine({ items, children, size = 'xs', className = '' }: MetaLineProps) {
  const list = (items ?? Children.toArray(children)).filter((n) => !isEmpty(n))
  if (list.length === 0) return null
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
