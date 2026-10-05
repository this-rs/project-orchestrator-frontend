/**
 * chatAssembly — Pure functions to convert raw chat events into ChatMessage[] UI format.
 *
 * Extracted from useChat.ts so the same assembly logic can be reused by
 * useChat (main conversation) and useConversationWs (inline runner conversations).
 */

import { splitAttachments } from './messageAttachments'
import type {
  BackgroundActivityMetadata,
  BackgroundOutputEntry,
  ChatMessage,
  ContentBlock,
} from '@/types'
import { BACKGROUND_ACTIVITY_MAX_ENTRIES } from '@/types'
import { toProviderRef, toToolPolicy, type ProviderCapabilities, type ProviderRef, type ToolPolicy } from '@/types/provider'

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
// Background output — attach to parent, or fall back to a grouped
// `background_activity` block (F6 + F10 of plan 5985a7c4)
// ---------------------------------------------------------------------------

/** A background tick normalised from a `background_output` or `workflow` event. */
export interface BackgroundTick extends BackgroundOutputEntry {
  correlation_id?: string
  subagent_type?: string
  description?: string
  /** Workflow lifecycle subtype (`task_progress`…), for `workflow` ticks. */
  subtype?: string
  /** Verbatim structured payload of a `workflow` tick. */
  data?: Record<string, unknown>
}

/**
 * Normalise a `workflow` event (emitted by the Workflow tool, e.g.
 * `{type:'workflow', subtype:'task_progress', data:{description,
 * last_tool_name, task_id, tool_use_id, usage, subagent_type}}`) into
 * the same shape as a `background_output` tick so both share one
 * attach/fallback path. `data.tool_use_id` is the correlation key.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function workflowEventToTick(evt: any, fallbackReceivedAt: string): BackgroundTick {
  const data = (evt.data ?? {}) as Record<string, unknown>
  const subtype = (evt.subtype as string | undefined) ?? 'workflow'
  const description = typeof data.description === 'string' ? data.description : undefined
  const subagentType = typeof data.subagent_type === 'string' ? data.subagent_type : undefined
  const lastTool = typeof data.last_tool_name === 'string' ? data.last_tool_name : undefined
  const usage = (data.usage ?? {}) as Record<string, unknown>
  const parts: string[] = [subtype]
  if (description) parts.push(description)
  if (lastTool) parts.push(`last tool: ${lastTool}`)
  if (typeof usage.tool_uses === 'number') parts.push(`${usage.tool_uses} tool uses`)
  const correlationId = typeof data.tool_use_id === 'string'
    ? data.tool_use_id
    : typeof data.task_id === 'string' ? data.task_id : undefined
  const receivedAt = typeof evt.received_at === 'string'
    ? evt.received_at
    : typeof data.received_at === 'string' ? data.received_at : fallbackReceivedAt
  return {
    correlation_id: correlationId,
    source: 'Workflow',
    content: parts.join(' · '),
    received_at: receivedAt,
    subagent_type: subagentType,
    description,
    subtype,
    data,
  }
}

/** The persisted, display-sized slice of a tick (the heavy `data` lives on the block metadata). */
function entryOf(tick: BackgroundTick): BackgroundOutputEntry {
  const entry: BackgroundOutputEntry = {
    source: tick.source,
    content: tick.content,
    received_at: tick.received_at,
  }
  if (tick.subtype) entry.subtype = tick.subtype
  return entry
}

/**
 * Try to attach a tick to the `tool_use` block whose `tool_call_id`
 * equals the tick's `correlation_id` (searching backwards through
 * `messages`), appending it to that block's `child_outputs` so
 * MonitorCard renders it nested. Blocks are replaced immutably.
 * Returns true when a parent was found.
 */
