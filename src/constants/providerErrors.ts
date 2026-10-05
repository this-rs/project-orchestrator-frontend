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
  security_gate_closed: 'Third-party providers are switched off',
  origin_mismatch: 'The endpoint changed',
  endpoint_invalid_url: 'Invalid endpoint URL',
  endpoint_scheme_not_allowed: 'Endpoint scheme not allowed',
  endpoint_http_outside_loopback: 'Plain http is not allowed here',
  endpoint_credentials_in_url: 'Credentials in the URL',
  endpoint_host_missing: 'Endpoint has no host',
  endpoint_private_address: 'Private address refused',
  envelope_unbound_token: 'Delegation refused: unbound token',
  envelope_parent_not_found: 'Delegation refused: parent not found',
  envelope_depth_exceeded: 'Delegation refused: too deep',
  envelope_too_many_children: 'Delegation refused: too many children',
  envelope_cwd_outside_parent: 'Delegation refused: folder outside the parent',
  envelope_add_dir_outside_parent: 'Delegation refused: extra folder outside the parent',
  envelope_project_mismatch: 'Delegation refused: other project',
  envelope_workspace_mismatch: 'Delegation refused: other workspace',
  envelope_not_a_child: 'Delegation refused: not a child session',
  tool_not_in_profile: 'Tool not allowed for this session',
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
    case 'security_gate_closed':
      return 'Third-party providers need authentication to be enabled on this server, so that sessions get signed, bound tokens. Turn authentication on, then add the instance again. Claude Code is not affected.'
    case 'origin_mismatch':
      return 'The instance no longer points at the endpoint you were shown, so your consent was not recorded. Reload the settings and review the endpoint before allowing it.'
    case 'endpoint_invalid_url':
      return 'The base URL is not a valid URL. Enter it in full, for example https://api.example.com/v1.'
    case 'endpoint_scheme_not_allowed':
      return 'Only https is accepted, and http only for localhost. Change the scheme of the base URL.'
    case 'endpoint_http_outside_loopback':
      return 'Plain http is only accepted for localhost, 127.0.0.1 and ::1. Use https for any other host.'
    case 'endpoint_credentials_in_url':
      return 'The base URL contains a user name or password. Remove it: keys are given as a vault or environment reference, never inside the URL.'
    case 'endpoint_host_missing':
      return 'The base URL has no host. Enter it in full, for example https://api.example.com/v1.'
    case 'endpoint_private_address':
      return 'The host resolves to a private or internal address, which the server refuses to call. Use a public endpoint, or localhost for a local model.'
    case 'envelope_unbound_token':
      return 'This request came with a token that is not bound to a session, so it cannot start a child session.'
    case 'envelope_parent_not_found':
      return 'The parent session of this delegation does not exist any more.'
    case 'envelope_depth_exceeded':
      return 'This delegation chain is already as deep as allowed. Do the work in the current session instead.'
    case 'envelope_too_many_children':
      return 'This session already has as many live child sessions as allowed. Wait for one to finish.'
    case 'envelope_cwd_outside_parent':
      return "A child session cannot work in a folder outside its parent's folder."
    case 'envelope_add_dir_outside_parent':
      return "A child session cannot be given an extra folder outside its parent's folders."
    case 'envelope_project_mismatch':
      return 'A child session must stay in the project of its parent.'
    case 'envelope_workspace_mismatch':
      return 'A child session must stay in the workspace of its parent.'
    case 'envelope_not_a_child':
      return 'This session is not a child of the session that tried to act on it.'
    case 'tool_not_in_profile':
      return 'This session is not allowed to call that tool. Third-party providers get a restricted tool profile.'
  }
}

/** The `no_provider` state, for the empty state of a new conversation (no server error behind it). */
export const NO_PROVIDER_ERROR: ProviderErrorInfo = { code: 'no_provider', message: '' }

/** Shown with a composer disabled because nothing can receive the message. */
export const NO_PROVIDER_COMPOSER_TEXT = 'No provider is available: a message cannot be sent.'
export const INSTANCE_MISSING_COMPOSER_TEXT =
  'The provider of this conversation has been deleted: it cannot be resumed. Start a new conversation.'
export const RETRY_BY_SENDING_TEXT = 'Send your message again to retry.'
