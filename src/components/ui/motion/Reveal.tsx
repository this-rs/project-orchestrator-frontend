/**
 * Reveal — fade + 12 px rise when a block enters the viewport, ONCE.
 * Copied from the site (`website/src/motion/Reveal.tsx`); the i18n RTL hook
 * is replaced by `document.dir`, and `Stagger` / `StaggerItem` are not
 * brought over (a staggered grid is a marketing device).
 *
 * WHERE IT IS ALLOWED (DESIGN.md § Mouvement, « Kit »):
 *   - the page-level empty state of a screen (`EmptyState`),
 *   - the setup assistant (`pages/setup/*`),
 *   - the headline of Today.
 *   That is a block the user asked to open, arriving once (`--duration-base`).
 *
 * FORBIDDEN — and not negotiable:
 *   - on list items, rows, cards in a list, table rows (`EntityRow`,
 *     `EntityList`, `WindowedList`): a list reloads and the entrance would
 *     replay on every refetch, shifting layout under the pointer (§8);
 *   - on anything fed by live or streaming data (chat messages, counters,
 *     status dots): update in place, no tween;
 *   - inside a dialog, menu or toast: they already have their own entrance
 *     (`popIn`, `ui-toast-in`, `DIALOG_MOTION`) — nothing is animated twice.
 *
 * `trigger="view"` (default) hides the block after mount only if it is below
 * the fold, and animates it when it scrolls in (Web Animations, on
 * `--ease-standard`). `trigger="load"` is pure CSS (`.ui-rise-in`): for a
 * block already on screen at mount, no flash, no JS. Under
 * `prefers-reduced-motion` nothing is hidden and nothing moves.
 */
import { useEffect, useRef, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { DISTANCE, DURATION, VIEW_MARGIN, useReducedMotion } from '@/utils/motion'
import { armReveal } from './armReveal'

/** `start` / `end` are logical: the block arrives from the start (left in LTR, right in RTL) or the end of the line. */
export type RevealDirection = 'up' | 'down' | 'start' | 'end' | 'none'

function offsets(direction: RevealDirection, distance: number, rtl: boolean): { x: number; y: number } {
  const side = rtl ? -1 : 1
  switch (direction) {
    case 'up':
      return { x: 0, y: distance }
    case 'down':
      return { x: 0, y: -distance }
    case 'start':
      return { x: -distance * side, y: 0 }
    case 'end':
      return { x: distance * side, y: 0 }
    default:
      return { x: 0, y: 0 }
  }
}

function isRtl(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
}

export interface RevealProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode
  /** Rendered tag (default `div`). */
  as?: ElementType
  /** Where the block comes from: `up` = it rises (default), `start` / `end` = from the start / end of the line, `none` = fade only. */
  direction?: RevealDirection
  /** Translation distance in px (default 12 — never more). */
  distance?: number
  /** Delay in seconds. */
  delay?: number
  /** Duration in seconds (default 0.4 = `--duration-base`). */
  duration?: number
  /** `view`: when entering the viewport. `load`: at mount, pure CSS (`.ui-rise-in`). */
  trigger?: 'view' | 'load'
  /** Observer margin (trigger `view`). */
  margin?: string
}

/** Fade + rise on entering the viewport, once. No effect under reduced motion. See the file header for where it is allowed. */
export function Reveal({
  children,
  as = 'div',
  direction = 'up',
  distance = DISTANCE.rise,
  delay = 0,
  duration = DURATION.base,
  trigger = 'view',
  margin = VIEW_MARGIN,
  className = '',
  style,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { x, y } = offsets(direction, Math.min(distance, DISTANCE.rise), isRtl())

  useEffect(() => {
    const el = ref.current
    if (!el || reduced || trigger !== 'view') return
    return armReveal(el, [el], { x: `${x}px`, y: `${y}px`, duration, delay, margin })
  }, [reduced, trigger, x, y, duration, delay, margin])

  const cssVars: CSSProperties | undefined =
    trigger === 'load'
      ? ({
          '--rise-x': `${x}px`,
          '--rise-y': `${y}px`,
          '--rise-duration': `${duration * 1000}ms`,
          '--rise-delay': `${delay * 1000}ms`,
        } as CSSProperties)
      : undefined

  const Tag = as as 'div'
  return (
    <Tag
      ref={ref}
      className={`${trigger === 'load' ? 'ui-rise-in' : ''} ${className}`.trim()}
      style={cssVars ? { ...cssVars, ...style } : style}
      {...rest}
    >
      {children}
    </Tag>
  )
}
