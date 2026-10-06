import { useCallback, useState, type ReactNode } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { AlertTriangle, Check, ClipboardCopy, Loader2, RefreshCw, X } from 'lucide-react'
import { useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { healthLabel } from '@/constants/providers'
import {
  PROVIDER_ERROR_TITLES,
  PROVIDER_SETTINGS_PATH,
  RETRY_BY_SENDING_TEXT,
  VAULT_PATH,
  providerConsentPath,
  providerErrorExplanation,
  providerInstancePath,
  isSandboxRefusal,
} from '@/constants/providerErrors'
import { useSetAtom } from 'jotai'
import { chatSessionPermissionOverrideAtom } from '@/atoms'
import { TRUST_FALLBACK_MODE } from '@/constants/toolPolicy'
import type { ProviderErrorInfo } from '@/types/provider'

interface ProviderStateCardProps {
  /** The typed failure, or the `no_provider` state (`NO_PROVIDER_ERROR`). */
  error: ProviderErrorInfo
  /** Project the conversation is about, when the error itself names none. */
  projectSlug?: string | null
  /** Try the same thing again. Without it, a retryable error says how to retry instead of offering a dead button. */
  onRetry?: () => void
  /** Start a new conversation (`instance_not_found`). */
  onNewConversation?: () => void
  onDismiss?: () => void
  className?: string
  testId?: string
}

const ACTION_CLASS =
  'inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-300 disabled:opacity-60'

/**
 * A link that works where the card is rendered: inside the app's router it is
 * a client-side `Link`; in a transcript mounted without one (isolated views,
 * tests) it degrades to a plain anchor rather than throwing.
 */
function SettingsLink({ to, children }: { to: string; children: ReactNode }) {
  const inRouter = useInRouterContext()
  return inRouter ? (
    <Link to={to} className={ACTION_CLASS}>
      {children}
    </Link>
  ) : (
    <a href={to} className={ACTION_CLASS}>
      {children}
    </a>
  )
}

/** The command the user must run themselves, with a copy button. */
function LoginCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard (insecure context): the command stays selectable on screen.
    }
  }, [command])
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <code className="min-w-0 flex-1 select-all break-all rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-red-50">
        {command}
      </code>
      <button type="button" onClick={copy} className={ACTION_CLASS} aria-label="Copy the command">
        {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <ClipboardCopy className="h-3 w-3" aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

type Recheck = { state: 'idle' } | { state: 'checking' } | { state: 'done'; text: string }

/**
 * Ask the server for the instance's health NOW and reload the list. PO never
 * drives a CLI login: the user runs the command, this only looks again.
 */
function RecheckButton({ providerId }: { providerId?: string }) {
  const refresh = useRefreshProviders()
  const [recheck, setRecheck] = useState<Recheck>({ state: 'idle' })
  const run = useCallback(async () => {
    setRecheck({ state: 'checking' })
    try {
      const health = providerId ? await providersApi.status(providerId) : null
      await refresh()
      const text = !health
        ? 'Provider list reloaded.'
        : health.status === 'healthy'
          ? 'Signed in. Send your message again.'
          : health.status === 'auth_required'
            ? 'Still not signed in.'
            : `Provider status: ${healthLabel(health.status)}.`
      setRecheck({ state: 'done', text })
    } catch {
      setRecheck({ state: 'done', text: 'The status could not be checked.' })
    }
  }, [providerId, refresh])
  return (
    <>
      <button type="button" onClick={run} disabled={recheck.state === 'checking'} className={ACTION_CLASS}>
        {recheck.state === 'checking' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        )}
        Re-check
      </button>
      {recheck.state === 'done' && (
        <span role="status" className="text-[11px] text-red-100/90">
          {recheck.text}
        </span>
      )}
    </>
  )
}

/**
 * One card for every typed provider failure and for the "no provider" state:
 * what happened, and the action that gets the user out of it.
 *
 * Used above the composer (a conversation that could not be opened, the empty
 * state of a new conversation, a deleted instance) and inside the transcript
 * (a `session_error` carrying a `code`).
 */
