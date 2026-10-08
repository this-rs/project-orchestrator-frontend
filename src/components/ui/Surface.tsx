import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { surface } from './classes'

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
  /** Rendered tag (default `div`). */
  as?: ElementType
  /** Inner padding: `none` (lists, sections that draw their own), `sm` = p-3, `md` = p-4 (default). */
  padding?: 'none' | 'sm' | 'md'
  /** Border that lightens on hover (a clickable block). Colour only: nothing moves. */
  interactive?: boolean
}

const PAD = { none: '', sm: 'p-3', md: 'p-4' } as const

/**
 * The base container: the product's `surface` recipe, opaque, no shadow, no glass.
 * Same API as the marketing site's `Surface`, so a block moves between the two unchanged.
 */
export function Surface({ children, as, padding = 'md', interactive, className = '', ...rest }: SurfaceProps) {
  const Tag = (as ?? 'div') as ElementType<HTMLAttributes<HTMLElement> & { children?: ReactNode }>
  return (
    <Tag
      className={`${surface} ${PAD[padding]} ${interactive ? 'transition-colors hover:border-white/[0.12]' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
