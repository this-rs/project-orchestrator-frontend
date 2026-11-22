/**
 * Targeted stops (`cancel-task/{task_id}`) sent from the activity bar, kept in
 * the Jotai store rather than in `ActivityBar`'s own state: the bar unmounts
 * whenever nothing runs or the composer goes away, and an answer that arrives
 * meanwhile must still be there when it comes back.
 *
 * One entry per (session, user, auth mode, task). An answer is therefore shown
 * only to the identity and session that sent it: after A → B → A, B sees
 * nothing and A finds its answer again. An entry stays until a person
 * acknowledges it (`ActivityBar`'s "I checked this task"); it lives as long as
 * the store, i.e. this tab, and is not bounded in number.
 */
import { atom } from 'jotai'
import type { MessageKey } from '@/i18n'

/**
 * What a Stop click came back with. `error` holds message keys, not text, so
 * the notice follows a later change of language.
 */
export type TaskCancelFeedback =
  | { kind: 'success'; killed: number }
  | { kind: 'fallback' }
  | { kind: 'error'; keys: readonly MessageKey[] }

/** `token` ties an answer to the click that sent it. */
export type TaskCancelEntry =
  | { phase: 'sending'; token: symbol }
  | { phase: 'answered'; token: symbol; feedback: TaskCancelFeedback }

export const taskCancellationAtom = atom<Readonly<Record<string, TaskCancelEntry>>>({})

/** JSON encoding avoids collisions between opaque principal, session and task IDs. */
export function taskCancellationKey(sessionId: string | null, userId: string | null, mode: string, taskId: string): string {
  return JSON.stringify([sessionId, userId, mode, taskId])
}
