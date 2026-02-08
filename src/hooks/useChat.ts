import { useState, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { chatSessionIdAtom, chatStreamingAtom } from '@/atoms'
import { chatApi, subscribeToChatStream } from '@/services'
import type { ChatMessage, ChatEvent, ClientMessage, MessageHistoryItem } from '@/types'

let blockIdCounter = 0
function nextBlockId() {
  return `block-${++blockIdCounter}`
}

let messageIdCounter = 0
function nextMessageId() {
  return `msg-${++messageIdCounter}`
}

function transformHistoryItem(item: MessageHistoryItem): ChatMessage {
  return {
    id: item.id,
    role: item.role,
    blocks: [
      {
        id: `block-${item.id}`,
        type: 'text',
        content: item.content,
      },
    ],
    timestamp: new Date(item.created_at * 1000), // Unix timestamp → JS Date (ms)
  }
}

export interface SendMessageOptions {
  cwd: string
  projectSlug?: string
}

export function useChat() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [isStreaming, setIsStreaming] = useAtom(chatStreamingAtom)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const handleEvent = useCallback((event: ChatEvent) => {
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
          // Only handle stream_delta, ignore assistant_text (sent at end with full text, would duplicate)
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
          if (lastBlock && lastBlock.type === 'text') {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + event.text,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content: event.text,
            })
          }
          break
        }

        case 'assistant_text':
          // Ignore: content already received via stream_delta events
          break

        case 'thinking': {
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
          if (lastBlock && lastBlock.type === 'thinking') {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + event.content,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'thinking',
              content: event.content,
            })
          }
          break
        }

        case 'tool_use':
          // Special handling for AskUserQuestion tool
          if (event.tool === 'AskUserQuestion') {
            const questions = (event.input as { questions?: unknown[] })?.questions
            if (questions && questions.length > 0) {
              lastMsg.blocks.push({
                id: nextBlockId(),
                type: 'ask_user_question',
                content: (questions as { question: string }[]).map((q) => q.question).join('\n'),
                metadata: {
                  tool_call_id: event.id,
                  questions,
                },
              })
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'tool_use',
              content: event.tool,
              metadata: {
                tool_call_id: event.id,
                tool_name: event.tool,
                tool_input: event.input,
              },
            })
          }
          break

        case 'tool_result': {
          const resultStr = typeof event.result === 'string'
            ? event.result
            : JSON.stringify(event.result)
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_result',
            content: resultStr,
            metadata: {
              tool_call_id: event.id,
              is_error: event.is_error,
            },
          })
          break
        }

        case 'permission_request':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: `Tool "${event.tool}" wants to execute`,
            metadata: {
              tool_call_id: event.id,
              tool_name: event.tool,
              tool_input: event.input,
            },
          })
          break

        case 'input_request':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'input_request',
            content: event.prompt,
            metadata: { request_id: event.prompt, options: event.options },
          })
          break

        case 'ask_user_question':
          if (event.questions && event.questions.length > 0) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'ask_user_question',
              content: event.questions.map((q) => q.question).join('\n'),
              metadata: { questions: event.questions },
            })
          }
          break

        case 'error':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'error',
            content: event.message,
          })
          break

        case 'result':
          setIsStreaming(false)
          break
      }

      return updated
    })
  }, [setIsStreaming])

  const subscribe = useCallback((sid: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
    }

    setIsStreaming(true)
    unsubscribeRef.current = subscribeToChatStream(
      sid,
      handleEvent,
      () => {
        setIsStreaming(false)
      },
    )
  }, [handleEvent, setIsStreaming])

  const sendMessage = useCallback(async (text: string, options?: SendMessageOptions) => {
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
      // First message — create session with project context
      const response = await chatApi.createSession({
        message: text,
        cwd: options!.cwd,
        project_slug: options?.projectSlug,
      })
      setSessionId(response.session_id)
      subscribe(response.session_id)
    } else {
      // Follow-up message
      const message: ClientMessage = { type: 'user_message', content: text }
      await chatApi.sendMessage(sessionId, message)
      subscribe(sessionId)
    }
  }, [sessionId, setSessionId, subscribe])

  const respondPermission = useCallback(async (toolCallId: string, allowed: boolean) => {
    if (!sessionId) return
    const message: ClientMessage = { type: 'permission_response', tool_call_id: toolCallId, allowed }
    await chatApi.sendMessage(sessionId, message)
  }, [sessionId])

  const respondInput = useCallback(async (_requestId: string, response: string) => {
    if (!sessionId) return
    const message: ClientMessage = { type: 'input_response', content: response }
    await chatApi.sendMessage(sessionId, message)
  }, [sessionId])

  const interrupt = useCallback(async () => {
    if (!sessionId) return
    await chatApi.interrupt(sessionId)
    setIsStreaming(false)
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
  }, [sessionId, setIsStreaming])

  const newSession = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setSessionId(null)
    setIsStreaming(false)
    setMessages([])
  }, [setSessionId, setIsStreaming])

  const loadSession = useCallback(async (sid: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setSessionId(sid)
    setIsStreaming(false)
    setMessages([])
    setIsLoadingHistory(true)

    try {
      const response = await chatApi.getMessages(sid)
      // Sort by created_at ascending (backend may return in reverse order)
      const sorted = [...response.messages].sort((a, b) => a.created_at - b.created_at)
      const loadedMessages = sorted.map(transformHistoryItem)
      setMessages(loadedMessages)
    } catch (error) {
      console.error('Failed to load message history:', error)
      // Keep messages empty on error
    } finally {
      setIsLoadingHistory(false)
    }
  }, [setSessionId, setIsStreaming])

  return {
    messages,
    isStreaming,
    isLoadingHistory,
    sessionId,
    sendMessage,
    respondPermission,
    respondInput,
    interrupt,
    newSession,
    loadSession,
  }
}
