import { useState, useCallback, useRef, useEffect } from 'react'
import { useAtom } from 'jotai'
import { chatSessionIdAtom, chatStreamingAtom, chatWsStatusAtom, chatReplayingAtom } from '@/atoms'
import { chatApi, ChatWebSocket } from '@/services'
import type { ChatMessage, ChatEvent, MessageHistoryItem } from '@/types'

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
}

/**
 * Convert flat MessageHistoryItem (from REST) into the ChatMessage UI format.
 * Groups consecutive same-role messages into a single ChatMessage.
 */
function historyToMessages(items: MessageHistoryItem[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const item of items) {
    messages.push({
      id: item.id || nextMessageId(),
      role: item.role,
      blocks: [{ id: nextBlockId(), type: 'text', content: item.content }],
      timestamp: new Date(item.created_at * 1000),
    })
  }
  return messages
}

export function useChat() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [isStreaming, setIsStreaming] = useAtom(chatStreamingAtom)
  const [wsStatus, setWsStatus] = useAtom(chatWsStatusAtom)
  const [isReplaying, setIsReplaying] = useAtom(chatReplayingAtom)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const wsRef = useRef<ChatWebSocket | null>(null)

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

  // ========================================================================
  // Event handler — processes LIVE events only (no more replay)
  // ========================================================================
  const handleEvent = useCallback((event: ChatEvent & { seq?: number; replaying?: boolean }) => {
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
          if (lastBlock && lastBlock.type === 'text') {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + (event as { text: string }).text,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content: (event as { text: string }).text,
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
    // Only load if not already connected to this session
    if (ws.sessionId === sessionId && ws.status !== 'disconnected') return

    let cancelled = false

    setIsLoadingHistory(true)
    setIsReplaying(true)
    setMessages([])
    paginationRef.current = { offset: 0, totalCount: 0 }
    setHasOlderMessages(false)

    // Phase 1: Load latest messages via REST
    chatApi
      .getMessages(sessionId, { limit: PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (cancelled) return

        // REST returns messages from newest (offset 0) in chronological order
        const historyMessages = historyToMessages(data.messages)
        setMessages(historyMessages)

        // Track pagination state
        const loaded = data.messages.length
        paginationRef.current = {
          offset: loaded,
          totalCount: data.total_count,
        }
        setHasOlderMessages(data.has_more)
        setIsLoadingHistory(false)
        setIsReplaying(false)

        // Phase 2: Connect WS for live events only (skip replay)
        // Use a very high last_event to skip all historical events
        // The WS will only deliver new events after this seq
        ws.connect(sessionId, Number.MAX_SAFE_INTEGER)
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
      const { offset } = paginationRef.current
      const data = await chatApi.getMessages(sessionId, {
        limit: PAGE_SIZE,
        offset,
      })

      if (data.messages.length > 0) {
        const olderMessages = historyToMessages(data.messages)

        // Prepend older messages to the beginning
        setMessages((prev) => [...olderMessages, ...prev])

        // Update pagination
        paginationRef.current = {
          offset: offset + data.messages.length,
          totalCount: data.total_count,
        }
        setHasOlderMessages(data.has_more)
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
      const response = await chatApi.createSession({
        message: text,
        cwd: options!.cwd,
        project_slug: options?.projectSlug,
      })
      setSessionId(response.session_id)
      setIsStreaming(true)
      // WS will auto-connect via the useEffect above when sessionId changes
    } else {
      // Follow-up message — send via WS
      const ws = getWs()
      setIsStreaming(true)
      ws.sendUserMessage(text)
    }
  }, [sessionId, setSessionId, setIsStreaming, getWs])

  const respondPermission = useCallback(async (toolCallId: string, allowed: boolean) => {
    if (!sessionId) return
    const ws = getWs()
    ws.sendPermissionResponse(toolCallId, allowed)
  }, [sessionId, getWs])

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
    setHasOlderMessages(false)
    paginationRef.current = { offset: 0, totalCount: 0 }
  }, [getWs, setSessionId, setIsStreaming, setIsReplaying])

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
    // WS will auto-connect via the useEffect above when sessionId changes
  }, [sessionId, getWs, setSessionId, setIsStreaming, setIsReplaying])

  return {
    messages,
    isStreaming,
    isLoadingHistory,
    isLoadingOlder,
    isReplaying,
    hasOlderMessages,
    wsStatus,
    sessionId,
    sendMessage,
    respondPermission,
    respondInput,
    interrupt,
    newSession,
    loadSession,
    loadOlderMessages,
  }
}
