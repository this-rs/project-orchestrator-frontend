import { useRef, useEffect, useState } from 'react'

interface AnimatedCounterProps {
  /** Target value to animate to */
  value: number
  /** Text to show before the number */
  prefix?: string
  /** Text to show after the number */
  suffix?: string
  /** Additional CSS classes */
  className?: string
  /** Animation duration in ms (default: 800) */
  duration?: number
}

/** Whether CSS @property is supported (needed for the animation) */
const supportsProperty =
  typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function'

/**
 * Animated number counter using CSS @property + counter().
 *
 * The browser interpolates the custom property `--counter-value` from 0
 * to the target value, and `counter()` displays the integer at each frame.
 * No JS animation loop needed.
 *
 * Falls back to showing the final value instantly if @property is not supported.
 *
 * @example
 * <AnimatedCounter value={42} suffix="%" />
 * <AnimatedCounter value={1500} prefix="$" />
 */
export function AnimatedCounter({
  value,
  prefix,
  suffix,
  className = '',
  duration = 800,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [mounted, setMounted] = useState(false)

  // Trigger animation by setting --counter-value after mount
  useEffect(() => {
    // RAF ensures the initial value (0) is painted before transitioning
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Fallback: no @property support — show value directly
  if (!supportsProperty) {
    return (
      <span className={className}>
        {prefix}{value}{suffix}
      </span>
    )
  }

  return (
    <span className={className}>
      {prefix}
      <span
        ref={ref}
        className="animated-counter"
        style={{
          '--counter-value': mounted ? value : 0,
          transitionDuration: `${duration}ms`,
        } as React.CSSProperties}
        aria-label={String(value)}
      />
      {suffix}
    </span>
  )
}
