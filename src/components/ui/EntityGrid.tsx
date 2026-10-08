import { Children, type ReactNode } from 'react'

/** Past this many cards the grid skips the rendering of the off-screen ones (`content-visibility`). */
const LAZY_FROM = 30

export interface EntityGridProps {
  children: ReactNode
  /** Maximum columns: 1, 2 (from 768 px) or 3 (2 from 640 px, 3 from 1280 px). Default 3. */
  columns?: 1 | 2 | 3
  /**
   * Skip rendering off-screen cards (`content-visibility: auto`). Default: on from 30 cards.
   * The halo of a card is clipped to its box when on: that is the price of a long list.
   */
  lazy?: boolean
  'aria-label'?: string
  className?: string
}

const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
} as const

/** A grid of `EntityCard`s: 1 / 2 / 3 columns, a list for assistive tech. */
export function EntityGrid({ children, columns = 3, lazy, className = '', ...rest }: EntityGridProps) {
  const isLazy = lazy ?? Children.count(children) >= LAZY_FROM
  return (
    <ul
      role="list"
      aria-label={rest['aria-label']}
      data-lazy={isLazy ? '' : undefined}
      className={`grid gap-3 ${COLS[columns]} ${isLazy ? '[&>*]:[content-visibility:auto] [&>*]:[contain-intrinsic-size:auto_168px]' : ''} ${className}`}
    >
      {children}
    </ul>
  )
}
