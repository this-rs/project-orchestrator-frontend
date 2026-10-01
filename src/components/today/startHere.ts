import type { Band } from '@/types/attention'
import {
  STUCK_LABEL,
  compareStuck,
  type Bands,
  type StuckEntry,
  type WaitingEntry,
} from './bands'

/**
 * « Commence par ça » — ONE recommendation, computed by a pure, deterministic rule.
 * No score, no invented priority: the only criterion is how long something has waited.
 *
 *   (a) the OLDEST request of a LIVE agent that waits on the user
 *       (a dead session never counts here: its request is in "À reprendre");
 *   (b) else the OLDEST stuck or resumable item ("À reprendre": a stopped thread,
 *       a request left without answer, a stopped session without thread);
 *   (c) else, if some threads advance on their own: "Rien ne te bloque : N fils avancent seuls";
 *   (d) else the empty state.
 *
 * Ties on age are broken by id (request id, thread id or session id, ascending
 * string order), so the answer never depends on the order of the payload.
 * "Oldest" is the backend's `age_secs`, taken as is.
 *
 * Honesty: when a source of the payload failed for "À traiter" or "À reprendre",
 * (c) and (d) would claim something unknown ("rien ne te bloque"): the result is then
 * `incomplete`, which says so instead.
 */

export type StartHere =
  | { kind: 'waiting'; entry: WaitingEntry; why: string }
  | { kind: 'stuck'; entry: StuckEntry; why: string }
  | { kind: 'calm'; running: number; title: string; why: string }
  | { kind: 'incomplete'; title: string; why: string }
  | { kind: 'empty'; title: string; why: string }

/** Age in words: "moins d'une minute", "12 min", "7 h", "3 j". */
export function ageText(secs: number): string {
  const s = Math.max(0, secs)
  if (s < 60) return "moins d'une minute"
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} j`
}

/** The waiting entries, oldest first, ties by request id. Exported for the tests. */
export function compareWaiting(a: WaitingEntry, b: WaitingEntry): number {
  return b.request.age_secs - a.request.age_secs || a.request.request_id.localeCompare(b.request.request_id)
}

function stuckWhy(e: StuckEntry): string {
  switch (e.kind) {
    case 'stuck': {
      const cause = e.thread.stuck_reason ? `${STUCK_LABEL[e.thread.stuck_reason].toLowerCase()}` : 'à reprendre'
      return `ce fil est à l'arrêt depuis ${ageText(e.thread.age_secs)} : ${cause}`
    }
    case 'orphan':
      return `une demande est restée sans réponse depuis ${ageText(e.orphan.age_secs)} : la session s'est arrêtée`
    case 'unattached':
      return `une session sans fil est arrêtée depuis ${ageText(e.session.age_secs)}`
  }
}

export function recommendStart(bands: Bands, incomplete: readonly Band[] = []): StartHere {
  if (bands.waiting.length > 0) {
    const entry = [...bands.waiting].sort(compareWaiting)[0]
    const n = bands.waiting.length
    const extra = n > 1 ? ` (la plus ancienne de ${n} demandes)` : ''
    return {
      kind: 'waiting',
      entry,
      why: `un agent vivant attend ta réponse depuis ${ageText(entry.request.age_secs)}${extra}`,
    }
  }
  if (bands.stuck.length > 0) {
    const entry = [...bands.stuck].sort(compareStuck)[0]
    return { kind: 'stuck', entry, why: stuckWhy(entry) }
  }
  if (incomplete.includes('waiting') || incomplete.includes('stuck')) {
    return {
      kind: 'incomplete',
      title: 'Je ne peux pas dire par quoi commencer',
      why: "une source n'a pas répondu : ce qui demande ta réponse ou s'est arrêté n'est peut-être pas affiché",
    }
  }
  const n = bands.counts.running
  if (n > 0) {
    return {
      kind: 'calm',
      running: n,
      title: `Rien ne te bloque : ${n} ${n === 1 ? 'fil avance seul' : 'fils avancent seuls'}`,
      why: "aucun agent n'attend ta réponse et rien n'est à reprendre",
    }
  }
  return {
    kind: 'empty',
    title: 'Rien à faire pour le moment',
    why: "aucun agent n'attend ta réponse, rien n'est à reprendre, rien n'est en cours",
  }
}
