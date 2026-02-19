interface PulseIndicatorProps {
  /** Color variant */
  variant?: 'active' | 'pending' | 'error'
  /** Dot size in px */
  size?: number
  /** Additional CSS class on the wrapper */
  className?: string
}

const variantClasses: Record<string, { dot: string; ring: string }> = {
  active:  { dot: 'bg-green-400',  ring: 'bg-green-400' },
  pending: { dot: 'bg-yellow-400', ring: 'bg-yellow-400' },
  error:   { dot: 'bg-red-400',    ring: 'bg-red-400' },
}

/**
 * Animated pulse indicator — a solid dot with an expanding/fading ring.
 * Used to signal live/active state (chat sessions, in-progress tasks, WS status).
 *
 * The ring animation is pure CSS (@keyframes) and respects prefers-reduced-motion.
 *
 * @example
 * <PulseIndicator variant="active" />
 * <PulseIndicator variant="pending" size={10} />
 */
export function PulseIndicator({
  variant = 'active',
  size = 8,
  className = '',
}: PulseIndicatorProps) {
  const colors = variantClasses[variant] ?? variantClasses.active

  return (
    <span
      className={`pulse-indicator relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Expanding ring */}
      <span
        className={`pulse-ring absolute inset-0 rounded-full ${colors.ring} opacity-75`}
      />
      {/* Solid dot */}
      <span
        className={`relative inline-flex rounded-full w-full h-full ${colors.dot}`}
      />
    </span>
  )
}
