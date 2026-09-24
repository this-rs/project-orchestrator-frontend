import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { BackgroundTaskInfo, ChatPanelMode, PermissionConfig, PermissionMode, Project, WsConnectionStatus } from '@/types'
import type { QueuedMessage } from '@/components/chat/messageQueue'
import type { Attachment } from '@/components/chat/attachmentState'

/** Hint set by pages that know which project the user is looking at */
export const chatSuggestedProjectIdAtom = atom<string | null>(null)

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatPanelWidthAtom = atom<number>(400)
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)

/** Whether the context window is currently being compacted (PreCompact hook fired, waiting for compact_boundary) */
export const chatCompactingAtom = atom<boolean>(false)

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

/** Per-session permission mode override (null = use server default) */
export const chatSessionPermissionOverrideAtom = atom<PermissionMode | null>(null)

/** Active model for the current session (null = not yet known / use default) */
export const chatSessionModelAtom = atom<string | null>(null)

/** Tools auto-approved via "Remember for this session" checkbox (reset on new session) */
export const chatAutoApprovedToolsAtom = atom<Set<string>>(new Set<string>())

/** Whether auto-continue is enabled (automatically sends "Continue" after max_turns) */
export const chatAutoContinueAtom = atom<boolean>(false)

/** Draft text in the chat input textarea (survives layout switches & settings overlay) */
export const chatDraftInputAtom = atom<string>('')

/** Per-session draft persistence in localStorage. Key = sessionId (or '__new__' for new conversations) */
export const chatDraftsMapAtom = atomWithStorage<Record<string, string>>('chat-drafts', {})

/** Selected project for new conversations (survives layout switches & new-session) */
export const chatSelectedProjectAtom = atom<Project | null>(null)

/** When true, chat targets the entire workspace (all projects) instead of a single project */
export const chatAllProjectsModeAtom = atom<boolean>(true)

/** Whether the active workspace has at least one project (set by ProjectSelect after loading) */
export const chatWorkspaceHasProjectsAtom = atom<boolean>(false)

/** Whether spawned (child) sessions are visible in the session list */
export const showSpawnedSessionsAtom = atomWithStorage<boolean>('show-spawned-sessions', true)

/** Derived: true when permission mode requires interactive approval (not bypassPermissions) */
export const chatPermissionInteractiveAtom = atom((get) => {
  const config = get(chatPermissionConfigAtom)
  return config !== null && config.mode !== 'bypassPermissions'
})

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
 * Messages composed while the agent was still answering, held client-side.
 *
 * Empty in the normal case. A send while `chatStreamingAtom` is true appends
 * here instead of dispatching, so the running response is no longer cut short
 * (the backend interrupts the CLI on a mid-stream send — see
 * `chat/manager.rs`). The queue drains one message per finished turn, and each
 * row can be edited, dropped, or fired immediately from the UI.
 *
 * Cleared on session switch: a message composed for session A must never land
 * in session B.
 */
export const chatMessageQueueAtom = atom<QueuedMessage[]>([])
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
 * Cleared on session switch, like the message queue: a screenshot attached for
 * session A must never ride along with a message to session B. In-flight
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
