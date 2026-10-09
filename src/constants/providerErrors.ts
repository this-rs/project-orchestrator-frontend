// ============================================================================
// PROVIDER ERRORS — the one module for what each typed failure says on screen
// ============================================================================
//
// A provider failure reaches the interface as a `code` (the `kind` of the nexus
// `ProviderError`, plus the few codes the gateway adds). Each code gets a title
// and a sentence that says what the user can DO about it; the action itself
// (link, command to copy, retry) is rendered by `ProviderStateCard`.

import type { ProviderErrorCode, ProviderErrorInfo } from '@/types/provider'
import { HARNESS_FEATURES } from './engine'
import { lazyTexts, tr } from '@/i18n/lazy'

export const PROVIDER_SETTINGS_PATH = '/providers'
export const VAULT_PATH = '/vault'

/** Where a project's consent to send content to an endpoint is given. */
export function providerConsentPath(projectSlug: string | null | undefined): string {
  return projectSlug
    ? `${PROVIDER_SETTINGS_PATH}?project=${encodeURIComponent(projectSlug)}#consent`
    : `${PROVIDER_SETTINGS_PATH}#consent`
}

/** The settings of one instance. */
export function providerInstancePath(providerId: string | null | undefined): string {
  return providerId
    ? `${PROVIDER_SETTINGS_PATH}?instance=${encodeURIComponent(providerId)}`
    : PROVIDER_SETTINGS_PATH
}

export const PROVIDER_ERROR_TITLES: Readonly<Record<ProviderErrorCode, string>> = lazyTexts<ProviderErrorCode>({
  no_provider: 'providerErrors.titles.no_provider',
  endpoint_not_allowed: 'providerErrors.titles.endpoint_not_allowed',
  instance_not_found: 'providerErrors.titles.instance_not_found',
  provider_conflict: 'providerErrors.titles.provider_conflict',
  cli_not_found: 'providerErrors.titles.cli_not_found',
  provider_error: 'providerErrors.titles.provider_error',
  provider_unknown: 'providerErrors.titles.provider_unknown',
  provider_unavailable: 'providerErrors.titles.provider_unavailable',
  auth_required: 'providerErrors.titles.auth_required',
  credentials_locked: 'providerErrors.titles.credentials_locked',
  unauthorized: 'providerErrors.titles.unauthorized',
  endpoint_unreachable: 'providerErrors.titles.endpoint_unreachable',
  model_no_tools: 'providerErrors.titles.model_no_tools',
  context_too_small: 'providerErrors.titles.context_too_small',
  rate_limited: 'providerErrors.titles.rate_limited',
  overloaded: 'providerErrors.titles.overloaded',
  timeout: 'providerErrors.titles.timeout',
  process_exited: 'providerErrors.titles.process_exited',
  protocol: 'providerErrors.titles.protocol',
  unsupported: 'providerErrors.titles.unsupported',
  turn_in_progress: 'providerErrors.titles.turn_in_progress',
  invalid_request: 'providerErrors.titles.invalid_request',
  closed: 'providerErrors.titles.closed',
  security_gate_closed: 'providerErrors.titles.security_gate_closed',
  origin_mismatch: 'providerErrors.titles.origin_mismatch',
  endpoint_invalid_url: 'providerErrors.titles.endpoint_invalid_url',
  endpoint_scheme_not_allowed: 'providerErrors.titles.endpoint_scheme_not_allowed',
  endpoint_http_outside_loopback: 'providerErrors.titles.endpoint_http_outside_loopback',
  endpoint_credentials_in_url: 'providerErrors.titles.endpoint_credentials_in_url',
  endpoint_host_missing: 'providerErrors.titles.endpoint_host_missing',
  endpoint_private_address: 'providerErrors.titles.endpoint_private_address',
  envelope_unbound_token: 'providerErrors.titles.envelope_unbound_token',
  envelope_parent_not_found: 'providerErrors.titles.envelope_parent_not_found',
  envelope_depth_exceeded: 'providerErrors.titles.envelope_depth_exceeded',
  envelope_too_many_children: 'providerErrors.titles.envelope_too_many_children',
  envelope_cwd_outside_parent: 'providerErrors.titles.envelope_cwd_outside_parent',
  envelope_add_dir_outside_parent: 'providerErrors.titles.envelope_add_dir_outside_parent',
  envelope_project_mismatch: 'providerErrors.titles.envelope_project_mismatch',
  envelope_workspace_mismatch: 'providerErrors.titles.envelope_workspace_mismatch',
  envelope_not_a_child: 'providerErrors.titles.envelope_not_a_child',
  tool_not_in_profile: 'providerErrors.titles.tool_not_in_profile',
  endpoint_unresolvable: 'providerErrors.titles.endpoint_unresolvable',
  endpoint_redirects_not_allowed: 'providerErrors.titles.endpoint_redirects_not_allowed',
  credential_test_requires_saved_instance: 'providerErrors.titles.credential_test_requires_saved_instance',
  engine_unavailable: 'providerErrors.titles.engine_unavailable',
  invalid_routing_mode: 'providerErrors.titles.invalid_routing_mode',
  invalid_learning_stage: 'providerErrors.titles.invalid_learning_stage',
  invalid_routing_weight: 'providerErrors.titles.invalid_routing_weight',
})

