import { atom } from 'jotai'

// ============================================================================
// Setup wizard configuration atoms
// ============================================================================

export type InfraMode = 'docker' | 'external'

export type AuthMode = 'none' | 'password' | 'oidc'

export interface SetupConfig {
  // Step 1 — Infrastructure
  infraMode: InfraMode
  neo4jUri: string
  neo4jUser: string
  neo4jPassword: string
  meilisearchUrl: string
  meilisearchKey: string
  serverPort: number

  // Step 2 — Authentication
  authMode: AuthMode
  rootEmail: string
  rootPassword: string
  oidcDiscoveryUrl: string
  oidcClientId: string
  oidcClientSecret: string

  // Step 3 — Chat AI
  chatModel: string
  chatMaxSessions: number
  claudeCodeDetected: boolean
}

export const defaultSetupConfig: SetupConfig = {
  // Infrastructure
  infraMode: 'docker',
  neo4jUri: 'bolt://localhost:7687',
  neo4jUser: 'neo4j',
  neo4jPassword: '',
  meilisearchUrl: 'http://localhost:7700',
  meilisearchKey: '',
  serverPort: 8080,

  // Auth
  authMode: 'none',
  rootEmail: '',
  rootPassword: '',
  oidcDiscoveryUrl: '',
  oidcClientId: '',
  oidcClientSecret: '',

  // Chat
  chatModel: 'claude-sonnet-4-20250514',
  chatMaxSessions: 3,
  claudeCodeDetected: false,
}

/** The full wizard configuration, shared across all setup steps */
export const setupConfigAtom = atom<SetupConfig>({ ...defaultSetupConfig })

/** Current step index (0-3) */
export const setupStepAtom = atom<number>(0)

/** Whether the config already exists (server has been set up before) */
export const configExistsAtom = atom<boolean | null>(null)
