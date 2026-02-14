import { useState, useCallback, useRef, useEffect } from 'react'
import { useAtom } from 'jotai'
import { chatSessionIdAtom, chatStreamingAtom, chatWsStatusAtom, chatReplayingAtom, chatSessionPermissionOverrideAtom, chatAutoApprovedToolsAtom } from '@/atoms'
import { chatApi, ChatWebSocket } from '@/services'
import type { ChatMessage, ChatEvent, PermissionMode } from '@/types'

let blockIdCounter = 0
function nextBlockId() {
  return `block-${++blockIdCounter}`
}

let messageIdCounter = 0
function nextMessageId() {
  return `msg-${++messageIdCounter}`
}

/** Number of messages to load per page via REST */
const PAGE_SIZE = 50

export interface SendMessageOptions {
  cwd: string
  projectSlug?: string
  permissionMode?: PermissionMode
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

  function lastAssistant(): ChatMessage {
    let msg = messages[messages.length - 1]
    if (!msg || msg.role !== 'assistant') {
      msg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: new Date() }
      messages.push(msg)
    }
    return msg
  }

  for (const evt of events) {
    const type = evt.type as string
    const createdAt = evt.created_at ? new Date(evt.created_at * 1000) : new Date()

    switch (type) {
      case 'user_message': {
        messages.push({
          id: evt.id || nextMessageId(),
          role: 'user',
          blocks: [{ id: nextBlockId(), type: 'text', content: evt.content ?? '' }],
          timestamp: createdAt,
        })
        break
      }

      case 'assistant_text': {
        const content = evt.content ?? ''
        if (content) {
          const msg = lastAssistant()
          msg.blocks.push({ id: nextBlockId(), type: 'text', content })
        }
        break
      }

      case 'thinking': {
        const msg = lastAssistant()
        msg.blocks.push({ id: nextBlockId(), type: 'thinking', content: evt.content ?? '' })
        break
      }

      case 'tool_use': {
        const msg = lastAssistant()
        const toolName = evt.tool ?? ''
        const toolId = evt.id ?? ''
        const toolInput = evt.input ?? {}

        if (toolName === 'AskUserQuestion') {
          const questions = (toolInput as { questions?: { question: string }[] })?.questions
          if (questions && questions.length > 0) {
            msg.blocks.push({
              id: nextBlockId(),
              type: 'ask_user_question',
              content: questions.map((q: { question: string }) => q.question).join('\n'),
              metadata: { tool_call_id: toolId, questions },
            })
          }
        } else {
          msg.blocks.push({
            id: nextBlockId(),
            type: 'tool_use',
            content: toolName,
            metadata: { tool_call_id: toolId, tool_name: toolName, tool_input: toolInput },
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
        const msg = lastAssistant()
        const result = evt.result
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'tool_result',
          content: resultStr,
          metadata: { tool_call_id: evt.id, is_error: evt.is_error },
        })
        break
      }

      case 'permission_request': {
        const msg = lastAssistant()
        msg.blocks.push({
          id: nextBlockId(),
          type: 'permission_request',
          content: `Tool "${evt.tool}" wants to execute`,
          metadata: { tool_call_id: evt.id, tool_name: evt.tool, tool_input: evt.input },
        })
        break
      }

      case 'input_request': {
        const msg = lastAssistant()
        msg.blocks.push({
          id: nextBlockId(),
          type: 'input_request',
          content: evt.prompt ?? '',
          metadata: { request_id: evt.prompt, options: evt.options },
        })
        break
      }

      case 'ask_user_question': {
        const msg = lastAssistant()
        const questions = evt.questions as { question: string }[] | undefined
        if (questions && questions.length > 0) {
          msg.blocks.push({
            id: nextBlockId(),
            type: 'ask_user_question',
            content: questions.map((q: { question: string }) => q.question).join('\n'),
            metadata: { questions },
          })
        }
        break
      }

      case 'error': {
        const msg = lastAssistant()
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: evt.message ?? 'Unknown error',
        })
        break
      }

      case 'result':
        // Turn completion — skip (no UI block needed)
        break

      default:
        // Unknown event type — skip
        break
    }
  }

  return messages
}

