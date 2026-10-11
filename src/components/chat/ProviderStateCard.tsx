import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { AlertTriangle, Check, ClipboardCopy, Loader2, RefreshCw, X } from 'lucide-react'
import { panelGlass } from '@/components/ui/panelGlass'
import { useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { healthLabel } from '@/constants/providers'
import {
  PROVIDER_ERROR_TITLES,
  PROVIDER_SETTINGS_PATH,
  retryBySendingText,
  VAULT_PATH,
  providerConsentPath,
  providerErrorExplanation,
  providerInstancePath,
  isSandboxRefusal,
  harnessGapOf,
} from '@/constants/providerErrors'
import { humanizeFeature } from '@/constants/engine'
import { useT } from '@/i18n'
import { useAtomValue, useSetAtom } from 'jotai'
import { chatSessionEngineAtom, chatSessionPermissionOverrideAtom } from '@/atoms'
import { TRUST_FALLBACK_MODE } from '@/constants/toolPolicy'
import type { ProviderErrorInfo, ProviderFallback } from '@/types/provider'
import { VaultUnlock } from './VaultUnlock'

export type ProviderCardTone = 'error' | 'warning'

interface ProviderStateCardProps {
  /** The typed failure, or the `no_provider` state (`NO_PROVIDER_ERROR`). */
  error: ProviderErrorInfo
  /** Project the conversation is about, when the error itself names none. */
  projectSlug?: string | null
  /** Try the same thing again. Without it, a retryable error says how to retry instead of offering a dead button. */
  onRetry?: () => void
  /** Send the same message again on this model (`credentials_locked` with `fallbacks`). */
  onRetryWith?: (fallback: ProviderFallback) => void
  /** Send the same message again once the vault is unlocked in the card (`credentials_locked`); defaults to `onRetry`. */
  onUnlocked?: () => void
  /** Start a new conversation (`instance_not_found`). */
  onNewConversation?: () => void
  onDismiss?: () => void
  className?: string
  /** Floats over the scrolling conversation (above the composer): glass instead of a bare tint. */
  floating?: boolean
  /**
   * Visual tone of the card.
   * - `'error'` (default): red — no alternatives, the user is blocked.
   * - `'warning'`: amber — alternatives exist.
   * Only the colour changes: the card is `role="alert"` in both tones, because it
   * mounts with its content (a `status` region mounted already filled is often not
   * announced) and a refused send must be announced whichever way out is offered.
   */
  tone?: ProviderCardTone
  testId?: string
}

const ACTION_CLASS_ERROR =
  'inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-300 disabled:opacity-60'
const ACTION_CLASS_WARNING =
  'inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300 disabled:opacity-60'

/** Internal context: lets sub-components (SettingsLink, RecheckButton…) pick up the card's tone. */
const ToneCtx = createContext<ProviderCardTone>('error')
function useActionClass(): string {
  return useContext(ToneCtx) === 'warning' ? ACTION_CLASS_WARNING : ACTION_CLASS_ERROR
}

/**
 * A link that works where the card is rendered: inside the app's router it is
 * a client-side `Link`; in a transcript mounted without one (isolated views,
 * tests) it degrades to a plain anchor rather than throwing.
 */
function SettingsLink({ to, children }: { to: string; children: ReactNode }) {
  const inRouter = useInRouterContext()
  const cls = useActionClass()
  return inRouter ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <a href={to} className={cls}>
      {children}
    </a>
  )
}

