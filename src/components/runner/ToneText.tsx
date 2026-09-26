import { StatusDot, TONE_CLASSES } from '@/components/ui'
import type { ToneMeta } from './shared'

/**
 * Dot + label in a status tone, for runner states that are not in the UI
 * status registry (budget_exceeded, agent "spawning", wave states…).
 * The dot pulses only while `meta.live` — idle states stay still.
 */
export function ToneText({ meta, className = '' }: { meta: ToneMeta; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TONE_CLASSES[meta.tone].text} ${className}`}>
      <StatusDot tone={meta.tone} pulse={meta.live} />
      {meta.label}
    </span>
  )
}
