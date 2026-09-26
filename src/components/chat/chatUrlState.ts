/**
 * The chat's place in the URL: which conversation, and how it is shown.
 *
 * Two query parameters, valid on every route:
 *
 *   ?chat=<session uuid>          the conversation loaded in the panel
 *   &chatView=open|fullscreen     the panel is visible, and how
 *
 * Query parameters rather than a route segment because the chat is an overlay
 * on top of whatever page is underneath, not a page of its own: the same
 * conversation can sit over the kanban or over the graph, and a route would
 * force a choice between them.
 *
 * The two parameters are independent on purpose. A session loaded behind a
 * closed panel is kept (`chat` without `chatView`), so a reload restores it and
 * reopening the panel shows the same conversation — exactly as before the
 * reload, which is the whole point.
 *
 * Kept free of React so the parsing and the write rule are testable on their
 * own; `useChatUrlSync` is the thin layer that wires them to the router.
 */
import type { ChatPanelMode } from '@/types'

export const CHAT_SESSION_PARAM = 'chat'
export const CHAT_VIEW_PARAM = 'chatView'

export interface ChatUrlState {
  sessionId: string | null
  mode: ChatPanelMode
}

// Session ids are server-issued UUIDs. Anything else in the URL is ignored
// rather than handed to `loadSession`, which would open a WebSocket for it.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Read the chat state a URL asks for. Invalid values degrade to "nothing". */
export function parseChatUrl(search: URLSearchParams): ChatUrlState {
  const rawSession = search.get(CHAT_SESSION_PARAM)
  const rawView = search.get(CHAT_VIEW_PARAM)
  return {
    sessionId: rawSession && UUID_RE.test(rawSession) ? rawSession.toLowerCase() : null,
    mode: rawView === 'open' || rawView === 'fullscreen' ? rawView : 'closed',
  }
}

/**
 * Write the chat state into a copy of `search`, leaving every other parameter
 * (`?project=`, `?view=`, pagination…) untouched.
 *
 * Returns `null` when the URL already says exactly this, so the caller can skip
 * the navigation entirely — writing an identical URL on every render would
 * still churn the router and every `useSearchParams` consumer.
 */
export function writeChatUrl(
  search: URLSearchParams,
  state: ChatUrlState,
): URLSearchParams | null {
  const next = new URLSearchParams(search)
  if (state.sessionId) next.set(CHAT_SESSION_PARAM, state.sessionId)
  else next.delete(CHAT_SESSION_PARAM)
  if (state.mode !== 'closed') next.set(CHAT_VIEW_PARAM, state.mode)
  else next.delete(CHAT_VIEW_PARAM)
  return next.toString() === search.toString() ? null : next
}

/**
 * The state the app boots in: panel closed, no session.
 *
 * Used by the sync to tell "the restore has not landed yet" from "the app has
 * moved on". Waiting on this, rather than on the exact restored state, cannot
 * get stuck: if anything overrides the restored mode, the state is no longer
 * the default and the URL resumes following it.
 */
export function isStartupDefault(state: ChatUrlState): boolean {
  return state.sessionId === null && state.mode === 'closed'
}
