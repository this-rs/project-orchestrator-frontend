import { AlertTriangle, X } from 'lucide-react'
import type { ChatSessionOpenError } from '@/atoms'
import { ProviderStateCard } from './ProviderStateCard'
import type { ProviderFallback } from '@/types/provider'
import { panelGlass } from '@/components/ui/panelGlass'

interface SessionOpenErrorProps {
  error: ChatSessionOpenError
  onDismiss: () => void
  /** Send the unsent message again. */
  onRetry?: () => void
  /** Send the unsent message again on this model (a vault-free fallback). */
  onRetryWith?: (fallback: ProviderFallback) => void
  /** Project the conversation was about (names it in the consent card). */
  projectSlug?: string | null
}

/**
 * A conversation that could not be opened, said above the composer.
 *
 * The unsent text is already back in the composer, so this only has to say
 * why — and, when the server typed the failure, what to do about it: one card
 * per `error.info.code` (`ProviderStateCard`). An untyped failure keeps the
 * plain alert with the server's sentence.
 */
export function SessionOpenError({ error, onDismiss, onRetry, onRetryWith, projectSlug }: SessionOpenErrorProps) {
  if (error.info) {
    return (
      <ProviderStateCard
        error={error.info.message ? error.info : { ...error.info, message: error.message }}
        projectSlug={projectSlug}
        onRetry={onRetry}
        onRetryWith={onRetryWith}
        onDismiss={onDismiss}
        floating
        className="mx-3 mb-1"
        testId="session-open-error"
      />
    )
  }
  return (
    <div
      role="alert"
      data-testid="session-open-error"
      className={`mx-3 mb-1 flex items-start gap-2 rounded-lg border border-red-500/30 ${panelGlass.error} px-3 py-2 text-xs text-red-200`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-100">The conversation could not be started</p>
        <p className="mt-0.5 break-words text-red-200/90">{error.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-200 hover:bg-red-500/20"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Dismiss
      </button>
    </div>
  )
}
