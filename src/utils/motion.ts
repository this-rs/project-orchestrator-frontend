import { useEffect, useState } from 'react'
import type { Variants, Transition, TargetAndTransition } from 'motion/react'

// ---- Reduced motion hook ----

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return reduced
}

// ---- Tokens (mirror of index.css --ease-standard / --duration-*) ----

/**
 * The single easing curve of the app (`--ease-standard` in index.css, the
 * site's `EASE`). Every `motion/react` transition uses it; a spring or an
 * `'easeOut'` string elsewhere is a bug (DESIGN.md § Mouvement).
 */
export const EASE = [0.22, 1, 0.36, 1] as const
/** The same curve as a CSS string (Web Animations, inline styles). */
export const EASE_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Named durations, in seconds (the CSS tokens are in ms). */
export const DURATION = {
  /** Feedback: press, toggle (`--duration-instant`). */
  instant: 0.12,
  /** Hover, menu / popover open, colour change (`--duration-fast`). */
  fast: 0.2,
  /** One state of a view giving way to another; the ceiling for anything the user triggered (`--duration-stage`). */
  stage: 0.3,
  /** Arrival of a whole block the user asked for — never a list row (`--duration-base`). */
  base: 0.4,
  /** Ceiling of any reveal: a drawn path, a counter (`--duration-slow`). */
  slow: 0.6,
  /** Aliases, by family: feedback = instant, transition = fast, exit = shorter than its entrance (`--motion-exit`). */
  feedback: 0.12,
  transition: 0.2,
  exit: 0.15,
} as const

/** Translation distances (px) of an entrance: a block rises by 12 px at most. */
export const DISTANCE = { rise: 12, nudge: 6 } as const

/** Default observer margin of `Reveal`: the block reveals when ~10% of the viewport separates it from the bottom. */
export const VIEW_MARGIN = '0px 0px -10% 0px'

// ---- Animation presets ----

const enter: Transition = { duration: DURATION.transition, ease: EASE }
const leave: Transition = { duration: DURATION.exit, ease: EASE }

/** Fade up from y=8, opacity 0→1 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: enter },
  exit: { opacity: 0, y: -4, transition: leave },
}

/** Stagger children with 30ms delay */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
}

/** Dialog scale-in: a tween on the single curve (a spring is not a curve the user can see at 200 ms). */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: enter },
  exit: { opacity: 0, scale: 0.95, transition: leave },
}

/** Backdrop fade — same timings as the panel it dims. */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: enter },
  exit: { opacity: 0, transition: leave },
}

/** Variants of a modal dialog: panel + backdrop. */
export const DIALOG_MOTION = { dialog: dialogVariants, backdrop: backdropVariants }

// ---- Reduced motion: keep the fade, drop the movement ----

/** Short tween replacing a spring under reduced motion (none of the presets above is one; callers' variants may be). */
const reducedTransition: Transition = enter

const reducedCache = new WeakMap<Variants, Variants>()

/**
 * Reduced-motion version of `variants` (DESIGN.md § Mouvement): opacity is
 * kept so the state change stays legible; x/y/scale/rotate are dropped and
 * springs become a short tween (a spring on opacity can overshoot). Never
 * empty: a dialog under reduced motion still fades, it never gets
 * `variants={undefined}`. Cached per input so the returned object is stable
 * across renders.
 */
export function stripMovement(variants: Variants): Variants {
  const cached = reducedCache.get(variants)
  if (cached) return cached
  const out: Variants = {}
  for (const [name, target] of Object.entries(variants)) {
    if (typeof target !== 'object' || target === null) {
      out[name] = target
      continue
    }
    const kept: TargetAndTransition = {}
    if ('opacity' in target) kept.opacity = target.opacity
    const t = target.transition as Transition | undefined
    if (t) kept.transition = t.type === 'spring' ? reducedTransition : t
    out[name] = kept
  }
  reducedCache.set(variants, out)
  return out
}

/** Returns opacity-only variants when reduced motion is preferred. */
export function useVariants<T extends Record<string, Variants>>(
  variants: T,
): T {
  const reduced = useReducedMotion()
  if (!reduced) return variants

  const faded: Record<string, Variants> = {}
  for (const key of Object.keys(variants)) {
    faded[key] = stripMovement(variants[key])
  }
  return faded as T
}
