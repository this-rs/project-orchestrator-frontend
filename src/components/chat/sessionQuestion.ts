/**
 * Is this question STILL the server's open question — i.e. is a person actually
 * being waited on for this very card?
 *
 * There is exactly one answer that makes a question card actionable, and it is
 * a POSITIVE one: the session says it is `waiting_on_person` AND the rule that
 * decided is the open question itself (`question_open`). Everything else is
 * "not open":
 *
 * - the turn ended (`done`, `reporting`), so the tool call is dead;
 * - the turn was interrupted, which closes the question without closing its
 *   `tool_call_id` (session cadfa92b, question « Disque » asked 13:37:53 UTC and
 *   never answered): the card stayed clickable and its answer went to a tool
 *   that no longer exists — the API refused, the screen said nothing, the user
 *   concluded the conversation was broken;
 * - the session is not live, or never was;
 * - the activity was never read, or the read failed (`null`).
 *
 * FAIL-CLOSED: unknown is not open. The asymmetry is deliberate. A wrong
 * "open" costs a click that answers a dead tool and a conversation that looks
 * broken, with no way for the user to tell; a wrong "expired" costs one normal
 * message, and the very next read (5 s, `useSessionActivity`) gives the card
 * back.
 *
 * Deliberately NOT considered: `pending_permissions > 0`, `monitors > 0`, a
 * streaming turn. None of them says anything about this question's tool call.
 */
import type { SessionActivity } from '@/types'

/** The one verdict that makes a question card answerable. */
export function questionAwaitsPerson(activity?: SessionActivity | null): boolean {
  return activity?.state === 'waiting_on_person' && activity?.state_reason?.rule === 'question_open'
}
