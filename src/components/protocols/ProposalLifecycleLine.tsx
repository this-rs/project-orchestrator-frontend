/**
 * ProposalLifecycleLine — where a proposal stands on its path, as ONE segmented
 * bar plus words (DESIGN.md § 7 « Progress / metrics », § 4 « never colour
 * alone »): the steps already taken, the current one, the ones to come, and a
 * sentence that says it (« Step 3 of 7 — Under review. Next: Accepted. »).
 *
 * A closed proposal (rejected / superseded) has no next step: the bar is one
 * segment in the closing tone and the sentence says why nothing is left to do.
 */
import { Check } from 'lucide-react'
import { ProgressLine, StatusIcon, StatusText, TONE_CLASSES, getStatusMeta } from '@/components/ui'
import type { RfcStatus } from '@/types/protocol'
import { LIFECYCLE_STEPS, isClosedState, lifecycleSentence } from './rfcLifecycle'

export function ProposalLifecycleLine({ status, className = '' }: { status: RfcStatus; className?: string }) {
  const closed = isClosedState(status)
  const meta = getStatusMeta('rfc', status)
  const idx = LIFECYCLE_STEPS.findIndex((s) => s.key === status)
  const n = LIFECYCLE_STEPS.length
  const stepShare = 100 / n

  const segments = closed
    ? [{ pct: 100, className: TONE_CLASSES[meta.tone].dot }]
    : [
        { pct: Math.max(0, idx) * stepShare, className: TONE_CLASSES.success.dot },
        { pct: idx >= 0 ? stepShare : 0, className: TONE_CLASSES[meta.tone].dot },
      ]
  const value = closed ? 100 : idx >= 0 ? ((idx + 1) / n) * 100 : 0

  return (
    <div className={`space-y-2 ${className}`} data-testid="proposal-lifecycle">
      <ProgressLine value={value} size="md" label={`Proposal lifecycle: ${meta.label}`} segments={segments} />
      <p className="text-sm text-gray-300">
        <StatusText kind="rfc" status={status} icon className="mr-2" />
        {lifecycleSentence(status)}
      </p>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Lifecycle steps">
        {LIFECYCLE_STEPS.map((step, i) => {
          const done = !closed && i < idx
          const current = !closed && i === idx
          return (
            <li
              key={step.key}
              aria-current={current ? 'step' : undefined}
              className={`inline-flex items-center gap-1 whitespace-nowrap ${
                current ? 'font-medium text-gray-100' : done ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              {done ? (
                <Check className="w-3 h-3" aria-hidden="true" />
              ) : current ? (
                <StatusIcon tone={meta.tone} className="w-3 h-3" />
              ) : null}
              {step.label}
              {done && <span className="sr-only"> (done)</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
