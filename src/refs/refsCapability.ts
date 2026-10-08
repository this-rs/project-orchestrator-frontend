/**
 * Does the server understand references (`refs_v1`) BEFORE any chat socket
 * exists?
 *
 * The socket announces its features at `auth_ok` (contract C7), but a new
 * conversation has no socket until its first message is sent: without another
 * source the first message could never carry a reference, nor could the
 * composer offer `#`.
 *
 * TEMPORARY SOURCE. The backend has no REST announcement of `refs_v1` yet
 * (`GET /api/version` carries `features`, but not this one); its PR 3 adds one.
 * Until then this is a tolerant probe of the search endpoint:
 *
 *   GET /api/refs/search?q=&limit=1
 *     200            -> present (`refs_v1`)
 *     404            -> absent  (an older server has no such route)
 *     anything else  -> unknown (network error, 401, 5xx, an HTML fallback...)
 *
 * Only a definite answer (present / absent) is cached, per server + account,
 * for the life of the page; unknown stays unknown and is tried again next
 * time, never blocks anything, and keeps the feature OFF.
 *
 * TO REPLACE: when the backend announces `refs_v1` over REST, change the body
 * of `fetchRefsCapability` to read that announcement. Nothing else moves.
 */
import { api, ApiError } from '@/services/api'

/** The features announced by the source; `null` when it could not say. */
export type RefsCapability = readonly string[] | null

/** The one function to swap when the backend announces its features over REST. */
export async function fetchRefsCapability(signal?: AbortSignal): Promise<RefsCapability> {
  try {
    await api.get('/refs/search?q=&limit=1', signal)
    return ['refs_v1']
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return []
    return null
  }
}

const known = new Map<string, readonly string[]>()
const inflight = new Map<string, Promise<RefsCapability>>()

/** Which server and which account an answer belongs to. */
export const refsCapabilityScope = (apiBase: string, userId: string | null | undefined): string => `${apiBase}|${userId ?? ''}`

/** The answer already known for this scope, if any (no request). */
export const cachedRefsCapability = (scope: string): RefsCapability => known.get(scope) ?? null

/** Ask once per scope; concurrent callers share the request. Never throws. */
export function ensureRefsCapability(scope: string): Promise<RefsCapability> {
  const hit = known.get(scope)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(scope)
  if (pending) return pending
  const request = fetchRefsCapability()
    .then((answer) => {
      if (answer) known.set(scope, answer)
      return answer
    })
    .catch(() => null)
    .finally(() => inflight.delete(scope))
  inflight.set(scope, request)
  return request
}

/** Forget every answer (tests, and a change of account or server). */
export function clearRefsCapability(): void {
  known.clear()
  inflight.clear()
}
