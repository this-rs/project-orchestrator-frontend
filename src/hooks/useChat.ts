import { useState, useCallback, useRef } from 'react'
import { useAtom } from 'jotai'
import { chatSessionIdAtom, chatStreamingAtom } from '@/atoms'
import { chatApi, subscribeToChatStream } from '@/services'
import type { ChatMessage, ContentBlock, ChatEvent, ClientMessage } from '@/types'

let blockIdCounter = 0
function nextBlockId() {
  return `block-${++blockIdCounter}`
}

let messageIdCounter = 0
function nextMessageId() {
  return `msg-${++messageIdCounter}`
}

export function useChat() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [isStreaming, setIsStreaming] = useAtom(chatStreamingAtom)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const handleEvent = useCallback((event: ChatEvent) => {
    setMessages((prev) => {
      const updated = [...prev]
      // Find or create the current assistant message (the last one with role 'assistant')
      let lastMsg = updated[updated.length - 1]
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: new Date() }
        updated.push(lastMsg)
      } else {
        lastMsg = { ...lastMsg, blocks: [...lastMsg.blocks] }
        updated[updated.length - 1] = lastMsg
      }

      switch (event.type) {
        case 'assistant_text': {
          // Merge consecutive text blocks
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

        case 'thinking': {
          // Merge consecutive thinking blocks
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
          if (lastBlock && lastBlock.type === 'thinking') {
            lastMsg.blocks[lastMsg.blocks.length - 1] = {
              ...lastBlock,
              content: lastBlock.content + event.text,
            }
          } else {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'thinking',
              content: event.text,
            })
          }
          break
        }

        case 'tool_use':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_use',
            content: event.tool_name,
            metadata: {
              tool_call_id: event.tool_call_id,
              tool_name: event.tool_name,
              tool_input: event.tool_input,
            },
          })
          break

        case 'tool_result': {
          // Try to find matching tool_use block and add result as a separate block
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'tool_result',
            content: event.result,
            metadata: {
              tool_call_id: event.tool_call_id,
              is_error: event.is_error,
            },
          })
          break
        }

        case 'permission_request':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'permission_request',
            content: event.description,
            metadata: {
              tool_call_id: event.tool_call_id,
              tool_name: event.tool_name,
              tool_input: event.tool_input,
            },
          })
          break

        case 'input_request':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'input_request',
            content: event.prompt,
            metadata: { request_id: event.request_id },
          })
          break

        case 'error':
          lastMsg.blocks.push({
            id: nextBlockId(),
            type: 'error',
            content: event.message,
          })
          break

        case 'result':
          // Final event: streaming is done
          setIsStreaming(false)
          if (event.cost_usd || event.duration_ms) {
            lastMsg.blocks.push({
              id: nextBlockId(),
              type: 'text',
              content: '',
              metadata: {
                cost_usd: event.cost_usd,
                duration_ms: event.duration_ms,
              },
            })
          }
          break
      }

      return updated
    })
  }, [setIsStreaming])

  const subscribe = useCallback((sid: string) => {
    // Clean up previous subscription
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

  const sendMessage = useCallback(async (text: string) => {
    // Add user message to the list
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
      // Create a new session (first message)
      const response = await chatApi.createSession({ message: text })
      setSessionId(response.session_id)
      subscribe(response.session_id)
    } else {
      // Send follow-up message to existing session
      const message: ClientMessage = { type: 'user_message', text }
      await chatApi.sendMessage(sessionId, message)
      subscribe(sessionId)
    }
  }, [sessionId, setSessionId, subscribe])

  const respondPermission = useCallback(async (toolCallId: string, allowed: boolean) => {
    if (!sessionId) return
    const message: ClientMessage = { type: 'permission_response', tool_call_id: toolCallId, allowed }
    await chatApi.sendMessage(sessionId, message)
  }, [sessionId])

  const respondInput = useCallback(async (requestId: string, response: string) => {
    if (!sessionId) return
    const message: ClientMessage = { type: 'input_response', request_id: requestId, response }
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

  const loadSession = useCallback((sid: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setSessionId(sid)
    setIsStreaming(false)
    setMessages([])
    // TODO: could load session history from backend if available
  }, [setSessionId, setIsStreaming])

  return {
    messages,
    isStreaming,
    sessionId,
    sendMessage,
    respondPermission,
    respondInput,
    interrupt,
    newSession,
    loadSession,
  }
}