export function attachToParentToolUse(messages: ChatMessage[], tick: BackgroundTick): boolean {
  const correlationId = tick.correlation_id
  if (!correlationId) return false
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const msg = messages[mi]
    for (let bi = 0; bi < msg.blocks.length; bi++) {
      const block = msg.blocks[bi]
      if (block.type === 'tool_use' && block.metadata?.tool_call_id === correlationId) {
        const existing =
          (block.metadata?.child_outputs as BackgroundOutputEntry[] | undefined) ?? []
        msg.blocks[bi] = {
          ...block,
          metadata: {
            ...block.metadata,
            child_outputs: [
              ...existing,
              entryOf(tick),
            ],
            ...(tick.data
              ? { child_data: { ...(block.metadata?.child_data as Record<string, unknown> | undefined), ...tick.data } }
              : {}),
          },
        }
        return true
      }
    }
  }
  return false
}

/**
 * F10 fallback: fold an orphan tick into a `background_activity` block
 * on `msg`. Orphans sharing a `correlation_id` within the same assistant
 * message merge into one block (count + last-N entries) so 50 ticks
 * never become 50 rows; a different (or missing) correlation_id starts
 * a new block. The updated block is replaced immutably in `msg.blocks`.
 */
export function appendBackgroundActivity(msg: ChatMessage, tick: BackgroundTick): void {
  const key = tick.correlation_id ?? null
  const entry = entryOf(tick)
  for (let bi = msg.blocks.length - 1; bi >= 0; bi--) {
    const block = msg.blocks[bi]
    if (block.type !== 'background_activity') continue
    const meta = block.metadata as unknown as BackgroundActivityMetadata
    if ((meta.correlation_id ?? null) !== key) continue
    const entries = [...meta.entries, entry].slice(-BACKGROUND_ACTIVITY_MAX_ENTRIES)
    const merged: BackgroundActivityMetadata = {
      ...meta,
      source: tick.source,
      count: meta.count + 1,
      last_received_at: tick.received_at,
      subagent_type: tick.subagent_type ?? meta.subagent_type,
      description: tick.description ?? meta.description,
      data: tick.data ? { ...meta.data, ...tick.data } : meta.data,
      entries,
    }
    msg.blocks[bi] = {
      ...block,
      content: tick.content,
      metadata: merged as unknown as Record<string, unknown>,
    }
    return
  }
  const meta: BackgroundActivityMetadata = {
    correlation_id: tick.correlation_id,
    source: tick.source,
    count: 1,
    first_received_at: tick.received_at,
    last_received_at: tick.received_at,
    subagent_type: tick.subagent_type,
    description: tick.description,
    data: tick.data,
    entries: [entry],
  }
  const block: ContentBlock = {
    id: nextBlockId(),
    type: 'background_activity',
    content: tick.content,
    metadata: meta as unknown as Record<string, unknown>,
  }
  msg.blocks.push(block)
}

// ---------------------------------------------------------------------------
// Main assembly function
// ---------------------------------------------------------------------------

/** Human text for a `session_error` event: the message, tagged with its machine reason. */
export function sessionErrorText(evt: { reason?: string; message?: string }): string {
  const message = evt.message ?? 'The session ended with an error'
  return evt.reason ? `${message} (${evt.reason})` : message
}

