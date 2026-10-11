import { atom } from 'jotai'
import { atomWithStorage, RESET } from 'jotai/utils'
import type { BackgroundTaskInfo, ChatPanelMode, PermissionConfig, Project, WsConnectionStatus } from '@/types'
import type { ToolPolicyMode } from '@/types/provider'
import type { QueuedMessage } from '@/components/chat/messageQueue'
import type { Attachment } from '@/components/chat/attachmentState'

/** Hint set by pages that know which project the user is looking at */
export const chatSuggestedProjectIdAtom = atom<string | null>(null)

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatPanelWidthAtom = atom<number>(400)
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)

/**
 * The session whose context window is being compacted (PreCompact hook fired, waiting for
 * compact_boundary), or null. A session id, not a boolean: a flag shared by every conversation
 * showed one session's compaction over all the others.
 */
export const chatCompactingAtom = atom<string | null>(null)

/** WebSocket connection status for the chat */
export const chatWsStatusAtom = atom<WsConnectionStatus>('disconnected')

/** Whether the chat is replaying persisted events (after WS connect) */
export const chatReplayingAtom = atom<boolean>(false)

/** Scroll-to-message target from search results (null = no scroll target) */
export const chatScrollToTurnAtom = atom<{
  turnIndex: number
  snippet?: string
  /** Unix timestamp (seconds) from the search hit — used for exact matching */
  createdAt?: number
  role?: 'user' | 'assistant'
} | null>(null)

/** Runtime permission config (loaded from server, null = not yet loaded) */
export const chatPermissionConfigAtom = atom<PermissionConfig | null>(null)

/**
 * Per-session permission mode override (null = use server default).
 * Neutral: whatever the backend sent was read with `readToolPolicyMode`.
 */
export const chatSessionPermissionOverrideAtom = atom<ToolPolicyMode | null>(null)

/** Active model for the current session (null = not yet known / use default) */
export const chatSessionModelAtom = atom<string | null>(null)

/** Whether auto-continue is enabled (automatically sends "Continue" after max_turns) */
export const chatAutoContinueAtom = atom<boolean>(false)

/** Storage key of `chatTimelineOpenAtom` (also read by the reset on phones). */
export const CHAT_TIMELINE_OPEN_KEY = 'chat-timeline-open'
/** Whether the chat's timeline panel is open (remembered per browser). */
export const chatTimelineOpenAtom = atomWithStorage<boolean>(CHAT_TIMELINE_OPEN_KEY, false)

/** Draft key of a conversation that has no id yet (nothing sent so far). */
export const NEW_CONVERSATION_DRAFT_KEY = '__new__'

/** Drafts kept in storage. Past this, the least recently edited one goes. */
export const MAX_STORED_DRAFTS = 50

/** The storage key of a conversation's draft. */
export function draftKeyFor(sessionId: string | null | undefined): string {
  return sessionId ?? NEW_CONVERSATION_DRAFT_KEY
}

/**
 * Every unsent draft, one per conversation, in localStorage.
 * Key = session id, or `NEW_CONVERSATION_DRAFT_KEY` for a conversation not yet
 * created. Read at init (`getOnInit`): a write made before hydration would
 * otherwise start from `{}` and overwrite every stored draft.
 */
export const chatDraftsMapAtom = atomWithStorage<Record<string, string>>('chat-drafts', {}, undefined, {
  getOnInit: true,
})

/**
 * The stored drafts, whatever storage holds. localStorage is outside our
 * control (another version of the app, a hand edit, an extension): anything
 * that is not a plain object of strings is ignored rather than trusted — a
 * `null` there would otherwise throw on every render of the composer.
 */
function readDrafts(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const drafts: Record<string, string> = {}
  for (const [key, text] of Object.entries(value)) {
    if (typeof text === 'string' && text !== '') drafts[key] = text
  }
  return drafts
}

/** `map` with `key` set to `text` — removed when empty, most recent last, capped. */
function withDraft(map: Record<string, string>, key: string, text: string): Record<string, string> {
  if ((map[key] ?? '') === text) return map
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) {
    if (k !== key) next[k] = v
  }
  // The text is kept as typed: trimming here would eat the space the user
  // just typed, since the textarea is controlled by this value.
  if (text !== '') next[key] = text
  const keys = Object.keys(next)
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_STORED_DRAFTS))) {
    delete next[stale]
  }
  return next
}

/**
 * The text being typed in the composer, for the CURRENT conversation.
 *
 * It is a view over `chatDraftsMapAtom`, keyed by `chatSessionIdAtom`: each
 * conversation has its own draft, switching conversation shows that
 * conversation's draft, and every keystroke is persisted — so the draft
 * survives a page reload. It used to be one in-memory string for the whole
 * app, copied to storage only when switching conversation: a reload lost it.
 */