export function useChat() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [isStreaming, setIsStreaming] = useAtom(chatStreamingAtom)
  const [wsStatus, setWsStatus] = useAtom(chatWsStatusAtom)
  const [isReplaying, setIsReplaying] = useAtom(chatReplayingAtom)
  const [permissionOverride, setPermissionOverride] = useAtom(chatSessionPermissionOverrideAtom)
  const [autoApprovedTools, setAutoApprovedTools] = useAtom(chatAutoApprovedToolsAtom)
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
  const paginationRef = useRef({ offset: 0, totalCount: 0 })

  // Lazily create the ChatWebSocket singleton per hook instance
  const getWs = useCallback(() => {
    if (!wsRef.current) {
      wsRef.current = new ChatWebSocket()
    }
    return wsRef.current
  }, [])

  // Ref for auto-approved tools to avoid stale closures in handleEvent
  const autoApprovedToolsRef = useRef(autoApprovedTools)
  useEffect(() => {
    autoApprovedToolsRef.current = autoApprovedTools
  }, [autoApprovedTools])

  // ========================================================================
  // Event handler — processes LIVE events only (no more replay)
  // ========================================================================
  const handleEvent = useCallback((event: ChatEvent & { seq?: number; replaying?: boolean }) => {
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
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: `Tool "${toolName}" wants to execute`,
            metadata: {
              tool_call_id: toolCallId,
              tool_name: toolName,
              tool_input: (event as { input?: Record<string, unknown> }).input,
              auto_approved: true,
            },
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

    // user_message events from broadcast or replay — add as user message
    if (event.type === 'user_message') {
      // During replay, content is nested in event.data.content
      // During live broadcast, content is at event.content
      const content = event.replaying
        ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content?: string }).content)
        : (event as { content: string }).content
      if (!content) return

      setMessages((prev) => {
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
          if (lastBlock && lastBlock.type === 'text') {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + deltaText,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content: deltaText,
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
              lastMsg.blocks.push({
                id: nextBlockId(),
                type: 'text',
                content: text,
              })
            }
          }
          // During live: ignore (content already received via stream_delta)
          break

        case 'thinking': {
          const content = event.replaying
            ? ((event as { data?: { content?: string } }).data?.content ?? (event as { content: string }).content)
            : (event as { content: string }).content
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
          if (!event.replaying && lastBlock && lastBlock.type === 'thinking') {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + content,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'thinking',
              content: content,
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

          if (toolName === 'AskUserQuestion') {
            const questions = (toolInput as { questions?: unknown[] })?.questions
            if (questions && questions.length > 0) {
              lastMsg.blocks.push({
                id: nextBlockId(),
                type: 'ask_user_question',
                content: (questions as { question: string }[]).map((q) => q.question).join('\n'),
                metadata: {
                  tool_call_id: toolId,
                  questions,
                },
              })
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'tool_use',
              content: toolName,
              metadata: {
                tool_call_id: toolId,
                tool_name: toolName,
                tool_input: toolInput,
              },
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
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_result',
            content: resultStr,
            metadata: {
              tool_call_id: toolCallId,
              is_error: (data as { is_error?: boolean }).is_error,
            },
          })
          break
        }

        case 'permission_request': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: `Tool "${(data as { tool?: string }).tool}" wants to execute`,
            metadata: {
              tool_call_id: (data as { id?: string }).id,
              tool_name: (data as { tool?: string }).tool,
              tool_input: (data as { input?: Record<string, unknown> }).input,
            },
          })
          break
        }

        case 'input_request': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'input_request',
            content: (data as { prompt?: string }).prompt ?? '',
            metadata: { request_id: (data as { prompt?: string }).prompt, options: (data as { options?: string[] }).options },
          })
          break
        }

        case 'ask_user_question': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          const questions = (data as { questions?: { question: string }[] }).questions
          if (questions && questions.length > 0) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'ask_user_question',
              content: questions.map((q) => q.question).join('\n'),
              metadata: { questions },
            })
          }
          break
        }

        case 'error': {
          const data = event.replaying
            ? (event as { data?: Record<string, unknown> }).data ?? event
            : event
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'error',
            content: (data as { message?: string }).message ?? 'Unknown error',
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
          if (content) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content,
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

        case 'result':
          // Only stop streaming on LIVE result events, not replayed ones.
          // During replay (Phase 1 or Phase 1.5), a historical result event
          // must not override the streaming_status sent for mid-stream join.
          if (!event.replaying) {
            setIsStreaming(false)
          }
          break
      }

      return updated
    })
  }, [setIsStreaming])

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
      paginationRef.current = { offset: 0, totalCount: 0 }
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
    paginationRef.current = { offset: 0, totalCount: 0 }
    setHasOlderMessages(false)

    // Phase 1: Load the most recent messages via REST.
    // The API uses chronological pagination (offset 0 = oldest), so we first
    // need to figure out the right offset to get the last page of messages.
    // We do a small initial request to get total_count, then load the tail.
    chatApi
      .getMessages(sessionId, { limit: 1, offset: 0 })
      .then((meta) => {
        if (cancelled) return
        const total = meta.total_count
        if (total === 0) {
          setMessages([])
          paginationRef.current = { offset: 0, totalCount: 0 }
          setHasOlderMessages(false)
          setIsLoadingHistory(false)
          setIsReplaying(false)
          ws.connect(sessionId, Number.MAX_SAFE_INTEGER)
          return
        }

        // Load the last PAGE_SIZE messages (the tail of the conversation)
        const tailOffset = Math.max(0, total - PAGE_SIZE)
        return chatApi.getMessages(sessionId, { limit: PAGE_SIZE, offset: tailOffset })
          .then((data) => {
            if (cancelled) return

            const historyMessages = historyEventsToMessages(data.messages)
            setMessages(historyMessages)

            // Track how far back we've loaded (tailOffset = messages before this page)
            paginationRef.current = {
              offset: tailOffset,
              totalCount: data.total_count,
            }
            setHasOlderMessages(tailOffset > 0)
            setIsLoadingHistory(false)
            setIsReplaying(false)

            // Phase 2: Connect WS for live events only (skip replay)
            ws.connect(sessionId, Number.MAX_SAFE_INTEGER)
          })
      })
      .catch(() => {
        if (cancelled) return
        // Fallback: connect WS with full replay if REST fails
        setIsLoadingHistory(false)
        ws.connect(sessionId, 0)
      })

    return () => {
      cancelled = true
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

        // Move the offset cursor back
        paginationRef.current = {
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
  // Actions
  // ========================================================================

  const sendMessage = useCallback(async (text: string, options?: SendMessageOptions) => {
    // Add user message to UI immediately (optimistic)
    setMessages((prev) => [
      ...prev,
      {
        id: nextMessageId(),
        role: 'user',
        blocks: [{ id: nextBlockId(), type: 'text', content: text }],
        timestamp: new Date(),
      },
    ])

    if (!sessionId) {
      // First message — create session via REST, then connect WS
      setIsSending(true)
      setIsStreaming(true)
      try {
        const response = await chatApi.createSession({
          message: text,
          cwd: options!.cwd,
          project_slug: options?.projectSlug,
          permission_mode: options?.permissionMode ?? permissionOverride ?? undefined,
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
        if (permissionOverride) setPermissionOverride(null)
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
  }, [sessionId, setSessionId, setIsStreaming, getWs, permissionOverride, setPermissionOverride])

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

  const respondInput = useCallback(async (_requestId: string, response: string) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendInputResponse(_requestId, response)
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
    paginationRef.current = { offset: 0, totalCount: 0 }
    // Reset session-scoped state
    setAutoApprovedTools(new Set<string>())
    setPermissionOverride(null)
  }, [getWs, setSessionId, setIsStreaming, setIsReplaying, setAutoApprovedTools, setPermissionOverride])

  const changePermissionMode = useCallback((mode: PermissionMode) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendSetPermissionMode(mode)
    // Optimistically update local state (server will confirm via permission_mode_changed event)
    setPermissionOverride(mode)
  }, [sessionId, getWs, setPermissionOverride])

  const loadSession = useCallback(async (sid: string) => {
    // Guard: if already on this session, do nothing (avoid WS disconnect/reconnect loop)
    if (sid === sessionId) return

    const ws = getWs()
    ws.disconnect()
    setSessionId(sid)
    setIsStreaming(false)
    setMessages([])
    setIsLoadingHistory(true)
    setIsReplaying(true)
    setHasOlderMessages(false)
    paginationRef.current = { offset: 0, totalCount: 0 }

    // Fetch session metadata (cwd, project, permission mode) for display in header
    chatApi.getSession(sid).then((session) => {
      setSessionMeta({ cwd: session.cwd, projectSlug: session.project_slug })
      // Restore the session's permission mode override
      setPermissionOverride((session.permission_mode as PermissionMode) ?? null)
    }).catch(() => {
      // Non-critical — header just won't show cwd
      setSessionMeta(null)
    })

    // WS will auto-connect via the useEffect above when sessionId changes
  }, [sessionId, getWs, setSessionId, setIsStreaming, setIsReplaying])

  return {
    messages,
    isStreaming,
    isSending,
    isLoadingHistory,
    isLoadingOlder,
    isReplaying,
    hasOlderMessages,
    wsStatus,
    sessionId,
    sessionMeta,
    sendMessage,
    respondPermission,
    respondInput,
    interrupt,
    newSession,
    loadSession,
    loadOlderMessages,
    changePermissionMode,
  }
}
