import type { Band, RunnerState } from '@/types/attention'
import {
  STUCK_LABEL,
  compareStuck,
  compareWaiting,
  type Bands,
  type StuckEntry,
  type WaitingEntry,
} from './bands'
import { TEXT } from './text'

/**
 * The day in ONE sentence (the page's headline) — computed by a pure, deterministic rule.
 * No score, no invented priority: the only criterion is how long something has waited.
 *
 *   (a) the OLDEST request of a LIVE agent that waits on the user
 *       (a dead session never counts here: its request is in "To resume");
 *   (b) else the OLDEST stuck or resumable item ("To resume": a stopped thread,
 *       a request left without answer, a stopped session without thread);
 *   (c) else, if some threads advance on their own: "Nothing is blocking you: N plans are moving on their own";
 *   (d) else the empty state.
 *
 * Ties on age are broken by id (request id, thread id or session id, ascending
 * string order), so the answer never depends on the order of the payload.
 * "Oldest" is the backend's `age_secs`, taken as is.
 *
 * Only POSSIBLE actions are recommended: a stopped thread whose "Resume" is disabled
 * (the runner is busy with another plan, or the thread has no plan to run) is skipped for
 * the next one; when none can be resumed, the result is `blocked` and says so.
 *
 * Honesty: when a source of the payload failed for "Waiting for you", "To resume" or "In progress",
 * (c) and (d) would claim something unknown ("nothing is blocking you", "nothing is in progress"):
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

/** Age in words: "under a minute", "12 min", "7 h", "3 d". */
export function ageText(secs: number): string {
  const s = Math.max(0, secs)
  if (s < 60) return TEXT.age.lessThanMinute
  if (s < 3600) return TEXT.age.minutes(Math.floor(s / 60))
  if (s < 86400) return TEXT.age.hours(Math.floor(s / 3600))
  return TEXT.age.days(Math.floor(s / 86400))
}

const H = TEXT.headline

function stuckWhy(e: StuckEntry): string {
  switch (e.kind) {
    case 'stuck': {
      const cause = e.thread.stuck_reason ? STUCK_LABEL[e.thread.stuck_reason].toLowerCase() : H.stuckDefaultCause
      return H.stuckPlanReason(ageText(e.thread.age_secs), cause)
    }
    case 'orphan':
      return H.stuckOrphanReason(ageText(e.orphan.age_secs))
    case 'unattached':
      return H.stuckSessionReason(ageText(e.session.age_secs))
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
    return {
      kind: 'waiting',
      entry,
      why: H.waitingReason(bands.waiting.length, ageText(entry.request.age_secs)),
    }
  }
  if (bands.stuck.length > 0) {
    const entry = [...bands.stuck].sort(compareStuck).find((e) => canAct(e, runner))
    if (entry) return { kind: 'stuck', entry, why: stuckWhy(entry) }
    const n = bands.stuck.length
    const holder = runner?.status === 'busy' ? runner.busy_with?.plan_title : null
    return { kind: 'blocked', title: H.blockedTitle, why: H.blockedWhy(n, holder) }
  }
  if (incomplete.includes('waiting') || incomplete.includes('stuck') || incomplete.includes('running')) {
    return { kind: 'incomplete', title: H.incompleteTitle, why: H.incompleteWhy }
  }
  const n = bands.counts.running
  if (n > 0) {
    return { kind: 'calm', running: n, title: H.calmTitle(n), why: H.calmWhy }
  }
  return { kind: 'empty', title: H.emptyTitle, why: H.emptyWhy }
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
      return { title: H.waitingTitle(n), why: H.waitingWhy(n, ageText(start.entry.request.age_secs)), band: 'waiting' }
    }
    case 'stuck': {
      const n = bands.stuck.length
      return { title: H.stuckTitle(n), why: `${cap(start.why)}.`, band: 'stuck' }
    }
    default:
      return { title: start.title, why: `${cap(start.why)}.`, band: start.kind === 'calm' ? 'running' : null }
  }
}