/** The command the user must run themselves, with a copy button. */
function LoginCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const cls = useActionClass()
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
      <button type="button" onClick={copy} className={cls} aria-label="Copy the command">
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
      <button type="button" onClick={run} disabled={recheck.state === 'checking'} className={useActionClass()}>
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
  onRetryWith,
  onUnlocked,
  onNewConversation,
  onDismiss,
  className = '',
  floating = false,
  tone: toneProp,
  testId = 'provider-state-card',
}: ProviderStateCardProps) {
  // The effective tone: explicit prop wins; otherwise a warning only when the card itself
  // offers a way on: `credentials_locked` whose fallback models are shown (they are only
  // rendered with `onRetry` and `onRetryWith`). Fallbacks the card cannot offer (the
  // transcript renders it without handlers) leave the user blocked: an error.
  const offersFallbacks =
    error.code === 'credentials_locked' && !!onRetry && !!onRetryWith && (error.fallbacks?.length ?? 0) > 0
  const tone: ProviderCardTone = toneProp ?? (offersFallbacks ? 'warning' : 'error')
  const setModeOverride = useSetAtom(chatSessionPermissionOverrideAtom)
  const sandboxRefusal = isSandboxRefusal(error)
  const [modeSwitched, setModeSwitched] = useState(false)
  const { t } = useT()
  const degraded = useAtomValue(chatSessionEngineAtom).degraded
  // Project Orchestrator's own gap (engine not ported yet): said as ours, never as the model's.
  const harnessGap = harnessGapOf(error, degraded)
  const harnessNote = harnessGap ? t('session.errors.harnessGap', { feature: humanizeFeature(harnessGap) }) : null
  // An `unsupported` on an engine feature would otherwise blame the provider: the note replaces it.
  const explanation =
    harnessNote && error.code === 'unsupported' ? harnessNote : providerErrorExplanation(error, projectSlug)
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
      // Where the message can be sent again: unlock right here, then it goes out;
      // or, when the server offered some (Auto refused), continue on a model that
      // needs no vault. A named instance's locked key gets the same unlock-and-send,
      // without models to offer.
      action = onRetry ? (
        <LockedVaultActions fallbacks={error.fallbacks ?? []} onUnlocked={onUnlocked ?? onRetry} onPick={onRetryWith} />
      ) : (
        <SettingsLink to={VAULT_PATH}>Unlock the vault</SettingsLink>
      )
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
        <button type="button" onClick={onNewConversation} className={tone === 'warning' ? ACTION_CLASS_WARNING : ACTION_CLASS_ERROR}>
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
            className={tone === 'warning' ? ACTION_CLASS_WARNING : ACTION_CLASS_ERROR}
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

  // Every class must appear as a complete string literal so Tailwind's JIT
  // scanner generates it. Never build a class via `${base}/90` interpolation.
  const isWarning = tone === 'warning'
  const borderColor = isWarning ? 'border-amber-500/30' : 'border-red-500/30'
  const bgTint = isWarning
    ? floating ? panelGlass.warning : 'bg-amber-500/10'
    : floating ? panelGlass.error : 'bg-red-500/10'
  const textPrimary = isWarning ? 'text-amber-100' : 'text-red-100'
  const textPrimary90 = isWarning ? 'text-amber-100/90' : 'text-red-100/90'
  const textSecondary = isWarning ? 'text-amber-200' : 'text-red-200'
  const textSecondary90 = isWarning ? 'text-amber-200/90' : 'text-red-200/90'
  const textSecondary70 = isWarning ? 'text-amber-200/70' : 'text-red-200/70'
  const iconColor = isWarning ? 'text-amber-400' : 'text-red-400'
  const dismissHover = isWarning ? 'hover:bg-amber-500/20' : 'hover:bg-red-500/20'

  return (
    <ToneCtx.Provider value={tone}>
      <div
        role="alert"
        data-testid={testId}
        data-error-code={error.code}
        data-tone={tone}
        className={`flex items-start gap-2 rounded-lg border ${borderColor} ${bgTint} px-3 py-2 text-xs ${textSecondary} ${className}`}
      >
        <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${textPrimary}`}>
            {sandboxRefusal ? 'Mode « Rock’n roll » refusé' : PROVIDER_ERROR_TITLES[error.code]}
          </p>
          <p className={`mt-0.5 break-words ${textSecondary90}`}>{explanation}</p>
          {harnessNote && error.code !== 'unsupported' && (
            <p data-testid="harness-gap-note" className={`mt-0.5 break-words ${textSecondary90}`}>
              {harnessNote}
            </p>
          )}
          {/* The server's own sentence (already redacted), when it adds something. */}
          {serverSentence && <p className={`mt-0.5 break-words ${textSecondary70}`}>{serverSentence}</p>}
          {error.code === 'auth_required' && error.login_hint && <LoginCommand command={error.login_hint} />}
          {showDetail && (
            <pre className={`mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 px-2 py-1 font-mono text-[11px] ${textPrimary90}`}>
              {error.detail}
            </pre>
          )}
          {(action || canRetry) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {action}
              {canRetry &&
                (onRetry ? (
                  <button type="button" onClick={onRetry} className={isWarning ? ACTION_CLASS_WARNING : ACTION_CLASS_ERROR}>
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Retry
                  </button>
                ) : (
                  <span className={`text-[11px] ${textPrimary90}`}>{retryBySendingText()}</span>
                ))}
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${textSecondary} ${dismissHover}`}
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Dismiss
          </button>
        )}
      </div>
    </ToneCtx.Provider>
  )
}

/** Unlock the vault where the message failed (it is then sent again), or pick a model that needs none. */
function LockedVaultActions({
  fallbacks,
  onUnlocked,
  onPick,
}: {
  fallbacks: ProviderFallback[]
  onUnlocked: () => void
  onPick?: (fallback: ProviderFallback) => void
}) {
  const { t } = useT()
  const offered = onPick ? fallbacks : []
  const actionClass = useActionClass()
  const labelColor = useContext(ToneCtx) === 'warning' ? 'text-amber-100/90' : 'text-red-100/90'
  // While an unlock runs, its success sends the message: a model picked meanwhile
  // would send it a second time (review of #335, finding 1).
  const [unlocking, setUnlocking] = useState(false)
  return (
    <div className="w-full space-y-2" data-testid="locked-vault-actions">
      <VaultUnlock onUnlocked={onUnlocked} onBusyChange={setUnlocking} doneText={t('session.lockedVault.resent')} />
      {offered.length > 0 && (
        <div className="space-y-1">
          <p className={`text-[11px] ${labelColor}`}>{t('session.lockedVault.fallbacksLabel')}</p>
          <div className="flex flex-wrap gap-1.5">
            {offered.map((f) => (
              <button
                key={`${f.provider_id}/${f.model}`}
                type="button"
                onClick={() => onPick?.(f)}
                disabled={unlocking}
                className={actionClass}
                data-testid="locked-vault-fallback"
              >
                {t('session.lockedVault.useModel', { model: f.model, provider: f.provider_id })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
