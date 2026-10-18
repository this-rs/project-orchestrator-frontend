/**
 * Context anchors of a conversation (plan « Chat sans dépendance au cwd », T4 backend / T6 here).
 *
 * A conversation carries typed anchors toward entities (plan, task, note…), each
 * with roles (`focus`, `mention`, `origin`) and a state that follows its target
 * (`live`, `moved`, `archived`, `dangling`, `unknown`).
 *
 *   GET    /chat/sessions/{id}/anchors                 -> {session_id, version, anchors}
 *   POST   /chat/sessions/{id}/anchors                 -> 201 created, 200 already there
 *   PATCH  /chat/sessions/{id}/anchors/{anchor_id}     -> promote / demote a role
 *   DELETE /chat/sessions/{id}/anchors/{anchor_id}     -> remove (never the origin)
 *   GET    /chat/anchored-sessions?target_type=&target_id=&state=&limit=&cursor=
 *
 * Every mutation sends `If-Match: "<version of the set>"`. A set that changed since
 * is refused with 409 `anchor_set_version_conflict` carrying the CURRENT set: the
 * caller shows it, never re-sends over it (`AnchorConflictError`).
 *
 * Who placed an anchor is decided by the server from the token, never sent here.
 *
 * A server without these routes (older backend) answers 404 without a JSON
 * `error`, 405, 501 or an HTML fallback: `AnchorsUnavailableError`, which the UI
 * turns into "not available on this server", never a crash.
 */
import { apiRequest, buildQuery, ApiError, NonJsonResponseError } from './api'

export const ANCHOR_TARGET_TYPES = [
  'file', 'function', 'component', 'feature', 'release', 'plan', 'task', 'note', 'decision', 'project', 'workspace',
] as const
export type AnchorTargetType = (typeof ANCHOR_TARGET_TYPES)[number]
export type AnchorRole = 'focus' | 'mention' | 'origin'
export const ANCHOR_STATES = ['live', 'moved', 'archived', 'dangling', 'unknown'] as const
export type AnchorState = (typeof ANCHOR_STATES)[number]
export type AnchorActor = 'user' | 'agent' | 'system'

/** Most anchors holding `focus` in one conversation (server rule `MAX_FOCUS_ANCHORS`). */
export const MAX_FOCUS_ANCHORS = 3
/** Default and maximum page of the reverse read. */
export const ANCHORED_PAGE_DEFAULT = 20
export const ANCHORED_PAGE_MAX = 100

export interface Anchor {
  id: string
  session_id: string
  target_type: AnchorTargetType
  target_id: string
  roles: AnchorRole[]
  state: AnchorState
  by: AnchorActor
  inferred?: boolean
  confidence?: number
  snapshot_name?: string | null
  snapshot_path?: string | null
  snapshot_type?: string | null
  rev?: string | null
  version: number
  created_at?: string
  updated_at?: string
}

export interface AnchorSet {
  version: number
  anchors: Anchor[]
}

export interface AnchorChange {
  anchor: Anchor
  created: boolean
  changed: boolean
  version: number
}

export interface AddAnchorInput {
  target_type: AnchorTargetType
  target_id: string
  roles?: AnchorRole[]
  snapshot_name?: string
  snapshot_path?: string
  snapshot_type?: string
}

export interface AnchoredSessionItem<S = Record<string, unknown>> {
  session: S
  anchor: Anchor
}

export interface AnchoredSessionsPage<S = Record<string, unknown>> {
  items: AnchoredSessionItem<S>[]
  next_cursor?: string
}

/** The routes are absent from this server. */
export class AnchorsUnavailableError extends Error {
  constructor() {
    super('anchors_unavailable')
    this.name = 'AnchorsUnavailableError'
  }
}

/** The set changed since the version we sent: here is the current one. */
export class AnchorConflictError extends Error {
  constructor(public current: AnchorSet | null) {
    super('anchor_set_version_conflict')
    this.name = 'AnchorConflictError'
  }
}

/** Any other refusal, with the server's machine `code` when it gave one. */
export class AnchorRefusedError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'AnchorRefusedError'
  }
}

const isRole = (v: unknown): v is AnchorRole => v === 'focus' || v === 'mention' || v === 'origin'
const isState = (v: unknown): v is AnchorState => typeof v === 'string' && (ANCHOR_STATES as readonly string[]).includes(v)
export const isAnchorTargetType = (v: unknown): v is AnchorTargetType =>
  typeof v === 'string' && (ANCHOR_TARGET_TYPES as readonly string[]).includes(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** One anchor from the wire, or null when it is not one. An unknown state reads `unknown`. */
export function parseAnchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (typeof a.id !== 'string' || typeof a.target_id !== 'string' || typeof a.target_type !== 'string') return null
  const roles = Array.isArray(a.roles) ? a.roles.filter(isRole) : []
  if (roles.length === 0) return null
  const by = a.by === 'user' || a.by === 'agent' || a.by === 'system' ? a.by : 'system'
  return {
    id: a.id,
    session_id: str(a.session_id) ?? '',
    target_type: a.target_type as AnchorTargetType,
    target_id: a.target_id,
    roles,
    state: isState(a.state) ? a.state : 'unknown',
    by,
    inferred: a.inferred === true,
    confidence: typeof a.confidence === 'number' ? a.confidence : undefined,
    snapshot_name: str(a.snapshot_name),
    snapshot_path: str(a.snapshot_path),
    snapshot_type: str(a.snapshot_type),
    rev: str(a.rev),
    version: typeof a.version === 'number' ? a.version : 0,
    created_at: str(a.created_at) ?? undefined,
    updated_at: str(a.updated_at) ?? undefined,
  }
}

