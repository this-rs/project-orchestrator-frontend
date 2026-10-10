import { useId } from 'react'
import { useT } from '@/i18n'
import type { RoutedBy } from '@/types/provider'
import {
  providerBadgeUnavailableHelp,
  providerBadgeUnavailableText,
  routedByKey,
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
      title={description.unavailable ? providerBadgeUnavailableHelp() : model || undefined}
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
          <span className="shrink-0">· {providerBadgeUnavailableText()}</span>
          <span id={helpId} className="sr-only">
            {providerBadgeUnavailableHelp()}
          </span>
        </>
      )}
      {short && !description.unavailable && <span className="truncate max-w-[9rem] opacity-80">· {short}</span>}
    </span>
  )
}

/**
 * Whether a session's routing is worth a badge: only when PO decided
 * (`auto`, `fallback`) or left a reason. A session on the default path shows nothing.
 */
export function shouldShowRoutedBy(routedBy: RoutedBy | null | undefined, reason: string | null | undefined): boolean {
  return routedBy === 'auto' || routedBy === 'fallback' || !!reason
}

interface RoutedByBadgeProps {
  routedBy?: RoutedBy | null
  reason?: string | null
  className?: string
}

/** "PO chose" / "Fallback chain" / …, with the reason as tooltip. Renders nothing on the default path. */
export function RoutedByBadge({ routedBy, reason, className = '' }: RoutedByBadgeProps) {
  const { t } = useT()
  if (!shouldShowRoutedBy(routedBy, reason)) return null
  const label = t(routedByKey(routedBy))
  const title = reason ? `${label}\n${t('routing.reason', { reason })}` : label
  return (
    <span
      data-testid="routed-by-badge"
      data-routed-by={routedBy ?? undefined}
      title={title}
      className={`inline-flex min-w-0 items-center gap-1 rounded border border-violet-400/25 bg-violet-500/10 px-1 py-px text-[10px] leading-4 text-violet-300 ${className}`}
    >
      <span className="truncate max-w-[9rem]">{label}</span>
    </span>
  )
}
