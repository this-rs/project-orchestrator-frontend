import { useState, useCallback, useRef, useEffect } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { chatSessionIdAtom, chatStreamingAtom, chatCompactingAtom, chatWsStatusAtom, chatReplayingAtom, chatSessionPermissionOverrideAtom, chatAutoApprovedToolsAtom, chatSessionModelAtom, chatAutoContinueAtom, chatDraftInputAtom } from '@/atoms'
import { chatApi, ChatWebSocket } from '@/services'
import type { ChatMessage, ChatEvent, PermissionMode } from '@/types'

let blockIdCounter = 0
function nextBlockId() {
  return `b-${++blockIdCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Extract parent_tool_use_id from a chat event (if present).
 * When set, this event originated from a sub-agent spawned by a Task tool.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getParentToolUseId(event: any): string | undefined {
  // Live events: field is at top-level
  // Replay events: field may be inside .data
  const data = event.data ?? event
  return data.parent_tool_use_id ?? undefined
}

/**
 * Inject parent_tool_use_id into metadata if present.
 * Returns the metadata object with the field added (or unchanged).
 */
function withParent(
  metadata: Record<string, unknown> | undefined,
  parentToolUseId: string | undefined,
): Record<string, unknown> | undefined {
  if (!parentToolUseId) return metadata
  return { ...metadata, parent_tool_use_id: parentToolUseId }
}

/**
 * Inject `created_at` (ISO string) into metadata for timestamp display.
 */
function withCreatedAt(
  metadata: Record<string, unknown> | undefined,
  createdAt: string | undefined,
): Record<string, unknown> | undefined {
  if (!createdAt) return metadata
  return { ...metadata, created_at: createdAt }
}

let messageIdCounter = 0
function nextMessageId() {
  return `m-${++messageIdCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/** Number of messages to load per page via REST */
const PAGE_SIZE = 50

export interface SendMessageOptions {
  cwd: string
  projectSlug?: string
  permissionMode?: PermissionMode
  model?: string
}

/** Metadata about the active chat session (cwd, project, etc.) */
export interface SessionMeta {
  cwd: string
  projectSlug?: string
}

/**
 * Convert raw chat events (from REST /messages endpoint) into ChatMessage UI format.
 * Groups events into user/assistant messages — same logic as handleEvent in replay mode.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function historyEventsToMessages(events: any[]): ChatMessage[] {
  const messages: ChatMessage[] = []

  function lastAssistant(eventTimestamp?: Date): ChatMessage {
    let msg = messages[messages.length - 1]
    if (!msg || msg.role !== 'assistant') {
      msg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: eventTimestamp ?? new Date() }
      messages.push(msg)
    }
    return msg
  }

  // Track whether the previous event was a result/error_max_turns so we can
  // transform the following "Continue" user_message into a discreet indicator.
  let lastEventWasMaxTurns = false

  for (const evt of events) {
    const type = evt.type as string
    const createdAt = evt.created_at
      ? new Date(typeof evt.created_at === 'number' ? evt.created_at * 1000 : evt.created_at)
      : new Date()

    switch (type) {
      case 'user_message': {
        const content = evt.content ?? ''
        // "Continue" after max_turns → discreet indicator instead of user bubble
        if (lastEventWasMaxTurns && content === 'Continue') {
          const assistantMsg = messages[messages.length - 1]
          if (assistantMsg && assistantMsg.role === 'assistant') {
            const maxTurnsBlock = assistantMsg.blocks.find((b) => b.type === 'result_max_turns')
            const numTurns = maxTurnsBlock?.metadata?.num_turns as number | undefined
            assistantMsg.blocks.push({
              id: nextBlockId(),
              type: 'continue_indicator',
              content: 'Continued',
              metadata: numTurns != null ? { num_turns: numTurns } : undefined,
            })
          }
          lastEventWasMaxTurns = false
          break
        }
        // User sent a normal message (not "Continue") after max_turns →
        // dismiss the result_max_turns block so the orange banner won't reappear on reload.
        if (lastEventWasMaxTurns) {
          const assistantMsg = messages[messages.length - 1]
          if (assistantMsg && assistantMsg.role === 'assistant') {
            const maxTurnsBlock = assistantMsg.blocks.find((b) => b.type === 'result_max_turns')
            if (maxTurnsBlock) {
              maxTurnsBlock.metadata = { ...maxTurnsBlock.metadata, dismissed: true }
            }
          }
        }
        lastEventWasMaxTurns = false
        messages.push({
          id: evt.id || nextMessageId(),
          role: 'user',
          blocks: [{ id: nextBlockId(), type: 'text', content }],
          timestamp: createdAt,
        })
        break
      }

      case 'assistant_text': {
        const content = evt.content ?? ''
        if (content) {
          const msg = lastAssistant(createdAt)
          const parent = getParentToolUseId(evt)
          msg.blocks.push({ id: nextBlockId(), type: 'text', content, metadata: withParent(undefined, parent) })
        }
        break
      }

      case 'thinking': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({ id: nextBlockId(), type: 'thinking', content: evt.content ?? '', metadata: withParent(undefined, parent) })
        break
      }

      case 'tool_use': {
        const msg = lastAssistant(createdAt)
        const toolName = evt.tool ?? ''
        const toolId = evt.id ?? ''
        const toolInput = evt.input ?? {}
        const parent = getParentToolUseId(evt)
        const ts = createdAt.toISOString()

        if (toolName === 'AskUserQuestion') {
          const questions = (toolInput as { questions?: { question: string }[] })?.questions
          if (questions && questions.length > 0) {
            // Dedup: skip if ask_user_question block with same tool_call_id already exists
            const isDupe = toolId && msg.blocks.some(
              (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolId,
            )
            if (!isDupe) {
              msg.blocks.push({
                id: nextBlockId(),
                type: 'ask_user_question',
                content: questions.map((q: { question: string }) => q.question).join('\n'),
                metadata: withCreatedAt(withParent({ tool_call_id: toolId, questions }, parent), ts),
              })
            }
          }
        } else {
          msg.blocks.push({
            id: nextBlockId(),
            type: 'tool_use',
            content: toolName,
            metadata: withCreatedAt(withParent({ tool_call_id: toolId, tool_name: toolName, tool_input: toolInput }, parent), ts),
          })
        }
        break
      }

      case 'tool_use_input_resolved': {
        // Update an existing tool_use block's input
        const resolvedId = evt.id
        const resolvedInput = evt.input ?? {}
        for (let mi = messages.length - 1; mi >= 0; mi--) {
          const msg = messages[mi]
          for (let bi = 0; bi < msg.blocks.length; bi++) {
            const block = msg.blocks[bi]
            if (block.type === 'tool_use' && block.metadata?.tool_call_id === resolvedId) {
              msg.blocks[bi] = { ...block, metadata: { ...block.metadata, tool_input: resolvedInput } }
            }
          }
        }
        break
      }

      case 'tool_result': {
        const msg = lastAssistant(createdAt)
        const result = evt.result
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
        const parent = getParentToolUseId(evt)
        // Calculate tool duration by finding the matching tool_use block
        let toolDurationMs: number | undefined
        const toolCallId = evt.id
        if (toolCallId) {
          for (let mi = messages.length - 1; mi >= 0; mi--) {
            const tuBlock = messages[mi].blocks.find(
              (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === toolCallId && b.metadata?.created_at,
            )
            if (tuBlock) {
              const tuTime = new Date(tuBlock.metadata!.created_at as string).getTime()
              const trTime = createdAt.getTime()
              if (trTime > tuTime) toolDurationMs = trTime - tuTime
              break
            }
          }
        }
        msg.blocks.push({
          id: nextBlockId(),
          type: 'tool_result',
          content: resultStr,
          metadata: withCreatedAt(withParent({
            tool_call_id: toolCallId,
            is_error: evt.is_error,
            ...(toolDurationMs != null && { duration_ms: toolDurationMs }),
          }, parent), createdAt.toISOString()),
        })
        break
      }

      case 'tool_cancelled': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'tool_result',
          content: 'Cancelled by user',
          metadata: withParent({ tool_call_id: evt.id, is_cancelled: true }, parent),
        })
        break
      }

      case 'permission_request': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'permission_request',
          content: `Tool "${evt.tool}" wants to execute`,
          metadata: withParent({ tool_call_id: evt.id, tool_name: evt.tool, tool_input: evt.input }, parent),
        })
        break
      }

      case 'permission_decision': {
        // Find the matching permission_request block and stamp the decision
        const decisionId = evt.id as string
        const allowed = evt.allow as boolean
        for (let mi = messages.length - 1; mi >= 0; mi--) {
          const msg = messages[mi]
          for (let bi = 0; bi < msg.blocks.length; bi++) {
            const block = msg.blocks[bi]
            if (block.type === 'permission_request' && block.metadata?.tool_call_id === decisionId) {
              msg.blocks[bi] = { ...block, metadata: { ...block.metadata, decided: true, decision: allowed ? 'allowed' : 'denied' } }
            }
          }
        }
        break
      }

      case 'input_request': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'input_request',
          content: evt.prompt ?? '',
          metadata: withParent({ request_id: evt.prompt, options: evt.options }, parent),
        })
        break
      }

      case 'ask_user_question': {
        const msg = lastAssistant(createdAt)
        const questions = evt.questions as { question: string }[] | undefined
        const toolCallId = (evt as { tool_call_id?: string }).tool_call_id ?? ''
        const parent = getParentToolUseId(evt)
        if (questions && questions.length > 0) {
          // Dedup: skip if a block with the same tool_call_id already exists
          const isDupe = toolCallId && msg.blocks.some(
            (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolCallId,
          )
          if (!isDupe) {
            msg.blocks.push({
              id: nextBlockId(),
              type: 'ask_user_question',
              content: questions.map((q: { question: string }) => q.question).join('\n'),
              metadata: withParent({ tool_call_id: toolCallId, questions }, parent),
            })
          }
        }
        break
      }

      case 'error': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: evt.message ?? 'Unknown error',
          metadata: withParent(undefined, parent),
        })
        break
      }

      case 'model_changed': {
        const msg = lastAssistant(createdAt)
        const changedModel = (evt.model as string) ?? 'unknown'
        msg.blocks.push({
          id: nextBlockId(),
          type: 'model_changed',
          content: `Model changed to ${changedModel}`,
          metadata: { model: changedModel },
        })
        break
      }

      case 'compact_boundary': {
        const msg = lastAssistant(createdAt)
        const trigger = (evt.trigger as string) ?? 'auto'
        const preTokens = evt.pre_tokens as number | undefined
        const label = preTokens
          ? `Context compacted (${trigger}, ~${Math.round(preTokens / 1000)}K tokens)`
          : `Context compacted (${trigger})`
        msg.blocks.push({
          id: nextBlockId(),
          type: 'compact_boundary',
          content: label,
          metadata: { trigger, pre_tokens: preTokens },
        })
        break
      }

      case 'system_init': {
        // Dedup: only show the first system_init per conversation
        const alreadyHasInit = messages.some((m) =>
          m.blocks.some((b) => b.type === 'system_init'),
        )
        if (!alreadyHasInit) {
          const msg = lastAssistant(createdAt)
          const initModel = evt.model as string | undefined
          const initTools = evt.tools as string[] | undefined
          const initMcpServers = evt.mcp_servers as { name: string; status?: string }[] | undefined
          const initPermMode = evt.permission_mode as string | undefined
          msg.blocks.push({
            id: nextBlockId(),
            type: 'system_init',
            content: 'Session initialized',
            metadata: {
              model: initModel,
              tools_count: initTools?.length ?? 0,
              mcp_servers_count: initMcpServers?.length ?? 0,
              permission_mode: initPermMode,
            },
          })
        }
        break
      }

      case 'result': {
        const rSubtype = (evt.subtype as string) ?? 'success'
        const rNumTurns = evt.num_turns as number | undefined
        const rResultText = evt.result_text as string | undefined

        // Store turn metrics on the assistant message
        const rMsg = lastAssistant(createdAt)
        if (evt.duration_ms != null) rMsg.duration_ms = evt.duration_ms as number
        if (evt.cost_usd != null) rMsg.cost_usd = evt.cost_usd as number

        if (rSubtype === 'error_max_turns') {
          rMsg.blocks.push({
            id: nextBlockId(),
            type: 'result_max_turns',
            content: rNumTurns
              ? `Maximum turns reached (${rNumTurns} turns)`
              : 'Maximum turns reached',
            metadata: { num_turns: rNumTurns },
          })
          lastEventWasMaxTurns = true
        } else if (rSubtype === 'error_during_execution') {
          rMsg.blocks.push({
            id: nextBlockId(),
            type: 'result_error',
            content: rResultText ?? 'An execution error occurred',
            metadata: { result_text: rResultText },
          })
          lastEventWasMaxTurns = false
        } else {
          lastEventWasMaxTurns = false
        }
        break
      }

      case 'auto_continue': {
        const msg = lastAssistant(createdAt)
        const acDelay = evt.delay_ms as number | undefined
        msg.blocks.push({
          id: nextBlockId(),
          type: 'continue_indicator',
          content: 'Auto-continuing...',
          metadata: { delay_ms: acDelay, auto: true },
        })
        lastEventWasMaxTurns = false
        break
      }

      case 'auto_continue_state_changed':
        // State sync event — no UI block needed in history
        lastEventWasMaxTurns = false
        break

      default:
        // Unknown event type — skip
        lastEventWasMaxTurns = false
        break
    }
  }

  // Post-processing: match ask_user_question blocks with their tool_result
  // to pre-fill the persisted response for read-only display in history.
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type === 'ask_user_question' && block.metadata?.tool_call_id && !block.metadata.submitted) {
        const toolCallId = block.metadata.tool_call_id as string
        // Find the tool_result with the same tool_call_id
        const toolResult = msg.blocks.find(
          (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === toolCallId,
        )
        if (toolResult) {
          block.metadata = {
            ...block.metadata,
            submitted: true,
            response: toolResult.content || '',
          }
        }
      }
    }
  }

  return messages
}

export function useChat() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [isStreaming, setIsStreaming] = useAtom(chatStreamingAtom)
  const [isCompacting, setIsCompacting] = useAtom(chatCompactingAtom)
  const [wsStatus, setWsStatus] = useAtom(chatWsStatusAtom)
  const [isReplaying, setIsReplaying] = useAtom(chatReplayingAtom)
  const _setPermissionOverride = useSetAtom(chatSessionPermissionOverrideAtom)
  const _setAutoApprovedTools = useSetAtom(chatAutoApprovedToolsAtom)
  const _setSessionModel = useSetAtom(chatSessionModelAtom)
  const setDraftInput = useSetAtom(chatDraftInputAtom)
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
  const pendingTailEventsRef = useRef<Array<ChatEvent & { seq?: number; replaying?: boolean }>>([])
  // True when live WS events are being buffered (user is viewing centered pagination)
  const [hasLiveActivity, setHasLiveActivity] = useState(false)

  // Mid-stream join: buffer WS events while REST history is loading.
  // historyLoadedRef starts true (first-send path has no REST loading).
  // The auto-connect useEffect sets it to false before starting REST,
  // then back to true after setMessages(history) + replaying buffered events.
  const historyLoadedRef = useRef(true)
  const pendingEventsRef = useRef<Array<ChatEvent & { seq?: number; replaying?: boolean }>>([])

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
  const autoApprovedToolsRef = useRef<Set<string>>(new Set())
  const permissionOverrideRef = useRef<PermissionMode | null>(null)
  const sessionModelRef = useRef<string | null>(null)

  // Tracked setters: update ref + atom atomically
  const setPermissionOverride = useCallback((value: PermissionMode | null) => {
    permissionOverrideRef.current = value
    _setPermissionOverride(value)
  }, [_setPermissionOverride])

  const setAutoApprovedTools = useCallback((value: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    if (typeof value === 'function') {
      _setAutoApprovedTools((prev: Set<string>) => {
        const next = value(prev)
        autoApprovedToolsRef.current = next
        return next
      })
    } else {
      autoApprovedToolsRef.current = value
      _setAutoApprovedTools(value)
    }
  }, [_setAutoApprovedTools])

  const setSessionModel = useCallback((value: string | null) => {
    sessionModelRef.current = value
    _setSessionModel(value)
  }, [_setSessionModel])

  // Auto-continue: atom is now synced from backend events (not local-only)
  const setAutoContinue = useSetAtom(chatAutoContinueAtom)

  // Debounce ref for sendContinue (prevents double-sends on manual Continue button)
  const continueDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ========================================================================
  // Event handler — processes LIVE events only (no more replay)
  // ========================================================================
  const handleEvent = useCallback((event: ChatEvent & { seq?: number; replaying?: boolean }) => {
    // Mid-stream join: if REST history hasn't loaded yet, buffer most events
    // so they can be replayed AFTER setMessages(history). This prevents
    // setMessages([]) or setMessages(history) from wiping live events.
    // EXCEPTION: streaming_status and partial_text are processed immediately
    // because they provide the instant visual feedback the user expects
    // (seeing the live stream + interrupt button without waiting for REST).
    if (!historyLoadedRef.current && event.type !== 'streaming_status' && event.type !== 'partial_text') {
      pendingEventsRef.current.push(event)
      return
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

    // Auto-approve: if this is a live permission_request and the tool was remembered,
    // auto-respond Allow via WS and show the block as already-approved.
    if (event.type === 'permission_request' && !event.replaying) {
      const toolName = (event as { tool?: string }).tool ?? ''
      if (autoApprovedToolsRef.current.has(toolName)) {
        const toolCallId = (event as { id?: string }).id ?? ''
        // Auto-respond via WS
        const ws = wsRef.current
        if (ws && toolCallId) {
          ws.sendPermissionResponse(toolCallId, true)
        }
        // Still add the block to messages but pre-mark as auto-approved
        // (by not passing through the normal flow — we add a special metadata flag)
        setMessages((prev) => {
          const updated = [...prev]
          let lastMsg = updated[updated.length - 1]
          if (!lastMsg || lastMsg.role !== 'assistant') {
            lastMsg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: new Date() }
            updated.push(lastMsg)
          } else {
            lastMsg = { ...lastMsg, blocks: [...lastMsg.blocks] }
            updated[updated.length - 1] = lastMsg
          }
          const apParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: `Tool "${toolName}" wants to execute`,
            metadata: withParent({
              tool_call_id: toolCallId,
              tool_name: toolName,
              tool_input: (event as { input?: Record<string, unknown> }).input,
              auto_approved: true,
            }, apParent),
          })
          return updated
        })
        return
      }
    }

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
      setIsCompacting(true)
      return
    }

    // permission_decision — stamp the decision onto the matching permission_request block
    if (event.type === 'permission_decision') {
      const data = event.replaying
        ? (event as { data?: Record<string, unknown> }).data ?? event
        : event
      const decisionId = (data as { id?: string }).id
      const allowed = (data as { allow?: boolean }).allow
      if (decisionId) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            blocks: msg.blocks.map((block) => {
              if (block.type === 'permission_request' && block.metadata?.tool_call_id === decisionId) {
                return { ...block, metadata: { ...block.metadata, decided: true, decision: allowed ? 'allowed' : 'denied' } }
              }
              return block
            }),
          })),
        )
      }
      return
    }

    // user_message events from broadcast or replay — add as user message
    if (event.type === 'user_message') {
      // During replay, content is nested in event.data.content
      // During live broadcast, content is at event.content
      const content = event.replaying
        ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content?: string }).content)
        : (event as { content: string }).content
      if (!content) return

      setMessages((prev) => {
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

        // Avoid duplicate: check if ANY recent user message has the same content.
        // This handles mid-stream sends where the optimistic user message is followed
        // by assistant messages before the broadcast arrives from the dequeue.
        for (let i = prev.length - 1; i >= Math.max(0, prev.length - 10); i--) {
          const msg = prev[i]
          if (msg.role === 'user' && msg.blocks[0]?.content === content) {
            return prev
          }
        }
        return [
          ...prev,
          {
            id: nextMessageId(),
            role: 'user',
            blocks: [{ id: nextBlockId(), type: 'text' as const, content }],
            timestamp: new Date(),
          },
        ]
      })
      return
    }

    setMessages((prev) => {
      const updated = [...prev]
      let lastMsg = updated[updated.length - 1]
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: new Date() }
        updated.push(lastMsg)
      } else {
        lastMsg = { ...lastMsg, blocks: [...lastMsg.blocks] }
        updated[updated.length - 1] = lastMsg
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
              lastMsg.blocks.push({
                id: nextBlockId(),
                type: 'text',
                content: text,
                metadata: withParent(undefined, atParent),
              })
            }
          }
          // During live: ignore (content already received via stream_delta)
          break

        case 'thinking': {
          const content = event.replaying
            ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content: string }).content)
            : (event as { content: string }).content
          const thinkParent = getParentToolUseId(event)
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
          const tuTs = new Date().toISOString()

          if (toolName === 'AskUserQuestion') {
            const questions = (toolInput as { questions?: unknown[] })?.questions
            if (questions && questions.length > 0) {
              // Dedup: skip if an ask_user_question block with same tool_call_id already exists
              // (created via the control channel ask_user_question event)
              const isDupe = toolId && lastMsg.blocks.some(
                (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolId,
              )
              if (!isDupe) {
                lastMsg.blocks.push({
                  id: nextBlockId(),
                  type: 'ask_user_question',
                  content: (questions as { question: string }[]).map((q) => q.question).join('\n'),
                  metadata: withCreatedAt(withParent({
                    tool_call_id: toolId,
                    questions,
                  }, tuParent), tuTs),
                })
              }
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'tool_use',
              content: toolName,
              metadata: withCreatedAt(withParent({
                tool_call_id: toolId,
                tool_name: toolName,
                tool_input: toolInput,
              }, tuParent), tuTs),
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
          // Calculate tool duration from matching tool_use block
          let trDurationMs: number | undefined
          if (toolCallId) {
            const now = Date.now()
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

        case 'tool_cancelled': {
          const tcData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const tcId = (tcData as { id?: string }).id
          const tcParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_result',
            content: 'Cancelled by user',
            metadata: withParent({ tool_call_id: tcId, is_cancelled: true }, tcParent),
          })
          break
        }

        case 'permission_request': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const prParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: `Tool "${(data as { tool?: string }).tool}" wants to execute`,
            metadata: withParent({
              tool_call_id: (data as { id?: string }).id,
              tool_name: (data as { tool?: string }).tool,
              tool_input: (data as { input?: Record<string, unknown> }).input,
            }, prParent),
          })
          break
        }

        case 'input_request': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const irParent = getParentToolUseId(event)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'input_request',
            content: (data as { prompt?: string }).prompt ?? '',
            metadata: withParent({ request_id: (data as { prompt?: string }).prompt, options: (data as { options?: string[] }).options }, irParent),
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
                metadata: withParent({ tool_call_id: toolCallId, questions }, auqParent),
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
            content: (data as { message?: string }).message ?? 'Unknown error',
            metadata: withParent(undefined, errParent),
          })
          if (!event.replaying) {
            setIsStreaming(false)
          }
          break
        }

        case 'partial_text': {
          // Mid-stream join: bulk text accumulated before this client connected
          const content = event.replaying
            ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content: string }).content)
            : (event as { content: string }).content
          const ptParent = getParentToolUseId(event)
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
          const newMode = (event as { mode?: string }).mode
          if (newMode) {
            setPermissionOverride(newMode as PermissionMode)
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
            content: 'Auto-continuing...',
            metadata: { delay_ms: delayMs, auto: true },
          })
          if (!event.replaying) {
            setIsStreaming(true) // backend will send a new stream shortly
          }
          break
        }

        case 'model_changed': {
          const mcData = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const newModel = (mcData as { model?: string }).model ?? 'unknown'
          // Update the session model atom (server confirmed the change)
          setSessionModel(newModel)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'model_changed',
            content: `Model changed to ${newModel}`,
            metadata: { model: newModel },
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
          // Dedup: only show the first system_init per conversation
          const alreadyHasSystemInit = updated.some((m) =>
            m.blocks.some((b) => b.type === 'system_init'),
          )
          if (!alreadyHasSystemInit) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'system_init',
              content: 'Session initialized',
              metadata: {
                model: siModel,
                tools_count: siTools?.length ?? 0,
                mcp_servers_count: siMcpServers?.length ?? 0,
                permission_mode: siPermMode,
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
          const rCost = (rData as { cost_usd?: number }).cost_usd
          if (rDuration != null) lastMsg.duration_ms = rDuration
          if (rCost != null) lastMsg.cost_usd = rCost

          if (rSubtype === 'error_max_turns') {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'result_max_turns',
              content: rNumTurns
                ? `Maximum turns reached (${rNumTurns} turns)`
                : 'Maximum turns reached',
              metadata: { num_turns: rNumTurns },
            })
          } else if (rSubtype === 'error_during_execution') {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'result_error',
              content: rResultText ?? 'An execution error occurred',
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
      }

      return updated
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tracked setters are stable (useCallback with stable deps)
  }, [setIsStreaming, setPermissionOverride, setSessionModel, setAutoContinue, setIsCompacting])

  // ========================================================================
  // Setup WS callbacks
  // ========================================================================
  useEffect(() => {
    const ws = getWs()
    ws.setCallbacks({
      onEvent: handleEvent,
      onStatusChange: setWsStatus,
      onReplayComplete: () => {
        setIsReplaying(false)
        setIsLoadingHistory(false)
      },
    })
  }, [getWs, handleEvent, setWsStatus, setIsReplaying])

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

    // First-send path: the user just sent the first message of a new conversation.
    // The optimistic user message is already in `messages` — do NOT reset it.
    // Just connect the WS for live events and bail out.
    if (isFirstSendRef.current) {
      isFirstSendRef.current = false
      paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
      setHasOlderMessages(false)
      ws.connect(sessionId, Number.MAX_SAFE_INTEGER)
      return
    }

    // Only load if not already connected to this session
    if (ws.sessionId === sessionId && ws.status !== 'disconnected') return

    let cancelled = false

    setIsLoadingHistory(true)
    setIsReplaying(true)
    setMessages([])
    paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
    setHasOlderMessages(false)

    // Prepare the event buffer: WS events arriving while REST is loading
    // will be queued in pendingEventsRef and replayed after setMessages().
    historyLoadedRef.current = false
    pendingEventsRef.current = []

    // Phase 1: Connect WS IMMEDIATELY for live streaming (parallel with REST).
    // This eliminates the latency of the old sequential approach where
    // the WS only connected after 2 REST calls.
    // The WS delivers the mid-stream snapshot (partial_text, streaming_events,
    // streaming_status) instantly — the user sees the live stream right away.
    ws.connect(sessionId, Number.MAX_SAFE_INTEGER)

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

        return loadOffsetPromise.then(({ loadOffset }) =>
        chatApi.getMessages(sessionId, { limit: PAGE_SIZE, offset: loadOffset })
          .then((data) => {
            if (cancelled) return

            const historyMessages = historyEventsToMessages(data.messages)
            setMessages(historyMessages)

            const loadedCount = data.messages.length
            const endOffset = loadOffset + loadedCount

            // Track the loaded window boundaries
            paginationRef.current = {
              offset: loadOffset,
              tailOffset: endOffset,
              totalCount: data.total_count,
            }
            setHasOlderMessages(loadOffset > 0)
            setHasNewerMessages(endOffset < data.total_count)
            isAtTailRef.current = endOffset >= data.total_count
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
        )
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
        const olderMessages = historyEventsToMessages(data.messages)

        // Prepend older messages to the beginning
        setMessages((prev) => [...olderMessages, ...prev])

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
        const newerMessages = historyEventsToMessages(data.messages)

        // Append newer messages to the end
        setMessages((prev) => [...prev, ...newerMessages])

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
      const data = await chatApi.getMessages(sessionId, { limit: PAGE_SIZE, offset: 0 })
      const total = data.total_count
      const tailOffset = Math.max(0, total - PAGE_SIZE)

      const tailData = tailOffset > 0
        ? await chatApi.getMessages(sessionId, { limit: PAGE_SIZE, offset: tailOffset })
        : data

      const historyMessages = historyEventsToMessages(tailData.messages)
      setMessages(historyMessages)

      const loadedCount = tailData.messages.length
      const endOffset = tailOffset + loadedCount
      paginationRef.current = {
        offset: tailOffset,
        tailOffset: endOffset,
        totalCount: tailData.total_count,
      }
      setHasOlderMessages(tailOffset > 0)
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

  const sendMessage = useCallback(async (text: string, options?: SendMessageOptions) => {
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
        id: nextMessageId(),
        role: 'user',
        blocks: [{ id: nextBlockId(), type: 'text', content: text }],
        timestamp: new Date(),
      })
      return updated
    })

    if (!sessionId) {
      // First message — create session via REST, then connect WS
      setIsSending(true)
      setIsStreaming(true)
      try {
        const response = await chatApi.createSession({
          message: text,
          cwd: options!.cwd,
          project_slug: options?.projectSlug,
          permission_mode: options?.permissionMode ?? permissionOverrideRef.current ?? undefined,
          model: options?.model ?? sessionModelRef.current ?? undefined,
        })
        // Signal that the upcoming sessionId change is from a first send,
        // so the auto-connect useEffect should NOT reset messages.
        isFirstSendRef.current = true
        setSessionId(response.session_id)
        // Populate session metadata from the options used to create the session
        if (options) {
          setSessionMeta({ cwd: options.cwd, projectSlug: options.projectSlug })
        }
        // Reset override after use
        if (permissionOverrideRef.current) setPermissionOverride(null)
      } finally {
        setIsSending(false)
      }
      // WS will auto-connect via the useEffect above when sessionId changes
    } else {
      // Follow-up message — send via WS
      const ws = getWs()
      setIsStreaming(true)
      ws.sendUserMessage(text)
    }
  }, [sessionId, setSessionId, setIsStreaming, getWs, setPermissionOverride])

  /**
   * Send "Continue" after max_turns — adds a discreet inline indicator instead of a user bubble.
   * The backend still receives a normal user_message with content "Continue".
   */
  const sendContinue = useCallback(() => {
    if (!sessionId) return
    // Debounce: prevent double-sends within 300ms
    if (continueDebounceRef.current) return
    continueDebounceRef.current = setTimeout(() => { continueDebounceRef.current = null }, 300)

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

    // Send via WS as a normal user_message
    const ws = getWs()
    setIsStreaming(true)
    ws.sendUserMessage('Continue')
  }, [sessionId, getWs, setIsStreaming])

  /** Toggle auto-continue on the backend (sends WS message, atom synced from backend event) */
  const changeAutoContinue = useCallback((enabled: boolean) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendSetAutoContinue(enabled)
    // Optimistically update local state (server will confirm via auto_continue_state_changed event)
    setAutoContinue(enabled)
  }, [sessionId, getWs, setAutoContinue])

  const respondPermission = useCallback(async (
    toolCallId: string,
    allowed: boolean,
    remember?: { toolName: string },
  ) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendPermissionResponse(toolCallId, allowed)
    // If "Remember for this session" was checked and user clicked Allow,
    // add the tool name to the auto-approved set.
    if (remember && allowed) {
      setAutoApprovedTools((prev: Set<string>) => {
        const next = new Set<string>(prev)
        next.add(remember.toolName)
        return next
      })
    }
  }, [sessionId, getWs, setAutoApprovedTools])

  const respondInput = useCallback(async (requestId: string, response: string) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendInputResponse(requestId, response)

    // Stamp the block's metadata with the response so it persists across
    // page reloads and renders as read-only in history/replay.
    setMessages((prev) =>
      prev.map((msg) => {
        const blockIdx = msg.blocks.findIndex(
          (b) => b.type === 'ask_user_question' && (b.metadata?.tool_call_id === requestId || b.id === requestId),
        )
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
      }),
    )
  }, [sessionId, getWs])

  const interrupt = useCallback(async () => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendInterrupt()
    // Don't set isStreaming=false here — wait for the 'result' event
  }, [sessionId, getWs])

  const newSession = useCallback(() => {
    const ws = getWs()
    ws.disconnect()
    setSessionId(null)
    setIsStreaming(false)
    setIsReplaying(false)
    setMessages([])
    setSessionMeta(null)
    setHasOlderMessages(false)
    setHasNewerMessages(false)
    isAtTailRef.current = true
    targetTimestampRef.current = null
    pendingTailEventsRef.current = []
    setHasLiveActivity(false)
    paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }
    // Reset session-scoped state
    setAutoApprovedTools(new Set<string>())
    setPermissionOverride(null)
    setSessionModel(null)
    setAutoContinue(false)
    setDraftInput('')
  }, [getWs, setSessionId, setIsStreaming, setIsReplaying, setAutoApprovedTools, setPermissionOverride, setSessionModel, setAutoContinue, setDraftInput])

  const changePermissionMode = useCallback((mode: PermissionMode) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendSetPermissionMode(mode)
    // Optimistically update local state (server will confirm via permission_mode_changed event)
    setPermissionOverride(mode)
  }, [sessionId, getWs, setPermissionOverride])

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
    setDraftInput('')
    paginationRef.current = { offset: 0, tailOffset: 0, totalCount: 0 }

    // Fetch session metadata (cwd, project, permission mode) for display in header
    chatApi.getSession(sid).then((session) => {
      setSessionMeta({ cwd: session.cwd, projectSlug: session.project_slug })
      // Restore the session's permission mode override
      setPermissionOverride((session.permission_mode as PermissionMode) ?? null)
      // Restore the session's model
      setSessionModel(session.model ?? null)
    }).catch(() => {
      // Non-critical — header just won't show cwd
      setSessionMeta(null)
    })

    // WS will auto-connect via the useEffect above when sessionId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPermissionOverride and setSessionModel are stable Jotai setters
  }, [sessionId, getWs, setSessionId, setIsStreaming, setIsReplaying])

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
  }
}
