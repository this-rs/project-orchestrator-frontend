/**
 * CountUp — counts from `from` to `value` in `tabular-nums`, once, when the
 * number is on screen. Copied from the site (`website/src/motion/CountUp.tsx`);
 * two adaptations: `duration` is in **ms** so it is prop-compatible with
 * `AnimatedCounter` (`value`, `prefix`, `suffix`, `className`, `duration`),
 * and `eager` defaults to `true` — the app has no prerender, so a number
 * already visible at mount is exactly the one the user came to see.
 *
 * WHERE IT IS ALLOWED (DESIGN.md § Mouvement, « Kit »): a figure of PROOF
 * that is read once — the headline counters of Today, a `StatCard` on a
 * detail page, the summary of a finished run. Ceiling 600 ms
 * (`--duration-slow`); anything longer is clamped.
 *
 * FORBIDDEN:
 *   - on live data: a token count while streaming, a cost ticking, a progress
 *     percentage, anything that re-renders many times a second — the tween
 *     would restart on every update and the number would never be true.
 *     Render the value directly (`tabular-nums`), no tween;
 *   - inside list rows (one counter per row = a page that twitches).
 *
 * The rendered text IS the final value (SSR-safe, screen readers read the
 * result); the tween only rewrites the text node, no React state. Under
 * `prefers-reduced-motion`: final value, no tween.
 */
import { useEffect, useRef } from 'react'
import { DURATION, useReducedMotion } from '@/utils/motion'

export interface CountUpProps {
  /** Target value. */
  value: number
  /** Start value (default 0). */
  from?: number
  /** Duration in ms (default 600 = `--duration-slow`, which is also the ceiling). */
  duration?: number
  /** Decimals shown. */
  decimals?: number
  /** Text before the number. */
  prefix?: string
  /** Text after the number. */
  suffix?: string
  /** Locale of the thousands separator (default `en-US`). */
  locale?: string
  /** Animate even when the number is already visible at mount (default true in the app). */
  eager?: boolean
  className?: string
}

function fmt(n: number, decimals: number, locale: string): string {
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const MAX_MS = DURATION.slow * 1000
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function CountUp({
  value,
  from = 0,
  duration = MAX_MS,
  decimals = 0,
  prefix = '',
  suffix = '',
  locale = 'en-US',
  eager = true,
  className = '',
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  const final = `${prefix}${fmt(value, decimals, locale)}${suffix}`
  const ms = Math.min(Math.max(0, duration), MAX_MS)

  useEffect(() => {
    const el = ref.current
    if (!el || reduced || ms === 0 || typeof IntersectionObserver === 'undefined') return
    if (!eager && el.getBoundingClientRect().top < window.innerHeight) return
    let raf = 0
    el.textContent = `${prefix}${fmt(from, decimals, locale)}${suffix}`
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms)
        el.textContent = `${prefix}${fmt(from + (value - from) * easeOut(t), decimals, locale)}${suffix}`
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      el.textContent = final
    }
  }, [reduced, eager, value, from, ms, decimals, prefix, suffix, locale, final])

  return (
    <span ref={ref} className={`tabular-nums ${className}`.trim()}>
      {final}
    </span>
  )
}