export const chatDraftInputAtom = atom(
  (get) => readDrafts(get(chatDraftsMapAtom))[draftKeyFor(get(chatSessionIdAtom))] ?? '',
  (get, set, next: string | ((prev: string) => string)) => {
    const key = draftKeyFor(get(chatSessionIdAtom))
    const map = readDrafts(get(chatDraftsMapAtom))
    const text = typeof next === 'function' ? next(map[key] ?? '') : next
    set(chatDraftsMapAtom, withDraft(map, key, text))
  },
)

/**
 * Move a draft from one conversation key to another. Used when a new
 * conversation receives its id: what was typed while the id was on its way
 * follows the conversation instead of staying behind under the "new" key.
 * A draft already present at the destination is kept.
 */
export const moveChatDraftAtom = atom(null, (get, set, { from, to }: { from: string; to: string }) => {
  if (from === to) return
  const map = readDrafts(get(chatDraftsMapAtom))
  const text = map[from]
  if (text === undefined) return
  const withoutSource = withDraft(map, from, '')
  set(chatDraftsMapAtom, map[to] ? withoutSource : withDraft(withoutSource, to, text))
})

/**
 * Forget every draft, in memory and in storage. For an explicit sign-out:
 * unsent text is the user's, and must not greet whoever signs in next on the
 * same browser. A session that merely expired keeps its drafts.
 */
export const clearChatDraftsAtom = atom(null, (_get, set) => {
  set(chatDraftsMapAtom, RESET)
  // Queued messages are unsent text too.
  set(chatMessageQueuesAtom, {})
})

/** Selected project for new conversations (survives layout switches & new-session) */
export const chatSelectedProjectAtom = atom<Project | null>(null)

/** When true, chat targets the entire workspace (all projects) instead of a single project */
export const chatAllProjectsModeAtom = atom<boolean>(true)

/** Whether the active workspace has at least one project (set by ProjectSelect after loading) */
export const chatWorkspaceHasProjectsAtom = atom<boolean>(false)

/** Whether spawned (child) sessions are visible in the session list */
export const showSpawnedSessionsAtom = atomWithStorage<boolean>('show-spawned-sessions', true)

/**
 * Background subprocesses currently tracked for the active chat session.
 * Plan 5985a7c4 (F2). The atom holds the **full snapshot** received on
 * the most recent `ChatEvent::active_tasks_update` (the backend always
 * carries the full list, never deltas — see backend plan 754a1379 T4).
 *
 * Lifecycle:
 * - Reset to `[]` on session switch / disconnect (chat is "empty" until
 *   either the next ActiveTasksUpdate arrives or F7's REST snapshot
 *   hydration completes).
 * - Updated by `useChat`'s WS dispatch on every `active_tasks_update`.
 * - Read by `useBackgroundTasks` for the toolbar pill (F3) and per-task
 *   popover; also by F6's grouping logic (matches `correlation_id` of
 *   `background_output` events to a task by id).
 *
 * Semantics: order is whatever the backend sent — the UI sorts as it
 * sees fit (typically by `started_at` ascending).
 */
export const chatBackgroundTasksAtom = atom<BackgroundTaskInfo[]>([])

/**
 * The last failed or refused cancel of the running tools announced on the live
 * stream (`error { code: cancel_failed | cancel_refused, reason }`), for the Stop
 * chips whose request went over the socket: they get no REST answer, only this.
 * `at` is `Date.now()` on arrival — a chip ignores a failure older than its click.
 */
export interface LastCancelFailure {
  sessionId: string
  reason: string
  at: number
}
export const chatLastCancelFailureAtom = atom<LastCancelFailure | null>(null)

/**
 * Secrets the agent of the CURRENT session asked for and the user has not
 * answered yet (vault `request_secret`). Fed live by `secret_request` /
 * `secret_request_resolved` WS events and hydrated from `GET /api/vault` when a
 * session opens — the events are ephemeral, the server keeps the list.
 */
export interface PendingSecretRequest {
  id: string
  name: string
  reason: string
  exists: boolean
}
export const chatSecretRequestsAtom = atom<PendingSecretRequest[]>([])

/**
 * The messages queued behind a running response, per conversation.
 *
 * The SESSION holds them, on the server, and delivers each one when the turn
 * before it ends (`chat/pending_queue.rs`). This atom is what the page shows:
 * the list the server last published for a conversation (`pending_queue`
 * events), plus `local` rows not handed over yet. See
 * `components/chat/messageQueue.ts` for why the queue is not kept here.
 *
 * Keyed like the drafts (`draftKeyFor`). In memory only: on a reload, the
 * server's list comes back when the conversation is opened.
 */
