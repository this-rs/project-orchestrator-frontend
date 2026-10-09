import { api, buildQuery, ApiError } from '@/services/api'
import { HISTORICAL_KIND_NAMES, isActiveKind, kindInfo } from './kinds'
import { validateRefId } from './ids'
import type { RefKind, RefProject } from './types'

/** One search result (contract C4 / `search_response.json`): a pointer, never content. */
export interface RefSearchItem {
  kind: RefKind
  id: string
  label: string
  subtitle?: string
  project?: RefProject
  workspace?: RefProject
  entity_status?: string
}

export interface RefSearchParams {
  q: string
  kinds?: readonly RefKind[]
  limit?: number
  /** Sensitive kinds (persona, skill...) are only suggested inside a project: say which. */
  projectId?: string
}

/** Exactly the kinds a search without `kinds` asks for: nothing needs to be said. */
const isDefaultKinds = (kinds: readonly string[]): boolean =>
  kinds.length === HISTORICAL_KIND_NAMES.length && HISTORICAL_KIND_NAMES.every((k) => kinds.includes(k))

const asProject = (v: unknown): RefProject | undefined => {
  if (!v || typeof v !== 'object') return undefined
  const p = v as Record<string, unknown>
  return typeof p.id === 'string' && typeof p.slug === 'string' && typeof p.name === 'string'
    ? { id: p.id, slug: p.slug, name: p.name }
    : undefined
}

/** The usable items of a search response. An item of an unknown kind or without a label is dropped. */
export function parseSearchResponse(raw: unknown): RefSearchItem[] {
  const items = (raw as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return []
  const out: RefSearchItem[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const e = it as Record<string, unknown>
    if (!isActiveKind(e.kind) || typeof e.label !== 'string') continue
    const format = kindInfo(e.kind)?.idFormat ?? 'uuid'
    if (!validateRefId(format, e.id)) continue
    const item: RefSearchItem = { kind: e.kind, id: e.id as string, label: e.label }
    if (typeof e.subtitle === 'string') item.subtitle = e.subtitle
    if (typeof e.entity_status === 'string') item.entity_status = e.entity_status
    const project = asProject(e.project)
    if (project) item.project = project
    const workspace = asProject(e.workspace)
    if (workspace) item.workspace = workspace
    out.push(item)
  }
  return out
}

export interface RefsInvalid {
  reason: string
  message: string
  index?: number
}

/** The `refs_invalid` body (`errors.json`) behind an ApiError, if that is what it is. */
export function readRefsInvalid(err: unknown): RefsInvalid | null {
  if (!(err instanceof ApiError)) return null
  try {
    const body = JSON.parse(err.message) as { error?: unknown; code?: unknown; reason?: unknown; index?: unknown }
    if (body.code !== 'refs_invalid' || typeof body.reason !== 'string') return null
    return {
      reason: body.reason,
      message: typeof body.error === 'string' ? body.error : body.reason,
      ...(typeof body.index === 'number' ? { index: body.index } : {}),
    }
  } catch {
    return null
  }
}

export const refsApi = {
  /** `GET /api/refs/search`. The signal aborts a request the user has already typed past. */
  async search({ q, kinds, limit, projectId }: RefSearchParams, signal?: AbortSignal): Promise<RefSearchItem[]> {
    // A search without `kinds` asks for the five historical ones; any other kind must be named.
    const active = kinds && kinds.length > 0 && !isDefaultKinds(kinds) ? kinds.join(',') : undefined
    const raw = await api.get<unknown>(`/refs/search${buildQuery({ q, kinds: active, limit, project_id: projectId })}`, signal)
    return parseSearchResponse(raw)
  },
}