export function ProviderStateCard({
  error,
  projectSlug,
  onRetry,
  onNewConversation,
  onDismiss,
  className = '',
  testId = 'provider-state-card',
}: ProviderStateCardProps) {
  const setModeOverride = useSetAtom(chatSessionPermissionOverrideAtom)
  const sandboxRefusal = isSandboxRefusal(error)
  const [modeSwitched, setModeSwitched] = useState(false)
  const explanation = providerErrorExplanation(error, projectSlug)
  // The French explanation of a sandbox refusal says it all: no raw English sentence under it.
  const serverSentence = error.message && error.message !== explanation && !isSandboxRefusal(error) ? error.message : null
  const canRetry =
    error.code === 'endpoint_unreachable' ||
    (error.retryable === true &&
      error.code !== 'auth_required' &&
      error.code !== 'credentials_locked' &&
      error.code !== 'instance_not_found' &&
      error.code !== 'engine_unavailable' &&
      error.code !== 'no_provider')
  const showDetail =
    !!error.detail && (error.code === 'endpoint_unreachable' || error.code === 'protocol' || error.code === 'invalid_request')

  let action: ReactNode = null
  switch (error.code) {
    case 'no_provider':
      action = <SettingsLink to={PROVIDER_SETTINGS_PATH}>Open provider settings</SettingsLink>
      break
    case 'endpoint_not_allowed':
      action = (
        <SettingsLink to={providerConsentPath(error.project_slug ?? projectSlug)}>Review the project&apos;s consent</SettingsLink>
      )
      break
    case 'auth_required':
      action = <RecheckButton providerId={error.provider_id} />
      break
    case 'credentials_locked':
      action = <SettingsLink to={VAULT_PATH}>Unlock the vault</SettingsLink>
      break
    case 'unauthorized':
      action = <SettingsLink to={providerInstancePath(error.provider_id)}>Open the instance settings</SettingsLink>
      break
    case 'origin_mismatch':
      action = <SettingsLink to={providerConsentPath(error.project_slug ?? projectSlug)}>Review the project&apos;s consent</SettingsLink>
      break
    case 'endpoint_invalid_url':
    case 'endpoint_scheme_not_allowed':
    case 'endpoint_http_outside_loopback':
    case 'endpoint_credentials_in_url':
    case 'endpoint_host_missing':
    case 'endpoint_private_address':
    case 'endpoint_unresolvable':
    case 'endpoint_redirects_not_allowed':
    case 'credential_test_requires_saved_instance':
      action = <SettingsLink to={providerInstancePath(error.provider_id)}>Open the instance settings</SettingsLink>
      break
    case 'provider_error':
      action = <SettingsLink to={PROVIDER_SETTINGS_PATH}>Choose another provider</SettingsLink>
      break
    case 'engine_unavailable':
    case 'instance_not_found':
      action = onNewConversation ? (
        <button type="button" onClick={onNewConversation} className={ACTION_CLASS}>
          Start a new conversation
        </button>
      ) : null
      break
    default:
      if (sandboxRefusal) {
        action = modeSwitched ? (
          <span role="status" className="text-[11px] text-red-100/90">
            Mode « Demander » choisi. Envoyez votre message à nouveau.
          </span>
        ) : (
          <button
            type="button"
            className={ACTION_CLASS}
            onClick={() => {
              // The next opening uses `ask`, a mode every provider accepts.
              setModeOverride(TRUST_FALLBACK_MODE)
              setModeSwitched(true)
              onRetry?.()
            }}
          >
            Passer en mode « Demander »
          </button>
        )
      }
      break
  }

  return (
    <div
      role="alert"
      data-testid={testId}
      data-error-code={error.code}
      className={`flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-100">
          {sandboxRefusal ? 'Mode « Tout autoriser » refusé' : PROVIDER_ERROR_TITLES[error.code]}
        </p>
        <p className="mt-0.5 break-words text-red-200/90">{explanation}</p>
        {/* The server's own sentence (already redacted), when it adds something. */}
        {serverSentence && <p className="mt-0.5 break-words text-red-200/70">{serverSentence}</p>}
        {error.code === 'auth_required' && error.login_hint && <LoginCommand command={error.login_hint} />}
        {showDetail && (
          <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-red-100/90">
            {error.detail}
          </pre>
        )}
        {(action || canRetry) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {action}
            {canRetry &&
              (onRetry ? (
                <button type="button" onClick={onRetry} className={ACTION_CLASS}>
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              ) : (
                <span className="text-[11px] text-red-100/90">{RETRY_BY_SENDING_TEXT}</span>
              ))}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-200 hover:bg-red-500/20"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Dismiss
        </button>
      )}
    </div>
  )
}