/**
 * French titles for the SETTINGS context (the Providers page and its cards).
 * The chat keeps `PROVIDER_ERROR_TITLES`; a code missing here falls back to it.
 */
export const PROVIDER_ERROR_TITLES_SETTINGS_FR: Readonly<
  Partial<Record<ProviderErrorCode, string>>
> = {
  auth_required: 'Connexion requise',
  credentials_locked: 'Coffre verrouillé',
  unauthorized: 'Clé refusée',
  endpoint_unreachable: 'Point d’accès injoignable',
  model_no_tools: 'Le modèle n’a pas appelé l’outil de test',
  context_too_small: 'Fenêtre de contexte trop petite',
  cli_not_found: 'Programme introuvable',
  rate_limited: 'Trop de requêtes',
  overloaded: 'Provider surchargé',
  timeout: 'Délai dépassé',
  process_exited: 'Le programme s’est arrêté',
  protocol: 'Réponse incompréhensible',
  unsupported: 'Non pris en charge par ce provider',
  invalid_request: 'Requête refusée',
  provider_unknown: 'Provider inconnu',
  provider_unavailable: 'Provider indisponible',
  provider_error: 'Échec du provider',
  security_gate_closed: 'Providers tiers désactivés',
  origin_mismatch: 'L’origine a changé',
  endpoint_not_allowed: 'Origine non autorisée pour ce projet',
  endpoint_invalid_url: 'URL invalide',
  endpoint_scheme_not_allowed: 'Schéma d’URL refusé',
  endpoint_http_outside_loopback: 'http refusé ici',
  endpoint_credentials_in_url: 'Identifiants dans l’URL',
  endpoint_host_missing: 'URL sans hôte',
  endpoint_private_address: 'Adresse privée refusée',
  endpoint_unresolvable: 'Hôte introuvable',
  endpoint_redirects_not_allowed: 'Redirection refusée',
  credential_test_requires_saved_instance: 'Enregistrez l’instance pour tester sa clé',
}

/** On the settings page, a retryable failure is retried with "Tester". */
export const RETRY_BY_TESTING_TEXT_FR = 'Cliquez sur Tester pour réessayer.'

/**
 * Trust ("Rock’n roll") refused because the provider has no sandbox
 * (`unsupported` with capability `sandbox`, backend A35).
 */
export const sandboxTrustRefusedText = (): string => tr('providerErrors.sandboxTrustRefused')

export function isSandboxRefusal(
  error: Pick<ProviderErrorInfo, 'code' | 'capability' | 'message'>
): boolean {
  return (
    error.code === 'unsupported' &&
    (error.capability === 'sandbox' || /\bsandbox\b/i.test(error.message ?? ''))
  )
}

/**
 * The engine feature behind a failure, when the failure is Project
 * Orchestrator's gap and not the model's: an `unsupported` naming a feature the
 * agent engine has not ported yet, or a message refused during a turn on an
 * engine that does not queue (`message_queue` in `degraded_features`).
 * `null` = nothing to add: the explanation stands as it is.
 *
 * Its sentence is `session.errors.harnessGap` (i18n). A capability of the model
 * (`images`, `tools`, `context_window`) is never reported here.
 */
export function harnessGapOf(
  error: Pick<ProviderErrorInfo, 'code' | 'capability'>,
  degraded: readonly string[] = [],
): string | null {
  if (error.code === 'unsupported' && error.capability && HARNESS_FEATURES.includes(error.capability)) {
    return error.capability
  }
  if (error.code === 'turn_in_progress' && degraded.includes('message_queue')) return 'message_queue'
  return null
}

