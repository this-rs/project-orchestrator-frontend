/**
 * SpotlightCard — a `surface` with a discreet indigo halo (10 %) that follows
 * the cursor. Copied from the site (`website/src/motion/SpotlightCard.tsx`).
 * Fine pointer only (mouse): no halo on touch, none under
 * `prefers-reduced-motion`. Without a hover the card is a plain `surface`.
 *
 * The halo is a decorative `pointer-events-none` layer: it changes no
 * content, animates nothing outside the hover, and the hover only enhances
 * colour (§10) — the card never moves or scales.
 *
 * WHERE IT IS ALLOWED (DESIGN.md § Mouvement, « Kit »): a surface that
 * appears ONCE per screen and invites a click — the page-level empty state's
 * call to action, a step of the setup assistant, a feature introduction.
 *
 * FORBIDDEN: in a list (`EntityRow`, cards in a grid, `StatCard` tiles): a
 * row's hover changes colour only (§10), and a halo per row is decoration
 * (Don'ts). Never nested in another `SpotlightCard` or on glass.
 *
 * `HaloPointer` (mounted once in MainLayout) also writes `--mx` / `--my` on
 * the hovered `.group/spot`; the local handler keeps the card correct when
 * rendered outside the layout (dialogs, tests).
 */
import { useRef, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react'
import { surface } from '../classes'

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  /** Halo radius in px (default 240). */
  radius?: number
}

export function SpotlightCard({ children, radius = 240, className = '', onPointerMove, ...rest }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  const move = (e: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(e)
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div
      ref={ref}
      onPointerMove={move}
      className={`group/spot relative overflow-hidden transition-colors hover:border-white/[0.12] ${surface} ${className}`}
      {...rest}
    >
      <div
        aria-hidden="true"
        data-spotlight-halo
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity pointer-fine:group-hover/spot:opacity-100 motion-reduce:hidden"
        style={{ background: `radial-gradient(${radius}px circle at var(--mx, 50%) var(--my, 50%), rgba(99,102,241,0.10), transparent 70%)` }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
