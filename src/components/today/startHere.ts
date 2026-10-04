import type { Band, RunnerState } from '@/types/attention'
import {
  STUCK_LABEL,
  compareStuck,
  compareWaiting,
  type Bands,
  type StuckEntry,
  type WaitingEntry,
} from './bands'

/**
 * The day in ONE sentence (the page's headline) — computed by a pure, deterministic rule.
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
 * Only POSSIBLE actions are recommended: a stopped thread whose "Reprendre" is disabled
 * (the runner is busy with another plan, or the thread has no plan to run) is skipped for
 * the next one; when none can be resumed, the result is `blocked` and says so.
 *
 * Honesty: when a source of the payload failed for "À traiter", "À reprendre" or "En cours",
 * (c) and (d) would claim something unknown ("rien ne te bloque", "rien n'est en cours"):
 * the result is then `incomplete`, which says so instead.
 */

export type StartHere =
  | { kind: 'waiting'; entry: WaitingEntry; why: string }
  | { kind: 'stuck'; entry: StuckEntry; why: string }
  | { kind: 'calm'; running: number; title: string; why: string }
  | { kind: 'incomplete'; title: string; why: string }
  /** Something is stopped, but nothing of it can be resumed right now (the runner is busy). */
  | { kind: 'blocked'; title: string; why: string }
  | { kind: 'empty'; title: string; why: string }

/** Age in words: "moins d'une minute", "12 min", "7 h", "3 j". */
export function ageText(secs: number): string {
  const s = Math.max(0, secs)
  if (s < 60) return "moins d'une minute"
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} j`
}

function stuckWhy(e: StuckEntry): string {
  switch (e.kind) {
    case 'stuck': {
      const cause = e.thread.stuck_reason ? `${STUCK_LABEL[e.thread.stuck_reason].toLowerCase()}` : 'à reprendre'
      return `ce plan est à l'arrêt depuis ${ageText(e.thread.age_secs)} : ${cause}`
    }
    case 'orphan':
      return `une demande est restée sans réponse depuis ${ageText(e.orphan.age_secs)} : la conversation s'est arrêtée`
    case 'unattached':
      return `une conversation est arrêtée depuis ${ageText(e.session.age_secs)}`
  }
}

/** Can the user act on this stuck entry now? A thread needs the runner (and a plan); a request needs only a message. */
function canAct(e: StuckEntry, runner: RunnerState | null): boolean {
  if (e.kind !== 'stuck') return true
  return runner?.status !== 'busy' && e.thread.plan !== null
}

export function recommendStart(
  bands: Bands,
  incomplete: readonly Band[] = [],
  runner: RunnerState | null = null,
): StartHere {
  if (bands.waiting.length > 0) {
    const entry = [...bands.waiting].sort(compareWaiting)[0]
    const n = bands.waiting.length
    const extra = n > 1 ? ` (la plus ancienne de ${n} demandes)` : ''
    return {
      kind: 'waiting',
      entry,
      why: `un assistant attend ta réponse depuis ${ageText(entry.request.age_secs)}${extra}`,
    }
  }
  if (bands.stuck.length > 0) {
    const entry = [...bands.stuck].sort(compareStuck).find((e) => canAct(e, runner))
    if (entry) return { kind: 'stuck', entry, why: stuckWhy(entry) }
    const n = bands.stuck.length
    const holder = runner?.status === 'busy' ? runner.busy_with?.plan_title : null
    return {
      kind: 'blocked',
      title: 'Rien que tu puisses reprendre maintenant',
      why: `${n === 1 ? 'un travail est à reprendre' : `${n} travaux sont à reprendre`}, mais ${
        holder ? `un autre plan tourne déjà : « ${holder} »` : 'aucune reprise n\'est possible pour le moment'
      }`,
    }
  }
  if (incomplete.includes('waiting') || incomplete.includes('stuck') || incomplete.includes('running')) {
    return {
      kind: 'incomplete',
      title: 'Je ne peux pas dire par quoi commencer',
      why: "une source n'a pas répondu : ce qui demande ta réponse, s'est arrêté ou est en cours n'est peut-être pas affiché",
    }
  }
  const n = bands.counts.running
  if (n > 0) {
    return {
      kind: 'calm',
      running: n,
      title: `Rien ne te bloque : ${n} ${n === 1 ? 'plan avance seul' : 'plans avancent seuls'}`,
      why: "aucun assistant n'attend ta réponse et rien n'est à reprendre",
    }
  }
  return {
    kind: 'empty',
    title: 'Rien à faire pour le moment',
    why: "aucun assistant n'attend ta réponse, rien n'est à reprendre, rien n'est en cours",
  }
}

/** The page's headline: the state of the day in a few words, and the reason under it. */
export interface Headline {
  title: string
  why: string
  /** Where the headline points: the section the reader should go to, if any. */
  band: Band | null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function headline(start: StartHere, bands: Bands): Headline {
  switch (start.kind) {
    case 'waiting': {
      const n = bands.waiting.length
      return {
        title: n === 1 ? 'Un assistant attend ta réponse' : `${n} assistants attendent ta réponse`,
        why: `${n === 1 ? 'Il attend' : 'Le plus ancien attend'} depuis ${ageText(start.entry.request.age_secs)}.`,
        band: 'waiting',
      }
    }
    case 'stuck': {
      const n = bands.stuck.length
      return {
        title: n === 1 ? 'Un travail est à reprendre' : `${n} travaux sont à reprendre`,
        why: `${cap(start.why)}.`,
        band: 'stuck',
      }
    }
    default:
      return { title: start.title, why: `${cap(start.why)}.`, band: start.kind === 'calm' ? 'running' : null }
  }
}