/** `12 s`, `2 min` — how long a rate limit asks to wait. */
export function formatRetryDelay(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  if (seconds < 90) return tr('providerErrors.delay.seconds', { n: seconds })
  return tr('providerErrors.delay.minutes', { n: Math.ceil(seconds / 60) })
}

/** What happened and what to do, in one or two sentences. Never carries a credential. */
export function providerErrorExplanation(
  error: ProviderErrorInfo,
  projectSlug?: string | null
): string {
  switch (error.code) {
    case 'endpoint_not_allowed': {
      const project = error.project_slug ?? projectSlug
      return tr('providerErrors.explain.endpoint_not_allowed', {
        who: project ? tr('providerErrors.explain.whoProject', { project }) : tr('providerErrors.explain.whoThis'),
        where: error.origin ? tr('providerErrors.explain.toOrigin', { origin: error.origin }) : tr('providerErrors.explain.toThis'),
      })
    }
    case 'model_no_tools':
      return tr('providerErrors.explain.model_no_tools', {
        subject: error.model ? tr('providerErrors.explain.modelNamed', { model: error.model }) : tr('providerErrors.explain.modelThis'),
      })
    case 'context_too_small': {
      const sizes =
        error.needed != null && error.available != null
          ? tr('providerErrors.explain.sizesBoth', { needed: error.needed, available: error.available })
          : error.needed != null
            ? tr('providerErrors.explain.sizesNeeded', { needed: error.needed })
            : error.available != null
              ? tr('providerErrors.explain.sizesAvailable', { available: error.available })
              : ''
      return sizes
        ? tr('providerErrors.explain.context_too_small', { sizes })
        : tr('providerErrors.explain.context_too_small_plain')
    }
    case 'cli_not_found':
      return error.program
        ? tr('providerErrors.explain.cli_not_found', { program: error.program })
        : tr('providerErrors.explain.cli_not_found_generic')
    case 'rate_limited':
      return error.retry_after_ms != null
        ? tr('providerErrors.explain.rate_limited_in', { delay: formatRetryDelay(error.retry_after_ms) })
        : tr('providerErrors.explain.rate_limited')
    case 'unsupported':
      if (isSandboxRefusal(error)) return sandboxTrustRefusedText()
      return error.capability
        ? tr('providerErrors.explain.unsupported_capability', { capability: error.capability })
        : tr('providerErrors.explain.unsupported')
    case 'no_provider':
    case 'auth_required':
    case 'credentials_locked':
    case 'unauthorized':
    case 'endpoint_unreachable':
    case 'instance_not_found':
    case 'overloaded':
    case 'timeout':
    case 'process_exited':
    case 'protocol':
    case 'turn_in_progress':
    case 'invalid_request':
    case 'closed':
    case 'provider_conflict':
    case 'provider_error':
    case 'provider_unknown':
    case 'provider_unavailable':
    case 'security_gate_closed':
    case 'origin_mismatch':
    case 'endpoint_invalid_url':
    case 'endpoint_scheme_not_allowed':
    case 'endpoint_http_outside_loopback':
    case 'endpoint_credentials_in_url':
    case 'endpoint_host_missing':
    case 'endpoint_private_address':
    case 'envelope_unbound_token':
    case 'envelope_parent_not_found':
    case 'envelope_depth_exceeded':
    case 'envelope_too_many_children':
    case 'envelope_cwd_outside_parent':
    case 'envelope_add_dir_outside_parent':
    case 'envelope_project_mismatch':
    case 'envelope_workspace_mismatch':
    case 'envelope_not_a_child':
    case 'tool_not_in_profile':
    case 'endpoint_unresolvable':
    case 'endpoint_redirects_not_allowed':
    case 'credential_test_requires_saved_instance':
    case 'engine_unavailable':
    case 'invalid_routing_mode':
    case 'invalid_learning_stage':
    case 'invalid_routing_weight':
      return tr(`providerErrors.explain.${error.code}`)
  }
}

/** The `no_provider` state, for the empty state of a new conversation (no server error behind it). */
export const NO_PROVIDER_ERROR: ProviderErrorInfo = { code: 'no_provider', message: '' }

/** Shown with a composer disabled because nothing can receive the message. */
export const noProviderComposerText = (): string => tr('providerErrors.noProviderComposer')
export const instanceMissingComposerText = (): string => tr('providerErrors.instanceMissingComposer')
export const retryBySendingText = (): string => tr('providerErrors.retryBySending')
