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

// ---- Animation presets ----

const springTransition: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
  mass: 0.8,
}

/** Fade up from y=8, opacity 0→1 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: springTransition },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: 'easeOut' } },
}

/** Stagger children with 30ms delay */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
}

/** Dialog scale-in animation */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15, ease: 'easeOut' } },
}

/** Backdrop fade */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

/** Variants of a modal dialog: panel + backdrop. */
export const DIALOG_MOTION = { dialog: dialogVariants, backdrop: backdropVariants }

// ---- Reduced motion: keep the fade, drop the movement ----

/** Short tween replacing springs under reduced motion (transition family, in). */
const reducedTransition: Transition = { duration: 0.2, ease: 'easeOut' }

const reducedCache = new WeakMap<Variants, Variants>()

/**
 * Reduced-motion version of `variants` (DESIGN.md § Mouvement): opacity is
 * kept so the state change stays legible; x/y/scale/rotate are dropped and
 * springs become a short tween (a spring on opacity can overshoot). Cached per
 * input so the returned object is stable across renders.
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
