import { splitAttachments } from '@/utils/messageAttachments'
import { splitRefs } from '@/utils/messageRefs'
import { applyResolved, bindResolvedRefs, parseResolvedRefs, refsFromBlock, resolutionAnnouncement } from '@/refs/refState'
import { useRefKindsSync } from '@/refs/useActiveKinds'
import { cachedRefsCapability, ensureRefsCapability, refsCapabilityScope } from '@/refs/refsCapability'
import { clearRefSearchCache } from '@/refs/useRefSearch'
import { getApiBase } from '@/services/env'
import { toEntityRef, type ChatReference, type EntityRef } from '@/refs/types'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { pickModelResolver } from '@/constants/providers'
import { distinctModels } from '@/utils/routingSelection'
import { chatSessionIdAtom, chatStreamingAtom, chatCompactingAtom, chatWsStatusAtom, chatReplayingAtom, chatSessionPermissionOverrideAtom, chatPermissionConfigAtom, chatSessionModelAtom, chatAutoContinueAtom,  chatDraftsMapAtom, moveChatDraftAtom, moveChatQueueAtom, chatMessageQueuesAtom, withQueue, draftKeyFor, NEW_CONVERSATION_DRAFT_KEY, chatBackgroundTasksAtom, chatSecretRequestsAtom, chatSessionProviderAtom, chatSessionCapabilitiesSnapshotAtom, chatSessionToolPolicyAtom, chatSessionEngineAtom, chatProviderTargetAtom, chatDraftInputAtom, chatSelectedProviderAtom, chatForcedTargetAtom, chatDraftAutoAtom, chatDraftRoutingModeAtom, chatDraftSelectionAtom, chatSessionRoutingAtom, sessionRoutingOf, chatRoutingSlugAtom, loadRoutingSettingsAtom, routingSettingsAtom, chatSessionOpenErrorAtom, chatSessionCapabilitiesAtom, providersAtom, providersLoadStateAtom, chatServerFeaturesAtom, refsEnabledAtom, refsAnnouncementAtom, currentUserAtom, isAuthenticatedAtom, chatFollowRequestAtom, chatFollowNoticeAtom, chatSwitchingSessionAtom } from '@/atoms'
import { apiErrorMessage } from '@/services/api'
import { toProviderError } from '@/services/providers'
import { applyResultCost } from '@/utils/cost'
import { chatApi, ChatWebSocket } from '@/services'
import { applyQueueOp, enqueue, mergeServerQueue, type QueueOp, type QueuedMessage } from '@/components/chat/messageQueue'
import type { ChatMessage, ChatStreamEvent, ContentBlock, PermissionMode } from '@/types'
import { isTrustAllowed, readToolPolicyMode, toWireMode, TRUST_FALLBACK_MODE, usableMode } from '@/constants/toolPolicy'
import {
  decodeStoredRefs,
  nextBlockId,
  nextMessageId,
  getParentToolUseId,
  withParent,
  withCreatedAt,
  attachToParentToolUse,
  appendBackgroundActivity,
  workflowEventToTick,
  sessionErrorText,
  sessionErrorMetadata,
  toolsCancelledText,
  sessionEventBlock,
  readSystemInitRuntime,
  lastSystemInitRuntime,
  systemInitProviderMetadata,
  systemInitToolMetadata,
  toolHintMetadata,
  isQuestionToolUse,
  questionMetadata,
  answerSyntheticQuestion,
  attachToolTiming,
  EarlyToolTimings,
  ServerClock,
  hasToolUse,
  historyEventsToWindow,
  placeTimings,
  serverTimeOf,
  permissionCallOf,
  userEchoTarget,
  type SystemInitRuntime,
  type BackgroundTick,
} from '@/utils/chatAssembly'
import { tr } from '@/i18n/lazy'
import { toProviderRef, toToolPolicy, type PermissionScope, type ToolPolicyMode } from '@/types/provider'
import type { BackgroundActivityMetadata, BackgroundOutputEntry } from '@/types'

/** Number of messages to load per page via REST */
const PAGE_SIZE = 50

/**
 * How long a Stop the socket accepted may go without ending the turn before it
 * is sent again over REST. A healthy backend answers in well under this.
 */
const INTERRUPT_ACK_TIMEOUT_MS = 4000

/**
 * Upper bound for the tail widening in `fetchRenderableTail`. 16 pages is
 * enough to clear a long burst of non-renderable events, and small enough not
 * to drag a whole multi-thousand-event conversation over the wire on open.
 */
const MAX_RENDERABLE_TAIL = PAGE_SIZE * 16

/** One loaded window of history, assembled and with its raw-event bookkeeping. */
interface LoadedWindow {
  messages: ChatMessage[]
  /** Timings of calls on an older page (see `historyEventsToWindow`). */
  unplacedTimings: EarlyToolTimings
  /** Raw events in the window — the pagination cursor advances by this, NOT by `messages.length`. */
  rawCount: number
  offset: number
  totalCount: number
  /** Last raw event, to tell a finished turn from a live one. */
  lastEvent?: { type?: string }
  /** Provider runtime of the last `system_init` in the window, if it holds one. */
  runtime: SystemInitRuntime | null
}

/** Whether a window shows the user any conversation, not only background-activity noise. */
function hasConversation(messages: ReadonlyArray<ChatMessage>): boolean {
  return messages.some((m) => m.blocks.some((b) => b.type !== 'background_activity'))
}

/** Fetch one window of raw events and assemble it. */
async function fetchWindow(sid: string, offset: number, limit: number, refsEnabled: boolean): Promise<LoadedWindow> {
  const data = await chatApi.getMessages(sid, { limit, offset })
  const assembled = historyEventsToWindow(data.messages, { refsEnabled })
  return {
    messages: assembled.messages,
    unplacedTimings: assembled.unplacedTimings,
    rawCount: data.messages.length,
    offset,
    totalCount: data.total_count,
    lastEvent: data.messages[data.messages.length - 1] as { type?: string } | undefined,
    runtime: lastSystemInitRuntime(data.messages),
  }
}

/**
 * Load the tail of a conversation as messages that actually render.
 *
 * A page of raw events does not necessarily render anything. `background_output`
 * ticks attach to the `tool_use` block they belong to and are DROPPED when that
 * parent sits outside the loaded window (see chatAssembly), and internal types
 * render nothing at all. A long run of background subagents therefore fills the
 * whole last PAGE_SIZE with events that assemble to zero messages — and an empty
 * `messages` makes ChatMessages show the "new conversation" welcome screen over
 * a conversation holding thousands of events. That screen REPLACES the scroll
 * container, so "load older" can never be reached: the history is then
 * unrecoverable from the UI, which is why this is worth a retry loop.
 *
 * Since F10, orphan ticks are no longer dropped but rendered as
 * `background_activity` blocks — so a window of nothing but ticks is not
 * empty anymore, yet it still shows the user none of their conversation. A
 * window therefore counts as renderable only when it carries something other
 * than background activity: the last real exchange, with the activity block
 * after it.
 *
 * So when a window assembles to no conversation and older events exist, widen
 * it — keeping the END anchored on the tail rather than walking backwards, so
 * the caller still holds a true tail window (`isAtTail`, no "newer" page) and
 * live events keep appending normally.
 */
async function fetchRenderableTail(sid: string, total: number, refsEnabled: boolean): Promise<LoadedWindow> {
  let limit = PAGE_SIZE
  let win = await fetchWindow(sid, Math.max(0, total - limit), limit, refsEnabled)
  while (!hasConversation(win.messages) && win.offset > 0 && limit < MAX_RENDERABLE_TAIL) {
    limit = Math.min(limit * 4, MAX_RENDERABLE_TAIL)
    win = await fetchWindow(sid, Math.max(0, total - limit), limit, refsEnabled)
  }
  return win
}

/**
 * Decide how to apply a REPLAYED text segment (assistant_text / partial_text /
 * thinking) against what is already rendered — without ever destroying content.
 *
 * The server replays the current stream from its start on every connect while
 * streaming, so the same text can reach us two ways: already rendered live via
 * stream_delta (which CONCATENATES consecutive segments into a single block),
 * or already loaded from REST history on a mid-stream join. Live deltas merging
 * segments is why plain equality is not enough — the rendered block is often a
 * SUPERSET of the replayed segment.
 *
 * - 'skip'    → the segment is already covered by what's rendered
 * - 'replace' → the rendered block is a strict PREFIX of the segment (the
 *               connection died mid-segment): grow it to the full text
 * - 'append'  → genuinely new content
 *
 * Never returns anything that removes rendered content.
 */
function reconcileReplayedText(
  window: ReadonlyArray<StreamWindowEntry>,
  type: 'text' | 'thinking',
  text: string,
  parent: string | undefined,
): { action: 'skip' } | { action: 'replace'; mi: number; bi: number } | { action: 'append' } {
  if (!text) return { action: 'skip' }

  for (let i = window.length - 1; i >= 0; i--) {
    const { block: b, mi, bi } = window[i]
    if (b.type !== type || b.metadata?.parent_tool_use_id !== parent) continue
    // Already rendered verbatim, or merged into a larger block by live deltas.
    if (b.content === text || b.content.includes(text)) return { action: 'skip' }
    // Half-streamed segment: the rendered block is a prefix of the full one.
    if (b.content && text.startsWith(b.content)) return { action: 'replace', mi, bi }
  }
  return { action: 'append' }
}

/** One rendered block plus its (message index, block index) coordinates. */
interface StreamWindowEntry {
  mi: number
  bi: number
  block: { type: string; content: string; metadata?: Record<string, unknown> }
}

/**
 * Collect the blocks of the CURRENT STREAM as a reconciliation window.
 *
 * The Phase 1.5b snapshot replays the stream from its START, and one stream
 * can span SEVERAL messages: queued mid-stream sends insert user bubbles,
 * after which handleEvent opens a fresh assistant message. Reconciling
 * against only the last message therefore compares the replayed turn-1
 * content with an empty/partial turn-2 message and re-appends everything —
 * the "same content stacked several times" bug.
 *
 * Window = every assistant block after the last COMPLETED turn. A completed
 * turn is detected by the result metrics stamped on the assistant message
 * (`duration_ms` / `cost_usd` — set by the live `result` event); the last
 * message never acts as a boundary so a snapshot racing a just-finished
 * stream still reconciles against it. User messages are skipped but do NOT
 * stop the scan. Capped at the trailing 30 messages as a safety bound.
 */
function currentStreamWindow(messages: ReadonlyArray<ChatMessage>): StreamWindowEntry[] {
  let start = Math.max(0, messages.length - 30)
  for (let mi = messages.length - 2; mi >= start; mi--) {
    const msg = messages[mi]
    if (msg.role === 'assistant' && (msg.duration_ms != null || msg.cost_usd != null || msg.cost_basis != null)) {
      start = mi + 1
      break
    }
  }
  const entries: StreamWindowEntry[] = []
  for (let mi = start; mi < messages.length; mi++) {
    const msg = messages[mi]
    if (msg.role !== 'assistant') continue
    for (let bi = 0; bi < msg.blocks.length; bi++) {
      entries.push({ mi, bi, block: msg.blocks[bi] })
    }
  }
  return entries
}

/** True when any block in the current stream window matches the predicate. */
function streamWindowHas(
  window: ReadonlyArray<StreamWindowEntry>,
  predicate: (block: StreamWindowEntry['block']) => boolean,
): boolean {
  return window.some((entry) => predicate(entry.block))
}

/** The `refs` of a frame: the pairs only (never a label), or undefined when there is nothing to send or the server cannot take them. */
function refsForWire(enabled: boolean, refs: readonly EntityRef[] | undefined): EntityRef[] | undefined {
  return enabled && refs && refs.length > 0 ? refs.map(toEntityRef) : undefined
}

export interface SendMessageOptions {
  cwd: string
  projectSlug?: string
  workspaceSlug?: string
  permissionMode?: PermissionMode
  model?: string
}

/** Metadata about the active chat session (cwd, project, etc.) */
export interface SessionMeta {
  cwd: string
  projectSlug?: string
  workspaceSlug?: string
  /** Origin of this session if spawned (null = normal conversation) */
  spawnedBy?: import('@/types').SpawnedBy | null
}

