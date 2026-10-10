/**
 * Network tools of native agent sessions (WebFetch, WebSearch, browser), per
 * project. Shapes of the backend routes `GET/PUT/DELETE
 * /api/projects/{slug}/network-tools…` and `/api/chat/search-engines`.
 *
 * No shape here ever carries a secret value: a search engine names its key by
 * a vault reference (`vault:<name>`) or says it has none (`none`).
 */

export interface ToolOriginConsent {
  origin: string
  consented_by: string
  consented_at: string
}

export interface BrowserSetting {
  allowed: boolean
  authorized_by?: string | null
  authorized_at?: string | null
}

export type SearchEngineKind = 'brave' | 'searxng'

export interface SearchEngine {
  id: string
  engine: SearchEngineKind
  base_url: string | null
  /** `vault:<name>` or `none`. */
  credential_ref: string
  /** Origin the engine is reached at: the one a project must consent to. */
  origin: string | null
  /** Scope value of the vault grant that lets the server read the key: `tool:<id>`. */
  grant_id: string
  key_granted: boolean
  /** Only when the list was asked for a project. */
  origin_consented?: boolean
}

export interface NetworkToolsOverview {
  project: string
  origins: ToolOriginConsent[]
  browser: BrowserSetting
  search_engines: SearchEngine[]
}

export interface SearchEngineDraft {
  id: string
  engine: SearchEngineKind
  base_url?: string
  credential_ref: string
}
