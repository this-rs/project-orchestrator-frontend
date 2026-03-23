/**
 * chatAssembly — Pure functions to convert raw chat events into ChatMessage[] UI format.
 *
 * Extracted from useChat.ts so the same assembly logic can be reused by
 * useChat (main conversation) and useConversationWs (inline runner conversations).
 */

import type { ChatMessage } from '@/types'

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

let blockIdCounter = 0
function nextBlockId() {
  return `b-${++blockIdCounter}-${Math.random().toString(36).slice(2, 8)}`
}

let messageIdCounter = 0
function nextMessageId() {
  return `m-${++messageIdCounter}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main assembly function
// ---------------------------------------------------------------------------

/**
 * Convert raw chat events (from REST /messages endpoint) into ChatMessage UI format.
 * Groups events into user/assistant messages — same logic as handleEvent in replay mode.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function historyEventsToMessages(events: any[]): ChatMessage[] {
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
        // "Continue" after max_turns -> discreet indicator instead of user bubble
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
        // User sent a normal message (not "Continue") after max_turns ->
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

      case 'viz_block': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'viz',
          content: (evt.fallback_text as string) ?? '',
          metadata: withParent({
            viz_type: evt.viz_type,
            viz_data: evt.data,
            viz_title: evt.title,
            viz_interactive: evt.interactive ?? false,
            viz_max_height: evt.max_height ?? 300,
          }, parent),
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

      case 'retrying': {
        const msg = lastAssistant(createdAt)
        const attempt = evt.attempt as number | undefined
        const maxAttempts = evt.max_attempts as number | undefined
        const errorMsg = evt.error_message as string | undefined
        msg.blocks.push({
          id: nextBlockId(),
          type: 'retry_indicator',
          content: maxAttempts
            ? `Retrying... (${attempt}/${maxAttempts})`
            : `Retrying... (attempt ${attempt})`,
          metadata: { attempt, max_attempts: maxAttempts, error_message: errorMsg },
        })
        lastEventWasMaxTurns = false
        break
      }

      case 'system_hint': {
        // System-generated hints are internal — never rendered in the UI.
        lastEventWasMaxTurns = false
        break
      }

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

// ---------------------------------------------------------------------------
// Re-export helpers for use by streaming event handlers (useChat handleEvent)
// ---------------------------------------------------------------------------

export { nextBlockId, nextMessageId, getParentToolUseId, withParent, withCreatedAt }