export const chatMessageQueuesAtom = atom<Record<string, QueuedMessage[]>>({})

/** `queues` with the queue of `key` replaced. An empty queue leaves no entry behind. */
export function withQueue(
  queues: Record<string, QueuedMessage[]>,
  key: string,
  queue: QueuedMessage[],
): Record<string, QueuedMessage[]> {
  const next = { ...queues }
  if (queue.length === 0) delete next[key]
  else next[key] = queue
  return next
}

/**
 * Move a queue from one conversation key to another. Used when a new
 * conversation receives its id: what was queued while the id was on its way
 * (the first response is already streaming) follows the conversation.
 */
export const moveChatQueueAtom = atom(null, (get, set, { from, to }: { from: string; to: string }) => {
  if (from === to) return
  const queues = get(chatMessageQueuesAtom)
  const moved = queues[from]
  if (!moved) return
  set(chatMessageQueuesAtom, withQueue(withQueue(queues, from, []), to, [...(queues[to] ?? []), ...moved]))
})
/**
 * Files attached to the message currently being composed.
 *
 * Each entry is already being uploaded (or has finished, or failed) — see
 * `components/chat/attachmentState.ts`, which owns every rule about their state.
 * The atom holds only what the composer is carrying right now; documents that
 * are already part of the conversation live server-side.
 *
 * In an atom rather than component state for the same reason as the draft
 * text: `ChatInput` remounts when the panel switches between the side layout
 * and fullscreen, and an upload in flight must survive that.
 *
 * Cleared on session switch: a screenshot attached for session A must never
 * ride along with a message to session B. In-flight
 * uploads are aborted at the same time (`ChatInput`).
 */
export const chatAttachmentsAtom = atom<Attachment[]>([])

/**
 * A send is being held until the attachments finish uploading
 * (`ATTACHMENT_POLICY.deferSendWhileUploading`).
 *
 * In an atom, not component state, for a reason worth spelling out: if
 * `ChatInput` remounts (layout switch) while a send is held, component state
 * would forget the held send and the message would never leave.
 *
 * Cleared alongside `chatAttachmentsAtom` on session switch.
 */
export const chatAttachmentDeferredSendAtom = atom<boolean>(false)

/**
 * Capabilities the server announced in `auth_ok.features` (contract C7).
 * `null` = no authenticated socket yet (or an older server that announces
 * nothing): every optional feature is off.
 */
export const chatServerFeaturesAtom = atom<readonly string[] | null>(null)

/**
 * The server understands references (`refs_v1`). While false the client emits
 * no `refs`, offers no `#` and the chat is exactly what it was before.
 */
export const refsEnabledAtom = atom((get) => get(chatServerFeaturesAtom)?.includes('refs_v1') ?? false)

/**
 * One sentence for the screen-reader live region (`RefsAnnouncer`) when the
 * references of the turn just sent were not all read in full. Set on the
 * LIVE event only: a replayed history must not speak.
 */
export const refsAnnouncementAtom = atom<string>('')

/**
 * What the composer knows about the references of the draft (label, subtitle
 * from the search result), keyed by `kind:id`. The DRAFT TEXT is the source of
 * truth (it persists the `#kind:id` tokens); this only dresses them. Lost on a
 * reload: the chips then fall back to "Kind shortid" until the server resolves them.
 */
export const chatRefLabelsAtom = atom<Record<string, import('@/refs/types').ChatReference>>({})

/**
 * A conversation that moved to another provider and that this tab must follow
 * (`conversation_relayed` on the thread it left, the switch route's answer, or the
 * "open the continuation" link of a closed thread). `useChat` consumes it: it opens
 * `sessionId` and clears the request.
 */
export interface ChatFollowRequest {
  /** The session that continues the conversation. */
  sessionId: string
  /** The session it left (its draft, if any, follows the conversation). */
  fromSessionId: string
  /** Shown above the composer once followed; null when the user moved it from this tab. */
  notice: { fromProvider: string; toProvider: string; movedBy: string } | null
}
export const chatFollowRequestAtom = atom<ChatFollowRequest | null>(null)

/** What this tab says after following a conversation moved elsewhere, for that session only. */
export const chatFollowNoticeAtom = atom<{ sessionId: string; fromProvider: string; toProvider: string; movedBy: string } | null>(null)

/** The session this tab is moving to another provider right now (switch route in flight). */
export const chatSwitchingSessionAtom = atom<string | null>(null)
