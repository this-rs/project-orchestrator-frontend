import { api, ApiError, buildQuery } from './api'
import type {
  BrowserSetting,
  NetworkToolsOverview,
  SearchEngine,
  SearchEngineDraft,
  ToolOriginConsent,
} from '@/types/networkTools'

/**
 * Network tools of native agent sessions: which origins a project lets WebFetch
 * reach, whether it allows the browser, and the search engines (global tool
 * providers). Every mutation needs a HUMAN token server-side (an agent's token
 * gets a 403). No body below ever carries a secret value, only a vault reference.
 */
export const networkToolsApi = {
  overview: (projectSlug: string) =>
    api.get<NetworkToolsOverview>(`/projects/${encodeURIComponent(projectSlug)}/network-tools`),
  /** The server normalises a URL to its origin and answers the stored consent. */
  allowOrigin: (projectSlug: string, origin: string) =>
    api.put<ToolOriginConsent>(`/projects/${encodeURIComponent(projectSlug)}/network-tools/origins`, { origin }),
  revokeOrigin: (projectSlug: string, origin: string) =>
    api.delete<void>(
      `/projects/${encodeURIComponent(projectSlug)}/network-tools/origins${buildQuery({ origin })}`,
    ),
  setBrowser: (projectSlug: string, allowed: boolean) =>
    api.put<BrowserSetting>(`/projects/${encodeURIComponent(projectSlug)}/network-tools/browser`, { allowed }),

  searchEngines: (projectSlug?: string) =>
    api.get<SearchEngine[]>(`/chat/search-engines${buildQuery({ project: projectSlug })}`),
  createSearchEngine: (draft: SearchEngineDraft) => api.post<SearchEngine>('/chat/search-engines', draft),
  deleteSearchEngine: (id: string) => api.delete<void>(`/chat/search-engines/${encodeURIComponent(id)}`),
}

/** Stable error codes of the network-tools routes (each has a translated message). */
export const NETWORK_TOOLS_ERROR_CODES = [
  'project_not_found',
  'invalid_tool_origin',
  'tool_origin_not_found',
  'invalid_browser_setting',
  'secret_value_refused',
  'invalid_search_engine',
  'invalid_search_engine_id',
  'unknown_search_engine',
  'invalid_search_engine_url',
  'invalid_credential_ref',
  'credential_ref_required',
  'search_engine_exists',
  'search_engine_not_found',
  // Client-side readings, not server codes:
  'forbidden',
  'vault_locked',
  'request_failed',
] as const

export type NetworkToolsErrorCode = (typeof NETWORK_TOOLS_ERROR_CODES)[number]

export interface NetworkToolsError {
  code: NetworkToolsErrorCode
  status?: number
}

const KNOWN = new Set<string>(NETWORK_TOOLS_ERROR_CODES)

/**
 * Read what a call threw as one of the stable codes. The server's own sentence
 * is never shown: it may quote what the person typed.
 */
export function readNetworkToolsError(err: unknown): NetworkToolsError {
  if (!(err instanceof ApiError)) return { code: 'request_failed' }
  const status = err.status
  let code: unknown
  try {
    code = (JSON.parse(err.message) as { code?: unknown }).code
  } catch {
    code = undefined
  }
  if (typeof code === 'string' && KNOWN.has(code)) return { code: code as NetworkToolsErrorCode, status }
  if (status === 409 && /locked/i.test(err.message)) return { code: 'vault_locked', status }
  if (status === 403) {
    return /passphrase|proof/i.test(err.message) ? { code: 'vault_locked', status } : { code: 'forbidden', status }
  }
  return { code: 'request_failed', status }
}