export function parseAnchorSet(raw: unknown): AnchorSet {
  const r = (raw ?? {}) as Record<string, unknown>
  const anchors = Array.isArray(r.anchors) ? r.anchors.map(parseAnchor).filter((a): a is Anchor => a !== null) : []
  return { version: typeof r.version === 'number' ? r.version : 0, anchors }
}

function parseBody(err: ApiError): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(err.message)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Is this error "the server has no such route"? (Not "this session does not exist".) */
export function isRouteAbsent(err: unknown): boolean {
  if (err instanceof NonJsonResponseError) return true
  if (!(err instanceof ApiError)) return false
  if (err.status === 405 || err.status === 501) return true
  if (err.status !== 404) return false
  return typeof parseBody(err)?.error !== 'string'
}

/** The typed error a failed anchor call stands for. */
export function toAnchorError(err: unknown): unknown {
  if (isRouteAbsent(err)) return new AnchorsUnavailableError()
  if (!(err instanceof ApiError)) return err
  const body = parseBody(err)
  const code = typeof body?.code === 'string' ? body.code : null
  if (err.status === 409 && code === 'anchor_set_version_conflict') {
    return new AnchorConflictError(body?.current ? parseAnchorSet(body.current) : null)
  }
  const message = typeof body?.error === 'string' ? body.error : err.message || `HTTP ${err.status}`
  return new AnchorRefusedError(err.status, code, message)
}

async function call<T>(endpoint: string, init: RequestInit = {}, ifMatch?: number): Promise<T> {
  const headers: Record<string, string> = ifMatch !== undefined ? { 'If-Match': `"${ifMatch}"` } : {}
  try {
    return await apiRequest<T>(endpoint, { ...init, headers })
  } catch (err) {
    throw toAnchorError(err)
  }
}

const base = (sessionId: string) => `/chat/sessions/${encodeURIComponent(sessionId)}/anchors`

function parseChange(raw: unknown): AnchorChange {
  const r = (raw ?? {}) as Record<string, unknown>
  const anchor = parseAnchor(r.anchor)
  if (!anchor) throw new AnchorRefusedError(0, null, 'Malformed anchor answer')
  return { anchor, created: r.created === true, changed: r.changed !== false, version: typeof r.version === 'number' ? r.version : anchor.version }
}

export const anchorsApi = {
  async list(sessionId: string, signal?: AbortSignal): Promise<AnchorSet> {
    return parseAnchorSet(await call<unknown>(base(sessionId), { signal }))
  },

  async add(sessionId: string, input: AddAnchorInput, ifMatch?: number): Promise<AnchorChange> {
    return parseChange(await call<unknown>(base(sessionId), { method: 'POST', body: JSON.stringify(input) }, ifMatch))
  },

  async setRole(sessionId: string, anchorId: string, action: 'promote' | 'demote', role: AnchorRole, ifMatch: number): Promise<AnchorChange> {
    return parseChange(
      await call<unknown>(`${base(sessionId)}/${encodeURIComponent(anchorId)}`, { method: 'PATCH', body: JSON.stringify({ action, role }) }, ifMatch),
    )
  },

  async remove(sessionId: string, anchorId: string, ifMatch: number): Promise<AnchorChange> {
    return parseChange(await call<unknown>(`${base(sessionId)}/${encodeURIComponent(anchorId)}`, { method: 'DELETE' }, ifMatch))
  },

  async listAnchoredSessions<S = Record<string, unknown>>(
    params: { target_type: AnchorTargetType; target_id: string; state?: AnchorState; limit?: number; cursor?: string },
    signal?: AbortSignal,
  ): Promise<AnchoredSessionsPage<S>> {
    const limit = params.limit === undefined ? undefined : Math.min(ANCHORED_PAGE_MAX, Math.max(1, params.limit))
    const raw = await call<unknown>(`/chat/anchored-sessions${buildQuery({ ...params, limit })}`, { signal })
    const r = (raw ?? {}) as Record<string, unknown>
    const items: AnchoredSessionItem<S>[] = []
    for (const it of Array.isArray(r.items) ? r.items : []) {
      const e = (it ?? {}) as Record<string, unknown>
      const anchor = parseAnchor(e.anchor)
      if (!anchor || !e.session || typeof e.session !== 'object') continue
      items.push({ session: e.session as S, anchor })
    }
    return { items, ...(typeof r.next_cursor === 'string' ? { next_cursor: r.next_cursor } : {}) }
  },
}

/**
 * The `anchors` payload of a `chat_session` / `updated` event on `/ws/events`,
 * or null when the event is about something else.
 */
export interface AnchorEventPayload {
  change: string
  anchor_id: string
  target_type: string
  target_id: string
  version: number
}

export function anchorEventOf(payload: Record<string, unknown> | undefined): AnchorEventPayload | null {
  const a = payload?.anchors
  if (!a || typeof a !== 'object') return null
  const e = a as Record<string, unknown>
  if (typeof e.target_type !== 'string' || typeof e.target_id !== 'string') return null
  return {
    change: typeof e.change === 'string' ? e.change : 'updated',
    anchor_id: typeof e.anchor_id === 'string' ? e.anchor_id : '',
    target_type: e.target_type,
    target_id: e.target_id,
    version: typeof e.version === 'number' ? e.version : 0,
  }
}
