/**
 * Imperative mechanics of a "reveal on entering the viewport" (Web
 * Animations), used by `Reveal`. Copied from the site
 * (`website/src/motion/armReveal.ts`); only the token import changed.
 *
 * Contract: the DOM is the final state. This module hides an element only
 * AFTER mount, and only if it is below the fold; it shows it as soon as it
 * enters, or when the effect is cleaned up. Browsers without
 * IntersectionObserver or `element.animate` show the element in place.
 */
import { EASE_CSS } from '@/utils/motion'

/** Beyond this many staggered ranks, everything arrives with the last one. */
const STAGGER_MAX = 3

export interface ArmOptions {
  /** Start translation (CSS length, e.g. `12px`). */
  x?: string
  y?: string
  /** Seconds. */
  duration: number
  delay?: number
  /** Offset between items (seconds), capped at STAGGER_MAX ranks. */
  stagger?: number
  /** Observer margin. */
  margin: string
  /** If true, also animate what is already visible at mount. */
  eager?: boolean
  /** Fade in addition to the translation (default true). */
  fade?: boolean
}

const noop = () => {}

/**
 * Prepares `items` (hidden until `trigger` is visible), then animates them.
 * Returns the cleanup (cancels everything and restores the final state).
 */
export function armReveal(trigger: Element, items: HTMLElement[], o: ArmOptions): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof items[0]?.animate !== 'function') return noop
  const vh = window.innerHeight
  if (!o.eager && trigger.getBoundingClientRect().top < vh) return noop // already on screen: touch nothing

  const from = `${o.x ?? '0px'} ${o.y ?? '0px'}`
  const fade = o.fade !== false
  const anims: Animation[] = []
  const hide = (el: HTMLElement) => {
    if (fade) el.style.opacity = '0'
    el.style.translate = from
  }
  const clear = (el: HTMLElement) => {
    el.style.opacity = ''
    el.style.translate = ''
  }
  items.forEach(hide)

  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      items.forEach((el, i) => {
        const frames: Keyframe[] = [
          { ...(fade ? { opacity: 0 } : {}), translate: from },
          { ...(fade ? { opacity: 1 } : {}), translate: '0px 0px' },
        ]
        const a = el.animate(frames, {
          duration: o.duration * 1000,
          delay: ((o.delay ?? 0) + Math.min(i, STAGGER_MAX) * (o.stagger ?? 0)) * 1000,
          easing: EASE_CSS,
          fill: 'both',
        })
        anims.push(a)
        clear(el) // the animation (fill both) holds the start state during the delay
        a.onfinish = () => a.cancel()
      })
    },
    { rootMargin: o.margin, threshold: 0 },
  )
  io.observe(trigger)

  return () => {
    io.disconnect()
    anims.forEach((a) => a.cancel())
    items.forEach(clear)
  }
}