/** Human text for a `tools_cancelled` event: how many processes were killed, and by whom. */
export function toolsCancelledText(evt: { killed_count?: number; requested_by?: string }): string {
  const n = evt.killed_count ?? 0
  const what = n === 1 ? '1 running tool process' : `${n} running tool processes`
  return evt.requested_by ? `Cancelled ${what} (requested by ${evt.requested_by})` : `Cancelled ${what}`
}

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
        const { text: content, attachments: sentAttachments } = splitAttachments(evt.content ?? '')
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
          ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
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
            metadata: withCreatedAt(withParent({ tool_call_id: toolId, tool_name: toolName, tool_input: toolInput, ...toolHintMetadata(evt) }, parent), ts),
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
          metadata: withParent({ tool_call_id: evt.id, tool_name: evt.tool, tool_input: evt.input, ...toolHintMetadata(evt) }, parent),
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

      case 'session_error': {
        // Emitted by the backend when the CLI subprocess dies (emit_subprocess_death).
        // Typed in ChatEvent but never reduced: the death of the CLI was invisible.
        const msg = lastAssistant(createdAt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: sessionErrorText(evt),
        })
        break
      }

      case 'tools_cancelled': {
        // Emitted by cancel_running_tools: the tools were killed, the user must see it.
        const msg = lastAssistant(createdAt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: toolsCancelledText(evt),
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
              ...systemInitProviderMetadata(evt),
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

      case 'background_output':
      case 'workflow': {
        // Plan 5985a7c4 (F6 + F10): a tick whose correlation_id matches a
        // previously-emitted Monitor / Bash bg tool_use block is appended
        // to that block's `child_outputs` (MonitorCard renders it nested).
        // Without a match — parent outside the loaded window, or no
        // correlation_id at all — the tick is never dropped: it folds
        // into a grouped `background_activity` block on the current
        // assistant message (F10 orphan tolerance).
        const tick: BackgroundTick = type === 'workflow'
          ? workflowEventToTick(evt, createdAt.toISOString())
          : {
              correlation_id: (evt as { correlation_id?: string }).correlation_id,
              source: (evt.source as string) ?? 'background',
              content: (evt.content as string) ?? '',
              received_at: (evt.received_at as string) ?? createdAt.toISOString(),
            }
        if (!attachToParentToolUse(messages, tick)) {
          appendBackgroundActivity(lastAssistant(createdAt), tick)
        }
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

/**
 * What the provider adapter said about a tool call (`tool_use`,
 * `permission_request`), as block metadata: `tool_category` and
 * `tool_canonical`. The renderer registry and the permission block read them
 * instead of guessing from the tool's name.
 *
 * Only the fields the event carries are returned, so a Claude Code block —
 * whose events carry neither — keeps exactly the metadata it always had.
 * Shared by the history reducer (here) and the live one (`useChat`).
 */
export function toolHintMetadata(evt: unknown): { tool_category?: string; tool_canonical?: string } {
  if (typeof evt !== 'object' || evt === null) return {}
  const e = evt as Record<string, unknown>
  const out: { tool_category?: string; tool_canonical?: string } = {}
  if (typeof e.category === 'string' && e.category !== '') out.tool_category = e.category
  if (typeof e.canonical === 'string' && e.canonical !== '') out.tool_canonical = e.canonical
  return out
}

// ============================================================================
// system_init → provider runtime (shared by the live and the history reducers)
// ============================================================================

/** What a `system_init` says about the harness behind the session. */
export interface SystemInitRuntime {
  /** `null` = the event names no provider: a pre-provider session, i.e. Claude Code. */
  provider: ProviderRef | null
  /** `null` = no capabilities carried: the fallback profile applies. */
  capabilities: Partial<ProviderCapabilities> | null
  toolPolicy: ToolPolicy | null
}

/**
 * Read provider, capabilities and tool policy off a `system_init` payload.
 * Used by BOTH reducers so a session renders the same live and from history.
 */
export function readSystemInitRuntime(evt: unknown): SystemInitRuntime {
  const e = (typeof evt === 'object' && evt !== null ? evt : {}) as Record<string, unknown>
  const caps = e.capabilities
  return {
    provider: toProviderRef(e.provider),
    capabilities: typeof caps === 'object' && caps !== null ? (caps as Partial<ProviderCapabilities>) : null,
    toolPolicy: toToolPolicy(e.tool_policy) ?? toToolPolicy(e.permission_mode),
  }
}

/** Runtime of the LAST `system_init` in a raw history window, or `null` when it holds none. */
export function lastSystemInitRuntime(rawEvents: ReadonlyArray<unknown>): SystemInitRuntime | null {
  for (let i = rawEvents.length - 1; i >= 0; i--) {
    const evt = rawEvents[i] as { type?: string; data?: unknown } | null
    if (evt?.type !== 'system_init') continue
    // A replayed record may nest its payload under `data`.
    const nested = typeof evt.data === 'object' && evt.data !== null ? (evt.data as object) : null
    return readSystemInitRuntime(nested ? { ...evt, ...nested } : evt)
  }
  return null
}

/** Provider fields stored on a `system_init` block (absent for a legacy session). */
export function systemInitProviderMetadata(evt: unknown): { provider?: string; provider_kind?: string; provider_label?: string } {
  const ref = readSystemInitRuntime(evt).provider
  if (!ref) return {}
  return { provider: ref.id, provider_kind: ref.kind, provider_label: ref.label }
}
