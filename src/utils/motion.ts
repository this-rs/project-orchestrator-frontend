import { useEffect, useState } from 'react'
import type { Variants, Transition } from 'motion/react'

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

// ---- Static variants (for reduced motion) ----

const noOp: Variants = {
  hidden: {},
  visible: {},
  exit: {},
}

/** Returns static (no-op) variants if reduced motion is preferred */
export function useVariants<T extends Record<string, Variants>>(
  variants: T,
): T {
  const reduced = useReducedMotion()
  if (!reduced) return variants

  const static_: Record<string, Variants> = {}
  for (const key of Object.keys(variants)) {
    static_[key] = noOp
  }
  return static_ as T
}
