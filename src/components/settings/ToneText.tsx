import type { ReactNode } from 'react'
import { StatusDot, TONE_CLASSES, type StatusTone } from '@/components/ui'

interface ToneTextProps {
  tone: StatusTone
  label: ReactNode
  /** Hide the dot — when the row already shows a leading `StatusDot`. */
  dot?: boolean
  /** Soft pulse for live states (reconnecting, probing…). */
  pulse?: boolean
  className?: string
}

/**
 * Dot + label in an explicit tone: the `StatusText` rule (§4) for values
 * that carry their own semantics and have no registry kind — consent,
 * circuit breaker, connection state. Local composition shared by the
 * settings-like pages; candidate for `components/ui/Status`.
 */
export function ToneText({ tone, label, dot = true, pulse, className = '' }: ToneTextProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TONE_CLASSES[tone].text} ${className}`}>
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      {label}
    </span>
  )
}
