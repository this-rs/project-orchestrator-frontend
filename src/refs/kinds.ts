/**
 * Which kinds of reference THIS server resolves.
 *
 * Capability detection, in one place:
 *
 *   GET /api/refs/kinds -> { contract_version, kinds: [{ kind, id_format, sensitive }] }
 *     200 with a kinds array -> exactly those, in the server's order
 *     404, or 200 that is not that body (an SPA fallback) -> an older server:
 *                           the five historical kinds, nothing else
 *     anything else (network, 401, 5xx) -> unknown: not cached, tried again,
 *                           and the historical five stay in force meanwhile
 *
 * The rest of the app never lists kinds: it asks `getActiveKinds()` /
 * `isActiveKind()` / `actorKinds()`, or reads `refKindsAtom` to re-render.
 * A new kind on the server is therefore a new line of JSON, not a code change
 * (the registry only dresses it with a name and an icon, with a generic
 * fallback for a kind it has never heard of).
 *
 * Contract: backend `tests/fixtures/refs/kinds_response.json` (R2). The route
 * was not published when this was written: the parser is tolerant and the
 * single function to adjust is `fetchRefKinds`.
 */
import { api, ApiError } from '@/services/api'
import { isIdFormat, type IdFormat } from './ids'

export interface KindInfo {
  kind: string
  idFormat: IdFormat
  /** Persona, skill, file, commit...: suggested only inside a project or workspace. */
  sensitive: boolean
}

export const HISTORICAL_KIND_NAMES = ['plan', 'task', 'note', 'decision', 'rfc'] as const
export const HISTORICAL_KINDS: readonly KindInfo[] = HISTORICAL_KIND_NAMES.map((kind) => ({ kind, idFormat: 'uuid', sensitive: false }))

/** A kind name as the wire spells it: lower case, letters and underscores. */
export const KIND_NAME_RE = /^[a-z][a-z_]{1,31}$/

/** The kinds list of a response, or null when the body is not one (so the caller can tell "absent" from "empty"). */
export function parseKindsResponse(raw: unknown): KindInfo[] | null {
  const list = (raw as { kinds?: unknown } | null)?.kinds
  if (!Array.isArray(list)) return null
  const seen = new Set<string>()
  const out: KindInfo[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.kind !== 'string' || !KIND_NAME_RE.test(e.kind) || seen.has(e.kind) || !isIdFormat(e.id_format)) continue
    seen.add(e.kind)
    out.push({ kind: e.kind, idFormat: e.id_format, sensitive: e.sensitive === true })
  }
  return out
}

/** The ONE function to adjust if the route moves. `null` = could not tell. */
export async function fetchRefKinds(signal?: AbortSignal): Promise<readonly KindInfo[] | null> {
  try {
    const kinds = parseKindsResponse(await api.get<unknown>('/refs/kinds', signal))
    return kinds ?? HISTORICAL_KINDS
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return HISTORICAL_KINDS
    return null
  }
}

// --- the active set (module state, mirrored by `refKindsAtom` for React) -----------------------------

let active: readonly KindInfo[] = HISTORICAL_KINDS
let byName = new Map(active.map((k) => [k.kind, k]))
let actors: readonly string[] = []
const listeners = new Set<() => void>()

/**
 * Actors are the kinds that ACT rather than get worked on: the ones `@`
 * designates. The server's descriptor does not say so (yet), so this is the one
 * place that does; every other file asks `isActorKind` / `actorKinds()`.
 */
const ACTOR_KINDS: ReadonlySet<string> = new Set(['persona', 'skill'])
export const isActorKind = (kind: string): boolean => ACTOR_KINDS.has(kind)

export function setActiveKinds(kinds: readonly KindInfo[]): void {
  active = kinds
  byName = new Map(kinds.map((k) => [k.kind, k]))
  actors = kinds.filter((k) => isActorKind(k.kind)).map((k) => k.kind)
  listeners.forEach((l) => l())
}

export const getActiveKinds = (): readonly KindInfo[] => active
export const isActiveKind = (kind: unknown): kind is string => typeof kind === 'string' && byName.has(kind)
export const kindInfo = (kind: string): KindInfo | undefined => byName.get(kind)
/** The active kinds `@` searches. */
export const actorKinds = (): readonly string[] => actors
/** The active kinds `#` searches: everything that is not an actor. */
export const entityKinds = (): readonly string[] => active.filter((k) => !actors.includes(k.kind)).map((k) => k.kind)
export const subscribeKinds = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// --- one request per server and account -----------------------------------------------------------

const known = new Map<string, readonly KindInfo[]>()
const inflight = new Map<string, Promise<readonly KindInfo[] | null>>()

export const cachedRefKinds = (scope: string): readonly KindInfo[] | null => known.get(scope) ?? null

export function ensureRefKinds(scope: string): Promise<readonly KindInfo[] | null> {
  const hit = known.get(scope)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(scope)
  if (pending) return pending
  const request = fetchRefKinds()
    .then((answer) => {
      if (answer) known.set(scope, answer)
      return answer
    })
    .catch(() => null)
    .finally(() => inflight.delete(scope))
  inflight.set(scope, request)
  return request
}

/** Forget everything and fall back to the historical five (tests, change of account or server). */
export function clearRefKinds(): void {
  known.clear()
  inflight.clear()
  setActiveKinds(HISTORICAL_KINDS)
}
