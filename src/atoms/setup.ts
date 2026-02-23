import { atom } from 'jotai'
import { DEFAULT_MODEL_ID } from '@/constants/models'

// ============================================================================
// Setup wizard configuration atoms
// ============================================================================

export type InfraMode = 'docker' | 'external'

export type AuthMode = 'none' | 'password' | 'oidc'

export type OidcProvider = 'google' | 'microsoft' | 'okta' | 'auth0' | 'keycloak' | 'custom'

export type McpSetupStatus = 'idle' | 'detecting' | 'configuring' | 'configured' | 'already_configured' | 'error'

// ============================================================================
// OIDC Provider definitions
// ============================================================================

export interface OidcProviderDef {
  label: string
  description: string
  /** Fixed discovery URL, or null if provider needs a tenant/realm input */
  discoveryUrl: string | null
  /** Template for building discovery URL from tenant input (Okta, Auth0) */
  discoveryTemplate?: string
  /** Label for the tenant/realm input field, if applicable */
  tenantLabel?: string
  /** Placeholder for the tenant input */
  tenantPlaceholder?: string
  /** Help link for the provider's OAuth console */
  consoleUrl?: string
}

export const OIDC_PROVIDERS: Record<OidcProvider, OidcProviderDef> = {
  google: {
    label: 'Google',
    description: 'Google Workspace & Gmail accounts',
    discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  microsoft: {
    label: 'Microsoft',
    description: 'Azure AD & Microsoft 365',
    discoveryUrl: null,
    discoveryTemplate: 'https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration',
    tenantLabel: 'Tenant ID',
    tenantPlaceholder: 'common or your-tenant-id',
    consoleUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps',
  },
  okta: {
    label: 'Okta',
    description: 'Okta identity platform',
    discoveryUrl: null,
    discoveryTemplate: 'https://{tenant}.okta.com/.well-known/openid-configuration',
    tenantLabel: 'Okta Domain',
    tenantPlaceholder: 'your-org (without .okta.com)',
    consoleUrl: 'https://developer.okta.com/',
  },
  auth0: {
    label: 'Auth0',
    description: 'Auth0 by Okta',
    discoveryUrl: null,
    discoveryTemplate: 'https://{tenant}.auth0.com/.well-known/openid-configuration',
    tenantLabel: 'Auth0 Domain',
    tenantPlaceholder: 'your-tenant (without .auth0.com)',
    consoleUrl: 'https://manage.auth0.com/',
  },
  keycloak: {
    label: 'Keycloak',
    description: 'Self-hosted Keycloak server',
    discoveryUrl: null,
    discoveryTemplate: '{tenant}/realms/{realm}/.well-known/openid-configuration',
    tenantLabel: 'Server URL',
    tenantPlaceholder: 'https://keycloak.example.com',
    consoleUrl: undefined,
  },
  custom: {
    label: 'Custom',
    description: 'Any OpenID Connect provider',
    discoveryUrl: null,
    consoleUrl: undefined,
  },
}

export interface SetupConfig {
  // Step 1 — Infrastructure
  infraMode: InfraMode
  neo4jUri: string
  neo4jUser: string
  neo4jPassword: string
  meilisearchUrl: string
  meilisearchKey: string
  natsUrl: string
  natsEnabled: boolean
  serverPort: number
  serveFrontend: boolean
  publicUrl: string

  // Step 2 — Authentication
  authMode: AuthMode
  rootEmail: string
  rootPassword: string
  oidcProvider: OidcProvider
  oidcTenant: string // tenant/domain/realm input for parameterized providers
  oidcDiscoveryUrl: string
  oidcClientId: string
  oidcClientSecret: string
  oidcProviderName: string
  oidcScopes: string
  oidcAuthEndpoint: string
  oidcTokenEndpoint: string
  oidcUserinfoEndpoint: string

  // Step 2b — Access restrictions
  allowedEmailDomain: string
  allowedEmails: string // newline-separated list

  // Step 3 — Chat AI
  chatModel: string
  chatMaxSessions: number
  chatMaxTurns: number
  chatPermissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  claudeCodeDetected: boolean
  mcpSetupStatus: McpSetupStatus
  mcpSetupMessage: string

  // Step 3b — Desktop-only settings (PATH, CLI, auto-update)
  chatProcessPath: string
  chatClaudeCliPath: string
  chatAutoUpdateCli: boolean
  chatAutoUpdateApp: boolean

  // Step 3c — Embedding provider
  embeddingProvider: 'local' | 'http' | 'disabled'
  embeddingFastembedModel: string
  embeddingUrl: string
  embeddingModel: string
  embeddingApiKey: string
  embeddingDimensions: number

  // Reconfigure mode indicators (read-only, set by read_config)
  hasOidcSecret: boolean
  hasNeo4jPassword: boolean
  hasMeilisearchKey: boolean
  hasEmbeddingApiKey: boolean
}

export const defaultSetupConfig: SetupConfig = {
  // Infrastructure
  infraMode: 'docker',
  neo4jUri: 'bolt://localhost:7687',
  neo4jUser: 'neo4j',
  neo4jPassword: '',
  meilisearchUrl: 'http://localhost:7700',
  meilisearchKey: '',
  natsUrl: 'nats://localhost:4222',
  natsEnabled: true,
  serverPort: 6600,
  serveFrontend: true,
  publicUrl: '',

  // Auth
  authMode: 'none',
  rootEmail: '',
  rootPassword: '',
  oidcProvider: 'custom',
  oidcTenant: '',
  oidcDiscoveryUrl: '',
  oidcClientId: '',
  oidcClientSecret: '',
  oidcProviderName: '',
  oidcScopes: 'openid email profile',
  oidcAuthEndpoint: '',
  oidcTokenEndpoint: '',
  oidcUserinfoEndpoint: '',

  // Access restrictions
  allowedEmailDomain: '',
  allowedEmails: '',

  // Chat
  chatModel: DEFAULT_MODEL_ID,
  chatMaxSessions: 3,
  chatMaxTurns: 50,
  chatPermissionMode: 'default',
  claudeCodeDetected: false,
  mcpSetupStatus: 'idle' as McpSetupStatus,
  mcpSetupMessage: '',

  // Desktop-only settings
  chatProcessPath: '',
  chatClaudeCliPath: '',
  chatAutoUpdateCli: false,
  chatAutoUpdateApp: true,

  // Embedding provider
  embeddingProvider: 'local',
  embeddingFastembedModel: 'multilingual-e5-base',
  embeddingUrl: '',
  embeddingModel: '',
  embeddingApiKey: '',
  embeddingDimensions: 768,

  // Reconfigure mode indicators
  hasOidcSecret: false,
  hasNeo4jPassword: false,
  hasMeilisearchKey: false,
  hasEmbeddingApiKey: false,
}

/** The full wizard configuration, shared across all setup steps */
export const setupConfigAtom = atom<SetupConfig>({ ...defaultSetupConfig })

/** Current step index (0-3) */
export const setupStepAtom = atom<number>(0)

/** Whether the config already exists (server has been set up before) */
export const configExistsAtom = atom<boolean | null>(null)

// ============================================================================
// Tray navigation atoms
// ============================================================================

/**
 * True when the current navigation originated from the system tray menu.
 *
 * Initialized **synchronously** from `window.location.search` so that the
 * value is correct on the very first render — before any useEffect runs.
 * This prevents race conditions where SetupWizard reads the atom before
 * a deferred useEffect has time to set it.
 *
 * The `useTrayNavigation()` hook is still responsible for cleaning the
 * `?from=tray` parameter from the URL after capture.
 */
export const trayNavigationAtom = atom<boolean>(
  typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('from') === 'tray',
)

/** URL to return to after the setup wizard completes, when the navigation
 *  originated from the tray. For example, if the tray navigated to
 *  /projects?from=tray but the backend wasn't configured yet, SetupGuard
 *  saves '/projects' here before redirecting to /setup. */
export const trayReturnUrlAtom = atom<string | null>(null)

/** URL to return to when leaving the Settings page.
 *  Set by UserMenu (via Jotai) or by the tray (via sessionStorage).
 *  SettingsPage reads this to navigate back instead of using navigate(-1),
 *  which fails when the page was opened from the tray (no browser history). */
export const settingsReturnUrlAtom = atom<string | null>(null)

// ============================================================================
// Setup wizard validation atoms (blocking navigation)
// ============================================================================

/**
 * True when the Infrastructure step prerequisites are met.
 *
 * - Docker mode: Docker Desktop must be running (`status === 'running'`)
 * - External mode: all required connection tests must pass
 *   (Neo4j + Meilisearch always, NATS only if enabled)
 *
 * Written by InfrastructurePage, read by SetupWizard to compute nextDisabled.
 * Defaults to `false` — the user must satisfy the prerequisites to proceed.
 */
export const infraValidAtom = atom<boolean>(false)

/**
 * True when the Chat AI step prerequisites are met.
 *
 * Both conditions must be true:
 * - Claude Code CLI detected (installed)
 * - Embedding model ready:
 *   - Local provider: ONNX model downloaded
 *   - HTTP provider: test endpoint successful
 *   - Disabled provider: always true
 *
 * Written by ChatPage, read by SetupWizard to compute nextDisabled.
 * Defaults to `false` — the user must satisfy the prerequisites to proceed.
 */
export const chatValidAtom = atom<boolean>(false)
