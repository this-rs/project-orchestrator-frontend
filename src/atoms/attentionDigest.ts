import { atom } from 'jotai'
import { buildBands } from '@/components/today/bands'
import type { AttentionResponse, RunnerState, WaitingRequest } from '@/types/attention'

/**
 * What the discussion tree needs from `GET /api/attention`, taken from the ONE
 * fetch of `useAttentionCountSource` (no second request): which sessions are dead
 * with a request still pending (=> "Reprendre la session") and who holds the runner
 * (=> run / task buttons disabled, with the reason).
 */
export interface AttentionDigest {
  /** `ready` once the first payload landed; `unknown` before it and after a source error. */
  status: 'unknown' | 'ready'
  /** Dead sessions (CLI stopped) with an unanswered request, by session id. */
  deadPending: Record<string, WaitingRequest>
  runner: RunnerState | null
}

export const EMPTY_DIGEST: AttentionDigest = { status: 'unknown', deadPending: {}, runner: null }

export const attentionDigestAtom = atom<AttentionDigest>(EMPTY_DIGEST)

/** Bumped by `useRequestAttentionRefresh`; the single source refetches when it changes. */
export const attentionRefreshRequestAtom = atom(0)

export function buildAttentionDigest(data: AttentionResponse): AttentionDigest {
  // Same cut as the Today page (`buildBands`): what its band "À reprendre" shows as a request
  // left without answer (orphans[], dead sessions, waiting[] requests of dead/unknown sessions).
  const deadPending: Record<string, WaitingRequest> = {}
  for (const e of buildBands(data).stuck) {
    if (e.kind === 'orphan') {
      if (!(e.orphan.session_id in deadPending)) deadPending[e.orphan.session_id] = e.orphan
    } else if (e.kind === 'unattached' && e.session.pending.length > 0 && !(e.session.id in deadPending)) {
      deadPending[e.session.id] = e.session.pending[0]
    }
  }
  return { status: 'ready', deadPending, runner: data.runner }
}
