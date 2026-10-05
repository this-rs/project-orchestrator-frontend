import { AlertTriangle, X } from 'lucide-react'
import type { ChatSessionOpenError } from '@/atoms'

interface SessionOpenErrorProps {
  error: ChatSessionOpenError
  onDismiss: () => void
}

/**
 * A conversation that could not be opened, said above the composer.
 *
 * The unsent text is already back in the composer, so this only has to say
 * why. It receives the whole error object on purpose: this is the place where
 * one card per `error.info.code` (sign-in, endpoint consent, retry…) plugs in.
 */
export function SessionOpenError({ error, onDismiss }: SessionOpenErrorProps) {
  return (
    <div
      role="alert"
      data-testid="session-open-error"
      data-error-code={error.info?.code}
      className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-100">The conversation could not be started</p>
        {/* The server's own sentence (already redacted) when it sent a typed error. */}
        <p className="mt-0.5 break-words text-red-200/90">{error.info?.message || error.message}</p>
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
