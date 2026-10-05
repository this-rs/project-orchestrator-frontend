import { useId } from 'react'
import {
  PROVIDER_BADGE_UNAVAILABLE_HELP,
  PROVIDER_BADGE_UNAVAILABLE_TEXT,
  type SessionProviderDescription,
} from '@/constants/providers'
import { shortModelName } from './sessionListUtils'

interface ProviderBadgeProps {
  /** From `describeSessionProvider`. */
  description: SessionProviderDescription
  /** Model id; shown shortened. Omit where the model is already displayed next to the badge. */
  model?: string | null
  className?: string
}

/**
 * Which provider (and model) a conversation runs on: instance label or kind,
 * then the short model name. An instance that no longer exists is said to be
 * unavailable, with the consequence spelled out for assistive technology.
 */
export function ProviderBadge({ description, model, className = '' }: ProviderBadgeProps) {
  const helpId = useId()
  const short = model ? shortModelName(model) : null
  return (
    <span
      data-testid="provider-badge"
      data-unavailable={description.unavailable || undefined}
      aria-describedby={description.unavailable ? helpId : undefined}
      title={description.unavailable ? PROVIDER_BADGE_UNAVAILABLE_HELP : model || undefined}
      className={`inline-flex min-w-0 items-center gap-1 rounded border px-1 py-px text-[10px] leading-4 ${
        description.unavailable
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : description.isClaudeCode
            ? 'border-white/[0.08] bg-white/[0.03] text-gray-400'
            : 'border-indigo-400/25 bg-indigo-500/10 text-indigo-300'
      } ${className}`}
    >
      <span className="truncate max-w-[9rem]">{description.label}</span>
      {description.unavailable && (
        <>
          <span className="shrink-0">· {PROVIDER_BADGE_UNAVAILABLE_TEXT}</span>
          <span id={helpId} className="sr-only">
            {PROVIDER_BADGE_UNAVAILABLE_HELP}
          </span>
        </>
      )}
      {short && !description.unavailable && <span className="truncate max-w-[9rem] opacity-80">· {short}</span>}
    </span>
  )
}
