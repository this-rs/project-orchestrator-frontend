// ============================================================================
// PROVIDER ERRORS — the one module for what each typed failure says on screen
// ============================================================================
//
// A provider failure reaches the interface as a `code` (the `kind` of the nexus
// `ProviderError`, plus the few codes the gateway adds). Each code gets a title
// and a sentence that says what the user can DO about it; the action itself
// (link, command to copy, retry) is rendered by `ProviderStateCard`.

import type { ProviderErrorCode, ProviderErrorInfo } from '@/types/provider'

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
  return providerId ? `${PROVIDER_SETTINGS_PATH}?instance=${encodeURIComponent(providerId)}` : PROVIDER_SETTINGS_PATH
}

export const PROVIDER_ERROR_TITLES: Readonly<Record<ProviderErrorCode, string>> = {
  no_provider: 'No provider available',
  endpoint_not_allowed: 'Endpoint not allowed for this project',
  instance_not_found: 'Provider no longer exists',
  provider_conflict: 'Provider conflict',
  cli_not_found: 'Command-line tool not found',
  provider_error: 'Provider error',
  provider_unknown: 'Unknown provider',
  provider_unavailable: 'Provider unavailable',
  auth_required: 'Sign-in required',
  credentials_locked: 'Vault locked',
  unauthorized: 'Credential refused',
  endpoint_unreachable: 'Endpoint unreachable',
  model_no_tools: 'This model cannot call tools',
  context_too_small: 'Context window too small',
  rate_limited: 'Rate limited',
  overloaded: 'Provider overloaded',
  timeout: 'The provider timed out',
  process_exited: 'The provider process exited',
  protocol: 'Unexpected answer from the provider',
  unsupported: 'Not supported by this provider',
  turn_in_progress: 'A turn is already running',
  invalid_request: 'Request refused',
  closed: 'The session is closed',
}

/** `12 s`, `2 min` — how long a rate limit asks to wait. */
export function formatRetryDelay(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  if (seconds < 90) return `${seconds} s`
  return `${Math.ceil(seconds / 60)} min`
}

const tokens = (n: number) => n.toLocaleString('en-US')

/** What happened and what to do, in one or two sentences. Never carries a credential. */
export function providerErrorExplanation(error: ProviderErrorInfo, projectSlug?: string | null): string {
  switch (error.code) {
    case 'no_provider':
      return 'No provider instance is healthy and allowed for this project, so a conversation cannot be started. Add or repair one in the provider settings.'
    case 'endpoint_not_allowed': {
      const project = error.project_slug ?? projectSlug
      const who = project ? `Project "${project}"` : 'This project'
      const where = error.origin ? ` to ${error.origin}` : ' to this endpoint'
      return `${who} has not agreed to send its content${where}. Nothing was sent.`
    }
    case 'auth_required':
      return 'This provider needs you to sign in. Run the command below in a terminal, then re-check. Project Orchestrator does not sign in for you.'
    case 'credentials_locked':
      return 'The credential of this provider is in the vault, and the vault is locked. Unlock it to continue. There is no fallback to another provider.'
    case 'unauthorized':
      return 'The provider refused the credential of this instance. Check the key it refers to in the instance settings.'
    case 'endpoint_unreachable':
      return 'The endpoint of this provider did not answer.'
    case 'model_no_tools':
      return `${error.model ? `Model "${error.model}"` : 'This model'} cannot call tools, which a conversation here requires. Choose another model.`
    case 'context_too_small': {
      const sizes =
        error.needed != null && error.available != null
          ? ` ${tokens(error.needed)} tokens are needed, ${tokens(error.available)} are available.`
          : error.needed != null
            ? ` ${tokens(error.needed)} tokens are needed.`
            : error.available != null
              ? ` Only ${tokens(error.available)} tokens are available.`
              : ''
      return `The context window of this model is too small for this conversation.${sizes} Choose a model with a larger window.`
    }
    case 'instance_not_found':
      return 'The provider instance this conversation ran on has been deleted. It cannot be resumed: start a new conversation.'
    case 'cli_not_found':
      return `${error.program ? `"${error.program}"` : 'The command-line tool of this provider'} is not installed on the server, or not on its PATH.`
    case 'rate_limited':
      return error.retry_after_ms != null
        ? `The provider is rate limiting requests. Try again in ${formatRetryDelay(error.retry_after_ms)}.`
        : 'The provider is rate limiting requests. Try again in a moment.'
    case 'overloaded':
      return 'The provider is overloaded right now.'
    case 'timeout':
      return 'The provider did not answer in time.'
    case 'process_exited':
      return 'The process of this provider stopped unexpectedly.'
    case 'protocol':
      return 'The provider sent an answer that could not be understood.'
    case 'unsupported':
      return error.capability
        ? `This provider does not support "${error.capability}".`
        : 'This provider does not support what was asked.'
    case 'turn_in_progress':
      return 'The previous message is still being answered. Wait for it to finish, or stop it.'
    case 'invalid_request':
      return 'The provider refused the request as invalid.'
    case 'closed':
      return 'This session has been closed by its provider.'
    case 'provider_conflict':
      return 'This conversation already runs on another provider. A conversation stays on its provider.'
    case 'provider_error':
      return error.message || 'The provider reported an error.'
    case 'provider_unknown':
      return 'The provider named in this request is not configured on this server. Choose one of the listed instances.'
    case 'provider_unavailable':
      return 'This provider is not available right now (unhealthy, or refused by the security gate). Try another instance or check its settings.'
  }
}

/** The `no_provider` state, for the empty state of a new conversation (no server error behind it). */
export const NO_PROVIDER_ERROR: ProviderErrorInfo = { code: 'no_provider', message: '' }

/** Shown with a composer disabled because nothing can receive the message. */
export const NO_PROVIDER_COMPOSER_TEXT = 'No provider is available: a message cannot be sent.'
export const INSTANCE_MISSING_COMPOSER_TEXT =
  'The provider of this conversation has been deleted: it cannot be resumed. Start a new conversation.'
export const RETRY_BY_SENDING_TEXT = 'Send your message again to retry.'