export function useChat() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [isStreaming, setIsStreaming] = useAtom(chatStreamingAtom)
  const interruptWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [compactingSessionId, setCompactingSessionId] = useAtom(chatCompactingAtom)
  const [wsStatus, setWsStatus] = useAtom(chatWsStatusAtom)
  const [isReplaying, setIsReplaying] = useAtom(chatReplayingAtom)
  const _setPermissionOverride = useSetAtom(chatSessionPermissionOverrideAtom)
  const _setSessionModel = useSetAtom(chatSessionModelAtom)
  // Live Jotai store — lets callbacks read the CURRENT atom value at call time
  // instead of relying on `*Ref.current`, which only tracks writes made through
  // this hook's wrapper setters. ChatInput writes chatSessionModelAtom /
  // chatSessionPermissionOverrideAtom DIRECTLY (its own useAtom setter), so the
  // refs stay stale for new-conversation selections. See sendMessage below.
  const store = useStore()
  // Compaction belongs to ONE session: it shows only while that session is the one on screen.
  const isCompacting = compactingSessionId !== null && compactingSessionId === sessionId
  const setIsCompacting = useCallback(
    (on: boolean) => setCompactingSessionId(on ? store.get(chatSessionIdAtom) : null),
    [setCompactingSessionId, store],
  )
  /** Latest `syncLocalQueue`, for the WebSocket callbacks set up once. */
  const syncLocalQueueRef = useRef<() => void>(() => {})
  const setDraftsMap = useSetAtom(chatDraftsMapAtom)
  const moveDraft = useSetAtom(moveChatDraftAtom)
  const moveQueue = useSetAtom(moveChatQueueAtom)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // The messages as last rendered, for callbacks that must stay referentially
  // stable (they are props of memoised bubbles) yet need to look a block up.
  const messagesRef = useRef<ChatMessage[]>(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const wsRef = useRef<ChatWebSocket | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null)

  // Flag to distinguish first-message session creation from loadSession().
  // When true, the auto-connect useEffect will skip resetting messages
  // so the optimistic user message is preserved.
  const isFirstSendRef = useRef(false)

  // Pagination state for reverse infinite scroll
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasNewerMessages, setHasNewerMessages] = useState(false)
  const [isLoadingNewer, setIsLoadingNewer] = useState(false)
  const paginationRef = useRef({ offset: 0, tailOffset: 0, totalCount: 0 })

  // Target timestamp (Unix seconds) for scroll-to-message from search results.
  // Set by loadSession(sid, targetTimestamp), consumed by the auto-connect useEffect.
  // Used to find the right offset via binary search on the event timeline.
  const targetTimestampRef = useRef<number | null>(null)

  // Whether the loaded message window includes the tail (end) of the conversation.
  // When false (pagination centrée), live WS events are buffered to avoid disorder.
  const isAtTailRef = useRef(true)
  const pendingTailEventsRef = useRef<Array<ChatStreamEvent & { seq?: number; replaying?: boolean }>>([])
  // True when live WS events are being buffered (user is viewing centered pagination)
  const [hasLiveActivity, setHasLiveActivity] = useState(false)

  // Mid-stream join: buffer WS events while REST history is loading.
  // historyLoadedRef starts true (first-send path has no REST loading).
  // The auto-connect useEffect sets it to false before starting REST,
  // then back to true after setMessages(history) + replaying buffered events.
  const historyLoadedRef = useRef(true)
  const pendingEventsRef = useRef<Array<ChatStreamEvent & { seq?: number; replaying?: boolean }>>([])
  // The live `tool_timing`s of this turn, by call id: every one is held here (the
  // message updater that places it must stay pure, it cannot say whether it found
  // the call), and a `tool_use` that comes after its timing takes it. Read and
  // written in handleEvent, never in an updater. At the turn's end the ones whose
  // call is not on screen move to `unplacedTimingsRef`, the rest are dropped.
  const earlyTimingsRef = useRef(new EarlyToolTimings())
  // Timings whose call is on an OLDER page than the ones loaded (the call began
  // before the window, its timing is inside it): placed when `loadOlderMessages`
  // brings that page. Replaced with each window loaded from scratch.
  const unplacedTimingsRef = useRef(new EarlyToolTimings())
  // The calls (`tool_use` ids) seen live in this turn: on screen even before the
  // render catches up. Cleared at the turn's end and with each window loaded.
  const liveCallIdsRef = useRef(new Set<string>())
  // The server's clock (gap learnt from each live frame): what the browser stamps
  // itself is on it, like what the server stamps.
  const serverClockRef = useRef(new ServerClock())

  // ------------------------------------------------------------------------
  // Replay reconciliation — APPEND-ONLY, NEVER DESTRUCTIVE.
  //
  // The server re-sends the ENTIRE current stream on every connect while a
  // stream is active (Phase 1.5b snapshot: all structured events since stream
  // start with `replaying: true, seq: 0`, plus a cumulative `partial_text`).
  // This happens both on reconnects AND on fresh mid-stream joins, where the
  // REST history ALREADY contains the turn's persisted events. Blind-appending
  // duplicates the turn.
  //
  // An earlier attempt tracked "blocks of the current stream" and DELETED them
  // when a snapshot arrived, betting the snapshot would rebuild them. That bet
  // is unsafe: if the snapshot doesn't cover those blocks (turn whose `result`
  // never arrived, stream that ended between the reconnect trigger and the
  // handshake, a snapshot for a DIFFERENT turn), the content was erased for
  // good — responses vanishing from the UI.
  //
  // The rule now: replayed events may only be SKIPPED or GROWN, never removed.
  // See `reconcileReplayedText` and the id-based dedup in tool_use/tool_result.
  // ------------------------------------------------------------------------

  // Outbox for user messages that failed to send on a dead socket.
  // ChatWebSocket.send() now force-reconnects in that case; the queued text is
  // flushed in onReplayComplete, once the reconnected session is consistent.
  // Without this, the optimistic bubble showed but the message never left the
  // device — stuck typing indicator, response visible only on other devices.
  const pendingSendRef = useRef<{ text: string; attachments?: string[]; refs?: EntityRef[] }[]>([])
  /** Invalidates an in-flight REST resync (newer resync or session switch). */
  const resyncGenRef = useRef(0)

  // Lazily create the ChatWebSocket singleton per hook instance
  const getWs = useCallback(() => {
    if (!wsRef.current) {
      wsRef.current = new ChatWebSocket()
    }
    return wsRef.current
  }, [])

  // Refs for atom values to avoid stale closures in callbacks.
  // We use useSetAtom (no render subscription) to avoid "Cannot update ChatInput
  // while rendering ChatPanel" warning in React 19 — both components read
  // these atoms, and updating them during handleEvent caused cross-component
  // setState-during-render. Tracked setters keep refs in sync for callback access.
  const permissionOverrideRef = useRef<ToolPolicyMode | null>(null)
  const sessionModelRef = useRef<string | null>(null)

  // Tracked setters: update ref + atom atomically
  const setPermissionOverride = useCallback((value: ToolPolicyMode | null) => {
    permissionOverrideRef.current = value
    _setPermissionOverride(value)
  }, [_setPermissionOverride])

  // The permission mode of a NEW session, in the form its backend reads: the
  // legacy Claude string, unless the session opens on another provider (then
  // the neutral name). Nothing chosen → nothing sent, the server default applies.
  const wirePermissionMode = useCallback((mode: PermissionMode | null | undefined) => {
    if (!mode) return undefined
    return toWireMode(readToolPolicyMode(mode), { neutral: store.get(chatProviderTargetAtom).neutralWire })
  }, [store])

  // The mode a NEW session opens with. A `trust` (chosen, remembered, or the
  // server default) is not sent to a provider without a sandbox: the server
  // would refuse the opening (A35). It is downgraded to `ask`, and the
  // composer shows why (trustDowngradedText).
  const openingPermissionMode = useCallback(
    (explicit: PermissionMode | null | undefined): ToolPolicyMode | null => {
      const target = store.get(chatProviderTargetAtom)
      const chosen = explicit ?? store.get(chatSessionPermissionOverrideAtom)
      if (chosen) return usableMode(readToolPolicyMode(chosen), target)
      const serverDefault = store.get(chatPermissionConfigAtom)?.mode
      if (serverDefault && readToolPolicyMode(serverDefault) === 'trust' && !isTrustAllowed(target)) return TRUST_FALLBACK_MODE
      return null
    },
    [store],
  )

  const setSessionModel = useCallback((value: string | null) => {
    sessionModelRef.current = value
    _setSessionModel(value)
  }, [_setSessionModel])

  // Provider runtime of the session (provider, capabilities, tool policy).
  // Written from `system_init` — the LAST one wins: a resume may change the
  // capabilities after a provider update — and from the session record.
  const applySessionRuntime = useCallback((runtime: SystemInitRuntime | null) => {
    store.set(chatSessionProviderAtom, runtime?.provider ?? null)
    store.set(chatSessionCapabilitiesSnapshotAtom, runtime?.capabilities ?? null)
    store.set(chatSessionToolPolicyAtom, runtime?.toolPolicy ?? null)
    store.set(chatSessionEngineAtom, { engine: runtime?.engine ?? null, degraded: runtime?.degradedFeatures ?? [] })
  }, [store])

  // Auto-continue: atom is now synced from backend events (not local-only)
  const setAutoContinue = useSetAtom(chatAutoContinueAtom)
  /**
   * Background-tasks snapshot setter — fed by `active_tasks_update`
   * WS events. Plan 5985a7c4 (F2). The atom is also reset to `[]` on
   * session switch / disconnect so a new chat starts with an empty
   * toolbar pill until the next snapshot arrives (or F7's REST
   * snapshot hydration fills it earlier).
   */
  const setBackgroundTasks = useSetAtom(chatBackgroundTasksAtom)
  /** Pending vault requests of this session — see `chatSecretRequestsAtom`. */
  const setSecretRequests = useSetAtom(chatSecretRequestsAtom)

  // Debounce ref for sendContinue (prevents double-sends on manual Continue button)
  const continueDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ========================================================================
  // Event handler — processes LIVE events only (no more replay)
  // ========================================================================
  const handleEvent = useCallback((event: ChatStreamEvent & { seq?: number; replaying?: boolean }) => {
    // The messages the session holds until the running turn ends — always the
    // full list, published to EVERY device connected to the session, so a
    // message queued on one shows on the others. It replaces what we showed for
    // this conversation, except rows not handed over yet (`local`).
    //
    // Handled first and on its own: it is not part of the transcript, so it
    // neither waits for the history to load nor goes through the message
    // updater below (which must stay pure and would open an empty assistant
    // message for it).
    if (event.type === 'pending_queue') {
      const sid = store.get(chatSessionIdAtom)
      if (sid) {
        const all = store.get(chatMessageQueuesAtom)
        store.set(chatMessageQueuesAtom, withQueue(all, sid, mergeServerQueue(all[sid] ?? [], event.messages)))
      }
      return
    }

    // Mid-stream join: if REST history hasn't loaded yet, buffer most events
    // so they can be replayed AFTER setMessages(history). This prevents
    // setMessages([]) or setMessages(history) from wiping live events.
    // EXCEPTION: streaming_status and partial_text are processed immediately
    // because they provide the instant visual feedback the user expects
    // (seeing the live stream + interrupt button without waiting for REST).
    if (!historyLoadedRef.current && event.type !== 'streaming_status') {
      if (event.type === 'partial_text') {
        // Process NOW for instant visual feedback (user sees the live stream
        // without waiting for REST), but ALSO buffer a copy: the upcoming
        // setMessages(history) wipes the immediately-rendered block, and the
        // partial text (unflushed tail of the stream) is NOT in the persisted
        // history — without the buffered replay it would be lost until the
        // next structured event.
        pendingEventsRef.current.push(event)
      } else {
        pendingEventsRef.current.push(event)
        return
      }
    }

    // Not-at-tail buffering: when in centered pagination mode (user scrolled to
    // a search result), live WS events correspond to the conversation tail which
    // is NOT in the loaded window. Buffer them so they don't insert messages in
    // the wrong place. They'll be flushed when loadNewerMessages reaches the tail.
    // streaming_status is still processed for UI responsiveness (interrupt btn).
    if (!isAtTailRef.current && event.type !== 'streaming_status') {
      pendingTailEventsRef.current.push(event)
      setHasLiveActivity(true)
      return
    }

    // The server's time of this event (#662 envelope), when it carries one: a row
    // is then on the server's clock, like a timing and like the history. What has
    // none is stamped on the server's clock as the browser estimates it.
    const serverTime = serverTimeOf(event)
    // Read once, outside the updaters (they must stay pure).
    const eventTime = serverTime ?? serverClockRef.current.now().toISOString()

    // streaming_status — set isStreaming flag without touching messages
    // Broadcast by backend to ALL connected clients (multi-tab support)
    if (event.type === 'streaming_status') {
      const val = !!(event as { is_streaming?: boolean }).is_streaming
      setIsStreaming(val)
      return
    }

    // compaction_started — PreCompact hook fired, compaction is about to begin
    // Set isCompacting flag so the UI can show a spinner/banner
    if (event.type === 'compaction_started') {
      // A replayed start is history: its boundary may be missing from the window, so it would stick.
      if (!event.replaying) setIsCompacting(true)
      return
    }

    // permission_decision — stamp the decision onto the matching permission_request block
    if (event.type === 'permission_decision') {
      const data = event.replaying
        ? (event as { data?: Record<string, unknown> }).data ?? event
        : event
      const decisionId = (data as { id?: string }).id
      const allowed = (data as { allow?: boolean }).allow
      const lasting = (data as { scope?: string }).scope
      if (decisionId) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            blocks: msg.blocks.map((block) => {
              if (block.type === 'permission_request' && block.metadata?.tool_call_id === decisionId) {
                return { ...block, metadata: { ...block.metadata, decided: true, decision: allowed ? 'allowed' : 'denied', decision_scope: lasting } }
              }
              return block
            }),
          })),
        )
      }
      return
    }

    // The server says how it read the references of the user message above
    // (contract C5): it carries no id, so it is bound by its references to the
    // oldest user message still waiting for them (`bindResolvedRefs`) - never to
    // "the last user message", which may be a later one. No match: dropped.
    if (event.type === 'refs_resolved') {
      const raw = event.replaying
        ? ((event as { data?: { refs?: unknown } }).data?.refs ?? (event as { refs?: unknown }).refs)
        : (event as { refs?: unknown }).refs
      const resolved = parseResolvedRefs(raw)
      if (resolved.length === 0) return
      setMessages((current) => bindResolvedRefs(current, resolved).messages as ChatMessage[])
      // Speak only for a turn happening now, never for a replayed history.
      if (!event.replaying) store.set(refsAnnouncementAtom, resolutionAnnouncement(applyResolved(undefined, resolved)) ?? '')
      return
    }

    // user_message events from broadcast or replay — add as user message
    if (event.type === 'user_message') {
      // During replay, content is nested in event.data.content
      // During live broadcast, content is at event.content
      const rawContent = event.replaying
        ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content?: string }).content)
        : (event as { content: string }).content
      if (!rawContent) return
      // The attachment block is part of the stored text; the bubble shows the
      // text alone and the chips from the references.
      const { text: withoutAttachments, attachments: sentAttachments } = splitAttachments(rawContent)
      // Refs sit before the attachments block: peel the outer layer first.
      const { text: content, refs: sentRefs } = splitRefs(withoutAttachments, store.get(refsEnabledAtom))

      setMessages((current) => {
        // The answer to a synthetic question IS this user turn (history does
        // the same): the question above it stops being answerable.
        const prev = answerSyntheticQuestion(current, content)
        // "Continue" after max_turns: if a continue_indicator was already added
        // by sendContinue(), suppress the broadcast user_message to avoid a duplicate bubble.
        if (content === 'Continue') {
          // Check if the last assistant message has a continue_indicator or result_max_turns as its last block
          for (let i = prev.length - 1; i >= Math.max(0, prev.length - 5); i--) {
            const msg = prev[i]
            if (msg.role === 'assistant' && msg.blocks.length > 0) {
              const lastBlock = msg.blocks[msg.blocks.length - 1]
              if (lastBlock.type === 'continue_indicator' || lastBlock.type === 'result_max_turns') {
                return prev // suppress — already represented by the indicator
              }
              break
            }
          }
        }

        // The echo of a bubble already shown (`userEchoTarget`): the oldest bubble
        // of this browser waiting for an echo of this text (a mid-stream send is
        // followed by assistant messages before the broadcast of its dequeue), or
        // the bubble opening the turn in progress (a replay). Anything else is a
        // new message, even with the text of an older one (sent from another tab).
        const target = userEchoTarget(prev, content)
        if (target) {
          const i = target.index
          const msg = prev[i]
          // The optimistic bubble knows no filenames; the broadcast does.
          const needsAttachments = sentAttachments.length > 0 && !msg.attachments?.length
          // The optimistic bubble already knows the labels of its refs: keep them.
          const needsRefs = sentRefs.length > 0 && !msg.refs?.length
          // An echo, live or replayed (a reconnect snapshot may be the only one this
          // tab gets), is THE echo of a waiting bubble: the bubble stops waiting (a
          // later message with the same text gets its own bubble). It was stamped on
          // the browser's estimate of the server's clock (exact only once a frame
          // taught it the gap); a LIVE echo carries the server's own time: the turn
          // starts there. A replayed frame only says the server has the message.
          const echoed = target.awaiting
          const serverStamp = echoed && !event.replaying && serverTime ? new Date(serverTime) : undefined
          if (needsAttachments || needsRefs || echoed) {
            const next = [...prev]
            next[i] = {
              ...msg,
              ...(needsAttachments ? { attachments: sentAttachments } : {}),
              ...(needsRefs ? { refs: refsFromBlock(sentRefs) } : {}),
              ...(serverStamp ? { timestamp: serverStamp } : {}),
              ...(echoed ? { awaitingEcho: undefined } : {}),
            }
            return next
          }
          return prev
        }
        return [
          ...prev,
          {
            id: nextMessageId(),
            role: 'user',
            blocks: [{ id: nextBlockId(), type: 'text' as const, content }],
            ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
            ...(sentRefs.length > 0 ? { refs: refsFromBlock(sentRefs) } : {}),
            timestamp: new Date(eventTime),
          },
        ]
      })
      return
    }

    // The conversation moved to another provider while this tab shows the session it
    // LEFT: follow it to `to_session_id` (the server closes this one right after) instead
    // of going silently "disconnected". A replayed move is history: its block offers the
    // way to the continuation, nothing moves on its own.
    if (event.type === 'conversation_relayed' && !event.replaying) {
      const current = store.get(chatSessionIdAtom)
      if (current && event.from_session_id === current && event.to_session_id && event.to_session_id !== current) {
        // Moved from THIS tab (switch route in flight): the user knows, no notice.
        const fromHere = store.get(chatSwitchingSessionAtom) === current
        store.set(chatFollowRequestAtom, {
          sessionId: event.to_session_id,
          fromSessionId: current,
          notice: fromHere ? null : { fromProvider: event.from_provider, toProvider: event.to_provider, movedBy: event.moved_by },
        })
      }
    }
    // A closed session streams nothing more.
    if (event.type === 'session_closed' && !event.replaying) setIsStreaming(false)

    // Every timing is held here, placed or not: the updater below places it on its
    // call when the call is on screen, but must stay pure and cannot say whether it
    // did. A tool_use that comes after its timing takes it from here. At the turn's
    // end, a held timing whose call is not on screen (its tool_use is on an older
    // page) is kept for that page (`unplacedTimingsRef`), the others are dropped.
    // Done before the updater.
    let earlyTiming: Record<string, unknown> | undefined
    {
      const payload = (event.replaying ? (event as { data?: Record<string, unknown> }).data ?? event : event) as Record<string, unknown>
      if (event.type === 'tool_timing') earlyTimingsRef.current.hold(payload)
      else if (event.type === 'tool_use' && typeof payload.id === 'string') {
        // Its timing came first: live, or at the end of the window loaded from REST.
        earlyTiming = earlyTimingsRef.current.take(payload.id) ?? unplacedTimingsRef.current.take(payload.id)
        liveCallIdsRef.current.add(payload.id)
      } else if (event.type === 'result') {
        // A call seen in this turn is on screen even when the render has not caught
        // up yet (`messagesRef` lags behind a synchronous burst of frames).
        const shown = messagesRef.current
        const seen = liveCallIdsRef.current
        earlyTimingsRef.current.moveTo(unplacedTimingsRef.current, (id) => !seen.has(id) && !hasToolUse(shown, id))
        seen.clear()
      }
    }
    setMessages((prev) => {
      const updated = [...prev]
      let lastMsg = updated[updated.length - 1]
      // Track whether THIS event forced a fresh assistant boundary — if the
      // window-based reconciliation then skips the event as already
      // rendered, the empty boundary message is popped before returning.
      let createdBoundary = false
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: new Date(eventTime) }
        updated.push(lastMsg)
        createdBoundary = true
      } else {
        lastMsg = { ...lastMsg, blocks: [...lastMsg.blocks] }
        updated[updated.length - 1] = lastMsg
      }

      // Reconciliation window: the whole current stream, not just lastMsg.
      // See currentStreamWindow — a stream can span several messages.
      const streamWindow = currentStreamWindow(updated)

      /** Grow a half-streamed block anywhere in the window (immutably). */
      const replaceWindowBlock = (mi: number, bi: number, content: string) => {
        const msg = updated[mi]
        const blocks = [...msg.blocks]
        blocks[bi] = { ...blocks[bi], content }
        updated[mi] = { ...msg, blocks }
      }

      /** Drop the empty assistant message we just created, if it stayed empty. */
      const finalize = (result: typeof updated) => {
        if (createdBoundary) {
          const tail = result[result.length - 1]
          if (tail && tail.role === 'assistant' && tail.blocks.length === 0) {
            return result.slice(0, -1)
          }
        }
        return result
      }

      switch (event.type) {
        case 'stream_delta': {
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
          const deltaText = (event as { text: string }).text
          const deltaParent = getParentToolUseId(event)
          if (lastBlock && lastBlock.type === 'text' && lastBlock.metadata?.parent_tool_use_id === deltaParent) {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + deltaText,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content: deltaText,
              metadata: withParent(undefined, deltaParent),
            })
          }
          break
        }

        case 'assistant_text':
          // During replay, use assistant_text to reconstruct (no stream_delta in replay)
          if (event.replaying) {
            const content = (event as { content: string }).content
            // For replay: check if data field contains the content (backend wraps in data)
            const data = (event as { data?: { content?: string } }).data
            const text = data?.content ?? content ?? ''
            if (text) {
              const atParent = getParentToolUseId(event)
              // Append-only reconciliation against the whole current stream
              // (live deltas and/or REST history on a mid-stream join).
              const r = reconcileReplayedText(streamWindow, 'text', text, atParent)
              if (r.action === 'skip') break
              if (r.action === 'replace') {
                replaceWindowBlock(r.mi, r.bi, text)
              } else {
                lastMsg.blocks.push({
                  id: nextBlockId(),
                  type: 'text',
                  content: text,
                  metadata: withParent(undefined, atParent),
                })
              }
            }
          }
          // During live: ignore (content already received via stream_delta)
          break

        case 'thinking': {
          const content = event.replaying
            ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content: string }).content)
            : (event as { content: string }).content
          const thinkParent = getParentToolUseId(event)
          // Replayed thinking: reconcile append-only against what's rendered.
          if (event.replaying && content) {
            const r = reconcileReplayedText(streamWindow, 'thinking', content, thinkParent)
            if (r.action === 'skip') break
            if (r.action === 'replace') {
              replaceWindowBlock(r.mi, r.bi, content)
              break
            }
          }
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
          if (!event.replaying && lastBlock && lastBlock.type === 'thinking' && lastBlock.metadata?.parent_tool_use_id === thinkParent) {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + content,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'thinking',
              content: content,
              metadata: withParent(undefined, thinkParent),
            })
          }
          break
        }

        case 'tool_use': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const toolName = (data as { tool?: string }).tool ?? ''
          const toolId = (data as { id?: string }).id ?? ''
          const toolInput = (data as { input?: Record<string, unknown> }).input ?? {}
          const tuParent = getParentToolUseId(event)
          const tuTs = eventTime

          // Mid-stream join dedup: the WS snapshot replays the current stream
          // from its START, but the REST history already contains the events
          // persisted so far — the same tool_use would be appended twice.
          // tool_call_id is unique → skip if the block already exists.
          if (
            event.replaying &&
            toolId &&
            streamWindowHas(streamWindow, (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === toolId)
          ) {
            break
          }

          if (isQuestionToolUse(data)) {
            const questions = (toolInput as { questions?: unknown[] })?.questions
            if (questions && questions.length > 0) {
              // Dedup: skip if an ask_user_question block with same tool_call_id already exists
              // (created via the control channel ask_user_question event)
              const isDupe = toolId && streamWindowHas(
                streamWindow,
                (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolId,
              )
              // A question call is timed like any call: its timing (come first) goes on this block.
              if (!isDupe) {
                lastMsg.blocks.push({
                  id: nextBlockId(),
                  type: 'ask_user_question',
                  content: (questions as { question: string }[]).map((q) => q.question).join('\n'),
                  metadata: withCreatedAt(withParent({
                    tool_call_id: toolId,
                    questions,
                    ...(earlyTiming ? { tool_timing: earlyTiming } : {}),
                  }, tuParent), tuTs),
                })
              } else if (earlyTiming) {
                attachToolTiming(updated, { ...earlyTiming, id: toolId })
              }
            }
          } else {
            // F10 — if orphan ticks for this tool_use_id already landed
            // in a `background_activity` block (they beat their parent
            // to the message list), move them under the freshly-created
            // tool_use block and remove the orphan block so the activity
            // is shown once, nested where it belongs.
            let initialChildOutputs: BackgroundOutputEntry[] = []
            let initialChildData: Record<string, unknown> | undefined
            for (let mi = updated.length - 1; mi >= 0 && initialChildOutputs.length === 0; mi--) {
              const msg = updated[mi]
              const bi = msg.blocks.findIndex(
                (b) =>
                  b.type === 'background_activity' &&
                  (b.metadata as unknown as BackgroundActivityMetadata | undefined)?.correlation_id === toolId,
              )
              if (bi === -1) continue
              const meta = msg.blocks[bi].metadata as unknown as BackgroundActivityMetadata
              initialChildOutputs = meta.entries
              initialChildData = meta.data
              const blocks = msg.blocks.filter((_, i) => i !== bi)
              if (msg === lastMsg) {
                lastMsg.blocks = blocks
              } else {
                updated[mi] = { ...msg, blocks }
              }
            }

            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'tool_use',
              content: toolName,
              metadata: withCreatedAt(
                withParent(
                  {
                    tool_call_id: toolId,
                    tool_name: toolName,
                    tool_input: toolInput,
                    ...toolHintMetadata(data),
                    ...(initialChildOutputs.length > 0
                      ? { child_outputs: initialChildOutputs }
                      : {}),
                    ...(initialChildData ? { child_data: initialChildData } : {}),
                    ...(earlyTiming ? { tool_timing: earlyTiming } : {}),
                  },
                  tuParent,
                ),
                tuTs,
              ),
            })
          }
          break
        }

        case 'tool_use_input_resolved': {
          // Update an existing tool_use block's input with the full params
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const resolvedId = (data as { id?: string }).id
          const resolvedInput = (data as { input?: Record<string, unknown> }).input ?? {}

          // Search backwards through ALL messages for the matching tool_use block
          for (let mi = updated.length - 1; mi >= 0; mi--) {
            const msg = updated[mi]
            for (let bi = 0; bi < msg.blocks.length; bi++) {
              const block = msg.blocks[bi]
              if (
                block.type === 'tool_use' &&
                block.metadata?.tool_call_id === resolvedId
              ) {
                // Clone the message and block to trigger React re-render
                const updatedMsg = { ...msg, blocks: [...msg.blocks] }
                updatedMsg.blocks[bi] = {
                  ...block,
                  metadata: { ...block.metadata, tool_input: resolvedInput },
                }
                updated[mi] = updatedMsg
              }
            }
          }
          break
        }

        case 'tool_result': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const resultVal = (data as { result?: unknown }).result
          const resultStr = typeof resultVal === 'string' ? resultVal : JSON.stringify(resultVal)
          const toolCallId = (data as { id?: string }).id
          const trParent = getParentToolUseId(event)

          // Mid-stream join dedup (see tool_use case): skip if this result
          // was already loaded via REST history.
          if (
            event.replaying &&
            toolCallId &&
            streamWindowHas(streamWindow, (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === toolCallId)
          ) {
            break
          }
          // Calculate tool duration from matching tool_use block
          let trDurationMs: number | undefined
          if (toolCallId) {
            const now = Date.parse(eventTime)
            for (let mi = updated.length - 1; mi >= 0; mi--) {
              const tuBlock = updated[mi].blocks.find(
                (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === toolCallId && b.metadata?.created_at,
              )
              if (tuBlock) {
                const tuTime = new Date(tuBlock.metadata!.created_at as string).getTime()
                if (now > tuTime) trDurationMs = now - tuTime
                break
              }
            }
          }
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_result',
            content: resultStr,
            metadata: withParent({
              tool_call_id: toolCallId,
              is_error: (data as { is_error?: boolean }).is_error,
              ...(trDurationMs != null && { duration_ms: trDurationMs }),
            }, trParent),
          })
          break
        }

        case 'tool_timing': {
          // Not a message: the timing of a call already shown, put on its tool_use block
          // (one not shown yet takes it from `earlyTimingsRef` when it comes).
          const ttData = (event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event) as Record<string, unknown>
          // (an empty boundary message opened for this event is dropped by `finalize`)
          attachToolTiming(updated, ttData)
          break
        }

        case 'tool_cancelled': {
          const tcData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const tcId = (tcData as { id?: string }).id
          const tcParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_result',
            content: tr('app.chat.cancelledByUser'),
            metadata: withParent({ tool_call_id: tcId, is_cancelled: true }, tcParent),
          })
          break
        }

        case 'permission_request': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          // Replay dedup (previously missing): every reconnect during a
          // pending permission re-sends the request via the snapshot —
          // without this check the permission block stacked up each time.
          const prId = (data as { id?: string }).id
          if (
            event.replaying &&
            prId &&
            streamWindowHas(streamWindow, (b) => b.type === 'permission_request' && b.metadata?.tool_call_id === prId)
          ) {
            break
          }
          const prParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: `Tool "${(data as { tool?: string }).tool}" wants to execute`,
            // Its own time: without it the trace would date the wait from the message's start.
            metadata: withCreatedAt(withParent({
              tool_call_id: (data as { id?: string }).id,
              tool_name: (data as { tool?: string }).tool,
              tool_input: (data as { input?: Record<string, unknown> }).input,
              ...toolHintMetadata(data),
              ...permissionCallOf(data),
            }, prParent), eventTime),
          })
          break
        }

        case 'viz_block': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const vizParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'viz',
            content: (data as { fallback_text?: string }).fallback_text ?? '',
            metadata: withParent({
              viz_type: (data as { viz_type?: string }).viz_type,
              viz_data: (data as { data?: Record<string, unknown> }).data,
              viz_title: (data as { title?: string }).title,
              viz_interactive: (data as { interactive?: boolean }).interactive ?? false,
              viz_max_height: (data as { max_height?: number }).max_height ?? 300,
            }, vizParent),
          })
          break
        }

        case 'ask_user_question': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const questions = (data as { questions?: { question: string }[] }).questions
          const toolCallId = (data as { tool_call_id?: string }).tool_call_id ?? ''
          const auqParent = getParentToolUseId(event)
          if (questions && questions.length > 0) {
            // Dedup: skip if a block with the same tool_call_id already exists
            // (created via the tool_use stream path)
            const isDupe = toolCallId && lastMsg.blocks.some(
              (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolCallId,
            )
            if (!isDupe) {
              lastMsg.blocks.push({
                id: nextBlockId(),
                type: 'ask_user_question',
                content: questions.map((q) => q.question).join('\n'),
                // Its server time when the frame has one (as the history does).
                metadata: withCreatedAt(withParent(questionMetadata(data, toolCallId, questions), auqParent), serverTime),
              })
            }
          }
          break
        }

        case 'error': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const errParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'error',
            content: (data as { message?: string }).message ?? tr('app.chat.unknownError'),
            metadata: withParent(undefined, errParent),
          })
          if (!event.replaying) {
            setIsStreaming(false)
          }
          break
        }

        case 'session_error': {
          // The CLI subprocess died: show it, and stop the typing indicator.
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'error',
            content: sessionErrorText(data as { reason?: string; message?: string }),
            // A typed failure keeps its `code`: the transcript renders its card.
            metadata: withParent(
              (() => {
                const typed = sessionErrorMetadata(data)
                return typed.code ? typed : undefined
              })(),
              getParentToolUseId(event),
            ),
          })
          if (!event.replaying) {
            setIsStreaming(false)
            setIsCompacting(false)
          }
          break
        }

        case 'partial_text': {
          // Mid-stream join: bulk text accumulated before this client connected
          const content = event.replaying
            ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content: string }).content)
            : (event as { content: string }).content
          const ptParent = getParentToolUseId(event)
          // partial_text is the cumulative unflushed tail of the stream. It is
          // processed immediately on arrival AND buffered for replay after the
          // REST history lands (the immediate render gets wiped by
          // setMessages(history)), so it can legitimately arrive twice — and
          // successive snapshots deliver growing supersets of it. Reconcile
          // append-only: skip when covered, grow when it extends what we show.
          if (content) {
            const r = reconcileReplayedText(streamWindow, 'text', content, ptParent)
            if (r.action === 'skip') break
            if (r.action === 'replace') {
              replaceWindowBlock(r.mi, r.bi, content)
              break
            }
          }
          if (content) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content,
              metadata: withParent(undefined, ptParent),
            })
          }
          break
        }

        case 'permission_mode_changed': {
          // Server confirmed the mode change — update local atom
          // The mode arrives as a legacy Claude string or a neutral one, and a
          // provider-aware backend adds `tool_policy` (with the exact native
          // mode). Either way the interface keeps the neutral mode.
          const changed = event as { mode?: string; tool_policy?: unknown; policy_mode?: unknown }
          const policy = toToolPolicy(changed.tool_policy) ?? toToolPolicy(changed.policy_mode) ?? toToolPolicy(changed.mode)
          if (changed.mode || policy) {
            setPermissionOverride(policy?.mode ?? readToolPolicyMode(changed.mode))
          }
          if (policy) {
            // Keep the session policy in step (its native mode is what a Claude
            // session shows). A bare mode string says nothing about the rules:
            // the ones already known stay.
            const previous = store.get(chatSessionToolPolicyAtom)
            const carriesRules = typeof changed.tool_policy === 'object' && changed.tool_policy !== null
            store.set(chatSessionToolPolicyAtom, carriesRules || !previous
              ? policy
              : { ...policy, allow: previous.allow, deny: previous.deny })
          }
          break
        }

        case 'auto_continue_state_changed': {
          // Backend confirmed the auto-continue toggle — sync local atom
          const acData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const enabled = (acData as { enabled?: boolean }).enabled
          if (enabled !== undefined) {
            setAutoContinue(enabled)
          }
          break
        }

        case 'auto_continue': {
          // Backend is auto-continuing after max_turns — show indicator on last assistant message
          const acEvtData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const delayMs = (acEvtData as { delay_ms?: number }).delay_ms ?? 500
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'continue_indicator',
            content: tr('app.chat.autoContinuing'),
            metadata: { delay_ms: delayMs, auto: true },
          })
          if (!event.replaying) {
            setIsStreaming(true) // backend will send a new stream shortly
          }
          break
        }

        case 'retrying': {
          // Backend is retrying after a retryable API error (500/529)
          const retryData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const attempt = (retryData as { attempt?: number }).attempt
          const maxAttempts = (retryData as { max_attempts?: number }).max_attempts
          const errorMsg = (retryData as { error_message?: string }).error_message
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'retry_indicator',
            content: maxAttempts
              ? `Retrying... (${attempt}/${maxAttempts})`
              : `Retrying... (attempt ${attempt})`,
            metadata: { attempt, max_attempts: maxAttempts, error_message: errorMsg },
          })
          if (!event.replaying) {
            setIsStreaming(true) // backend will retry shortly
          }
          break
        }

        case 'conversation_relayed':
        case 'session_closed':
        case 'compaction_recovery': {
          // Same block as the history reducer (chatAssembly.sessionEventBlock).
          const payload = event.replaying ? (event as { data?: Record<string, unknown> }).data ?? event : event
          const block = sessionEventBlock({ ...payload, type: event.type })
          if (block) lastMsg.blocks.push({ id: nextBlockId(), ...block })
          break
        }

        case 'tools_cancelled': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'error',
            content: toolsCancelledText(data as { killed_count?: number; requested_by?: string }),
            metadata: withParent(undefined, getParentToolUseId(event)),
          })
          break
        }

        case 'model_changed': {
          const mcData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const newModel = (mcData as { model?: string }).model ?? 'unknown'
          // Additive: set when PO changed the model on its own. Tolerate absence.
          const rawReason = (mcData as { reason?: unknown }).reason
          const newReason = typeof rawReason === 'string' && rawReason ? rawReason : undefined
          // Update the session model atom (server confirmed the change)
          setSessionModel(newModel)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'model_changed',
            content: `Model changed to ${newModel}`,
            metadata: newReason ? { model: newModel, reason: newReason } : { model: newModel },
          })
          break
        }

        case 'compact_boundary': {
          setIsCompacting(false)
          const cbData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const trigger = (cbData as { trigger?: string }).trigger ?? 'auto'
          const preTokens = (cbData as { pre_tokens?: number }).pre_tokens
          const label = preTokens
            ? `Context compacted (${trigger}, ~${Math.round(preTokens / 1000)}K tokens)`
            : `Context compacted (${trigger})`
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'compact_boundary',
            content: label,
            metadata: { trigger, pre_tokens: preTokens },
          })
          break
        }

        case 'system_init': {
          const siData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const siModel = (siData as { model?: string }).model
          const siTools = (siData as { tools?: string[] }).tools
          const siMcpServers = (siData as { mcp_servers?: { name: string }[] }).mcp_servers
          const siPermMode = (siData as { permission_mode?: string }).permission_mode
          // Set the initial model from system_init
          if (siModel) {
            setSessionModel(siModel)
          }
          // Provider, capabilities and policy: read on EVERY system_init (the
          // block below is deduped, this state is not). No provider on the
          // event = a pre-provider session = Claude Code, full profile.
          applySessionRuntime(readSystemInitRuntime(siData))
          // Dedup: only show the first system_init per conversation
          const alreadyHasSystemInit = updated.some((m) =>
            m.blocks.some((b) => b.type === 'system_init'),
          )
          if (!alreadyHasSystemInit) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'system_init',
              content: tr('app.chat.sessionInitialized'),
              metadata: {
                model: siModel,
                tools_count: siTools?.length ?? 0,
                mcp_servers_count: siMcpServers?.length ?? 0,
                permission_mode: siPermMode,
                ...systemInitToolMetadata(siData),
                ...systemInitProviderMetadata(siData),
              },
            })
          }
          break
        }

        case 'result': {
          const rData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const rSubtype = (rData as { subtype?: string }).subtype ?? 'success'
          const rNumTurns = (rData as { num_turns?: number }).num_turns
          const rResultText = (rData as { result_text?: string }).result_text

          // Store turn metrics on the assistant message
          const rDuration = (rData as { duration_ms?: number }).duration_ms
          if (rDuration != null) lastMsg.duration_ms = rDuration
          // Figure, basis and usage — same helper as the history reducer.
          applyResultCost(lastMsg, rData)

          if (rSubtype === 'error_max_turns') {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'result_max_turns',
              content: rNumTurns
                ? tr('app.chat.maxTurnsCount', { n: rNumTurns })
                : tr('app.chat.maxTurns'),
              metadata: { num_turns: rNumTurns },
            })
          } else if (rSubtype === 'error_during_execution') {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'result_error',
              content: rResultText ?? tr('app.chat.executionError'),
              metadata: { result_text: rResultText },
            })
          }

          // Only stop streaming on LIVE result events, not replayed ones.
          // During replay (Phase 1 or Phase 1.5), a historical result event
          // must not override the streaming_status sent for mid-stream join.
          if (!event.replaying) {
            setIsStreaming(false)
            setIsCompacting(false) // safety net: reset compaction flag on result
            // Auto-continue is now handled by the backend — no local setTimeout needed
          }
          break
        }

        case 'system_hint': {
          // System-generated hints are internal — never rendered in the UI.
          break
        }

        case 'active_tasks_update': {
          // Plan 5985a7c4 (F2): full snapshot of background subprocesses
          // currently tracked for this session. Backend always sends the
          // full list (never deltas) — we replace the atom value
          // wholesale. Empty array is legitimate (no tracked tasks) and
          // is exactly what the toolbar pill consumes to render nothing.
          setBackgroundTasks(event.tasks)
          break
        }

        case 'secret_request': {
          // The agent asked for a secret: show the secure input tray. Same id
          // twice (agent retried) → one card.
          const req = { id: event.id, name: event.name, reason: event.reason, exists: event.exists }
          setSecretRequests((current) =>
            current.some((r) => r.id === req.id) ? current : [...current, req],
          )
          break
        }

        case 'secret_request_resolved': {
          setSecretRequests((current) => current.filter((r) => r.id !== event.id))
          break
        }

        case 'background_output':
        case 'workflow': {
          // Plan 5985a7c4 (F6 live + F10 orphan tolerance) — live mirror
          // of chatAssembly: attach a tick to its parent tool_use block
          // by `correlation_id ↔ tool_call_id` so MonitorCard /
          // ToolCallBlock renders it under the right card. When no
          // parent block exists in the message list (typically after a
          // backend lazy-recovery, where the tool_use pre-dates the
          // restart), the tick is never dropped: it folds into a grouped
          // `background_activity` block on the current assistant message
          // — one block per correlation_id. Should the parent tool_use
          // arrive afterwards, the tool_use case drains that block.
          const tick: BackgroundTick = event.type === 'workflow'
            ? workflowEventToTick(event, eventTime)
            : {
                correlation_id: event.correlation_id,
                source: event.source,
                content: event.content,
                received_at: event.received_at,
              }
          if (!attachToParentToolUse(updated, tick)) {
            appendBackgroundActivity(lastMsg, tick)
          }
          break
        }

        default:
          // Unknown event type — ignore gracefully
          break
      }

      return finalize(updated)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tracked setters are stable (useCallback with stable deps)
  }, [setIsStreaming, setPermissionOverride, setSessionModel, setAutoContinue, setIsCompacting, setBackgroundTasks, setSecretRequests, applySessionRuntime])

  // ========================================================================
  // REST resync — after a reconnect that the server cannot replay
  // ========================================================================
  /**
   * Rebuild the conversation tail from REST.
   *
   * The server only replays persisted events to a client that sends a real
   * `last_event`. This hook connects with Number.MAX_SAFE_INTEGER ("history
   * comes from REST") and live events carry `seq: 0`, so the socket's
   * lastEventSeq never became real: EVERY reconnect — tab back from the
   * background, zombie socket, network switch, events_lagged — asked the
   * server to replay nothing, and whatever happened while the socket was down
   * never reached the screen. The only way out was switching conversations,
   * which reloads from REST. This performs that reload automatically, driven
   * by ChatWebSocket's `onResync` — also on the first connection of a
   * brand-new session, whose stream starts server-side before the socket
   * subscribes.
   *
   * Same mechanics as opening a conversation: live events are buffered
   * (historyLoadedRef = false) until the history is in place, then replayed
   * through handleEvent, whose snapshot-vs-history dedup already covers them.
   * Unlike opening, the current messages stay on screen while REST loads.
   */
  const resyncFromRest = useCallback((sid: string) => {
    // Browsing an older window (search result): the tail is not on screen,
    // live events are parked in pendingTailEventsRef, and loadNewerMessages
    // reloads the tail from REST when the user scrolls back to it.
    if (!isAtTailRef.current) return
    // A history load is already running (conversation opening, or a resync
    // for a previous reconnect) and will bring the tail itself.
    if (!historyLoadedRef.current) return

    const gen = ++resyncGenRef.current
    historyLoadedRef.current = false
    pendingEventsRef.current = []

    chatApi
      .getMessages(sid, { limit: 1, offset: 0 })
      .then(async (meta) => {
        const total = meta.total_count
        const win: LoadedWindow =
          total === 0
            ? { messages: [], unplacedTimings: new EarlyToolTimings(), rawCount: 0, offset: 0, totalCount: 0, runtime: null }
            : await fetchRenderableTail(sid, total, store.get(refsEnabledAtom))
        if (gen !== resyncGenRef.current) return
        if (win.runtime) applySessionRuntime(win.runtime)

        setMessages(win.messages)
        // The tail is rebuilt: what was held for the old one goes with it (the
        // live events since then are buffered and replayed below).
        earlyTimingsRef.current.clear()
        liveCallIdsRef.current.clear()
        unplacedTimingsRef.current = win.unplacedTimings
        paginationRef.current = {
          offset: win.offset,
          tailOffset: win.offset + win.rawCount,
          totalCount: win.totalCount,
        }
        setHasOlderMessages(win.offset > 0)
        setHasNewerMessages(false)
        isAtTailRef.current = true

        // A finished turn at the end of the persisted history means nothing
        // is streaming: clears an optimistic typing indicator whose `result`
        // was missed. A stream that starts later announces itself with a
        // live streaming_status.
        if (win.lastEvent?.type === 'result') setIsStreaming(false)
      })
      .catch(() => {
        // Keep what is on screen; the next reconnect retries.
      })
      .finally(() => {
        if (gen !== resyncGenRef.current) return
        historyLoadedRef.current = true
        const pending = pendingEventsRef.current
        pendingEventsRef.current = []
        for (const evt of pending) {
          handleEvent(evt)
        }
      })
  }, [handleEvent, setIsStreaming, applySessionRuntime])

  // ========================================================================
  // Setup WS callbacks
  // ========================================================================
  useEffect(() => {
    const ws = getWs()
    ws.setCallbacks({
      // The gap to the server's clock is learnt when a frame COMES, not when a
      // buffered one is handled later.
      onEvent: (event) => {
        serverClockRef.current.observe(event)
        handleEvent(event)
      },
      onStatusChange: (status) => {
        setWsStatus(status)
        // The socket's announcement dies with it: back to what the REST probe knows (or unknown).
        if (status === 'disconnected') store.set(chatServerFeaturesAtom, cachedRefsCapability(refsScopeRef.current))
        // When the server disconnects mid-stream, isStreaming stays true with
        // no Result event to clear it. Reset on reconnecting — the server will
        // send a fresh streaming_status via the Phase 1.5b snapshot if a stream
        // is actually active after reconnection.
        if (status === 'reconnecting') {
          setIsStreaming(false)
          setIsCompacting(false)
        }
      },
      onFeatures: (features) => store.set(chatServerFeaturesAtom, features),
      onResync: () => {
        const sid = ws.sessionId
        if (sid) resyncFromRest(sid)
      },
      onReplayComplete: () => {
        setIsReplaying(false)
        setIsLoadingHistory(false)
        // The socket is usable again: hand over what was queued without it...
        syncLocalQueueRef.current()
        // ...and learn what the session already holds. A reload starts with an empty
        // page; without this the messages queued before it stay invisible.
        ws.sendQueueSnapshot()
        // Flush messages that failed on a dead socket (their failure triggered
        // this very reconnect). The replay just brought us up to date, so
        // sending now preserves ordering.
        if (pendingSendRef.current.length > 0) {
          const pending = pendingSendRef.current
          pendingSendRef.current = []
          for (const entry of pending) {
            const flushRefs = refsForWire(store.get(refsEnabledAtom), entry.refs)
            if (flushRefs ? ws.sendUserMessage(entry.text, entry.attachments, { refs: flushRefs }) : ws.sendUserMessage(entry.text, entry.attachments)) {
              setIsStreaming(true)
            } else {
              // Still dead — requeue; the next replay-complete retries.
              pendingSendRef.current.push(entry)
            }
          }
        }
      },
    })
  }, [getWs, handleEvent, resyncFromRest, setWsStatus, setIsReplaying, setIsStreaming, setIsCompacting, store])

  // ========================================================================
  // References capability before the first socket (see refs/refsCapability.ts)
  // ========================================================================
  // A new conversation has no socket until its first message: the REST probe
  // tells whether `#` may be offered. The socket's own `auth_ok` stays the
  // authority and overwrites it. Reset to unknown on a change of account or server.
  const currentUserId = useAtomValue(currentUserAtom)?.id
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const refsScope = refsCapabilityScope(getApiBase(), currentUserId)
  const refsScopeRef = useRef(refsScope)
  useRefKindsSync(refsScope)
  useEffect(() => {
    if (refsScopeRef.current !== refsScope) {
      refsScopeRef.current = refsScope
      // Another account or server: nothing learned about the previous one applies.
      store.set(chatServerFeaturesAtom, null)
      clearRefSearchCache()
    }
    if (!authenticated) return
    let current = true
    void ensureRefsCapability(refsScope).then((answer) => {
      // Never over the socket's announcement, never for a scope we left.
      if (current && answer && store.get(chatServerFeaturesAtom) === null) store.set(chatServerFeaturesAtom, answer)
    })
    return () => {
      current = false
    }
  }, [refsScope, authenticated, store])

  // The flag may arrive after the history: decode the stored blocks then.
  const refsOn = useAtomValue(refsEnabledAtom)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the flag is external state that arrives late
    if (refsOn) setMessages((prev) => decodeStoredRefs(prev))
  }, [refsOn])

  // A sentence about the previous conversation must not be spoken in the next one.
  useEffect(() => {
    store.set(refsAnnouncementAtom, '')
  }, [sessionId, store])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.disconnect()
    }
  }, [])

  // ========================================================================
  // Auto-connect when sessionId changes — REST history + WS live
  // ========================================================================
  useEffect(() => {
    if (!sessionId) return

    const ws = getWs()
    resyncGenRef.current++

    // First-send path: the user just sent the first message of a new conversation.
    // The optimistic user message is already in `messages` — do NOT reset it.
    // Just connect the WS for live events and bail out.
    if (isFirstSendRef.current) {
      isFirstSendRef.current = false
      paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
      setHasOlderMessages(false)
      // The server started streaming when the session was created, before
      // this socket subscribes: resync from REST once it is authenticated.
      ws.connect(sessionId, Number.MAX_SAFE_INTEGER, { resync: true })
      return
    }

    // Only load if not already connected to this session
    if (ws.sessionId === sessionId && ws.status !== 'disconnected') return

    let cancelled = false

    setIsLoadingHistory(true)
    setIsReplaying(true)
    setMessages([])
    // Plan 5985a7c4 (F2): clear the toolbar pill on session switch /
    // reconnect — F7 will refill from the REST snapshot, otherwise
    // the next active_tasks_update will repopulate it.
    setBackgroundTasks([])
    setSecretRequests([])
    paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
    setHasOlderMessages(false)

    // Prepare the event buffer: WS events arriving while REST is loading
    // will be queued in pendingEventsRef and replayed after setMessages().
    historyLoadedRef.current = false
    pendingEventsRef.current = []
    earlyTimingsRef.current.clear()
    liveCallIdsRef.current.clear()
    unplacedTimingsRef.current = new EarlyToolTimings()

    // Phase 1: Connect WS IMMEDIATELY for live streaming (parallel with REST).
    // This eliminates the latency of the old sequential approach where
    // the WS only connected after 2 REST calls.
    // The WS delivers the mid-stream snapshot (partial_text, streaming_events,
    // streaming_status) instantly — the user sees the live stream right away.
    ws.connect(sessionId, Number.MAX_SAFE_INTEGER)

    // Plan 5985a7c4 (F7): hydrate the toolbar pill from the REST
    // snapshot in parallel with the WS connect, so a fresh chat session
    // doesn't show a blank toolbar while waiting for the next live
    // `active_tasks_update` (Monitors with sparse output may emit only
    // every few minutes — without this fetch the user could think
    // their session forgot the running task on every page refresh).
    //
    // Race with WS: if a live `active_tasks_update` arrives before the
    // REST resolves, that one wins and we'd overwrite it here. To
    // avoid the flicker, we only apply the REST snapshot when the
    // atom is still empty (the WS hasn't said anything yet). Subsequent
    // WS updates are authoritative.
    chatApi
      .getBackgroundTasks(sessionId)
      .then((response) => {
        if (cancelled) return
        // Use atomic-read: only apply if no live update has populated
        // the atom yet. Reading via Jotai's getter would require a
        // store handle — instead we rely on `setBackgroundTasks` being
        // an updater that can inspect the current value.
        setBackgroundTasks((current) =>
          current.length === 0 ? response.tasks : current,
        )
      })
      .catch((err) => {
        // Snapshot is best-effort. The WS event flow remains the
        // source of truth — if hydration fails, the toolbar stays
        // empty until the next live update.
        // eslint-disable-next-line no-console
        console.warn('[useChat] background-tasks snapshot fetch failed', err)
      })

    // Capture and clear targetTimestamp so it's only used once
    const targetTimestamp = targetTimestampRef.current
    targetTimestampRef.current = null

    // Phase 2: Load history via REST in parallel.
    // The API uses chronological pagination (offset 0 = oldest), so we first
    // need to figure out the right offset to get the last page of messages.
    // We do a small initial request to get total_count, then load the tail.
    chatApi
      .getMessages(sessionId, { limit: 1, offset: 0 })
      .then((meta) => {
        if (cancelled) return
        const total = meta.total_count
        if (total === 0) {
          paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
          setHasOlderMessages(false)
          setHasNewerMessages(false)
          isAtTailRef.current = true
          setIsLoadingHistory(false)
          setIsReplaying(false)
          // Flush buffered events (none expected, but be safe)
          historyLoadedRef.current = true
          const pending = pendingEventsRef.current
          pendingEventsRef.current = []
          for (const evt of pending) {
            handleEvent(evt)
          }
          return
        }

        // Decide loading strategy: centered around target timestamp vs tail
        let loadOffsetPromise: Promise<{ loadOffset: number; isCentered: boolean }>

        if (targetTimestamp !== null) {
          // Binary search: find the event offset closest to the target timestamp.
          // Events are stored chronologically, so we can binary search by created_at.
          loadOffsetPromise = (async () => {
            let lo = 0
            let hi = total - 1
            let bestOffset = 0

            // Binary search: ~10 iterations for 1M events (log2(1M) ≈ 20)
            while (lo <= hi) {
              const mid = Math.floor((lo + hi) / 2)
              const probe = await chatApi.getMessages(sessionId, { limit: 1, offset: mid })
              if (cancelled || !probe.messages[0]) break
              const rawTs = probe.messages[0].created_at
              const probeTs = typeof rawTs === 'number' ? rawTs : Math.floor(new Date(rawTs as string).getTime() / 1000)
              if (probeTs <= targetTimestamp) {
                bestOffset = mid
                lo = mid + 1
              } else {
                hi = mid - 1
              }
            }

            // Load a window biased BEFORE the target to include the full turn/message.
            // A single assistant turn can span 30+ events (tool_use/tool_result chains),
            // so the snippet from Meilisearch may come from an event well before bestOffset.
            // Use 80% of PAGE_SIZE before the target, 20% after.
            let loadOffset = Math.max(0, bestOffset - Math.floor(PAGE_SIZE * 0.8))
            let isCentered = true
            if (loadOffset + PAGE_SIZE >= total) {
              loadOffset = Math.max(0, total - PAGE_SIZE)
              isCentered = false // effectively tail loading
            }
            return { loadOffset, isCentered }
          })()
        } else {
          // Normal tail loading
          loadOffsetPromise = Promise.resolve({
            loadOffset: Math.max(0, total - PAGE_SIZE),
            isCentered: false,
          })
        }

        return loadOffsetPromise.then(async ({ loadOffset, isCentered }) => {
            // A centered window (jumped to a search hit) must stay where it is;
            // only a tail window may widen to find something renderable.
            const win = isCentered
              ? await fetchWindow(sessionId, loadOffset, PAGE_SIZE, store.get(refsEnabledAtom))
              : await fetchRenderableTail(sessionId, total, store.get(refsEnabledAtom))
            if (cancelled) return
            // A `system_init` in the loaded window is more precise than the
            // session record (it carries the frozen capabilities).
            if (win.runtime) applySessionRuntime(win.runtime)

            setMessages(win.messages)
            unplacedTimingsRef.current = win.unplacedTimings

            const endOffset = win.offset + win.rawCount

            // Track the loaded window boundaries
            paginationRef.current = {
              offset: win.offset,
              tailOffset: endOffset,
              totalCount: win.totalCount,
            }
            setHasOlderMessages(win.offset > 0)
            setHasNewerMessages(endOffset < win.totalCount)
            isAtTailRef.current = endOffset >= win.totalCount
            setIsLoadingHistory(false)
            setIsReplaying(false)

            // Phase 3: Replay buffered WS events that arrived during REST loading.
            // These were queued in pendingEventsRef by handleEvent's guard clause.
            // Setting historyLoadedRef first so any events arriving NOW go direct.
            historyLoadedRef.current = true
            const pending = pendingEventsRef.current
            pendingEventsRef.current = []
            for (const evt of pending) {
              handleEvent(evt)
            }
        })
      })
      .catch(() => {
        if (cancelled) return
        // Fallback: if REST fails, switch to full WS replay.
        // Stop buffering, clear pending, reconnect with seq 0.
        historyLoadedRef.current = true
        pendingEventsRef.current = []
        setIsLoadingHistory(false)
        ws.disconnect()
        ws.connect(sessionId, 0)
      })

    return () => {
      cancelled = true
      pendingEventsRef.current = []
    }
  }, [sessionId, getWs, setIsReplaying])

  // ========================================================================
  // Load older messages (reverse infinite scroll)
  // ========================================================================
  const loadOlderMessages = useCallback(async () => {
    if (!sessionId || isLoadingOlder || !hasOlderMessages) return

    setIsLoadingOlder(true)
    try {
      // paginationRef.offset = the chronological offset of the oldest message we have.
      // To load older messages, we go further back: newOffset = max(0, offset - PAGE_SIZE)
      const { offset } = paginationRef.current
      const newOffset = Math.max(0, offset - PAGE_SIZE)
      const loadLimit = offset - newOffset // may be < PAGE_SIZE at the start

      if (loadLimit <= 0) {
        setHasOlderMessages(false)
        setIsLoadingOlder(false)
        return
      }

      const data = await chatApi.getMessages(sessionId, {
        limit: loadLimit,
        offset: newOffset,
      })

      if (data.messages.length > 0) {
        const older = historyEventsToWindow(data.messages, { refsEnabled: store.get(refsEnabledAtom) })
        const olderMessages = older.messages
        // A call of this page whose timing came on a newer one gets it now; the
        // timings of this page whose call is older still wait for their page.
        unplacedTimingsRef.current.placeIn(olderMessages)
        // The other way: a timing stored before its call, at the end of this page,
        // whose tool_use is on the page already shown. Placed from an immutable
        // snapshot (the holder is emptied below, the updater may be replayed).
        const olderTimings = older.unplacedTimings.snapshot()
        // Prepend older messages to the beginning
        setMessages((prev) => placeTimings([...olderMessages, ...prev], olderTimings))
        // What found no call on screen waits for an even older page.
        const shown = messagesRef.current
        older.unplacedTimings.moveTo(unplacedTimingsRef.current, (id) => !hasToolUse(shown, id))

        // Move the offset cursor back (tailOffset unchanged — we only prepended)
        paginationRef.current = {
          ...paginationRef.current,
          offset: newOffset,
          totalCount: data.total_count,
        }
        setHasOlderMessages(newOffset > 0)
      } else {
        setHasOlderMessages(false)
      }
    } catch {
      // Silently fail, user can retry by scrolling up again
    } finally {
      setIsLoadingOlder(false)
    }
  }, [sessionId, isLoadingOlder, hasOlderMessages])

  // ========================================================================
  // Load newer messages (forward infinite scroll — only after centered load)
  // ========================================================================
  const loadNewerMessages = useCallback(async () => {
    if (!sessionId || isLoadingNewer || !hasNewerMessages) return

    setIsLoadingNewer(true)
    try {
      const { tailOffset, totalCount } = paginationRef.current
      const loadLimit = Math.min(PAGE_SIZE, totalCount - tailOffset)

      if (loadLimit <= 0) {
        setHasNewerMessages(false)
        isAtTailRef.current = true
        setIsLoadingNewer(false)
        return
      }

      const data = await chatApi.getMessages(sessionId, {
        limit: loadLimit,
        offset: tailOffset,
      })

      if (data.messages.length > 0) {
        const newer = historyEventsToWindow(data.messages, { refsEnabled: store.get(refsEnabledAtom) })
        const newerMessages = newer.messages
        const unplaced = newer.unplacedTimings

        // Append newer messages to the end. A timing of this page whose call is on
        // screen goes on it, and a timing held from the pages shown (stored before
        // its call) goes on its call in this page. From immutable snapshots: the
        // holders change right below, and the updater may be replayed.
        const timings = [...unplaced.snapshot(), ...unplacedTimingsRef.current.snapshot()]
        setMessages((prev) => placeTimings([...prev, ...newerMessages], timings))
        // A held timing whose call came with this page is placed: no longer held.
        for (const { id } of timings) if (hasToolUse(newerMessages, id)) unplacedTimingsRef.current.take(id)
        // The others belong to calls on a page not loaded yet.
        const shown = messagesRef.current
        unplaced.moveTo(unplacedTimingsRef.current, (id) => !hasToolUse(shown, id))

        const newTailOffset = tailOffset + data.messages.length
        paginationRef.current = {
          ...paginationRef.current,
          tailOffset: newTailOffset,
          totalCount: data.total_count,
        }

        const atTail = newTailOffset >= data.total_count
        setHasNewerMessages(!atTail)
        isAtTailRef.current = atTail

        // If we just reached the tail, flush any buffered live WS events
        if (atTail && pendingTailEventsRef.current.length > 0) {
          const pending = pendingTailEventsRef.current
          pendingTailEventsRef.current = []
          setHasLiveActivity(false)
          for (const evt of pending) {
            handleEvent(evt)
          }
        } else if (atTail) {
          setHasLiveActivity(false)
        }
      } else {
        setHasNewerMessages(false)
        isAtTailRef.current = true
      }
    } catch {
      // Silently fail, user can retry by scrolling down again
    } finally {
      setIsLoadingNewer(false)
    }
  }, [sessionId, isLoadingNewer, hasNewerMessages, handleEvent])

  // Jump directly to the tail of the conversation (reload last PAGE_SIZE messages).
  // Used by "New activity" badge — unlike loadNewerMessages which loads page-by-page,
  // this discards the current centered window and reloads the tail in one shot.
  const jumpToTail = useCallback(async () => {
    if (!sessionId) return
    try {
      const meta = await chatApi.getMessages(sessionId, { limit: 1, offset: 0 })
      const win = await fetchRenderableTail(sessionId, meta.total_count, store.get(refsEnabledAtom))

      setMessages(win.messages)
      // A window loaded from scratch: what was held for the one it replaces goes
      // with it (the live events since then are buffered and replayed below).
      earlyTimingsRef.current.clear()
      liveCallIdsRef.current.clear()
      unplacedTimingsRef.current = win.unplacedTimings

      const endOffset = win.offset + win.rawCount
      paginationRef.current = {
        offset: win.offset,
        tailOffset: endOffset,
        totalCount: win.totalCount,
      }
      setHasOlderMessages(win.offset > 0)
      setHasNewerMessages(false)
      isAtTailRef.current = true

      // Flush buffered live events now that we're at tail
      if (pendingTailEventsRef.current.length > 0) {
        const pending = pendingTailEventsRef.current
        pendingTailEventsRef.current = []
        setHasLiveActivity(false)
        for (const evt of pending) {
          handleEvent(evt)
        }
      } else {
        setHasLiveActivity(false)
      }
    } catch {
      // Fallback: at minimum clear the badge
      setHasLiveActivity(false)
    }
  }, [sessionId, handleEvent])

  // ========================================================================
  // Actions
  // ========================================================================

  /**
   * Send a user message, optionally carrying document ids.
   *
   * `attachments` are ids the documents API has already returned — the
   * composer never hands over an id for an upload still in flight (see
   * `components/chat/attachmentState.ts`). They travel in `ChatRequest.attachments`
   * on session creation (the frozen API contract of plan 8b0fdd73) and as an
   * `attachments` field on the `user_message` frame for follow-ups.
   */
  const sendMessage = useCallback(async (text: string, options?: SendMessageOptions, attachments?: string[], refs?: ChatReference[]) => {
    // References leave only toward a server that announced `refs_v1` (contract C7);
    // otherwise the message goes out exactly as it always did.
    const sentRefs = refsForWire(store.get(refsEnabledAtom), refs)
    // A new attempt: whatever the previous one failed on is no longer the news.
    store.set(chatSessionOpenErrorAtom, null)
    // Known before the optimistic bubble is added, so a failed creation can
    // take exactly that bubble back out.
    const userMessageId = nextMessageId()
    // Clear draft for this session after sending
    const draftKey = draftKeyFor(sessionId)
    setDraftsMap((prev) => {
      if (!(draftKey in prev)) return prev
      const next = { ...prev }
      delete next[draftKey]
      return next
    })

    // Add user message to UI immediately (optimistic).
    // Also dismiss any pending result_max_turns block so the orange banner disappears.
    setMessages((prev) => {
      const updated = [...prev]

      // Dismiss result_max_turns on the last assistant message (if any)
      for (let i = updated.length - 1; i >= Math.max(0, updated.length - 5); i--) {
        const msg = updated[i]
        if (msg.role === 'assistant') {
          const hasMaxTurns = msg.blocks.some((b) => b.type === 'result_max_turns')
          const hasContinue = msg.blocks.some((b) => b.type === 'continue_indicator')
          if (hasMaxTurns && !hasContinue) {
            updated[i] = {
              ...msg,
              blocks: msg.blocks.map((b) =>
                b.type === 'result_max_turns'
                  ? { ...b, metadata: { ...b.metadata, dismissed: true } }
                  : b,
              ),
            }
          }
          break
        }
      }

      updated.push({
        id: userMessageId,
        role: 'user',
        blocks: [{ id: nextBlockId(), type: 'text', content: text }],
        // The chips of the bubble: the labels the composer already knows.
        ...(sentRefs ? { refs } : {}),
        timestamp: serverClockRef.current.now(),
        awaitingEcho: true,
      })
      return updated
    })

    if (!sessionId) {
      // First message — create session via REST, then connect WS
      setIsSending(true)
      setIsStreaming(true)
      try {
        // Which routing mode governs this conversation. Read from the settings
        // of its project (loaded here when nobody did yet); anything unknown
        // — no routing routes, a failed read — is `primary`, today's behaviour.
        const slug = options?.projectSlug ?? store.get(chatRoutingSlugAtom)
        await store.set(loadRoutingSettingsAtom, { slug })
        // The conversation's own choice (the menu) wins over the settings.
        const chosenMode = store.get(chatDraftRoutingModeAtom)
        const mode = chosenMode ?? store.get(routingSettingsAtom(slug)).settings?.mode ?? 'primary'
        // In `mixed` (the pilot) and `full`, PO / the server resolves provider
        // AND model: nothing is sent unless the user forced a target through
        // the "Advanced" path.
        // A draft that picked models names them (strict: one, mixed: the pilot and the pool).
        // With the router, an untouched draft names nothing (the menu shows none either);
        // without it the picker is the only way, as before.
        const routerPresent = !!store.get(routingSettingsAtom(slug)).settings
        const explicit = chosenMode ? chosenMode !== 'full' : routerPresent ? store.get(chatForcedTargetAtom) : mode === 'primary'
        // Mixed: PO routes among the picked models (`ChatRequest.routing_pool`). An alias is
        // sent as the model it stands for, and an alias next to its model counts once.
        const resolvePick = pickModelResolver(store.get(providersAtom))
        const pool =
          chosenMode === 'mixed'
            ? distinctModels(store.get(chatDraftSelectionAtom), resolvePick).map((pick) => ({ provider: pick.provider, model: resolvePick(pick) }))
            : null
        // The provider is named ONLY when the user picked an instance this
        // server lists. Otherwise the field is left out and the server
        // resolves its default (project rule, global rule…) — sending the
        // id the interface merely DISPLAYS would freeze that routing.
        const picked = store.get(chatSelectedProviderAtom)
        const provider =
          explicit &&
          picked &&
          store.get(providersLoadStateAtom) !== 'unsupported' &&
          store.get(providersAtom)?.providers.some((p) => p.id === picked)
            ? picked
            : undefined
        const response = await chatApi.createSession({
          message: text,
          cwd: options!.cwd,
          project_slug: options?.projectSlug,
          workspace_slug: options?.workspaceSlug,
          permission_mode: wirePermissionMode(openingPermissionMode(options?.permissionMode)),
          // A model id, or the NAME of an alias (`fast`, `deep`…) of the instance.
          model: options?.model ?? (explicit ? store.get(chatSessionModelAtom) : null) ?? undefined,
          ...(provider ? { provider } : {}),
          ...(chosenMode ? { routing_mode: chosenMode } : {}),
          ...(pool && pool.length > 1 ? { routing_pool: pool } : {}),
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
          ...(sentRefs ? { refs: sentRefs } : {}),
        })
        // Signal that the upcoming sessionId change is from a first send,
        // so the auto-connect useEffect should NOT reset messages.
        isFirstSendRef.current = true
        // What was typed while the id was on its way follows the conversation.
        moveDraft({ from: NEW_CONVERSATION_DRAFT_KEY, to: response.session_id })
        // So does what was queued behind this first message.
        moveQueue({ from: NEW_CONVERSATION_DRAFT_KEY, to: response.session_id })
        setSessionId(response.session_id)
        // The forced target belonged to the conversation just opened.
        store.set(chatForcedTargetAtom, false)
        // So did its mode: the next conversation starts from the settings again.
        // The provider the menu parked for the composer belonged to it as well, not to the next chat.
        if (store.get(chatDraftSelectionAtom).length > 0) store.set(chatSelectedProviderAtom, null)
        store.set(chatDraftAutoAtom, null)
        store.set(chatDraftSelectionAtom, [])
        // The conversation keeps the mode it was opened with (its own, or the settings' of that
        // moment), before its record says so: it never follows the settings afterwards.
        store.set(chatSessionRoutingAtom, { routed_by: null, route_reason: null, routing_mode: mode })
        if (mode !== 'primary') {
          // How PO routed it (`routed_by`, `route_reason`): read from the record, best effort.
          void Promise.resolve()
            .then(() => chatApi.getSession(response.session_id))
            .then((session) => {
              if (store.get(chatSessionIdAtom) !== response.session_id) return
              const record = sessionRoutingOf(session)
              // A server that does not echo the mode yet: keep the one this chat was opened with.
              store.set(chatSessionRoutingAtom, record && !record.routing_mode ? { ...record, routing_mode: mode } : (record ?? { routed_by: null, route_reason: null, routing_mode: mode }))
            })
            .catch(() => {})
        }
        // Populate session metadata from the options used to create the session
        if (options) {
          setSessionMeta({ cwd: options.cwd, projectSlug: options.projectSlug, workspaceSlug: options.workspaceSlug })
        }
        // Reset override after use
        if (store.get(chatSessionPermissionOverrideAtom)) setPermissionOverride(null)
      } catch (err) {
        // No session was opened: nothing will ever stream, so the indicator
        // goes off, and the bubble shown optimistically was never sent.
        setIsStreaming(false)
        setMessages((prev) => prev.filter((m) => m.id !== userMessageId))
        // The text goes back to the composer rather than being lost; anything
        // typed while the request was pending is kept after it.
        store.set(chatDraftInputAtom, (typed) => (typed.trim() === '' ? text : `${text}\n${typed}`))
        store.set(chatSessionOpenErrorAtom, {
          info: toProviderError(err),
          message: apiErrorMessage(err, tr('app.chat.startFailed')),
          text,
          attachments: attachments ?? [],
        })
      } finally {
        setIsSending(false)
      }
      // WS will auto-connect via the useEffect above when sessionId changes
    } else {
      // Follow-up message — send via WS
      const ws = getWs()
      setIsStreaming(true)
      if (!(sentRefs ? ws.sendUserMessage(text, attachments, { refs: sentRefs }) : ws.sendUserMessage(text, attachments))) {
        // Dead socket: send() already forced a reconnect. Queue the text —
        // onReplayComplete flushes it once the session is consistent again.
        // The attachments travel with it: the documents are already stored
        // server-side, so their ids stay valid across the reconnect.
        pendingSendRef.current.push({ text, attachments, ...(sentRefs ? { refs: sentRefs } : {}) })
      }
    }
  }, [sessionId, setSessionId, setIsStreaming, getWs, setPermissionOverride, setDraftsMap, moveDraft, moveQueue, store, wirePermissionMode, openingPermissionMode])

  /**
   * Send "Continue" after max_turns — adds a discreet inline indicator instead of a user bubble.
   * The backend still receives a normal user_message with content "Continue".
   */
  const sendContinue = useCallback(() => {
    if (!sessionId) return
    // Debounce: prevent double-sends within 300ms
    if (continueDebounceRef.current) return
    continueDebounceRef.current = setTimeout(() => { continueDebounceRef.current = null }, 300)

    // Send via WS as a normal user_message. `send()` returns false on a dead
    // socket (and schedules a reconnect): nothing was delivered, so do not
    // show the indicator nor latch isStreaming, and let the user retry.
    const ws = getWs()
    if (!ws.sendUserMessage('Continue')) {
      clearTimeout(continueDebounceRef.current)
      continueDebounceRef.current = null
      return
    }

    // Add a discreet continue_indicator block to the last assistant message (not a user bubble)
    setMessages((prev) => {
      const updated = [...prev]
      let lastMsg = updated[updated.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg = { ...lastMsg, blocks: [...lastMsg.blocks] }
        updated[updated.length - 1] = lastMsg
        // Get num_turns from the result_max_turns block if present
        const maxTurnsBlock = lastMsg.blocks.find((b) => b.type === 'result_max_turns')
        const numTurns = maxTurnsBlock?.metadata?.num_turns as number | undefined
        lastMsg.blocks.push({
          id: nextBlockId(),
          type: 'continue_indicator',
          content: 'Continued',
          metadata: numTurns != null ? { num_turns: numTurns } : undefined,
        })
      }
      return updated
    })

    setIsStreaming(true)
  }, [sessionId, getWs, setIsStreaming])

  /** Toggle auto-continue on the backend (sends WS message, atom synced from backend event) */
  const changeAutoContinue = useCallback((enabled: boolean) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendSetAutoContinue(enabled)
    // Optimistically update local state (server will confirm via auto_continue_state_changed event)
    setAutoContinue(enabled)
  }, [sessionId, getWs, setAutoContinue])

  /** Returns true when the answer was handed to the socket, false otherwise. */
  const respondPermission = useCallback((
    toolCallId: string,
    allowed: boolean,
    scope?: PermissionScope,
  ): boolean => {
    if (!sessionId) return false
    // How long an approval lasts is kept by the provider (`session`) or by the
    // backend / the CLI (`always`): the backend says so with `permission_decision.scope`.
    return getWs().sendPermissionResponse(toolCallId, allowed, scope)
  }, [sessionId, getWs])

  /**
   * Answer a question the agent asked. Returns true when the answer was handed
   * to the socket, false otherwise.
   *
   * A NATIVE question (Claude's `AskUserQuestion`) is answered in-band with an
   * `input_response`. A question the provider has no native support for — the
   * backend marked it `synthetic`, or the session's capabilities say
   * `native_question: false` — is answered by a USER TURN: nothing on the
   * provider's side is waiting for an `input_response`.
   */
  const respondInput = useCallback((requestId: string, response: string): boolean => {
    if (!sessionId) return false
    const ws = getWs()
    const isTarget = (b: ContentBlock) =>
      b.type === 'ask_user_question' && (b.metadata?.tool_call_id === requestId || b.id === requestId)
    const target = messagesRef.current.flatMap((m) => m.blocks).find(isTarget)
    const asUserTurn =
      target?.metadata?.synthetic === true || !store.get(chatSessionCapabilitiesAtom).native_question

    // Not delivered (dead socket): leave the question open so it can be re-answered.
    if (asUserTurn ? !ws.sendUserMessage(response) : !ws.sendInputResponse(requestId, response)) return false

    // Stamp the block's metadata with the response so it persists across
    // page reloads and renders as read-only in history/replay.
    setMessages((prev) => {
      const stamped = prev.map((msg) => {
        const blockIdx = msg.blocks.findIndex(isTarget)
        if (blockIdx === -1) return msg
        const updatedBlocks = [...msg.blocks]
        updatedBlocks[blockIdx] = {
          ...updatedBlocks[blockIdx],
          metadata: {
            ...updatedBlocks[blockIdx].metadata,
            submitted: true,
            response,
          },
        }
        return { ...msg, blocks: updatedBlocks }
      })
      if (!asUserTurn) return stamped
      // The answer is a turn of the conversation: it shows as one, exactly as
      // the history will replay it (the broadcast echo is deduplicated on its text).
      return [
        ...stamped,
        {
          id: nextMessageId(),
          role: 'user' as const,
          blocks: [{ id: nextBlockId(), type: 'text' as const, content: response }],
          timestamp: serverClockRef.current.now(),
          awaitingEcho: true,
        },
      ]
    })
    if (asUserTurn) setIsStreaming(true)
    return true
  }, [sessionId, getWs, store, setIsStreaming])

  // Stop over REST: its own HTTP handler, so it does not wait on the WS loop.
  const interruptOverRest = useCallback(async (id: string) => {
    try {
      const outcome = await chatApi.interruptSession(id)
      if (!outcome?.delivered) {
        // Nothing was streaming server-side. Clear the local streaming flag
        // so the button leaves its "Stopping…" state: no `result` event is
        // coming to do it for us.
        console.warn('Chat: interrupt reached the server but stopped nothing', outcome)
        setIsStreaming(false)
      }
      // On success, leave isStreaming alone — wait for the 'result' event.
    } catch (err) {
      console.error('Chat: interrupt failed over both WebSocket and REST', err)
      setIsStreaming(false)
    }
  }, [setIsStreaming])

  const interrupt = useCallback(async () => {
    if (!sessionId) return
    const ws = getWs()

    // `send()` returns false on a dead socket — and schedules a reconnect.
    // That return used to be dropped here, which is how Stop became a
    // no-op: the frame went nowhere, nothing reached the backend, and the
    // composer had already latched "Stopping…" with no way back. Unlike a
    // user message (queued in `pendingSendRef` and replayed), an interrupt
    // is worthless late — so it falls back to REST rather than waiting for
    // the socket to come back.
    if (!ws.sendInterrupt()) {
      await interruptOverRest(sessionId)
      return
    }

    // The socket accepted the frame; that does not mean the backend read it.
    // Its WS loop handles one frame at a time, and while it is busy inside
    // another handler the frame just sits in the socket: no `result` comes,
    // and Stop would stay latched on "Stopping…" for good. So if the turn is
    // still streaming after a grace period, ask over REST as well.
    if (interruptWatchdogRef.current) clearTimeout(interruptWatchdogRef.current)
    interruptWatchdogRef.current = setTimeout(() => {
      interruptWatchdogRef.current = null
      if (store.get(chatStreamingAtom)) void interruptOverRest(sessionId)
    }, INTERRUPT_ACK_TIMEOUT_MS)
  }, [sessionId, getWs, store, interruptOverRest])

  useEffect(() => () => {
    if (interruptWatchdogRef.current) clearTimeout(interruptWatchdogRef.current)
  }, [])

  /**
   * Hand over to the server every queued message still waiting on this side
   * (`local`): composed before the conversation had an id, or while the socket
   * was down. Stops at the first one that cannot leave, to keep their order;
   * the next reconnect retries.
   */
  const syncLocalQueue = useCallback(() => {
    const sid = store.get(chatSessionIdAtom)
    const ws = getWs()
    if (!sid || ws.sessionId !== sid) return
    const queue = store.get(chatMessageQueuesAtom)[sid] ?? []
    let remaining = queue
    for (const entry of queue) {
      if (!entry.local) continue
      const queuedRefs = refsForWire(store.get(refsEnabledAtom), entry.refs)
      if (!ws.sendUserMessage(entry.text, entry.attachmentIds, { queue: true, ...(queuedRefs ? { refs: queuedRefs } : {}) })) break
      remaining = remaining.filter((m) => m.id !== entry.id)
    }
    if (remaining !== queue) {
      store.set(chatMessageQueuesAtom, withQueue(store.get(chatMessageQueuesAtom), sid, remaining))
    }
  }, [getWs, store])
  useEffect(() => {
    syncLocalQueueRef.current = syncLocalQueue
  }, [syncLocalQueue])

  /**
   * Queue a message behind the running response instead of interrupting it.
   *
   * The session holds it and delivers it when the turn ends — the server, not
   * this page, so it leaves even if the user moves to another conversation.
   * It shows at once as a `local` row and is handed over right away when the
   * socket allows; the server's `pending_queue` list then takes over.
   */
  const queueMessage = useCallback((text: string, attachments?: string[], refs?: ChatReference[]) => {
    const key = draftKeyFor(store.get(chatSessionIdAtom))
    const all = store.get(chatMessageQueuesAtom)
    const current = all[key] ?? []
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random()}`
    const next = enqueue(current, text, id, Date.now(), attachments, refsForWire(store.get(refsEnabledAtom), refs))
    if (next.length === current.length) return // empty text
    const last: QueuedMessage = { ...next[next.length - 1], local: true }
    store.set(chatMessageQueuesAtom, withQueue(all, key, [...next.slice(0, -1), last]))
    syncLocalQueue()
  }, [store, syncLocalQueue])

  /**
   * Edit, drop, move to the front or send now one queued message.
   *
   * A row the server holds changes on the server; the list on screen follows
   * at once and the server's next list confirms it. If the frame cannot leave
   * (socket down) nothing changes on screen either: showing a message as
   * dropped while the server still holds it would get it sent anyway.
   */
  const queueOp = useCallback((action: QueueOp) => {
    const key = draftKeyFor(store.get(chatSessionIdAtom))
    const all = store.get(chatMessageQueuesAtom)
    const current = all[key] ?? []
    const target = current.find((m) => m.id === action.id)
    if (!target) return
    if (target.local) {
      // Not on the server yet: there is no running send to interrupt for it,
      // so "send now" can only put it first.
      const local: QueueOp = action.op === 'send_now' ? { op: 'prioritize', id: action.id } : action
      const next = applyQueueOp(current, local, store.get(refsEnabledAtom)).map((m) => (m.id === action.id ? { ...m, local: true } : m))
      store.set(chatMessageQueuesAtom, withQueue(all, key, next))
      return
    }
    if (!getWs().sendQueueOp(action)) return
    store.set(chatMessageQueuesAtom, withQueue(all, key, applyQueueOp(current, action, store.get(refsEnabledAtom))))
  }, [getWs, store])

  const newSession = useCallback(() => {
    // The draft needs no hand-over: it is keyed by conversation
    // (chatDraftInputAtom), so the composer follows the session id.
    const ws = getWs()
    ws.disconnect()
    setSessionId(null)
    setIsStreaming(false)
    setIsReplaying(false)
    setMessages([])
    setBackgroundTasks([])
    setSecretRequests([])
    setSessionMeta(null)
    setHasOlderMessages(false)
    setHasNewerMessages(false)
    isAtTailRef.current = true
    targetTimestampRef.current = null
    pendingTailEventsRef.current = []
    setHasLiveActivity(false)
    paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
    // Reset session-scoped state
    setPermissionOverride(null)
    setSessionModel(null)
    setAutoContinue(false)
    applySessionRuntime(null)
    store.set(chatSessionRoutingAtom, null)
    store.set(chatForcedTargetAtom, false)
    store.set(chatSessionOpenErrorAtom, null)
  }, [store, getWs, setSessionId, setIsStreaming, setIsReplaying, setPermissionOverride, setSessionModel, setAutoContinue, sessionId, applySessionRuntime])

  const changePermissionMode = useCallback((mode: ToolPolicyMode) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendSetPermissionMode(toWireMode(mode, { neutral: store.get(chatProviderTargetAtom).neutralWire }))
    // Optimistically update local state (server will confirm via permission_mode_changed event)
    setPermissionOverride(mode)
  }, [sessionId, getWs, setPermissionOverride, store])

  const changeModel = useCallback((model: string) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendSetModel(model)
    // Optimistically update local state (server will confirm via model_changed event)
    setSessionModel(model)
  }, [sessionId, getWs, setSessionModel])

  const loadSession = useCallback(async (sid: string, targetTimestamp?: number) => {
    // Guard: if already on this session, do nothing (avoid WS disconnect/reconnect loop)
    if (sid === sessionId) return

    // Store target timestamp (Unix seconds) for the auto-connect useEffect to pick up
    targetTimestampRef.current = targetTimestamp ?? null

    const ws = getWs()
    ws.disconnect()
    setSessionId(sid)
    setIsStreaming(false)
    setMessages([])
    setIsLoadingHistory(true)
    setIsReplaying(true)
    setHasOlderMessages(false)
    setHasNewerMessages(false)
    setHasLiveActivity(false)
    paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
    // The previous conversation's provider must not leak into this one.
    applySessionRuntime(null)
    store.set(chatSessionRoutingAtom, null)
    // Neither must the failure of a conversation that never opened.
    store.set(chatSessionOpenErrorAtom, null)

    // Fetch session metadata (cwd, project, permission mode) for display in header
    chatApi.getSession(sid).then((session) => {
      // Provider of the session record. Absent (session created before
      // providers existed) = Claude Code with the full profile.
      const provider = toProviderRef(
        session.provider_id ? { id: session.provider_id, kind: session.provider_kind ?? undefined } : null,
      )
      if (provider || session.capabilities || session.engine) {
        applySessionRuntime({ provider, capabilities: session.capabilities ?? null, toolPolicy: null, engine: session.engine ?? null, degradedFeatures: session.degraded_features ?? [] })
      }
      store.set(chatSessionRoutingAtom, sessionRoutingOf(session))
      setSessionMeta({ cwd: session.cwd, projectSlug: session.project_slug, workspaceSlug: session.workspace_slug, spawnedBy: session.spawned_by ?? null })
      // Restore the session's permission mode override
      setPermissionOverride(session.permission_mode ? readToolPolicyMode(session.permission_mode) : null)
      // Restore the session's model
      setSessionModel(session.model ?? null)
    }).catch(() => {
      // Non-critical — header just won't show cwd
      setSessionMeta(null)
    })

    // WS will auto-connect via the useEffect above when sessionId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPermissionOverride and setSessionModel are stable Jotai setters
  }, [sessionId, getWs, setSessionId, setIsStreaming, setIsReplaying, applySessionRuntime, store])

  // Follow a conversation that moved to another provider (see `chatFollowRequestAtom`):
  // open the session that continues it; a draft typed on the old one goes with it.
  const followRequest = useAtomValue(chatFollowRequestAtom)
  useEffect(() => {
    if (!followRequest) return
    store.set(chatFollowRequestAtom, null)
    store.set(moveChatDraftAtom, { from: followRequest.fromSessionId, to: followRequest.sessionId })
    store.set(chatFollowNoticeAtom, followRequest.notice ? { sessionId: followRequest.sessionId, ...followRequest.notice } : null)
    void loadSession(followRequest.sessionId)
  }, [followRequest, loadSession, store])

  /**
   * Cancel the running tools over the socket (`cancel_tools` frame) when it is open on
   * this session. False = not sent: the caller falls back to REST.
   */
  const cancelToolsLive = useCallback((): boolean => {
    const ws = wsRef.current
    if (!sessionId || !ws || ws.sessionId !== sessionId || ws.status !== 'connected') return false
    return ws.sendCancelTools()
  }, [sessionId])

  return {
    messages,
    isStreaming,
    isCompacting,
    isSending,
    isLoadingHistory,
    isLoadingOlder,
    isLoadingNewer,
    isReplaying,
    hasOlderMessages,
    hasNewerMessages,
    hasLiveActivity,
    jumpToTail,
    wsStatus,
    sessionId,
    sessionMeta,
    sendMessage,
    queueMessage,
    queueOp,
    sendContinue,
    respondPermission,
    respondInput,
    interrupt,
    newSession,
    loadSession,
    loadOlderMessages,
    loadNewerMessages,
    changePermissionMode,
    changeModel,
    changeAutoContinue,
    cancelToolsLive,
  }
}
