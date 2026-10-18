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

/**
 * The browser of a project, on its TWO floors (N23c), which the panel must not confuse:
 *
 * * `allowed` — this PROJECT's consent, the only one this page writes.
 * * `available` — whether THIS INSTALLATION provides a browser at all (its build and the
 *   operator's configuration), which no request changes. The server resolves it exactly as it
 *   does when it opens a session. A project may consent either way: with `available: false` the
 *   consent is recorded and takes effect the day the installation provides a browser.
 */
export interface BrowserSetting {
  allowed: boolean
  available: boolean
  authorized_by?: string | null
  authorized_at?: string | null
}

/**
 * `obscura`: the keyless engine — DuckDuckGo's HTML results page, read by the headless browser
 * of nexus-tools (origin `https://html.duckduckgo.com`). No key, no URL: its executable is
 * configured on the server.
 */
export type SearchEngineKind = 'brave' | 'searxng' | 'obscura'

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
  /** The engine the server provides on its own (its nexus-tools embeds Obscura): not stored, not deletable. */
  builtin?: boolean
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
